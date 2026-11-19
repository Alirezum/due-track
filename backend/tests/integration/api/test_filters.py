from collections.abc import Iterable
from typing import Any

from fastapi.testclient import TestClient

BUCKET_NAMES = ("overdue", "due_today", "upcoming", "later")


def _item_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "title": "Deadline",
        "due": {"kind": "date", "date": "2026-11-05"},
    }
    payload.update(overrides)
    return payload


def _create(client: TestClient, **overrides: Any) -> dict[str, Any]:
    response = client.post("/api/items", json=_item_payload(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


def _titles(body: dict[str, Any]) -> set[str]:
    return {item["title"] for name in BUCKET_NAMES for item in body["buckets"][name]}


def _all_items(body: dict[str, Any]) -> Iterable[dict[str, Any]]:
    for name in BUCKET_NAMES:
        yield from body["buckets"][name]


def _seed(client: TestClient) -> None:
    _create(
        client,
        title="Overdue bill",
        due={"kind": "datetime", "at": "2026-11-05T06:00:00-05:00"},
        category="Bills",
        priority="high",
        notes="Electric bill for November",
    )
    _create(
        client,
        title="Dentist",
        category="Health",
        priority="low",
        notes="Ask about the crown",
    )
    _create(
        client,
        title="Rent",
        due={"kind": "date", "date": "2026-11-06"},
        category="Bills",
        priority="critical",
        amount_cents=120000,
        notes="Apartment 4B",
        recurrence_freq="monthly",
    )
    _create(
        client,
        title="Gym membership",
        due={"kind": "date", "date": "2026-11-07"},
        priority="medium",
        recurrence_freq="weekly",
    )
    _create(
        client,
        title="Tax return",
        due={"kind": "date", "date": "2026-11-13"},
        category="Taxes",
        priority="critical",
        notes="Gather receipts for the accountant",
    )
    _create(
        client,
        title="Streaming",
        due={"kind": "date", "date": "2026-12-01"},
        category="Bills",
        priority="low",
        notes="Yearly plan renewal",
        recurrence_freq="monthly",
    )


def test_category_filter_is_case_insensitive_and_exact(client: TestClient) -> None:
    _seed(client)

    bills = client.get("/api/items", params={"category": "bills"})
    assert bills.status_code == 200
    assert _titles(bills.json()) == {"Overdue bill", "Rent", "Streaming"}

    mixed_case = client.get("/api/items", params={"category": "BiLlS"})
    assert _titles(mixed_case.json()) == {"Overdue bill", "Rent", "Streaming"}

    partial = client.get("/api/items", params={"category": "bill"})
    assert _titles(partial.json()) == set()


def test_priority_filter_keeps_only_the_selected_priority(client: TestClient) -> None:
    _seed(client)

    body = client.get("/api/items", params={"priority": "critical"}).json()

    assert _titles(body) == {"Rent", "Tax return"}
    assert {item["priority"] for item in _all_items(body)} == {"critical"}


def test_recurring_filter_selects_recurring_and_one_time_items(client: TestClient) -> None:
    _seed(client)

    recurring = client.get("/api/items", params={"recurring": "true"}).json()
    assert _titles(recurring) == {"Rent", "Gym membership", "Streaming"}
    assert all(item["is_recurring"] is True for item in _all_items(recurring))

    one_time = client.get("/api/items", params={"recurring": "false"}).json()
    assert _titles(one_time) == {"Overdue bill", "Dentist", "Tax return"}
    assert all(item["is_recurring"] is False for item in _all_items(one_time))


def test_search_matches_titles_and_notes_case_insensitively(client: TestClient) -> None:
    _seed(client)

    by_notes = client.get("/api/items", params={"q": "ELECTRIC"})
    assert _titles(by_notes.json()) == {"Overdue bill"}

    by_title = client.get("/api/items", params={"q": "return"})
    assert _titles(by_title.json()) == {"Tax return"}

    partial_in_notes = client.get("/api/items", params={"q": "pla"})
    assert _titles(partial_in_notes.json()) == {"Streaming"}

    across_fields = client.get("/api/items", params={"q": "apartment"})
    assert _titles(across_fields.json()) == {"Rent"}


def test_search_treats_like_wildcards_as_literal_text(client: TestClient) -> None:
    _create(client, title="100% complete")
    _create(client, title="Under_score")
    _create(client, title="Ordinary")

    percent = client.get("/api/items", params={"q": "%"})
    assert _titles(percent.json()) == {"100% complete"}

    underscore = client.get("/api/items", params={"q": "_"})
    assert _titles(underscore.json()) == {"Under_score"}


def test_filters_combine_with_and_semantics(client: TestClient) -> None:
    _seed(client)

    combined = client.get(
        "/api/items",
        params={
            "category": "bills",
            "priority": "critical",
            "recurring": "true",
            "q": "rent",
        },
    )

    assert combined.status_code == 200
    assert _titles(combined.json()) == {"Rent"}

    conflict = client.get(
        "/api/items",
        params={"category": "bills", "priority": "medium"},
    )
    assert _titles(conflict.json()) == set()


def test_omitting_filters_returns_the_full_active_set(client: TestClient) -> None:
    _seed(client)

    full = client.get("/api/items").json()
    assert _titles(full) == {
        "Overdue bill",
        "Dentist",
        "Rent",
        "Gym membership",
        "Tax return",
        "Streaming",
    }

    cleared = client.get("/api/items", params={"q": ""}).json()
    assert _titles(cleared) == _titles(full)


def test_no_matches_returns_empty_buckets_and_zero_summary(client: TestClient) -> None:
    _seed(client)

    body = client.get("/api/items", params={"q": "nothing-matches-this"}).json()

    assert {name: body["buckets"][name] for name in BUCKET_NAMES} == {
        name: [] for name in BUCKET_NAMES
    }
    assert body["summary"] == {
        "overdue_count": 0,
        "due_today_count": 0,
        "upcoming_total_cents": 0,
    }


def test_summary_matches_the_filtered_buckets(client: TestClient) -> None:
    _seed(client)

    body = client.get("/api/items", params={"category": "bills"}).json()

    assert body["summary"]["overdue_count"] == len(body["buckets"]["overdue"]) == 1
    assert body["summary"]["due_today_count"] == len(body["buckets"]["due_today"]) == 0
    assert body["summary"]["upcoming_total_cents"] == sum(
        item["amount_cents"] or 0 for item in body["buckets"]["upcoming"]
    )

    upcoming = client.get("/api/items", params={"recurring": "true"}).json()
    assert upcoming["summary"]["upcoming_total_cents"] == 120000
    assert upcoming["summary"]["overdue_count"] == 0


def test_invalid_filter_values_are_rejected(client: TestClient) -> None:
    assert client.get("/api/items", params={"priority": "urgent"}).status_code == 422
    assert client.get("/api/items", params={"category": ""}).status_code == 422
    assert client.get("/api/items", params={"q": "x" * 201}).status_code == 422


def test_scope_defaults_to_all_and_accepts_both_values(client: TestClient) -> None:
    _seed(client)

    default = client.get("/api/items")
    explicit_all = client.get("/api/items", params={"scope": "all"})
    upcoming = client.get("/api/items", params={"scope": "upcoming"})

    assert default.status_code == 200
    assert explicit_all.status_code == 200
    assert upcoming.status_code == 200
    assert default.json()["buckets"] == explicit_all.json()["buckets"]
    assert default.json()["summary"] == explicit_all.json()["summary"]
    assert default.json()["buckets"]["overdue"]


def test_invalid_scope_is_rejected_by_both_read_endpoints(client: TestClient) -> None:
    assert client.get("/api/items", params={"scope": "someday"}).status_code == 422
    assert client.get("/api/timeline", params={"scope": "someday"}).status_code == 422
