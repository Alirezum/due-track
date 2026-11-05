# Data Model: due-track v1

**Feature**: `001-due-track-v1` | **Date**: 2026-11-04

**Storage**: One local SQLite database file. All persisted timestamps and due boundaries are stored
as UTC ISO-8601 strings with microsecond precision. `due_at_utc` is an instant;
`recurrence_end_at_utc` is the instant at the end of the inclusive local end date. The API continues
to accept and return `recurrence_end_date` as a local calendar date; conversion happens only in
`backend/src/due_track/api/time.py`.

The model has exactly two core tables: `due_items` and `completion_logs`. A `schema_migrations`
infrastructure bookkeeping table is also present so schema changes are explicit and reversible; it
holds no user data and is not a core domain table.

## Entity Overview

```text
due_items 1 ──── * completion_logs
   │                     │
   │ current state       │ immutable audit snapshot + undo source
   └─────────────────────┘
```

- A `due_items` row represents the current occurrence of a recurring series, a completed one-time
  item, or a soft-deleted item.
- A `completion_logs` row records one completion. It stores the item's full prior state as JSON,
  the occurrence's scheduled due instant, and the actual completion instant.
- History remains readable after the item is edited or soft-deleted because every displayed field
  is inside the snapshot.
- The item ID is retained on history rows after soft deletion. The foreign key uses
  `ON DELETE SET NULL` only as a safety net for a future hard purge.

## Table: `due_items`

### DDL

```sql
CREATE TABLE due_items (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    title                     TEXT    NOT NULL
                                      CHECK (length(trim(title)) BETWEEN 1 AND 200),
    notes                     TEXT    NOT NULL DEFAULT ''
                                      CHECK (length(notes) <= 10000),
    due_at_utc                TEXT    NOT NULL,
    is_date_only              INTEGER NOT NULL DEFAULT 0
                                      CHECK (is_date_only IN (0, 1)),
    category                  TEXT
                                      CHECK (category IS NULL
                                             OR length(trim(category)) BETWEEN 1 AND 50),
    priority                  TEXT    NOT NULL DEFAULT 'medium'
                                      CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    amount_cents              INTEGER
                                      CHECK (amount_cents IS NULL OR amount_cents >= 0),
    recurrence_freq           TEXT    NOT NULL DEFAULT 'none'
                                      CHECK (recurrence_freq IN (
                                          'none',
                                          'daily', 'weekly', 'monthly', 'yearly',
                                          'custom_days', 'custom_weeks',
                                          'custom_months', 'custom_years'
                                      )),
    recurrence_interval       INTEGER NOT NULL DEFAULT 1
                                      CHECK (recurrence_interval >= 1),
    recurrence_anchor_mode    TEXT    NOT NULL DEFAULT 'schedule'
                                      CHECK (recurrence_anchor_mode IN ('schedule', 'completion')),
    recurrence_anchor_day     INTEGER
                                      CHECK (recurrence_anchor_day IS NULL
                                             OR recurrence_anchor_day BETWEEN 1 AND 31),
    recurrence_end_at_utc     TEXT
                                      CHECK (recurrence_end_at_utc IS NULL
                                             OR recurrence_end_at_utc GLOB
                                                '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]*'),
    recurrence_remaining_count INTEGER
                                      CHECK (recurrence_remaining_count IS NULL
                                             OR recurrence_remaining_count >= 0),
    status                    TEXT    NOT NULL DEFAULT 'active'
                                      CHECK (status IN ('active', 'completed', 'deleted')),
    created_at_utc            TEXT    NOT NULL,
    updated_at_utc            TEXT    NOT NULL,

    -- One-time items carry no recurrence metadata.
    CHECK (
        recurrence_freq <> 'none'
        OR (
            recurrence_interval = 1
            AND recurrence_anchor_mode = 'schedule'
            AND recurrence_anchor_day IS NULL
            AND recurrence_end_at_utc IS NULL
            AND recurrence_remaining_count IS NULL
        )
    ),

    -- Fixed frequencies use an interval of exactly one.
    CHECK (
        recurrence_freq NOT IN ('daily', 'weekly', 'monthly', 'yearly')
        OR recurrence_interval = 1
    ),

    -- Only calendar-month/year rules use an anchor day, and only schedule-anchored ones do.
    CHECK (
        recurrence_freq NOT IN ('daily', 'weekly', 'custom_days', 'custom_weeks')
        OR recurrence_anchor_day IS NULL
    ),
    CHECK (
        recurrence_anchor_mode <> 'completion'
        OR recurrence_anchor_day IS NULL
    ),
    CHECK (
        recurrence_freq NOT IN ('monthly', 'yearly', 'custom_months', 'custom_years')
        OR recurrence_anchor_mode <> 'schedule'
        OR recurrence_anchor_day IS NOT NULL
    ),

    -- At most one end condition may be configured.
    CHECK (recurrence_end_at_utc IS NULL OR recurrence_remaining_count IS NULL),

    -- Active recurring items must retain at least the current occurrence in the count.
    CHECK (status <> 'active' OR recurrence_remaining_count IS NULL
           OR recurrence_remaining_count >= 1)
);
```

### Field Semantics

| Field | Type | Required | Default | Rules |
|-------|------|----------|---------|-------|
| `id` | integer | auto | auto | Primary key, stable for the active occurrence. A new row is created on undo of a touched occurrence. |
| `title` | text | yes | — | Trimmed, 1–200 characters. Searchable. |
| `notes` | text | yes | `''` | Up to 10,000 characters. Searchable. |
| `due_at_utc` | text | yes | — | UTC ISO-8601 instant. For date-only items, set to the end of the local day (23:59:59.999999) converted to UTC. |
| `is_date_only` | integer | yes | 0 | `1` = date-only; display without a time, edit as a date. |
| `category` | text | no | `NULL` | Free-text label, trimmed, 1–50 characters. Case-insensitive exact filter. Badge color is derived deterministically in the frontend. |
| `priority` | text | yes | `medium` | `low`, `medium`, `high`, `critical`. Sorted descending within a bucket. |
| `amount_cents` | integer | no | `NULL` | Non-negative integer cents. `0` is valid and contributes zero. Excluded from totals when `NULL`. |
| `recurrence_freq` | text | yes | `none` | `none`, `daily`, `weekly`, `monthly`, `yearly`, `custom_days`, `custom_weeks`, `custom_months`, `custom_years`. |
| `recurrence_interval` | integer | yes | 1 | Positive. Must be `1` for fixed frequencies; `N` for `custom_*` frequencies. |
| `recurrence_anchor_mode` | text | yes | `schedule` | `schedule` (advance from the original/current due date) or `completion` (advance from the actual completion). |
| `recurrence_anchor_day` | integer | conditional | `NULL` | 1–31. Required for schedule-anchored `monthly`, `yearly`, `custom_months`, and `custom_years`. `NULL` for day/week rules and completion-anchored rules. |
| `recurrence_end_at_utc` | text | no | `NULL` | UTC ISO-8601 instant equal to the end of the inclusive local end date (23:59:59.999999 local), converted at the API boundary. The API exposes this as the local date `recurrence_end_date`. At most one end condition. |
| `recurrence_remaining_count` | integer | no | `NULL` | Remaining occurrences including the current active occurrence. Initialized to the user's requested total occurrences at creation; `1` means the next completion ends the series. `0` only on a completed count-limited series. At most one end condition. |
| `status` | text | yes | `active` | `active`, `completed`, `deleted` (soft delete). Dashboard queries use `active` only. |
| `created_at_utc` | text | yes | — | UTC ISO-8601, set on insert. |
| `updated_at_utc` | text | yes | — | UTC ISO-8601, set on every mutation. The completion transaction sets it equal to `completed_at_utc`; later edits make it greater. |

### Indexes

```sql
CREATE INDEX idx_due_items_active_due
    ON due_items (due_at_utc)
    WHERE status = 'active';

CREATE INDEX idx_due_items_category
    ON due_items (category)
    WHERE status = 'active';

CREATE INDEX idx_due_items_priority
    ON due_items (priority)
    WHERE status = 'active';

CREATE INDEX idx_due_items_recurrence
    ON due_items (recurrence_freq)
    WHERE status = 'active';
```

## Table: `completion_logs`

### DDL

```sql
CREATE TABLE completion_logs (
    id                            INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id                       INTEGER
                                  REFERENCES due_items (id) ON DELETE SET NULL,
    scheduled_due_at_utc          TEXT    NOT NULL,
    completed_at_utc              TEXT    NOT NULL,
    previous_state_snapshot_json  TEXT    NOT NULL
                                          CHECK (json_valid(previous_state_snapshot_json))
);

CREATE INDEX idx_completion_logs_completed
    ON completion_logs (completed_at_utc DESC);

CREATE INDEX idx_completion_logs_item_completed
    ON completion_logs (item_id, completed_at_utc DESC);
```

### Field Semantics

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `id` | integer | auto | Primary key; used by undo and delete-history routes. |
| `item_id` | integer | no | References the item whose occurrence was completed. Retained after item soft deletion. Becomes `NULL` only if a future hard purge removes the item. |
| `scheduled_due_at_utc` | text | yes | The original due instant of the completed occurrence, before advancement. UTC ISO-8601. |
| `completed_at_utc` | text | yes | Actual completion instant. UTC ISO-8601. Used for ordering, completion-anchored recurrence, and undo fresh/stale detection. |
| `previous_state_snapshot_json` | text | yes | JSON envelope containing the full pre-completion item state plus snapshot metadata. Validated with SQLite `json_valid`. |

### Snapshot JSON Shape

`previous_state_snapshot_json` is a self-contained envelope. It contains every field needed to
render history and to restore the prior active item.

```json
{
  "snapshot_version": 1,
  "spawned_next_occurrence": true,
  "next_due_at_utc": "2026-12-01T23:59:59.999999+00:00",
  "item": {
    "id": 7,
    "title": "Rent",
    "notes": "Pay via bank transfer",
    "due_at_utc": "2026-11-01T23:59:59.999999+00:00",
    "is_date_only": true,
    "category": "Bills",
    "priority": "critical",
    "amount_cents": 120000,
    "recurrence_freq": "monthly",
    "recurrence_interval": 1,
    "recurrence_anchor_mode": "schedule",
    "recurrence_anchor_day": 1,
    "recurrence_end_at_utc": null,
    "recurrence_remaining_count": null,
    "status": "active",
    "created_at_utc": "2026-10-15T08:00:00.000000+00:00",
    "updated_at_utc": "2026-10-15T08:00:00.000000+00:00"
  }
}
```

Rules:

- `snapshot_version` is `1` for this release; future readers can branch on it.
- `spawned_next_occurrence` records whether completion produced a next active occurrence. It is
  derived at completion time and retained for audit.
- `next_due_at_utc` is present only when a next occurrence was generated.
- `item` contains all `due_items` fields at the moment before completion, including `status`
  (`active` for a normal completion) and the persisted UTC `recurrence_end_at_utc`.
- The API maps `recurrence_end_at_utc` back to the local date `recurrence_end_date` and enriches the
  snapshot with derived `due_local_date`, `due_local_time`, and `is_recurring` before returning it.
- The snapshot is immutable. History display reads it directly; no joins or current-item lookups
  are required.
- Undo restores the `item` object. For a touched current occurrence, it inserts the snapshot as a new
  active row with a new ID and fresh timestamps; the original `created_at_utc` may be retained in
  the snapshot for audit but the new row's creation time is the restore time.

## Derived Values (not persisted)

All timezone conversion for derived values happens in `backend/src/due_track/api/time.py`.

| Value | Derivation |
|-------|------------|
| Local due date | `due_at_utc` converted to the application timezone at the API boundary, then `.date()`. |
| Local due time | `due_at_utc` converted to the application timezone at the API boundary, omitted when `is_date_only` is true. |
| `recurrence_end_date` | `recurrence_end_at_utc` converted to the application timezone at the API boundary, then `.date()`. |
| Local completion date/time | `completed_at_utc` converted to the application timezone at the API boundary for recurrence inputs and display. |
| `is_recurring` | `recurrence_freq != 'none'`. |
| `status_bucket` | Computed by the domain layer from UTC instants plus boundary-supplied local dates; returned as bucket arrays by the API, not stored. |
| `category_color` | Deterministic hash of the normalized category label to a fixed accessible palette in the frontend. |
| `can_undo` | `true` only when the log is the latest completion for an existing, non-deleted item. |
| `currency_code` | Configured `DUE_TRACK_CURRENCY`, returned alongside the dashboard summary for formatting. |

## Status Bucket Rules

The domain receives UTC instants (`due_at_utc`, `reference_time`) and the boundary-supplied local
dates (`due_local_date`, `reference_local_date`) and performs no timezone conversion:

1. **Overdue**: `due_at_utc < reference_time`.
2. **Due Today**: `due_local_date == reference_local_date` and the item is not Overdue.
   - A timed item due exactly at `reference_time` is Due Today.
   - A date-only item is stored at the end of the local day, so it remains Due Today until local
     midnight and becomes Overdue afterward.
3. **Upcoming**: `due_local_date` is tomorrow through today + 7 calendar days, inclusive.
4. **Later**: `due_local_date` is today + 8 calendar days or later.

Each active item belongs to exactly one bucket. Sort order within every bucket:

1. `due_at_utc` ascending.
2. Priority descending: `critical` > `high` > `medium` > `low`.
3. `title` ascending, case-insensitively.

Filtering (`category`, `priority`, `recurring`, `q`) is applied before bucketing. Bucket arrays and
summary counts/totals describe the same filtered result set. Empty buckets are returned as empty
arrays.

## Timezone Boundary Contract

`backend/src/due_track/api/time.py` is the only module that performs timezone conversion between UTC
and local time. `config.py` may import `ZoneInfo` only to validate the configured IANA name. The
boundary module:

- Converts date-only input to 23:59:59.999999 on the configured local date, then to UTC.
- Converts timed input and all persisted `*_utc` fields to UTC.
- Converts the API's local `recurrence_end_date` to `recurrence_end_at_utc` and back.
- Supplies `due_local_date`, `due_local_time`, `reference_local_date`, `completion_local_date`,
  `completion_local_time`, and `end_local_date` to the domain.
- Converts the domain's returned next local date/time back to a UTC instant for persistence.

Domain modules (`status.py`, `recurrence.py`, `sorting.py`) import neither `ZoneInfo` nor FastAPI or
sqlite3, never call `datetime.now()`, and perform no timezone conversion. They receive UTC instants
for comparisons and boundary-derived naive local calendar components for calendar rules. These
components are never persisted; every persisted timestamp and due boundary remains UTC.

## Recurrence Rules

### Inputs

- Recurrence policy: `recurrence_freq`, `recurrence_interval`, `recurrence_anchor_mode`,
  `recurrence_anchor_day`, `recurrence_remaining_count`, and the boundary-supplied local end date
  derived from `recurrence_end_at_utc`.
- The current occurrence's UTC due instant plus boundary-supplied current local date/time.
- The UTC completion instant plus boundary-supplied completion local date/time.
- `is_date_only`.

The domain returns a naive next local date/time or `None`; the API boundary localizes it and persists
the UTC instant.

### Schedule-Anchored Advancement

Advance from the current occurrence's local due date, not from completion time.

- `daily` / `custom_days`: add `N` local calendar days.
- `weekly` / `custom_weeks`: add `N * 7` local calendar days.
- `monthly` / `custom_months`: add `N` calendar months, set day to `recurrence_anchor_day`, and
  clamp to the last valid day of the target month.
- `yearly` / `custom_years`: add `N` calendar years, keep the current due date's month, set day to
  `recurrence_anchor_day`, and clamp to the last valid day of the target month.
- Timed items preserve their local time-of-day.
- If the candidate local date/time is at or before the boundary-supplied completion local date/time,
  keep advancing until the first candidate strictly after completion. Skipped occurrences are not
  stored.
- End conditions are checked for each candidate. A candidate is valid only if its local date is on
  or before the boundary-supplied local end date (when set). Remaining count is handled by the
  service.

### Completion-Anchored Advancement

Advance from the actual completion.

- `daily` / `custom_days`: add `N` local calendar days to the completion local date.
- `weekly` / `custom_weeks`: add `N * 7` local calendar days.
- `monthly` / `custom_months`: add `N` calendar months to the completion local date, clamp the day
  to the last valid day of the target month, and use the completion date's day as the base.
- `yearly` / `custom_years`: add `N` calendar years to the completion local date, clamp the day to
  the last valid day of the target month.
- Timed items preserve their original local time-of-day.
- End conditions are checked as above.

### End Conditions

- **Never**: both persisted end fields are `NULL`.
- **On date**: `recurrence_end_at_utc` is inclusive. The boundary supplies the local end date; the
  first candidate after that local date is not created.
- **After count**: `recurrence_remaining_count` includes the current occurrence and is initialized
  to the user's requested total occurrences. On completion:
  - `NULL` → unlimited.
  - `1` → the series ends; the item becomes `completed`.
  - `> 1` → decrement by one and create exactly one next occurrence.
  - `0` is valid only on a completed count-limited item.
  - Each completion consumes exactly one count. Missed schedule-anchored occurrences that are
    skipped by fast-forwarding are not counted, because they are never created or completed.

At most one of `recurrence_end_at_utc` and `recurrence_remaining_count` may be set. One-time items
set neither.

### Examples

| Rule | Current due | Completion | Next due |
|------|-------------|------------|----------|
| Schedule monthly, anchor 31 | Jan 31 | Feb 2 | Feb 28 (or Feb 29) |
| Schedule monthly, anchor 31 | Feb 28 | Mar 1 | Mar 31 |
| Schedule yearly, anchor Feb 29 | Feb 29, 2024 | Mar 1, 2024 | Feb 28, 2025 |
| Schedule yearly, anchor Feb 29 | Feb 28, 2025 | Feb 28, 2025 | Feb 29, 2028 |
| Completion monthly | Jan 31 | Feb 10 | Mar 10 |
| Completion monthly | Jan 31 | Mar 31 | Apr 30 |
| Schedule daily, late | Nov 1 | Nov 18 | Nov 19 |
| End date inclusive | Nov 30 | Dec 1 | none (Dec 1 > Nov 30) |
| Remaining count 1 | Nov 15 | Nov 15 | none, series completed |

## State Transitions

### Create

1. Validate the due input and recurrence policy at the API boundary.
2. Convert date-only input to end-of-local-day in UTC and convert local `recurrence_end_date` to
   `recurrence_end_at_utc` in `api/time.py`.
3. Derive `recurrence_anchor_day` for schedule-anchored month/year rules when omitted.
4. Insert a `due_items` row with `status = 'active'` and UTC creation/update timestamps.
5. Return the active item, mapping `recurrence_end_at_utc` back to the local `recurrence_end_date`.

### Edit an Active Item

1. Load an `active` item; missing/completed/deleted items return 404.
2. Apply provided fields using Pydantic's field-set detection so omitted fields are unchanged and
   explicit `null` clears nullable fields.
3. If the due date changed:
   - Update `due_at_utc` and `is_date_only` at the API boundary.
   - For schedule-anchored month/year rules, update `recurrence_anchor_day` to the new local due
     day computed by `api/time.py`. This is a manual reschedule and marks the occurrence as touched.
   - When `recurrence_end_date` is supplied, convert it to `recurrence_end_at_utc` at the boundary.
4. If the recurrence policy changed:
   - If the item has no completion logs, keep the current due date and apply the new policy to
     future advancement.
   - If the item has a latest completion log and the occurrence is untouched
     (`updated_at_utc <= latest_log.completed_at_utc`), recompute the current due date as the next
     occurrence from the original anchor (schedule) or last completion (completion). If the new
     policy produces no valid next occurrence, mark the item `completed` and set a count-limited
     remaining count to `0`.
   - If the occurrence is touched (`updated_at_utc > latest_log.completed_at_utc`), preserve the
     current due date exactly; the new policy applies after it is completed.
5. Set `updated_at_utc` to the edit time and persist atomically.

### Complete

1. Load an `active` item; otherwise 404.
2. Build the snapshot envelope from the current row.
3. Insert a `completion_logs` row with the snapshot, `scheduled_due_at_utc = due_at_utc`, and
   `completed_at_utc = now`.
4. For a one-time item: set `status = 'completed'`, `updated_at_utc = now`, and return
   `{ log, item: null }`.
5. For a recurring item: compute the next occurrence.
   - The API boundary supplies the current and completion local date/time and the local end date to
     the pure recurrence domain function, then localizes the returned next local date/time to UTC.
   - If valid: update `due_at_utc`, decrement `recurrence_remaining_count` when it is non-null,
     keep `status = 'active'`, set `updated_at_utc = now`, and set the snapshot's
     `spawned_next_occurrence = true` and `next_due_at_utc`.
   - If none: set `status = 'completed'`, set a count-limited remaining count to `0` (or leave it
     `NULL` for date/unlimited rules), set `updated_at_utc = now`, and record
     `spawned_next_occurrence = false`.
6. Return the log and the advanced item (or `null`).

The log insert and the item update happen in one `BEGIN IMMEDIATE` transaction.

### Delete an Active Item

1. Load an `active` item; otherwise 404.
2. Set `status = 'deleted'` and `updated_at_utc = now`.
3. Do not delete completion logs. The entire recurring series stops because no active occurrence
   remains.
4. Return 204 after the frontend confirmed the action.

### Undo a Completion

1. Load the log and its item.
2. `can_undo` requires: the log is the latest completion for that `item_id`, and the item exists
   with `status <> 'deleted'`.
3. If not allowed, return 409.
4. If the item's `updated_at_utc == log.completed_at_utc` (untouched):
   - Restore every field from the snapshot on the existing row, restore `status = 'active'`, set
     `updated_at_utc = now`, and delete the log.
   - Return the restored row with its existing item ID, `preserved_touched_occurrence = false`, and
     `warning = null`.
5. If `updated_at_utc > log.completed_at_utc` (touched):
   - Leave the current row intact as a separate active item.
   - Insert a new `due_items` row from the snapshot with a new item ID, `status = 'active'`, and
     fresh creation/update timestamps.
   - Delete the log.
   - Return the new `restored_item`, `preserved_touched_occurrence = true`, and a warning message
     stating that the touched occurrence was preserved.
6. For a touched case where the current row was completed again, the log is not the latest and undo
   is blocked earlier.

### Delete a History Entry

1. Load the log; otherwise 404.
2. Hard-delete only that log.
3. Do not modify any `due_items` row.
4. Return 204 after frontend confirmation.

## Validation Invariants

- `title` is trimmed and 1–200 characters.
- `notes` is at most 10,000 characters.
- `category` is trimmed, 1–50 characters, or `NULL`.
- `amount_cents` is a non-negative integer or `NULL`.
- `due_at_utc` is a valid UTC ISO-8601 instant.
- `recurrence_interval >= 1`; fixed frequencies require exactly `1`.
- Schedule-anchored `monthly`, `yearly`, `custom_months`, and `custom_years` require
  `recurrence_anchor_day` in 1–31; other rules require `NULL`.
- `recurrence_anchor_mode` defaults to `schedule`.
- At most one of `recurrence_end_at_utc` and `recurrence_remaining_count` is set.
- An active recurring item's `recurrence_remaining_count` is at least `1` when set.
- One-time items use `recurrence_freq = 'none'`, interval `1`, schedule anchor mode, and no
  recurrence end fields.
- `recurrence_end_at_utc` is a UTC ISO-8601 instant for the end of the inclusive local end date;
  the API's `recurrence_end_date` is the corresponding local date and is inclusive.
- `status` is one of `active`, `completed`, `deleted`.
- `created_at_utc` and `updated_at_utc` are UTC ISO-8601; `updated_at_utc >= created_at_utc`.
- Dashboard queries include only `status = 'active'`.
- Deleting an item never deletes history. Deleting history never changes an active occurrence.
- No amounts are converted; totals sum `amount_cents` for Upcoming items only and skip `NULL`.

## API Mapping

| API concept | Persistence |
|-------------|-------------|
| `DueItem.recurrence_end_date` | `recurrence_end_at_utc` converted to the application timezone at the API boundary, then `.date()`. |
| `DueItem` response | Selected `due_items` columns plus derived `is_recurring`, `due_local_date`, and `due_local_time`. |
| `summary.upcoming_total_cents` | Sum of `amount_cents` for filtered Upcoming items where `amount_cents IS NOT NULL`. |
| `summary.overdue_count` / `due_today_count` | Counts of filtered active items in those buckets. |
| `CompletionLog.previous_state` | Parsed `previous_state_snapshot_json.item`, enriched at the API boundary with derived `due_local_date`, `due_local_time`, `is_recurring`, and local `recurrence_end_date`. |
| `CompletionLog.scheduled_due_at_utc` | `completion_logs.scheduled_due_at_utc`. |
| `CompletionLog.completed_at_utc` | `completion_logs.completed_at_utc`. |
| `CompletionLog.can_undo` | Latest-log check plus item existence and non-deleted status. |
| `UndoResponse.restored_item` | Restored row with the existing ID, or a newly inserted snapshot row with a new ID. |
| `UndoResponse.preserved_touched_occurrence` | `true` only when the current occurrence was edited after completion. |
