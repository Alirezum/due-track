from __future__ import annotations

from zoneinfo import ZoneInfo

from fastapi import APIRouter

from due_track.api.deps import DatabaseDep, NowDep, SettingsDep
from due_track.api.filters import ItemFiltersDep
from due_track.api.schemas import TimelineEntry, TimelineResponse
from due_track.api.serializers import record_to_due_item
from due_track.db.items_repository import list_active_items
from due_track.domain.sorting import sort_key
from due_track.domain.timeline import classify_urgency, seconds_until_due

router = APIRouter(prefix="/timeline", tags=["Timeline"])


@router.get("", response_model=TimelineResponse)
def get_timeline(
    connection: DatabaseDep,
    settings: SettingsDep,
    now: NowDep,
    filters: ItemFiltersDep,
) -> TimelineResponse:
    tz = ZoneInfo(settings.timezone)
    records = list_active_items(
        connection,
        category=filters.category,
        priority=filters.priority,
        recurring=filters.recurring,
        q=filters.q,
    )
    items = [record_to_due_item(record, tz) for record in records]
    items.sort(key=lambda item: (*sort_key(item), item.id))

    entries = [
        TimelineEntry(
            item=item,
            urgency=classify_urgency(due_at_utc=item.due_at_utc, reference_time=now),
            seconds_until_due=seconds_until_due(due_at_utc=item.due_at_utc, reference_time=now),
        )
        for item in items
    ]

    return TimelineResponse(
        reference_time_utc=now,
        timezone=settings.timezone,
        currency_code=settings.currency,
        entries=entries,
    )
