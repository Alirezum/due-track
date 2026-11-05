# Research: due-track v1

**Feature**: `001-due-track-v1` | **Date**: 2026-11-04

This document records the technical decisions behind the revised plan. Each decision includes the
chosen approach, rationale, and alternatives considered. All `NEEDS CLARIFICATION` items from the
specification are resolved, and the design decisions are recorded in `plan.md` under
**Design Decisions**.

## 1. Repository Layout and Scaffold Migration

**Decision**: Use a two-part monorepo with `backend/` and `frontend/`. Move the existing root
`pyproject.toml`, `.python-version`, and `src/due_track` scaffold into `backend/`, keeping the
`due_track` package name. Add `frontend/` for the Vite SPA. Keep the OpenAPI contract at
`contracts/openapi.yaml` at the repository root.

**Rationale**: The user mandated this exact layout. Keeping the `due_track` import name avoids
renaming the domain package and preserves any existing scaffold work. A root-level contract is easy
for both sides to locate.

**Alternatives considered**: Keeping backend at the repository root (rejected: contradicts the
mandated layout); a single Vite project serving the API (rejected: violates the backend/frontend
split); putting the contract under `backend/` only (rejected: hides it from the frontend workflow).

## 2. Two-Table Persistence Model

**Decision**: Persist only `due_items` and `completion_logs` as core tables. An item row represents
its current active occurrence (or a completed one-time item). Completing a recurring item updates
that same row to the next occurrence and writes an immutable log entry. Completing a one-time item
marks the row completed and writes the log entry.

**Rationale**: The user mandated exactly these two tables. This model keeps one active occurrence per
series, avoids series/occurrence joins, and satisfies the recurrence workflow with a simple
transaction: snapshot the current row, compute the next due date in the domain layer, update the row
or mark it completed, and insert the log.

**Alternatives considered**: A series table plus occurrence table (rejected: exceeds the mandated
model and adds joins); materializing all future occurrences (rejected: unnecessary writes and
conflicts with end-date/remaining-count semantics); keeping completed items in `due_items` only and
deriving history (rejected: cannot preserve the completion snapshot after edits/deletion).

## 3. Domain Layer Boundary

**Decision**: Place all business rules in `backend/src/due_track/domain/`, which imports only the
Python standard library and its own modules. Public functions accept explicit UTC instants plus
naive local calendar components supplied by the API boundary; they never call `datetime.now()`,
never import FastAPI, `sqlite3`, or `ZoneInfo`, and never perform timezone conversion. API routes
obtain the current UTC time from one injected clock provider and use `api/time.py` for every
UTC/local conversion.

**Rationale**: This satisfies Principle I and makes recurrence, bucket, and sorting tests pure and
deterministic. It also allows the API to use a fixed clock in integration tests while keeping all
timezone conversion at the boundary.

**Alternatives considered**: Computing buckets and recurrence in SQL (rejected: month-end/leap-year
logic is hard to test and maintain); computing in the React client (rejected: violates the API
boundary and would duplicate rules); calling `now()` inside domain functions (rejected: violates the
constitution).

## 4. Recurrence Frequency Encoding

**Decision**: Use these values for `due_items.recurrence_freq`: `none`, `daily`, `weekly`,
`monthly`, `yearly`, `custom_days`, `custom_weeks`, `custom_months`, `custom_years`.
`recurrence_interval` is `1` for the fixed values and a positive integer `N` for `custom_*` values.
This encodes custom units without adding a `recurrence_unit` field beyond the mandated schema.

**Rationale**: The mandated field list has `recurrence_freq` and `recurrence_interval` but no unit
column. Encoding the custom unit in the frequency enum preserves the exact schema while representing
"every N days/weeks/months/years". The API and UI expose the same values.

**Alternatives considered**: Adding `recurrence_unit` (rejected: adds a field beyond the mandated
data model); storing a free-form string (rejected: weak validation and harder OpenAPI typing);
separate fixed/custom interval columns (rejected: redundant).

## 5. Recurrence Advancement Rules

**Decision**:

- Store the current occurrence's due instant in `due_at_utc`. `api/time.py` derives the local due
  date and completion local date and passes those naive calendar components to the domain for
  calendar arithmetic; the domain performs no timezone conversion.
- **Schedule-anchored**: advance from the current due date, never from completion time.
  - Day/week units add `N * unit` local calendar days.
  - Month/year units add `N` months/years to the current due date. Use
    `recurrence_anchor_day` as the target day of month, clamping to the last valid day. The next
    interval uses the stored anchor day, so January 31 → February 28/29 → March 31.
  - Yearly and `custom_years` schedule-anchored rules derive the anchor month from the current due
    date and use `recurrence_anchor_day` for the day.
  - Preserve the item's local time-of-day for timed items.
  - If the computed next occurrence is at or before `completed_at_utc`, keep advancing until the
    first occurrence strictly after completion. Do not create the skipped occurrences.
- **Completion-anchored**: advance from `completed_at_utc`.
  - Day/week units add `N * unit` local calendar days from the completion local date.
  - Month/year units add `N` months/years from the completion local date, clamping to the last valid
    day of the target month and using the completion date's day as the day-of-month base.
  - Preserve the item's original local time-of-day for timed items.
- A one-time item (`recurrence_freq = none`) never advances.

**Rationale**: The schedule-anchored rules satisfy the month-end and leap-year requirements via the
stored anchor day. The completion-anchored rules match "from the actual completion time" while
avoiding odd due times when the original item had an intentional time-of-day. Fast-forwarding
prevents duplicate missed occurrences.

**Alternatives considered**: Dateutil `rrule` (rejected: adds a dependency and makes custom
snapshot/end-condition behavior less explicit); advancing by adding days after clamping (rejected:
loses the original anchor); creating all missed occurrences (rejected by FR-025).

## 6. Recurrence End Conditions

**Decision**: Support exactly three end conditions on active recurring items:

- **Never**: `recurrence_end_at_utc = NULL` and `recurrence_remaining_count = NULL`.
- **On date**: the API's `recurrence_end_date` is an inclusive local calendar date, persisted as
  `recurrence_end_at_utc` (the UTC instant at the end of that local day). A candidate occurrence is
  valid only if its local due date is on or before the boundary-supplied local end date.
- **After count**: `recurrence_remaining_count` is the number of occurrences left including the
  current active occurrence and is initialized to the user's requested total. On completion, if the
  value is `1`, the series ends; otherwise it decrements by one and the next occurrence is created.
  Each completion consumes exactly one count; missed schedule-anchored occurrences that are skipped
  by fast-forwarding are never created, so they are not counted.

At most one of `recurrence_end_at_utc` and `recurrence_remaining_count` may be set. One-time items
have both set to `NULL`. The service rejects invalid combinations with a 422 response.

**Rationale**: This matches the clarified inclusive end-date semantics and the spec assumption that
the initial occurrence counts toward an "after N occurrences" limit. Using remaining rather than
total avoids needing to infer how many occurrences already elapsed.

**Alternatives considered**: Storing only a total limit (rejected: requires counting prior
completions on every edit); allowing both end conditions simultaneously (rejected: ambiguous and
unnecessary); making the end date exclusive (rejected by clarification).

## 7. Status Buckets and Sorting

**Decision**: For active items, the boundary supplies UTC instants plus local dates:

- **Overdue**: `due_at_utc < reference_time`. An item due earlier today is Overdue.
- **Due Today**: the boundary-supplied local due date equals the reference local date and the item
  is not Overdue. A timed item due exactly at `reference_time` is Due Today. A date-only item is
  stored at the end of the local day and stays Due Today until that local day ends.
- **Upcoming**: local due date from tomorrow through today + 7 days inclusive.
- **Later**: local due date after today + 7 days.

Every active item is classified into exactly one bucket. Sort each bucket by due date ascending,
then priority descending (Critical > High > Medium > Low), then title case-insensitively ascending.
Buckets are computed after filtering, and summary counts/totals reflect the filtered set.

**Rationale**: Matches FR-007 through FR-012 and the clarified edge cases. Deriving local dates at
the API boundary keeps daylight-saving transitions from changing calendar-day membership while the
pure domain module performs no timezone conversion.

**Alternatives considered**: Using UTC dates for bucket membership (rejected: wrong near midnight
and around DST); treating anything due today as Due Today even if past (rejected by the spec);
sorting by priority first (rejected by FR-011).

## 8. Completion Snapshots and Undo/Reopen

**Decision**: On completion, build `previous_state_snapshot_json` from the full current
`due_items` row before any advancement. Include every displayed field and all recurrence/status
metadata so history is self-contained. Insert the snapshot into `completion_logs` with the original
`scheduled_due_at_utc` and the actual `completed_at_utc`.

Undo is allowed only when the log is the latest completion for its item and the item is not deleted.
Undo then behaves as follows:

1. **Untouched occurrence**: if the current item row's `updated_at_utc` equals the log's
   `completed_at_utc` (the completion transaction updated it), restore the row from the snapshot in
   place with its existing ID, delete the log, and return the restored item. No duplicate or
   generated row remains.
2. **Touched occurrence**: if the current row was edited after completion
   (`updated_at_utc > completed_at_utc`), leave the current row intact as a separate active item,
   insert a new active `due_items` row from the snapshot with a new ID, delete the log, and return
   the restored row plus a warning that the touched occurrence was preserved.
3. **Unavailable**: older completions, completions for deleted items, and logs whose item no longer
   exists are shown with `can_undo = false` and return 409 if undo is attempted.

History deletion hard-deletes only the selected log and never changes active items.

**Rationale**: The two-table model has no separate occurrence ID, so "untouched" is detected by
comparing the row update timestamp with the completion timestamp. Restoring in place is exact for
the common case; creating a separate row is the only way to honor both "restore the prior state" and
"preserve a touched current occurrence" without a third table. Snapshots keep history readable after
item edits or deletion.

**Alternatives considered**: Always deleting the current row and restoring the snapshot (rejected:
destroys a touched occurrence); blocking undo whenever the item was touched (rejected by FR-028);
storing a generated-occurrence ID in a new column (rejected: outside the mandated schema); keeping
undo state in memory (rejected: not durable).

## 9. Due Date and Timezone Semantics

**Decision**: Store every due instant and due boundary in UTC ISO-8601 with microsecond precision.
The API accepts either a local `date` (date-only) or an aware ISO-8601 datetime. `api/time.py`
converts date-only values to the end of that local calendar day (23:59:59.999999) in the configured
timezone before storing UTC. It also converts the API's inclusive local `recurrence_end_date` to
`recurrence_end_at_utc` and back. Timed inputs are converted to UTC; local wall time is preserved on
display. The application timezone is configured once via `DUE_TRACK_TIMEZONE` and is the single
source of truth for buckets, recurrence calendar arithmetic, and date-only conversion.

`is_date_only` drives display and editing. Date-only items display as dates without a time; timed
items display both. An explicit UTC `reference_time` plus boundary-supplied local dates is used for
all domain calls. A single injected clock provider supplies the UTC reference time, and only
`api/time.py` performs timezone conversion.

**Rationale**: Satisfies the UTC persistence constraint and the requirement that a date-only item
stays Due Today until local midnight. It also avoids DST causing an item to land on the wrong
calendar day.

**Alternatives considered**: Storing local timestamps (rejected by the constitution); converting
date-only to UTC midnight (rejected: displays as the previous day in negative offsets and classifies
incorrectly); using the browser timezone for server logic (rejected: inconsistent and untestable).

## 10. Categories as Free-Text Labels

**Decision**: Store one optional `category` text label per item (trimmed, 1–50 characters) in
`due_items.category`. Category filtering is a case-insensitive exact match on the label. Badge colors
are derived deterministically from the label using a fixed palette in
`frontend/src/lib/categories.ts`, with light/dark variants.

This is the specified v1 behavior: there is no categories table or dedicated category CRUD API.
Creating a category happens by typing a new label on an item; changing or clearing it happens by
editing the affected items, and FR-035 requires no separate category CRUD.

**Rationale**: The user mandated exactly two core tables and listed only item, completion, and
history endpoints. Adding a categories table or category endpoints would contradict that directive.
Deterministic colors still provide visual distinction and stable badges across sessions.

**Alternatives considered**: A `categories` table with name/color (rejected: violates the two-table
mandate); storing color per item (rejected: not in the mandated field list and inconsistent across
items); JSON category objects in the text column (rejected: harder filtering and unnecessary
serialization); user-managed colors stored in a JSON file (rejected: hidden state outside the
database).

## 11. SQLite Access and Migrations

**Decision**: Use the Python standard-library `sqlite3` driver with row factories and a small
repository layer. One connection factory applies `PRAGMA foreign_keys = ON`,
`PRAGMA journal_mode = WAL`, `PRAGMA synchronous = NORMAL`, and `PRAGMA busy_timeout = 5000` to
every connection. Use explicit SQL migrations under
`backend/src/due_track/db/migrations/`, named `NNNN_name.up.sql` and `NNNN_name.down.sql`, tracked
in a `schema_migrations` table. The migration runner applies pending migrations in order and can
roll back the most recent migration. The app applies pending migrations on startup and exposes a
module command for manual runs.

**Rationale**: This avoids an ORM and migration framework, keeping dependencies and cognitive load
low while still providing explicit, reversible schema changes. WAL and foreign keys satisfy the
data-safety principle. The two-table workload does not justify SQLAlchemy or Alembic.

**Alternatives considered**: SQLAlchemy 2.0 + Alembic (rejected: extra dependencies and complexity
for two tables); raw ad-hoc `CREATE TABLE IF NOT EXISTS` at startup (rejected: not safely
versioned); an embedded key-value store (rejected: relational queries, constraints, and history are
better served by SQLite).

## 12. API Design and Response Shape

**Decision**: Mount all routes under `/api` using a FastAPI router. Use Pydantic v2 schemas for
strict request validation and response serialization. The dashboard endpoint is
`GET /api/items` and returns:

- `buckets`: `overdue`, `due_today`, `upcoming`, `later`, each an array of item objects.
- `summary`: `overdue_count`, `due_today_count`, `upcoming_total_cents`.
- `currency_code` and `timezone` for presentation.

Filters `category`, `priority`, `recurring`, and `q` combine with AND semantics and affect buckets
and summary. `q` searches title and notes case-insensitively. The API never returns completed or
deleted items in the dashboard response. The full contract is `contracts/openapi.yaml`.

Errors use a consistent `{ "detail": ... }` shape. Validation failures return 422; missing active
items return 404; invalid undo returns 409; delete endpoints return 204.

**Rationale**: Returning pre-grouped buckets keeps the client thin (Principle IV), reduces
client-side business logic, and makes the summary consistent with the visible result set. Including
currency and timezone avoids an extra config endpoint while keeping formatting correct.

**Alternatives considered**: Returning a flat list and grouping in React (rejected: duplicates
business rules and risks summary/bucket mismatch); a separate `/api/dashboard` endpoint (rejected:
the user specified `GET /api/items` with buckets and summary); a `/api/config` endpoint (rejected:
unnecessary extra endpoint).

## 13. Completion, Undo, and History Endpoints

**Decision**:

- `POST /api/items/{item_id}/complete` takes no body; returns `{ log, item }` where `item` is the
  advanced active item for a recurring series or `null` for a completed one-time item. The whole
  operation runs in one SQLite transaction.
- `POST /api/history/{log_id}/undo` takes no body; returns
  `{ restored_item, preserved_touched_occurrence, warning }`. The operation runs in one transaction.
- `GET /api/history` returns `{ entries, total }`, newest completion first; supports `limit` and
  `offset`.
- `DELETE /api/history/{log_id}` hard-deletes the log after explicit frontend confirmation and
  returns 204.
- `DELETE /api/items/{item_id}` soft-deletes the item (`status = 'deleted'`) so history and its
  snapshots remain, and returns 204.

**Rationale**: The complete/undo responses give the client everything needed to refresh queries and
show warnings. Soft deletion preserves audit history as required. A single transaction protects the
snapshot/advance invariant.

**Alternatives considered**: Returning only the log on completion (rejected: forces an extra
round-trip and can show stale state); hard-deleting items (rejected: breaks history linkage and the
"history survives deletion" requirement); separate undo endpoints for one-time and recurring items
(rejected: unnecessary).

## 14. API Recurrence and Date Input Validation

**Decision**: The API accepts a discriminated `due` input:

- `{ "kind": "date", "date": "YYYY-MM-DD" }` for date-only items.
- `{ "kind": "datetime", "at": "ISO-8601 with offset" }` for timed items.

The response always exposes `due_at_utc` (UTC ISO-8601 instant) and `is_date_only`, plus
`due_local_date` and `due_local_time` for display convenience. The API accepts and returns
`recurrence_end_date` as a local date and persists `recurrence_end_at_utc`; all other recurrence
inputs use the exact persisted fields. If a schedule-anchored month/year recurrence omits
`recurrence_anchor_day`, the server derives it from the local due date at the API boundary; if
supplied inconsistently, validation returns 422.
`recurrence_interval` must be 1 for fixed frequencies and at least 1 for custom frequencies. End
fields must not both be set. One-time items must not set recurrence fields.

**Rationale**: Discriminated input avoids ambiguous date-vs-datetime parsing and keeps validation
strict. Server-side derivation prevents an inconsistent anchor day. Exposing local convenience
fields keeps the client from doing timezone math.

**Alternatives considered**: Accepting only `due_at_utc` + `is_date_only` (rejected: forces the
client to compute end-of-day in the app timezone); accepting a union without a discriminator
(rejected: ambiguous OpenAPI/Pydantic behavior); deriving anchor day only from the client (rejected:
allows invalid persisted combinations).

## 15. Frontend Architecture

**Decision**: Build the SPA with React 19, Vite, and TypeScript strict mode. Use Tailwind CSS and
`shadcn/ui` primitives (Radix-based) for accessible dialogs, popovers, inputs, buttons, and menus.
Support dark mode via a `class`-based theme toggle persisted in `localStorage`, defaulting to the
system preference. Use TanStack Query for server state, with query keys for item lists (including
filter state) and history. Use React Router for the dashboard and history views. Configure the Vite
dev server to proxy `/api` to `http://127.0.0.1:8000`. In production, FastAPI serves the built
`frontend/dist` files while keeping `/api` routes authoritative.

Keyboard-first behavior: `N` opens quick-add, `/` focuses search, `J`/`K` move the active item,
`Enter` opens details, `C` completes the active item, `E` edits, `Delete` opens delete confirmation,
`?` opens shortcut help, and `Esc` closes dialogs. Focus is visible and trapped in dialogs. Shortcuts
are disabled while typing in inputs, textareas, or contenteditable elements.

**Rationale**: The stack is mandated. TanStack Query keeps cache invalidation predictable after
create/edit/delete/complete/undo. Deriving badge colors and formatting in small utilities keeps
components simple. A single proxy target matches the backend contract.

**Alternatives considered**: Next.js (rejected: not mandated and adds server complexity); Redux
(rejected: unnecessary for local server state); hand-rolled fetch caching (rejected: more
error-prone); storing theme only in memory (rejected: poor UX); adding router state to every query
key (rejected: filters alone determine the dashboard query).

## 16. Category Badge Color Derivation

**Decision**: Hash the normalized category label (trimmed, case-folded) to an index in a fixed
palette of accessible color pairs. Use the same palette index for light and dark variants. Render
the label as a badge with sufficient contrast. Empty or null categories render no badge.

**Rationale**: Provides stable, distinct colors without storing color or adding a table, satisfying
the visual intent of FR-035 under the mandated model. Hash-based selection is deterministic across
restarts and clients.

**Alternatives considered**: Random colors (rejected: unstable); a single color for all categories
(rejected: poor distinction); storing a color in the category string (rejected: see decision 10).

## 17. Testing Strategy

**Decision**:

- Domain unit tests cover every bucket boundary, DST-sensitive local-day cases, sort order, all
  frequency/anchor combinations, month-end clamping and snap-back, leap years, inclusive end dates,
  remaining-count exhaustion, fast-forwarding, and completion-anchored arithmetic. They use fixed
  aware datetimes and never touch SQLite or FastAPI.
- API integration tests use `TestClient` with a temporary database and a fixed clock. They cover
  CRUD validation, filter/search combinations, completion transactions, next-occurrence creation,
  undo in untouched/touched/older/deleted cases, history ordering, history deletion, and persistence
  across reopening the database.
- Frontend tests cover quick-add keyboard flow, shortcut help, filter interactions, optimistic-free
  query invalidation behavior, undo warning display, and confirmation dialogs. The build gate catches
  type errors.
- No test depends on the wall clock or the developer's timezone.

**Rationale**: The highest-risk logic is recurrence and undo, both of which are pure/transactional
and easy to test deterministically. Integration tests verify the Pydantic/OpenAPI contract and
SQLite invariants. This satisfies Principle V's verification requirement.

**Alternatives considered**: End-to-end browser tests only (rejected: slow and poor failure
localization); property-based tests as the primary strategy (rejected: unnecessary for v1, though
they may supplement recurrence cases); snapshot tests for the whole UI (rejected: brittle).

## 18. Quality Gates and CI-Style Commands

**Decision**: The required gates are:

```bash
cd backend
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy src

cd ../frontend
npm run build
```

`npm run build` runs `tsc -b && vite build`. Frontend unit tests are run with
`npm run test:run` when tests are added. A task is complete only when all applicable gates pass.
Commits are made per analyzed task, as required by the constitution.

**Rationale**: Matches the user's exact quality gates and the constitution's development workflow.
Backend type checking uses mypy (the user allowed mypy or pyright; mypy is chosen for one toolchain).

**Alternatives considered**: pyright (acceptable alternative but not both); skipping type checking
for tests (rejected: test helpers benefit from typing); running gates only in CI (rejected: local
feedback is faster and required here).

## 19. Security and Privacy Posture

**Decision**: Bind Uvicorn to `127.0.0.1` by default and document that exposing the server to a
network is unsupported. Do not add authentication, telemetry, analytics, external fonts, or remote
API calls. Serve frontend assets locally. Validate all input with Pydantic and parameterized SQL.
Use no secrets. Store the database in a local path configurable by `DUE_TRACK_DB_PATH`.

**Rationale**: This is a local-first single-user application. Avoiding network exposure and remote
dependencies protects privacy and reduces complexity.

**Alternatives considered**: Adding token auth (rejected: no remote access in v1); using a hosted
database (rejected by the constitution); loading remote fonts/CDNs (rejected: breaks offline use and
privacy).

## 20. Resolved Clarifications

All specification clarifications are incorporated:

- Completion snapshots include notes and all displayed fields.
- Recurrence end dates are inclusive.
- Deleting an active recurring item stops the entire series and preserves history.
- Categories are free-text labels with deterministic colors; there is no separate category CRUD.
- The configured application timezone is the single source of truth for local dates and buckets.
- Editing a recurrence policy recalculates immediately but preserves a manually edited current
  occurrence.
- Undo restores untouched occurrences in place and restores touched occurrences as new items.

No `NEEDS CLARIFICATION` markers remain.
