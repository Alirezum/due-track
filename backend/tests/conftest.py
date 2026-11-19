from __future__ import annotations

from collections.abc import Generator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from due_track.api.app import create_app
from due_track.config import Settings
from due_track.db.connection import connect
from due_track.db.migrate import apply_migrations

FIXED_NOW = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)


@pytest.fixture
def fixed_clock() -> datetime:
    return FIXED_NOW


@pytest.fixture
def app_settings(tmp_path: Path, fixed_clock: datetime) -> Settings:
    return Settings(
        db_path=tmp_path / "due-track.sqlite3",
        timezone="America/New_York",
        currency="USD",
        host="127.0.0.1",
        port=8000,
        now_override=fixed_clock,
    )


@pytest.fixture
def migrated_database(app_settings: Settings) -> Path:
    connection = connect(app_settings.db_path)
    try:
        apply_migrations(connection)
    finally:
        connection.close()
    return app_settings.db_path


@pytest.fixture
def app(app_settings: Settings, migrated_database: Path) -> FastAPI:
    return create_app(app_settings)


@pytest.fixture
def client(app: FastAPI) -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client
