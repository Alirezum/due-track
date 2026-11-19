from __future__ import annotations

from typing import Any, cast
from zoneinfo import ZoneInfo

from due_track.api.schemas import DueItem
from due_track.api.time import (
    recurrence_end_utc_to_local_date,
    utc_to_local,
)
from due_track.db.items_repository import ItemRecord


def record_to_due_item(record: ItemRecord, tz: ZoneInfo) -> DueItem:
    local_due = utc_to_local(record.due_at_utc, tz)
    return DueItem(
        id=record.id,
        title=record.title,
        notes=record.notes,
        due_at_utc=record.due_at_utc,
        is_date_only=record.is_date_only,
        due_local_date=local_due.date(),
        due_local_time=None if record.is_date_only else local_due.strftime("%H:%M"),
        category=record.category,
        priority=cast(Any, record.priority),
        amount_cents=record.amount_cents,
        recurrence_freq=cast(Any, record.recurrence_freq),
        recurrence_interval=record.recurrence_interval,
        recurrence_anchor_mode=cast(Any, record.recurrence_anchor_mode),
        recurrence_anchor_day=record.recurrence_anchor_day,
        recurrence_end_date=(
            recurrence_end_utc_to_local_date(record.recurrence_end_at_utc, tz)
            if record.recurrence_end_at_utc is not None
            else None
        ),
        recurrence_remaining_count=record.recurrence_remaining_count,
        status=cast(Any, record.status),
        is_recurring=record.recurrence_freq != "none",
        created_at_utc=record.created_at_utc,
        updated_at_utc=record.updated_at_utc,
    )
