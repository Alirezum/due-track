from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from due_track.api.app import create_app
from due_track.config import Settings
from due_track.db.connection import connect


def _item_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "title": "Rent",
        "due": {"kind": "date", "date": "2026-11-05"},
    }
    payload.update(overrides)
    return payload


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _create(client: TestClient, **overrides: Any) -> dict[str, Any]:
    response = client.post("/api/items", json=_item_payload(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


def _titles(items: list[dict[str, Any]]) -> list[str]:
    return [item["title"] for item in items]


def test_create_returns_location_and_derived_local_fields(client: TestClient) -> None:
    response = client.post("/api/items", json=_item_payload())

    assert response.status_code == 201
    body = response.json()
    assert response.headers["location"] == f"/api/items/{body['id']}"
    assert body["title"] == "Rent"
    assert body["notes"] == ""
    assert body["status"] == "active"
    assert body["is_recurring"] is False
    assert body["due_local_date"] == "2026-11-05"
    assert body["due_local_time"] is None
    assert body["is_date_only"] is True
    assert _parse_datetime(body["due_at_utc"]) == datetime(
        2026, 11, 6, 4, 59, 59, 999999, tzinfo=UTC
    )
    assert body["created_at_utc"] == body["updated_at_utc"]


def test_timed_input_converts_to_utc_and_exposes_local_wall_time(client: TestClient) -> None:
    item = _create(
        client,
        due={"kind": "datetime", "at": "2026-11-05T09:30:00-05:00"},
    )

    assert _parse_datetime(item["due_at_utc"]) == datetime(2026, 11, 5, 14, 30, tzinfo=UTC)
    assert item["due_local_date"] == "2026-11-05"
    assert item["due_local_time"] == "09:30"
    assert item["is_date_only"] is False


def test_title_boundaries_are_enforced(client: TestClient) -> None:
    assert client.post("/api/items", json=_item_payload(title="a")).status_code == 201
    assert client.post("/api/items", json=_item_payload(title="a" * 200)).status_code == 201
    assert client.post("/api/items", json=_item_payload(title="")).status_code == 422
    assert client.post("/api/items", json=_item_payload(title="   ")).status_code == 422
    assert client.post("/api/items", json=_item_payload(title="a" * 201)).status_code == 422


def test_missing_due_is_rejected(client: TestClient) -> None:
    response = client.post("/api/items", json={"title": "No due date"})

    assert response.status_code == 422


def test_notes_and_amount_constraints(client: TestClient) -> None:
    assert client.post("/api/items", json=_item_payload(notes="x" * 10000)).status_code == 201
    assert client.post("/api/items", json=_item_payload(notes="x" * 10001)).status_code == 422
    assert client.post("/api/items", json=_item_payload(amount_cents=0)).status_code == 201
    assert client.post("/api/items", json=_item_payload(amount_cents=-1)).status_code == 422


def test_category_is_trimmed_and_constrained(client: TestClient) -> None:
    trimmed = _create(client, category="  Bills  ")
    assert trimmed["category"] == "Bills"

    assert client.post("/api/items", json=_item_payload(category="")).status_code == 422
    assert client.post("/api/items", json=_item_payload(category="x" * 51)).status_code == 422


def test_date_only_due_is_persisted_as_end_of_local_day_utc(
    client: TestClient, migrated_database: Path
) -> None:
    item = _create(client)

    connection = connect(migrated_database)
    try:
        row = connection.execute(
            "SELECT due_at_utc, is_date_only FROM due_items WHERE id = ?",
            (item["id"],),
        ).fetchone()
    finally:
        connection.close()

    assert row is not None
    assert row["is_date_only"] == 1
    assert _parse_datetime(row["due_at_utc"]) == datetime(
        2026, 11, 6, 4, 59, 59, 999999, tzinfo=UTC
    )


def test_recurrence_end_date_is_converted_to_end_of_inclusive_local_day(
    client: TestClient, migrated_database: Path
) -> None:
    item = _create(
        client,
        due={"kind": "date", "date": "2026-01-31"},
        recurrence_freq="monthly",
        recurrence_end_date="2026-12-31",
    )

    assert item["recurrence_anchor_day"] == 31
    assert item["recurrence_end_date"] == "2026-12-31"
    assert item["is_recurring"] is True

    connection = connect(migrated_database)
    try:
        row = connection.execute(
            "SELECT recurrence_end_at_utc FROM due_items WHERE id = ?",
            (item["id"],),
        ).fetchone()
    finally:
        connection.close()

    assert row is not None
    assert _parse_datetime(row["recurrence_end_at_utc"]) == datetime(
        2027, 1, 1, 4, 59, 59, 999999, tzinfo=UTC
    )


def test_recurrence_end_date_and_remaining_count_are_mutually_exclusive(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/items",
        json=_item_payload(
            recurrence_freq="monthly",
            recurrence_anchor_day=5,
            recurrence_end_date="2026-12-31",
            recurrence_remaining_count=3,
        ),
    )

    assert response.status_code == 422


def test_one_time_item_rejects_recurrence_end_fields(client: TestClient) -> None:
    response = client.post(
        "/api/items",
        json=_item_payload(recurrence_remaining_count=3),
    )

    assert response.status_code == 422


def test_dashboard_groups_items_into_exactly_one_bucket(client: TestClient) -> None:
    _create(client, title="Overdue", due={"kind": "datetime", "at": "2026-11-05T11:00:00Z"})
    _create(client, title="Due now", due={"kind": "datetime", "at": "2026-11-05T12:00:00Z"})
    _create(client, title="Today date-only")
    _create(client, title="Tomorrow", due={"kind": "date", "date": "2026-11-06"})
    _create(client, title="Day seven", due={"kind": "date", "date": "2026-11-12"})
    _create(client, title="Day eight", due={"kind": "date", "date": "2026-11-13"})

    response = client.get("/api/items")

    assert response.status_code == 200
    body = response.json()
    assert _titles(body["buckets"]["overdue"]) == ["Overdue"]
    assert set(_titles(body["buckets"]["due_today"])) == {"Due now", "Today date-only"}
    assert set(_titles(body["buckets"]["upcoming"])) == {"Tomorrow", "Day seven"}
    assert _titles(body["buckets"]["later"]) == ["Day eight"]
    assert body["currency_code"] == "USD"
    assert body["timezone"] == "America/New_York"

    all_ids = [
        item["id"]
        for name in ("overdue", "due_today", "upcoming", "later")
        for item in body["buckets"][name]
    ]
    assert len(all_ids) == len(set(all_ids)) == 6

    explicit_all = client.get("/api/items", params={"scope": "all"})
    assert explicit_all.status_code == 200
    assert explicit_all.json() == body


def test_bucket_order_uses_due_priority_and_case_insensitive_title(client: TestClient) -> None:
    _create(
        client,
        title="later-high",
        due={"kind": "datetime", "at": "2026-11-05T13:00:00Z"},
        priority="high",
    )
    _create(
        client,
        title="early",
        due={"kind": "datetime", "at": "2026-11-05T12:30:00Z"},
        priority="high",
    )
    _create(
        client,
        title="critical b",
        due={"kind": "datetime", "at": "2026-11-05T13:00:00Z"},
        priority="critical",
    )
    _create(
        client,
        title="Critical A",
        due={"kind": "datetime", "at": "2026-11-05T13:00:00Z"},
        priority="critical",
    )

    buckets = client.get("/api/items").json()["buckets"]

    assert _titles(buckets["due_today"]) == [
        "early",
        "Critical A",
        "critical b",
        "later-high",
    ]


def test_summary_uses_the_same_result_set_and_skips_missing_amounts(
    client: TestClient,
) -> None:
    _create(client, title="Overdue", due={"kind": "datetime", "at": "2026-11-05T11:00:00Z"})
    _create(client, title="Due today")
    _create(
        client, title="Upcoming one", due={"kind": "date", "date": "2026-11-06"}, amount_cents=1000
    )
    _create(
        client, title="Upcoming zero", due={"kind": "date", "date": "2026-11-07"}, amount_cents=0
    )
    _create(client, title="Upcoming none", due={"kind": "date", "date": "2026-11-08"})

    body = client.get("/api/items").json()

    assert body["summary"] == {
        "overdue_count": 1,
        "due_today_count": 1,
        "upcoming_total_cents": 1000,
    }


def test_patch_updates_fields_and_clears_nullable_values(client: TestClient) -> None:
    item = _create(client, category="Bills", priority="low", notes="old")

    response = client.patch(
        f"/api/items/{item['id']}",
        json={
            "title": "Updated",
            "notes": "new",
            "category": None,
            "priority": "high",
            "due": {"kind": "date", "date": "2026-11-06"},
        },
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["title"] == "Updated"
    assert updated["notes"] == "new"
    assert updated["category"] is None
    assert updated["priority"] == "high"
    assert updated["due_local_date"] == "2026-11-06"
    assert updated["updated_at_utc"] >= updated["created_at_utc"]


def test_patch_rejects_empty_body_and_missing_or_deleted_items(client: TestClient) -> None:
    assert client.patch("/api/items/999", json={"title": "x"}).status_code == 404

    item = _create(client)
    assert client.patch(f"/api/items/{item['id']}", json={}).status_code == 422

    assert client.delete(f"/api/items/{item['id']}").status_code == 204
    assert client.patch(f"/api/items/{item['id']}", json={"title": "x"}).status_code == 404


def test_delete_soft_deletes_and_removes_item_from_active_views(
    client: TestClient, migrated_database: Path
) -> None:
    item = _create(client)

    assert client.delete(f"/api/items/{item['id']}").status_code == 204
    assert client.delete(f"/api/items/{item['id']}").status_code == 404

    body = client.get("/api/items").json()
    assert all(not bucket for bucket in body["buckets"].values())

    connection = connect(migrated_database)
    try:
        row = connection.execute(
            "SELECT status FROM due_items WHERE id = ?",
            (item["id"],),
        ).fetchone()
    finally:
        connection.close()

    assert row is not None
    assert row["status"] == "deleted"


def test_items_persist_across_app_restart(client: TestClient, app_settings: Settings) -> None:
    item = _create(client, title="Persistent")

    with TestClient(create_app(app_settings)) as restarted:
        body = restarted.get("/api/items").json()

    assert item["title"] in _titles(body["buckets"]["due_today"])


def test_scope_upcoming_omits_overdue_bucket_but_keeps_accurate_count(
    client: TestClient,
) -> None:
    _create(client, title="Overdue one", due={"kind": "datetime", "at": "2026-11-05T11:00:00Z"})
    _create(client, title="Overdue two", due={"kind": "datetime", "at": "2026-11-04T09:00:00Z"})
    _create(client, title="Due now", due={"kind": "datetime", "at": "2026-11-05T12:00:00Z"})
    _create(client, title="Today date-only")
    _create(client, title="Tomorrow", due={"kind": "date", "date": "2026-11-06"})
    _create(client, title="Later", due={"kind": "date", "date": "2026-11-20"})

    all_body = client.get("/api/items").json()
    response = client.get("/api/items", params={"scope": "upcoming"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert _titles(all_body["buckets"]["overdue"]) == ["Overdue two", "Overdue one"]
    assert body["buckets"]["overdue"] == []
    assert body["summary"]["overdue_count"] == 2
    assert body["summary"] == all_body["summary"]
    for bucket in ("due_today", "upcoming", "later"):
        assert body["buckets"][bucket] == all_body["buckets"][bucket]
    assert _titles(body["buckets"]["due_today"]) == ["Due now", "Today date-only"]


def test_scope_upcoming_treats_due_now_and_today_date_only_as_upcoming(
    client: TestClient,
) -> None:
    _create(client, title="Due now", due={"kind": "datetime", "at": "2026-11-05T12:00:00Z"})
    _create(client, title="Today date-only")

    body = client.get("/api/items", params={"scope": "upcoming"}).json()

    assert body["summary"]["overdue_count"] == 0
    assert body["buckets"]["overdue"] == []
    assert set(_titles(body["buckets"]["due_today"])) == {"Due now", "Today date-only"}


def test_scope_upcoming_combines_with_filters_and_counts_the_filtered_overdue_set(
    client: TestClient,
) -> None:
    _create(
        client,
        title="Overdue bill",
        due={"kind": "datetime", "at": "2026-11-05T11:00:00Z"},
        category="Bills",
        priority="high",
    )
    _create(
        client,
        title="Overdue health",
        due={"kind": "datetime", "at": "2026-11-05T11:00:00Z"},
        category="Health",
        priority="high",
    )
    _create(
        client,
        title="Upcoming bill",
        due={"kind": "date", "date": "2026-11-06"},
        category="Bills",
        priority="high",
    )
    _create(
        client,
        title="Upcoming health",
        due={"kind": "date", "date": "2026-11-06"},
        category="Health",
        priority="high",
    )

    body = client.get(
        "/api/items",
        params={"scope": "upcoming", "category": "Bills", "priority": "high"},
    ).json()

    assert body["buckets"]["overdue"] == []
    assert body["summary"]["overdue_count"] == 1
    assert _titles(body["buckets"]["upcoming"]) == ["Upcoming bill"]
    assert body["summary"]["upcoming_total_cents"] == 0


def test_scope_upcoming_excludes_completed_and_deleted_overdue_items(
    client: TestClient,
) -> None:
    completed = _create(
        client,
        title="Completed overdue",
        due={"kind": "datetime", "at": "2026-11-05T11:00:00Z"},
    )
    deleted = _create(
        client,
        title="Deleted overdue",
        due={"kind": "datetime", "at": "2026-11-05T11:00:00Z"},
    )

    assert client.post(f"/api/items/{completed['id']}/complete").status_code == 200
    assert client.delete(f"/api/items/{deleted['id']}").status_code == 204

    body = client.get("/api/items", params={"scope": "upcoming"}).json()

    assert body["buckets"]["overdue"] == []
    assert body["summary"] == {
        "overdue_count": 0,
        "due_today_count": 0,
        "upcoming_total_cents": 0,
    }
    assert all(not bucket for bucket in body["buckets"].values())


def test_scope_upcoming_empty_result_returns_zero_counts(client: TestClient) -> None:
    body = client.get("/api/items", params={"scope": "upcoming"}).json()

    assert body["buckets"] == {"overdue": [], "due_today": [], "upcoming": [], "later": []}
    assert body["summary"] == {
        "overdue_count": 0,
        "due_today_count": 0,
        "upcoming_total_cents": 0,
    }


def test_scope_upcoming_respects_the_application_timezone_boundary(client: TestClient) -> None:
    _create(
        client,
        title="Local yesterday date-only",
        due={"kind": "date", "date": "2026-11-04"},
    )
    _create(
        client,
        title="Local today date-only",
        due={"kind": "date", "date": "2026-11-05"},
    )
    _create(
        client,
        title="One second before now",
        due={"kind": "datetime", "at": "2026-11-05T11:59:59Z"},
    )

    body = client.get("/api/items", params={"scope": "upcoming"}).json()

    assert body["buckets"]["overdue"] == []
    assert body["summary"]["overdue_count"] == 2
    assert _titles(body["buckets"]["due_today"]) == ["Local today date-only"]
