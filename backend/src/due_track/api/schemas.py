from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Priority = Literal["low", "medium", "high", "critical"]
RecurrenceFrequency = Literal[
    "none",
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "custom_days",
    "custom_weeks",
    "custom_months",
    "custom_years",
]
AnchorMode = Literal["schedule", "completion"]
ItemStatus = Literal["active", "completed", "deleted"]

FIXED_FREQUENCIES = {"daily", "weekly", "monthly", "yearly"}
DAY_OR_WEEK_FREQUENCIES = {"daily", "weekly", "custom_days", "custom_weeks"}
MONTH_OR_YEAR_FREQUENCIES = {"monthly", "yearly", "custom_months", "custom_years"}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DateOnlyDueInput(StrictModel):
    kind: Literal["date"]
    date: date


class TimedDueInput(StrictModel):
    kind: Literal["datetime"]
    at: datetime

    @field_validator("at")
    @classmethod
    def require_explicit_offset(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Timed due input must include an explicit UTC offset")
        return value


DueInput = Annotated[DateOnlyDueInput | TimedDueInput, Field(discriminator="kind")]


def validate_recurrence_policy(
    *,
    recurrence_freq: RecurrenceFrequency,
    recurrence_interval: int,
    recurrence_anchor_mode: AnchorMode,
    recurrence_anchor_day: int | None,
    recurrence_end_date: date | None,
    recurrence_remaining_count: int | None,
) -> None:
    if recurrence_interval < 1:
        raise ValueError("recurrence_interval must be at least 1")

    if recurrence_freq == "none":
        if recurrence_interval != 1:
            raise ValueError("one-time items must use recurrence_interval 1")
        if recurrence_anchor_mode != "schedule":
            raise ValueError("one-time items must use schedule anchor mode")
        if recurrence_anchor_day is not None:
            raise ValueError("one-time items must not set recurrence_anchor_day")
        if recurrence_end_date is not None or recurrence_remaining_count is not None:
            raise ValueError("one-time items must not set recurrence end conditions")
        return

    if recurrence_end_date is not None and recurrence_remaining_count is not None:
        raise ValueError(
            "recurrence_end_date and recurrence_remaining_count are mutually exclusive"
        )

    if recurrence_freq in FIXED_FREQUENCIES and recurrence_interval != 1:
        raise ValueError("fixed recurrence frequencies require recurrence_interval 1")

    if recurrence_freq in DAY_OR_WEEK_FREQUENCIES and recurrence_anchor_day is not None:
        raise ValueError("day and week recurrences must not set recurrence_anchor_day")

    if recurrence_anchor_mode == "completion" and recurrence_anchor_day is not None:
        raise ValueError("completion-anchored recurrences must not set recurrence_anchor_day")

    if (
        recurrence_anchor_mode == "schedule"
        and recurrence_freq in MONTH_OR_YEAR_FREQUENCIES
        and recurrence_anchor_day is None
    ):
        raise ValueError("schedule-anchored month/year recurrences require recurrence_anchor_day")


def _trimmed(value: str, *, label: str, minimum: int, maximum: int) -> str:
    trimmed = value.strip()
    if not minimum <= len(trimmed) <= maximum:
        raise ValueError(f"{label} must be {minimum}-{maximum} characters after trimming")
    return trimmed


class ItemCreate(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    due: DueInput
    notes: str = Field(default="", max_length=10000)
    category: str | None = Field(default=None, min_length=1, max_length=50)
    priority: Priority = "medium"
    amount_cents: int | None = Field(default=None, ge=0)
    recurrence_freq: RecurrenceFrequency = "none"
    recurrence_interval: int = Field(default=1, ge=1)
    recurrence_anchor_mode: AnchorMode = "schedule"
    recurrence_anchor_day: int | None = Field(default=None, ge=1, le=31)
    recurrence_end_date: date | None = None
    recurrence_remaining_count: int | None = Field(default=None, ge=1)

    @field_validator("title")
    @classmethod
    def trim_title(cls, value: str) -> str:
        return _trimmed(value, label="title", minimum=1, maximum=200)

    @field_validator("category")
    @classmethod
    def trim_category(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _trimmed(value, label="category", minimum=1, maximum=50)

    @model_validator(mode="after")
    def check_recurrence_policy(self) -> Self:
        validate_recurrence_policy(
            recurrence_freq=self.recurrence_freq,
            recurrence_interval=self.recurrence_interval,
            recurrence_anchor_mode=self.recurrence_anchor_mode,
            recurrence_anchor_day=self.recurrence_anchor_day,
            recurrence_end_date=self.recurrence_end_date,
            recurrence_remaining_count=self.recurrence_remaining_count,
        )
        return self


class ItemUpdate(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    due: DueInput | None = None
    notes: str | None = Field(default=None, max_length=10000)
    category: str | None = Field(default=None, min_length=1, max_length=50)
    priority: Priority | None = None
    amount_cents: int | None = Field(default=None, ge=0)
    recurrence_freq: RecurrenceFrequency | None = None
    recurrence_interval: int | None = Field(default=None, ge=1)
    recurrence_anchor_mode: AnchorMode | None = None
    recurrence_anchor_day: int | None = Field(default=None, ge=1, le=31)
    recurrence_end_date: date | None = None
    recurrence_remaining_count: int | None = Field(default=None, ge=1)

    @field_validator("title")
    @classmethod
    def trim_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _trimmed(value, label="title", minimum=1, maximum=200)

    @field_validator("category")
    @classmethod
    def trim_category(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _trimmed(value, label="category", minimum=1, maximum=50)

    @model_validator(mode="after")
    def check_update_fields(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")

        non_nullable = {
            "title",
            "due",
            "notes",
            "priority",
            "recurrence_freq",
            "recurrence_interval",
            "recurrence_anchor_mode",
        }
        for field_name in non_nullable & self.model_fields_set:
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name} cannot be null")

        if (
            "recurrence_end_date" in self.model_fields_set
            and "recurrence_remaining_count" in self.model_fields_set
            and self.recurrence_end_date is not None
            and self.recurrence_remaining_count is not None
        ):
            raise ValueError(
                "recurrence_end_date and recurrence_remaining_count are mutually exclusive"
            )
        return self


class DueItem(StrictModel):
    id: int
    title: str
    notes: str
    due_at_utc: datetime
    is_date_only: bool
    due_local_date: date
    due_local_time: str | None = Field(default=None, pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$")
    category: str | None
    priority: Priority
    amount_cents: int | None
    recurrence_freq: RecurrenceFrequency
    recurrence_interval: int
    recurrence_anchor_mode: AnchorMode
    recurrence_anchor_day: int | None
    recurrence_end_date: date | None
    recurrence_remaining_count: int | None
    status: ItemStatus
    is_recurring: bool
    created_at_utc: datetime
    updated_at_utc: datetime


class DashboardSummary(StrictModel):
    overdue_count: int = Field(ge=0)
    due_today_count: int = Field(ge=0)
    upcoming_total_cents: int = Field(ge=0)


class Buckets(StrictModel):
    overdue: list[DueItem]
    due_today: list[DueItem]
    upcoming: list[DueItem]
    later: list[DueItem]


class ItemListResponse(StrictModel):
    buckets: Buckets
    summary: DashboardSummary
    currency_code: str
    timezone: str
