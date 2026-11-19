from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI

from due_track.api.deps import get_app_settings
from due_track.api.errors import register_error_handlers
from due_track.api.routes import history, items, timeline
from due_track.config import Settings, get_settings
from due_track.db.connection import connect
from due_track.db.migrate import apply_migrations


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        connection = connect(resolved_settings.db_path)
        try:
            apply_migrations(connection)
        finally:
            connection.close()
        yield

    app = FastAPI(
        title="due-track API",
        version="1.1.0",
        lifespan=lifespan,
    )
    app.dependency_overrides[get_app_settings] = lambda: resolved_settings
    api_router = APIRouter(prefix="/api")
    api_router.include_router(items.router)
    api_router.include_router(history.router)
    api_router.include_router(timeline.router)
    app.include_router(api_router)
    register_error_handlers(app)
    return app


app = create_app()
