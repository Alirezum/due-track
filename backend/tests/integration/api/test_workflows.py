from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient


def _create(client: TestClient, **overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "title": "Renew passport",
        "notes": "Book the appointment before the trip.",
        "due": {"kind": "date", "date": "2026-11-06"},
        "category": "Personal",
        "priority": "high",
        "amount_cents": 9500,
    }
    payload.update(overrides)
    response = client.post("/api/items", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _titles(response_body: dict[str, Any]) -> list[str]:
    return [item["title"] for items in response_body["buckets"].values() for item in items]


def _complete(client: TestClient, item_id: int) -> dict[str, Any]:
    response = client.post(f"/api/items/{item_id}/complete")
    assert response.status_code == 200, response.text
    return response.json()


def test_full_deadline_lifecycle_across_stories(client: TestClient) -> None:
    passport = _create(client)
    passport_id = passport["id"]

    filtered = client.get(
        "/api/items",
        params={"q": "passport", "category": "personal", "priority": "high"},
    )
    assert filtered.status_code == 200, filtered.text
    assert _titles(filtered.json()) == ["Renew passport"]

    passport_completion = _complete(client, passport_id)
    assert passport_completion["item"] is None
    passport_log_id = passport_completion["log"]["id"]

    bill = _create(client, title="Pay water bill", category="Home", amount_cents=4200)
    bill_completion = _complete(client, bill["id"])
    bill_log_id = bill_completion["log"]["id"]

    history = client.get("/api/history")
    assert history.status_code == 200, history.text
    history_body = history.json()
    assert history_body["total"] == 2
    passport_entry = next(
        entry for entry in history_body["entries"] if entry["id"] == passport_log_id
    )
    assert passport_entry["previous_state"]["title"] == "Renew passport"
    assert passport_entry["can_undo"] is True

    undone = client.post(f"/api/history/{passport_log_id}/undo")
    assert undone.status_code == 200, undone.text
    undo_body = undone.json()
    assert undo_body["restored_item"]["id"] == passport_id
    assert undo_body["restored_item"]["status"] == "active"
    assert undo_body["preserved_touched_occurrence"] is False
    assert undo_body["warning"] is None

    after_undo = client.get("/api/history")
    assert after_undo.status_code == 200, after_undo.text
    assert after_undo.json()["total"] == 1
    assert after_undo.json()["entries"][0]["id"] == bill_log_id

    deleted_item = client.delete(f"/api/items/{passport_id}")
    assert deleted_item.status_code == 204, deleted_item.text

    after_delete = client.get("/api/items", params={"q": "passport"})
    assert after_delete.status_code == 200, after_delete.text
    assert _titles(after_delete.json()) == []

    deleted_history = client.delete(f"/api/history/{bill_log_id}")
    assert deleted_history.status_code == 204, deleted_history.text
    assert client.get("/api/history").json() == {"entries": [], "total": 0}
