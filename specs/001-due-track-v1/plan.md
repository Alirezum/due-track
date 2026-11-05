# Implementation Plan: due-track v1 — Personal Deadline & Obligation Tracker

**Branch**: `001-due-track-v1` | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-due-track-v1/spec.md`, plus the user's revised
architectural directive (two-part monorepo, two-table SQLite model, OpenAPI contract).

## Summary

Build a local-first, single-user deadline and obligation tracker as a two-part monorepo:

- `backend/` — Python 3.12+ managed with `uv`; FastAPI mounted strictly under `/api`; a pure,
  dependency-free domain package for status buckets, recurrence, month-end clamping, and sorting;
  a SQLite persistence layer with explicit migrations and repository functions; Pydantic v2
  schemas at the API boundary.
- `frontend/` — React 19 + Vite + TypeScript strict mode; Tailwind CSS with `shadcn/ui` primitives;
  dark mode; keyboard-first interactions; TanStack Query against `/api`; Vite proxy to
  `http://127.0.0.1:8000`.

Persistence uses exactly two core tables: `due_items` for active/completed one-time items and
`completion_logs` for immutable completion audit records. Completion logs carry a
`previous_state_snapshot_json` that powers single-step undo/reopen and keeps history readable after
item edits or deletion.

The public contract is generated and documented as `contracts/openapi.yaml`.

This plan supersedes the earlier series/occurrence design. It follows the user's mandated directory
layout and data model. Categories are stored as a single free-text label per item, with badge color
derived deterministically; this is the specified v1 behavior, not a deviation. All timezone
conversion is confined to the FastAPI boundary (`api/time.py`); the domain receives UTC instants and
naive local calendar components and never imports `ZoneInfo` or performs timezone conversion.

## Technical Context

**Language/Version**: Python 3.12+ (managed with `uv`); TypeScript 5.x in strict mode on Node.js 22 LTS

**Primary Dependencies**: Backend — FastAPI, Pydantic v2, Uvicorn; Python standard-library `sqlite3`
for persistence; pytest, httpx, ruff, and mypy for quality. Frontend — React 19, Vite, TypeScript,
Tailwind CSS, `shadcn/ui` primitives, TanStack Query, React Router; Vitest and React Testing Library
for component behavior.

**Storage**: One local SQLite database file (`DUE_TRACK_DB_PATH`, default
`backend/data/due-track.sqlite3`). Every connection enables `PRAGMA foreign_keys = ON` and
`PRAGMA journal_mode = WAL`. Schema changes are explicit, ordered SQL migration files tracked in a
`schema_migrations` table, with downgrade scripts for each migration. `schema_migrations` is
infrastructure bookkeeping and is not a core domain table. All persisted timestamps and due
boundaries are UTC ISO-8601, including `recurrence_end_at_utc`; the API's `recurrence_end_date` is a
local date converted at the boundary.

**Testing**: `pytest` with `tests/unit/test_time.py` for boundary UTC/local conversion,
`tests/unit/domain/` for pure recurrence/clock/sorting tests, and `tests/integration/api/` for
FastAPI `TestClient` tests against isolated temporary SQLite databases.
Frontend behavior is covered with Vitest and React Testing Library where logic is added; the required
frontend gate is `npm run build` (`tsc -b && vite build`).

**Target Platform**: Local desktop browser (current Chromium, Firefox, Safari) with a Python 3.12+
process on Linux, macOS, or Windows.

**Project Type**: Web application (FastAPI REST backend + React SPA) in a two-part monorepo.

**Performance Goals**: Dashboard, filter, and search responses complete in under 1 second for 1,000
active items. Recurrence and status evaluation happen synchronously on read/write.

**Constraints**: Backend binds to `127.0.0.1` by default; no authentication, telemetry, network
sync, external services, or background workers. All timestamps and due boundaries are stored and
processed as UTC ISO-8601. For this local-first application, the HTTP API is the presentation
boundary: the configured application timezone governs date-only end-of-day conversion, calendar
buckets, and recurrence calendar arithmetic, and all timezone conversion is confined to
`backend/src/due_track/api/time.py`. Domain modules receive UTC instants plus naive local calendar
components derived at that boundary; these components are never persisted and the domain never
converts timezones. Amounts are stored as integer cents. The UI must remain keyboard-operable with
visible focus and dark-mode support.

**Scale/Scope**: One user, roughly 1,000 active items and 10,000 completion log entries, in one local
database file.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Gate | Status | Evidence |
|------------------|--------|----------|
| I. Deterministic Domain & Recurrence Logic | PASS | `domain/` has zero FastAPI/SQLite/`ZoneInfo` imports; all public functions accept an explicit reference clock or its UTC value; the HTTP API is the presentation boundary and all timezone conversion is isolated in `api/time.py`; the domain receives UTC instants and naive local calendar components for pure recurrence/status rules. |
| II. Local-First, Single-User Privacy by Default | PASS | SQLite-only storage; loopback bind; no auth, telemetry, sync, or online dependency. |
| III. Data Safety & Atomic Persistence | PASS | WAL and foreign keys enabled; ordered reversible migrations; completion snapshots preserve audit data; destructive actions require UI confirmation. |
| IV. Clear API Boundary & Thin Client | PASS | All filtering, bucketing, sorting, recurrence, and totals live in FastAPI under `/api`; React reads the grouped contract and does not recompute business rules. |
| V. Simplicity, YAGNI & Verified Changes | PASS | Two tables, standard-library SQLite, no background jobs or brokers, small dependency set, domain and API tests required. |
| Technical Constraints | PASS | Python/uv/FastAPI/SQLite with explicit migrations; React/Vite/TypeScript strict; no daemons; keyboard-first; OpenAPI contract. |
| Development Workflow & Git Policy | PASS | Plan includes the required backend gates, frontend build gate, and atomic-task commits. |

No constitution violations or exceptions.

### Design Decisions

| Decision | Reason | Impact |
|----------|--------|--------|
| Category labels are free-text fields on each item; badge color is derived deterministically from the normalized label. | The mandated two-table model has no categories table, and FR-035 specifies this label model. | Items have zero or one category label, filtering works, and badges remain visually distinct. Changing or clearing a label is done by editing the item; separate category CRUD is out of scope. |
| Completion history snapshot fields live inside `previous_state_snapshot_json`. | The mandated `completion_logs` schema uses a JSON snapshot for undo and audit. | History remains self-contained and readable after item edits/deletion; the API exposes the snapshot as a typed `DueItem` enriched with derived local-date fields. |
| `recurrence_end_date` is accepted and returned by the API as a local date, but persisted as `recurrence_end_at_utc`. | Constitution I requires all due boundaries to be stored and processed in UTC; local conversion may occur only at the API boundary. | `api/time.py` converts the inclusive local end date to the UTC instant at the end of that local day and supplies the corresponding local end date to the domain. The domain never converts timezones. |

## Project Structure

### Documentation (this feature)

```text
specs/001-due-track-v1/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── openapi.yaml     # Phase 1 output
├── checklists/
│   └── requirements.md  # Specification quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks, not created here)
```

### Source Code (repository root)

```text
backend/
├── pyproject.toml
├── .python-version
├── src/
│   └── due_track/
│       ├── __init__.py
│       ├── config.py              # Env: DB path, timezone, currency, host, port
│       ├── main.py                # Production entry point (Uvicorn, static SPA)
│       ├── domain/
│       │   ├── __init__.py
│       │   ├── status.py          # Bucket classification and summary math
│       │   ├── recurrence.py      # Advancement, clamping, end conditions
│       │   └── sorting.py         # Bucket ordering rules
│       ├── db/
│       │   ├── __init__.py
│       │   ├── connection.py      # sqlite3 connection factory and PRAGMAs
│       │   ├── migrate.py         # Migration runner
│       │   ├── migrations/
│       │   │   ├── 0001_initial.up.sql
│       │   │   └── 0001_initial.down.sql
│       │   ├── items_repository.py
│       │   └── history_repository.py
│       └── api/
│           ├── __init__.py
│           ├── app.py             # FastAPI app factory and /api router
│           ├── deps.py            # DB connection and clock dependencies
│           ├── errors.py          # Consistent error handlers
│           ├── schemas.py         # Pydantic v2 request/response models
│           ├── time.py            # Only boundary for timezone conversion
│           └── routes/
│               ├── items.py
│               └── history.py
└── tests/
    ├── conftest.py
    ├── unit/
    │   ├── test_time.py           # Boundary UTC/local conversion tests
    │   └── domain/
    │       ├── test_status.py
    │       ├── test_recurrence.py
    │       └── test_sorting.py
    └── integration/
        └── api/
            ├── test_items.py
            ├── test_completion.py
            └── test_history.py

frontend/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── api/
│   │   ├── client.ts
│   │   └── types.ts
│   ├── components/
│   │   ├── ui/                  # shadcn/ui primitives and theme tokens
│   │   ├── AppShell.tsx
│   │   ├── BucketSection.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── FilterBar.tsx
│   │   ├── ItemCard.tsx
│   │   ├── ItemForm.tsx
│   │   └── ShortcutHelp.tsx
│   ├── hooks/
│   │   ├── useItems.ts
│   │   ├── useHistory.ts
│   │   └── useShortcuts.ts
│   ├── lib/
│   │   ├── categories.ts        # Deterministic category badge colors
│   │   ├── format.ts
│   │   └── shortcuts.ts
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   └── HistoryPage.tsx
│   └── styles/
│       └── index.css
└── tests/
    ├── setup.ts
    ├── dashboard.test.tsx
    ├── history.test.tsx
    └── shortcuts.test.tsx

contracts/openapi.yaml
```

**Structure Decision**: The existing root `pyproject.toml`, `.python-version`, and `src/due_track`
scaffold are relocated into `backend/` during implementation. The backend package keeps the
`due_track` import name. The frontend is a separate Vite application. The OpenAPI contract is stored
at the repository-level `contracts/openapi.yaml` so it is visible to both sides.

## Phase 0: Research Output

See [research.md](./research.md). All technical unknowns are resolved; no unresolved clarification
items remain.

## Phase 1: Design Output

- [data-model.md](./data-model.md) — two-table schema, snapshot JSON shape, recurrence rules, and
  state transitions.
- [contracts/openapi.yaml](./contracts/openapi.yaml) — OpenAPI 3.1 contract for all `/api` endpoints.
- [quickstart.md](./quickstart.md) — setup, run, quality gates, and end-to-end validation.

## Post-Design Constitution Re-check

| Principle / Gate | Status | Post-design evidence |
|------------------|--------|----------------------|
| I. Deterministic Domain & Recurrence Logic | PASS | Domain modules remain pure and reference-time-driven; all timezone conversion is in `api/time.py` (`config.py` may import `ZoneInfo` only to validate the IANA name); recurrence and bucket rules receive UTC instants and naive local calendar components and are isolated from FastAPI, sqlite3, and timezone conversion. |
| II. Local-First, Single-User Privacy by Default | PASS | Contract exposes only local `/api` resources; database is one local file; server binds to loopback. |
| III. Data Safety & Atomic Persistence | PASS | Completion snapshots are immutable JSON; migrations have up/down scripts; deletes are confirmed and history is preserved. |
| IV. Clear API Boundary & Thin Client | PASS | `GET /api/items` returns pre-grouped buckets and summary totals; the SPA renders and invalidates queries only. |
| V. Simplicity, YAGNI & Verified Changes | PASS | Two tables, stdlib sqlite3, no background work, no repository framework, minimal frontend dependencies beyond UI primitives. |

No constitution violations or exceptions. Complexity Tracking is empty.

## Complexity Tracking

No constitution violations or complexity exceptions are required. The design decisions above are
specified behavior under the two-table architecture and do not deviate from the specification.
