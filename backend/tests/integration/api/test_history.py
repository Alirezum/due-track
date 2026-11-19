from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

from fastapi.testclient import TestClient

from due_track.api.deps import get_now

FIXED_NOW = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)


def _item_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "title": "Rent",
        "due": {"kind": "date", "date": "2026-11-10"},
    }
    payload.update(overrides)
    return payload


def _create(client: TestClient, **overrides: Any) -> dict[str, Any]:
    response = client.post("/api/items", json=_item_payload(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


def _complete(client: TestClient, item_id: int) -> dict[str, Any]:
    response = client.post(f"/api/items/{item_id}/complete")
    assert response.status_code == 200, response.text
    return response.json()


@contextmanager
def _clock(client: TestClient, moment: datetime) -> Iterator[None]:
    client.app.dependency_overrides[get_now] = lambda: moment
    try:
        yield
    finally:
        client.app.dependency_overrides.pop(get_now, None)


def _history(client: TestClient, **params: Any) -> dict[str, Any]:
    response = client.get("/api/history", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _titles(entry: dict[str, Any]) -> str:
    return str(entry["previous_state"]["title"])


def test_history_is_reverse_chronological_and_paginated(client: TestClient) -> None:
    first = _create(client, title="First")
    second = _create(client, title="Second")
    third = _create(client, title="Third")

    with _clock(client, datetime(2026, 11, 5, 12, 0, tzinfo=UTC)):
        _complete(client, first["id"])
    with _clock(client, datetime(2026, 11, 5, 12, 5, tzinfo=UTC)):
        _complete(client, second["id"])
    with _clock(client, datetime(2026, 11, 5, 12, 10, tzinfo=UTC)):
        _complete(client, third["id"])

    body = _history(client)
    assert body["total"] == 3
    assert [_titles(entry) for entry in body["entries"]] == ["Third", "Second", "First"]

    page_one = _history(client, limit=1, offset=0)
    assert page_one["total"] == 3
    assert [_titles(entry) for entry in page_one["entries"]] == ["Third"]

    page_two = _history(client, limit=1, offset=1)
    assert page_two["total"] == 3
    assert [_titles(entry) for entry in page_two["entries"]] == ["Second"]

    past_the_end = _history(client, limit=1, offset=3)
    assert past_the_end == {"entries": [], "total": 3}

    assert client.get("/api/history", params={"limit": 0}).status_code == 422
    assert client.get("/api/history", params={"limit": 201}).status_code == 422
    assert client.get("/api/history", params={"offset": -1}).status_code == 422


def test_history_snapshot_is_complete_and_enriched_at_the_boundary(client: TestClient) -> None:
    item = _create(
        client,
        title="Insurance",
        notes="Policy 123",
        due={"kind": "date", "date": "2026-11-20"},
        category="Bills",
        priority="high",
        amount_cents=4599,
        recurrence_freq="monthly",
        recurrence_anchor_day=20,
        recurrence_end_date="2027-02-28",
    )

    with _clock(client, datetime(2026, 11, 5, 12, 0, tzinfo=UTC)):
        completed = _complete(client, item["id"])

    log = _history(client)["entries"][0]
    assert log["id"] == completed["log"]["id"]
    assert log["item_id"] == item["id"]
    assert log["scheduled_due_at_utc"] == item["due_at_utc"]
    assert datetime.fromisoformat(log["completed_at_utc"].replace("Z", "+00:00")) == datetime(
        2026, 11, 5, 12, 0, tzinfo=UTC
    )
    assert log["spawned_next_occurrence"] is True
    assert log["next_due_at_utc"] is not None
    assert log["can_undo"] is True

    snapshot = log["previous_state"]
    assert snapshot["id"] == item["id"]
    assert snapshot["title"] == "Insurance"
    assert snapshot["notes"] == "Policy 123"
    assert snapshot["category"] == "Bills"
    assert snapshot["priority"] == "high"
    assert snapshot["amount_cents"] == 4599
    assert snapshot["due_at_utc"] == item["due_at_utc"]
    assert snapshot["due_local_date"] == "2026-11-20"
    assert snapshot["due_local_time"] is None
    assert snapshot["is_date_only"] is True
    assert snapshot["is_recurring"] is True
    assert snapshot["recurrence_freq"] == "monthly"
    assert snapshot["recurrence_interval"] == 1
    assert snapshot["recurrence_anchor_mode"] == "schedule"
    assert snapshot["recurrence_anchor_day"] == 20
    assert snapshot["recurrence_end_date"] == "2027-02-28"
    assert snapshot["status"] == "active"


def test_history_snapshot_survives_item_deletion(client: TestClient) -> None:
    item = _create(
        client,
        title="Cancelled subscription",
        category="Media",
        notes="Yearly",
        recurrence_freq="monthly",
    )
    with _clock(client, FIXED_NOW):
        _complete(client, item["id"])

    assert client.delete(f"/api/items/{item['id']}").status_code == 204

    entry = _history(client)["entries"][0]
    assert entry["previous_state"]["title"] == "Cancelled subscription"
    assert entry["previous_state"]["category"] == "Media"
    assert entry["previous_state"]["notes"] == "Yearly"
    assert entry["item_id"] == item["id"]
    assert entry["can_undo"] is False


def test_can_undo_is_true_only_for_the_latest_completion_of_a_live_item(
    client: TestClient,
) -> None:
    recurring = _create(client, title="Recurring rent", recurrence_freq="monthly")
    with _clock(client, datetime(2026, 11, 5, 12, 0, tzinfo=UTC)):
        first = _complete(client, recurring["id"])
    with _clock(client, datetime(2026, 11, 5, 12, 30, tzinfo=UTC)):
        second = _complete(client, recurring["id"])

    one_time = _create(client, title="One time")
    with _clock(client, datetime(2026, 11, 5, 13, 0, tzinfo=UTC)):
        third = _complete(client, one_time["id"])

    entries = {entry["id"]: entry for entry in _history(client)["entries"]}
    assert entries[first["log"]["id"]]["can_undo"] is False
    assert entries[second["log"]["id"]]["can_undo"] is True
    assert entries[third["log"]["id"]]["can_undo"] is True

    assert client.post(f"/api/history/{first['log']['id']}/undo").status_code == 409


def test_undo_untouched_one_time_item_restores_it_in_place(client: TestClient) -> None:
    item = _create(
        client,
        title="Renew passport",
        notes="Book an appointment",
        due={"kind": "datetime", "at": "2026-11-10T09:30:00-05:00"},
        category="Personal",
        priority="critical",
        amount_cents=15000,
    )
    with _clock(client, datetime(2026, 11, 5, 12, 0, tzinfo=UTC)):
        completed = _complete(client, item["id"])
    assert completed["item"] is None
    assert _active_items(client.get("/api/items").json()) == []

    with _clock(client, datetime(2026, 11, 5, 14, 0, tzinfo=UTC)):
        response = client.post(f"/api/history/{completed['log']['id']}/undo")

    assert response.status_code == 200, response.text
    body = response.json()
    restored = body["restored_item"]
    assert body["preserved_touched_occurrence"] is False
    assert body["warning"] is None
    assert restored["id"] == item["id"]
    assert restored["status"] == "active"
    assert restored["title"] == "Renew passport"
    assert restored["notes"] == "Book an appointment"
    assert restored["category"] == "Personal"
    assert restored["priority"] == "critical"
    assert restored["amount_cents"] == 15000
    assert restored["due_at_utc"] == item["due_at_utc"]
    assert restored["due_local_date"] == "2026-11-10"
    assert restored["due_local_time"] == "09:30"

    assert _history(client)["total"] == 0
    assert client.post(f"/api/history/{completed['log']['id']}/undo").status_code == 404


def test_undo_untouched_recurring_item_restores_the_previous_occurrence(
    client: TestClient,
) -> None:
    item = _create(
        client,
        title="Rent",
        due={"kind": "date", "date": "2026-11-10"},
        recurrence_freq="monthly",
        recurrence_anchor_day=10,
    )
    with _clock(client, datetime(2026, 11, 5, 12, 0, tzinfo=UTC)):
        completed = _complete(client, item["id"])
    assert completed["item"] is not None
    assert completed["item"]["due_local_date"] == "2026-12-10"

    with _clock(client, datetime(2026, 11, 6, 12, 0, tzinfo=UTC)):
        body = client.post(f"/api/history/{completed['log']['id']}/undo").json()

    restored = body["restored_item"]
    assert restored["id"] == item["id"]
    assert restored["due_local_date"] == "2026-11-10"
    assert restored["due_at_utc"] == item["due_at_utc"]
    assert restored["recurrence_freq"] == "monthly"
    assert body["preserved_touched_occurrence"] is False

    dashboard = client.get("/api/items").json()
    ids = [
        entry["id"]
        for name in ("overdue", "due_today", "upcoming", "later")
        for entry in dashboard["buckets"][name]
    ]
    assert ids.count(item["id"]) == 1


def test_undo_touched_occurrence_preserves_the_edit_and_restores_a_new_item(
    client: TestClient,
) -> None:
    item = _create(
        client,
        title="Rent",
        due={"kind": "date", "date": "2026-11-10"},
        recurrence_freq="monthly",
        recurrence_anchor_day=10,
    )
    with _clock(client, datetime(2026, 11, 5, 12, 0, tzinfo=UTC)):
        completed = _complete(client, item["id"])
    assert completed["item"] is not None

    with _clock(client, datetime(2026, 11, 5, 12, 30, tzinfo=UTC)):
        edited = client.patch(
            f"/api/items/{item['id']}",
            json={"title": "Rent edited", "due": {"kind": "date", "date": "2027-01-15"}},
        )
        assert edited.status_code == 200, edited.text

    with _clock(client, datetime(2026, 11, 5, 13, 0, tzinfo=UTC)):
        response = client.post(f"/api/history/{completed['log']['id']}/undo")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["preserved_touched_occurrence"] is True
    assert isinstance(body["warning"], str) and body["warning"].strip()
    assert "preserved" in body["warning"].lower()

    restored = body["restored_item"]
    assert restored["id"] != item["id"]
    assert restored["title"] == "Rent"
    assert restored["due_local_date"] == "2026-11-10"
    assert restored["status"] == "active"

    preserved = client.get("/api/items").json()
    preserved_items = {
        entry["id"]: entry
        for name in ("overdue", "due_today", "upcoming", "later")
        for entry in preserved["buckets"][name]
    }
    assert preserved_items[item["id"]]["title"] == "Rent edited"
    assert preserved_items[item["id"]]["due_local_date"] == "2027-01-15"
    assert preserved_items[restored["id"]]["title"] == "Rent"
    assert _history(client)["total"] == 0


def test_undo_rejects_missing_deleted_and_non_latest_logs(client: TestClient) -> None:
    assert client.post("/api/history/999/undo").status_code == 404

    deleted = _create(client, title="Deleted later", recurrence_freq="monthly")
    with _clock(client, FIXED_NOW):
        deleted_log = _complete(client, deleted["id"])
    assert client.delete(f"/api/items/{deleted['id']}").status_code == 204
    assert client.post(f"/api/history/{deleted_log['log']['id']}/undo").status_code == 409


def test_delete_history_entry_never_changes_active_items(client: TestClient) -> None:
    active = _create(client, title="Still active")
    completed = _create(client, title="Completed once")
    with _clock(client, FIXED_NOW):
        log = _complete(client, completed["id"])

    before = client.get("/api/items").json()
    response = client.delete(f"/api/history/{log['log']['id']}")

    assert response.status_code == 204
    assert response.content == b""
    assert _history(client)["total"] == 0

    after = client.get("/api/items").json()
    assert [_titles_for_item(entry) for entry in _active_items(after)] == ["Still active"]
    assert before["summary"] == after["summary"]
    assert _active_items(before)[0]["title"] == active["title"]

    assert client.delete(f"/api/history/{log['log']['id']}").status_code == 404


def test_delete_history_entry_leaves_the_advanced_occurrence_untouched(
    client: TestClient,
) -> None:
    item = _create(
        client,
        title="Rent",
        due={"kind": "date", "date": "2026-11-10"},
        recurrence_freq="monthly",
        recurrence_anchor_day=10,
    )
    with _clock(client, FIXED_NOW):
        completed = _complete(client, item["id"])
    assert completed["item"] is not None

    assert client.delete(f"/api/history/{completed['log']['id']}").status_code == 204

    dashboard = client.get("/api/items").json()
    occurrences = _active_items(dashboard)
    assert len(occurrences) == 1
    assert occurrences[0]["id"] == item["id"]
    assert occurrences[0]["due_local_date"] == "2026-12-10"
    assert occurrences[0]["status"] == "active"


def _active_items(dashboard: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        entry
        for name in ("overdue", "due_today", "upcoming", "later")
        for entry in dashboard["buckets"][name]
    ]


def _titles_for_item(entry: dict[str, Any]) -> str:
    return str(entry["title"])
