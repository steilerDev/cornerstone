---
name: archive-2026-02-03-features
description: Archived QA test-pattern learnings from Feb-March 2026 feature stories — vendors/invoices/budget-sources/subsidy-programs pages (#143-#148), scheduling engine (Story 6.1-6.4), dashboard/calendar/gantt polish, budget overview refinement (#480), milestone CPM (#484), work item linking (4.7)
metadata:
  type: project
---

## VendorDetailPage / VendorsPage Behavior Notes (Story #143)

Vendors not unique by name. `VendorInUseError` 409 on invoices OR work item links (either). `deleteVendor` blocks on paid invoices too. `VendorsPage` renders BOTH desktop table and mobile cards — phone/email appear twice, use `getAllByText()`. `VendorDetailPage` renders specialty in two places (subtitle + infoList). Needs full `<Route>` setup for `useParams`/`useNavigate`. Delete success navigates away; edit success updates state inline (no reload).

## Worktree Test Execution — ARM64 Crash and Shared Types (historical)

Server tests (native `better-sqlite3`) get SIGKILL'd under ARM64 emulation in some sandboxes — client (jsdom) tests run fine. Validate server tests via CI (x86_64). Worktrees sharing the main project's `node_modules/@cornerstone/shared` symlink can have a STALE `shared/dist` after new fields are added to shared types — copy compiled `.d.ts`/`index.d.ts` from the worktree's dist into the main project's, or rely on the pre-commit hook (which rebuilds shared before typechecking).

## VendorDetailPage Invoice Tests (Story #144)

Must mock BOTH `vendorsApi.js` AND `invoicesApi.js`. Invoice renders in both desktop table and mobile cards — use `getAllByText()`. Outstanding-balance badge only appears when `invoices.length > 0`. Edit aria-label includes invoice number (or invoice id fallback) — match with regex. Delete modal shows "this invoice" when `invoiceNumber` is null. Nested route prefix: `/api/vendors/:vendorId/invoices`.

## BudgetSourcesPage / budgetSourceService Notes (Story #145)

`users` schema requires `authProvider: 'local'` in direct-insert helpers. Number `<input type="number">` blocks non-numeric `userEvent.type()` — use `fireEvent.change` for negative-value validation tests. Delete modal confirm button: "Delete Source" (not "Delete Budget Source"); Cancel is the FIRST button in the dialog. `budgetSources` has no UNIQUE name constraint. `BudgetSourceInUseError` code is `BUDGET_SOURCE_IN_USE` (not `CONFLICT`).

## BudgetOverviewPage Hero Bar Test Patterns (feat/budget-hero-bar)

`RemainingDetailPanel` renders TWICE (tooltip + mobile inline) — use `getAllByText()`. `BudgetHealthIndicator` uses `role="status"` (conflicts with loading indicator briefly). `CategoryFilter` dropdown uses `role="listbox"`. `formatShort()` renders `€NNK` notation, not raw numbers. Bar segments are `aria-hidden="true"` divs. Tooltip hide has a 50ms delay — use fake timers.

## E2E Wait Patterns: waitForResponse BEFORE the action (2026-02-23, PR #207)

**THE MOST IMPORTANT RULE**: register `page.waitForResponse(pred)` BEFORE the triggering action, never after (race condition on fast runners). Applies to debounced search, delete confirmation, proxy login. After a `waitForResponse`, also call `waitForLoaded()` — response arriving ≠ DOM updated. Never hardcode `{timeout: 7000}` on `waitForURL`/expect — use project-level timeouts (15s mobile/tablet). Proxy login: use `waitForURL(url => !url.pathname.includes('/login'))`, not `not.toHaveURL(...)` (can race with router updates).

## TagManagementPage E2E Notes (2026-02-21)

Modal has `role="dialog" aria-modal="true"` but no `aria-labelledby` — locate by role+attribute, not accessible name. Tag row Edit/Delete buttons have no aria-labels — scope to `.tagRow` first. Edit form has no aria-label — filter by `input[type="text"]` presence. `waitForTagsLoaded()` races `.tagRow.first()` vs `.emptyState`.

## SubsidyProgramsPage / subsidyProgramService Notes (Story #146)

Component imports from BOTH `subsidyProgramsApi.js` and `budgetCategoriesApi.js` — mock both. Delete confirm button: "Delete Program". 409 in-use error hides the delete confirm button. Edit form: `aria-label="Edit <program name>"`.

## Work Item Budget Properties Notes (Story #147)

`post<void>` in the API client returns parsed JSON on 201 (not undefined); 204 responses DO return undefined. `budgetSourceService.computeUsedAmount` became real (sums work items' `actualCost`). Known Bug #155: client type mismatch on `fetchWorkItemSubsidies` response shape (`subsidyPrograms` vs `subsidies`) — mock matches the CLIENT's expected shape. Duplicate link → 409; missing parent → 404.

## BudgetOverviewPage / budgetOverviewService Notes (Story #148)

`getBudgetOverview(db)` runs 5 raw SQL queries. `categorySummaries` LEFT JOINs all categories (even 0 work items) — empty DB still returns 10 seeded rows. `financingSummary.totalUsed` excludes exhausted/closed sources from both totals. Subsidy `totalReductions`: percentage uses `planned_budget * value/100` (NULL → 0); rejected programs excluded entirely.

## BudgetSource unclaimedAmount Field (feat/budget-source-unclaimed, 2026-02-23)

`unclaimedAmount` = SUM of paid invoices via WIB→source join; `claimedAmount` = SUM of claimed-status invoices — independent, test separately. `actualAvailableAmount = totalAmount - claimedAmount` (unclaimedAmount doesn't affect it). New UI layout: Total/Claimed/Unclaimed/Available + "Planned: $X" secondary line (shows `usedAmount`).

## Story 6.2 (Scheduling Engine CPM, #248, 2026-02-24)

`today` floor applies ONLY to predecessor-less items — items with predecessors can have ES before today via pure dependency math (e.g. SF(A,B) with tight lead-lag).

## Story 6.3 (Timeline Data API, #240, 2026-02-24)

`computeDateRange`: when only `startDate` set, `latest` falls back to `earliest` (and vice versa). `GET /api/timeline` returns 200 + empty `criticalPath: []` on circular deps; `POST /api/schedule` returns 409 CIRCULAR_DEPENDENCY for the same input — both intentional. `dependencies`/`milestones` are NOT date-filtered (only `workItems` is).

## Story 6.1 (Milestones Backend, #238, 2026-02-24)

`getMilestoneById` with null `scheduledDate` returns `undefined` from SQLite (null→undefined mapping). `completedAt` auto-managed by status. Milestone-work-item link routes: 409 on duplicate link; unlink preserves the work item (only the link row is deleted).

## Story 6.4 (Gantt Chart Core, PR #250, 2026-02-24)

SVG elements use lowercase `tabindex` attribute (unlike HTML `tabIndex`). `toHaveStyle({height: 48})` fails in jsdom — always use string units (`'48px'`). SVG child components (`<g>`,`<rect>`,`<text>`) need an `<svg>` wrapper to render correctly in jsdom. `ganttUtils.ts` constants: `COLUMN_WIDTHS.day=40/week=110/month=180`, `ROW_HEIGHT=40`, `BAR_HEIGHT=32`, `BAR_OFFSET_Y=4`, `HEADER_HEIGHT=48`, `SIDEBAR_WIDTH=260`. `useTimeline` hook mock call-count assertions don't work in isolation — test behavioral outcomes instead.

## EPIC-06 UAT Fixes (PR #263, 2026-02-25)

Work item IDs are `work-item-${timestamp}-${random}` strings, NOT UUIDs — never use `format: 'uuid'` in their JSON schemas (rejects valid IDs with 400). When a component delegates to a shared sub-component (e.g. MilestoneWorkItemLinker → WorkItemSelector), aria-labels/placeholders change to the sub-component's — always re-verify against current DOM, don't assume stale tests are valid. `global.fetch` mocking is more reliable than `jest.unstable_mockModule` for fetch-calling components in this codebase's history.

## Calendar Tooltip Tests (PR #297 fix, 2026-02-26)

Fire mouse events with `fireEvent.mouseEnter(el, {clientX, clientY})`. `GanttTooltip` portals to `document.body` (jsdom supports natively); appears after a 120ms delay — use fake timers. When title text appears in both the item bar and tooltip, scope with `within(tooltip)`. S/M/L column-size toggle removed — assert `queryByRole('toolbar', {name: /column size/i})` is null; `calendarSize` URL param silently ignored.

## Story #480 Budget Overview Refinement — CostBreakdownTable + BudgetOverviewPage (2026-03-06)

`budgetSources` prop became required on `CostBreakdownTable` — grep ALL render call sites when a prop becomes required. `formatShort()` rounds `(7500/1000).toFixed(0)` to `"8"` → `€8K` (verify rounding manually). `PerspectiveToggle` uses `role="radio"` on plain buttons, not native radio inputs. Level-0 row labels are lowercase (`"Available funds"` not `"Available Funds"`) — always re-read source before writing label assertions.

## Bug #484 Milestone CPM Tests (fix/484-milestone-critical-path, 2026-03-06)

A milestone has positive float (not critical) only when a longer sibling path converges on the SAME shared terminal node downstream — two independent terminal nodes with no shared successor each have 0 float independently (milestone IS critical even with a longer sibling elsewhere). Ghost diamond polygon always uses `strokeWidth=1.5` + dasharray regardless of `isCritical`; only the active (last) polygon gets `strokeWidth=3` when critical.

## Story 4.7 Work Item Linking Tests (2026-03-03)

`HouseholdItemStatus` valid values: `'not_ordered'|'ordered'|'in_transit'|'delivered'` (NOT `'not_started'`, that's WorkItem-only). Valid `HouseholdItemCategory`: `'furniture'|'appliances'|'fixtures'|'decor'|'electronics'|'outdoor'|'storage'|'other'` (NOT `'flooring'`). Drizzle WHERE clauses always use `eq(schema.table.column, value)`, never lambda comparison.
