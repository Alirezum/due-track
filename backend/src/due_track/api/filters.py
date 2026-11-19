from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Query

from due_track.api.schemas import Priority


@dataclass(frozen=True, slots=True)
class ItemFilters:
    category: str | None = None
    priority: Priority | None = None
    recurring: bool | None = None
    q: str | None = None


def get_item_filters(
    category: Annotated[str | None, Query(min_length=1, max_length=50)] = None,
    priority: Annotated[Priority | None, Query()] = None,
    recurring: Annotated[bool | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
) -> ItemFilters:
    return ItemFilters(
        category=category.strip() or None if category is not None else None,
        priority=priority,
        recurring=recurring,
        q=q.strip() or None if q is not None else None,
    )


ItemFiltersDep = Annotated[ItemFilters, Depends(get_item_filters)]
