from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

CONTRACT_PATH = (
    Path(__file__).resolve().parents[4]
    / "specs"
    / "001-due-track-v1"
    / "contracts"
    / "openapi.yaml"
)
IGNORED_METHODS = {"head", "options"}


def _load_contract() -> dict[str, Any]:
    return yaml.safe_load(CONTRACT_PATH.read_text(encoding="utf-8"))


def _documented_operations(contract: dict[str, Any]) -> set[tuple[str, str]]:
    operations: set[tuple[str, str]] = set()
    for path, path_item in contract["paths"].items():
        for method in path_item:
            if method in {"parameters", "$ref"}:
                continue
            operations.add((path, method.lower()))
    return operations


def _app_operations(app: FastAPI) -> set[tuple[str, str]]:
    operations: set[tuple[str, str]] = set()
    for path, path_item in app.openapi()["paths"].items():
        for method in path_item:
            if method in {"parameters", "$ref"}:
                continue
            normalized = method.lower()
            if normalized in IGNORED_METHODS:
                continue
            operations.add((path, normalized))
    return operations


def _validator(contract: dict[str, Any], schema_name: str) -> Draft202012Validator:
    registry = Registry().with_resource(
        "urn:due-track:contract",
        Resource.from_contents(contract, default_specification=DRAFT202012),
    )
    return Draft202012Validator(
        {"$ref": f"urn:due-track:contract#/components/schemas/{schema_name}"},
        registry=registry,
    )


def _assert_schema(contract: dict[str, Any], schema_name: str, body: Any) -> None:
    _validator(contract, schema_name).validate(body)


def test_every_documented_operation_exists_in_the_app(app: FastAPI) -> None:
    contract = _load_contract()

    documented = _documented_operations(contract)
    implemented = _app_operations(app)

    assert documented <= implemented, f"Missing operations: {sorted(documented - implemented)}"
    assert implemented <= documented, f"Undocumented operations: {sorted(implemented - documented)}"


def test_every_documented_path_is_under_api(app: FastAPI) -> None:
    documented = {path for path, _ in _documented_operations(_load_contract())}
    implemented = {path for path, _ in _app_operations(app)}

    assert documented
    assert implemented
    assert all(path.startswith("/api") for path in documented | implemented), sorted(
        documented | implemented
    )


def test_representative_responses_match_documented_schemas(client: TestClient) -> None:
    contract = _load_contract()

    created = client.post(
        "/api/items",
        json={
            "title": "Contract check",
            "notes": "Validated against the published OpenAPI document.",
            "due": {"kind": "date", "date": "2026-11-06"},
            "category": "Bills",
            "priority": "high",
            "amount_cents": 1250,
        },
    )
    assert created.status_code == 201, created.text
    created_body = created.json()
    _assert_schema(contract, "DueItem", created_body)

    listing = client.get("/api/items", params={"q": "Contract", "category": "Bills"})
    assert listing.status_code == 200, listing.text
    _assert_schema(contract, "ItemListResponse", listing.json())

    completed = client.post(f"/api/items/{created_body['id']}/complete")
    assert completed.status_code == 200, completed.text
    completed_body = completed.json()
    _assert_schema(contract, "CompleteResponse", completed_body)

    history = client.get("/api/history")
    assert history.status_code == 200, history.text
    _assert_schema(contract, "HistoryResponse", history.json())

    undone = client.post(f"/api/history/{completed_body['log']['id']}/undo")
    assert undone.status_code == 200, undone.text
    _assert_schema(contract, "UndoResponse", undone.json())

    missing = client.delete("/api/items/999999")
    assert missing.status_code == 404, missing.text
    _assert_schema(contract, "Error", missing.json())
