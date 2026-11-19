from datetime import UTC, date, datetime, time
from pathlib import Path

from due_track.domain.recurrence import NextLocalDue, next_occurrence, remaining_after_completion

MODULE_PATH = Path(__file__).resolve().parents[3] / "src/due_track/domain/recurrence.py"


def _at(year: int, month: int, day: int, hour: int = 12) -> datetime:
    return datetime(year, month, day, hour, tzinfo=UTC)


def advance(
    *,
    current_local_date: date,
    completion_local_date: date,
    frequency: str,
    current_local_time: time | None = None,
    completion_local_time: time = time(12, 0),
    interval: int = 1,
    anchor_mode: str = "schedule",
    anchor_day: int | None = None,
    end_local_date: date | None = None,
) -> NextLocalDue | None:
    return next_occurrence(
        current_due_at_utc=_at(
            current_local_date.year, current_local_date.month, current_local_date.day
        ),
        completion_at_utc=_at(
            completion_local_date.year,
            completion_local_date.month,
            completion_local_date.day,
            completion_local_time.hour,
        ),
        current_local_date=current_local_date,
        current_local_time=current_local_time,
        completion_local_date=completion_local_date,
        completion_local_time=completion_local_time,
        recurrence_freq=frequency,
        recurrence_interval=interval,
        recurrence_anchor_mode=anchor_mode,
        recurrence_anchor_day=anchor_day,
        end_local_date=end_local_date,
    )


def test_non_recurring_item_has_no_next_occurrence() -> None:
    assert (
        advance(
            current_local_date=date(2026, 11, 5),
            completion_local_date=date(2026, 11, 5),
            frequency="none",
        )
        is None
    )


def test_schedule_daily_advances_one_calendar_day() -> None:
    result = advance(
        current_local_date=date(2026, 11, 5),
        completion_local_date=date(2026, 11, 5),
        frequency="daily",
    )

    assert result == NextLocalDue(local_date=date(2026, 11, 6), local_time=None)


def test_custom_daily_and_weekly_intervals_multiply_the_calendar_step() -> None:
    assert advance(
        current_local_date=date(2026, 11, 5),
        completion_local_date=date(2026, 11, 5),
        frequency="custom_days",
        interval=3,
    ) == NextLocalDue(local_date=date(2026, 11, 8), local_time=None)
    assert advance(
        current_local_date=date(2026, 11, 5),
        completion_local_date=date(2026, 11, 5),
        frequency="weekly",
    ) == NextLocalDue(local_date=date(2026, 11, 12), local_time=None)
    assert advance(
        current_local_date=date(2026, 11, 5),
        completion_local_date=date(2026, 11, 5),
        frequency="custom_weeks",
        interval=2,
    ) == NextLocalDue(local_date=date(2026, 11, 19), local_time=None)


def test_schedule_anchor_fast_forwards_past_missed_occurrences() -> None:
    result = advance(
        current_local_date=date(2026, 11, 1),
        completion_local_date=date(2026, 11, 18),
        frequency="daily",
    )

    assert result == NextLocalDue(local_date=date(2026, 11, 19), local_time=None)


def test_early_completion_keeps_the_next_scheduled_occurrence() -> None:
    result = advance(
        current_local_date=date(2026, 11, 18),
        completion_local_date=date(2026, 11, 16),
        frequency="daily",
    )

    assert result == NextLocalDue(local_date=date(2026, 11, 19), local_time=None)


def test_schedule_monthly_clamps_the_anchor_to_the_target_month_end() -> None:
    result = advance(
        current_local_date=date(2026, 1, 31),
        completion_local_date=date(2026, 2, 2),
        frequency="monthly",
        anchor_day=31,
    )

    assert result == NextLocalDue(local_date=date(2026, 2, 28), local_time=None)


def test_schedule_monthly_snaps_back_to_the_anchor_after_a_clamped_month() -> None:
    result = advance(
        current_local_date=date(2026, 2, 28),
        completion_local_date=date(2026, 3, 1),
        frequency="monthly",
        anchor_day=31,
    )

    assert result == NextLocalDue(local_date=date(2026, 3, 31), local_time=None)


def test_custom_monthly_interval_moves_by_multiple_calendar_months() -> None:
    result = advance(
        current_local_date=date(2026, 1, 31),
        completion_local_date=date(2026, 2, 1),
        frequency="custom_months",
        interval=2,
        anchor_day=31,
    )

    assert result == NextLocalDue(local_date=date(2026, 3, 31), local_time=None)


def test_schedule_yearly_clamps_february_29_in_non_leap_years() -> None:
    result = advance(
        current_local_date=date(2024, 2, 29),
        completion_local_date=date(2024, 3, 1),
        frequency="yearly",
        anchor_day=29,
    )

    assert result == NextLocalDue(local_date=date(2025, 2, 28), local_time=None)


def test_schedule_yearly_lands_on_february_29_in_leap_years() -> None:
    result = advance(
        current_local_date=date(2027, 2, 28),
        completion_local_date=date(2028, 2, 1),
        frequency="yearly",
        anchor_day=29,
    )

    assert result == NextLocalDue(local_date=date(2028, 2, 29), local_time=None)


def test_custom_yearly_interval_moves_by_multiple_calendar_years() -> None:
    result = advance(
        current_local_date=date(2024, 2, 29),
        completion_local_date=date(2024, 3, 1),
        frequency="custom_years",
        interval=2,
        anchor_day=29,
    )

    assert result == NextLocalDue(local_date=date(2026, 2, 28), local_time=None)


def test_completion_anchored_daily_advances_from_the_completion_date() -> None:
    result = advance(
        current_local_date=date(2026, 1, 31),
        completion_local_date=date(2026, 2, 10),
        frequency="daily",
        anchor_mode="completion",
    )

    assert result == NextLocalDue(local_date=date(2026, 2, 11), local_time=None)


def test_completion_anchored_monthly_uses_the_completion_day() -> None:
    result = advance(
        current_local_date=date(2026, 1, 31),
        completion_local_date=date(2026, 2, 10),
        frequency="monthly",
        anchor_mode="completion",
    )

    assert result == NextLocalDue(local_date=date(2026, 3, 10), local_time=None)


def test_completion_anchored_monthly_clamps_to_the_target_month_end() -> None:
    result = advance(
        current_local_date=date(2026, 1, 31),
        completion_local_date=date(2026, 3, 31),
        frequency="monthly",
        anchor_mode="completion",
    )

    assert result == NextLocalDue(local_date=date(2026, 4, 30), local_time=None)


def test_completion_anchored_yearly_clamps_february_29() -> None:
    result = advance(
        current_local_date=date(2024, 2, 29),
        completion_local_date=date(2024, 2, 29),
        frequency="yearly",
        anchor_mode="completion",
    )

    assert result == NextLocalDue(local_date=date(2025, 2, 28), local_time=None)


def test_timed_items_preserve_the_original_local_time_of_day() -> None:
    result = advance(
        current_local_date=date(2026, 11, 5),
        current_local_time=time(9, 30),
        completion_local_date=date(2026, 11, 5),
        completion_local_time=time(10, 0),
        frequency="daily",
    )

    assert result == NextLocalDue(local_date=date(2026, 11, 6), local_time=time(9, 30))


def test_date_only_items_compare_against_the_end_of_the_local_day() -> None:
    result = advance(
        current_local_date=date(2026, 11, 5),
        completion_local_date=date(2026, 11, 5),
        completion_local_time=time(23, 59),
        frequency="daily",
    )

    assert result == NextLocalDue(local_date=date(2026, 11, 6), local_time=None)


def test_inclusive_end_date_rejects_the_first_candidate_after_it() -> None:
    result = advance(
        current_local_date=date(2026, 11, 29),
        completion_local_date=date(2026, 11, 30),
        frequency="daily",
        end_local_date=date(2026, 11, 30),
    )

    assert result is None


def test_inclusive_end_date_accepts_a_candidate_on_the_end_date() -> None:
    result = advance(
        current_local_date=date(2026, 11, 30),
        completion_local_date=date(2026, 11, 30),
        frequency="daily",
        end_local_date=date(2026, 12, 1),
    )

    assert result == NextLocalDue(local_date=date(2026, 12, 1), local_time=None)


def test_remaining_count_decrements_and_reaches_zero_only_when_the_series_ends() -> None:
    assert remaining_after_completion(None) is None
    assert remaining_after_completion(5) == 4
    assert remaining_after_completion(2) == 1
    assert remaining_after_completion(1) == 0


def test_recurrence_module_never_converts_timezones_or_reads_the_clock() -> None:
    source = MODULE_PATH.read_text(encoding="utf-8")

    assert "ZoneInfo" not in source
    assert "astimezone" not in source
    assert "datetime.now" not in source
