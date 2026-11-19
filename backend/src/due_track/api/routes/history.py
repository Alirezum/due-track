from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Annotated, Any, cast
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query, Response

from due_track.api.deps import DatabaseDep, SettingsDep
from due_track.api.errors import NotFoundError
from due_track.api.schemas import CompletionLog, DueItem, HistoryResponse
from due_track.api.time import recurrence_end_utc_to_local_date, utc_to_local
from due_track.config import Settings
from due_track.db.history_repository import (
    CompletionLogRecord,
    count_completions,
    delete_completion_log,
    get_latest_completion_log,
    list_completion_logs,
)
from due_track.db.items_repository import get_item

router = APIRouter(prefix="/history", tags=["History"])


def _zone(settings: Settings) -> ZoneInfo:
    return ZoneInfo(settings.timezone)


def _utc(value: Any) -> datetime:
    return datetime.fromisoformat(str(value))


def _snapshot_to_due_item(snapshot: dict[str, Any], tz: ZoneInfo) -> DueItem:
    item = cast(dict[str, Any], snapshot["item"])
    due_at_utc = _utc(item["due_at_utc"])
    local_due = utc_to_local(due_at_utc, tz)
    is_date_only = bool(item["is_date_only"])
    end_at_raw = item.get("recurrence_end_at_utc")

    return DueItem(
        id=int(item["id"]),
        title=str(item["title"]),
        notes=str(item["notes"]),
        due_at_utc=due_at_utc,
        is_date_only=is_date_only,
        due_local_date=local_due.date(),
        due_local_time=None if is_date_only else local_due.strftime("%H:%M"),
        category=cast(str | None, item["category"]),
        priority=cast(Any, item["priority"]),
        amount_cents=cast(int | None, item["amount_cents"]),
        recurrence_freq=cast(Any, item["recurrence_freq"]),
        recurrence_interval=int(item["recurrence_interval"]),
        recurrence_anchor_mode=cast(Any, item["recurrence_anchor_mode"]),
        recurrence_anchor_day=cast(int | None, item["recurrence_anchor_day"]),
        recurrence_end_date=(
            recurrence_end_utc_to_local_date(_utc(end_at_raw), tz)
            if end_at_raw is not None
            else None
        ),
        recurrence_remaining_count=cast(int | None, item["recurrence_remaining_count"]),
        status=cast(Any, item["status"]),
        is_recurring=str(item["recurrence_freq"]) != "none",
        created_at_utc=_utc(item["created_at_utc"]),
        updated_at_utc=_utc(item["updated_at_utc"]),
    )


def _can_undo(connection: sqlite3.Connection, record: CompletionLogRecord) -> bool:
    if record.item_id is None:
        return False
    item = get_item(connection, record.item_id)
    if item is None or item.status == "deleted":
        return False
    latest = get_latest_completion_log(connection, record.item_id)
    return latest is not None and latest.id == record.id


def _record_to_log(
    connection: sqlite3.Connection,
    record: CompletionLogRecord,
    tz: ZoneInfo,
) -> CompletionLog:
    snapshot = cast(dict[str, Any], json.loads(record.previous_state_snapshot_json))
    next_due_raw = snapshot.get("next_due_at_utc")

    return CompletionLog(
        id=record.id,
        item_id=record.item_id,
        scheduled_due_at_utc=record.scheduled_due_at_utc,
        completed_at_utc=record.completed_at_utc,
        previous_state=_snapshot_to_due_item(snapshot, tz),
        spawned_next_occurrence=bool(snapshot.get("spawned_next_occurrence", False)),
        next_due_at_utc=_utc(next_due_raw) if next_due_raw is not None else None,
        can_undo=_can_undo(connection, record),
    )


@router.get("", response_model=HistoryResponse)
def list_history(
    connection: DatabaseDep,
    settings: SettingsDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> HistoryResponse:
    tz = _zone(settings)
    records = list_completion_logs(connection, limit=limit, offset=offset)
    return HistoryResponse(
        entries=[_record_to_log(connection, record, tz) for record in records],
        total=count_completions(connection),
    )


@router.delete("/{log_id}", status_code=204)
def delete_history_entry(log_id: int, connection: DatabaseDep) -> Response:
    if not delete_completion_log(connection, log_id):
        raise NotFoundError(f"History entry {log_id} not found")
    return Response(status_code=204)
