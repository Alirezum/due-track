from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from enum import StrEnum

UPCOMING_WINDOW_DAYS = 7


class Bucket(StrEnum):
    OVERDUE = "overdue"
    DUE_TODAY = "due_today"
    UPCOMING = "upcoming"
    LATER = "later"


@dataclass(frozen=True, slots=True)
class BucketSummary:
    overdue_count: int
    due_today_count: int
    upcoming_total_cents: int


def classify_bucket(
    *,
    due_at_utc: datetime,
    due_local_date: date,
    reference_time: datetime,
    reference_local_date: date,
) -> Bucket:
    """Classify one active item using UTC instants and boundary-supplied local dates.

    The caller supplies every local component; this function performs no timezone
    conversion and never reads the system clock.
    """
    if due_at_utc < reference_time:
        return Bucket.OVERDUE
    if due_local_date <= reference_local_date:
        return Bucket.DUE_TODAY
    if due_local_date <= reference_local_date + timedelta(days=UPCOMING_WINDOW_DAYS):
        return Bucket.UPCOMING
    return Bucket.LATER


def summarize_buckets(
    *,
    overdue_count: int,
    due_today_count: int,
    upcoming_amounts: Iterable[int | None],
) -> BucketSummary:
    """Summarize the filtered result set; missing amounts are excluded, zero is kept."""
    total = sum(amount for amount in upcoming_amounts if amount is not None)
    return BucketSummary(
        overdue_count=overdue_count,
        due_today_count=due_today_count,
        upcoming_total_cents=total,
    )
