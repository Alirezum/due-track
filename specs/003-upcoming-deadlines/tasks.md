---

description: "Task list for Upcoming-Only Deadline Focus"
---

# Tasks: Upcoming-Only Deadline Focus

**Input**: Design documents from `/workspace/due-track/specs/003-upcoming-deadlines/`

**Prerequisites**: `plan.md` (required), `spec.md` (required for user stories), `research.md`,
`data-model.md`, `contracts/upcoming.openapi.yaml`, `quickstart.md`

**Tests**: Required. Constitution V and `plan.md` require automated tests for every behavior
change. The test tasks below are not optional; write each test first and confirm it fails for the
expected reason before implementing the corresponding behavior.

**Commits**: Constitution Git & Commit Policy requires one commit per completed task. Before each
commit, run the full quality gate: backend (`uv run pytest`, `uv run ruff check .`,
`uv run ruff format --check .`, `uv run mypy src`) and frontend (`npm run test:run`, `npm run lint`,
`npm run build`). Never commit failing code. Do not commit the pre-existing user-owned workspace
files.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested
independently. US1 is the MVP; US2 and US3 build on the same pages but are separately verifiable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Which user story this task belongs to (`US1`, `US2`, `US3`)
- Every task includes an exact file path or directory

## Path Conventions

- **Web app**: `backend/src/`, `backend/tests/`, `frontend/src/`, `frontend/tests/`
- Living contract: `specs/001-due-track-v1/contracts/openapi.yaml`
- Feature contract delta: `specs/003-upcoming-deadlines/contracts/upcoming.openapi.yaml`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the existing monorepo is green before changing behavior.

- [X] T001 Verify baseline quality gates in `backend/` and `frontend/` and record the current pass state: `cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy src`; `cd frontend && npm run test:run && npm run lint && npm run build`. Baseline recorded 2026-11-13: backend 138 passed, ruff clean, format clean, mypy clean; frontend 115 passed, lint clean (3 pre-existing fast-refresh warnings), build clean.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared contract, types, and query plumbing required by every user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Add `ItemScope = Literal["upcoming", "all"]` and `TimelineResponse.overdue_count: int = 0` as a temporary default to `backend/src/due_track/api/schemas.py`; add `scope: ItemScope = "all"` to `ItemFilters` and parse it in `get_item_filters` in `backend/src/due_track/api/filters.py`. Constraint: `scope` is `upcoming | all`, default `all`; invalid values return `422`. The temporary default keeps the existing timeline endpoint green until T018 computes the real count and makes the field required. (Committed atomically with T003: the live contract test uses `additionalProperties: false`, so the schema field and its documented contract must land together.)
- [X] T003 [P] Update the living contract `specs/001-due-track-v1/contracts/openapi.yaml`: add the shared `scope` query parameter (`upcoming | all`, default `all`) to `GET /api/items` and `GET /api/timeline`; add required `overdue_count` (integer, minimum 0) to `TimelineResponse`; document `buckets.overdue = []` with an accurate `summary.overdue_count` for `scope=upcoming`; bump `info.version` to `1.2.0`. Document the 1.2.0 compatibility note: `TimelineResponse` gains one required field; strict 1.1.0 response validators must update to 1.2.0. Bump the app version to `1.2.0` in `backend/src/due_track/api/app.py`. (Committed atomically with T002 for the contract-test reason recorded there.)
- [X] T004 Add foundational backend filter tests in `backend/tests/integration/api/test_filters.py`: `scope` omitted defaults to `all`; `scope=upcoming` and `scope=all` parse; invalid `scope=someday` returns `422`. Depends on T002.
- [X] T005 [P] Add `ItemScope` (`'upcoming' | 'all'`) and required `TimelineResponse.overdue_count` (number) to `frontend/src/api/types.ts`.
- [X] T006 Extend `filtersToQueryString(filters, scope?: ItemScope)` in `frontend/src/lib/filters.ts` to append `scope` only when provided; add cases to `frontend/tests/filters.test.tsx` proving existing filter combinations are unchanged. Depends on T005.
- [X] T007 Update `useItems(filters = EMPTY_FILTERS, scope: ItemScope = 'all', options?)` in `frontend/src/hooks/useItems.ts`: query key `['items', filters, scope]`, keep `placeholderData: keepPreviousData`, and pass `refetchInterval`/`refetchOnWindowFocus` options. The default `all` preserves History and existing callers. Depends on T005.
- [X] T008 Update `useTimeline(filters = EMPTY_FILTERS, scope: ItemScope = 'all')` in `frontend/src/hooks/useTimeline.ts`: query key `['timeline', filters, scope]`, keeping the adaptive refetch interval and server-anchored clock. Depends on T005.
- [X] T009 Update `frontend/tests/timelineFixtures.ts` and existing fixtures in `frontend/tests/dashboard.test.tsx`, `frontend/tests/timeline.test.tsx`, and `frontend/tests/history.test.tsx` for the required `overdue_count` field and scope-aware query keys, keeping all existing assertions passing. Depends on T005, T007, T008.
- [X] T010 Update existing backend timeline/items assertions in `backend/tests/integration/api/test_timeline.py` and `backend/tests/integration/api/test_items.py` for the additive `overdue_count` field (initially `0` from the temporary default) and default `all` behavior, keeping all pre-003 expectations intact. Depends on T002.

**Checkpoint**: Shared contract, types, filters, and hooks are ready; user stories can begin.

---

## Phase 3: User Story 1 - See only what is still ahead (Priority: P1) 🎯 MVP

**Goal**: The Dashboard and Timeline default to deadlines due now or later. A compact overdue indicator
reports an accurate filtered count and reveals every overdue deadline in one action, with a
one-action return to the focused view.

**Independent Test**: Create overdue, due-exactly-now, due-later-today, due-in-a-few-days, and
far-future deadlines. Open the Dashboard and Timeline: only due-now/future entries appear, the
overdue count is accurate, and the reveal action exposes every overdue deadline. Check filters,
date-only boundaries, empty/all-overdue/no-results states, and automatic transition within 60s.

**Frontend design**: Before any frontend task in this phase, load and follow the `frontend-design`
skill (Constitution VI).

### Tests for User Story 1 ⚠️

> Write these tests first and confirm they fail for the expected reason before implementation.

- [X] T011 [P] [US1] Add backend items scope tests in `backend/tests/integration/api/test_items.py`: default `all` unchanged; `scope=upcoming` sets `buckets.overdue` to `[]` while `summary.overdue_count` stays accurate; due-now equality is not overdue; date-only due today remains upcoming; filters combine with scope; completed/deleted items excluded; empty result returns zero counts; timezone boundary. (Committed atomically with T017 after the tests failed for the expected reason, because the quality gate never allows a red commit.)
- [X] T012 [P] [US1] Add backend timeline scope tests in `backend/tests/integration/api/test_timeline.py`: default `all` unchanged; `scope=upcoming` omits entries with `urgency == "overdue"`; `overdue_count` matches the all-scope overdue entries; due-now equality; date-only due today; filters; empty result; timezone. (Committed atomically with T018 after the tests failed for the expected reason.)
- [X] T013 [P] [US1] Add contract tests in `backend/tests/integration/api/test_openapi_contract.py` validating representative `scope=upcoming` items and timeline responses against the updated living schema, including one overdue and one upcoming item; operation parity must still pass.
- [X] T014 [P] [US1] Add forward-only horizon tests in `frontend/tests/horizons.test.ts`: with `includeOverdue=false`, every fixed horizon spans `nowMs` to `nowMs + span`; the 30d default extends to the nearest future deadline when none is inside; `all` ends at the latest future deadline or now; no left edge summary; selection inclusion and right edge reveal still work; an empty forward set still yields a positive-duration window (`endMs > startMs`); `includeOverdue=true` preserves the 002 symmetric window. (Committed atomically with T019 after the tests failed for the expected reason.)
- [X] T015 [P] [US1] Add Dashboard upcoming-focus tests in `frontend/tests/dashboard.test.tsx`: default request uses `scope=upcoming`; zero overdue cards render; indicator count comes from `summary.overdue_count`; reveal/hide; all-overdue, no-upcoming, no-results, and truly empty states; the list region is labeled “Upcoming deadlines” while hidden and “Deadlines including overdue” when revealed, and the deck copy states that overdue deadlines are summarized; hidden-item notice after create/edit; 55-second refetch, window-focus refetch, and a fake-timer crossing-now case that removes the item and increments the count within 60 seconds; all-scope category source retains overdue-only categories; API error with no data shows the Dashboard error state, while error with stale data keeps the cards and adds a retry strip. (Committed atomically with T021 after the tests failed for the expected reason.)
- [X] T016 [P] [US1] Add Timeline upcoming-focus tests in `frontend/tests/timeline.test.tsx`: default request uses `scope=upcoming`; zero overdue markers render; indicator count comes from `overdue_count`; reveal/hide; forward-only window and no left summary while hidden; the canvas region uses the same hidden/revealed labels and deck copy; all-scope category source retains overdue-only categories; empty/no-results/all-overdue states; hidden-item notice distinguishing overdue-hidden (**Show overdue**) from filter-excluded (**Clear filters**); selection handoff when an item crosses now; error with no data and error with stale data states. (Committed atomically with T022 after the tests failed for the expected reason, because the quality gate never allows a red commit.)

### Implementation for User Story 1

- [X] T017 [US1] Implement scope-aware `GET /api/items` in `backend/src/due_track/api/routes/items.py`: read and classify every filtered active item, sort each bucket, compute `summary.overdue_count` before omission, then set `buckets.overdue = []` when `scope=upcoming`. Keep `scope=all` semantically equivalent to the pre-003 payload: same fields, ordering, and values. Depends on T011.
- [X] T018 [US1] Implement scope-aware `GET /api/timeline` in `backend/src/due_track/api/routes/timeline.py`: build every entry with `classify_urgency` and `seconds_until_due`, compute required `overdue_count` (integer ≥ 0, independent of scope), then omit entries whose `urgency == "overdue"` when `scope=upcoming`. Remove the temporary default so `overdue_count` is required in `backend/src/due_track/api/schemas.py`. Keep sorting and reference time unchanged. Depends on T012.
- [X] T019 [US1] Add the `includeOverdue?: boolean` option (default `true`) to `resolveTimelineWindow` in `frontend/src/lib/timeline/horizons.ts`: when false, start at `nowMs`, end fixed spans at `nowMs + span`, extend the 30d default to the nearest future deadline when needed, end `all` at the latest future deadline or now, guarantee a positive-duration window when there are no future entries, and never produce a left edge summary. Depends on T014. (Committed atomically with T014.)
- [X] T020 [P] [US1] Create `frontend/src/components/OverdueIndicator.tsx`: a quiet ledger tab with `aria-labelledby`, visible uppercase `Overdue` label, serif tabular count, and a `Show overdue`/`Hide overdue` button with `aria-expanded`, `aria-controls`, rotating chevron, 40px minimum target, existing rose/timeline-overdue tokens, no new CSS variables, and a muted `Nothing overdue` state when `count === 0`. Props: `id`, `count`, `expanded`, `controls`, `onToggle`, `variant: 'tab' | 'summary'`.
- [X] T021 [US1] Integrate upcoming focus into `frontend/src/pages/DashboardPage.tsx` and `frontend/src/components/BucketSection.tsx`: primary query `useItems(filters, showOverdue ? 'all' : 'upcoming', { refetchInterval: 55_000, refetchOnWindowFocus: true })`; all-scope category source; `keepPreviousData` guard so overdue cards never render while hidden; overdue tab plus revealed `BucketSection` with a Hide action; keyboard focus handoff; empty/all-overdue/no-results states; hidden-item notice via an all-scope `queryClient.fetchQuery` (with the unfiltered category-source fallback) that distinguishes overdue-hidden from filter-excluded and offers **Clear filters** when the active filters exclude the saved item; labeled list region and deck copy; polite “Updating…” indicator; Dashboard error states (no data / stale data with retry). Depends on T015, T017, T020. (Committed atomically with T015.)
- [X] T022 [US1] Integrate upcoming focus into `frontend/src/pages/TimelinePage.tsx`, `frontend/src/components/timeline/TimelineStates.tsx`, and `frontend/src/components/timeline/TimelineLegend.tsx`: query `useTimeline(filters, showOverdue ? 'all' : 'upcoming')`; all-scope category source; `visibleEntries` guard against placeholder data; `overdueCount` from `data.overdue_count`; `activeCount = visibleUpcomingCount + overdueCount`; `resolveTimelineWindow({ entries: visibleEntries, includeOverdue: showOverdue })`; now line at the left margin with a small inset while hidden; conditional legend; empty/no-results/all-overdue and error states (no data / stale data with retry); hidden-item notice distinguishing overdue-hidden from filter-excluded (**Clear filters**); selection handoff; footer copy (“Showing the next 30d from now”) and deck copy. Depends on T016, T018, T019, T020. (Committed atomically with T016; also moved the shared `categoriesFromItemList` helper into `frontend/src/lib/categories.ts` and reused it from the Dashboard.)

**Checkpoint**: The upcoming-only focus is fully functional and independently testable on both pages.

---

## Phase 4: User Story 2 - Keep the deadline view free of expense information (Priority: P2)

**Goal**: No monetary amounts, expense totals, or currency formatting appear in the Dashboard
summary, deadline cards, Timeline markers, or Timeline detail. Stored amounts remain editable and
History remains unchanged.

**Independent Test**: Add deadlines with and without amounts, including one in Upcoming. Inspect the
Dashboard summary, every card, the Timeline, and the detail view: no amount, currency, or expense
total appears. Open Edit and confirm the stored amount is still present and submittable. Open
History and confirm it still shows the amount.

**Frontend design**: Before any frontend task in this phase, load and follow the `frontend-design`
skill (Constitution VI).

### Tests for User Story 2 ⚠️

> Write these tests first and confirm they fail for the expected reason before implementation.

- [X] T023 [P] [US2] Add Dashboard expense-free tests in `frontend/tests/dashboard.test.tsx`: no amount or currency in the summary or cards; the summary shows a `Next 7 days` count equal to `buckets.upcoming.length` instead of an expense total, and due-today/overdue items are not double-counted in that cell; filtering and sorting behavior is unchanged. (Committed atomically with T026 and T028 after the card amount assertion failed for the expected reason.)
- [X] T024 [P] [US2] Add Timeline expense-free tests in `frontend/tests/timeline.test.tsx`: no amount or currency in markers or the detail view; due moment, countdown/status, category, priority, recurrence, and notes remain; detail actions remain. (Committed atomically with T027 after the detail Amount assertion failed for the expected reason.)
- [X] T025 [P] [US2] Add History and edit regression tests in `frontend/tests/history.test.tsx`: History still displays the stored amount; opening and saving an edit does not clear or change `amount_cents`; the edit form still shows and submits the amount; no primary view renders it. API-shape assertions belong to T013 and T032, not this UI test. (Regression coverage passed before T026/T027 because the preserved behavior was already correct; committed separately after the expense-free changes.)

### Implementation for User Story 2

- [X] T026 [P] [US2] Remove the amount display and `currencyCode` prop from `frontend/src/components/ItemCard.tsx`; remove the `currencyCode` prop from `frontend/src/components/BucketSection.tsx`; stop passing it from `frontend/src/pages/DashboardPage.tsx`. Depends on T023, T021. (Committed atomically with T023 and T028.)
- [X] T027 [P] [US2] Remove the Amount row and `currencyCode` prop from `frontend/src/components/timeline/TimelineDetail.tsx` and `frontend/src/components/timeline/TimelineDetailShell.tsx`; stop passing `currency_code` from `frontend/src/pages/TimelinePage.tsx`. Depends on T024, T022. (Committed atomically with T024.)
- [X] T028 [US2] Replace the Dashboard "Upcoming total" money cell with a `Next 7 days` count in `frontend/src/pages/DashboardPage.tsx`: use `buckets.upcoming.length` (the 7-day bucket, excluding due-today and overdue so the summary cells stay disjoint); keep `Due today` and `Overdue` counts; remove `formatAmount` and `upcoming_total_cents` usage from the view; keep `summary.upcoming_total_cents` and `currency_code` in the API response and `frontend/src/api/types.ts`. Depends on T023, T026. (The count-only cell landed with T021; T023 now validates it and T026 removes the remaining card amounts. Committed atomically with T023 and T026.)

**Checkpoint**: Primary deadline views are expense-free; History and the edit flow still preserve amounts.

---

## Phase 5: User Story 3 - Preserve access to the full deadline ledger (Priority: P3)

**Goal**: Revealed overdue deadlines keep their full details and actions. Completing, deleting, or
editing them updates counts and History; editing overdue to upcoming moves it into the focused view;
the reveal state is session-only; the indicator and reveal/return actions are keyboard-operable.

**Independent Test**: From the upcoming-only view, reveal overdue deadlines, open one, edit it,
complete it, and confirm History records it; return to the upcoming-only view and confirm the count
updates. Edit an overdue deadline to a future moment and confirm it appears in the upcoming view.
Navigate away and back and confirm the default focus returns. Repeat using only the keyboard.

**Frontend design**: Before any frontend task in this phase, load and follow the `frontend-design`
skill (Constitution VI).

### Tests for User Story 3 ⚠️

> Write these tests first and confirm they fail for the expected reason before implementation.

- [ ] T029 [P] [US3] Add Dashboard revealed-actions tests in `frontend/tests/dashboard.test.tsx`: reveal overdue, open/edit/complete/delete, count updates, History records completion, undo restores the item, navigating away/back resets to hidden, and reveal/hide issues zero POST/PATCH/DELETE requests.
- [ ] T030 [P] [US3] Add Timeline revealed-actions tests in `frontend/tests/timeline.test.tsx`: reveal overdue, select the detail, complete/edit/delete, count updates, History records completion, edit overdue → future moves the item into the upcoming view, session reset, selection handoff, the filter-exclusion notice is distinct from the overdue notice, and reveal/hide issues zero POST/PATCH/DELETE requests.
- [ ] T031 [US3] Add keyboard and announcement tests in `frontend/tests/dashboard.test.tsx` and `frontend/tests/timeline.test.tsx`: tab to the indicator, toggle with Enter/Space, focus moves to the first overdue entry on reveal, focus returns to the tab on hide, no keyboard trap, polite live-region announcements, and the labeled region name changes between hidden and revealed states. Follows T029/T030 because it edits both files.
- [X] T032 [P] [US3] Add backend completion/history regression tests in `backend/tests/integration/api/test_completion.py` and `backend/tests/integration/api/test_history.py`: completing and undoing an overdue item updates the next read's counts and never changes `scope` semantics or stored amounts; completing an overdue recurring item places the next occurrence in the correct upcoming/overdue set with accurate counts; `amount_cents`, `summary.upcoming_total_cents`, and `currency_code` remain present in responses. (The recurring fixture advances schedule-anchored occurrences past the completion instant, so both next occurrences land in `upcoming`; the test now asserts that actual semantics.)

### Implementation for User Story 3

- [ ] T033 [US3] Ensure revealed overdue entries use the existing edit/complete/delete handlers and update counts and focus in `frontend/src/pages/DashboardPage.tsx`; add polite live-region announcements for reveal/hide and focus moves. Depends on T021, T029.
- [ ] T034 [US3] Ensure revealed overdue markers use the existing detail/actions and update counts, selection, and focus in `frontend/src/pages/TimelinePage.tsx`; add polite live-region announcements for reveal/hide, selection moves, and completed/deleted items. Depends on T022, T030.
- [ ] T035 [US3] Confirm `showOverdue` is page-local state with default `false`, resets on mount/navigation, is never written to the URL or storage, and toggling it issues no writes in `frontend/src/pages/DashboardPage.tsx` and `frontend/src/pages/TimelinePage.tsx`. Depends on T021, T022.

**Checkpoint**: All three stories work independently; overdue records remain fully reachable and actionable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Performance, documentation, full gates, contract parity, and manual validation.

- [ ] T036 [P] Add 1,000-item scope performance tests to `backend/tests/integration/api/test_performance.py`: mixed overdue/future items through `GET /api/items?scope=upcoming` and `GET /api/timeline?scope=upcoming` under the existing 1-second gate.
- [ ] T037 [P] Update `README.md` and `CHANGELOG.md`: upcoming-only default, overdue indicator/reveal, `Next 7 days` summary cell, expense-free primary views, `scope`/`overdue_count`, version `1.2.0`, no migration, and unchanged History/amount behavior.
- [ ] T038 [P] Add the UI performance test in `frontend/tests/performance.test.tsx`: render the Dashboard and Timeline with 1,000 deterministic server-shaped deadlines including overdue, assert the default upcoming view becomes interactive within 2 seconds (SC-009) and reveal/hide settles within 1 second (SC-003) using `performance.now()`; exclude network time and keep the fixture stable across runs.
- [ ] T039 Run full backend gates in `backend/`: `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run mypy src`.
- [ ] T040 Run full frontend gates in `frontend/`: `npm run test:run`, `npm run lint`, `npm run build` (includes T038).
- [ ] T041 Validate contract parity and representative upcoming responses: `cd backend && uv run pytest tests/integration/api/test_openapi_contract.py -q`; confirm the app and living contract versions are `1.2.0`, the operation sets match, and the 1.2.0 compatibility note is present for strict 1.1.0 `TimelineResponse` validators.
- [ ] T042 Run every manual scenario in `specs/003-upcoming-deadlines/quickstart.md`: 320–1920 px, 200% zoom, light/dark themes, reduced motion, keyboard/screen reader, boundaries, filters, hidden-item and filter-exclusion notices, recurring completion, API-failure states, reveal/return and 1,000-item timing, no-write checks, and expense-free views.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; start immediately.
- **Foundational (Phase 2)**: Depends on T001; blocks every user story.
- **User Stories (Phase 3+)**: Depend on Phase 2. US1 is the MVP and should complete first. US2 edits
  the same page files as US1, so it starts after US1's page integration (T021/T022) even though its
  tests can be drafted earlier against the US1 layout. US3 depends on US1's reveal implementation and
  US2's expense-free detail for its assertions.
- **Polish (Phase 6)**: Depends on all desired stories.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2; no dependency on US2/US3.
- **US2 (P2)**: Starts after US1's page integration (T021/T022) because it edits the same
  `DashboardPage.tsx` and `TimelinePage.tsx` files; T026 and T027 then run in parallel.
- **US3 (P3)**: Starts after US1 (reveal) and US2 (expense-free detail); its backend regression tests
  (T032) may run as soon as Phase 2 is complete.

### Within Each User Story

- Write the listed tests first and confirm they fail for the expected reason.
- Backend route changes follow their tests; frontend helpers/components follow their tests.
- Page integration follows the component/helper implementation.
- Run the full quality gate and commit each completed task separately before moving to the next
  task (Constitution Git & Commit Policy).
- Complete each story's checkpoint before moving to the next priority.

### Parallel Opportunities

- Phase 2: after T002 and T005 land, T003, T004, T006, T007, T008, and T010 touch independent
  files and can run in parallel; T009 depends on T005/T007/T008.
- US1: T011–T016 (tests) are parallel across different files; T017 and T018 are parallel backend
  routes; T019 and T020 are parallel frontend units; T021 and T022 are separate pages.
- US2: T023–T025 are parallel tests after US1's page integration; T026 and T027 are parallel
  component/page groups; T028 follows T026.
- US3: T029 and T030 are parallel by page; T032 is parallel on the backend; T031 edits both
  frontend test files and follows T029/T030; T033 and T034 are separate pages; T035 follows both.
- Polish: T036–T038 are parallel; T039–T042 run after implementation is complete.

---

## Parallel Example: User Story 1

```bash
# Launch the independent US1 test tasks together:
Task: "Backend items scope tests in backend/tests/integration/api/test_items.py"
Task: "Backend timeline scope tests in backend/tests/integration/api/test_timeline.py"
Task: "Contract tests in backend/tests/integration/api/test_openapi_contract.py"
Task: "Forward-only horizon tests in frontend/tests/horizons.test.ts"
Task: "Dashboard upcoming-focus tests in frontend/tests/dashboard.test.tsx"
Task: "Timeline upcoming-focus tests in frontend/tests/timeline.test.tsx"

# Then launch the independent implementation units:
Task: "Implement scope-aware GET /api/items in backend/src/due_track/api/routes/items.py"
Task: "Implement scope-aware GET /api/timeline in backend/src/due_track/api/routes/timeline.py"
Task: "Add includeOverdue to frontend/src/lib/timeline/horizons.ts"
Task: "Create frontend/src/components/OverdueIndicator.tsx"
```

## Parallel Example: User Story 2

```bash
# Launch the independent US2 tests together:
Task: "Dashboard expense-free tests in frontend/tests/dashboard.test.tsx"
Task: "Timeline expense-free tests in frontend/tests/timeline.test.tsx"
Task: "History and edit regression tests in frontend/tests/history.test.tsx"

# Then launch the independent component groups together:
Task: "Remove amount from frontend/src/components/ItemCard.tsx and BucketSection.tsx"
Task: "Remove Amount row from frontend/src/components/timeline/TimelineDetail.tsx"
```

## Parallel Example: User Story 3

```bash
# Launch the independent US3 tests together:
Task: "Dashboard revealed-actions tests in frontend/tests/dashboard.test.tsx"
Task: "Timeline revealed-actions tests in frontend/tests/timeline.test.tsx"
Task: "Backend completion/history regression tests in backend/tests/integration/api/"

# Then wire the two pages independently:
Task: "Dashboard overdue actions and announcements in frontend/src/pages/DashboardPage.tsx"
Task: "Timeline overdue actions and announcements in frontend/src/pages/TimelinePage.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (baseline gates) and Phase 2 (shared contract/types/hooks).
2. Complete Phase 3 (US1): upcoming-only default, overdue indicator, reveal/hide, boundaries,
   automatic transition, filters, and empty states.
3. **STOP and VALIDATE** using the US1 independent test.
4. Demo the focused deadline view. The Dashboard summary still shows the existing expense total at
   this checkpoint; the `Next 7 days` count replaces it in US2.

### Incremental Delivery

1. Setup + Foundational → shared contract and query plumbing ready.
2. US1 → upcoming-only focus works and is testable (MVP).
3. US2 → primary views become expense-free with the `Next 7 days` summary; History and editing still
   preserve amounts.
4. US3 → revealed overdue entries remain fully actionable; History, undo, session reset, and
   keyboard behavior are verified.
5. Polish → UI and API performance, docs, full gates, contract parity, and manual quickstart
   validation.

### Parallel Team Strategy

With multiple developers:

1. Complete Setup + Foundational together.
2. After Phase 2:
   - Developer A: US1 backend routes and tests.
   - Developer B: US1 frontend indicator, horizons, and Dashboard.
   - Developer C: US2 expense-removal tests and component edits, merging page edits after US1.
3. Sequence the shared page edits (`DashboardPage.tsx`, `TimelinePage.tsx`) to avoid conflicts:
   US1 integration first, then US2 prop/summary cleanup, then US3 action/focus wiring.
4. US3 tests can be written in parallel once US1's reveal behavior is stable.

---

## Notes

- `[P]` tasks touch different files and have no dependency on an incomplete task.
- `[US1]`, `[US2]`, `[US3]` labels map every story task to `spec.md`.
- Tests are mandatory under Constitution V and `plan.md`; do not skip them.
- No new table, column, index, migration, dependency, notification, or background process is
  introduced. `amount_cents` stays stored and editable; History stays unchanged.
- Commit each completed task separately with the full quality gate green (Constitution Git &
  Commit Policy). Do not commit the pre-existing user-owned workspace files.
- Stop at each checkpoint to validate the story independently before moving on.
