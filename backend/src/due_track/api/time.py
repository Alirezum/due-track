from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

END_OF_DAY = time(23, 59, 59, 999999)


@dataclass(frozen=True, slots=True)
class ParsedDue:
    due_at_utc: datetime
    is_date_only: bool
    due_local_date: date
    due_local_time: time | None


def _require_aware(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Datetime must include an explicit offset")
    return value


def _parse_date(value: object) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        raise ValueError("Date input must be an ISO-8601 date")
    return date.fromisoformat(value)


def _parse_aware_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        parsed = datetime.fromisoformat(value)
    else:
        raise ValueError("Datetime input must be an ISO-8601 datetime")
    return _require_aware(parsed).astimezone(UTC)


def end_of_local_day_to_utc(local_date: date, tz: ZoneInfo) -> datetime:
    return datetime.combine(local_date, END_OF_DAY, tzinfo=tz).astimezone(UTC)


def recurrence_end_date_to_utc(local_end_date: date, tz: ZoneInfo) -> datetime:
    return end_of_local_day_to_utc(local_end_date, tz)


def recurrence_end_utc_to_local_date(value: datetime, tz: ZoneInfo) -> date:
    return utc_to_local_date(value, tz)


def utc_to_local(value: datetime, tz: ZoneInfo) -> datetime:
    return _require_aware(value).astimezone(tz)


def utc_to_local_date(value: datetime, tz: ZoneInfo) -> date:
    return utc_to_local(value, tz).date()


def utc_to_local_time(value: datetime, tz: ZoneInfo) -> time:
    return utc_to_local(value, tz).time()


def local_to_utc(value: datetime, tz: ZoneInfo) -> datetime:
    if value.tzinfo is not None and value.utcoffset() is not None:
        raise ValueError("Local datetime must be naive")
    return value.replace(tzinfo=tz).astimezone(UTC)


def parse_due_input(due: Mapping[str, object], tz: ZoneInfo) -> ParsedDue:
    kind = due.get("kind")
    if kind == "date":
        local_date = _parse_date(due.get("date"))
        return ParsedDue(
            due_at_utc=end_of_local_day_to_utc(local_date, tz),
            is_date_only=True,
            due_local_date=local_date,
            due_local_time=None,
        )
    if kind == "datetime":
        due_at_utc = _parse_aware_datetime(due.get("at"))
        local_value = utc_to_local(due_at_utc, tz)
        return ParsedDue(
            due_at_utc=due_at_utc,
            is_date_only=False,
            due_local_date=local_value.date(),
            due_local_time=local_value.time(),
        )
    raise ValueError("Due input must be date or datetime")
