from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from due_track.domain.sorting import sort_items


@dataclass(frozen=True)
class Item:
    title: str
    due_at_utc: datetime
    priority: str


BASE = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)


def test_sorts_by_due_instant_ascending_first() -> None:
    later = Item("Later", BASE + timedelta(hours=2), "critical")
    earlier = Item("Earlier", BASE + timedelta(hours=1), "low")

    assert [item.title for item in sort_items([later, earlier])] == ["Earlier", "Later"]


def test_sorts_priority_descending_within_the_same_due_instant() -> None:
    items = [
        Item("Low", BASE, "low"),
        Item("Critical", BASE, "critical"),
        Item("Medium", BASE, "medium"),
        Item("High", BASE, "high"),
    ]

    assert [item.title for item in sort_items(items)] == [
        "Critical",
        "High",
        "Medium",
        "Low",
    ]


def test_sorts_title_case_insensitively_after_due_and_priority() -> None:
    items = [
        Item("banana", BASE, "high"),
        Item("Apple", BASE, "high"),
        Item("apricot", BASE, "high"),
        Item("Zebra", BASE, "high"),
    ]

    assert [item.title for item in sort_items(items)] == [
        "Apple",
        "apricot",
        "banana",
        "Zebra",
    ]


def test_does_not_mutate_the_input_sequence() -> None:
    items = [
        Item("Second", BASE + timedelta(hours=1), "medium"),
        Item("First", BASE, "medium"),
    ]

    ordered = sort_items(items)

    assert [item.title for item in items] == ["Second", "First"]
    assert [item.title for item in ordered] == ["First", "Second"]


def test_unknown_priority_sorts_below_low() -> None:
    items = [
        Item("Unknown", BASE, "unknown"),
        Item("Low", BASE, "low"),
    ]

    assert [item.title for item in sort_items(items)] == ["Low", "Unknown"]
