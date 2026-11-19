# Feature Specification: Upcoming-Only Deadline Focus

**Feature Branch**: `003-upcoming-deadlines`

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "i want only show a deadline for things upcomming like that not the expance or things like that ..."

## Clarifications

### Session 2026-11-12

- Q: What does "expance" refer to? → A: Expenses and money — hide monetary amounts, expense totals, and currency from the primary deadline views while keeping stored amounts intact.
- Q: Which views should default to upcoming-only? → A: Both the Dashboard and the Timeline.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See only what is still ahead (Priority: P1)

A single user opens the Dashboard or Timeline and sees only deadlines that have not yet passed: items
due now, later today, and on future days. Deadlines that are already overdue no longer compete for
attention in the main list. A compact indicator tells the user how many deadlines are overdue, and
one action reveals them, so the focused view never silently hides a missed obligation.

**Why this priority**: The request is to focus the product on upcoming obligations. Without this
behavior, the feature does not change what the user sees.

**Independent Test**: Create deadlines that are overdue, due exactly now, due later today, due in a
few days, and due far in the future. Open the Dashboard and the Timeline and confirm that only the
due-now and future deadlines appear as deadline entries, the overdue count is accurate, and the
reveal action exposes every overdue deadline.

**Acceptance Scenarios**:

1. **Given** active deadlines both past and future, **When** the Dashboard or Timeline opens,
   **Then** every visible deadline entry is due now or later and no overdue deadline appears as an
   entry by default.
2. **Given** one or more overdue deadlines, **When** the upcoming-only view is shown, **Then** a
   compact indicator states how many deadlines are overdue and offers a way to reveal them.
3. **Given** the overdue indicator, **When** the user activates it, **Then** every overdue deadline
   matching the current filters is revealed with its elapsed time and status, and the user can
   return to the upcoming-only view in one action.
4. **Given** a deadline due exactly at the current moment, **When** the view is shown, **Then** it
   is treated as upcoming ("Due now"), not overdue.
5. **Given** a date-only deadline whose configured local due day is today, **When** the view is
   shown, **Then** it remains upcoming until that local day ends.
6. **Given** a future deadline crosses the current moment while the view is open, **When** it
   becomes overdue, **Then** it leaves the upcoming-only list, the overdue count increases, and
   focus moves to the nearest remaining upcoming deadline.
7. **Given** no upcoming deadlines but one or more overdue deadlines, **When** the view is shown,
   **Then** an empty state says that nothing is upcoming and offers both "New deadline" and
   "Show overdue".
8. **Given** no deadlines at all, **When** the view is shown, **Then** the empty state explains that
   upcoming deadlines will appear there and offers a way to add the first deadline.
9. **Given** active filters, **When** they are applied, **Then** only upcoming deadlines matching
   the filters are shown; if the filters match only overdue deadlines, the no-results state reports
   that and offers "Show overdue".
10. **Given** the user adds a deadline that is already overdue, **When** it is saved, **Then** the
    app confirms the save, explains that the deadline is hidden by the upcoming-only focus, and
    offers a one-action way to reveal it.

---

### User Story 2 - Keep the deadline view free of expense information (Priority: P2)

The user wants the primary deadline views to read as deadlines, not as an expense tracker. Monetary
amounts, expense totals, and currency formatting do not appear in the Dashboard summary, deadline
cards, Timeline markers, or deadline detail view. The optional amount remains part of the stored
record and can still be managed through editing, but it does not compete with the deadline itself.

**Why this priority**: Removing money from the primary views is the second half of the request. It
keeps attention on time rather than cost.

**Independent Test**: Add deadlines with and without amounts, including one in the Upcoming group.
Confirm that the Dashboard summary, cards, Timeline, and detail view show no amount, currency, or
expense total, while the due dates, countdowns, categories, priorities, recurrence, and notes remain
unchanged.

**Acceptance Scenarios**:

1. **Given** an upcoming deadline with an amount, **When** it appears on the Dashboard or Timeline,
   **Then** no amount or currency is displayed.
2. **Given** the Dashboard summary, **When** it is viewed, **Then** it shows deadline-focused
   information and no expense total.
3. **Given** a deadline detail view, **When** it is opened, **Then** it shows the due moment,
   countdown or status, category, priority, recurrence, and notes, but no amount.
4. **Given** an amount is hidden from display, **When** the user edits the deadline, **Then** the
   stored amount is not silently changed or deleted.
5. **Given** the user searches or filters, **When** amounts are hidden, **Then** category, priority,
   recurrence, and text-search behavior is unchanged.

---

### User Story 3 - Preserve access to the full deadline ledger (Priority: P3)

The user can still reach overdue deadlines and completed history when needed. The upcoming-only focus
changes the default emphasis, not the availability of the underlying records.

**Why this priority**: A deadline tracker must not make missed obligations unreachable. This story
protects the safety net while the default view stays focused.

**Independent Test**: From the upcoming-only view, reveal overdue deadlines, open one, edit it,
complete it, and confirm history records it; return to the upcoming-only view and confirm the overdue
count updates.

**Acceptance Scenarios**:

1. **Given** the overdue deadlines are revealed, **When** the user selects one, **Then** its full
   details and actions are available.
2. **Given** an overdue deadline is completed from the revealed view, **When** the action succeeds,
   **Then** it leaves the overdue set, history records it, and the overdue count decreases.
3. **Given** an overdue deadline is edited to a future due moment, **When** the change is saved,
   **Then** it appears in the upcoming-only view and leaves the overdue set.
4. **Given** an upcoming deadline is edited to a past due moment, **When** the change is saved,
   **Then** it leaves the upcoming-only view, the overdue count increases, and a confirmation names
   it and offers "Show overdue".
5. **Given** the user reveals overdue deadlines, **When** they navigate away and return, **Then**
   the default upcoming-only focus is restored; the reveal is a session-only view state.
6. **Given** a keyboard-only user, **When** they use the overdue indicator and the reveal and return
   actions, **Then** both are reachable with visible focus and no keyboard trap.

---

### Edge Cases

- Every active deadline is overdue.
- No active deadlines exist.
- A deadline is due exactly at the current moment.
- A date-only deadline approaches local midnight, including across a daylight-saving transition.
- A future deadline crosses the current moment while the view is open.
- Active filters match only overdue deadlines.
- A newly created deadline is already overdue.
- A recurring deadline is completed and its next occurrence is upcoming or overdue.
- Multiple deadlines share the same due moment.
- A deadline is changed in another view or browser tab while the upcoming-only view is open.
- The view is used at 320 pixels wide, at 200% zoom, and in light and dark themes.
- An amount exists on a record while expense information is hidden from the primary views.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Dashboard and the Timeline MUST default to showing only deadlines whose due moment
  is at or after the current reference time. Overdue deadlines MUST NOT appear as deadline entries
  in the default view.
- **FR-002**: When one or more active overdue deadlines match the current filters, the default view
  MUST show a compact overdue indicator with an accurate count. The indicator MUST NOT be a deadline
  entry and MUST NOT reveal overdue details until the user activates it.
- **FR-003**: Activating the overdue indicator MUST reveal every active overdue deadline matching the
  current filters with the same details and actions as other deadlines. The user MUST be able to
  return to the upcoming-only view in one action.
- **FR-004**: A deadline due exactly at the current reference time MUST be treated as upcoming
  ("Due now"), consistent with the existing status rules.
- **FR-005**: Date-only deadlines MUST remain upcoming until the end of their configured local due
  day, following the existing timezone rules.
- **FR-006**: The upcoming-only view MUST update automatically as the reference time advances and as
  deadline data changes, without a manual refresh. A deadline that becomes overdue MUST leave the
  default list and increment the overdue count.
- **FR-007**: The Dashboard MUST retain its Due Today, Upcoming, and Later grouping for upcoming
  deadlines. The Overdue bucket MUST be replaced by the overdue indicator in the default view and
  MUST reappear when overdue deadlines are revealed.
- **FR-008**: The Timeline MUST keep its now line, horizons, clusters, edge summaries, countdowns,
  details, and actions for upcoming deadlines. Its default horizon MUST cover upcoming deadlines
  only; overdue deadlines MUST appear only in the revealed state.
- **FR-009**: Existing category, priority, recurrence, and text-search filters MUST apply to the
  upcoming set with AND semantics. When filters match only overdue deadlines, the view MUST show a
  no-results state that names the situation and offers "Show overdue".
- **FR-010**: Creating a deadline that is already overdue MUST confirm the save, explain that it is
  hidden by the upcoming-only focus, and offer a one-action reveal. Editing a deadline from upcoming
  to overdue MUST do the same; editing from overdue to upcoming MUST place it in the upcoming view.
- **FR-011**: Completing, deleting, or editing a deadline MUST keep the view consistent: completed
  and deleted items leave, overdue counts update, and focus moves to the nearest remaining upcoming
  deadline.
- **FR-012**: The overdue indicator and the reveal and return actions MUST be keyboard-operable with
  visible focus and MUST be announced to assistive technology.
- **FR-013**: The default view's accessible name and description MUST state that it shows upcoming
  deadlines only and that overdue deadlines are summarized.
- **FR-014**: Empty, no-results, all-overdue, and error states MUST explain what is shown and what
  the user can do next.
- **FR-015**: The upcoming-only focus MUST be a view behavior, not a data change. It MUST NOT
  delete, complete, archive, or mutate overdue deadlines.
- **FR-016**: The Dashboard, the Timeline, and the deadline detail view MUST NOT display monetary
  amounts, expense totals, or currency formatting. The stored amount MUST remain unchanged and
  editable through the existing edit flow.
- **FR-017**: The Dashboard summary MUST reflect the upcoming focus and the overdue indicator rather
  than an expense total, including when filters are active.
- **FR-018**: The reveal and return state MUST be session-only and MUST reset to upcoming-only on a
  new visit, consistent with the existing filter behavior.
- **FR-019**: The History view MUST remain unchanged; it remains the place to review completed
  deadlines.
- **FR-020**: The change MUST preserve the existing local-first, single-user, offline behavior and
  MUST NOT add notifications, reminders, background processing, or network calls.

### Key Entities

- **Upcoming Deadline**: An active deadline whose due moment is at or after the current reference
  time, including "Due now" and all future horizons.
- **Overdue Deadline**: An active deadline whose due moment is strictly before the current reference
  time. It remains an active record, is hidden from the default view, and is available through the
  overdue indicator.
- **Overdue Indicator**: A compact, non-deadline summary that reports the count of overdue deadlines
  matching the current filters and provides the reveal action.
- **Upcoming-Only View State**: The session-only state that determines whether overdue deadlines are
  hidden (the default) or revealed. It does not change stored data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of deadline entries visible in the default Dashboard and Timeline are due now or
  later; zero overdue deadline entries are visible by default.
- **SC-002**: The overdue indicator's count matches the number of active overdue deadlines matching
  the current filters in 100% of tested filter scenarios.
- **SC-003**: Activating the overdue indicator reveals 100% of matching overdue deadlines within
  1 second, and returning to upcoming-only restores the default within 1 second.
- **SC-004**: A deadline that crosses the current moment while the view is open leaves the upcoming
  list and increments the overdue count within 60 seconds, without a manual refresh.
- **SC-005**: At least 90% of first-time users can identify the next upcoming deadline within
  10 seconds of opening the Dashboard or Timeline.
- **SC-006**: At least 90% of users can find and reveal overdue deadlines within 15 seconds when
  they need them.
- **SC-007**: The default view remains usable from 320 through 1920 pixels wide, at 200% zoom, and
  in light and dark themes, with no horizontal page scrolling and no clipped labels.
- **SC-008**: 100% of upcoming-only controls and reveal and return actions are keyboard-reachable
  with visible focus and no keyboard trap.
- **SC-009**: With 1,000 active deadlines, including overdue deadlines, the default view becomes
  usable within 2 seconds and reveal and return actions settle within 1 second.
- **SC-010**: Entering or leaving the upcoming-only view deletes, completes, archives, or otherwise
  mutates zero deadline records.
- **SC-011**: Zero monetary amounts, expense totals, or currency symbols appear in the primary
  deadline views.

## Assumptions

- "Upcoming" means due at or after the current reference time, including due now and all future
  horizons. It is not limited to the existing seven-day Upcoming bucket.
- "A deadline" in the request is read as the set of upcoming deadlines, not only the single next
  deadline.
- The Dashboard and Timeline are the primary deadline views affected. History remains a
  completed-item audit view and is unchanged.
- The default is upcoming-only with an overdue count and a one-action reveal, rather than hiding
  overdue deadlines completely. This preserves access to missed obligations.
- The reveal and return state is session-only and resets on a new visit.
- Overdue deadlines remain active records; nothing is deleted, completed, or archived by the view
  change.
- Date-only deadlines follow the configured application timezone and remain upcoming through the
  end of their local due day.
- Existing filters, sorting, recurrence, completion, undo, and history semantics are unchanged
  except for the default visibility of overdue items.
- The existing Later group remains part of the upcoming view; "upcoming" is used in the everyday
  sense of "not yet past", not only the seven-day bucket.
- The amount remains stored and editable through the existing edit flow but is hidden from the
  primary deadline views; no data migration or deletion occurs.
- The app remains local-first, single-user, offline, and notification-free.
- The upcoming and overdue classification follows the same authoritative reference time and status
  rules as the existing views; the new view does not introduce a second date calculation that could
  disagree with them.

### Out of Scope

- Deleting, archiving, or automatically completing overdue deadlines.
- New notification, reminder, or background scheduling features.
- Changes to recurrence math, completion history, undo, or deletion semantics.
- Multi-user, sync, or cloud features.
- A separate expense-tracking module or financial reporting.
- Removing the amount field from the data model or migrating existing amounts.
- Redesigning the Timeline's visual language beyond hiding overdue entries and adjusting the
  default horizon.
- Native mobile applications.
