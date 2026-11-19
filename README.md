# due-track

A local-first, single-user deadline and obligation tracker. There are no accounts, no telemetry,
and no external service calls: every deadline stays in a local SQLite file.

- Backend: Python 3.12+, FastAPI, SQLite
- Frontend: React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui
- Keyboard-first dashboard, history, and timeline with visible focus and a discoverable shortcut panel
- Upcoming-first primary views with a one-action overdue reveal, and no monetary amounts on deadline
  cards or timeline details

## Layout

```text
backend/            FastAPI API, SQLite storage, domain logic
frontend/           React single-page app
specs/              Product specification, plan, and quality scenarios
specs/001-due-track-v1/contracts/openapi.yaml
                    Published OpenAPI contract
specs/002-deadline-timeline/
                    Timeline specification, plan, and validation guide
specs/003-upcoming-deadlines/
                    Upcoming-only focus specification, plan, and validation guide
```

## Destinations

The SPA has three top-level destinations:

- **Deadlines** — the dashboard with status buckets, summaries, filters, and quick actions. It opens
  in upcoming-only focus, shows `Next 7 days`, `Due today`, and `Overdue` counts, and reveals the
  overdue bucket with one action.
- **Timeline** — a horizontal ledger at ≥1024 px and a vertical chronological ledger below it.
  It shows active deadlines against a labelled now line, with exact due moments, live countdowns,
  server-assigned urgency, clusters, edge summaries, filters, details, and actions. It also opens
  upcoming-only, with the same one-action overdue reveal.
- **History** — completed-deadline audit records with single-step undo and deletion. Stored amounts
  remain visible here and in the edit form; the primary deadline views never show them.

All three share the same active/completed/deleted semantics. The Timeline is a read-only
projection plus the existing item actions; it introduces no persisted timeline state.

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

## Timeline projection

`GET /api/timeline` returns `reference_time_utc`, `timezone`, `currency_code`, `overdue_count`, and
a chronological `entries` array of active deadlines. Each entry carries the existing `DueItem` plus
`urgency` (`overdue`, `due_now`, `within_24h`, `within_7d`, or `later`) and `seconds_until_due`.
The endpoint accepts the same `category`, `priority`, `recurring`, and `q` filters as the item list
and is strictly read-only.

Urgency is computed once by the backend in `backend/src/due_track/domain/timeline.py`. The frontend
formats and ticks countdowns against the response's reference time but never re-derives a status,
so client clock skew cannot reclassify an entry. The projection reads only existing `due_items`
columns: there is **no migration**, no new table, and no persisted timeline state.

## Upcoming focus and expenses

Both read endpoints accept the shared `scope` query parameter:

- `scope=all` (the default) preserves the pre-1.2.0 payload, including `buckets.overdue` and overdue
  timeline entries.
- `scope=upcoming` omits overdue records from the primary payload while keeping
  `summary.overdue_count` / `overdue_count` as the accurate filtered count. It is a view projection,
  never a data filter or mutation.

The Dashboard and Timeline request `upcoming` by default. Their overdue indicator reads the
server-authoritative count, and one action switches to `scope=all` and reveals the matching overdue
records with their normal edit, complete, and delete actions. The reveal state is page-local, resets
on navigation, and issues no writes. Completing, editing, or deleting an overdue record updates the
count on the next read and keeps History and undo unchanged.

The primary views show no monetary amounts, expense totals, or currency symbols. `amount_cents`
remains stored and editable, `summary.upcoming_total_cents` and `currency_code` remain in the API
responses for compatibility, and History still displays the stored amount.

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
| `J` / `K` | Move to the next / previous deadline |
| `Home` / `End` | Move to the first / last deadline |
| `Enter` | Open the active deadline |
| `C` | Complete the active deadline |
| `E` | Edit the active deadline |
| `Delete` | Ask to delete the active deadline |
| `?` | Show the shortcut help panel |
| `Esc` | Close the open dialog, confirmation, or help panel |

Shortcuts pause while typing in an input, textarea, select, or contenteditable element. On the
Timeline, `J`/`K`/`Home`/`End` move through the full chronological sequence, including entries
inside clusters and beyond edge summaries; the selected horizon does not change.

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
listed in `specs/001-due-track-v1/quickstart.md`. Timeline scenarios, including horizons, clusters,
detail actions, 320–1920 px widths, 200% zoom, light/dark themes, and reduced motion, are listed in
`specs/002-deadline-timeline/quickstart.md`. Upcoming-only focus, overdue reveal, expense-free
views, boundaries, filters, recurring completion, failure states, and 1,000-item timing are listed
in `specs/003-upcoming-deadlines/quickstart.md`.

## Frontend design

`.specify/memory/constitution.md` v1.1.0 requires loading the `frontend-design` skill before making
UI or visual-design decisions. Product specifications, plans, and existing design tokens take
precedence over the skill; keep new work within those constraints.
