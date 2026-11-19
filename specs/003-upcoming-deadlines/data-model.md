# Data Model: Upcoming-Only Deadline Focus

**Feature**: `003-upcoming-deadlines` | **Date**: 2026-11-12

**Storage**: Existing local SQLite database, unchanged. The upcoming-only focus is a **read-time
projection and session-only view state**, not a persisted entity. There are no new tables, columns,
indexes, migrations, or retained view records. Amounts remain stored and editable, and History
remains unchanged.

## Persistence Impact

| Item | Change |
|------|--------|
| Tables | None |
| Columns | None |
| Indexes | None |
| Migrations | None |
| Stored amount data | None — `amount_cents` is preserved exactly |
| Completion / undo / deletion semantics | None |
| Stored scope, reveal, or focus state | None |

## Entity Overview

```text
due_items (existing, persisted)
      │  filtered: status = active and category/priority/recurring/q
      ▼
ItemListResponse (read model, per request, scope-aware)
      ├── buckets.overdue = [] when scope = upcoming
      ├── summary.overdue_count = filtered overdue count (always accurate)
      └── summary.due_today_count / upcoming_total_cents (existing fields)
      │
      ├── TimelineResponse (read model, per request, scope-aware)
      │     ├── entries = non-overdue entries when scope = upcoming
      │     ├── overdue_count = filtered overdue count (always accurate)
      │     └── reference_time_utc / timezone / currency_code (existing fields)
      │
      ▼
UpcomingOnlyViewState (client, session-only)
      ├── showOverdue
      ├── hiddenItem
      ├── pendingFocusId
      └── activeItemId / selectedId (existing focus state)
      │
      ▼
Derived view data (client, per render)
      ├── visibleEntries / visibleUpcomingCount
      ├── summaryUpcomingCount
      ├── activeCount
      └── overdueCount
```

## API Query Parameter: `scope`

| Field | Type | Default | Rules |
|-------|------|---------|-------|
| `scope` | `upcoming \| all` | `all` | Shared by `GET /api/items` and `GET /api/timeline`. `upcoming` means `due_at_utc >= reference_time_utc`; `all` preserves the pre-003 payload. Invalid values return `422`. |

The default is deliberately `all` at the API boundary. The Dashboard and Timeline explicitly request
`upcoming`; History and the Dashboard's category-source query keep `all`.

## Read Model: `ItemListResponse` (existing shape, scope-aware semantics)

The JSON shape does not change. Only the contents of `buckets.overdue` and the relationship between
the buckets and the summary change when `scope=upcoming`.

| Field | Type | `scope=upcoming` | `scope=all` |
|-------|------|------------------|-------------|
| `buckets.overdue` | `DueItem[]` | Always `[]` | Every filtered active overdue item, existing order |
| `buckets.due_today` | `DueItem[]` | Unchanged | Unchanged |
| `buckets.upcoming` | `DueItem[]` | Unchanged | Unchanged |
| `buckets.later` | `DueItem[]` | Unchanged | Unchanged |
| `summary.overdue_count` | integer ≥ 0 | Count of filtered active overdue items **before** the bucket is emptied | Count of filtered active overdue items |
| `summary.due_today_count` | integer ≥ 0 | Count of filtered active due-today items | Same |
| `summary.upcoming_total_cents` | integer ≥ 0 | Existing calculation; retained for compatibility but not displayed in primary views | Same |
| `currency_code` | ISO 4217 string | Unchanged; not displayed in primary views | Unchanged |
| `timezone` | IANA string | Unchanged | Unchanged |

**Invariants**:
- `scope=upcoming` ⇒ `len(buckets.overdue) == 0` and `summary.overdue_count` is still the accurate
  filtered count.
- `scope=all` ⇒ every active filtered item appears in exactly one bucket, exactly as before 003.
- `summary.overdue_count` equals the number of filtered active items whose `due_at_utc <
  reference_time_utc`, independent of `scope`.
- An item due exactly at `reference_time_utc` is not overdue; it is Due Today (timed) or remains
  Due Today until the local day ends (date-only).
- Completed and deleted items never appear.
- Filters combine with AND semantics exactly as before.

## Read Model: `TimelineResponse` (additive field)

| Field | Type | Rules |
|-------|------|-------|
| `reference_time_utc` | aware UTC datetime | Existing server-authoritative now, including the test clock override. |
| `timezone` | IANA string | Existing application timezone. |
| `currency_code` | ISO 4217 string | Existing field; retained for compatibility, not displayed in primary views. |
| `overdue_count` | integer ≥ 0 | **New.** Count of filtered active overdue items, independent of `scope`. |
| `entries` | `TimelineEntry[]` | `scope=upcoming`: only entries with `urgency != "overdue"`. `scope=all`: every filtered active item, as before. |

**Invariants**:
- `overdue_count` equals the number of filtered active items with `urgency == "overdue"` in the
  same request's unfiltered-by-scope set.
- `scope=upcoming` ⇒ no entry has `urgency == "overdue"`.
- `scope=all` ⇒ `overdue_count == len([entry for entry in entries if entry.urgency ==
  "overdue"])`.
- Entries remain sorted by due instant ascending, priority descending, then case-insensitive title,
  with `id` as the final tie-breaker.
- `reference_time_utc` is the same instant used to classify every entry and the count.
- The response is strict: no undocumented fields.

## Read Model: `TimelineEntry` (unchanged)

| Field | Type | Rules |
|-------|------|-------|
| `item` | `DueItem` | Existing strict item schema, unchanged. |
| `urgency` | `overdue · due_now · within_24h · within_7d · later` | Server-computed against `reference_time_utc`. |
| `seconds_until_due` | signed integer | `floor((due_at_utc - reference_time_utc).total_seconds())`. |

No client re-derives urgency. The frontend uses `urgency` and the two server counts to decide what
to render and which notice to show.

## Client Entity: `UpcomingOnlyViewState`

Session-only. Created on each page mount; never persisted, never placed in the URL, and never sent
to the server.

| Field | Type | Default | Lifetime | Rules |
|-------|------|---------|----------|-------|
| `showOverdue` | boolean | `false` | Page mount | Controls the query `scope` and whether overdue entries render. Resets to `false` on navigation. |
| `hiddenItem` | `{ id, title, reason: 'overdue' \| 'filters' } \| null` | `null` | Until revealed, cleared, or dismissed | Set after a create/edit when the saved item is absent from the current view. |
| `pendingFocusId` | number \| null | `null` | Until the item appears or is cleared | Used to focus a newly revealed overdue item after the scope query resolves. |
| `activeItemId` | number \| null | `null` | Page mount | Existing Dashboard keyboard focus state. Moves to the nearest remaining upcoming item when the current item leaves. |
| `selectedId` | number \| null | `null` | Page mount | Existing Timeline selection state. Cleared or moved when the selected item leaves the visible set. |

The existing `filters`, `horizon`, and `revealedEdges` state remains session-only. Changing filters
or horizon resets `revealedEdges`; it does not change `showOverdue`.

## Derived Client State

| Name | Definition | Rules |
|------|------------|-------|
| `overdueCount` | `ItemListResponse.summary.overdue_count` or `TimelineResponse.overdue_count` | Always from the server. Never counted from visible entries when overdue is hidden. |
| `visibleEntries` | Timeline entries with `urgency != "overdue"` when `showOverdue=false`; otherwise all entries | Guards against `keepPreviousData` briefly retaining an `all` response after switching to `upcoming`. |
| `visibleUpcomingCount` | Due Today + Upcoming + Later (Dashboard) or non-overdue entries (Timeline) | Used for empty-state and selection decisions, not for the Dashboard summary cell. |
| `summaryUpcomingCount` | `ItemListResponse.buckets.upcoming.length` | Dashboard `Next 7 days` cell. Excludes due-today and overdue items, so the three summary cells are disjoint and nothing is double-counted. |
| `activeCount` | `visibleUpcomingCount + overdueCount` | Timeline summary "Active" value; includes hidden overdue so the ledger total stays honest. Correct during `keepPreviousData` transitions because it does not depend on the reveal state. |
| `nextEntry` | First non-overdue Timeline entry, or null | Existing "Next" summary and contextual note. |
| `categorySource` | All-scope items query (default `all`) on both pages | Keeps categories that exist only on hidden overdue deadlines selectable. Not part of the visible deadline set. |

**Invariants**:
- `showOverdue=false` ⇒ zero overdue entries are rendered, even if a previous `scope=all` response
  is still in the query cache.
- `showOverdue=true` ⇒ every filtered overdue item matching the current filters is rendered with
  the same details and actions as other deadlines.
- Dashboard summary cells are disjoint: `Next 7 days = len(buckets.upcoming)`,
  `Due today = summary.due_today_count`, and `Overdue = summary.overdue_count`. An item appears in
  at most one cell.
- `visibleUpcomingCount` drives empty states and focus/selection decisions only; it is never the
  source of the `Next 7 days` summary value.
- Toggling `showOverdue` resets `revealedEdges` and clears `hiddenItem` when the hidden item is
  revealed.
- The view state never deletes, completes, archives, or mutates a deadline.

## State Transitions

| From | Trigger | To | Effects |
|------|---------|----|---------|
| Hidden, `overdueCount > 0` | Activate **Show overdue** | Revealed | Query scope becomes `all`; manual edge reveals reset; window becomes overdue-inclusive; focus moves to the first overdue entry; live region announces the reveal. |
| Revealed | Activate **Hide overdue** | Hidden | Query scope becomes `upcoming`; manual edge reveals reset; window becomes forward-only; selected overdue item is cleared and focus moves to the nearest upcoming entry or the tab; live region announces the return. |
| Hidden, upcoming item crosses now | 55s Dashboard refetch or adaptive Timeline refetch | Hidden, item removed | Item leaves the visible list; `overdue_count` increments; selection/focus moves to the nearest remaining upcoming item; announced. |
| Hidden, create/edit saves an overdue item | All-scope post-save check (with an unfiltered fallback when active filters exclude it) | Hidden + notice | Notice names the item, explains the focus, offers **Show overdue**; item is not rendered as a deadline entry. |
| Hidden + notice | Activate **Show overdue** | Revealed + pending focus | Notice clears; scope becomes `all`; the item is selected/highlighted when it appears. |
| Revealed, complete/delete an overdue item | Mutation succeeds | Revealed | Item leaves; `overdue_count` decreases; History records completion; focus moves to the nearest remaining entry. |
| Revealed, edit overdue → upcoming | Mutation succeeds | Revealed | Item moves to the upcoming set; it is visible in the same revealed view. |
| Hidden, edit upcoming → overdue | All-scope post-save check | Hidden + notice | Item leaves the upcoming list; count increments; notice names it and offers **Show overdue**. |
| Any | Navigate away and return | Hidden | `showOverdue` resets to `false`; the default upcoming-only focus is restored. |
| Any | Change filters | Same reveal state | Query key changes with the filters and scope; edge reveals reset; count reflects the new filtered set. |

## Boundary and Timezone Rules

- **Upcoming**: `due_at_utc >= reference_time_utc`. Equality is due now, not overdue, matching the
  existing bucket and urgency rules.
- **Overdue**: `due_at_utc < reference_time_utc`. This is the only definition used by the API and
  the counts.
- **Date-only deadlines**: `due_at_utc` is the end of the configured local due day. They remain
  upcoming through that local day, including across a daylight-saving transition, because the API
  compares the stored UTC instant.
- **Timed deadlines**: the exact UTC instant is authoritative. The browser never compares dates to
  decide status; it renders server-supplied buckets, urgency, and counts.
- **Timezone**: all local-date presentation continues to use the API-provided `timezone`; no new
  timezone conversion is introduced.

## Amount and History Invariants

- `amount_cents` remains on every `DueItem`, unchanged by scope, reveal, create, or edit.
- `summary.upcoming_total_cents` and `currency_code` remain in the API response but are not rendered
  in the Dashboard summary, deadline cards, Timeline markers, or Timeline detail.
- `ItemForm` still loads, edits, and submits the amount.
- History still displays amounts and remains the only primary surface that does.
- No migration, backfill, or deletion of amount data occurs.
