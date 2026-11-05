<!--
Sync Impact Report
==================
Version change: template (unversioned) → 1.0.0
Bump rationale: Initial ratification. The template placeholders are replaced with the
project's first complete constitution.

Modified principles:
- Template principle 1 → I. Deterministic Domain & Recurrence Logic
- Template principle 2 → II. Local-First, Single-User Privacy by Default
- Template principle 3 → III. Data Safety & Atomic Persistence
- Template principle 4 → IV. Clear API Boundary & Thin Client
- Template principle 5 → V. Simplicity, YAGNI & Verified Changes

Added sections:
- Technical Constraints
- Development Workflow
- Git & Commit Policy

Removed sections:
- None

Follow-up TODOs:
- None. RATIFICATION_DATE and LAST_AMENDED_DATE are both 2026-11-04.
-->

# due-track Constitution

## Core Principles

### I. Deterministic Domain & Recurrence Logic

Overdue status, date boundaries, and future recurrence calculations MUST be deterministic
and isolated in a pure, UI-agnostic Python domain module. All timestamps and due dates
MUST be stored and processed in UTC ISO-8601 format; local timezone conversion MUST
happen only at the presentation boundary. Recurrence advancement (e.g., end-of-month
clamping, leap years, completion-to-next-due calculation) MUST be pure functions that
accept an explicit reference clock rather than calling `datetime.now()` implicitly.

Rationale: Deadline tracking lives or dies on predictable date math. Implicit system
clocks and scattered date logic make edge cases untestable and cause inconsistent
overdue states between the API and UI.

### II. Local-First, Single-User Privacy by Default

The application MUST operate entirely locally with SQLite as its single persistence
engine. The backend server MUST bind to loopback (`127.0.0.1`) by default. The tool MUST
NOT send user data over a network, collect telemetry, require an online service, or
implement authentication/multi-tenancy in v1. Any future networked sync or notification
feature requires a constitutional amendment.

Rationale: Personal deadlines, bills, and obligations are private. Local-first operation
guarantees zero latency, offline reliability, and zero cloud maintenance overhead.

### III. Data Safety & Atomic Persistence

User deadline records and completion history MUST NOT be silently lost or corrupted.
SQLite MUST run with `PRAGMA foreign_keys = ON` and Write-Ahead Logging (`WAL`) enabled
for safe, backup-friendly storage. Schema changes MUST be managed through versioned,
forward-and-backward-safe migrations. Destructive actions (hard-deleting a recurring
series or purging history) MUST require explicit user confirmation; completing or
archiving a due item MUST preserve audit history.

Rationale: A deadline tracker that loses or corrupts due dates is worse than paper.
Storage must remain trivially backup-friendly as a single local database file.

### IV. Clear API Boundary & Thin Client

All persistence, filtering, status grouping, and recurrence calculations MUST reside in
the FastAPI backend exposed strictly under `/api`. The React SPA MUST act purely as a
presentation and state-synchronization client. The frontend MUST NOT duplicate business
rules for calculating next recurrence dates or overdue thresholds. All `/api` requests
and responses MUST be validated by strict Pydantic schemas.

Rationale: Splitting domain rules across Python and TypeScript guarantees drift between
what the database records and what the dashboard displays.

### V. Simplicity, YAGNI & Verified Changes

v1 MUST remain free of background worker queues (Celery/Redis), external message brokers,
or microservices. Recurrence generation and overdue evaluation MUST occur synchronously
on read/write operations. Every behavior change MUST include automated tests, and bug
fixes MUST include a regression test. Changes SHOULD be the smallest reversible step
that satisfies the active specification.

Rationale: The project is focused; predictable quality gates and minimal dependency
surface area matter more than speculative scalability.

## Technical Constraints

- **Backend Stack:** Python managed via `uv`, FastAPI under `/api`, and SQLite with
  explicit schema migrations and Pydantic validation.
- **Frontend Stack:** React SPA (Vite + TypeScript in strict mode). Frontend source
  remains in `frontend/` and MUST pass production build and type-check gates.
- **No Background Daemons in v1:** Overdue status is computed dynamically against the
  reference timestamp; next occurrences of recurring items are spawned transactionally
  upon completion.
- **Keyboard-First UX:** Interactive web views MUST remain keyboard-operable with visible
  focus states and quick-entry shortcuts.
- **Public Contracts:** The `/api` HTTP schema and SQLite schema change only with a
  documented migration or a MAJOR/MINOR amendment.

## Development Workflow

- Make atomic commits: one logical, reviewable change per commit.
- Update `README.md` and `CHANGELOG.md` for user-visible behavior or schema changes.
- Before committing, run the full quality gate: backend tests (`pytest`),
  linter/formatter (`ruff`), strict type-checking, and the frontend production build
  (`tsc -b && vite build`).
- Add or update unit tests for every domain or API behavior change; bug fixes MUST
  include a regression test covering the exact date/recurrence edge case.
- Review every change for timezone safety, SQLite transaction safety, and strict
  adherence to the `/api` boundary.

## Git & Commit Policy

- **Atomic Commits:** Each individual task from `tasks.md` MUST be committed separately
  upon completion and test verification.
- **Convention:** All commit messages MUST follow the Conventional Commits specification:
  - Format: `<type>(<scope>): <short description>`
  - Allowed types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `style`.
  - Recommended scopes: `domain`, `api`, `db`, `ui`, `spec`.
- **Validation:** Never commit code that fails existing test suites, type-checkers, or
  linters.

## Governance

This constitution supersedes conflicting development practices. Amendments MUST include a
documented rationale, a semantic version bump, and an updated amendment date. MAJOR
versions remove or redefine governance incompatibly; MINOR versions add or materially
expand principles (such as introducing background reminders or auth); PATCH versions
clarify wording without changing meaning.

Every `/speckit.plan`, `/speckit.tasks`, and `/speckit.analyze` review MUST verify
compliance with these principles; deviations require explicit justification.

**Version**: 1.0.0 | **Ratified**: 2026-11-04 | **Last Amended**: 2026-11-04
