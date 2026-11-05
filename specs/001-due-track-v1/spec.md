# Feature Specification: due-track v1 — Personal Deadline & Obligation Tracker

**Feature Branch**: `001-due-track-v1`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "Build v1 of due-track, a local-first personal deadline, bill, and recurring obligation tracker with item management, status buckets, completion and recurrence advancement, dashboard filtering, and history."

## Clarifications

### Session 2026-11-04

- Q: Should completion history preserve a snapshot of the item's details at completion time, or rely on the current item record? → A: Snapshot all displayed fields at completion, including notes; history is fully self-contained.
- Q: When a recurrence ends on a specific date, should an occurrence due exactly on that date still be scheduled? → A: Yes; the end date is inclusive and is the last valid due date.
- Q: When a user deletes an active recurring item, should the entire recurrence series stop, or should only the current occurrence be removed while the series continues? → A: Delete the whole series; future occurrences stop and prior completion history is preserved.
- Q: How should categories be managed in v1? → A: Categories are free-text labels with deterministic badge colors; a label is changed or cleared by editing its item. Separate category management is out of scope.
- Q: Which timezone governs date-only end-of-day, status buckets, and recurrence calendar math? → A: The configured application timezone (`DUE_TRACK_TIMEZONE`), defaulting to the host local zone. The API returns it and the frontend formats with it.
- Q: How does undo work when the next occurrence was manually edited? → A: The edited occurrence is preserved as its own active item, the prior occurrence is restored as a new active item with a new ID, and the user is warned. An untouched occurrence is restored in place.
- Q: When a recurrence ends after a fixed number of total occurrences, how is that count stored? → A: The initial occurrence counts as the first; the stored remaining count is initialized to the requested total and includes the current occurrence. Each completion decrements it.
- Q: When a recurring item's recurrence policy is edited after it already has a next occurrence, should the next occurrence be recalculated immediately or should the change apply only after that occurrence? → A: Recalculate immediately, but preserve a manually edited current occurrence and apply the new policy afterward.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Track and organize deadlines (Priority: P1)

A single user can create, view, edit, complete, and delete due items with a title, due date, notes, category label, priority, optional amount, and recurrence policy. The dashboard groups every active item into exactly one status bucket so the user can see what needs attention now.

**Why this priority**: Item management and accurate status grouping are the core value of the product. Without them, no other workflow is useful.

**Independent Test**: Create a set of items with different due dates, priorities, categories, and recurrence settings, then confirm each item appears once in the correct bucket and in the correct order.

**Acceptance Scenarios**:

1. **Given** no items exist, **When** the user creates an item with a valid title and due date, **Then** the item is saved and appears in the correct status bucket.
2. **Given** an item is due earlier today but its timestamp is in the past, **When** the dashboard is viewed, **Then** the item appears in Overdue rather than Due Today.
3. **Given** several active items, **When** the dashboard renders, **Then** each item appears in exactly one bucket, ordered by due date ascending, then priority descending, then title alphabetically.
4. **Given** an existing active item, **When** the user edits its due date, priority, category label, amount, notes, or recurrence policy, **Then** the changes are saved and the item is reclassified if necessary.
5. **Given** invalid input such as an empty title, a title longer than 200 characters, or a missing due date, **When** the user attempts to save, **Then** the system rejects the save with a clear message and creates no item.
6. **Given** an active item, **When** the user deletes it and confirms, **Then** it is removed from active views; **When** the item is recurring, **Then** the entire series stops and prior completion history is preserved; **When** the user cancels, **Then** nothing changes.
7. **Given** an item with a category label, **When** the item is displayed, **Then** it shows a deterministic category badge and can be found through category filtering.
8. **Given** an Upcoming item with an amount, **When** the dashboard summary is viewed, **Then** its amount is included in the Upcoming total; items without amounts are excluded.
9. **Given** an item with plain-text or Markdown notes, **When** the item is viewed, **Then** the notes render safely without executing scripts or loading external embedded content.
10. **Given** saved items, category labels, and completion records, **When** the application restarts, **Then** all data remains available.
11. **Given** a due date entered in the configured application timezone, **When** it is saved and displayed later, **Then** the same local date and time are shown and the item is classified against the correct local calendar day; a date-only item due today remains Due Today until that timezone's day ends.
12. **Given** an item with a category label, **When** the user changes or clears the label and confirms, **Then** the item's label and badge update without deleting the item; **When** the user cancels, **Then** the label remains unchanged.

---

### User Story 2 - Complete items and advance recurring obligations (Priority: P2)

Completing an item records the completed occurrence in history. A one-time item leaves the active dashboard, while a recurring item automatically schedules its next occurrence according to its frequency, anchor mode, and end condition.

**Why this priority**: Recurring bills and obligations are only useful if the next occurrence is produced reliably without manual re-entry.

**Independent Test**: Complete one-time and recurring items across every supported frequency, anchor mode, and end condition, then verify the completion record and the next due occurrence.

**Acceptance Scenarios**:

1. **Given** an active one-time item, **When** the user completes it, **Then** the system records the completion timestamp, moves the item to history, and removes it from active views.
2. **Given** an active recurring item, **When** the user completes it, **Then** the system records the occurrence's original due date and actual completion timestamp, keeps the item active, and schedules exactly one next occurrence.
3. **Given** a schedule-anchored monthly item due January 31, **When** February is shorter, **Then** the next due date is the last valid day of February, and the following occurrence returns to March 31.
4. **Given** a completion-anchored recurring item, **When** the user completes it, **Then** the next due date is calculated from the actual completion time using the configured interval.
5. **Given** a recurrence that ends on a specific date or after a fixed number of total occurrences, where the initial occurrence counts as the first, **When** the final occurrence is completed, **Then** no next occurrence is created; an occurrence due exactly on the inclusive end date is still created before the series ends.
6. **Given** a schedule-anchored recurring item completed after one or more missed occurrences, **When** the next occurrence is calculated, **Then** the item advances to the first occurrence after completion without creating duplicate past occurrences.
7. **Given** an item with a custom interval of every N days, weeks, months, or years, **When** it is completed, **Then** the next occurrence respects the interval, anchor mode, and end condition.
8. **Given** a recurring item with an existing next occurrence, **When** the user edits its recurrence policy, **Then** the next occurrence is recalculated immediately; if that occurrence was manually edited, it is preserved and the new policy applies afterward.

---

### User Story 3 - Focus the dashboard with filters and search (Priority: P3)

The user can narrow the visible items by category, priority, and recurrence type, and can search live across titles and notes. Combined filters and search produce a single focused result set.

**Why this priority**: Filtering makes a growing personal list usable, especially once bills, taxes, subscriptions, and personal items coexist.

**Independent Test**: Create a mixed set of items, apply each filter individually and in combination, run partial and case-insensitive searches, then clear all filters and confirm the full list returns.

**Acceptance Scenarios**:

1. **Given** items with multiple category labels, **When** the user filters by one category label, **Then** only items with that label remain visible.
2. **Given** items at different priorities, **When** the user filters by priority, **Then** only items at that priority remain visible.
3. **Given** both recurring and one-time items, **When** the user filters by recurrence type, **Then** only the selected type remains visible.
4. **Given** items with varying titles and notes, **When** the user types a partial search term, **Then** matching items update live, case-insensitively, across both fields.
5. **Given** multiple active filters and a search term, **When** they are combined, **Then** all conditions apply together and clearing them restores the full list.
6. **Given** filtered results, **When** the dashboard summary is viewed, **Then** the summary counts and totals match the currently visible items.

---

### User Story 4 - Review history and safely undo mistakes (Priority: P4)

The user can review completed items in reverse chronological order, inspect their details, undo an accidental completion, and delete history entries only after explicit confirmation.

**Why this priority**: Completion history is the audit trail for bills and obligations. Users need a safe recovery path when they complete the wrong item.

**Independent Test**: Complete several items, inspect the history order and details, undo the most recent completion, and delete a history entry with both confirmed and cancelled actions.

**Acceptance Scenarios**:

1. **Given** completed items, **When** the history view is opened, **Then** entries appear in reverse chronological order by completion time with the original due date, completion timestamp, and a self-contained snapshot of the item's displayed fields.
2. **Given** the most recent completion of an item, **When** the user undoes it, **Then** the item returns to its prior active state with its prior due date and status.
3. **Given** an undone completion, **When** the current active occurrence has not been edited or completed since it was generated, **Then** undo restores the completed occurrence in place and removes the generated next occurrence.
4. **Given** an undone completion whose generated next occurrence has been edited, **When** the user undoes it, **Then** the edited occurrence is preserved as its own active item, the prior occurrence is restored as a new active item, and the user is warned about the preserved occurrence.
5. **Given** a history entry, **When** the user deletes it and confirms, **Then** only that history entry is removed and any active occurrence is unaffected; **When** the user cancels, **Then** nothing changes.
6. **Given** an older completion for an item that has a more recent completion, **When** the user views it, **Then** it remains inspectable but cannot be undone.

---

### User Story 5 - Operate keyboard-first (Priority: P5)

The user can quick-add a new item, move between items, and complete items using only the keyboard, with visible focus states and discoverable shortcuts.

**Why this priority**: Deadline management is repetitive, and keyboard-first operation materially reduces friction once the core workflows exist.

**Independent Test**: Using only the keyboard, create an item, move focus between items, and complete an item, confirming every action is reachable and focus remains visible.

**Acceptance Scenarios**:

1. **Given** the dashboard is open, **When** the user invokes the quick-add shortcut, **Then** a new-item form opens with focus in the title field.
2. **Given** multiple visible items, **When** the user uses navigation shortcuts, **Then** focus moves predictably between items with a visible focus indicator.
3. **Given** an item has focus, **When** the user invokes the complete shortcut, **Then** that item is completed without using a pointer.
4. **Given** the user needs help, **When** shortcut help is opened, **Then** the available shortcuts are listed.

### Edge Cases

- A due timestamp exactly equal to the current reference time is not strictly past and belongs to Due Today.
- A due timestamp earlier today is Overdue, not Due Today.
- A date-only item is due at the end of the configured application timezone's calendar day; it remains Due Today until that day ends and becomes Overdue after midnight.
- Configured application timezone daylight-saving transitions must not move an item into the wrong calendar day.
- Schedule-anchored monthly recurrence on the 29th, 30th, or 31st clamps to the last valid day of a shorter month and snaps back to the original anchor day afterward.
- Schedule-anchored yearly recurrence on February 29 clamps to February 28 in non-leap years and returns to February 29 in leap years.
- Completion-anchored monthly or yearly recurrence applies the same month-end clamping from the actual completion date.
- A recurrence end date is inclusive at the API boundary and is stored as the UTC instant for the end of that local day, so the first occurrence that would fall after it is not created.
- Undo is blocked for an older completion when a newer completion exists for the same item.
- Undo with a touched current occurrence preserves that occurrence as a separate active item and warns the user instead of silently deleting work.
- Items with no amount are excluded from amount totals; an amount of zero contributes zero.
- A search with no matches shows an empty result set and a clear no-results message.
- A title of exactly 1 or exactly 200 characters is valid; a title of 0 or 201 characters is rejected.
- Deleting an active item never deletes its prior completion history; each history entry remains fully readable from its completion snapshot, and history entries are deleted separately with confirmation.
- Deleting an active recurring item stops all future occurrences of that series; it does not skip only the current occurrence.
- Clearing a category label removes it from the item after confirmation; it never deletes the item.
- Editing a recurrence policy recalculates the next occurrence immediately unless that occurrence was manually edited; a manually edited current occurrence is preserved and the new policy applies after it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow the user to create due items with a required title of 1–200 characters and a required due date/time.
- **FR-002**: System MUST allow optional notes, a single optional category label, a priority of Low, Medium, High, or Critical, an optional non-negative amount, and a recurrence policy.
- **FR-003**: System MUST default priority to Medium and recurrence to one-time when not specified.
- **FR-004**: System MUST support date-only due items that are treated as due at the end of the configured application timezone's calendar day.
- **FR-005**: System MUST allow the user to edit and delete active items, requiring explicit confirmation before any destructive delete; deleting an active recurring item MUST stop the entire series while preserving prior completion history.
- **FR-006**: System MUST record and process all due timestamps and due boundaries in UTC, and present them in the configured application timezone for display and calendar-day calculations. Timezone conversion MUST occur only at the API/presentation boundary; backend conversion is isolated in `api/time.py`.
- **FR-007**: System MUST classify every active item into exactly one status bucket using the current reference clock: Overdue, Due Today, Upcoming (next 7 days), or Later.
- **FR-008**: System MUST treat any due timestamp strictly earlier than the current reference time as Overdue, including earlier the same day.
- **FR-009**: System MUST treat an item as Due Today when its due timestamp falls within the configured application timezone's current calendar day and is not Overdue.
- **FR-010**: System MUST treat an item as Upcoming when it is due after today but within the next 7 calendar days, and as Later when due more than 7 calendar days away.
- **FR-011**: System MUST order items within each bucket by due date ascending, then priority descending, then title alphabetically.
- **FR-012**: System MUST display active counts for Overdue and Due Today, plus the total amount of Upcoming items that have an amount, reflecting the currently visible filtered result set.
- **FR-013**: System MUST allow filtering by category label, priority, and recurrence type, and MUST combine multiple filters with AND semantics.
- **FR-014**: System MUST provide live, case-insensitive text search across item titles and notes, combined with active filters.
- **FR-015**: System MUST allow clearing all filters and search in one action.
- **FR-016**: System MUST record a completion for every completed item, capturing a snapshot of the item's displayed fields (title, notes, category label, priority, and amount at completion), the occurrence's original due date, and the actual completion timestamp.
- **FR-017**: System MUST move a completed one-time item out of active views and into completion history.
- **FR-018**: System MUST keep a completed recurring item active and schedule exactly one next occurrence according to its recurrence policy.
- **FR-019**: System MUST support recurrence frequencies of none, daily, weekly, monthly, yearly, and custom intervals of every N days, weeks, months, or years, where N is a positive integer.
- **FR-020**: System MUST support schedule-anchored recurrence, which advances from the original due date regardless of when the item is completed, and completion-anchored recurrence, which advances from the actual completion time.
- **FR-021**: System MUST default recurring items to schedule-anchored when no anchor mode is specified.
- **FR-022**: System MUST support recurrence endings of never, on an inclusive specific date (the end date is the last valid due date), or after a fixed number of total occurrences. The initial occurrence counts as the first; the stored remaining count is initialized to that total and includes the current occurrence.
- **FR-023**: System MUST clamp schedule-anchored monthly and yearly occurrences to the last valid day of a shorter month, then return to the original anchor day in subsequent occurrences.
- **FR-024**: System MUST apply equivalent clamping to completion-anchored monthly and yearly occurrences based on the completion date.
- **FR-025**: System MUST advance a late-completed schedule-anchored item to the first occurrence after completion without creating duplicate missed occurrences.
- **FR-026**: System MUST allow the user to undo the most recent completion of an item, restoring its prior active state and due date. An untouched current occurrence MUST be restored in place with its existing item ID.
- **FR-027**: System MUST remove the generated next occurrence during undo when that occurrence has not been edited or completed, restoring the completed occurrence in place.
- **FR-028**: System MUST preserve a touched current occurrence during undo, restore the prior occurrence as a new active item with a new ID, and warn the user that the touched occurrence was preserved.
- **FR-029**: System MUST prevent undo of an older completion when a newer completion exists for the same item.
- **FR-030**: System MUST display completion history in reverse chronological order using the self-contained completion snapshot, including item details, original due date, and completion timestamp.
- **FR-031**: System MUST require explicit confirmation before deleting a history entry, and deletion MUST NOT alter any active occurrence.
- **FR-032**: System MUST support keyboard-only quick-add, item navigation, and item completion, with visible focus states and discoverable shortcut help.
- **FR-033**: System MUST validate all user input and present clear errors without creating or updating partial records.
- **FR-034**: System MUST persist all items, category labels, recurrence policies, and completion history across application restarts.
- **FR-035**: System MUST allow an item to have zero or one free-text category label, trimmed to 1–50 characters. The UI MUST derive a deterministic, accessible badge color from the normalized label. Changing or clearing a label MUST NOT delete the item, and no separate category CRUD is required in v1.
- **FR-036**: System MUST treat amounts as values in a single currency, exclude items without amounts from amount totals, and perform no currency conversion.
- **FR-037**: System MUST render notes as plain text or safe Markdown without executing scripts or loading external embedded content.
- **FR-038**: System MUST operate as a single-user, local-first application with no authentication, telemetry, network sync, or external notification service in v1.
- **FR-039**: System MUST recalculate the next occurrence immediately when an active recurring item's recurrence policy is edited, using the original anchor for schedule-anchored items or the last completion for completion-anchored items; a manually edited current occurrence MUST be preserved, with the new policy applying afterward.

### Key Entities *(include if feature involves data)*

- **Due Item**: An active obligation or task. Key attributes include title, notes, due timestamp (with date-only semantics), category label, priority, amount, recurrence policy, active state, and creation/update timestamps.
- **Category Label**: An optional free-text label on an item, used for badge distinction and filtering. An item has at most one label; a deterministic color is derived from the normalized label. Clearing the label leaves the item intact.
- **Recurrence Policy**: The rule for repeating an item, including frequency, custom interval, anchor mode, and end condition. Editing the policy recalculates the next occurrence immediately while preserving a manually edited current occurrence.
- **Completion Record**: The audit entry created when an item is completed. It captures the item reference, a snapshot of all displayed item fields at completion (title, notes, category label, priority, and amount), the occurrence's original due date, the actual completion timestamp, and whether a next occurrence was generated.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can create a valid due item in under 30 seconds from opening the quick-add form.
- **SC-002**: 100% of active items are classified into exactly one status bucket and ordered correctly across a test matrix covering all four buckets and mixed priorities.
- **SC-003**: 100% of supported recurrence policies produce the correct next occurrence across daily, weekly, monthly, yearly, custom-interval, month-end, leap-year, and end-condition test cases.
- **SC-004**: Undoing an untouched completion restores the prior item state with zero duplicate or spurious next occurrences.
- **SC-005**: Filtering and search return updated results within 1 second for a personal dataset of 1,000 items.
- **SC-006**: A keyboard-only user can quick-add an item, navigate between items, and complete an item without using a pointer.
- **SC-007**: 100% of saved items and completion records persist across a normal application restart with no data loss.
- **SC-008**: 100% of history entries appear in reverse chronological order, and 100% of history deletions require confirmation before removal.
- **SC-009**: Dashboard summary counts and totals match the currently visible result set in 100% of filter and search scenarios.

## Assumptions

- The application serves a single user on one local machine with one configured application timezone (`DUE_TRACK_TIMEZONE`, defaulting to the host local zone) and one currency.
- Categories are free-text labels with deterministic badge colors; an item may have no label or one label. Changing or clearing a label never deletes the item, and separate category management is out of scope.
- Recurring items default to schedule-anchored when the user does not choose an anchor mode.
- The initial occurrence counts toward a recurrence's "after N total occurrences" limit; the stored remaining count is initialized to that total and includes the current occurrence.
- A recurrence end date is inclusive at the API boundary and is stored as the UTC instant for the end of that local day: an occurrence due exactly on the end date is valid, and the next occurrence must fall before or on that date.
- "Upcoming" covers tomorrow through the seventh calendar day after today; today is handled by Due Today, and anything beyond day seven is Later.
- A schedule-anchored item completed after missed occurrences advances to the first occurrence after completion rather than generating every missed occurrence.
- Undo is available only for the most recent completion of an item; older entries remain inspectable but cannot be undone.
- A current active occurrence is "untouched" when its row has not been edited since the completion transaction. Untouched undo restores in place; touched undo preserves the edited row and restores the prior occurrence as a new item with a new ID.
- Editing a recurrence policy recalculates the next occurrence immediately unless that occurrence has been manually edited, in which case the edited occurrence is preserved and the new policy takes effect afterward.
- Search and filter selections are session-only and are not persisted between visits.
- Completion history is immutable except for undo and confirmed deletion; each entry stores a snapshot of all displayed item fields at completion so it remains readable if the item is edited or deleted.
- Amounts are non-negative values in a single currency; no conversion or multi-currency support exists in v1.
- Deleting an active item preserves its prior completion history; deleting an active recurring item stops its entire series, and history entries are removed only through the history view.

### Out of Scope

- Authentication, multiple users, accounts, and permissions.
- Network sync, cloud storage, telemetry, and remote notifications.
- Background workers, scheduled jobs, and push or email reminders.
- Attachments, file uploads, and external content embeds.
- Multi-currency amounts, currency conversion, and financial accounting features.
- Separate category management, category CRUD, and user-defined category colors.
- Import/export, reporting, and analytics beyond the specified summary counts.
- Mobile-native applications and offline-first synchronization across devices.
