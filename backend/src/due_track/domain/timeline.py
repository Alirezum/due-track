from __future__ import annotations

import math
from datetime import datetime, timedelta
from enum import StrEnum

WITHIN_24_HOURS = timedelta(hours=24)
WITHIN_7_DAYS = timedelta(days=7)


class Urgency(StrEnum):
    """Time-based display band. Priority never changes urgency."""

    OVERDUE = "overdue"
    DUE_NOW = "due_now"
    WITHIN_24H = "within_24h"
    WITHIN_7D = "within_7d"
    LATER = "later"


def classify_urgency(*, due_at_utc: datetime, reference_time: datetime) -> Urgency:
    """Classify a due instant against an explicit reference instant.

    Both arguments must be timezone-aware instants. The function performs no
    timezone conversion and never reads a clock.
    """
    if due_at_utc < reference_time:
        return Urgency.OVERDUE
    if due_at_utc == reference_time:
        return Urgency.DUE_NOW

    delta = due_at_utc - reference_time
    if delta <= WITHIN_24_HOURS:
        return Urgency.WITHIN_24H
    if delta <= WITHIN_7_DAYS:
        return Urgency.WITHIN_7D
    return Urgency.LATER


def seconds_until_due(*, due_at_utc: datetime, reference_time: datetime) -> int:
    """Signed whole seconds between the reference and due instants, floored.

    Positive values are remaining, zero is due now, and negative values are
    elapsed. Flooring never overstates remaining time or understates overdue
    time. The function performs no timezone conversion and never reads a clock.
    """
    return math.floor((due_at_utc - reference_time).total_seconds())
