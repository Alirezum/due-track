from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict
from datetime import date, datetime
from typing import Any, cast
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Response

from due_track.api.deps import DatabaseDep, NowDep, SettingsDep
from due_track.api.filters import ItemFiltersDep
from due_track.api.schemas import (
    AnchorMode,
    Buckets,
    CompleteResponse,
    CompletionLog,
    DashboardSummary,
    DueItem,
    ItemCreate,
    ItemListResponse,
    ItemUpdate,
    RecurrenceFrequency,
    validate_recurrence_policy,
)
from due_track.api.serializers import record_to_due_item
from due_track.api.time import (
    end_of_local_day_to_utc,
    local_to_utc,
    parse_due_input,
    recurrence_end_date_to_utc,
    recurrence_end_utc_to_local_date,
    utc_to_local,
    utc_to_local_date,
)
from due_track.config import Settings
from due_track.db.history_repository import (
    CompletionLogRecord,
    completion_transaction,
    get_latest_completion_log,
    insert_completion_log,
)
from due_track.db.items_repository import (
    ItemRecord,
    get_active_item,
    insert_item,
    list_active_items,
    soft_delete_item,
    update_item,
)
from due_track.domain.recurrence import next_occurrence, remaining_after_completion
from due_track.domain.sorting import sort_items
from due_track.domain.status import Bucket, classify_bucket, summarize_buckets

router = APIRouter(prefix="/items", tags=["Items"])

MONTH_OR_YEAR_FREQUENCIES = {"monthly", "yearly", "custom_months", "custom_years"}
RECURRENCE_FIELDS = {
    "recurrence_freq",
    "recurrence_interval",
    "recurrence_anchor_mode",
    "recurrence_anchor_day",
    "recurrence_end_date",
    "recurrence_remaining_count",
}


def _zone(settings: Settings) -> ZoneInfo:
    return ZoneInfo(settings.timezone)


def _validation_error(message: str) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail=[{"loc": ["body"], "msg": message, "type": "value_error"}],
    )


def _not_found(item_id: int) -> HTTPException:
    return HTTPException(status_code=404, detail=f"Item {item_id} not found")


def _derive_anchor_day(
    *,
    recurrence_freq: RecurrenceFrequency,
    recurrence_anchor_mode: AnchorMode,
    recurrence_anchor_day: int | None,
    due_local_date: date,
) -> int | None:
    if (
        recurrence_anchor_mode == "schedule"
        and recurrence_freq in MONTH_OR_YEAR_FREQUENCIES
        and recurrence_anchor_day is None
    ):
        return due_local_date.day
    return recurrence_anchor_day


def _create_values(
    *,
    payload: ItemCreate,
    due_local_date: date,
    due_at_utc: datetime,
    is_date_only: bool,
    tz: ZoneInfo,
    now: datetime,
) -> dict[str, Any]:
    anchor_day = _derive_anchor_day(
        recurrence_freq=payload.recurrence_freq,
        recurrence_anchor_mode=payload.recurrence_anchor_mode,
        recurrence_anchor_day=payload.recurrence_anchor_day,
        due_local_date=due_local_date,
    )
    try:
        validate_recurrence_policy(
            recurrence_freq=payload.recurrence_freq,
            recurrence_interval=payload.recurrence_interval,
            recurrence_anchor_mode=payload.recurrence_anchor_mode,
            recurrence_anchor_day=anchor_day,
            recurrence_end_date=payload.recurrence_end_date,
            recurrence_remaining_count=payload.recurrence_remaining_count,
        )
    except ValueError as error:
        raise _validation_error(str(error)) from error

    return {
        "title": payload.title,
        "notes": payload.notes,
        "due_at_utc": due_at_utc,
        "is_date_only": is_date_only,
        "category": payload.category,
        "priority": payload.priority,
        "amount_cents": payload.amount_cents,
        "recurrence_freq": payload.recurrence_freq,
        "recurrence_interval": payload.recurrence_interval,
        "recurrence_anchor_mode": payload.recurrence_anchor_mode,
        "recurrence_anchor_day": anchor_day,
        "recurrence_end_at_utc": (
            recurrence_end_date_to_utc(payload.recurrence_end_date, tz)
            if payload.recurrence_end_date is not None
            else None
        ),
        "recurrence_remaining_count": payload.recurrence_remaining_count,
        "status": "active",
        "created_at_utc": now,
        "updated_at_utc": now,
    }


@router.get("", response_model=ItemListResponse)
def list_items(
    connection: DatabaseDep,
    settings: SettingsDep,
    now: NowDep,
    filters: ItemFiltersDep,
) -> ItemListResponse:
    tz = _zone(settings)
    reference_local_date = utc_to_local_date(now, tz)
    grouped: dict[Bucket, list[DueItem]] = {
        Bucket.OVERDUE: [],
        Bucket.DUE_TODAY: [],
        Bucket.UPCOMING: [],
        Bucket.LATER: [],
    }

    records = list_active_items(
        connection,
        category=filters.category,
        priority=filters.priority,
        recurring=filters.recurring,
        q=filters.q,
    )
    for record in records:
        item = record_to_due_item(record, tz)
        bucket = classify_bucket(
            due_at_utc=item.due_at_utc,
            due_local_date=item.due_local_date,
            reference_time=now,
            reference_local_date=reference_local_date,
        )
        grouped[bucket].append(item)

    for bucket, bucket_items in grouped.items():
        grouped[bucket] = sort_items(bucket_items)

    summary = summarize_buckets(
        overdue_count=len(grouped[Bucket.OVERDUE]),
        due_today_count=len(grouped[Bucket.DUE_TODAY]),
        upcoming_amounts=[item.amount_cents for item in grouped[Bucket.UPCOMING]],
    )
    return ItemListResponse(
        buckets=Buckets(
            overdue=grouped[Bucket.OVERDUE],
            due_today=grouped[Bucket.DUE_TODAY],
            upcoming=grouped[Bucket.UPCOMING],
            later=grouped[Bucket.LATER],
        ),
        summary=DashboardSummary(
            overdue_count=summary.overdue_count,
            due_today_count=summary.due_today_count,
            upcoming_total_cents=summary.upcoming_total_cents,
        ),
        currency_code=settings.currency,
        timezone=settings.timezone,
    )


@router.post("", status_code=201, response_model=DueItem)
def create_item(
    payload: ItemCreate,
    response: Response,
    connection: DatabaseDep,
    settings: SettingsDep,
    now: NowDep,
) -> DueItem:
    tz = _zone(settings)
    parsed = parse_due_input(payload.due.model_dump(), tz)
    values = _create_values(
        payload=payload,
        due_local_date=parsed.due_local_date,
        due_at_utc=parsed.due_at_utc,
        is_date_only=parsed.is_date_only,
        tz=tz,
        now=now,
    )
    record = insert_item(connection, values)
    response.headers["Location"] = f"/api/items/{record.id}"
    return record_to_due_item(record, tz)


def _snapshot_json(record: ItemRecord, *, next_due_at_utc: datetime | None) -> str:
    item = asdict(record)
    for key, value in item.items():
        if isinstance(value, datetime):
            item[key] = value.isoformat()

    snapshot: dict[str, Any] = {
        "snapshot_version": 1,
        "spawned_next_occurrence": next_due_at_utc is not None,
        "item": item,
    }
    if next_due_at_utc is not None:
        snapshot["next_due_at_utc"] = next_due_at_utc.isoformat()
    return json.dumps(snapshot, separators=(",", ":"))


@router.post("/{item_id}/complete", response_model=CompleteResponse)
def complete_item(
    item_id: int,
    connection: DatabaseDep,
    settings: SettingsDep,
    now: NowDep,
) -> CompleteResponse:
    record = get_active_item(connection, item_id)
    if record is None:
        raise _not_found(item_id)

    tz = _zone(settings)
    current_local = utc_to_local(record.due_at_utc, tz)
    completion_local = utc_to_local(now, tz)
    end_local_date = (
        recurrence_end_utc_to_local_date(record.recurrence_end_at_utc, tz)
        if record.recurrence_end_at_utc is not None
        else None
    )

    next_local = None
    if record.recurrence_freq != "none" and (
        record.recurrence_remaining_count is None or record.recurrence_remaining_count > 1
    ):
        next_local = next_occurrence(
            current_due_at_utc=record.due_at_utc,
            completion_at_utc=now,
            current_local_date=current_local.date(),
            current_local_time=None if record.is_date_only else current_local.time(),
            completion_local_date=completion_local.date(),
            completion_local_time=completion_local.time(),
            recurrence_freq=record.recurrence_freq,
            recurrence_interval=record.recurrence_interval,
            recurrence_anchor_mode=record.recurrence_anchor_mode,
            recurrence_anchor_day=record.recurrence_anchor_day,
            end_local_date=end_local_date,
        )

    next_due_at_utc = None
    if next_local is not None:
        if next_local.local_time is None:
            next_due_at_utc = end_of_local_day_to_utc(next_local.local_date, tz)
        else:
            next_due_at_utc = local_to_utc(
                datetime.combine(next_local.local_date, next_local.local_time), tz
            )

    previous_state = record_to_due_item(record, tz)
    snapshot_json = _snapshot_json(record, next_due_at_utc=next_due_at_utc)

    updated_fields: dict[str, Any] = {"updated_at_utc": now}
    if next_due_at_utc is None:
        updated_fields["status"] = "completed"
        if record.recurrence_remaining_count is not None:
            updated_fields["recurrence_remaining_count"] = 0
    else:
        updated_fields["due_at_utc"] = next_due_at_utc
        updated_fields["status"] = "active"
        if record.recurrence_remaining_count is not None:
            updated_fields["recurrence_remaining_count"] = remaining_after_completion(
                record.recurrence_remaining_count
            )

    with completion_transaction(connection):
        log_record = insert_completion_log(
            connection,
            item_id=record.id,
            scheduled_due_at_utc=record.due_at_utc,
            completed_at_utc=now,
            previous_state_snapshot_json=snapshot_json,
        )
        advanced = update_item(connection, item_id, updated_fields)
        if advanced is None:
            raise _not_found(item_id)

    latest_log = get_latest_completion_log(connection, item_id)
    return CompleteResponse(
        log=CompletionLog(
            id=log_record.id,
            item_id=log_record.item_id,
            scheduled_due_at_utc=log_record.scheduled_due_at_utc,
            completed_at_utc=log_record.completed_at_utc,
            previous_state=previous_state,
            spawned_next_occurrence=next_due_at_utc is not None,
            next_due_at_utc=next_due_at_utc,
            can_undo=(
                latest_log is not None
                and latest_log.id == log_record.id
                and advanced.status != "deleted"
            ),
        ),
        item=record_to_due_item(advanced, tz) if next_due_at_utc is not None else None,
    )


def _recomputed_due_utc(
    *,
    record: ItemRecord,
    latest_log: CompletionLogRecord,
    tz: ZoneInfo,
    recurrence_freq: str,
    recurrence_interval: int,
    recurrence_anchor_mode: str,
    recurrence_anchor_day: int | None,
    recurrence_end_date: date | None,
) -> datetime | None:
    anchor_local = utc_to_local(latest_log.scheduled_due_at_utc, tz)
    completion_local = utc_to_local(latest_log.completed_at_utc, tz)
    next_local = next_occurrence(
        current_due_at_utc=latest_log.scheduled_due_at_utc,
        completion_at_utc=latest_log.completed_at_utc,
        current_local_date=anchor_local.date(),
        current_local_time=None if record.is_date_only else anchor_local.time(),
        completion_local_date=completion_local.date(),
        completion_local_time=completion_local.time(),
        recurrence_freq=recurrence_freq,
        recurrence_interval=recurrence_interval,
        recurrence_anchor_mode=recurrence_anchor_mode,
        recurrence_anchor_day=recurrence_anchor_day,
        end_local_date=recurrence_end_date,
    )
    if next_local is None:
        return None
    if next_local.local_time is None:
        return end_of_local_day_to_utc(next_local.local_date, tz)
    return local_to_utc(datetime.combine(next_local.local_date, next_local.local_time), tz)


def _updated_values(
    *,
    record: ItemRecord,
    payload: ItemUpdate,
    connection: sqlite3.Connection,
    tz: ZoneInfo,
    now: datetime,
) -> dict[str, Any]:
    provided = payload.model_fields_set
    values: dict[str, Any] = {"updated_at_utc": now}

    for field_name in ("title", "notes", "priority", "amount_cents"):
        if field_name in provided:
            values[field_name] = getattr(payload, field_name)
    if "category" in provided:
        values["category"] = payload.category

    due_local_date: date | None = None
    if "due" in provided:
        assert payload.due is not None
        parsed = parse_due_input(payload.due.model_dump(), tz)
        due_local_date = parsed.due_local_date
        values["due_at_utc"] = parsed.due_at_utc
        values["is_date_only"] = parsed.is_date_only

    recurrence_freq = cast(RecurrenceFrequency, payload.recurrence_freq or record.recurrence_freq)
    recurrence_interval = (
        payload.recurrence_interval
        if "recurrence_interval" in provided and payload.recurrence_interval is not None
        else record.recurrence_interval
    )
    recurrence_anchor_mode = cast(
        AnchorMode, payload.recurrence_anchor_mode or record.recurrence_anchor_mode
    )
    recurrence_anchor_day = (
        payload.recurrence_anchor_day
        if "recurrence_anchor_day" in provided
        else record.recurrence_anchor_day
    )
    recurrence_end_date = (
        payload.recurrence_end_date
        if "recurrence_end_date" in provided
        else (
            recurrence_end_utc_to_local_date(record.recurrence_end_at_utc, tz)
            if record.recurrence_end_at_utc is not None
            else None
        )
    )
    recurrence_remaining_count = (
        payload.recurrence_remaining_count
        if "recurrence_remaining_count" in provided
        else record.recurrence_remaining_count
    )

    if (
        due_local_date is not None
        and "recurrence_anchor_day" not in provided
        and recurrence_anchor_mode == "schedule"
        and recurrence_freq in MONTH_OR_YEAR_FREQUENCIES
    ):
        recurrence_anchor_day = due_local_date.day

    if provided & RECURRENCE_FIELDS:
        if recurrence_freq == "none":
            recurrence_interval = 1
            recurrence_anchor_mode = "schedule"
            recurrence_anchor_day = None
            recurrence_end_date = None
            recurrence_remaining_count = None
        else:
            if recurrence_freq not in MONTH_OR_YEAR_FREQUENCIES:
                recurrence_anchor_day = None
            if recurrence_anchor_mode == "completion":
                recurrence_anchor_day = None
            if (
                recurrence_anchor_mode == "schedule"
                and recurrence_freq in MONTH_OR_YEAR_FREQUENCIES
                and recurrence_anchor_day is None
            ):
                if due_local_date is None:
                    due_local_date = utc_to_local_date(record.due_at_utc, tz)
                recurrence_anchor_day = due_local_date.day

        try:
            validate_recurrence_policy(
                recurrence_freq=recurrence_freq,
                recurrence_interval=recurrence_interval,
                recurrence_anchor_mode=recurrence_anchor_mode,
                recurrence_anchor_day=recurrence_anchor_day,
                recurrence_end_date=recurrence_end_date,
                recurrence_remaining_count=recurrence_remaining_count,
            )
        except ValueError as error:
            raise _validation_error(str(error)) from error

        values["recurrence_freq"] = recurrence_freq
        values["recurrence_interval"] = recurrence_interval
        values["recurrence_anchor_mode"] = recurrence_anchor_mode
        values["recurrence_anchor_day"] = recurrence_anchor_day
        values["recurrence_end_at_utc"] = (
            recurrence_end_date_to_utc(recurrence_end_date, tz)
            if recurrence_end_date is not None
            else None
        )
        values["recurrence_remaining_count"] = recurrence_remaining_count

    if provided & RECURRENCE_FIELDS and recurrence_freq != "none":
        latest_log = get_latest_completion_log(connection, record.id)
        touched = "due" in provided or (
            latest_log is not None and record.updated_at_utc > latest_log.completed_at_utc
        )
        if latest_log is not None and not touched:
            recomputed_due = _recomputed_due_utc(
                record=record,
                latest_log=latest_log,
                tz=tz,
                recurrence_freq=recurrence_freq,
                recurrence_interval=recurrence_interval,
                recurrence_anchor_mode=recurrence_anchor_mode,
                recurrence_anchor_day=recurrence_anchor_day,
                recurrence_end_date=recurrence_end_date,
            )
            if recomputed_due is None:
                values["status"] = "completed"
                if recurrence_remaining_count is not None:
                    values["recurrence_remaining_count"] = 0
            else:
                values["due_at_utc"] = recomputed_due

    return values


@router.patch("/{item_id}", response_model=DueItem)
def patch_item(
    item_id: int,
    payload: ItemUpdate,
    connection: DatabaseDep,
    settings: SettingsDep,
    now: NowDep,
) -> DueItem:
    record = get_active_item(connection, item_id)
    if record is None:
        raise _not_found(item_id)

    tz = _zone(settings)
    values = _updated_values(
        record=record,
        payload=payload,
        connection=connection,
        tz=tz,
        now=now,
    )
    updated = update_item(connection, item_id, values)
    if updated is None:
        raise _not_found(item_id)
    return record_to_due_item(updated, tz)


@router.delete("/{item_id}", status_code=204)
def delete_item(
    item_id: int,
    connection: DatabaseDep,
    now: NowDep,
) -> Response:
    if not soft_delete_item(connection, item_id, now):
        raise _not_found(item_id)
    return Response(status_code=204)
