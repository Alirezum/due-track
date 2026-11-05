from __future__ import annotations

import os
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DB_PATH = PROJECT_ROOT / "backend" / "data" / "due-track.sqlite3"
CURRENCY_PATTERN = re.compile(r"^[A-Z]{3}$")


def _read_host_timezone() -> str:
    candidates: list[str] = []
    environment_timezone = os.environ.get("TZ")
    if environment_timezone:
        candidates.append(environment_timezone)

    timezone_file = Path("/etc/timezone")
    if timezone_file.is_file():
        candidates.append(timezone_file.read_text(encoding="utf-8").strip())

    localtime_path = Path("/etc/localtime")
    if localtime_path.exists():
        resolved = localtime_path.resolve()
        marker = f"{os.sep}zoneinfo{os.sep}"
        if marker in str(resolved):
            candidates.append(str(resolved).split(marker, 1)[1])

    for candidate in candidates:
        try:
            ZoneInfo(candidate)
        except (ValueError, ZoneInfoNotFoundError):
            continue
        return candidate

    return "UTC"


def _validated_timezone(name: str) -> str:
    if not name:
        raise ValueError("DUE_TRACK_TIMEZONE must not be empty")
    try:
        ZoneInfo(name)
    except (ValueError, ZoneInfoNotFoundError) as error:
        raise ValueError(f"Invalid DUE_TRACK_TIMEZONE: {name}") from error
    return name


def _validated_currency(currency: str) -> str:
    if not CURRENCY_PATTERN.fullmatch(currency):
        raise ValueError("DUE_TRACK_CURRENCY must be a three-letter uppercase currency code")
    return currency


def _validated_port(raw_port: str) -> int:
    try:
        port = int(raw_port)
    except ValueError as error:
        raise ValueError("DUE_TRACK_PORT must be an integer") from error
    if not 1 <= port <= 65535:
        raise ValueError("DUE_TRACK_PORT must be between 1 and 65535")
    return port


def _parse_now_override(raw_value: str | None) -> datetime | None:
    if raw_value is None or not raw_value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(raw_value.strip())
    except ValueError as error:
        raise ValueError("DUE_TRACK_NOW_OVERRIDE must be an ISO-8601 datetime") from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("DUE_TRACK_NOW_OVERRIDE must include a UTC offset")
    return parsed


@dataclass(frozen=True, slots=True)
class Settings:
    db_path: Path
    timezone: str
    currency: str
    host: str
    port: int
    now_override: datetime | None

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> Settings:
        env = os.environ if environ is None else environ
        return cls(
            db_path=Path(env.get("DUE_TRACK_DB_PATH", str(DEFAULT_DB_PATH))).expanduser(),
            timezone=_validated_timezone(env.get("DUE_TRACK_TIMEZONE") or _read_host_timezone()),
            currency=_validated_currency(env.get("DUE_TRACK_CURRENCY", "USD")),
            host=env.get("DUE_TRACK_HOST", "127.0.0.1"),
            port=_validated_port(env.get("DUE_TRACK_PORT", "8000")),
            now_override=_parse_now_override(env.get("DUE_TRACK_NOW_OVERRIDE")),
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()
