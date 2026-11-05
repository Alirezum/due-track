from datetime import UTC, date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from due_track.api.time import (
    end_of_local_day_to_utc,
    local_to_utc,
    parse_due_input,
    recurrence_end_date_to_utc,
    recurrence_end_utc_to_local_date,
    utc_to_local,
    utc_to_local_date,
    utc_to_local_time,
)

NEW_YORK = ZoneInfo("America/New_York")


def test_date_only_input_uses_end_of_local_day() -> None:
    parsed = parse_due_input({"kind": "date", "date": date(2026, 11, 5)}, NEW_YORK)

    assert parsed.is_date_only is True
    assert parsed.due_local_date == date(2026, 11, 5)
    assert parsed.due_local_time is None
    assert parsed.due_at_utc == datetime(2026, 11, 6, 4, 59, 59, 999999, tzinfo=UTC)


def test_date_only_input_respects_dst_transition() -> None:
    parsed = parse_due_input({"kind": "date", "date": "2026-03-08"}, NEW_YORK)

    assert parsed.due_at_utc == datetime(2026, 3, 9, 3, 59, 59, 999999, tzinfo=UTC)


def test_timed_input_is_converted_to_utc_and_exposes_local_parts() -> None:
    parsed = parse_due_input(
        {
            "kind": "datetime",
            "at": datetime(2026, 11, 5, 9, 30, tzinfo=timezone(timedelta(hours=-5))),
        },
        NEW_YORK,
    )

    assert parsed.is_date_only is False
    assert parsed.due_at_utc == datetime(2026, 11, 5, 14, 30, tzinfo=UTC)
    assert parsed.due_local_date == date(2026, 11, 5)
    assert parsed.due_local_time == time(9, 30)


def test_timed_input_accepts_iso_string() -> None:
    parsed = parse_due_input({"kind": "datetime", "at": "2026-11-05T09:30:00Z"}, NEW_YORK)

    assert parsed.due_at_utc == datetime(2026, 11, 5, 9, 30, tzinfo=UTC)
    assert parsed.due_local_date == date(2026, 11, 5)
    assert parsed.due_local_time == time(4, 30)


def test_timed_input_rejects_naive_datetime() -> None:
    with pytest.raises(ValueError, match="explicit offset"):
        parse_due_input(
            {"kind": "datetime", "at": datetime(2026, 11, 5, 9, 30)},
            NEW_YORK,
        )


def test_parse_due_input_rejects_unknown_kind() -> None:
    with pytest.raises(ValueError, match="date or datetime"):
        parse_due_input({"kind": "other"}, NEW_YORK)


def test_recurrence_end_date_round_trips_at_end_of_local_day() -> None:
    end_at_utc = recurrence_end_date_to_utc(date(2026, 11, 30), NEW_YORK)

    assert end_at_utc == datetime(2026, 12, 1, 4, 59, 59, 999999, tzinfo=UTC)
    assert recurrence_end_utc_to_local_date(end_at_utc, NEW_YORK) == date(2026, 11, 30)


def test_end_of_local_day_matches_recurrence_end_conversion() -> None:
    local_date = date(2026, 3, 8)

    assert end_of_local_day_to_utc(local_date, NEW_YORK) == recurrence_end_date_to_utc(
        local_date, NEW_YORK
    )


def test_utc_to_local_helpers_expose_boundary_components() -> None:
    instant = datetime(2026, 11, 6, 4, 59, 59, 999999, tzinfo=UTC)

    assert utc_to_local(instant, NEW_YORK) == datetime(
        2026, 11, 5, 23, 59, 59, 999999, tzinfo=NEW_YORK
    )
    assert utc_to_local_date(instant, NEW_YORK) == date(2026, 11, 5)
    assert utc_to_local_time(instant, NEW_YORK) == time(23, 59, 59, 999999)


def test_local_to_utc_converts_naive_local_calendar_value() -> None:
    local_value = datetime(2026, 11, 5, 23, 59, 59, 999999)

    assert local_to_utc(local_value, NEW_YORK) == datetime(
        2026, 11, 6, 4, 59, 59, 999999, tzinfo=UTC
    )


def test_local_to_utc_rejects_aware_value() -> None:
    with pytest.raises(ValueError, match="naive"):
        local_to_utc(datetime(2026, 11, 5, 23, 59, tzinfo=UTC), NEW_YORK)
