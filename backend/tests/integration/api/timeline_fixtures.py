from __future__ import annotations

import sqlite3
from datetime import UTC, datetime, timedelta
from typing import Any

from due_track.db.connection import connect

REFERENCE = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)


def insert_timeline_item(
    connection: sqlite3.Connection,
    *,
    title: str,
    due_at_utc: datetime,
    status: str = "active",
    category: str | None = None,
    priority: str = "medium",
    recurrence_freq: str = "none",
    notes: str = "",
    amount_cents: int | None = None,
    is_date_only: bool = False,
    recurrence_interval: int = 1,
    recurrence_anchor_mode: str = "schedule",
    recurrence_anchor_day: int | None = None,
    recurrence_end_at_utc: datetime | None = None,
    recurrence_remaining_count: int | None = None,
    created_at_utc: datetime = REFERENCE,
    updated_at_utc: datetime = REFERENCE,
) -> int:
    if (
        recurrence_anchor_day is None
        and recurrence_anchor_mode == "schedule"
        and recurrence_freq in {"monthly", "yearly", "custom_months", "custom_years"}
    ):
        recurrence_anchor_day = due_at_utc.astimezone(UTC).day

    cursor = connection.execute(
        """
        INSERT INTO due_items (
            title, notes, due_at_utc, is_date_only, category, priority, amount_cents,
            recurrence_freq, recurrence_interval, recurrence_anchor_mode,
            recurrence_anchor_day, recurrence_end_at_utc, recurrence_remaining_count,
            status, created_at_utc, updated_at_utc
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            title,
            notes,
            due_at_utc.isoformat(),
            int(is_date_only),
            category,
            priority,
            amount_cents,
            recurrence_freq,
            recurrence_interval,
            recurrence_anchor_mode,
            recurrence_anchor_day,
            recurrence_end_at_utc.isoformat() if recurrence_end_at_utc is not None else None,
            recurrence_remaining_count,
            status,
            created_at_utc.isoformat(),
            updated_at_utc.isoformat(),
        ),
    )
    connection.commit()
    return int(cursor.lastrowid or 0)


def seed_timeline_items(
    connection: sqlite3.Connection,
    count: int,
    *,
    due_base: datetime = REFERENCE + timedelta(days=1),
    category: str | None = "Bench",
    priority: str = "medium",
    recurrence_freq: str = "none",
    title_prefix: str = "Benchmark item",
) -> list[int]:
    created_at = REFERENCE
    rows: list[tuple[Any, ...]] = [
        (
            f"{title_prefix} {index:04d}",
            "Timeline performance fixture.",
            (due_base + timedelta(minutes=index)).isoformat(),
            category,
            priority,
            recurrence_freq,
            created_at.isoformat(),
            created_at.isoformat(),
        )
        for index in range(count)
    ]

    connection.execute("BEGIN IMMEDIATE")
    try:
        connection.executemany(
            """
            INSERT INTO due_items (
                title, notes, due_at_utc, is_date_only, category, priority, amount_cents,
                recurrence_freq, recurrence_interval, recurrence_anchor_mode,
                recurrence_anchor_day, recurrence_end_at_utc, recurrence_remaining_count,
                status, created_at_utc, updated_at_utc
            )
            VALUES (?, ?, ?, 0, ?, ?, NULL, ?, 1, 'schedule', NULL, NULL, NULL, 'active', ?, ?)
            """,
            rows,
        )
        connection.execute("COMMIT")
    except Exception:
        connection.execute("ROLLBACK")
        raise

    return [
        int(row[0])
        for row in connection.execute(
            "SELECT id FROM due_items WHERE title LIKE ? ORDER BY id",
            (f"{title_prefix}%",),
        ).fetchall()
    ]


def open_connection(db_path: Any) -> sqlite3.Connection:
    return connect(db_path)
