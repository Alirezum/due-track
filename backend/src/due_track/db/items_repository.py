from __future__ import annotations

import sqlite3
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any

ITEM_COLUMNS = (
    "id",
    "title",
    "notes",
    "due_at_utc",
    "is_date_only",
    "category",
    "priority",
    "amount_cents",
    "recurrence_freq",
    "recurrence_interval",
    "recurrence_anchor_mode",
    "recurrence_anchor_day",
    "recurrence_end_at_utc",
    "recurrence_remaining_count",
    "status",
    "created_at_utc",
    "updated_at_utc",
)

UPDATABLE_COLUMNS = frozenset(ITEM_COLUMNS) - {"id", "created_at_utc"}


@dataclass(frozen=True, slots=True)
class ItemRecord:
    id: int
    title: str
    notes: str
    due_at_utc: datetime
    is_date_only: bool
    category: str | None
    priority: str
    amount_cents: int | None
    recurrence_freq: str
    recurrence_interval: int
    recurrence_anchor_mode: str
    recurrence_anchor_day: int | None
    recurrence_end_at_utc: datetime | None
    recurrence_remaining_count: int | None
    status: str
    created_at_utc: datetime
    updated_at_utc: datetime


def _serialize(value: object) -> object:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, bool):
        return int(value)
    return value


def _row_to_record(row: sqlite3.Row) -> ItemRecord:
    end_at = row["recurrence_end_at_utc"]
    return ItemRecord(
        id=int(row["id"]),
        title=str(row["title"]),
        notes=str(row["notes"]),
        due_at_utc=datetime.fromisoformat(str(row["due_at_utc"])),
        is_date_only=bool(row["is_date_only"]),
        category=row["category"],
        priority=str(row["priority"]),
        amount_cents=row["amount_cents"],
        recurrence_freq=str(row["recurrence_freq"]),
        recurrence_interval=int(row["recurrence_interval"]),
        recurrence_anchor_mode=str(row["recurrence_anchor_mode"]),
        recurrence_anchor_day=row["recurrence_anchor_day"],
        recurrence_end_at_utc=(datetime.fromisoformat(str(end_at)) if end_at is not None else None),
        recurrence_remaining_count=row["recurrence_remaining_count"],
        status=str(row["status"]),
        created_at_utc=datetime.fromisoformat(str(row["created_at_utc"])),
        updated_at_utc=datetime.fromisoformat(str(row["updated_at_utc"])),
    )


def _select_by_id(connection: sqlite3.Connection, item_id: int) -> ItemRecord | None:
    row = connection.execute(
        f"SELECT {', '.join(ITEM_COLUMNS)} FROM due_items WHERE id = ?",
        (item_id,),
    ).fetchone()
    return _row_to_record(row) if row is not None else None


def insert_item(connection: sqlite3.Connection, values: Mapping[str, Any]) -> ItemRecord:
    columns = [column for column in ITEM_COLUMNS if column in values]
    placeholders = ", ".join("?" for _ in columns)
    cursor = connection.execute(
        f"INSERT INTO due_items ({', '.join(columns)}) VALUES ({placeholders})",
        tuple(_serialize(values[column]) for column in columns),
    )
    record = _select_by_id(connection, int(cursor.lastrowid or 0))
    if record is None:
        raise RuntimeError("Inserted item could not be reloaded")
    return record


def get_active_item(connection: sqlite3.Connection, item_id: int) -> ItemRecord | None:
    row = connection.execute(
        f"SELECT {', '.join(ITEM_COLUMNS)} FROM due_items WHERE id = ? AND status = 'active'",
        (item_id,),
    ).fetchone()
    return _row_to_record(row) if row is not None else None


def get_item(connection: sqlite3.Connection, item_id: int) -> ItemRecord | None:
    return _select_by_id(connection, item_id)


def list_active_items(connection: sqlite3.Connection) -> list[ItemRecord]:
    rows = connection.execute(
        f"SELECT {', '.join(ITEM_COLUMNS)} FROM due_items WHERE status = 'active'"
    ).fetchall()
    return [_row_to_record(row) for row in rows]


def update_item(
    connection: sqlite3.Connection,
    item_id: int,
    fields: Mapping[str, Any],
) -> ItemRecord | None:
    unknown = set(fields) - UPDATABLE_COLUMNS
    if unknown:
        raise ValueError(f"Unsupported item fields: {sorted(unknown)}")
    if not fields:
        return get_item(connection, item_id)

    assignments = ", ".join(f"{column} = ?" for column in fields)
    connection.execute(
        f"UPDATE due_items SET {assignments} WHERE id = ?",
        tuple(_serialize(value) for value in fields.values()) + (item_id,),
    )
    return _select_by_id(connection, item_id)


def soft_delete_item(
    connection: sqlite3.Connection,
    item_id: int,
    updated_at_utc: datetime,
) -> bool:
    cursor = connection.execute(
        """
        UPDATE due_items
        SET status = 'deleted', updated_at_utc = ?
        WHERE id = ? AND status = 'active'
        """,
        (updated_at_utc.isoformat(), item_id),
    )
    return cursor.rowcount > 0
