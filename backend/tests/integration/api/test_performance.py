from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from due_track.db.connection import connect
from tests.integration.api.timeline_fixtures import REFERENCE, seed_timeline_items

SEEDED_ITEMS = 1_000
MAX_SECONDS = 1.0


def _seed_active_items(db_path: Path, count: int = SEEDED_ITEMS) -> None:
    base_due = datetime(2026, 11, 6, 12, 0, tzinfo=UTC)
    created_at = datetime(2026, 11, 5, 12, 0, tzinfo=UTC).isoformat()
    rows: list[tuple[Any, ...]] = [
        (
            f"Benchmark item {index:04d}",
            "Performance smoke test fixture.",
            (base_due + timedelta(days=index % 30)).isoformat(),
            "Bench",
            "medium",
            index,
            created_at,
            created_at,
        )
        for index in range(count)
    ]

    connection = connect(db_path)
    try:
        connection.execute("BEGIN IMMEDIATE")
        connection.executemany(
            """
            INSERT INTO due_items (
                title, notes, due_at_utc, is_date_only, category, priority, amount_cents,
                recurrence_freq, recurrence_interval, recurrence_anchor_mode,
                recurrence_anchor_day, recurrence_end_at_utc, recurrence_remaining_count,
                status, created_at_utc, updated_at_utc
            )
            VALUES (?, ?, ?, 0, ?, ?, ?, 'none', 1, 'schedule', NULL, NULL, NULL, 'active', ?, ?)
            """,
            rows,
        )
        connection.execute("COMMIT")
    finally:
        connection.close()


def _seed_mixed_scope_items(db_path: Path) -> None:
    connection = connect(db_path)
    try:
        seed_timeline_items(
            connection,
            SEEDED_ITEMS // 2,
            due_base=REFERENCE - timedelta(days=30),
            category="Bench",
            priority="medium",
            recurrence_freq="none",
            title_prefix="Overdue benchmark",
        )
        seed_timeline_items(
            connection,
            SEEDED_ITEMS // 2,
            due_base=REFERENCE + timedelta(days=1),
            category="Bench",
            priority="medium",
            recurrence_freq="none",
            title_prefix="Upcoming benchmark",
        )
    finally:
        connection.close()


def test_scope_upcoming_list_with_thousand_mixed_items_stays_under_one_second(
    client: TestClient, migrated_database: Path
) -> None:
    _seed_mixed_scope_items(migrated_database)

    started = time.perf_counter()
    response = client.get("/api/items", params={"scope": "upcoming"})
    elapsed = time.perf_counter() - started

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["summary"]["overdue_count"] == SEEDED_ITEMS // 2
    assert body["buckets"]["overdue"] == []
    visible = sum(len(items) for items in body["buckets"].values())
    assert visible == SEEDED_ITEMS // 2
    assert elapsed < MAX_SECONDS, f"upcoming list took {elapsed:.3f}s for {SEEDED_ITEMS} items"


def test_scope_upcoming_timeline_with_thousand_mixed_items_stays_under_one_second(
    client: TestClient, migrated_database: Path
) -> None:
    _seed_mixed_scope_items(migrated_database)

    started = time.perf_counter()
    response = client.get("/api/timeline", params={"scope": "upcoming"})
    elapsed = time.perf_counter() - started

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["overdue_count"] == SEEDED_ITEMS // 2
    assert len(body["entries"]) == SEEDED_ITEMS // 2
    assert all(entry["urgency"] != "overdue" for entry in body["entries"])
    assert elapsed < MAX_SECONDS, f"upcoming timeline took {elapsed:.3f}s for {SEEDED_ITEMS} items"


def test_filtered_list_with_thousand_items_stays_under_one_second(
    client: TestClient, migrated_database: Path
) -> None:
    _seed_active_items(migrated_database)

    started = time.perf_counter()
    response = client.get(
        "/api/items",
        params={
            "q": "Benchmark",
            "category": "bench",
            "priority": "medium",
            "recurring": "false",
        },
    )
    elapsed = time.perf_counter() - started

    assert response.status_code == 200, response.text
    body = response.json()
    total = sum(len(items) for items in body["buckets"].values())
    assert total == SEEDED_ITEMS
    assert elapsed < MAX_SECONDS, f"filtered list took {elapsed:.3f}s for {SEEDED_ITEMS} items"


def test_timeline_1000_items_under_one_second(client: TestClient, migrated_database: Path) -> None:
    connection = connect(migrated_database)
    try:
        seed_timeline_items(
            connection,
            SEEDED_ITEMS,
            category="Bench",
            priority="medium",
            recurrence_freq="none",
            title_prefix="Benchmark item",
        )
    finally:
        connection.close()

    started = time.perf_counter()
    response = client.get(
        "/api/timeline",
        params={
            "category": "bench",
            "priority": "medium",
            "recurring": "false",
            "q": "Benchmark",
        },
    )
    elapsed = time.perf_counter() - started

    assert response.status_code == 200, response.text
    entries = response.json()["entries"]
    assert len(entries) == SEEDED_ITEMS
    assert len({entry["item"]["id"] for entry in entries}) == SEEDED_ITEMS
    assert elapsed < MAX_SECONDS, f"timeline took {elapsed:.3f}s for {SEEDED_ITEMS} items"
