# Issue #1816 — component reuse (Modal focus trap, KeyboardShortcutsHelp, Badge x4, 3 shared hooks)

Date: 2026-07-07

## What shipped

- 3 new hook test files (100% coverage each): `client/src/hooks/useDebounce.test.ts`,
  `useDebouncedCallback.test.ts`, `useClickOutside.test.ts`.
- `Modal.test.tsx`: +7 Tab-cycling focus-trap tests.
- `PhotoMetadataModal.test.tsx`: deleted the redundant private focus-trap describe block
  (now covered generically by Modal.test.tsx).
- `KeyboardShortcutsHelp.test.tsx`: full rewrite — Modal now portals into `document.body`,
  so `container.querySelector(...)` for backdrop/kbd elements silently returns null after
  the migration. Must query `document`/`baseElement`, not the render `container`.
- `BudgetHealthIndicator.test.tsx`: retargeted `toHaveClass('onBudget'|'atRisk'|'overBudget')`
  from the `role="status"` wrapper to `status.querySelector('span')` (the nested Badge span),
  since the CSS class moved onto Badge's own span. Class names also changed
  (`onBudget`→`budgetHealthOnBudget` etc, per new Badge.module.css variants).
- `SearchPicker.test.tsx`: added the missing "click inside portal dropdown doesn't close it"
  regression test (fireEvent.mouseDown on the listbox itself) — confirms `useClickOutside`'s
  `refs.floating` inclusion still protects the portal the same way the old
  `document.querySelector('[data-search-picker-dropdown]')` check did.
- `DiaryPage.test.tsx`: added "page param not reset to 1 on mount with `?q=foo&page=3`" —
  the regression the `isFirstSearchSync` guard protects against.
- `DiaryEntryEditPage.test.tsx`: added the uploadingCount-cancels-pending-autosave test
  (Scenario 44b). Had to extend the existing `PhotoUpload` mock to also capture
  `onUploadingCountChange` (previously only `onUpload` was captured).
- `WorkItemDetailPage.test.tsx`: added a comment clarifying the subtasks-empty-state
  assertion now exercises the real `detail.subtasks.noSubtasks` i18n key, not a JSX literal
  (text unchanged in English so the assertion string didn't need to change).
- Verified unchanged (all passed as-is): UpcomingMilestonesCard, CriticalPathCard,
  SubsidyPipelineCard, DocumentBrowser, BudgetOverviewPage, DataTableColumnSettings,
  OverflowMenu, MilestonesPage, WorkItemsPage — plus a blast-radius sweep of Modal/SearchPicker
  consumers not explicitly listed in the spec (AreaPicker, OrientationPicker, DataTable,
  EntityFilter, MassMoveModal, EditBudgetLineModal, BackupsPage, UserManagementPage) — all green.
- Deleted `StatusBadge/StatusBadge.test.tsx` and `HouseholdItemStatusBadge/HouseholdItemStatusBadge.test.tsx`
  (stale — no source component existed).

## CODE_BUG found (pre-existing, NOT introduced by #1816)

`DiaryEntryEditPage.tsx`: mounting a **draft** entry fires one immediate, no-op-content
`updateDiaryEntry` autosave call even with zero user interaction. Root cause: the metadata-change
effect (`skipAutoSaveOnMountRef` guard, lines ~194-219) consumes its "skip" flag on the FIRST
effect run — which happens on initial mount (before `entry` loads, all metadata state is initial
values). When `loadEntry()` resolves and `entry?.status` flips from `undefined` to `'draft'`, the
effect's dependency array changes value, so it re-runs — but the skip flag is already spent, so it
fires `triggerAutoSave(true)` → an immediate `updateDiaryEntry` call with the *just-loaded,
unedited* content. Confirmed via isolated probe test (mount only, no interaction →
`mockUpdateDiaryEntry` called once). This predates #1816 — the PR only touched the debounce/cancel
plumbing (`doSaveImpl`/`scheduleAutoSave`), not this skip-ref effect. Existing Scenario 44 test
doesn't catch it because it asserts `toHaveBeenCalledWith(...)` not call count. Worked around in
the new Scenario 44b test by flushing+`mockClear()`-ing this spurious call before asserting the
real (debounce-cancel) behavior under test. Recommend filing a separate bug issue if not already
tracked — not in scope for me to fix (test-only agent).

## Reusable pattern: capturing an untested mock prop

When a component under test mocks a child (e.g. `PhotoUpload`) and only captures *some* of its
props (e.g. `onUpload` but not `onUploadingCountChange`), and a new spec needs to exercise the
uncaptured prop, extend the mock factory to also capture it — don't create a parallel mock. Wrap
any resulting `setState`-triggering invocation in `act()` since it's called directly, not through
`fireEvent`/`userEvent` (which auto-wrap).

## `.test.ts` vs `.test.tsx` for hook tests that need DOM fixtures

`useClickOutside` needed real rendered DOM elements (refs + a raw non-ref `HTMLElement`) to
exercise "accepts both RefObject and raw HTMLElement targets" — but the spec named the file
`useClickOutside.test.ts` (matching the hook's own `.ts`, no JSX). TypeScript disallows JSX syntax
in `.ts` files. Solution: use `React.createElement(...)` directly instead of JSX in the harness
component — keeps the `.test.ts` extension while still rendering real DOM via
`@testing-library/react`.
