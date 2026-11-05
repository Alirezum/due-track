# Quickstart: due-track v1

**Feature**: `001-due-track-v1` | **Date**: 2026-11-04

Local-first, single-user deadline and obligation tracker. Backend: Python 3.12+ / FastAPI / SQLite.
Frontend: React 19 / Vite / TypeScript strict / Tailwind CSS / shadcn/ui.

## Prerequisites

- Python 3.12+ and [uv](https://docs.astral.sh/uv/)
- Node.js 22 LTS and npm
- A current browser
- Linux, macOS, or Windows

## Repository Layout

```text
backend/
├── pyproject.toml
├── src/due_track/{domain,db,api}/
└── tests/{unit/domain,integration/api}/
frontend/
├── package.json
├── vite.config.ts
└── src/
contracts/openapi.yaml
```

The existing root `pyproject.toml`, `.python-version`, and `src/due_track` scaffold move into
`backend/` during implementation. Backend imports remain `due_track.*`.

## Configuration

Create `backend/.env` or export these variables before starting the API:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DUE_TRACK_DB_PATH` | `backend/data/due-track.sqlite3` | Local SQLite file. The parent directory is created on startup. |
| `DUE_TRACK_TIMEZONE` | Host local timezone | IANA timezone for date-only end-of-day conversion, buckets, and recurrence calendar math. All conversion happens in `api/time.py`; set an explicit value for reproducible behavior. |
| `DUE_TRACK_CURRENCY` | `USD` | ISO 4217 code used only for display formatting. No conversion is performed. |
| `DUE_TRACK_HOST` | `127.0.0.1` | Bind address. Do not expose to a network. |
| `DUE_TRACK_PORT` | `8000` | API port. |
| `DUE_TRACK_NOW_OVERRIDE` | unset | Optional fixed ISO-8601 instant for local demos/tests. Unset in normal use. |

The database applies `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL` on every
connection. Migrations run automatically at startup; they can also be run manually.

## Install

```bash
# Backend
cd backend
uv sync

# Frontend
cd ../frontend
npm install
```

## Run in Development

Terminal 1 — API:

```bash
cd backend
uv run python -m due_track.db.migrate
uv run uvicorn due_track.api.app:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2 — SPA:

```bash
cd frontend
npm run dev
```

Open the URL printed by Vite (typically `http://127.0.0.1:5173`). The Vite dev server proxies `/api`
to `http://127.0.0.1:8000`. The browser only talks to the Vite origin in development.

## Production-Style Run

```bash
cd frontend
npm run build

cd ../backend
uv run python -m due_track.main
```

`due_track.main` starts Uvicorn on the configured host/port and serves the built `frontend/dist`
assets, while `/api` remains the authoritative API. Open `http://127.0.0.1:8000`.

## Quality Gates

Run all gates before considering a task complete:

```bash
cd backend
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy src

cd ../frontend
npm run test:run   # when frontend tests are present
npm run build      # runs tsc -b && vite build
```

The required frontend gate is `npm run build`; `test:run` is required for behavior changes. Commit
per analyzed task, as required by the constitution.

## Manual Validation

Use a fresh database (`DUE_TRACK_DB_PATH=/tmp/due-track-check.sqlite3`) and a fixed
`DUE_TRACK_TIMEZONE` while validating.

1. **Create and classify**
   - Create an item due earlier today: it appears in **Overdue**, not Due Today.
   - Create an item due later today: it appears in **Due Today**.
   - Create an item due exactly now: it appears in **Due Today**.
   - Create a date-only item due today: it stays in **Due Today** until local midnight.
   - Create items due tomorrow, in 7 days, and in 8 days: the first two are **Upcoming**, the last is
     **Later**.
   - Confirm every active item appears in exactly one bucket, ordered by due date ascending, then
     priority descending, then title alphabetically.

2. **Summary and filters**
   - Add amounts to two Upcoming items and leave one Upcoming item without an amount. Confirm the
     summary's Upcoming total includes only the amounts that exist.
   - Filter by category, priority, and recurring/one-time; combine filters and search.
   - Confirm the buckets and summary both reflect the filtered result set.

3. **Complete a one-time item**
   - Complete it. It disappears from the dashboard and appears in History with its snapshot,
     original due date, and completion timestamp. The response item is `null`.

4. **Complete a recurring item**
   - Monthly, schedule-anchored, anchor day 31, due January 31. Complete in February. The next due
     date is the last day of February. Complete again; the following due date returns to March 31.
   - Complete a late schedule-anchored item with several missed occurrences. It advances to the
     first occurrence after completion, without duplicate past items.
   - Complete a completion-anchored item. The next due date is calculated from the completion time.
   - Set an inclusive end date. An occurrence due exactly on that date is created; the next one is
     not. Set a remaining count of 1 and confirm completion ends the series.

5. **Undo**
   - Complete a recurring item, then undo immediately. The prior due date and item state return, and
     no duplicate next occurrence remains.
   - Complete a recurring item, edit the newly advanced occurrence, then undo. The edited occurrence
     stays, the snapshot returns as a separate active item, and the UI shows a preservation warning.
   - Complete an item twice, then try to undo the older entry. It is inspectable but `can_undo` is
     false and the API returns 409.

6. **History deletion**
   - Delete a history entry with confirmation. Only that entry disappears; active items are
     unchanged. Cancel the dialog and confirm nothing changes.

7. **Categories**
   - Assign a free-text category to several items. Badges share a deterministic color and the
     category filter matches case-insensitively.
   - Note: this two-table model stores categories as labels. There is no separate category CRUD
     screen; changing or clearing a category means editing the affected items. This is the
     specified FR-035 behavior.

8. **Keyboard and theme**
   - Use `N` to quick-add, `/` to search, `J`/`K` to move, `Enter` to open, `C` to complete, `E` to
     edit, `Delete` to open confirmation, `?` to open help, and `Esc` to close. Confirm visible focus
     and that shortcuts do not fire while typing.
   - Toggle dark mode, reload, and confirm the preference persists.

9. **Persistence**
   - Create items and completion records, stop both processes, restart, and confirm everything is
     still present.
   - Soft-delete a recurring item. It disappears from active views, future occurrences stop, and its
     prior history remains readable.

## OpenAPI Contract

The authoritative contract is [`contracts/openapi.yaml`](./contracts/openapi.yaml). It documents:

- `GET /api/items` — grouped buckets + summary, with `category`, `priority`, `recurring`, and `q`
  filters.
- `POST /api/items`, `PATCH /api/items/{item_id}`, `DELETE /api/items/{item_id}`.
- `POST /api/items/{item_id}/complete`.
- `GET /api/history`, `POST /api/history/{log_id}/undo`, `DELETE /api/history/{log_id}`.

The FastAPI app mounts every route under `/api`; there are no non-API business endpoints.

## Troubleshooting

- **`database is locked`**: confirm every connection uses the shared connection factory with
  `busy_timeout`, and that WAL mode is enabled. Do not open the same database with another writer.
- **Items appear in the wrong day near midnight or DST**: set `DUE_TRACK_TIMEZONE` explicitly and
  ensure `api/time.py` performs all conversion; domain functions receive UTC instants plus local
  calendar components and must not import `ZoneInfo`.
- **Month-end recurrence drifts**: schedule-anchored month/year items must store
  `recurrence_anchor_day`; verify the value is preserved after completion and after manual due-date
  edits.
- **Undo returns 409**: only the latest completion of an existing, non-deleted item can be undone.
- **Vite requests 404**: confirm the dev proxy maps `/api` to `http://127.0.0.1:8000` and the API is
  running on that port.
- **Frontend build fails on types**: run `npx tsc -b --pretty false` in `frontend/` for the first
  concrete error; the build must stay in TypeScript strict mode.

## Out of Scope for v1

Authentication, multi-user access, network sync, notifications, background jobs, multi-currency,
currency conversion, file attachments, and separate category management or category CRUD screens.
