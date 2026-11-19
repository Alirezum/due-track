# Research: Upcoming-Only Deadline Focus

**Feature**: `003-upcoming-deadlines` | **Date**: 2026-11-12

The specification contains no unresolved clarification markers. The decisions below resolve the
technical unknowns in the plan's Technical Context and record why each approach was chosen. They
also satisfy constitution v1.1.0, including the `frontend-design` requirement for all frontend work.

## 1. API Surface: One `scope` Parameter on Both Read Endpoints

**Decision**: Add an optional `scope=upcoming|all` query parameter to both `GET /api/items` and
`GET /api/timeline`. The default is `all`, preserving every existing request. A shared
`ItemFilters` dependency in `backend/src/due_track/api/filters.py` parses the parameter alongside
`category`, `priority`, `recurring`, and `q`, so the two routes cannot drift. `ItemScope` is a strict
`Literal["upcoming", "all"]` in `backend/src/due_track/api/schemas.py`.

The frontend's primary deadline views explicitly request `scope=upcoming` by default; History and
the Dashboard/Timeline category-source queries keep the default `all`, so a category that currently
exists only on overdue deadlines remains selectable.

**Rationale**:
- The product requirement is about what the Dashboard and Timeline show, not about changing the
  meaning of existing API calls. An additive, default-`all` parameter is backward compatible and
  keeps the living contract's current behavior for any existing consumer.
- Both endpoints already share one filter dependency and one `DueItem` serializer. Adding `scope`
  there is the smallest change that keeps the filter contract identical.
- A separate endpoint or a new response shape would duplicate the item projection and widen the
  contract for no benefit.
- History still reads amounts and currency through `GET /api/items`; keeping `all` as the default
  avoids a hidden regression in a view the feature explicitly leaves unchanged.

**Alternatives considered**:
- *Two new endpoints (`/api/upcoming`, `/api/timeline/upcoming`)*: duplicates operations, schemas,
  and contract tests; rejected.
- *Default the API to `upcoming`*: would change existing behavior for History and any external
  consumer; the view default belongs in the view layer; rejected.
- *Filter only in React*: the dashboard would still receive and cache overdue entries, and the
  frontend would have to re-derive overdue status, violating Constitution IV; rejected.
- *A boolean `hide_overdue` parameter*: less explicit than a named scope and awkward for future
  scopes; rejected.

## 2. Scope Filtering Location and Overdue Count

**Decision**: Keep reading all filtered active rows through `list_active_items`, classify each row
with the existing pure domain functions (`classify_bucket` for items, `classify_urgency` for the
timeline) against `NowDep`, and only then omit the overdue results when `scope=upcoming`.

- `GET /api/items?scope=upcoming` returns an empty `buckets.overdue`, but
  `summary.overdue_count` is computed before the bucket is emptied.
- `GET /api/timeline?scope=upcoming` omits entries whose `urgency` is `overdue`, but returns
  `overdue_count` computed before the omission.
- `scope=all` returns exactly the pre-003 payloads, plus the new timeline count.

**Rationale**:
- Constitution I requires one deterministic, UI-agnostic definition of overdue. Reusing the
  existing classifiers guarantees that the visible set and the count cannot disagree, including
  equality at the reference instant and date-only items that remain upcoming until the end of the
  configured local day.
- A SQL predicate such as `due_at_utc >= :now` would duplicate the boundary rule and would need a
  second query for the count. The current approach uses one read and one classification pass.
- At the specified scale (1,000 active items), filtering in Python after the existing read is
  negligible. The response is smaller when overdue is hidden.
- No new index, migration, or repository function is required.

**Alternatives considered**:
- *SQL-level `scope` filtering plus a separate `COUNT(*)` query*: two reads, duplicated time rules,
  and a risk that the count and the returned set disagree at a boundary; rejected.
- *Filter in the frontend from an `all` response*: violates the thin-client boundary and still
  leaves overdue data in the primary view's cache; rejected.
- *Add a `scope` column or stored view state*: the scope is session-only view state; rejected.

## 3. Timeline Response: Additive `overdue_count`

**Decision**: Add a required, non-negative integer `overdue_count` to `TimelineResponse`. It always
reports the number of filtered active overdue deadlines, regardless of `scope`. When
`scope=upcoming`, it is the only server-supplied overdue information because the entries omit those
deadlines.

**Rationale**:
- The Timeline's indicator needs an accurate count while the overdue entries are absent. The items
  response has `summary.overdue_count`, but the timeline does not have a summary object.
- Returning a placeholder entry for the indicator would violate the requirement that the indicator
  is not a deadline entry and would pollute entry ordering and clustering.
- A second count endpoint would add a round trip and a second source of truth.
- One scalar is the smallest additive contract change. It is also useful in the revealed state for
  consistency checks.

**Alternatives considered**:
- *Fetch `/api/items?scope=upcoming` just for the count*: extra request, couples the timeline to a
  second projection; rejected.
- *Count overdue entries in React from an `all` timeline response*: the default view would receive
  overdue entries and would have to hide them, weakening the server-authoritative guarantee;
  rejected.
- *Return a synthetic overdue summary entry*: violates the "not a deadline entry" rule and
  complicates sorting, clustering, and detail selection; rejected.

## 4. Hidden-Item Detection After Create or Edit

**Decision**: After a successful create or update, when the primary view is in the upcoming-only
state, fetch the same filters with `scope=all` through TanStack Query's `fetchQuery` (using the
all-scope query key). Inspect the server response:

- Item present in `buckets.overdue` (Dashboard) or with `urgency === "overdue"` (Timeline) → show a
  `role="status"` notice that names the deadline, explains that it is hidden by the upcoming-only
  focus, and offers **Show overdue**.
- Item absent from the filtered all-scope response → use the existing filter-exclusion notice and
  **Clear filters** action (Timeline). On the Dashboard, check the unfiltered all-scope category
  source: if the item is overdue there, still show the overdue notice; the no-results state offers
  **Clear filters** when the active filters exclude it after reveal. Otherwise, no notice (the
  Dashboard has no filter-exclusion notice today).
- Item present and not overdue → it is visible or about to appear; select/highlight it as the
  existing create/edit flow already does.

The browser never compares `due_at_utc` to `Date.now()` to decide overdue status.

**Rationale**:
- Constitution IV forbids duplicating overdue, timezone, date-only, and filter rules in TypeScript.
  The all-scope response is exact by construction and already contains the server's classification.
- The all-scope request also populates the cache under the scope key, so the subsequent reveal is
  instant and consistent.
- The same mechanism distinguishes "hidden by the upcoming focus" from "hidden by filters", which
  the specification requires in FR-009 and FR-010.
- The check is only needed after a write and only while overdue is hidden; it adds one local request
  on save, not a polling cost.

**Alternatives considered**:
- *Compare dates in the browser*: browser clock skew, timezone/DST mistakes, and a second overdue
  definition; rejected.
- *Have the create/update response include a `hidden_by_focus` flag*: couples the write contract to
  one view's transient state and widens every mutation response; rejected.
- *Always reveal overdue after a save*: surprising and violates the default focus; rejected.
- *Always clear filters after a save*: surprising and loses the user's context; rejected.

## 5. Timeline Window: Forward-Only When Overdue Is Hidden

**Decision**: Extend `resolveTimelineWindow` with an `includeOverdue` option (default `true` to
preserve existing behavior). When `includeOverdue` is `false`:

- Every horizon starts at `nowMs`; the past is not part of the canvas.
- Fixed horizons end at `nowMs + span` (24h, 7d, 90d, 1y).
- The default 30d window ends at `nowMs + 30d`, or at the nearest future deadline when none is
  inside that range.
- `all` ends at the latest future deadline (or now).
- Left edge summaries cannot occur because there are no overdue entries; right edge summaries and
  selection inclusion continue to work.
- The now line sits at the left margin with a small inset so its tab and label are not clipped.

When `includeOverdue` is `true`, the existing symmetric/overdue-inclusive window from feature 002 is
restored unchanged. Toggling the indicator, changing the horizon, or changing filters resets manual
edge reveals.

**Rationale**:
- FR-008 requires the default Timeline horizon to cover upcoming deadlines only. A symmetric window
  would spend half the canvas on an empty past and place the now line in the middle, contradicting
  the focused view.
- Starting at now makes the product idea legible: the ledger begins at the present and runs forward.
- Restoring the 002 window when overdue is revealed preserves the existing "overdue hangs below the
  rule" language and avoids a second timeline implementation.
- The horizon labels are forward reaches; using `now → now + span` when the past is hidden is the
  literal reading of "24h", "7d", and so on.

**Alternatives considered**:
- *Keep the symmetric window and leave the past empty*: wastes space and makes the now line look
  arbitrary; rejected.
- *Always use a forward-only window*: would hide revealed overdue deadlines or force a separate
  window path for the revealed state; rejected.
- *Server-side windowing*: the horizon is session-only UI state, and adding range parameters would
  complicate caching and edge reveals; rejected.

## 6. Automatic Transition, Refresh, and Focus Handoff

**Decision**:
- The Dashboard's primary items query gets `refetchInterval: 55_000` and
  `refetchOnWindowFocus: true`. The category-source query keeps its existing behavior.
- The Timeline keeps its adaptive refetch interval (nearest future due instant plus epsilon, capped
  at 60 seconds) and its existing focus refetch.
- Query keys include `scope`, so toggling the indicator switches data sources cleanly. Mutations
  invalidate the `['items']` and `['timeline']` prefixes, covering every scope.
- When the focused/selected item leaves the visible set after a refetch, selection moves to the
  nearest remaining upcoming deadline (or clears when none remain) and the change is announced in
  the polite live region.

**Rationale**:
- SC-004 requires a deadline that crosses the current moment to leave the upcoming list and
  increment the count within 60 seconds. A 55-second interval leaves 5 seconds of headroom for the
  request and render, so the observed transition stays inside the bound even when the timer fires
  late or the response is slow.
- The Timeline already has a precise adaptive timer from feature 002; reusing it avoids adding
  reference time to the items response.
- Window-focus refetch covers edits made in another view or browser tab, which is an explicit edge
  case in the specification.
- Moving selection on data change satisfies FR-011 and prevents keyboard focus from landing on a
  vanished card or marker.

**Alternatives considered**:
- *Poll every second*: noisy and unnecessary for one local user; rejected.
- *WebSocket or Server-Sent Events*: adds a transport, lifecycle, and background behavior the
  constitution excludes; rejected.
- *Add `reference_time_utc` and seconds to `GET /api/items` so the Dashboard can schedule an exact
  timer*: widens the dashboard contract and still needs a refresh strategy; the 55-second interval
  is the smallest step that meets the success criterion with headroom; rejected.
- *Keep a 60-second interval*: the timer plus request/render latency can exceed SC-004; rejected.
- *Client-side date timers that remove items*: duplicates overdue classification and would disagree
  with the server after edits or clock changes; rejected.

## 7. Expense-Free Primary Views

**Decision**: Remove monetary display only:

- Dashboard summary: replace the "Upcoming total" amount with a `Next 7 days` count equal to
  `buckets.upcoming.length`. Keep `Due today` and `Overdue` counts. The three cells are disjoint:
  `Next 7 days` is the 7-day bucket and excludes due-today and overdue items, so nothing is
  double-counted. `visibleUpcomingCount` is reserved for empty-state decisions.
- `ItemCard`: remove the amount text and the `currencyCode` prop.
- `BucketSection`: remove the `currencyCode` prop; pass an optional action slot for the overdue tab.
- `TimelineDetail` / `TimelineDetailShell`: remove the Amount row and the `currencyCode` prop.
- `TimelinePage`: stop passing `currency_code` into the detail.
- Keep `amount_cents` in `DueItem`, `upcoming_total_cents` and `currency_code` in the API responses,
  the amount field in `ItemForm`, and the amount display in History.

No database migration, serializer change, or form validation change is needed.

**Rationale**:
- FR-016 requires the primary views to stop showing money, while FR-019 explicitly preserves
  History and the existing edit flow. Display-only removal is the smallest reversible change.
- Removing the fields from the API or database would break History and the edit form, and would
  require a migration the feature does not need.
- Keeping the response fields avoids an unrelated breaking contract change and leaves room for
  future user-visible uses without re-adding data.
- `Next 7 days` keeps the Dashboard summary deadline-focused without colliding with the existing
  `Upcoming` bucket or double-counting `Due today` items.

**Alternatives considered**:
- *Remove `amount_cents` from the data model or API*: destructive, migration-heavy, and breaks
  History/edit; rejected.
- *Hide the amount input in `ItemForm`*: risks silently changing or losing stored amounts when the
  form is saved; rejected.
- *Remove amounts from History too*: explicitly out of scope; rejected.

## 8. Contract and Versioning Strategy

**Decision**: Update the living contract at
`specs/001-due-track-v1/contracts/openapi.yaml` to version `1.2.0`:

- Add the shared `scope` query parameter to `GET /api/items` and `GET /api/timeline`.
- Add `overdue_count` to `TimelineResponse` (required, integer, minimum 0).
- Document the empty overdue bucket and accurate count semantics for `GET /api/items`.
- Document the compatibility impact: requests remain backward compatible because `scope` defaults
  to `all`, but `TimelineResponse` gains one required field. Strict 1.1.0 response validators with
  `additionalProperties: false` must update to the 1.2.0 schema. No path or existing field is
  removed or retyped, and the app remains a single-consumer local-first product.
- Update the FastAPI app version in `backend/src/due_track/api/app.py` to `1.2.0`.

Add the feature-level delta at
`specs/003-upcoming-deadlines/contracts/upcoming.openapi.yaml`. Extend
`backend/tests/integration/api/test_openapi_contract.py` with representative `scope=upcoming`
responses for both endpoints, including an overdue item and an upcoming item.

**Rationale**:
- The living contract is the single source of truth and the operation-parity test already enforces
  that the app and the document cannot drift.
- The request surface is additive: no path, operation, or existing request parameter is removed or
  redefined. The response surface gains one required field, which is a documented consumer update
  rather than a silent change. A MINOR version bump is appropriate for this local-first,
  single-consumer app.
- A feature fragment keeps the 003 delta reviewable without creating a second source of truth.
- The contract test is the guard that the documented count semantics match the implementation.

**Alternatives considered**:
- *Only update the feature fragment*: the parity test reads the living contract, so the test would
  fail and the app-wide document would drift; rejected.
- *Create a second standalone contract*: two sources of truth; rejected.
- *Make `overdue_count` optional to preserve strict 1.1.0 validators*: weakens the response
  guarantee the Timeline indicator depends on and hides a real compatibility change; rejected in
  favor of an explicit 1.2.0 note.
- *Declare a breaking version*: no request is broken and no existing field changes meaning; the
  required response field is called out explicitly; rejected.

## 9. Frontend Design: "The Ledger Tab"

**Decision**: Load and follow the `frontend-design` skill. Preserve the existing ledger visual
language and express the upcoming-only focus as a quiet **ledger tab**, not a banner or a new card
type.

- A new `OverdueIndicator` renders a hairline tab with an uppercase `Overdue` label, a serif
  tabular count, and a text action (`Show overdue` / `Hide overdue`) with a small chevron.
- Dashboard: the tab occupies the first slot in the left column, replacing the Overdue bucket in
  the default state. When expanded, the existing `BucketSection` for Overdue appears below it with a
  `Hide overdue` action.
- Timeline: the tab replaces the static `Overdue` summary cell and controls the canvas region. When
  expanded, overdue markers reappear below the rule and the symmetric 002 window is restored.
- Reuse existing semantic tokens and the existing rose/timeline-overdue accent. No new color system,
  no new dependency, and no change to the display/serif typography.
- The tab is keyboard-operable, uses `aria-expanded` and `aria-controls`, moves focus to the first
  overdue entry on reveal, returns focus to the tab on hide, and announces both transitions through
  a polite live region.
- The legend omits "Overdue hangs below" while overdue is hidden and restores it when revealed.
- Empty/no-results states use the copy defined in the plan; the all-overdue case offers both
  **New deadline** and **Show overdue**.

**Rationale**:
- Constitution VI requires a deliberate, subject-specific design that preserves the established
  ledger identity. An index tab is native to ledgers and daybooks: it summarizes a section without
  competing with the entries.
- The indicator must not look like a deadline card. A tab is visually and semantically distinct.
- Reusing tokens and type keeps the change small and avoids introducing a second visual language
  for one control.
- The focus and announcement rules satisfy FR-012 and the project's keyboard-first requirement.

**Alternatives considered**:
- *A red alert banner*: too loud for a daily-use tool and not part of the ledger language; rejected.
- *A fourth summary number with no action*: does not satisfy the one-action reveal requirement and
  does not replace the Overdue bucket; rejected.
- *Hide overdue completely*: violates the safety-net requirement; rejected.
- *A new accent color or card style*: unnecessary and risks fragmenting the identity; rejected.

## 10. Test Strategy

**Decision**:

Backend:
- Unit domain: existing status/urgency boundaries remain the authority; add coverage only if a new
  helper is introduced (none is planned).
- Integration items: default `all` unchanged; `scope=upcoming` empties only the overdue bucket and
  keeps an accurate `summary.overdue_count`; due-now equality; date-only today; filters combine with
  scope; completed/deleted excluded; invalid scope returns 422; timezone boundary.
- Integration timeline: default `all` unchanged; `scope=upcoming` omits overdue entries and returns
  an accurate `overdue_count`; count matches `all` entries with `urgency=overdue`; due-now equality;
  date-only today; filters; empty result; invalid scope; timezone.
- Completion/history: completing and undoing an overdue item updates the next read's counts;
  completing an overdue recurring item places the next occurrence in the correct upcoming/overdue
  set; `scope` semantics and stored amounts are unchanged; `amount_cents`,
  `summary.upcoming_total_cents`, and `currency_code` remain present.
- Contract: representative `scope=upcoming` items and timeline responses validate against the
  updated living schema; operation parity still passes.
- Performance: 1,000 mixed overdue/future items through both endpoints with `scope=upcoming` under
  the existing 1-second gate.

Frontend:
- `dashboard.test.tsx`: default request uses `scope=upcoming`; no overdue cards; indicator count;
  reveal/hide and focus; all-overdue, no-upcoming, no-results, and truly empty states; hidden-item
  notice after create/edit, distinct from the filter-exclusion notice; labeled region and deck copy;
  55-second refetch, window-focus refetch, and fake-timer crossing-now boundary; API error with no
  data and error with stale data; expense-free summary and cards; `Next 7 days` equals
  `buckets.upcoming.length` without double-counting due-today; keyboard operation; zero writes on
  reveal/hide; History regression.
- `timeline.test.tsx`: default request uses `scope=upcoming`; no overdue markers; indicator count
  from `overdue_count`; reveal/hide and focus; forward-only window; no left edge summary when
  hidden; expense-free detail; empty/no-results/all-overdue and error states; hidden-item notice
  distinguishing overdue-hidden from filter-excluded; selection handoff when an item crosses;
  keyboard; zero writes on reveal/hide; History regression.
- `horizons.test.ts`: forward-only spans for every horizon when `includeOverdue=false`; symmetric
  behavior when true; 30d nearest-future extension; all-time; selection inclusion; right edge
  reveal; positive-duration guard.
- `performance.test.tsx`: 1,000 server-shaped deadlines including overdue; default upcoming view
  interactive within 2 seconds (SC-009); reveal/hide settles within 1 second (SC-003).
- Existing dashboard/timeline/history tests are updated for the new query keys and
  `TimelineResponse.overdue_count`, and must continue to pass.

**Rationale**:
- Constitution V requires automated tests for every behavior change. The cases map directly to the
  specification's acceptance scenarios and success criteria.
- Testing the count independently from the visible set catches the most dangerous failure mode: a
  focused view that hides an obligation without telling the user.
- Timezone and date-only cases are tested at the API boundary, where the existing clock override
  makes them deterministic.
- History regression tests prove the expense removal did not leak into the one view that must keep
  amounts.

**Alternatives considered**:
- *Manual validation only*: not acceptable under the constitution; rejected.
- *Snapshot tests only*: do not verify counts, focus, or request scope; rejected.
- *Test the frontend by reimplementing the server rules in fixtures*: fixtures should use
  server-shaped responses; the assertions stay on rendered behavior; rejected.
