from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from due_track.api.deps import get_now
from due_track.db.connection import connect

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


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _fetch_item(database: Path, item_id: int) -> Any:
    connection = connect(database)
    try:
        return connection.execute("SELECT * FROM due_items WHERE id = ?", (item_id,)).fetchone()
    finally:
        connection.close()


def _count_logs(database: Path) -> int:
    connection = connect(database)
    try:
        row = connection.execute("SELECT COUNT(*) AS count FROM completion_logs").fetchone()
        return int(row["count"])
    finally:
        connection.close()


def test_one_time_completion_returns_null_item_and_hides_the_item(
    client: TestClient, migrated_database: Path
) -> None:
    item = _create(client, title="Renew passport")

    body = _complete(client, item["id"])

    assert body["item"] is None
    log = body["log"]
    assert log["item_id"] == item["id"]
    assert log["scheduled_due_at_utc"] == item["due_at_utc"]
    assert _parse_datetime(log["completed_at_utc"]) == FIXED_NOW
    assert log["spawned_next_occurrence"] is False
    assert log["next_due_at_utc"] is None
    assert log["can_undo"] is True
    assert log["previous_state"]["title"] == "Renew passport"
    assert log["previous_state"]["due_local_date"] == "2026-11-10"
    assert log["previous_state"]["is_recurring"] is False

    dashboard = client.get("/api/items").json()
    assert all(not bucket for bucket in dashboard["buckets"].values())
    assert dashboard["summary"]["overdue_count"] == 0

    row = _fetch_item(migrated_database, item["id"])
    assert row["status"] == "completed"
    assert row["due_at_utc"] == item["due_at_utc"]
    assert _parse_datetime(row["updated_at_utc"]) == FIXED_NOW


def test_recurring_completion_advances_to_exactly_one_next_occurrence(
    client: TestClient, migrated_database: Path
) -> None:
    item = _create(
        client,
        title="Rent",
        recurrence_freq="monthly",
        recurrence_anchor_day=10,
    )

    body = _complete(client, item["id"])

    assert body["item"] is not None
    advanced = body["item"]
    assert advanced["id"] == item["id"]
    assert advanced["status"] == "active"
    assert advanced["due_local_date"] == "2026-12-10"
    assert advanced["is_date_only"] is True
    assert advanced["due_local_time"] is None
    assert _parse_datetime(advanced["due_at_utc"]) == datetime(
        2026, 12, 11, 4, 59, 59, 999999, tzinfo=UTC
    )
    assert advanced["updated_at_utc"] == FIXED_NOW.isoformat().replace("+00:00", "Z")

    log = body["log"]
    assert log["spawned_next_occurrence"] is True
    assert log["next_due_at_utc"] == advanced["due_at_utc"]
    assert log["scheduled_due_at_utc"] == item["due_at_utc"]
    assert log["previous_state"]["due_local_date"] == "2026-11-10"

    assert _count_logs(migrated_database) == 1


def test_recurring_completion_without_a_valid_next_occurrence_completes_the_series(
    client: TestClient, migrated_database: Path
) -> None:
    item = _create(
        client,
        title="Limited rent",
        recurrence_freq="monthly",
        recurrence_anchor_day=10,
        recurrence_end_date="2026-11-30",
    )

    body = _complete(client, item["id"])

    assert body["item"] is None
    assert body["log"]["spawned_next_occurrence"] is False
    assert body["log"]["next_due_at_utc"] is None
    assert body["log"]["previous_state"]["recurrence_end_date"] == "2026-11-30"

    row = _fetch_item(migrated_database, item["id"])
    assert row["status"] == "completed"
    assert row["recurrence_remaining_count"] is None


def test_remaining_count_starts_from_the_requested_total_and_decrements_per_completion(
    client: TestClient, migrated_database: Path
) -> None:
    item = _create(
        client,
        title="Three payments",
        recurrence_freq="monthly",
        recurrence_anchor_day=10,
        recurrence_remaining_count=3,
    )
    assert item["recurrence_remaining_count"] == 3

    first = _complete(client, item["id"])
    assert first["item"] is not None
    assert first["item"]["recurrence_remaining_count"] == 2
    assert first["item"]["due_local_date"] == "2026-12-10"

    second = _complete(client, item["id"])
    assert second["item"] is not None
    assert second["item"]["recurrence_remaining_count"] == 1
    assert second["item"]["due_local_date"] == "2027-01-10"

    third = _complete(client, item["id"])
    assert third["item"] is None
    assert third["log"]["spawned_next_occurrence"] is False

    row = _fetch_item(migrated_database, item["id"])
    assert row["status"] == "completed"
    assert row["recurrence_remaining_count"] == 0


def test_completion_is_atomic_when_the_item_update_fails(
    client: TestClient,
    migrated_database: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    item = _create(client, title="Atomic rent", recurrence_freq="monthly")

    def fail(*args: Any, **kwargs: Any) -> None:
        raise RuntimeError("simulated write failure")

    monkeypatch.setattr("due_track.api.routes.items.update_item", fail)

    with pytest.raises(RuntimeError):
        client.post(f"/api/items/{item['id']}/complete")

    assert _count_logs(migrated_database) == 0
    row = _fetch_item(migrated_database, item["id"])
    assert row["status"] == "active"
    assert row["due_at_utc"] == item["due_at_utc"]


def test_patch_recalculates_an_untouched_occurrence_after_a_policy_change(
    client: TestClient,
) -> None:
    item = _create(
        client,
        title="Rent",
        due={"kind": "date", "date": "2026-11-30"},
        recurrence_freq="monthly",
        recurrence_anchor_day=30,
    )
    completed = _complete(client, item["id"])
    assert completed["item"] is not None
    assert completed["item"]["due_local_date"] == "2026-12-30"

    response = client.patch(
        f"/api/items/{item['id']}",
        json={
            "recurrence_freq": "custom_months",
            "recurrence_interval": 3,
            "recurrence_anchor_day": 30,
        },
    )

    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["recurrence_freq"] == "custom_months"
    assert updated["recurrence_interval"] == 3
    assert updated["due_local_date"] == "2027-02-28"


def test_patch_preserves_a_manually_edited_occurrence_after_a_policy_change(
    client: TestClient,
) -> None:
    item = _create(
        client,
        title="Rent",
        due={"kind": "date", "date": "2026-12-10"},
        recurrence_freq="monthly",
        recurrence_anchor_day=10,
    )
    completed = _complete(client, item["id"])
    assert completed["item"] is not None

    client.app.dependency_overrides[get_now] = lambda: datetime(2026, 11, 6, 12, tzinfo=UTC)
    try:
        edited = client.patch(
            f"/api/items/{item['id']}",
            json={"due": {"kind": "date", "date": "2027-02-20"}},
        )
        assert edited.status_code == 200, edited.text
        assert edited.json()["due_local_date"] == "2027-02-20"

        response = client.patch(
            f"/api/items/{item['id']}",
            json={"recurrence_freq": "weekly"},
        )
    finally:
        client.app.dependency_overrides.pop(get_now, None)

    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["recurrence_freq"] == "weekly"
    assert updated["recurrence_interval"] == 1
    assert updated["due_local_date"] == "2027-02-20"


def test_completion_and_advancement_persist_utc_and_convert_only_at_the_boundary(
    client: TestClient, migrated_database: Path
) -> None:
    item = _create(
        client,
        title="Timed rent",
        due={"kind": "datetime", "at": "2026-11-10T09:30:00-05:00"},
        recurrence_freq="daily",
    )
    assert _parse_datetime(item["due_at_utc"]) == datetime(2026, 11, 10, 14, 30, tzinfo=UTC)

    body = _complete(client, item["id"])

    advanced = body["item"]
    assert advanced is not None
    assert advanced["due_local_date"] == "2026-11-11"
    assert advanced["due_local_time"] == "09:30"
    assert _parse_datetime(advanced["due_at_utc"]) == datetime(2026, 11, 11, 14, 30, tzinfo=UTC)

    row = _fetch_item(migrated_database, item["id"])
    assert row["due_at_utc"] == "2026-11-11T14:30:00+00:00"
    assert row["updated_at_utc"] == FIXED_NOW.isoformat()
