from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime

COMPLETION_LOG_COLUMNS = (
    "id",
    "item_id",
    "scheduled_due_at_utc",
    "completed_at_utc",
    "previous_state_snapshot_json",
)


@dataclass(frozen=True, slots=True)
class CompletionLogRecord:
    id: int
    item_id: int | None
    scheduled_due_at_utc: datetime
    completed_at_utc: datetime
    previous_state_snapshot_json: str


@contextmanager
def completion_transaction(connection: sqlite3.Connection) -> Iterator[None]:
    """Run a completion write atomically, taking the write lock up front."""
    connection.execute("BEGIN IMMEDIATE")
    try:
        yield
        connection.execute("COMMIT")
    except BaseException:
        if connection.in_transaction:
            connection.execute("ROLLBACK")
        raise


def _row_to_record(row: sqlite3.Row) -> CompletionLogRecord:
    item_id = row["item_id"]
    return CompletionLogRecord(
        id=int(row["id"]),
        item_id=int(item_id) if item_id is not None else None,
        scheduled_due_at_utc=datetime.fromisoformat(str(row["scheduled_due_at_utc"])),
        completed_at_utc=datetime.fromisoformat(str(row["completed_at_utc"])),
        previous_state_snapshot_json=str(row["previous_state_snapshot_json"]),
    )


def insert_completion_log(
    connection: sqlite3.Connection,
    *,
    item_id: int,
    scheduled_due_at_utc: datetime,
    completed_at_utc: datetime,
    previous_state_snapshot_json: str,
) -> CompletionLogRecord:
    cursor = connection.execute(
        """
        INSERT INTO completion_logs (
            item_id,
            scheduled_due_at_utc,
            completed_at_utc,
            previous_state_snapshot_json
        ) VALUES (?, ?, ?, ?)
        """,
        (
            item_id,
            scheduled_due_at_utc.isoformat(),
            completed_at_utc.isoformat(),
            previous_state_snapshot_json,
        ),
    )
    row = connection.execute(
        f"""
        SELECT {", ".join(COMPLETION_LOG_COLUMNS)}
        FROM completion_logs
        WHERE id = ?
        """,
        (int(cursor.lastrowid or 0),),
    ).fetchone()
    if row is None:
        raise RuntimeError("Inserted completion log could not be reloaded")
    return _row_to_record(row)


def get_latest_completion_log(
    connection: sqlite3.Connection,
    item_id: int,
) -> CompletionLogRecord | None:
    row = connection.execute(
        f"""
        SELECT {", ".join(COMPLETION_LOG_COLUMNS)}
        FROM completion_logs
        WHERE item_id = ?
        ORDER BY completed_at_utc DESC, id DESC
        LIMIT 1
        """,
        (item_id,),
    ).fetchone()
    return _row_to_record(row) if row is not None else None


def count_completions(connection: sqlite3.Connection) -> int:
    row = connection.execute("SELECT COUNT(*) AS count FROM completion_logs").fetchone()
    return int(row["count"]) if row is not None else 0
