# Quickstart: Upcoming-Only Deadline Focus

**Feature**: `003-upcoming-deadlines` | **Date**: 2026-11-12

This is a validation and run guide for the upcoming-only focus and the expense-free primary views.
Implementation details live in [plan.md](./plan.md), [data-model.md](./data-model.md), and
[contracts/upcoming.openapi.yaml](./contracts/upcoming.openapi.yaml).

## Prerequisites

- Python 3.12+ and [`uv`](https://docs.astral.sh/uv/)
- Node.js 22 LTS and npm
- A current desktop or mobile browser
- Linux, macOS, or Windows
- No new services, environment variables, or dependencies are required

## Run the Application

### Backend

```bash
cd backend
uv sync
uv run python -m due_track.db.migrate
uv run uvicorn due_track.api.app:app --reload --host 127.0.0.1 --port 8000
```

For deterministic boundary checks, start with a fixed clock instead:

```bash
cd backend
DUE_TRACK_NOW_OVERRIDE=2026-11-05T12:00:00Z \
  uv run uvicorn due_track.api.app:app --reload --host 127.0.0.1 --port 8000
```

The API is available at `http://127.0.0.1:8000/api`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (typically `http://127.0.0.1:5173`) and use **Dashboard** or **Timeline**
in primary navigation. The dev server proxies `/api` to the backend.

For a production smoke test:

```bash
cd frontend
npm run build
cd ../backend
uv run python -m due_track.main
```

Then open `http://127.0.0.1:8000`.

## API Checks

Seed a mixed ledger with the fixed clock above:

```bash
curl -s -X POST http://127.0.0.1:8000/api/items \
  -H 'content-type: application/json' \
  -d '{"title":"Overdue bill","due":{"kind":"datetime","at":"2026-11-05T06:00:00-05:00"},"category":"Bills","priority":"high","amount_cents":12000}'

curl -s -X POST http://127.0.0.1:8000/api/items \
  -H 'content-type: application/json' \
  -d '{"title":"Due now","due":{"kind":"datetime","at":"2026-11-05T12:00:00Z"},"priority":"medium"}'

curl -s -X POST http://127.0.0.1:8000/api/items \
  -H 'content-type: application/json' \
  -d '{"title":"Rent","due":{"kind":"date","date":"2026-11-06"},"category":"Bills","priority":"critical","amount_cents":120000,"recurrence_freq":"monthly"}'

curl -s -X POST http://127.0.0.1:8000/api/items \
  -H 'content-type: application/json' \
  -d '{"title":"Tax return","due":{"kind":"date","date":"2026-11-13"},"category":"Taxes","priority":"critical"}'
```

Check the upcoming-only items projection:

```bash
curl -s 'http://127.0.0.1:8000/api/items?scope=upcoming'
```

Expected:

- `200` with the existing `buckets`, `summary`, `currency_code`, and `timezone` fields.
- `buckets.overdue` is `[]`.
- `summary.overdue_count` is `1` (the overdue bill), even though no overdue entry is returned.
- `buckets.due_today` contains the due-now item (equality is not overdue).
- `buckets.upcoming` contains Rent; `buckets.later` contains Tax return.
- No amount or currency is displayed by the Dashboard or Timeline, but `amount_cents` is still
  present in the JSON.

Check the upcoming-only timeline projection:

```bash
curl -s 'http://127.0.0.1:8000/api/timeline?scope=upcoming'
```

Expected:

- `200` with `reference_time_utc`, `timezone`, `currency_code`, `overdue_count: 1`, and `entries`.
- No entry has `"urgency": "overdue"`.
- The due-now item has `"urgency": "due_now"` and `"seconds_until_due": 0`.
- Entries remain chronological.

Confirm the default and the revealed projection are unchanged from pre-003:

```bash
curl -s 'http://127.0.0.1:8000/api/items' | jq '.buckets.overdue | length'
curl -s 'http://127.0.0.1:8000/api/timeline' | jq '([.entries[] | select(.urgency == "overdue")] | length), .overdue_count'
```

Expected: the default items response includes the overdue bucket; the default timeline includes
the overdue entry and `overdue_count` equals the number of overdue entries.

Check validation:

```bash
curl -s -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:8000/api/items?scope=someday'
curl -s -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:8000/api/timeline?scope=someday'
```

Expected: both return `422`.

## Automated Gates

Run all existing gates; none may regress.

```bash
cd backend
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy src
```

```bash
cd frontend
npm run test:run
npm run lint
npm run build
```

Expected:

- Backend: all existing tests pass, plus the new scope/count/contract/performance cases.
- Frontend: all existing tests pass, plus the new dashboard/timeline/horizon/performance cases.
- `npm run build` succeeds with strict TypeScript.
- `oxlint` may continue to report its pre-existing non-failing warnings; no new warnings.

## Contract Check

The app-wide contract remains `specs/001-due-track-v1/contracts/openapi.yaml`. This feature adds:

- `scope` to `GET /api/items` and `GET /api/timeline`
- `overdue_count` to `TimelineResponse`
- The empty-overdue-bucket and accurate-count semantics for `scope=upcoming`

The operation-parity test fails if the app and the living contract drift. Representative
`scope=upcoming` responses for both endpoints are validated against the documented schemas.

```bash
cd backend
uv run pytest tests/integration/api/test_openapi_contract.py -q
```

Expected: all contract tests pass; the documented operation set exactly equals the app's; and the
1.2.0 compatibility note states that strict 1.1.0 `TimelineResponse` validators must update for the
required `overdue_count` field.

## Manual Validation Scenarios

Use the existing **New deadline**, **Edit**, **Complete**, and **Delete** flows. The views must
reflect successful saves without a manual refresh.

### 1. Default focus and one-action reveal

1. With the mixed ledger above, open **Dashboard**.
2. Open **Timeline**.

Expected:

- No overdue deadline card or marker is visible by default.
- A compact **Overdue** ledger tab reports `1` and offers **Show overdue**.
- The Dashboard summary shows `Next 7 days`, `Due today`, and `Overdue` counts and no expense total;
  `Next 7 days` counts only the 7-day bucket, so the due-now item is not counted twice.
- The Timeline summary shows the overdue count, the next upcoming deadline, and the active total.
- Activating **Show overdue** reveals the overdue entry with its elapsed time/status, and the action
  becomes **Hide overdue**.
- Activating **Hide overdue** returns to the same focused view in one action.
- The reveal state resets to hidden after navigating away and returning.

### 2. Boundaries and automatic transition

1. Keep the fixed-clock server running.
2. Create a deadline exactly at the reference time and a date-only deadline due today.
3. Create a deadline 1–2 minutes in the future and leave the Dashboard/Timeline open.

Expected:

- The exact-time deadline is **Due now**, not overdue.
- The date-only deadline remains upcoming through the end of its configured local day.
- The future deadline leaves the upcoming list and increments the overdue count within 60 seconds
  without a manual refresh (the Dashboard refetches every 55 seconds to leave request/render
  headroom).
- Focus moves to the nearest remaining upcoming deadline; the change is announced to assistive
  technology.
- Repeating the check near local midnight and across a daylight-saving transition produces the same
  rule: the stored UTC instant decides status.
- Revealing and hiding overdue settles within 1 second, and with 1,000 active deadlines the default
  view is usable within 2 seconds.
- Toggling the indicator sends no `POST`, `PATCH`, or `DELETE` request; only reads occur.

### 3. Empty, all-overdue, and filtered-only-overdue states

1. Start with no active deadlines. Open both views.
2. Create only overdue deadlines. Open both views.
3. Apply a filter that matches only an overdue deadline.

Expected:

- Truly empty: an empty state explains that upcoming deadlines will appear there and offers
  **New deadline**.
- All-overdue: the state says nothing is upcoming, reports the overdue count, and offers both
  **New deadline** and **Show overdue**.
- Filters match only overdue: the no-results state says no upcoming deadlines match, reports the
  overdue count, and offers **Show overdue** and **Clear filters**.
- Showing overdue under those filters reveals exactly the matching overdue deadlines.
- A category that exists only on an overdue deadline still appears in the category filter on both
  pages; selecting it shows the no-results state with **Show overdue**.
- No state mutates, completes, archives, or deletes a deadline.

### 4. Create/edit hidden-item confirmation

1. With the default upcoming focus, create a deadline that is already overdue.
2. Edit an upcoming deadline to a past due moment.
3. Reveal overdue and edit an overdue deadline to a future moment.
4. With a filter active that excludes a new deadline, create or edit that deadline.

Expected:

- The save is confirmed.
- The overdue-hidden notice names the deadline, explains that the upcoming-only focus hides it, and
  offers **Show overdue**.
- Activating the notice reveals the deadline and highlights/selects it when it appears.
- Editing an overdue deadline to a future moment places it in the upcoming view and removes it from
  the overdue set.
- When the active filters exclude the saved item, the notice is the filter-exclusion notice with
  **Clear filters**, distinct from the overdue-hidden notice.
- No amount or currency appears in any of these primary-view notices or entries.

### 5. Complete, delete, and History

1. Reveal overdue deadlines.
2. Complete one, delete another after confirming, and edit a third to a future moment.
3. Complete an overdue recurring deadline and check its next occurrence.
4. Open **History**.

Expected:

- Completed/deleted items leave the visible set; the overdue count updates.
- The recurring completion creates the next occurrence; it appears in the upcoming view when its
  due moment is future, or remains in the revealed overdue set with the count updated when it is
  still past.
- History records the completion, and undo restores the item to the appropriate view.
- History still displays the stored amount; the Dashboard, cards, and Timeline detail do not.
- The edit form still shows and submits the amount, and editing another field does not clear it.

### 6. Expense-free primary views

1. Add deadlines with and without amounts, including one in Upcoming.
2. Inspect the Dashboard summary, every card, the Timeline markers, and the Timeline detail.

Expected:

- No amount, expense total, or currency symbol appears in any primary deadline view.
- Due dates, countdowns, categories, priorities, recurrence, notes, and actions are unchanged.
- The Dashboard summary shows `Next 7 days`, `Due today`, and `Overdue` counts, not money; the
  `Next 7 days` count excludes due-today and overdue items, so no deadline is counted twice.
- The amount remains stored and editable through **Edit**.
- Category, priority, recurrence, and text-search behavior is unchanged.

### 7. Keyboard, responsive, and theme checks

1. Navigate with the keyboard only: tab to the overdue indicator, activate it, move into the
   revealed entries, and return to the indicator.
2. Repeat at 320 px wide, at 200% zoom, and in light and dark themes.
3. Enable reduced motion.

Expected:

- The indicator, reveal, and return actions are reachable with visible focus and no keyboard trap.
- Reveal moves focus to the first overdue entry; hide returns focus to the indicator.
- The indicator exposes `aria-expanded` and `aria-controls`; transitions are announced.
- The Dashboard list region is named “Upcoming deadlines” while hidden and “Deadlines including
  overdue” when revealed; the Timeline canvas uses equivalent labels, and deck copy states that
  overdue deadlines are summarized.
- No horizontal page scrolling at 320 px; labels and counts wrap without clipping.
- The ledger visual language is preserved; the overdue tab reads as an index tab, not a deadline
  card or alert banner.
- Reduced motion removes non-essential transitions without hiding information.
- Contrast remains WCAG 2.1 AA in both themes.

### 8. API failure and recovery

1. With the views open, stop the backend.
2. Trigger a refetch (wait for the interval or refocus the window).
3. Restart the backend and activate **Retry** or **Try again**.

Expected:

- Dashboard with no data shows “The dashboard could not be read.” and **Try again**.
- Dashboard with stale data keeps the last successful cards and shows a non-blocking error strip
  with **Retry**.
- Timeline with no data shows “The timeline could not be read.” and **Try again**.
- Timeline with stale data keeps the last successful timeline and shows the non-blocking error
  strip with **Retry**.
- Recovery restores the upcoming-only view without losing filters or revealing overdue.
