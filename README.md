# due-track

A local-first, single-user deadline and obligation tracker. There are no accounts, no telemetry,
and no external service calls: every deadline stays in a local SQLite file.

- Backend: Python 3.12+, FastAPI, SQLite
- Frontend: React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui
- Keyboard-first dashboard with visible focus and a discoverable shortcut panel

## Layout

```text
backend/            FastAPI API, SQLite storage, domain logic
frontend/           React single-page app
specs/              Product specification, plan, and quality scenarios
specs/001-due-track-v1/contracts/openapi.yaml
                    Published OpenAPI contract
```

## Requirements

- Python 3.12+ and [uv](https://docs.astral.sh/uv/)
- Node.js 22 LTS and npm

## Install

```bash
cd backend
uv sync

cd ../frontend
npm install
```

## Run in development

Start the API:

```bash
cd backend
uv run uvicorn due_track.api.app:app --reload --host 127.0.0.1 --port 8000
```

Start the frontend in a second terminal:

```bash
cd frontend
npm run dev
```

The Vite dev server proxies `/api` to `http://127.0.0.1:8000`. The browser only talks to the Vite
origin in development.

## Run in production style

```bash
cd frontend
npm run build

cd ../backend
uv run python -m due_track.main
```

`due_track.main` starts Uvicorn on `DUE_TRACK_HOST`/`DUE_TRACK_PORT` and serves the built
`frontend/dist` assets, including client-side routes. `/api` remains authoritative: unknown API
paths return JSON 404 responses rather than the SPA shell. Open `http://127.0.0.1:8000`.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `DUE_TRACK_DB_PATH` | `backend/data/due-track.sqlite3` | Local SQLite file. |
| `DUE_TRACK_TIMEZONE` | Host local timezone | IANA timezone for date-only end-of-day conversion, buckets, and recurrence calendar math. |
| `DUE_TRACK_CURRENCY` | `USD` | ISO 4217 code used only for display formatting. No conversion. |
| `DUE_TRACK_HOST` | `127.0.0.1` | Bind address. Keep it on loopback. |
| `DUE_TRACK_PORT` | `8000` | Server port. |
| `DUE_TRACK_NOW_OVERRIDE` | unset | Optional fixed ISO-8601 instant for demos and tests. |

The database applies `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL` on every
connection. Migrations run automatically at startup.

## Data model

The model has exactly two core tables plus migration bookkeeping:

- `due_items` stores active, completed, and soft-deleted deadlines. Each row represents the current
  occurrence of a recurring series, a completed one-time item, or a deleted item.
- `completion_logs` stores immutable completion audit records. Each log keeps a self-contained
  `previous_state_snapshot_json`, the originally scheduled due instant, and the actual completion
  instant. That snapshot powers single-step undo and keeps history readable after edits or deletion.

Categories are free-text labels on each item. There is no categories table and no category CRUD
endpoint: labels are trimmed to 1–50 characters, filtered case-insensitively, and receive badge
colors derived deterministically in the frontend. They are intentionally not normalized into a
separate entity.

## Timezone boundary

All persisted timestamps and due boundaries are UTC, including `recurrence_end_at_utc`. Local
calendar values (`due_local_date`, `due_local_time`, and `recurrence_end_date`) are derived, not
stored.

`backend/src/due_track/api/time.py` is the only module allowed to convert between UTC and the
application timezone. Domain functions receive explicit UTC instants and naive local calendar
components, and never import `ZoneInfo` or call `datetime.now()`. The API layer resolves "now" and
performs the conversions at the boundary.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `N` | Open quick-add and focus the title |
| `/` | Focus dashboard search |
| `J` / `K` | Move to the next / previous visible deadline |
| `Enter` | Open the active deadline |
| `C` | Complete the active deadline |
| `E` | Edit the active deadline |
| `Delete` | Ask to delete the active deadline |
| `?` | Show the shortcut help panel |
| `Esc` | Close the open dialog, confirmation, or help panel |

Shortcuts pause while typing in an input, textarea, select, or contenteditable element.

## Quality gates

Run every gate before considering a change complete:

```bash
cd backend
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy src

cd ../frontend
npm run test:run
npm run build
npm run lint
```

The required frontend gate is `npm run build`; `test:run` is required for behavior changes. Manual
validation scenarios, including bucket boundaries, recurrence, history, and keyboard operation, are
listed in `specs/001-due-track-v1/quickstart.md`.
