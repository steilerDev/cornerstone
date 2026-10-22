---
name: story-2230-home
description: '#2230 Home E2E: HomePage POM + homeMocks fixture (stateful attention mock), home.spec scenarios, the dashboard-reference sweep, live-run findings (2 production defects, StatusMenu action appearance has no option step).'
metadata:
  type: project
---

- `e2e/tests/navigation/home.spec.ts` replaced `dashboard.spec.ts`; POM `e2e/pages/HomePage.ts`; mocks `e2e/fixtures/homeMocks.ts` (`installHomeMocks(page, state)` serves `/api/attention`, `/api/home/*`, `/api/diary-entries`, `/api/settings`; Not now and `PATCH /api/work-items/:id` remove the row until their Undo; the catch-up count follows). `defects.json` D-01/D-02/D-04 point at home.spec.ts; the ids are in test names.
- Real data is unusable on Home (shared DB): mock everything, but the four home preference rows are real and belong to the per-worker isolated user (`resetPreferences` in `beforeEach`; boolean keys cannot be PATCHed to false, so DELETE them). A fresh shared DB can be in set-up mode (checklist instead of sections): real-data specs must mock `/api/home/setup` (`setupResponse([...5 core])`) or write `home.setupDismissed`.
- StatusMenu `action` appearance (Mark done / Start): no option step. `open()` then `dateToday`; use `StatusMenuControl.actionToday()` / `actionPickedDate(iso)`, not `chooseToday`.
- Row selectors: rows are direct `li` children of `<prefix>-list` (`needs-attention`, `tidy-up`, `catch-up`); group items share the row testid prefix, so never match by prefix.
- Collapsed Tidy up keeps rows in the DOM (`hidden` body): assert `toBeHidden()`, not `toHaveCount(0)`.
- German h1 is "Start": `openHome` waits for "Home", so German tests install mocks and goto by hand.
- Two undo toasts can coexist (Start + Not now): scope by message with `undoToastWith`.
- Old Home pieces gone: the timeline is no longer fetched on `/` (scheduler-truth now reads `/api/timeline` directly), no Add/Customize dropdown (use the New menu POM), no Source utilization card (money-truth asserts Money only).
- Live defects found (tests are `test.fail` guards until fixed): H5c from 768px the catch-up Modal backdrop covers the Undo toast (button unclickable, Ctrl+Z works); H5d when the last late task leaves the catch-up dialog, focus is not moved to Close (all viewports).
- Old dashboard preference mapping (migration 0048) cannot be E2E-tested (runs once at start-up); H13b only proves the retired key no longer hides anything.
