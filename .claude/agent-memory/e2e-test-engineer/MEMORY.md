# E2E Test Engineer — Agent Memory (Index)

> Detailed notes live in topic files. This index links to them.
> See: `e2e-pom-patterns.md`, `e2e-parallel-isolation.md`, `story-epic08-e2e.md`

## E2E Parallel Isolation (2026-02-20)

`testPrefix` fixture in `e2e/fixtures/auth.ts` — use `async (_fixtures, use, testInfo)` (NOT `{}` — ESLint `no-empty-pattern`).
Produces `"E2E-des0 Vendor Name"` — unique per worker+project. See `e2e-parallel-isolation.md`.
Shared-state tests (profile, admin user) use `test.describe.configure({ mode: 'serial' })`.
Count assertions: use `>= DEFAULT_CATEGORIES.length` not `=== 10`; capture `countBefore` before actions.

## Two Critical E2E Anti-Patterns (2026-02-21)

See `e2e-pom-patterns.md` for full details on:

1. **Hardcoded `waitFor({ timeout: N })`** overrides project-level tablet/mobile 15s timeout
   — Always omit explicit timeout in POM `waitFor()` calls (NEVER use `timeout: 5000`)
2. **`[class*="prefix"]` strict mode violations** — `emptyState` matches `emptyStateTitle` too
   — Add element type: `div[class*="emptyState"]` instead of `[class*="emptyState"]`
3. **Mobile CSS-hidden table** — `display:none` elements still in DOM; `textContent()` works,
   clicks fail — check `tableContainer.isVisible()` before using table rows

## E2E Wait Patterns: waitForResponse BEFORE the action (2026-02-23)

`page.waitForResponse(pred)` must ALWAYS be registered BEFORE the action that triggers the request.
After a `waitForResponse` for search/filter, call `waitForLoaded()` to wait for React DOM update.

## EPIC-08 Paperless E2E (2026-03-02)

See `story-epic08-e2e.md` — Paperless NOT available in E2E environment (no testcontainer yet).
All document tests currently validate "not configured" state. Real Paperless container integration is needed.

## Gantt Touch Two-Tap Pattern

`GanttChart.tsx` uses `handleBarOrSidebarClick` which checks `isTouchDevice`.
On touch devices: first tap shows tooltip, second tap navigates.
E2E tests on tablet must click/press Enter twice with 300ms pause between taps.

## Key File Locations

- Test fixtures: `e2e/fixtures/auth.ts` (testPrefix, authenticatedPage)
- Test data: `e2e/fixtures/testData.ts` (routes, API endpoints)
- Page objects: `e2e/pages/` (AppShellPage, WorkItemsPage, etc.)
- Containers: `e2e/containers/cornerstoneContainer.ts`
- Playwright config: `e2e/playwright.config.ts`

## Viewport Timeouts

- Desktop: `timeout: 10_000`, no explicit action/expect timeout (Playwright default 30s)
- Tablet: `timeout: 60_000`, `expect/action/navigationTimeout: 15_000`
- Mobile: `timeout: 60_000`, `expect/action/navigationTimeout: 15_000`
