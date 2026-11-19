from __future__ import annotations

from pathlib import Path

import uvicorn
from fastapi import FastAPI
from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from due_track.api.app import create_app
from due_track.config import PROJECT_ROOT, Settings, get_settings

FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"


class SPAStaticFiles(StaticFiles):
    """Serve built assets and fall back to ``index.html`` for client-side routes."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except HTTPException as error:
            if error.status_code != 404:
                raise
            # API routes are authoritative: never answer an unknown API path with HTML.
            if path == "api" or path.startswith("api/"):
                raise
            # Missing files with an extension are real 404s, not SPA routes.
            if Path(path).suffix:
                raise
            return await super().get_response("index.html", scope)


def create_production_app(settings: Settings | None = None) -> FastAPI:
    app = create_app(settings)
    if FRONTEND_DIST.is_dir():
        app.mount("/", SPAStaticFiles(directory=FRONTEND_DIST, html=True), name="spa")
    return app


def run() -> None:
    settings = get_settings()
    uvicorn.run(create_production_app(settings), host=settings.host, port=settings.port)


if __name__ == "__main__":
    run()
