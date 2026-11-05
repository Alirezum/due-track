from __future__ import annotations

import sqlite3
from collections.abc import Generator
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends

from due_track.config import Settings, get_settings
from due_track.db.connection import connect


def get_app_settings() -> Settings:
    return get_settings()


def get_db_connection(
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> Generator[sqlite3.Connection, None, None]:
    connection = connect(settings.db_path)
    try:
        yield connection
    finally:
        connection.close()


def get_now(settings: Annotated[Settings, Depends(get_app_settings)]) -> datetime:
    if settings.now_override is not None:
        return settings.now_override
    return datetime.now(UTC)


SettingsDep = Annotated[Settings, Depends(get_app_settings)]
DatabaseDep = Annotated[sqlite3.Connection, Depends(get_db_connection)]
NowDep = Annotated[datetime, Depends(get_now)]
