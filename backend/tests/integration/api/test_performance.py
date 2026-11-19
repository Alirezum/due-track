from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from due_track.db.connection import connect

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
