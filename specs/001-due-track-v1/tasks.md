# Tasks: due-track v1 — Personal Deadline & Obligation Tracker

**Input**: Design documents from `/workspace/due-track/specs/001-due-track-v1/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/openapi.yaml`, `quickstart.md`, and `.specify/memory/constitution.md`

**Contract**: [`contracts/openapi.yaml`](./contracts/openapi.yaml) is authoritative for all `/api` routes and response shapes.

**Tests**: Included because Constitution Principle V requires automated tests for every behavior change and regression coverage for bugs. Write each test task first and verify it fails before implementing the corresponding behavior.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and delivered independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story label (`US1`–`US5`); only used in user-story phases
- Every task includes an exact file path or command location

## Path Conventions

- Backend: `backend/src/due_track/`, `backend/tests/`
- Frontend: `frontend/src/`, `frontend/tests/`
- Contracts: `contracts/openapi.yaml`
- Feature docs: `specs/001-due-track-v1/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the two-part monorepo and shared tooling.

- [X] T001 Create the monorepo layout and move root `pyproject.toml`, `.python-version`, and `src/due_track` into `backend/`, preserving the `due_track` import package and removing the root runtime scaffold.
- [X] T002 Update `backend/pyproject.toml` to require Python >=3.12 and declare FastAPI, `uvicorn[standard]`, Pydantic >=2, pytest, httpx, ruff, and mypy; configure ruff line-length 100 and strict mypy for `backend/src/due_track`; add `backend/.python-version` with 3.12.
- [X] T003 [P] Create backend package and test skeletons: `backend/src/due_track/{__init__.py,domain/__init__.py,db/__init__.py,api/__init__.py,api/routes/__init__.py}`, `backend/tests/unit/domain/`, and `backend/tests/integration/api/`.
- [X] T004 [P] Initialize React 19 + Vite + TypeScript in `frontend/` with `frontend/package.json`, strict `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`, and scripts `dev`, `build` (`tsc -b && vite build`), `test:run`, and `preview`.
- [X] T005 Install and configure Tailwind CSS, shadcn/ui dependencies, `frontend/components.json`, `frontend/src/styles/index.css`, and the `@/*` alias in `frontend/tsconfig.json` and `frontend/vite.config.ts`.
- [X] T006 Configure the Vite dev proxy in `frontend/vite.config.ts` so `/api` forwards to `http://127.0.0.1:8000`.
- [X] T007 Configure class-based dark mode in `frontend/src/styles/index.css` and `frontend/src/components/ThemeProvider.tsx`, defaulting to the system preference and persisting the choice in localStorage.
- [X] T008 Add shadcn/ui primitives Button, Input, Textarea, Select, Dialog, AlertDialog, Badge, Checkbox, Label, and Separator under `frontend/src/components/ui/`.
- [X] T009 Add the TanStack Query client and React Router shell in `frontend/src/main.tsx` and `frontend/src/App.tsx`, including placeholder dashboard and `/history` routes.
- [X] T010 Add the Vitest + React Testing Library harness in `frontend/package.json`, `frontend/vitest.config.ts`, and `frontend/tests/setup.ts`.
- [X] T011 [P] Update `.gitignore` for `backend/data/*.sqlite3*`, `.env`, `node_modules/`, `dist/`, and Python caches; add backend/frontend install and run commands to `README.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core configuration, storage, API skeleton, and shared frontend foundations.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T012 Implement `backend/src/due_track/config.py` with `DUE_TRACK_DB_PATH` defaulting to `backend/data/due-track.sqlite3`, `DUE_TRACK_TIMEZONE` defaulting to the host local zone and validated by `ZoneInfo`, `DUE_TRACK_CURRENCY` defaulting to `USD` and matching `^[A-Z]{3}$`, `DUE_TRACK_HOST` default `127.0.0.1`, `DUE_TRACK_PORT` default `8000`, and optional `DUE_TRACK_NOW_OVERRIDE` ISO-8601.
- [X] T013 Implement `backend/src/due_track/db/connection.py` with a `sqlite3` connection factory using a row factory and applying `PRAGMA foreign_keys = ON`, `PRAGMA journal_mode = WAL`, `PRAGMA synchronous = NORMAL`, and `PRAGMA busy_timeout = 5000`; create the database parent directory.
- [X] T014 Implement `backend/src/due_track/db/migrate.py` with a `schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at_utc TEXT NOT NULL)` table, ordered discovery of `NNNN_name.up.sql` and `NNNN_name.down.sql` under `backend/src/due_track/db/migrations/`, and apply/rollback commands.
- [X] T015 [P] Create `backend/src/due_track/db/migrations/0001_due_items.up.sql` and `.down.sql` with exactly the `due_items` columns id, title, notes, due_at_utc, is_date_only, category, priority, amount_cents, recurrence_freq, recurrence_interval, recurrence_anchor_mode, recurrence_anchor_day, recurrence_end_at_utc, recurrence_remaining_count, status, created_at_utc, updated_at_utc; CHECK constraints: title trimmed 1–200, notes <=10000, category null or trimmed 1–50, priority in (low, medium, high, critical), amount_cents null or >=0, recurrence_freq in (none, daily, weekly, monthly, yearly, custom_days, custom_weeks, custom_months, custom_years), recurrence_interval >=1 and exactly 1 for fixed frequencies, recurrence_anchor_mode in (schedule, completion), recurrence_anchor_day null or 1–31 with required anchor for schedule-anchored month/year rules and null for day/week or completion-anchored rules, recurrence_end_at_utc null or UTC ISO-8601 instant, recurrence_remaining_count null or >=0 with active count >=1, at most one end field, and status in (active, completed, deleted); add the four partial active indexes from `specs/001-due-track-v1/data-model.md`.
- [X] T016 [P] Implement boundary time utilities in `backend/src/due_track/api/time.py` and unit tests in `backend/tests/unit/test_time.py`: parse discriminated due input, convert date-only values to 23:59:59.999999 in the configured application timezone then UTC, convert local `recurrence_end_date` to `recurrence_end_at_utc` and back, convert UTC to local date/time, and expose boundary-supplied local calendar components; this is the only module that performs timezone conversion (`config.py` may import `ZoneInfo` solely to validate the IANA name), and it never calls `datetime.now()`.
- [X] T017 [P] Implement API error models and handlers in `backend/src/due_track/api/errors.py`, mapping not-found to 404 `{detail}`, conflicts to 409 `{detail}`, and FastAPI validation failures to 422 `{detail: [...]}`.
- [X] T018 Implement `backend/src/due_track/api/deps.py` with settings, per-request SQLite connection, and clock dependencies; the configured timezone is consumed only by `backend/src/due_track/api/time.py`; the clock returns `DUE_TRACK_NOW_OVERRIDE` when set, otherwise `datetime.now(timezone.utc)`.
- [ ] T019 Implement `backend/src/due_track/api/app.py` with a FastAPI app factory, `/api` router mounting, startup migration application, and the handlers from `backend/src/due_track/api/errors.py`.
- [ ] T020 Create `backend/tests/conftest.py` with an isolated temporary SQLite database fixture, migrated schema, fixed-clock fixture, settings override, and FastAPI `TestClient` fixture.
- [ ] T021 [P] Create `frontend/src/api/types.ts` and `frontend/src/api/client.ts` mirroring `contracts/openapi.yaml`, including DueItem, DueInput, ItemCreate, ItemUpdate, ItemListResponse, CompletionLog, CompleteResponse, UndoResponse, HistoryResponse, and a typed fetch wrapper that surfaces `{detail}` errors.
- [ ] T022 [P] Implement `frontend/src/components/AppShell.tsx` with navigation to Dashboard and History, a theme toggle, and accessible focus-visible styles.
- [ ] T023 [P] Implement `frontend/src/lib/format.ts` with `Intl.DateTimeFormat` local date/time formatting for timed and date-only items and `Intl.NumberFormat` currency formatting from integer cents and the API `currency_code`.

**Checkpoint**: Foundation ready. User stories can begin.

---

## Phase 3: User Story 1 — Track and organize deadlines (Priority: P1) 🎯 MVP

**Goal**: Create, view, edit, and delete due items; group every active item into exactly one status bucket; show the summary; persist data.

**Independent Test**: Create items with different due dates, priorities, categories, and recurrence settings; confirm each appears once in the correct bucket and order, edits reclassify correctly, deletes remove active items, and data survives a restart.

### Tests for User Story 1 (required)

> Write these tests first and verify they fail before implementation.

- [ ] T024 [P] [US1] Write domain bucket tests in `backend/tests/unit/domain/test_status.py` covering overdue earlier today, due exactly now, date-only end-of-local-day values, local midnight/DST cases supplied by the boundary, Upcoming days 1–7, Later day 8, and exactly-one-bucket classification; domain tests must pass UTC instants and naive local dates without any timezone conversion.
- [ ] T025 [P] [US1] Write domain sorting tests in `backend/tests/unit/domain/test_sorting.py` covering due date ascending, priority descending (critical > high > medium > low), and case-insensitive title ascending.
- [ ] T026 [P] [US1] Write API integration tests in `backend/tests/integration/api/test_items.py` for GET/POST/PATCH/DELETE `/api/items`, title length 1 and 200 accepted / 0 and 201 rejected, missing due rejected, notes/category/amount constraints, date-only end-of-day and UTC persistence, inclusive local `recurrence_end_date` converted to `recurrence_end_at_utc`, app-timezone bucket boundaries, bucket order, summary totals (amount-free items excluded and zero amounts contributing zero), soft delete, and persistence across app restart.
- [ ] T027 [P] [US1] Write frontend tests in `frontend/tests/dashboard.test.tsx` for rendering buckets and summary, creating/editing items, delete confirmation, deterministic category-label badges, and plain-text notes rendering without HTML execution.

### Implementation for User Story 1

- [ ] T028 [P] [US1] Implement `backend/src/due_track/domain/status.py` with pure bucket classification and summary functions that accept explicit UTC instants plus boundary-supplied local dates, implement the exact Overdue/Due Today/Upcoming/Later rules, and import neither FastAPI, sqlite3, nor `ZoneInfo`; the module performs no timezone conversion.
- [ ] T029 [P] [US1] Implement `backend/src/due_track/domain/sorting.py` with the bucket sort key: due instant ascending, priority rank critical > high > medium > low, then title case-insensitive ascending.
- [ ] T030 [P] [US1] Implement `backend/src/due_track/api/schemas.py` US1 models DueInput, DueItem, ItemCreate, ItemUpdate, DashboardSummary, Buckets, and ItemListResponse with strict Pydantic v2 validation, defaults priority=medium and recurrence=none with schedule anchor, and the exact constraints from `specs/001-due-track-v1/data-model.md` (title 1–200 trimmed, notes <=10000, category label null or 1–50 trimmed, priority enum, amount_cents null or >=0, recurrence enums, interval rules, anchor rules, local `recurrence_end_date`, at most one end field). `recurrence_remaining_count` is initialized from the requested total occurrences and includes the current occurrence.
- [ ] T031 [US1] Implement `backend/src/due_track/db/items_repository.py` with parameterized insert, get-active, list-active, update, and soft-delete functions over `due_items`, including row mapping to the API model.
- [ ] T032 [US1] Implement `backend/src/due_track/api/routes/items.py` for US1 using `backend/src/due_track/api/time.py` for all UTC/local conversion: GET `/api/items` returns active items grouped into four buckets plus summary and `currency_code`/`timezone`; POST creates; PATCH updates only active items; DELETE soft-deletes with 204; invalid input returns 422 and missing/completed/deleted items return 404.
- [ ] T033 [US1] Mount the items router under `/api` in `backend/src/due_track/api/app.py` and run `uv run pytest backend/tests/integration/api/test_items.py` from `backend/`.
- [ ] T034 [P] [US1] Implement `frontend/src/lib/categories.ts` with a deterministic hash of the trimmed, case-folded category label to a fixed accessible light/dark palette; return no badge for null/empty labels and update the badge when a label changes or is cleared.
- [ ] T035 [P] [US1] Implement `frontend/src/hooks/useItems.ts` with TanStack Query list/create/update/delete hooks, query keys, and cache invalidation for all item mutations.
- [ ] T036 [US1] Implement `frontend/src/components/ItemForm.tsx` with title, notes, due kind (date/datetime), category label, priority, amount dollars converted to integer cents, and recurrence controls for frequency, interval, anchor mode, anchor day, inclusive end date, and remaining count (labeled “occurrences remaining, including this one”); show field-level validation errors and focus the title on open.
- [ ] T037 [US1] Implement `frontend/src/components/ItemCard.tsx` and `frontend/src/components/BucketSection.tsx` to render due date/time, priority, deterministic category badge, amount, recurrence summary, and notes as plain text with `white-space: pre-wrap` and no `dangerouslySetInnerHTML`.
- [ ] T038 [P] [US1] Implement `frontend/src/components/ConfirmDialog.tsx` using the shadcn AlertDialog primitive with explicit confirm/cancel actions, keyboard trapping, and visible focus.
- [ ] T039 [US1] Implement `frontend/src/pages/DashboardPage.tsx` to render the four buckets and summary from `GET /api/items`, open the create/edit form, and require confirmation before delete.
- [ ] T040 [US1] Wire the dashboard route in `frontend/src/App.tsx` and verify `npm run build` in `frontend/`.
- [ ] T041 [US1] Run the US1 quality gates from `specs/001-due-track-v1/plan.md`: `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`, and `uv run mypy src` in `backend/`, plus `npm run test:run` and `npm run build` in `frontend/`.

**Checkpoint**: User Story 1 is fully functional and testable independently. This is the MVP.

---

## Phase 4: User Story 2 — Complete items and advance recurring obligations (Priority: P2)

**Goal**: Record completions, move one-time items to history, and advance recurring items to exactly one next occurrence according to frequency, anchor mode, and end condition.

**Independent Test**: Complete one-time and recurring items across every supported frequency, anchor mode, and end condition; verify the completion record and the next due occurrence, including month-end and leap-year cases.

### Tests for User Story 2 (required)

- [ ] T042 [P] [US2] Write recurrence unit tests in `backend/tests/unit/domain/test_recurrence.py` for daily, weekly, monthly, yearly, custom days/weeks/months/years, schedule vs completion anchoring, month-end clamp/snap-back, Feb 29 leap years, inclusive local end dates, initial total converted to remaining count, decrement behavior, fast-forward after missed occurrences, and early completion; pass naive local calendar components without timezone conversion.
- [ ] T043 [P] [US2] Write completion API tests in `backend/tests/integration/api/test_completion.py` for one-time completion returning `item: null`, recurring advancement, no next occurrence at end, initial total-to-remaining count behavior, transaction rollback, and PATCH recurrence recalculation preserving a manually edited occurrence; verify UTC persistence and boundary-only local conversion.
- [ ] T044 [P] [US2] Write frontend completion tests in `frontend/tests/completion.test.tsx` for the complete action, item list invalidation, and next-due display.

### Implementation for User Story 2

- [ ] T045 [P] [US2] Create `backend/src/due_track/db/migrations/0002_completion_logs.up.sql` and `.down.sql` with exactly columns id, item_id `REFERENCES due_items(id) ON DELETE SET NULL`, scheduled_due_at_utc, completed_at_utc, previous_state_snapshot_json `CHECK (json_valid(...))`, and indexes on `completed_at_utc DESC` and `(item_id, completed_at_utc DESC)`.
- [ ] T046 [US2] Implement `backend/src/due_track/db/history_repository.py` with insert-completion-log, latest-log-for-item, and count-completions functions using parameterized SQL and `BEGIN IMMEDIATE` for completion writes.
- [ ] T047 [P] [US2] Implement `backend/src/due_track/domain/recurrence.py` with pure advancement functions that accept the current UTC due instant, UTC completion instant, boundary-supplied local date/time components, recurrence policy, and local end date; return the next naive local date/time or None; implement all schedule/completion anchor rules; clamp month-end/leap-year dates; enforce inclusive end dates and remaining counts; import no `ZoneInfo`, never convert timezones, and never call `datetime.now()`.
- [ ] T048 [P] [US2] Add completion response schemas to `backend/src/due_track/api/schemas.py`: CompletionLog with snapshot `previous_state`, `spawned_next_occurrence`, `next_due_at_utc`, `can_undo`, and CompleteResponse with `{log, item}` where item is DueItem or null.
- [ ] T049 [US2] Implement `POST /api/items/{item_id}/complete` in `backend/src/due_track/api/routes/items.py` as one transaction: use `backend/src/due_track/api/time.py` to derive local inputs, build the snapshot envelope with all previous fields and generated/next metadata, insert the completion log, mark one-time items completed, or advance recurring items via `backend/src/due_track/domain/recurrence.py`, localize the returned next local date/time to UTC, decrement `recurrence_remaining_count` only when a next occurrence is created (set a count-limited series to `0` when it ends), and return CompleteResponse.
- [ ] T050 [US2] Extend PATCH `/api/items/{item_id}` in `backend/src/due_track/api/routes/items.py` to recalculate the current occurrence immediately when recurrence policy changes, using boundary-supplied local inputs and the latest completion log for the anchor, preserving a manually edited occurrence (`updated_at_utc > completed_at_utc`), and ending the series when the new policy has no valid next occurrence.
- [ ] T051 [P] [US2] Implement `frontend/src/hooks/useCompleteItem.ts` with a TanStack Query mutation for `POST /api/items/{id}/complete` and invalidation of the items query.
- [ ] T052 [US2] Add a complete button to `frontend/src/components/ItemCard.tsx` that calls the completion mutation, shows a pending state, and refreshes the dashboard.
- [ ] T053 [US2] Run the US2 quality gates from `specs/001-due-track-v1/plan.md` and the completion tests in `backend/tests/integration/api/test_completion.py` and `frontend/tests/completion.test.tsx`.

**Checkpoint**: User Stories 1 and 2 work independently; recurring completion is reliable.

---

## Phase 5: User Story 3 — Focus the dashboard with filters and search (Priority: P3)

**Goal**: Filter by category, priority, and recurrence type; search titles and notes live; combine all conditions; keep the summary consistent with the filtered set.

**Independent Test**: Create a mixed item set, apply each filter individually and in combination, run partial and case-insensitive searches, clear all filters, and confirm the full list returns with matching summary counts and totals.

### Tests for User Story 3 (required)

- [ ] T054 [P] [US3] Write API filter tests in `backend/tests/integration/api/test_filters.py` for category (case-insensitive exact), priority, recurring true/false, `q` across title/notes (case-insensitive partial), AND combinations, clear-all, no matches, and summary consistency with filtered buckets.
- [ ] T055 [P] [US3] Write frontend filter tests in `frontend/tests/filters.test.tsx` for each control, combined filters, live debounced search, clear-all, and the no-results message.

### Implementation for User Story 3

- [ ] T056 [US3] Extend `backend/src/due_track/db/items_repository.py` list-active with optional `category` (case-insensitive exact), `priority`, `recurring` (freq != none / = none), and `q` (escaped LIKE across title and notes) filters combined with AND, over active items only.
- [ ] T057 [US3] Extend GET `/api/items` in `backend/src/due_track/api/routes/items.py` to accept `category`, `priority`, `recurring`, and `q` query parameters, pass them to the repository, and compute buckets/summary from the filtered set.
- [ ] T058 [P] [US3] Implement `frontend/src/components/FilterBar.tsx` with category-label text input/datalist, priority select, recurrence select, debounced search input, and a clear-all action.
- [ ] T059 [US3] Update `frontend/src/hooks/useItems.ts` query keys to include filter state and wire `frontend/src/pages/DashboardPage.tsx` to FilterBar, the no-results state, and the filtered summary.
- [ ] T060 [US3] Run the US3 quality gates from `specs/001-due-track-v1/plan.md` and the filter tests in `backend/tests/integration/api/test_filters.py` and `frontend/tests/filters.test.tsx`.

**Checkpoint**: User Stories 1–3 work independently; the dashboard is usable with a large personal list.

---

## Phase 6: User Story 4 — Review history and safely undo mistakes (Priority: P4)

**Goal**: Review completions in reverse chronological order from self-contained snapshots, undo only the latest completion, preserve touched occurrences with a warning, and delete history entries only after confirmation.

**Independent Test**: Complete several items, inspect history order and snapshot details, undo the most recent completion both untouched and touched, attempt an older undo, delete a history entry with confirm/cancel, and verify active items are never altered by history deletion.

### Tests for User Story 4 (required)

- [ ] T061 [P] [US4] Write API history/undo tests in `backend/tests/integration/api/test_history.py` for reverse-chronological order, pagination, snapshot completeness including enriched derived fields, `can_undo` latest/older/deleted behavior, undo untouched restoring the same item ID, undo touched preserving the edited row and restoring the prior occurrence with a new ID and warning, and history deletion leaving active items unchanged.
- [ ] T062 [P] [US4] Write frontend history tests in `frontend/tests/history.test.tsx` for reverse-chronological rendering, snapshot details, undo availability, preservation warning, and delete confirmation.

### Implementation for User Story 4

- [ ] T063 [US4] Extend `backend/src/due_track/db/history_repository.py` with list-history (reverse chronological, limit/offset, total), get-log, latest-log-for-item, and delete-log functions using parameterized SQL.
- [ ] T064 [P] [US4] Add history/undo schemas to `backend/src/due_track/api/schemas.py`: HistoryResponse `{entries, total}`, UndoResponse `{restored_item, preserved_touched_occurrence, warning}`, and CompletionLog fields from `contracts/openapi.yaml`; explicitly enrich `previous_state` with `due_local_date`, `due_local_time`, `is_recurring`, and local `recurrence_end_date` derived at the API boundary.
- [ ] T065 [US4] Implement `GET /api/history` and `DELETE /api/history/{log_id}` in `backend/src/due_track/api/routes/history.py`, including reverse-chronological pagination, self-contained snapshots mapped to typed enriched responses, `can_undo`, and 404/204 behavior.
- [ ] T066 [US4] Implement `POST /api/history/{log_id}/undo` in `backend/src/due_track/api/routes/history.py`: allow only the latest completion of an existing non-deleted item; restore in place with the existing item ID when `updated_at_utc == completed_at_utc`; otherwise insert the snapshot as a new active row with a new ID, keep the touched occurrence, and return the warning.
- [ ] T067 [P] [US4] Implement `frontend/src/hooks/useHistory.ts` with TanStack Query history list, undo, and delete mutations plus items/history invalidation.
- [ ] T068 [US4] Implement `frontend/src/pages/HistoryPage.tsx` to render snapshot fields, original due date, completion timestamp, `can_undo`, a preservation warning, and confirmed deletion.
- [ ] T069 [US4] Wire the `/history` route in `frontend/src/App.tsx` and verify `npm run build` in `frontend/`.
- [ ] T070 [US4] Run the US4 quality gates from `specs/001-due-track-v1/plan.md` and the history tests in `backend/tests/integration/api/test_history.py` and `frontend/tests/history.test.tsx`.

**Checkpoint**: User Stories 1–4 work independently; completion history is a safe audit trail.

---

## Phase 7: User Story 5 — Operate keyboard-first (Priority: P5)

**Goal**: Quick-add, navigate, open, edit, complete, and delete items using only the keyboard, with visible focus and discoverable shortcuts.

**Independent Test**: Using only the keyboard, quick-add an item, move between visible items, complete one, open help, and close overlays; confirm shortcuts do not fire while typing and focus always remains visible.

### Tests for User Story 5 (required)

- [ ] T071 [P] [US5] Write keyboard shortcut tests in `frontend/tests/shortcuts.test.tsx` for N quick-add focusing the title, `/` search, J/K navigation with visible active state, Enter open, C complete, E edit, Delete confirmation, `?` help, Esc close, and suppression while typing in inputs/textarea/contenteditable.

### Implementation for User Story 5

- [ ] T072 [P] [US5] Implement `frontend/src/lib/shortcuts.ts` with the shortcut definitions, labels, and help descriptions from `specs/001-due-track-v1/plan.md`.
- [ ] T073 [US5] Implement `frontend/src/hooks/useShortcuts.ts` with global keydown handling, input-target suppression, preventDefault where needed, and active-item navigation callbacks.
- [ ] T074 [P] [US5] Implement `frontend/src/components/ShortcutHelp.tsx` using the shadcn Dialog primitive with a focus trap, Esc close, and all shortcuts listed.
- [ ] T075 [US5] Add visible focus rings, an active-item highlight, and ARIA labels to `frontend/src/components/ItemCard.tsx` and `frontend/src/components/AppShell.tsx`.
- [ ] T076 [US5] Wire shortcuts in `frontend/src/pages/DashboardPage.tsx`: N opens ItemForm with title focus, `/` focuses search, J/K moves the active item, Enter opens details, C completes, E edits, Delete opens confirmation, `?` opens ShortcutHelp, and Esc closes overlays.
- [ ] T077 [US5] Run the US5 quality gates from `specs/001-due-track-v1/plan.md` and the shortcut tests in `frontend/tests/shortcuts.test.tsx`.

**Checkpoint**: All five user stories work independently and together.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Production serving, contract validation, cross-story verification, documentation, and final quality gates.

- [ ] T078 [P] Implement production serving in `backend/src/due_track/main.py` to start Uvicorn on `DUE_TRACK_HOST`/`DUE_TRACK_PORT` and serve `frontend/dist` assets while keeping `/api` authoritative.
- [ ] T079 [P] Add an OpenAPI/route consistency test in `backend/tests/integration/api/test_openapi_contract.py` that loads `contracts/openapi.yaml`, verifies every documented path/method exists in the FastAPI app, and validates representative response bodies against their documented schemas.
- [ ] T080 [P] Add a cross-story workflow test in `backend/tests/integration/api/test_workflows.py` covering create → filter → complete → history → undo → delete-item → delete-history.
- [ ] T081 [P] Add a performance smoke test in `backend/tests/integration/api/test_performance.py` seeding 1,000 active items and asserting `GET /api/items` with filters completes under 1 second.
- [ ] T082 [P] Update `README.md` and `CHANGELOG.md` with setup/run/quality commands and document the free-text category-label model, the two-table schema, and the `api/time.py` boundary-only timezone rule.
- [ ] T083 [P] Review `backend/src/due_track` and `frontend/src` for loopback binding, no telemetry/external requests, plain-text notes rendering, parameterized SQL, no timezone conversion outside `api/time.py`, and no secrets; record any caveat in `specs/001-due-track-v1/quickstart.md`.
- [ ] T084 Run the full quality gate from `specs/001-due-track-v1/plan.md`: backend pytest, ruff check, ruff format --check, mypy, frontend `test:run`, and frontend build.
- [ ] T085 Execute the manual validation scenarios in `specs/001-due-track-v1/quickstart.md` and confirm all checkpoints, including category-label changes, boundary-only timezone behavior, and a timed quick-add under 30 seconds.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion; blocks every user story.
- **User Stories (Phases 3–7)**: Depend on Foundational completion. They can proceed in parallel or in priority order.
- **Polish (Phase 8)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Starts after Foundational; no dependency on other stories. Delivers the MVP.
- **US2 (P2)**: Starts after Foundational; uses the `due_items` schema from US1 and the items UI, so run after US1 or coordinate the shared files.
- **US3 (P3)**: Starts after Foundational; extends the US1 list endpoint and dashboard.
- **US4 (P4)**: Starts after US2; history requires completion logs.
- **US5 (P5)**: Starts after US1 and US2; keyboard completion and navigation use the items/completion UI.

### Within Each User Story

- Tests first; verify they fail before implementation.
- Domain pure functions before repository and route orchestration.
- Pydantic schemas before routes.
- Repository functions before routes.
- Routes before frontend hooks and pages.
- Run the story gates before moving to the next priority.

### Shared-File Coordination

- `backend/src/due_track/api/schemas.py` is extended by US1, US2, and US4; serialize those edits.
- `backend/src/due_track/api/routes/items.py` is extended by US1, US2, and US3; serialize those edits.
- `backend/src/due_track/db/items_repository.py` is extended by US1 and US3; serialize those edits.
- `frontend/src/hooks/useItems.ts` is extended by US1 and US3; serialize those edits.
- `frontend/src/pages/DashboardPage.tsx` is extended by US1, US3, and US5; serialize those edits.
- `frontend/src/components/ItemCard.tsx` is extended by US1, US2, and US5; serialize those edits.

---

## Parallel Opportunities

- Setup: T003, T004, and T011 can run together after T001; T005–T010 are sequential because they build on the frontend scaffold.
- Foundational: T015, T016, T017, T021, T022, and T023 can run in parallel once their prerequisites exist; T012–T014 and T018–T020 are sequential.
- US1: T024–T027 can be written in parallel; T028–T030 can be implemented in parallel; T034–T035 and T038 can be implemented in parallel; T031–T033 and T036–T037 are ordered.
- US2: T042–T045 can run in parallel; T047–T048 and T051 can run in parallel; T046, T049, T050, and T052 are ordered.
- US3: T054–T055 can run in parallel; T056–T057 are ordered, while T058 can start once the contract is stable; T059 depends on T057 and T058.
- US4: T061–T062 can run in parallel; T064 and T067 can run in parallel; T063, T065, T066, T068, and T069 are ordered.
- US5: T071–T072 and T074 can run in parallel; T073, T075, T076, and T077 are ordered.
- Polish: T078–T083 can run in parallel; T084 and T085 are ordered.

### Parallel Example: User Story 1

```bash
# Write the US1 tests together
Task: "Write domain bucket tests in backend/tests/unit/domain/test_status.py"
Task: "Write domain sorting tests in backend/tests/unit/domain/test_sorting.py"
Task: "Write API integration tests in backend/tests/integration/api/test_items.py"
Task: "Write frontend tests in frontend/tests/dashboard.test.tsx"

# Implement the independent pure modules and shared frontend pieces together
Task: "Implement backend/src/due_track/domain/status.py"
Task: "Implement backend/src/due_track/domain/sorting.py"
Task: "Implement backend/src/due_track/api/schemas.py"
Task: "Implement frontend/src/lib/categories.ts"
Task: "Implement frontend/src/hooks/useItems.ts"
Task: "Implement frontend/src/components/ConfirmDialog.tsx"
```

### Parallel Example: User Story 2

```bash
Task: "Write recurrence unit tests in backend/tests/unit/domain/test_recurrence.py"
Task: "Write completion API tests in backend/tests/integration/api/test_completion.py"
Task: "Write frontend completion tests in frontend/tests/completion.test.tsx"
Task: "Create backend/src/due_track/db/migrations/0002_completion_logs.up.sql and .down.sql"
```

### Parallel Example: User Story 4

```bash
Task: "Write API history/undo tests in backend/tests/integration/api/test_history.py"
Task: "Write frontend history tests in frontend/tests/history.test.tsx"
Task: "Add history/undo schemas to backend/src/due_track/api/schemas.py"
Task: "Implement frontend/src/hooks/useHistory.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (blocks all stories).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: run the US1 independent test scenarios and quality gates.
5. Demo the dashboard with create/edit/delete, buckets, summary, and persistence.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → validate independently → MVP.
3. US2 → validate completion/recurrence independently → deliver.
4. US3 → validate filters/search independently → deliver.
5. US4 → validate history/undo independently → deliver.
6. US5 → validate keyboard-only operation independently → deliver.
7. Polish → production serving, cross-story tests, docs, and final gates.

### Parallel Team Strategy

1. Team completes Setup + Foundational together.
2. Once Foundation is ready:
   - Backend developer: US1 domain/repository/routes, then US2 recurrence/completion, then US4 history/undo.
   - Frontend developer: US1 dashboard/form, then US5 keyboard shell, then US3 filters, then US4 history UI.
   - Test/verification owner: maintain the shared fixtures, contract test, workflow test, and performance smoke test.
3. Serialize edits to the shared files listed under **Shared-File Coordination**.

---

## Notes

- Tests are required by the constitution even though the tasks template marks them optional for other projects.
- Commit each task separately with a Conventional Commit message (`feat(domain): ...`, `feat(api): ...`, `feat(ui): ...`, `test(...)`, `docs(...)`), per `.specify/memory/constitution.md`.
- Never commit failing tests, type checks, linters, or a failing frontend build.
- The two-table model stores categories as free-text labels with deterministic badge colors, exactly as FR-035 specifies. T082 documents the model in `README.md`/`CHANGELOG.md`.
- Keep all domain functions free of FastAPI, sqlite3, and `ZoneInfo` imports, and pass an explicit `reference_time` or UTC instant for every status/recurrence calculation. Only `api/time.py` may convert timezones.
- Persist every timestamp and due boundary as UTC, including `recurrence_end_at_utc`; map local `recurrence_end_date` only at the API boundary.
- Verify timezone safety, SQLite transaction safety, and the strict `/api` boundary before marking each story complete.
