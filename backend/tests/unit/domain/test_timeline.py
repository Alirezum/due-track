from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

import pytest

from due_track.domain.timeline import Urgency, classify_urgency, seconds_until_due

NOW = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)
DAY = timedelta(days=1)
HOUR = timedelta(hours=1)


@pytest.mark.parametrize(
    ("due_at_utc", "expected"),
    [
        (NOW - timedelta(seconds=1), Urgency.OVERDUE),
        (NOW - timedelta(microseconds=1), Urgency.OVERDUE),
        (NOW, Urgency.DUE_NOW),
        (NOW + timedelta(microseconds=1), Urgency.WITHIN_24H),
        (NOW + timedelta(seconds=1), Urgency.WITHIN_24H),
        (NOW + 24 * HOUR, Urgency.WITHIN_24H),
        (NOW + 24 * HOUR + timedelta(microseconds=1), Urgency.WITHIN_7D),
        (NOW + 7 * DAY, Urgency.WITHIN_7D),
        (NOW + 7 * DAY + timedelta(microseconds=1), Urgency.LATER),
        (NOW + 365 * DAY, Urgency.LATER),
    ],
)
def test_classify_urgency_boundaries(due_at_utc: datetime, expected: Urgency) -> None:
    assert classify_urgency(due_at_utc=due_at_utc, reference_time=NOW) is expected


def test_classify_date_only_instant_at_end_of_local_day() -> None:
    # 2026-11-05 23:59:59.999999 in America/New_York (EST, UTC-5).
    due = datetime(2026, 11, 6, 4, 59, 59, 999999, tzinfo=UTC)
    reference = datetime(2026, 11, 6, 4, 59, 59, 999998, tzinfo=UTC)

    assert classify_urgency(due_at_utc=due, reference_time=reference) is Urgency.WITHIN_24H
    assert classify_urgency(due_at_utc=due, reference_time=due) is Urgency.DUE_NOW
    assert seconds_until_due(due_at_utc=due, reference_time=reference) == 0


def test_domain_functions_do_not_convert_timezones() -> None:
    same_instant = NOW.astimezone(timezone(timedelta(hours=2)))

    assert classify_urgency(due_at_utc=same_instant, reference_time=NOW) is Urgency.DUE_NOW
    assert seconds_until_due(due_at_utc=same_instant, reference_time=NOW) == 0


@pytest.mark.parametrize(
    ("delta", "expected"),
    [
        (timedelta(seconds=90, microseconds=900000), 90),
        (timedelta(seconds=59, microseconds=900000), 59),
        (timedelta(0), 0),
        (timedelta(microseconds=-1), -1),
        (timedelta(seconds=-90, microseconds=-100000), -91),
        (24 * HOUR + timedelta(microseconds=1), 86400),
        (7 * DAY + timedelta(microseconds=1), 604800),
    ],
)
def test_seconds_until_due_is_signed_and_floored(delta: timedelta, expected: int) -> None:
    assert seconds_until_due(due_at_utc=NOW + delta, reference_time=NOW) == expected


def test_zero_seconds_only_at_equality() -> None:
    assert seconds_until_due(due_at_utc=NOW, reference_time=NOW) == 0
    assert seconds_until_due(due_at_utc=NOW + timedelta(microseconds=1), reference_time=NOW) == 0
    assert seconds_until_due(due_at_utc=NOW - timedelta(microseconds=1), reference_time=NOW) == -1
