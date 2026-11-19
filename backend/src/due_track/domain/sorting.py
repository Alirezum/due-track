from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import Protocol

PRIORITY_RANK = {
    "low": 0,
    "medium": 1,
    "high": 2,
    "critical": 3,
}


class SortableItem(Protocol):
    @property
    def due_at_utc(self) -> datetime: ...

    @property
    def priority(self) -> str: ...

    @property
    def title(self) -> str: ...


def sort_key(item: SortableItem) -> tuple[datetime, int, str]:
    """Due instant ascending, priority descending, then case-insensitive title."""
    return (
        item.due_at_utc,
        -PRIORITY_RANK.get(item.priority, -1),
        item.title.casefold(),
    )


def sort_items[ItemT: SortableItem](items: Iterable[ItemT]) -> list[ItemT]:
    return sorted(items, key=sort_key)
