# Changelog

All notable changes to due-track are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-11-13

### Added

- Upcoming-only default for the Dashboard and Timeline. Both pages request `scope=upcoming`, so
  overdue deadlines stay out of the primary views until the user reveals them.
- One-action overdue indicator with a server-authoritative filtered count, `aria-expanded` /
  `aria-controls` semantics, keyboard operation, focus handoff, and polite announcements. The reveal
  state is page-local, resets on navigation, and performs no writes.
- Shared `scope` query parameter (`upcoming | all`, default `all`) on `GET /api/items` and
  `GET /api/timeline`, plus the required `overdue_count` scalar on `TimelineResponse`.
- 1,000-item backend performance coverage for mixed overdue/future items through both upcoming-scope
  endpoints.

### Changed

- The Dashboard summary replaces the money total with a `Next 7 days` count derived from the 7-day
  bucket, alongside the existing `Due today` and `Overdue` counts.
- Deadline cards and timeline details no longer render amounts or currency. Stored `amount_cents`
  remains editable, History still displays it, and `summary.upcoming_total_cents` /
  `currency_code` remain in API responses for compatibility.
- Overdue records remain fully reachable and retain their edit, complete, delete, history, and undo
  behavior; completing or editing one updates the count on the next read.
- Living OpenAPI contract and FastAPI app version advance to `1.2.0`. Requests remain backward
  compatible because `scope` defaults to `all`; strict 1.1.0 `TimelineResponse` validators with
  `additionalProperties: false` must accept the new required `overdue_count` field.

### Data model

- No migration and no new table. Upcoming focus is a read-time projection over existing
  `due_items` columns, and no deadline records are mutated by revealing or hiding overdue items.

## [1.1.0] - 2026-11-05

### Added

- Timeline destination with a horizontal time ledger at ≥1024 px and a vertical chronological
  ledger below it. Active deadlines appear against a labelled now line with exact due moments,
  live two-unit countdowns, overdue/status bands, and at-a-glance remaining time.
- Six time horizons (24h, 7d, 30d, 90d, 1y, all), same-instant clustering, and left/right edge
  summaries that extend the visible span without changing the chosen horizon.
- Timeline filters (category, priority, recurrence, search) with AND semantics, plus a keyboard
  flow for selection and actions: `J`, `K`, `Home`, `End`, `Enter`, `C`, `E`, `Delete`, `?`, and
  `Esc`.
- Detail rail (≥1280 px), inline detail panel (1024–1279 px), and dialog (<1024 px) showing full
  deadline fields, recurrence details, notes, and Complete/Edit/Delete actions. Focus moves to the
  nearest remaining deadline after removal, and the horizon never jumps.
- Read-only `GET /api/timeline` projection with server-authoritative urgency (`overdue`, `due_now`,
  `within_24h`, `within_7d`, `later`), `seconds_until_due`, the API reference time, timezone, and
  currency code.
- Regression coverage for DST/local midnight, exact 24-hour and 7-day boundaries, 20 identical
  instants, 1,000 items, long text, filter-excluded creates, and repeated actions.

### Changed

- Living OpenAPI contract and FastAPI app version advance to `1.1.0` with the additive timeline
  operation and schemas.
- Keyboard shortcuts now include `Home`/`End` on the timeline; shared recurrence-summary helpers
  moved to `frontend/src/lib/recurrence.ts`.

### Data model

- No migration and no new table. The timeline reads only existing `due_items` columns and stores no
  timeline state; completion, undo, deletion, and history semantics are unchanged.

### Documentation

- README destinations, timeline projection, keyboard, frontend-design, and quality-gate guidance.
- Timeline quickstart covers horizons, clusters, filters, details, actions, time passage, keyboard
  operation, responsive/zoom/theme checks, and performance scenarios.

## [0.1.0] - 2026-11-05

### Added

- Local-first FastAPI/SQLite backend mounted under `/api`, with a React 19 + Vite dashboard.
- Deadline CRUD with title, notes, due date or datetime, free-text category, priority, and amount.
- Status buckets (Overdue, Due Today, Upcoming, Later) with deterministic due-date/priority sorting
  and dashboard summary counts.
- Recurring deadlines with daily, weekly, monthly, yearly, and custom day/week/month/year intervals;
  schedule- or completion-anchored advancement; month-end clamping; end-date and occurrence-count
  limits.
- Completion audit history with immutable snapshots, single-step undo, and history deletion.
- Filters and debounced search across category, priority, recurrence, title, and notes.
- Keyboard-first operation: `N`, `/`, `J`/`K`, `Enter`, `C`, `E`, `Delete`, `?`, and `Esc`, with
  typing suppression, visible focus, active-item highlighting, and a shortcut help panel.
- Dark/light theme toggle, responsive layout, and accessible focus/skip-link behavior.
- Production entrypoint that serves the built frontend from `frontend/dist` while keeping `/api`
  authoritative.
- OpenAPI contract consistency, cross-story workflow, and 1,000-item performance smoke tests.

### Data model

- Two core tables: `due_items` for current occurrences and `completion_logs` for immutable completion
  history.
- Categories are free-text labels with deterministic frontend badge colors; there is no categories
  table or category CRUD endpoint.
- Timestamps are stored in UTC. Only `backend/src/due_track/api/time.py` converts between UTC and the
  configured application timezone; domain functions stay timezone-free.

### Documentation

- README setup, development, production-style, configuration, data-model, timezone, shortcut, and
  quality-gate guidance.
