from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from due_track.db.connection import connect
from due_track.domain.timeline import classify_urgency, seconds_until_due
from tests.integration.api.timeline_fixtures import (
    REFERENCE,
    insert_timeline_item,
)

DAY = timedelta(days=1)
HOUR = timedelta(hours=1)


def test_returns_every_filtered_active_item_exactly_once(
    client: TestClient, migrated_database: Path
) -> None:
    connection = connect(migrated_database)
    try:
        active_ids = {
            insert_timeline_item(
                connection,
                title=f"Active {index}",
                due_at_utc=REFERENCE + timedelta(hours=index + 1),
            )
            for index in range(3)
        }
        insert_timeline_item(
            connection,
            title="Completed",
            due_at_utc=REFERENCE + HOUR,
            status="completed",
        )
        insert_timeline_item(
            connection,
            title="Deleted",
            due_at_utc=REFERENCE + HOUR,
            status="deleted",
        )
    finally:
        connection.close()

    response = client.get("/api/timeline")

    assert response.status_code == 200, response.text
    body = response.json()
    returned_ids = [entry["item"]["id"] for entry in body["entries"]]
    assert len(returned_ids) == len(set(returned_ids)) == 3
    assert set(returned_ids) == active_ids
    assert body["reference_time_utc"].startswith("2026-11-05T12:00:00")
    assert body["timezone"] == "America/New_York"
    assert body["currency_code"] == "USD"


def test_orders_by_due_then_priority_then_title_then_id(
    client: TestClient, migrated_database: Path
) -> None:
    shared_due = REFERENCE + DAY
    connection = connect(migrated_database)
    try:
        low = insert_timeline_item(
            connection,
            title="Zulu",
            due_at_utc=shared_due,
            priority="low",
        )
        critical = insert_timeline_item(
            connection,
            title="Zulu",
            due_at_utc=shared_due,
            priority="critical",
        )
        high = insert_timeline_item(
            connection,
            title="alpha",
            due_at_utc=shared_due,
            priority="high",
        )
        medium = insert_timeline_item(
            connection,
            title="Alpha",
            due_at_utc=shared_due,
            priority="high",
        )
        first = insert_timeline_item(
            connection,
            title="First",
            due_at_utc=REFERENCE + HOUR,
        )
        earlier_duplicate = insert_timeline_item(
            connection,
            title="Tie",
            due_at_utc=shared_due,
            priority="medium",
        )
        later_duplicate = insert_timeline_item(
            connection,
            title="Tie",
            due_at_utc=shared_due,
            priority="medium",
        )
    finally:
        connection.close()

    body = client.get("/api/timeline").json()

    assert [entry["item"]["id"] for entry in body["entries"]] == [
        first,
        critical,
        high,
        medium,
        earlier_duplicate,
        later_duplicate,
        low,
    ]


def test_urgency_and_signed_seconds_match_the_domain_functions(
    client: TestClient, migrated_database: Path
) -> None:
    due_values = [
        REFERENCE - 3 * DAY,
        REFERENCE,
        REFERENCE + timedelta(seconds=1),
        REFERENCE + 24 * HOUR,
        REFERENCE + 24 * HOUR + timedelta(seconds=1),
        REFERENCE + 7 * DAY,
        REFERENCE + 7 * DAY + timedelta(seconds=1),
    ]
    connection = connect(migrated_database)
    try:
        for index, due in enumerate(due_values):
            insert_timeline_item(
                connection,
                title=f"Boundary {index}",
                due_at_utc=due,
            )
    finally:
        connection.close()

    body = client.get("/api/timeline").json()
    reference = datetime.fromisoformat(body["reference_time_utc"])

    assert len(body["entries"]) == len(due_values)
    for entry in body["entries"]:
        due = datetime.fromisoformat(entry["item"]["due_at_utc"])
        assert entry["urgency"] == classify_urgency(due_at_utc=due, reference_time=reference)
        assert entry["seconds_until_due"] == seconds_until_due(
            due_at_utc=due, reference_time=reference
        )


def test_date_only_items_keep_end_of_local_day_semantics(
    client: TestClient, migrated_database: Path
) -> None:
    connection = connect(migrated_database)
    try:
        item_id = insert_timeline_item(
            connection,
            title="Date only",
            due_at_utc=datetime(2026, 11, 6, 4, 59, 59, 999999, tzinfo=UTC),
            is_date_only=True,
        )
    finally:
        connection.close()

    entry = client.get("/api/timeline").json()["entries"][0]

    assert entry["item"]["id"] == item_id
    assert entry["item"]["is_date_only"] is True
    assert entry["item"]["due_local_date"] == "2026-11-05"
    assert entry["item"]["due_local_time"] is None


def test_filters_combine_with_and_semantics(client: TestClient, migrated_database: Path) -> None:
    connection = connect(migrated_database)
    try:
        match = insert_timeline_item(
            connection,
            title="Gym membership",
            due_at_utc=REFERENCE + DAY,
            category="Bills",
            priority="high",
            recurrence_freq="none",
        )
        insert_timeline_item(
            connection,
            title="Gym membership",
            due_at_utc=REFERENCE + DAY,
            category="Bills",
            priority="high",
            recurrence_freq="monthly",
        )
        insert_timeline_item(
            connection,
            title="Gym membership",
            due_at_utc=REFERENCE + DAY,
            category="Health",
            priority="high",
            recurrence_freq="none",
        )
        insert_timeline_item(
            connection,
            title="Electric bill",
            due_at_utc=REFERENCE + DAY,
            category="Bills",
            priority="high",
            recurrence_freq="none",
        )
        insert_timeline_item(
            connection,
            title="Gym membership",
            due_at_utc=REFERENCE + DAY,
            category="Bills",
            priority="low",
            recurrence_freq="none",
        )
    finally:
        connection.close()

    response = client.get(
        "/api/timeline",
        params={
            "category": "bills",
            "priority": "high",
            "recurring": "false",
            "q": "gym",
        },
    )

    assert response.status_code == 200, response.text
    entries = response.json()["entries"]
    assert [entry["item"]["id"] for entry in entries] == [match]


def test_empty_result_returns_empty_entries(client: TestClient) -> None:
    response = client.get("/api/timeline")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["entries"] == []
    assert body["timezone"] == "America/New_York"
    assert body["currency_code"] == "USD"


@pytest.mark.parametrize(
    "params",
    [
        {"priority": "urgent"},
        {"category": ""},
        {"category": "x" * 51},
        {"q": "x" * 201},
        {"recurring": "sometimes"},
    ],
)
def test_invalid_filters_return_422(client: TestClient, params: dict[str, str]) -> None:
    response = client.get("/api/timeline", params=params)

    assert response.status_code == 422, response.text
