from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

END_OF_DAY = time(23, 59, 59, 999999)
MAX_ADVANCEMENTS = 100_000

DAILY_FREQUENCIES = {"daily", "custom_days"}
WEEKLY_FREQUENCIES = {"weekly", "custom_weeks"}
MONTHLY_FREQUENCIES = {"monthly", "custom_months"}
YEARLY_FREQUENCIES = {"yearly", "custom_years"}


@dataclass(frozen=True, slots=True)
class NextLocalDue:
    local_date: date
    local_time: time | None


def remaining_after_completion(remaining_count: int | None) -> int | None:
    """Consume one occurrence from a count-limited series."""
    if remaining_count is None:
        return None
    return max(remaining_count - 1, 0)


def _shift_months(base: date, months: int, day: int) -> date:
    month_index = base.month - 1 + months
    year = base.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def _shift_years(base: date, years: int, anchor_day: int) -> date:
    year = base.year + years
    return date(year, base.month, min(anchor_day, calendar.monthrange(year, base.month)[1]))


def _schedule_step(
    *,
    current: date,
    frequency: str,
    interval: int,
    anchor_day: int | None,
) -> date:
    if frequency in DAILY_FREQUENCIES:
        return current + timedelta(days=interval)
    if frequency in WEEKLY_FREQUENCIES:
        return current + timedelta(days=interval * 7)
    if frequency in MONTHLY_FREQUENCIES:
        return _shift_months(current, interval, anchor_day or current.day)
    if frequency in YEARLY_FREQUENCIES:
        return _shift_years(current, interval, anchor_day or current.day)
    raise ValueError(f"Unsupported recurrence frequency: {frequency}")


def _completion_step(
    *,
    completion: date,
    frequency: str,
    interval: int,
) -> date:
    if frequency in DAILY_FREQUENCIES:
        return completion + timedelta(days=interval)
    if frequency in WEEKLY_FREQUENCIES:
        return completion + timedelta(days=interval * 7)
    if frequency in MONTHLY_FREQUENCIES:
        return _shift_months(completion, interval, completion.day)
    if frequency in YEARLY_FREQUENCIES:
        return _shift_years(completion, interval, completion.day)
    raise ValueError(f"Unsupported recurrence frequency: {frequency}")


def _candidate_instant(candidate: date, local_time: time | None) -> datetime:
    return datetime.combine(candidate, local_time or END_OF_DAY)


def next_occurrence(
    *,
    current_due_at_utc: datetime,
    completion_at_utc: datetime,
    current_local_date: date,
    current_local_time: time | None,
    completion_local_date: date,
    completion_local_time: time,
    recurrence_freq: str,
    recurrence_interval: int,
    recurrence_anchor_mode: str,
    recurrence_anchor_day: int | None,
    end_local_date: date | None,
) -> NextLocalDue | None:
    """Return the next naive local due component pair, or None when the series ends.

    The UTC instants are accepted so callers pass the full boundary contract, but
    calendar arithmetic uses only the supplied naive local components. This module
    never converts timezones and never reads the clock.
    """
    if recurrence_freq == "none":
        return None
    if recurrence_interval < 1:
        raise ValueError("recurrence_interval must be at least 1")

    if recurrence_anchor_mode == "completion":
        candidate = _completion_step(
            completion=completion_local_date,
            frequency=recurrence_freq,
            interval=recurrence_interval,
        )
        if end_local_date is not None and candidate > end_local_date:
            return None
        return NextLocalDue(local_date=candidate, local_time=current_local_time)

    if recurrence_anchor_mode != "schedule":
        raise ValueError(f"Unsupported recurrence anchor mode: {recurrence_anchor_mode}")

    completion_boundary = datetime.combine(completion_local_date, completion_local_time)
    candidate = current_local_date
    for _ in range(MAX_ADVANCEMENTS):
        candidate = _schedule_step(
            current=candidate,
            frequency=recurrence_freq,
            interval=recurrence_interval,
            anchor_day=recurrence_anchor_day,
        )
        if end_local_date is not None and candidate > end_local_date:
            return None
        if current_local_time is None:
            if candidate > completion_local_date:
                return NextLocalDue(local_date=candidate, local_time=None)
        elif _candidate_instant(candidate, current_local_time) > completion_boundary:
            return NextLocalDue(local_date=candidate, local_time=current_local_time)

    raise ValueError("Recurrence advancement exceeded the safety limit")
