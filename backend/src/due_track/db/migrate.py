from __future__ import annotations

import argparse
import re
import sqlite3
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from due_track.config import get_settings
from due_track.db.connection import connect

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"
MIGRATION_FILE_PATTERN = re.compile(
    r"^(?P<version>\d{4})_(?P<name>.+)\.(?P<direction>up|down)\.sql$"
)
SCHEMA_MIGRATIONS_DDL = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at_utc TEXT NOT NULL
)
"""


@dataclass(frozen=True, slots=True)
class Migration:
    version: int
    name: str
    up_path: Path
    down_path: Path


def _split_statements(sql: str) -> list[str]:
    statements: list[str] = []
    buffer = ""
    for line in sql.splitlines(keepends=True):
        buffer += line
        if sqlite3.complete_statement(buffer):
            statement = buffer.strip()
            if statement:
                statements.append(statement)
            buffer = ""
    if buffer.strip():
        raise ValueError("Migration contains an incomplete SQL statement")
    return statements


def _run_in_transaction(
    connection: sqlite3.Connection,
    statements: list[str],
    bookkeeping_sql: str,
    bookkeeping_params: tuple[object, ...],
) -> None:
    connection.execute("BEGIN IMMEDIATE")
    try:
        for statement in statements:
            connection.execute(statement)
        connection.execute(bookkeeping_sql, bookkeeping_params)
        connection.execute("COMMIT")
    except Exception:
        if connection.in_transaction:
            connection.execute("ROLLBACK")
        raise


def ensure_schema_migrations(connection: sqlite3.Connection) -> None:
    connection.execute(SCHEMA_MIGRATIONS_DDL)


def discover_migrations(migrations_dir: Path = MIGRATIONS_DIR) -> list[Migration]:
    if not migrations_dir.is_dir():
        return []

    discovered: dict[int, dict[str, tuple[str, Path]]] = {}
    for path in sorted(migrations_dir.glob("*.sql")):
        match = MIGRATION_FILE_PATTERN.fullmatch(path.name)
        if match is None:
            raise ValueError(f"Invalid migration filename: {path.name}")
        version = int(match.group("version"))
        direction = match.group("direction")
        name = match.group("name")
        directions = discovered.setdefault(version, {})
        if direction in directions:
            raise ValueError(f"Duplicate {direction} migration for version {version}")
        directions[direction] = (name, path)

    migrations: list[Migration] = []
    for version, directions in sorted(discovered.items()):
        if "up" not in directions or "down" not in directions:
            raise ValueError(f"Migration version {version} must have both up and down files")
        up_name, up_path = directions["up"]
        down_name, down_path = directions["down"]
        if up_name != down_name:
            raise ValueError(f"Migration version {version} has mismatched names")
        migrations.append(
            Migration(
                version=version,
                name=up_name,
                up_path=up_path,
                down_path=down_path,
            )
        )
    return migrations


def _applied_versions(connection: sqlite3.Connection) -> set[int]:
    rows = connection.execute("SELECT version FROM schema_migrations").fetchall()
    return {int(row["version"]) for row in rows}


def apply_migrations(
    connection: sqlite3.Connection,
    migrations_dir: Path = MIGRATIONS_DIR,
    now_utc: datetime | None = None,
) -> list[int]:
    ensure_schema_migrations(connection)
    applied = _applied_versions(connection)
    applied_now: list[int] = []
    timestamp = (now_utc or datetime.now(UTC)).isoformat(timespec="microseconds")

    for migration in discover_migrations(migrations_dir):
        if migration.version in applied:
            continue
        statements = _split_statements(migration.up_path.read_text(encoding="utf-8"))
        _run_in_transaction(
            connection,
            statements,
            "INSERT INTO schema_migrations (version, name, applied_at_utc) VALUES (?, ?, ?)",
            (migration.version, migration.name, timestamp),
        )
        applied_now.append(migration.version)
    return applied_now


def rollback_migration(
    connection: sqlite3.Connection,
    migrations_dir: Path = MIGRATIONS_DIR,
) -> Migration | None:
    ensure_schema_migrations(connection)
    row = connection.execute(
        "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1"
    ).fetchone()
    if row is None:
        return None

    version = int(row["version"])
    migration = next(
        (item for item in discover_migrations(migrations_dir) if item.version == version),
        None,
    )
    if migration is None:
        raise ValueError(f"No migration files found for applied version {version}")

    statements = _split_statements(migration.down_path.read_text(encoding="utf-8"))
    _run_in_transaction(
        connection,
        statements,
        "DELETE FROM schema_migrations WHERE version = ?",
        (version,),
    )
    return migration


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Apply or roll back due-track migrations")
    parser.add_argument(
        "command",
        nargs="?",
        choices=("apply", "rollback"),
        default="apply",
    )
    parser.add_argument("--database", type=Path, default=None)
    args = parser.parse_args(argv)

    db_path = args.database or get_settings().db_path
    connection = connect(db_path)
    try:
        if args.command == "apply":
            for version in apply_migrations(connection):
                print(f"Applied migration {version}")
        else:
            migration = rollback_migration(connection)
            if migration is None:
                print("No migrations to roll back")
            else:
                print(f"Rolled back migration {migration.version}")
    finally:
        connection.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
