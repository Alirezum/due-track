from datetime import UTC, date, datetime, timedelta

import pytest

from due_track.domain.status import (
    Bucket,
    classify_bucket,
    summarize_buckets,
)

REFERENCE_TIME = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)
REFERENCE_DATE = date(2026, 11, 5)


def test_item_due_earlier_today_is_overdue() -> None:
    assert (
        classify_bucket(
            due_at_utc=REFERENCE_TIME - timedelta(hours=1),
            due_local_date=REFERENCE_DATE,
            reference_time=REFERENCE_TIME,
            reference_local_date=REFERENCE_DATE,
        )
        is Bucket.OVERDUE
    )


def test_item_due_exactly_now_is_due_today() -> None:
    assert (
        classify_bucket(
            due_at_utc=REFERENCE_TIME,
            due_local_date=REFERENCE_DATE,
            reference_time=REFERENCE_TIME,
            reference_local_date=REFERENCE_DATE,
        )
        is Bucket.DUE_TODAY
    )


def test_date_only_end_of_local_day_remains_due_today() -> None:
    # 2026-11-05 23:59:59.999999 in America/New_York (UTC-5) is 2026-11-06T04:59:59.999999Z.
    assert (
        classify_bucket(
            due_at_utc=datetime(2026, 11, 6, 4, 59, 59, 999999, tzinfo=UTC),
            due_local_date=REFERENCE_DATE,
            reference_time=REFERENCE_TIME,
            reference_local_date=REFERENCE_DATE,
        )
        is Bucket.DUE_TODAY
    )


def test_date_only_value_becomes_overdue_after_local_midnight() -> None:
    after_midnight = datetime(2026, 11, 6, 5, 0, 0, 1, tzinfo=UTC)

    assert (
        classify_bucket(
            due_at_utc=datetime(2026, 11, 6, 4, 59, 59, 999999, tzinfo=UTC),
            due_local_date=REFERENCE_DATE,
            reference_time=after_midnight,
            reference_local_date=date(2026, 11, 6),
        )
        is Bucket.OVERDUE
    )


def test_local_midnight_at_the_reference_instant_is_due_today() -> None:
    local_midnight = datetime(2026, 11, 5, 5, 0, tzinfo=UTC)

    assert (
        classify_bucket(
            due_at_utc=local_midnight,
            due_local_date=REFERENCE_DATE,
            reference_time=local_midnight,
            reference_local_date=REFERENCE_DATE,
        )
        is Bucket.DUE_TODAY
    )


def test_dst_case_uses_supplied_local_date_and_utc_instant_without_conversion() -> None:
    # Boundary supplies post-transition components; the domain only compares them.
    reference_time = datetime(2026, 11, 1, 5, 30, tzinfo=UTC)
    due_at_utc = datetime(2026, 11, 1, 4, 30, tzinfo=UTC)

    assert (
        classify_bucket(
            due_at_utc=due_at_utc,
            due_local_date=date(2026, 11, 1),
            reference_time=reference_time,
            reference_local_date=date(2026, 11, 1),
        )
        is Bucket.OVERDUE
    )


@pytest.mark.parametrize("days_ahead", [1, 2, 3, 4, 5, 6, 7])
def test_upcoming_covers_tomorrow_through_day_seven(days_ahead: int) -> None:
    assert (
        classify_bucket(
            due_at_utc=REFERENCE_TIME + timedelta(days=days_ahead),
            due_local_date=REFERENCE_DATE + timedelta(days=days_ahead),
            reference_time=REFERENCE_TIME,
            reference_local_date=REFERENCE_DATE,
        )
        is Bucket.UPCOMING
    )


def test_day_eight_is_later() -> None:
    assert (
        classify_bucket(
            due_at_utc=REFERENCE_TIME + timedelta(days=8),
            due_local_date=REFERENCE_DATE + timedelta(days=8),
            reference_time=REFERENCE_TIME,
            reference_local_date=REFERENCE_DATE,
        )
        is Bucket.LATER
    )


@pytest.mark.parametrize(
    ("due_at_utc", "due_local_date"),
    [
        (REFERENCE_TIME - timedelta(days=2), REFERENCE_DATE - timedelta(days=2)),
        (REFERENCE_TIME, REFERENCE_DATE),
        (REFERENCE_TIME + timedelta(days=3), REFERENCE_DATE + timedelta(days=3)),
        (REFERENCE_TIME + timedelta(days=30), REFERENCE_DATE + timedelta(days=30)),
    ],
)
def test_every_item_classifies_into_exactly_one_bucket(
    due_at_utc: datetime, due_local_date: date
) -> None:
    bucket = classify_bucket(
        due_at_utc=due_at_utc,
        due_local_date=due_local_date,
        reference_time=REFERENCE_TIME,
        reference_local_date=REFERENCE_DATE,
    )

    assert bucket in set(Bucket)


def test_summary_counts_and_upcoming_total_skip_missing_amounts() -> None:
    summary = summarize_buckets(
        overdue_count=2,
        due_today_count=1,
        upcoming_amounts=(1200, None, 0, 800),
    )

    assert summary.overdue_count == 2
    assert summary.due_today_count == 1
    assert summary.upcoming_total_cents == 2000
