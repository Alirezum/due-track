from __future__ import annotations

from typing import Any, cast

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.types import ExceptionHandler


class ErrorResponse(BaseModel):
    detail: str


class ValidationErrorResponse(BaseModel):
    detail: list[dict[str, Any]]


class NotFoundError(Exception):
    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class ConflictError(Exception):
    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


async def not_found_handler(_request: Request, exception: NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": exception.detail})


async def conflict_handler(_request: Request, exception: ConflictError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": exception.detail})


async def validation_error_handler(
    _request: Request,
    exception: RequestValidationError,
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"detail": jsonable_encoder(exception.errors())},
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(
        NotFoundError,
        cast(ExceptionHandler, not_found_handler),
    )
    app.add_exception_handler(
        ConflictError,
        cast(ExceptionHandler, conflict_handler),
    )
    app.add_exception_handler(
        RequestValidationError,
        cast(ExceptionHandler, validation_error_handler),
    )
