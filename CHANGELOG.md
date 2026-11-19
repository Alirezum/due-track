# Changelog

All notable changes to due-track are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
