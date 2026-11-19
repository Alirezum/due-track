# Implementation Plan: Upcoming-Only Deadline Focus

**Branch**: `003-upcoming-deadlines` | **Date**: 2026-11-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-upcoming-deadlines/spec.md`

**Constitution**: `v1.1.0` (amended 2026-11-05 to require the `frontend-design` skill for all
frontend UI work). The design below was produced after loading and following that skill.

## Summary

Default the Dashboard and Timeline to **upcoming deadlines only**: active items due now or later.
Overdue deadlines leave the primary list but are never silently lost — a compact **Overdue** ledger
tab reports an accurate filtered count and reveals every overdue deadline in one action, with a
one-action return to the focused view. The same change removes monetary amounts, expense totals, and
currency formatting from the Dashboard summary, deadline cards, Timeline markers, and Timeline
detail. Stored amounts remain editable, and History keeps its amount display.

The backend gains one additive, shared query parameter (`scope=upcoming|all`, default `all`) on the
two existing read endpoints. Scope filtering reuses the existing deterministic bucket/urgency
classifiers against the existing `NowDep` clock, so the visible set and the overdue count cannot
disagree. `TimelineResponse` gains a required `overdue_count` scalar; requests remain backward
compatible, but strict 1.1.0 response validators must update to the 1.2.0 schema. No table, column,
index, migration, completion rule, undo rule, deletion rule, or stored view state changes. No new
dependency is required.

## Technical Context

**Language/Version**: Python 3.12+ (backend), TypeScript 5.x in strict mode + React 19 (frontend)

**Primary Dependencies**: FastAPI, Pydantic v2, SQLite (`sqlite3`), `uv`; React 19, Vite, Tailwind
CSS v4, shadcn/Radix primitives, TanStack Query v5, React Router 7, Vitest, Testing Library,
`oxlint`. No new runtime dependencies are required.

**Storage**: Existing local SQLite database. Read-only projection over `due_items`. No new tables,
columns, indexes, or migrations. `amount_cents` is preserved and remains editable.

**Testing**: `pytest` (unit domain + integration API + OpenAPI contract + performance), `ruff`
check/format, `mypy`; Vitest + Testing Library, `oxlint`, `tsc -b && vite build`.

**Target Platform**: Local-first web application in a current desktop or mobile browser, served
from `127.0.0.1`; 320 px through 1920 px wide; light and dark themes; 200% zoom; reduced motion.

**Project Type**: Web application monorepo (`backend/` + `frontend/`) with a living OpenAPI contract
at `specs/001-due-track-v1/contracts/openapi.yaml`.

**Performance Goals**: 1,000 active deadlines, including overdue deadlines, become usable in the
default view within 2 seconds; reveal and return actions settle within 1 second; both read endpoints
answer a filtered 1,000-item set in under 1 second (existing gate); no horizontal page scrolling.

**Constraints**: Single local user; no new persisted item data; no notifications, reminders,
background processing, or network calls; all status, scope, filtering, and timezone rules remain
server-authoritative; History behavior and amounts must not regress; existing 001/002 API behavior
must remain available through `scope=all`.

**Scale/Scope**: One SQLite database, one active user, up to 1,000 active items plus completion
history, two existing read endpoints, two existing pages, one new presentational component, and no
new routes or dependencies.

## Constitution Check

*GATE: Passed before Phase 0 research and re-checked after Phase 1 design.*

| Principle | Gate | Result |
|-----------|------|--------|
| I. Deterministic Domain & Recurrence Logic | Overdue and due-now boundaries remain pure Python functions with an explicit reference clock; UTC instants remain the storage/processing form; timezone conversion stays at the API presentation boundary. | **PASS** — scope filtering reuses `classify_bucket` / `classify_urgency` and `NowDep`; no new date math or implicit clock reads. |
| II. Local-First, Single-User Privacy by Default | No network service, telemetry, auth, multi-tenancy, or background daemon. | **PASS** — existing loopback SQLite/FastAPI architecture; the 55-second Dashboard refetch is an in-process query refresh, not a network feature. |
| III. Data Safety & Atomic Persistence | No data loss, no schema changes, history/undo/deletion semantics preserved, amounts preserved. | **PASS** — read-time projection; no migration; view state is session-only; `amount_cents` is untouched. |
| IV. Clear API Boundary & Thin Client | Filtering, status grouping, overdue counts, and time rules live in FastAPI; React only presents, formats, and lays out. | **PASS** — `scope` and both overdue counts are server-computed; hidden-item detection uses an all-scope server response, never a browser date comparison. |
| V. Simplicity, YAGNI & Verified Changes | No new queues, brokers, services, storage, or unnecessary dependencies; every behavior tested. | **PASS** — one shared query parameter, one response scalar, one presentational component; backend and frontend tests cover every acceptance scenario. |
| VI. Skill-Guided, Distinctive Frontend Design | `frontend-design` loaded before design decisions; plan records layout, typography, color tokens, responsive and interaction states. | **PASS** — skill loaded; the existing ledger language is extended with a quiet **Overdue ledger tab**, not a new visual direction. |
| Public Contracts | The `/api` HTTP schema changes only with a documented additive contract update. | **PASS** — living OpenAPI advances to `1.2.0`; requests remain backward compatible, and the one required response field is documented as a consumer update for strict 1.1.0 validators. No path or existing field is removed or retyped. |

**Post-design re-check**: All gates still pass. The only apparent duplication — the frontend
deciding which empty-state or notice to show — is presentation logic driven by server-supplied
`scope`, `urgency`, and counts. Overdue status is never re-derived in React. The 55-second Dashboard
refresh is a data synchronization policy, not a second status rule. No complexity exception is
required.

## Project Structure

### Documentation (this feature)

```text
specs/003-upcoming-deadlines/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── upcoming.openapi.yaml    # additive fragment; merged into the living 001 contract
└── checklists/
    └── requirements.md
```

`tasks.md` is generated from this plan and `spec.md` by `/speckit.tasks`.

### Source Code (repository root)

```text
backend/
├── src/due_track/
│   ├── api/
│   │   ├── app.py                    # app/OpenAPI version 1.2.0
│   │   ├── filters.py                # ItemScope + shared scope query parameter
│   │   ├── schemas.py                # ItemScope, TimelineResponse.overdue_count
│   │   └── routes/
│   │       ├── items.py              # scope-aware buckets; count before emptying overdue
│   │       └── timeline.py           # scope-aware entries; overdue_count before omission
│   └── domain/
│       ├── status.py                 # reused, unchanged
│       └── timeline.py               # reused, unchanged
├── tests/
│   ├── unit/domain/                  # existing boundary coverage; no new helper planned
│   └── integration/api/
│       ├── test_items.py             # scope, count, boundary, filter, 422 cases
│       ├── test_timeline.py          # scope, count, boundary, filter, 422 cases
│       ├── test_filters.py           # scope parsing/default
│       ├── test_openapi_contract.py  # representative upcoming responses
│       └── test_performance.py       # 1,000 mixed items, scope=upcoming
└── pyproject.toml

frontend/
├── src/
│   ├── api/types.ts                  # ItemScope, TimelineResponse.overdue_count
│   ├── hooks/
│   │   ├── useItems.ts               # scope, options, scope-aware query key
│   │   └── useTimeline.ts            # scope, scope-aware query key
│   ├── lib/
│   │   ├── filters.ts                # optional scope in the query string
│   │   └── timeline/horizons.ts      # includeOverdue; forward-only window
│   ├── components/
│   │   ├── OverdueIndicator.tsx      # new ledger tab
│   │   ├── BucketSection.tsx         # optional action slot; no currency prop
│   │   ├── ItemCard.tsx              # amount display removed
│   │   └── timeline/
│   │       ├── TimelineDetail.tsx    # amount row removed
│   │       ├── TimelineDetailShell.tsx
│   │       ├── TimelineLegend.tsx    # overdue item conditional
│   │       └── TimelineStates.tsx    # no-upcoming / no-results variants
│   └── pages/
│       ├── DashboardPage.tsx         # upcoming default, summary, notice, focus
│       └── TimelinePage.tsx          # upcoming default, indicator, forward window, category source
├── tests/
│   ├── dashboard.test.tsx
│   ├── timeline.test.tsx
│   ├── horizons.test.ts
│   ├── filters.test.tsx
│   └── history.test.tsx
└── package.json
```

**Structure Decision**: Keep the two-part monorepo and the existing domain/API/UI layering. Extend
the two existing read endpoints and pages in place. Add one presentational `OverdueIndicator`
component and one optional window option; reuse `FilterBar`, `ItemForm`, `ConfirmDialog`,
`ShortcutHelp`, `Button`, `Badge`, the timeline canvas/cluster/detail family, and the existing theme
tokens. No new route, page, service, or dependency.

## Backend Design

### Shared query parameter: `scope`

`backend/src/due_track/api/filters.py` owns the parsed parameter for both routes:

```text
ItemScope = Literal["upcoming", "all"]          # in api/schemas.py

ItemFilters(
    category: str | None = None,
    priority: Priority | None = None,
    recurring: bool | None = None,
    q: str | None = None,
    scope: ItemScope = "all",                    # new, default preserves pre-003 behavior
)

get_item_filters(..., scope: Annotated[ItemScope, Query()] = "all") -> ItemFilters
```

- `scope` is a view scope, not a data filter. It is parsed with the same dependency so the two
  routes cannot drift.
- Invalid values are rejected by FastAPI/Pydantic with `422`.
- The API default is `all`; the Dashboard and Timeline explicitly request `upcoming`.

### `GET /api/items`

Keep the existing read and classification pipeline, then omit only the overdue bucket when
requested:

```text
records = list_active_items(connection, category, priority, recurring, q)
grouped = {OVERDUE: [], DUE_TODAY: [], UPCOMING: [], LATER: []}
for record in records:
    item = record_to_due_item(record, tz)
    bucket = classify_bucket(due_at_utc=item.due_at_utc,
                             due_local_date=item.due_local_date,
                             reference_time=now,
                             reference_local_date=reference_local_date)
    grouped[bucket].append(item)

for bucket in grouped:
    grouped[bucket] = sort_items(grouped[bucket])

overdue_count = len(grouped[OVERDUE])          # computed before any omission
if filters.scope == "upcoming":
    grouped[OVERDUE] = []

summary = summarize_buckets(
    overdue_count=overdue_count,               # accurate filtered count
    due_today_count=len(grouped[DUE_TODAY]),
    upcoming_amounts=[item.amount_cents for item in grouped[UPCOMING]],
)
```

Response semantics:

```json
{
  "buckets": {
    "overdue": [],
    "due_today": [{ "...DueItem...": true }],
    "upcoming": [{ "...DueItem...": true }],
    "later": []
  },
  "summary": {
    "overdue_count": 3,
    "due_today_count": 1,
    "upcoming_total_cents": 120000
  },
  "currency_code": "USD",
  "timezone": "America/New_York"
}
```

- `scope=upcoming` ⇒ `buckets.overdue` is always `[]`; `summary.overdue_count` is the count of
  filtered active overdue items before omission.
- `scope=all` ⇒ exactly the pre-003 response.
- `summary.upcoming_total_cents` and `currency_code` remain in the payload for compatibility but are
  not rendered by the primary views.
- Equality and date-only behavior come from `classify_bucket`: a timed item due exactly at `now` is
  Due Today; a date-only item remains Due Today until the local day ends.

### `GET /api/timeline`

Compute every entry and the overdue count first, then omit overdue entries when requested:

```text
entries = [
    TimelineEntry(
        item=item,
        urgency=classify_urgency(due_at_utc=item.due_at_utc, reference_time=now),
        seconds_until_due=seconds_until_due(due_at_utc=item.due_at_utc, reference_time=now),
    )
    for item in sorted_items
]

overdue_count = sum(1 for entry in entries if entry.urgency == Urgency.OVERDUE)
if filters.scope == "upcoming":
    entries = [entry for entry in entries if entry.urgency != Urgency.OVERDUE]

return TimelineResponse(
    reference_time_utc=now,
    timezone=settings.timezone,
    currency_code=settings.currency,
    overdue_count=overdue_count,
    entries=entries,
)
```

Response semantics:

```json
{
  "reference_time_utc": "2026-11-05T12:00:00Z",
  "timezone": "America/New_York",
  "currency_code": "USD",
  "overdue_count": 3,
  "entries": [
    {
      "item": { "...DueItem fields, unchanged...": true },
      "urgency": "due_now",
      "seconds_until_due": 0
    }
  ]
}
```

- `overdue_count` is required, non-negative, and independent of `scope`.
- `scope=upcoming` ⇒ no entry has `urgency == "overdue"`.
- `scope=all` ⇒ every filtered active item appears exactly once, and `overdue_count` equals the
  number of overdue entries.
- Sorting, `reference_time_utc`, timezone, urgency bands, and signed seconds are unchanged.

### Why no SQL or schema change

The existing `list_active_items` read already returns every filtered active row. Classifying and
then omitting in the route keeps one definition of overdue, avoids a second `COUNT(*)` query, and
keeps the count and visible set consistent at every boundary. At the specified 1,000-item scale the
extra Python pass is negligible. No new index, column, table, or migration is justified.

### Contract and versioning

- Update the living contract at `specs/001-due-track-v1/contracts/openapi.yaml` to `1.2.0`:
  - `scope` parameter on `GET /api/items` and `GET /api/timeline`;
  - `overdue_count` on `TimelineResponse` (required, integer, minimum 0);
  - descriptions for the empty overdue bucket and accurate count semantics.
- Document the compatibility impact in the contract and `CHANGELOG.md`: requests remain backward
  compatible (`scope` defaults to `all`), but `TimelineResponse` gains one required field. Strict
  1.1.0 response validators (`additionalProperties: false`) must update to the 1.2.0 schema. No path
  or existing field is removed or retyped, and the app remains a single-consumer local-first
  product, so no data migration is involved.
- Update `backend/src/due_track/api/app.py` version to `1.2.0`.
- Add the feature fragment at `specs/003-upcoming-deadlines/contracts/upcoming.openapi.yaml`.
- Extend `backend/tests/integration/api/test_openapi_contract.py` with representative
  `scope=upcoming` responses for both endpoints, including one overdue and one upcoming item.

### Backend tests

- **Items**: default `scope=all` unchanged; `scope=upcoming` empties only `buckets.overdue`;
  `summary.overdue_count` stays accurate; due-now equality; date-only due today; filters combine
  with scope; completed/deleted excluded; invalid scope `422`; empty result returns zero counts;
  timezone boundary.
- **Timeline**: default `scope=all` unchanged; `scope=upcoming` omits overdue entries;
  `overdue_count` matches the all-scope overdue entries; due-now equality; date-only due today;
  filters; empty result; invalid scope `422`; timezone.
- **Contract**: parity plus representative upcoming items/timeline responses validated against the
  updated living schema.
- **Performance**: 1,000 mixed overdue/future items through both endpoints with `scope=upcoming`
  under the existing 1-second gate.

## Frontend Design

The `frontend-design` skill was loaded before these decisions. The direction is **The Ledger Tab**:
the upcoming-only view is the ledger page starting at **now**, and overdue deadlines are summarized
by a quiet index tab at the edge of the page. It keeps the existing warm off-white, deep-green,
serif-display identity and the 002 ledger-rule timeline. It introduces no new color system, no new
type family, and no card/banner language.

### Visual concept: "The Ledger Tab"

- The overdue indicator looks like a tab on a ledger page: a hairline top/bottom rule, an uppercase
  `Overdue` label, a serif tabular count, and a small text action with a chevron.
- It is not a deadline card: no card ground, no priority stripe, no title/notes, no completion
  action. It summarizes a section and controls its visibility.
- On the Dashboard it occupies the first slot of the left column, replacing the Overdue bucket. On
  the Timeline it replaces the static `Overdue` summary cell and controls the canvas region.
- When expanded, the existing overdue presentation returns unchanged: Dashboard `BucketSection`
  cards, Timeline notched tags hanging below the rule.
- The tab uses the existing overdue accent (`text-rose-600 dark:text-rose-400` on Dashboard;
  `--color-timeline-overdue` on Timeline) and existing border/muted/foreground tokens. No new CSS
  variables are added.

### Page layout

Dashboard, default upcoming-only:

```text
┌ Dashboard ────────────────────────────────────────────────────────────────┐
│ Deadlines, in order.                                      [New deadline]  │
│ A local ledger of what is due today and what is coming.                   │
│ Overdue deadlines are summarized, never silently hidden.                  │
│   2 Next 7 days        1 Due today          3 Overdue                      │
│ Category / Priority / Repeats / Search                                    │
├───────────────────────────────────┬───────────────────────────────────────┤
│ [ OVERDUE   3    Show overdue ⌄ ] │ Upcoming                              │
│ Due today                         │ Later                                 │
│                                   │                                       │
└───────────────────────────────────┴───────────────────────────────────────┘
```

Dashboard, revealed:

```text
│ [ OVERDUE   3    Hide overdue ⌃ ] │
│ Overdue                           │
│  ├ Overdue bill · yesterday 09:00 │
│  └ …                              │
│ Due today                         │
```

Timeline, default upcoming-only:

```text
┌ Timeline ─────────────────────────────────────────────────────────────────┐
│ Time, laid bare.                                          [New deadline]  │
│ Next: Rent · in 2d 4h     3 Overdue [Show]    12 Active     as of Nov 5   │
│ Horizon [24h] [7d] [30d] [90d] [1y] [All]     Visible now – Dec 5  [Now]  │
│ Category / Priority / Repeats / Search                                    │
├───────────────────────────────────────────────────────────────────────────┤
│ NOW ────── future deadlines rise above the rule ────────────────────────→ │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

Timeline, revealed: the existing symmetric window returns, overdue tags hang below the rule, and
the legend restores its overdue key.

- **Container**: keep the existing `AppShell` width (`max-w-6xl`, 5/8 padding) and the existing
  Dashboard two-column breakpoint at `lg` (1024 px). The overdue tab spans the left column on
  Dashboard and sits in the summary row on Timeline.
- **Dashboard summary**: replace the `Upcoming total` money cell with a `Next 7 days` count from
  `buckets.upcoming.length` (the 7-day bucket). Keep `Due today` and `Overdue` counts. The three
  cells are disjoint: `Next 7 days` excludes due-today and overdue items, so nothing is
  double-counted. No currency or amount appears anywhere in the summary.
- **Dashboard columns**: left column = overdue tab (and revealed Overdue bucket) + Due today; right
  column = Upcoming + Later. When there are no upcoming deadlines but there are overdue deadlines,
  the tab remains and the page shows the all-overdue empty state.
- **Timeline summary**: `Next`, `Overdue` tab, `Active`, `As of`. `Active` includes hidden overdue
  (`visible upcoming + overdue_count`) so the ledger total stays honest. The `Overdue` tab exposes
  the count and `Show`/`Hide`.
- **Timeline footer**: when hidden, say “Showing the next 30d from now” rather than “around now”.
- **Legend**: omit “Overdue hangs below” while hidden; restore it when revealed. The other legend
  keys remain.
- **Empty/no-results states**: see below.

### `OverdueIndicator` component

A small presentational component used by both pages:

```text
OverdueIndicator({
  id: string,                 // heading id
  count: number,              // server-supplied filtered overdue count
  expanded: boolean,
  controls: string,           // id of the controlled overdue region
  onToggle: () => void,
  variant?: 'tab' | 'summary'
})
```

Anatomy:

- A `section` with `aria-labelledby={id}` and a hairline `border-y border-border`; the visible
  `Overdue` label element carries the `id`.
- Uppercase label `Overdue` (`font-sans text-[0.6875rem] font-semibold tracking-[0.14em]`).
- Count in `font-display text-2xl font-semibold tabular-nums`, using the overdue accent.
- When `count > 0`, a `Button` with `variant="ghost"`, `size="sm"`, visible text
  `Show overdue` / `Hide overdue`, a `ChevronDown` that rotates 180° when expanded, and
  `aria-expanded` / `aria-controls`. Its accessible name includes the count
  (“Show 3 overdue deadlines”).
- When `count === 0`, a muted `Nothing overdue` line and no button.
- Rest state is quiet; hover strengthens the rule only; focus uses the existing 3 px ring; no lift,
  pulse, or new shadow.
- Reduced motion removes the chevron transition; no information depends on it.
- `variant` only adjusts alignment/density for the Dashboard column versus the Timeline summary row;
  both variants share the same markup, semantics, and focus behavior.

### Dashboard behavior

- `showOverdue` is page-local state, default `false`, reset on mount/navigation.
- Primary query:
  ```text
  useItems(filters, showOverdue ? 'all' : 'upcoming', {
    refetchInterval: 55_000,
    refetchOnWindowFocus: true,
  })
  ```
  The category-source query remains `useItems()` with the default `all`, so filters can still
  discover overdue categories.
- Guard against `keepPreviousData`: when `!showOverdue`, never render `buckets.overdue` even if a
  previous all-scope response is still cached. Derive `visibleUpcomingCount` from due-today +
  upcoming + later.
- Summary: `Next 7 days` (`buckets.upcoming.length`, the 7-day bucket), `Due today` (existing
  count), `Overdue` (`summary.overdue_count`). The cells are disjoint; `Next 7 days` does not include
  due-today or overdue items. No total/currency.
- Keyboard flat list: when hidden, it contains only upcoming items; when revealed, it includes the
  overdue bucket. If `activeItemId` disappears after a refetch, move it to the nearest remaining
  upcoming item (or `null`) and announce.
- Hidden-item notice after create/update while hidden:
  1. Await the mutation.
  2. Fetch the same filters with `scope=all` through `queryClient.fetchQuery` and the all-scope key.
  3. If the saved item is in `buckets.overdue`, set `hiddenItem` with `reason: 'overdue'` and render
     a `role="status"` notice: “Saved “X”. It is overdue, so it is hidden by the upcoming focus.”
     with **Show overdue**.
  4. If the item is absent because the active filters exclude it, check the unfiltered all-scope
     category source. If the item is overdue there, still show the overdue notice; the no-results
     state offers **Clear filters** when the current filters exclude it after reveal.
  5. Otherwise, close the dialog and let the normal upcoming refetch show the item.
- Reveal: set `showOverdue(true)`, clear the notice, move focus to the first overdue card (or the
  Overdue heading when none), and announce.
- Hide: set `showOverdue(false)`, move focus back to the indicator button, and announce.

### Timeline behavior

- `showOverdue` is page-local state, default `false`, reset on mount/navigation.
- Query: `useTimeline(filters, showOverdue ? 'all' : 'upcoming')`. The adaptive refetch interval and
  focus refetch from 002 are unchanged.
- Filter categories come from an all-scope source (`useItems()` with the default `all`), not from
  the visible upcoming entries. A category that currently exists only on overdue deadlines stays
  selectable; selecting it produces the no-results state with **Show overdue**.
- Guard against placeholder data: derive `visibleEntries` by filtering out `urgency === 'overdue'`
  when hidden; pass `visibleEntries` to the canvas, window resolver, selection, and summary.
- `overdueCount` always comes from `data.overdue_count`; never from visible entries when hidden.
- `activeCount = visibleUpcomingCount + overdueCount`, where `visibleUpcomingCount` is the number
  of visible entries whose `urgency` is not `overdue`. This stays correct during the
  `keepPreviousData` transition in either direction.
- `resolveTimelineWindow({ ..., entries: visibleEntries, includeOverdue: showOverdue })`.
  When hidden, the window is forward-only and the now line sits at the left margin with a small
  inset. When revealed, the 002 symmetric/overdue-inclusive window returns.
- Legend receives `showOverdue`; the overdue key is omitted while hidden.
- Toggling:
  - Reveal: `setShowOverdue(true)`, `setRevealedEdges(resetReveals())`, clear selection if it was
    hidden, set `pendingFocusId` for the item that triggered the notice, announce.
  - Hide: `setShowOverdue(false)`, reset reveals, clear an overdue selection/detail, move focus to
    the nearest future entry or the indicator, announce.
- Hidden-item notice after create/update:
  1. Await the current-scope refetch.
  2. If the item is present, select/highlight it as before.
  3. If absent, fetch `scope=all` with the same filters.
  4. Present in the all-scope response with `urgency === 'overdue'` → `hiddenItem` with
     `reason: 'overdue'`, notice + **Show overdue**.
  5. Absent from the all-scope response → existing filter-exclusion notice + **Clear filters**.
- When a future entry crosses now, the refetch removes it, `overdue_count` increments, selection
  moves to the nearest remaining upcoming entry, the detail closes if it was showing the vanished
  item, and the change is announced.

### Empty, no-results, and contextual states

**Dashboard**:

- No active deadlines at all: a single quiet empty state, “Nothing on the ledger yet.”, body “Add
  your first deadline and it will appear here when it is upcoming.”, **New deadline**.
- No upcoming, one or more overdue, no filters: keep the overdue tab, show “Nothing is upcoming.” /
  “N deadlines are overdue.” with **New deadline** and **Show overdue**.
- Filters match no upcoming, but overdue matches exist: “No upcoming deadlines match these
  filters.” / “N overdue deadlines match.” with **Show overdue** and **Clear filters**.
- Filters match nothing at all: existing “No deadlines match these filters.” with **Clear filters**.
- Revealed with only overdue: render the overdue bucket normally; add a contextual note “Nothing is
  upcoming. N deadlines are overdue.” and keep **Hide overdue** available.
- Refreshing with previous data: keep the current cards visible and show a small polite “Updating…”
  indicator; never replace the page with a skeleton mid-session.
- Error with no data: “The dashboard could not be read.” + **Try again**.
- Error with stale data: keep the last successful cards visible and show a non-blocking error strip
  with **Retry**.
- Saved item absent because the active filters exclude it: show the filter-exclusion notice with
  **Clear filters**, distinct from the overdue-hidden notice.

**Timeline**:

- No active deadlines at all: existing “Nothing on the ledger yet.” + **New deadline**.
- No upcoming, one or more overdue, no filters: “Nothing is upcoming.” / “N deadlines are overdue.”
  with **New deadline** and **Show overdue**.
- Filters match no upcoming, but overdue matches exist: “No upcoming deadlines match these
  filters.” / “N overdue deadlines match.” with **Show overdue** and **Clear filters**.
- Filters match nothing at all: existing no-results state + **Clear filters**.
- Revealed with only overdue: render the timeline normally and keep the existing “All N active
  deadlines are overdue.” note.
- Error with no data: existing “The timeline could not be read.” + **Try again**.
- Error with stale data: keep the last successful timeline visible and show the existing
  non-blocking error strip with **Retry**.

### Typography

Existing families are retained: `font-display` (Iowan Old Style / Palatino / Georgia) for display
and printed-feeling numerals; `font-sans` (Avenir Next / Segoe UI Variable) for UI. All numerals use
`font-variant-numeric: tabular-nums`.

| Element | Family | Size / line-height | Weight · tracking | Notes |
|---------|--------|--------------------|-------------------|-------|
| Page title | display | `clamp(2.5rem, 4vw, 3.5rem)` / `1.02` | 600 · `-0.04em` | Unchanged |
| Deck | sans | `1rem` / `1.65` | 400 | Muted, max `62ch`; copy updated |
| Summary label | sans | `0.6875rem` / `1.2` | 600 · `0.14em` uppercase | “Next 7 days”, “Due today”, “Overdue” |
| Summary value | display | `1.5rem` / `1.2` | 600 | Tabular; count only |
| Overdue tab label | sans | `0.6875rem` / `1.2` | 600 · `0.14em` uppercase | “Overdue” |
| Overdue tab count | display | `1.5rem` / `1.2` | 600 | Tabular; overdue accent |
| Overdue tab action | sans | `0.8125rem` / `1` | 600 | Min height `2.5rem`; text + chevron |
| Empty-state title | display | `1.5rem`–`2rem` / `1.2` | 600 · `-0.025em` | Existing scale |
| Empty-state body | sans | `0.875rem` / `1.5` | 400 | Muted |

No new font family, no text below `0.625rem` (10 px), and body copy stays at `0.875rem` or larger.
Long titles continue to wrap with `overflow-wrap: anywhere`.

### Color, shape, and spacing

- Reuse the existing semantic and timeline tokens. No new CSS variables and no `styles/index.css`
  changes are required.
- Overdue accent: Dashboard uses `text-rose-600 dark:text-rose-400` (matching the existing overdue
  rule); Timeline uses `text-timeline-overdue` / `bg-timeline-overdue-soft`.
- Tab ground: transparent or `bg-muted/30`; hairline `border-border`; no gradient, glass, or glow.
- Shape: `2px` radius on the tab and its action, consistent with the ledger surface. Avoid pills.
- Spacing: 4 px base scale; `px-3 py-2` tab padding; `gap-3` between label, count, and action.
- Elevation: none. Focus uses the existing ring; selection uses the existing ring/ground.
- Contrast verification during implementation: tab label/count/action at 4.5:1 on their ground;
  focus ring and essential rule at 3:1; both themes. Status remains text-labeled, never color-only.

### Responsive behavior

| Width | Dashboard | Timeline |
|-------|-----------|----------|
| 320–639 px | Single column; tab full width; label/count/action wrap without clipping; cards unchanged | Summary wraps; tab on its own row; vertical ledger; no left edge summary; detail dialog |
| 640–1023 px | Single column; tab full width; two-column metadata only inside dialogs | Vertical ledger; tab in summary; day headers; detail dialog |
| 1024–1279 px | Two columns; tab in left column; overdue bucket below it when revealed | Horizontal ledger; tab in summary; inline detail panel |
| ≥ 1280 px | Two columns; same | Horizontal ledger + sticky detail rail |

- At 200% zoom the effective viewport usually crosses into the compact layout; no fixed pixel
  heights may clip the tab, counts, or actions.
- No horizontal page scrolling at any width; focus rings are never clipped.
- The tab's count and action remain visible when the label wraps; the action uses the existing
  `Button` sizing with a `min-h-10` override for a comfortable 40 px target.

### Interaction states

| State | Visual | Input / announcement |
|-------|--------|----------------------|
| Rest | Hairline tab, muted label, strong count, quiet action | In normal tab order |
| Hover | Border strengthens; no lift or shadow | Pointer only; no information hidden |
| Focus-visible | Existing 3 px ring with offset | `Enter`/`Space` toggles |
| Expanded | `Hide overdue`, chevron rotated, controlled region visible | `aria-expanded="true"` |
| Revealing | Tab stays in place; overdue region appears | Polite announcement “Showing N overdue deadlines.” |
| Hiding | Tab stays in place; overdue region leaves | Announcement “Hiding overdue deadlines. Showing upcoming only.”; focus returns to the tab |
| Item crosses now | Item leaves the list; count increments | Selection/focus moves to nearest upcoming; announced |
| Hidden notice | `role="status"` strip with item name and **Show overdue** | Remains until acted on; no auto-dismiss |
| Refreshing | Small “Updating…” text; current data remains | Polite live region |
| Reduced motion | No chevron transition or crossfade | `prefers-reduced-motion` honored |

### Accessibility

- The indicator is a labeled group, not a list item and not a deadline card. The count is visible
  text, not an icon-only badge.
- The toggle exposes `aria-expanded` and `aria-controls`; the controlled region has a heading and a
  stable `id`.
- Reveal moves focus to the first overdue entry (Dashboard card or Timeline marker) when one exists;
  otherwise focus stays on the tab. Hide returns focus to the tab. No keyboard trap.
- A single polite live region announces reveal/hide, hidden-item notices, selection/focus moves, and
  completed/deleted items. Countdown ticks are not announced.
- The Dashboard list region is labeled “Upcoming deadlines” when hidden and “Deadlines including
  overdue” when revealed. The Timeline canvas region uses the equivalent labels. Visible deck copy
  also states that overdue deadlines are summarized.
- The tab is reachable at 320 px, at 200% zoom, in both themes, and with reduced motion. Focus rings
  and labels are never clipped.
- Empty/no-results states use real headings and buttons; the all-overdue state offers both **New
  deadline** and **Show overdue** so the path forward is explicit.

### Hooks and query behavior

- `frontend/src/lib/filters.ts`:
  ```text
  filtersToQueryString(filters, scope?: ItemScope): string
  ```
  When `scope` is provided, append `scope=<upcoming|all>`. Existing callers without a scope keep
  their current URLs.
- `useItems`:
  ```text
  useItems(
    filters = EMPTY_FILTERS,
    scope: ItemScope = 'all',
    options?: { refetchInterval?: number | false; refetchOnWindowFocus?: boolean },
  )
  ```
  Query key: `['items', filters, scope]`. `placeholderData: keepPreviousData` remains.
- `useTimeline`:
  ```text
  useTimeline(filters = EMPTY_FILTERS, scope: ItemScope = 'all')
  ```
  Query key: `['timeline', filters, scope]`. Adaptive refetch and the server-anchored clock remain.
- Mutations continue to invalidate the `['items']` and `['timeline']` prefixes, covering every
  scope. History's `useItems()` stays on the default `all`.
- `TimelineResponse.overdue_count` is added to `frontend/src/api/types.ts`; `ItemScope` is exported
  there as well.

### Frontend tests

- **`horizons.test.ts`**: forward-only spans for 24h/7d/30d/90d/1y/all when `includeOverdue=false`;
  symmetric behavior when true; 30d nearest-future extension; all-time; selection inclusion; right
  edge reveal; positive-duration guard; no left reveal when hidden.
- **`filters.test.tsx`**: scope appears in the query string only when provided; existing filter
  combinations unchanged.
- **`dashboard.test.tsx`**: default `scope=upcoming` request; zero overdue cards; indicator count;
  reveal/hide and focus; all-overdue, no-upcoming, no-results, and truly empty states; hidden-item
  notice after create/edit, distinct from the filter-exclusion notice; labeled region and deck copy;
  55-second refetch, window-focus refetch, and fake-timer crossing-now boundary; API error with no
  data and error with stale data; no amount/currency in summary or cards; `Next 7 days` equals
  `buckets.upcoming.length` without double-counting due-today; keyboard operation; zero writes on
  reveal/hide; History regression.
- **`timeline.test.tsx`**: default `scope=upcoming` request; zero overdue markers; indicator count
  from `overdue_count`; reveal/hide and focus; forward-only window and no left summary when hidden;
  category dropdown retains overdue-only categories; no amount/currency in detail; empty/no-results/
  all-overdue and error states; hidden-item notice distinguishing overdue-hidden from
  filter-excluded; selection handoff when an item crosses; keyboard; zero writes on reveal/hide;
  History regression.
- **`performance.test.tsx`**: 1,000 server-shaped deadlines including overdue; default upcoming view
  interactive within 2 seconds (SC-009); reveal/hide settles within 1 second (SC-003); network time
  excluded.
- Existing dashboard/timeline/history tests are updated for the new query keys and the required
  `overdue_count` fixture field; all must pass.

### Performance approach

- Scope filtering is one extra Python pass over the already-read 1,000-item set; the response is
  smaller when overdue is hidden.
- The Dashboard's 55-second refetch and the Timeline's adaptive refetch are the only new data
  synchronization; neither runs in the background while the tab is hidden.
- The overdue tab is a single small component; no new list rendering, virtualization, or dependency.
- The forward-only window reduces the rendered past span; the existing clustering and memoization
  remain in effect.
- No layout reads during render; existing `ResizeObserver` behavior is unchanged.
- A deterministic 1,000-item UI performance test records the default render and reveal/hide budgets
  so SC-003 and SC-009 have automated evidence, not only manual validation.

## Implementation Order

1. **Backend contract + API** — `ItemScope` and shared `scope` parsing; items bucket omission and
   accurate count; timeline omission and `overdue_count`; app/contract version `1.2.0`; fragment;
   backend tests.
2. **Frontend data layer + pure helpers** — `ItemScope`, `TimelineResponse.overdue_count`,
   `filtersToQueryString`, `useItems`, `useTimeline`, forward-only `resolveTimelineWindow`, and
   their tests.
3. **Overdue tab + expense removal** — `OverdueIndicator`, `BucketSection` action slot and prop
   cleanup, `ItemCard` amount removal, `TimelineDetail`/Shell amount removal, legend conditional,
   and the Dashboard integration.
4. **Timeline integration** — query scope, summary count, forward-only canvas, reveal/hide, hidden
   notices, selection/focus handoff, empty/no-results states.
5. **Hardening + docs** — 1,000-item API and UI performance, 320–1920 px and 200% zoom, both
   themes, reduced motion, screen-reader pass, README/CHANGELOG updates, full quality gates, and
   quickstart scenarios.

## Complexity Tracking

No constitution violations or exceptions. The feature adds one shared query parameter, one response
scalar, one presentational component, and one window option; everything else reuses existing
modules, tests, and semantics.
