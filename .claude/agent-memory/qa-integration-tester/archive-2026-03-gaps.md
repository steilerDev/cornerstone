---
name: archive-2026-03-gaps
description: Archived QA test-pattern learnings from the March 2026 coverage-gap sprint and feature stories (Gap 2/3/4/5/6/7, backup/restore #1146 + #1201, useSearchParams debounce, ManagePage #1035, work items/HI rework #1033/#1034, areas+trades #1031/#1032, InvoiceBudgetLinesSection #1010, CalDAV/CardDAV #933, i18n #916, Modal, dashboard UAT #729-731, dashboard cards #476, invoice budget lines #606, junction table migration #603/#611, budget service factories #497/#498, household item #390/#482, ManagePage #509)
metadata:
  type: project
---

## useSearchParams + Debounce Testing Anti-Patterns (2026-03-21)

Testing `useTableState` (combines `useSearchParams` with debounced state). **FAILS**: `jest.useFakeTimers()` + `waitFor()` (waitFor polls via real `setInterval`); the URL-sync effect (dep includes `searchInput`) fires after `setSearch()` and reads stale `searchParams`, resetting `searchInput` back before the debounce fires. **WORKS**: test URL-initialized state directly (`makeWrapper(['/?q=hello'])`); test "not yet fired" via `advanceTimersByTime(299)`; use `fireEvent.change` instead of `user.type()` on controlled inputs without state propagation.

## Gap 5 — Client Vendor/Trade/Area Utility Tests (2026-03-26)

10 new files: `areasApi/tradesApi/vendorContactsApi/davTokensApi/timelineApi.test.ts`, `areaTreeUtils.test.ts`, `useAreas/useTrades/useVendorContacts/useDavToken.test.ts`. Key: `makeArea` helper via function body + spread (inline literal + explicit key duplication → TS2783); DELETE API tests use `status:204, text: async () => ''` (apiClient never calls `.json()` at 204); empty-string search params must NOT produce a `?search=` query string; `useDavToken` generate flow calls `getDavTokenStatus()` twice (mount + after generate).

## Gap 3 (Client) — usePhotos hook + photoApi client Tests (2026-03-26)

`mockUploadPhotoApi`/XHR mocks need variadic typing (`jest.fn<(...args: any[]) => Promise<unknown>>()`); XHR mock built in `beforeEach`, event handlers captured in closure vars, fired manually (`xhrEventHandlers['load']()`); `upload.addEventListener` only registered when `onProgress` provided.

## Gap 3 — photoService + photos route Tests (2026-03-26)

Mock `sharp` via `jest.unstable_mockModule('sharp', ...)` (native binary); `AnyMock = jest.MockedFunction<(...args: any[]) => any>` for untyped jest.fn() mocks; FK constraint on `photos.createdBy` — test null via cascade-on-delete-user; route tests must mock ALL service exports (ESM named-export binding validation); auth guard `if (!request.user)` inside handlers is unreachable (~8% branch gap, known).

## Gap 7 — calendarIcal + vendorVcard Unit Tests (2026-03-26)

`calendarIcal.ts` exports `toDateOnly/computeETag/computeCalendarETag/buildCalendar`; `vendorVcard.ts` exports `computeAddressBookETag/buildVendorVcard/buildContactVcard`. `HouseholdItemCategory` is a string type alias, not interface. `DescriptionMap` keys: `wi-{id}`, `milestone-{id}`, `hi-{id}`.

## Gap 2 — Invoice Budget Lines + Standalone Invoices Tests (2026-03-25)

`invoiceBudgetLines` has partial UNIQUE indexes on `work_item_budget_id`/`household_item_budget_id` (each budget line links to at most ONE invoice) — 2nd link attempt throws `BudgetLineAlreadyLinkedError` (409); same-invoice re-link throws `ValidationError` (400). `ItemizedSumExceedsInvoiceError` is 400. XOR validation on WI/HI link. `updateInvoiceBudgetLine` rejects any budget-ID change. `listAllInvoices` `summary` is GLOBAL/unfiltered; `filterMeta.amount` excludes the amount-range filter itself.

## Gap 4+6 Client Page + API Tests (2026-03-25)

`WorkItemBudgetLine` fixture uses `confidence: 'own_estimate'` (not `'medium'`); `WorkItemMilestones` uses `{id, name, targetDate}` shape; `CreateBudgetLineRequest` uses `budgetSourceId/budgetCategoryId/plannedAmount/description`. Pages using `useTableState` need a full hook mock. `HouseholdItemsPage` needs 4 mocks (items/vendors/categories/useAreas api). `VendorsPage` needs `useTrades`+`TradePicker` mocks.

## Bug #1201 Backup Execution Path Tests (2026-03-25)

Real DB construction: `new Database(path)` + `drizzle(rawDb)`; mock `db.$client.backup` for I/O failure simulation (`Object.assign(new Error(...), {code:'SQLITE_IOERR'})`); chmod-readonly tests need `if (process.getuid?.()===0) return;` root guard; retention test pre-seeds stub `.tar.gz` files then asserts oldest is deleted after a real backup pushes count over the limit. Docker build failure (missing `tar` binary in `deps` stage) was separate from all-green test shards.

## Story #1146 Backup/Restore Tests (2026-03-22)

`BACKUP_DIR` must be outside the app data dir (config validation) — use TWO separate `mkdtempSync` calls. `AppError.code` (not `.message`) carries the machine code — use `rejects.toMatchObject({code:...})`. Delete modal shows filename in BOTH table `<td>` and modal `<strong>` — use `getAllByText`. `config.test.ts` has 4 exact-match `toEqual` snapshot tests that break whenever `AppConfig` gains a field.

## Story #1035 ManagePage Rewrite — Areas + Trades Tabs (2026-03-19)

Mock hooks (`useAreas`/`useTrades`), not API modules, when tabs use hooks. `AreaPicker` needs a simple `<select>` stub. Skeleton renders `role="status"` with no visible text. Conditional tab rendering means the inactive tab's hook is legitimately never called. Hook mutation methods (create/update/delete) swallow errors internally — component try/catch never sees them.

## Stories #1033/#1034 Work Item + HI Rework (2026-03-19)

`insertTestArea`/`insertTestVendor`/`insertTestTrade` direct-DB-insert helpers. Mutual-exclusivity (user+vendor on work item) enforced by a SQLite trigger — throws a raw error, not an AppError (`.toThrow()`, not `ValidationError` matching). SIGILL (exit 132) in sandbox — cannot run these tests locally, commit and rely on CI.

## Stories #1031/#1032 Areas + Trades Backend CRUD (2026-03-19)

Area sibling uniqueness is a partial UNIQUE constraint (same name only conflicts among siblings/same parentId). Circular reference detection walks the ancestor chain. `AreaInUseError`/`TradeInUseError` count descendants via BFS; details suppressed in API responses (`suppressDetails=true`). `areas.parentId` cascades on delete. `vendors.test.ts` trade JOIN populates real `trade` field now — needs `createTestTrade()` helper. `createTestHouseholdItem` requires `categoryId: 'hic-furniture'`.

## Issue #1010 InvoiceBudgetLinesSection — budget source + pre-fill (2026-03-18)

New mocks required: `budgetCategoriesApi.js` + `budgetSourcesApi.js` (called together via `Promise.all`). Create-form flow is 3 steps (open picker → work-item-picker → wait for "Create Budget Line" empty-state button → click → wait for heading). Remaining-amount pre-fill uses `remainingAmount.toFixed(2)` from initial fetch state.

## Story #933 CalDAV/CardDAV + Vendor Contacts (2026-03-17)

DAV Basic Auth: only the password field (`user:token`) matters. `app.addHttpMethod('PROPFIND', {hasBody:true})`/`REPORT` registered in `buildApp()` — use `app.inject({method:'PROPFIND',...})`. XML bodies need `content-type: application/xml`. `parsePropfindProps` returns `['allprop']` (not null) for empty `<prop>` blocks. DAV token = 64-char hex. Vendor delete cascades to `vendorContacts`.

## Story #916 i18n Infrastructure (2026-03-16)

Snapshot `toEqual` tests in `config.test.ts` break on new `AppConfig` fields — update all 4. `translateApiError` uses `t(code,{defaultValue:''})` then humanizes on empty result. `formatDate` de-DE March renders "Mär"/"März" — match case-insensitively. `resolveJsonModule: true` lets tests import locale JSON directly. `GET /api/config` is unauthenticated by design.

## Modal Component Testing Patterns (2026-03-15, PR #856)

`Modal` uses `createPortal(..., document.body)` — query portal content via `document.querySelector()`/`baseElement`, not the RTL `container`. `contentRef` wraps header+body+footer, so `querySelectorAll('button')` finds the header close button FIRST — don't expect a body input to receive initial focus. Backdrop: `document.querySelector('[class*="modalBackdrop"]')`.

## UAT Fixes #729/#730/#731 Dashboard (2026-03-10)

Use the `Edit` tool directly for `describe`-block surgery (Python string slicing corrupts brace matching). `daysFromMonday(n)` helper for Mon-Sun week windows. `MiniGanttCard`: 8 grid lines + 1 today marker, dependency arrows removed. `DashboardPage` skeleton count = 9 data-backed cards × 2 (desktop+mobile) = 18.

## Story #476 Invoice & Subsidy Pipeline Cards (2026-03-10)

`InvoicePipelineCard` footer total has no testid — match via `getByText(/pending total/i,{exact:false})`. Early-return empty state hides the footer entirely. `SubsidyPipelineCard` deadline warning boundary is inclusive at 14 days. Percentage-only subsidy programs hide the `group-reduction` testid entirely (zero fixed reduction). Rejected group always renders last.

## Story #606 Invoice Budget Lines UI Tests (2026-03-08)

Stub sibling components with `jest.unstable_mockModule('./Sibling.js', ...)` (relative + `.js`). Backdrop click: `.modalBackdrop` CSS class selector when no accessible role/label exists. `data-invoice-total` HTML attribute values are always strings — assert `'1500'` not `1500`.

## Story #603 / Story 15.1 — Junction Table Model Migration (2026-03-08, Bug #611)

`invoice_budget_lines` UNIQUE partial indexes mean each budget line links to AT MOST ONE invoice — tests inserting multiple invoices per budget line must be split into separate budget lines per invoice. `SqLite DOES enforce CHECK constraints on ON DELETE SET NULL` (ADR-018 claimed otherwise — Bug #611). XOR CHECK + `ON DELETE SET NULL` is fundamentally incompatible (fix: use CASCADE). Migration test pattern: symlink pre-migration SQL files into a temp dir, `runMigrations`, then apply the target migration + `INSERT OR IGNORE INTO _migrations` manually.

## Story #498 Generic Budget Service Factory (2026-03-07)

`createInvoice` signature: `(db, vendorId, data, userId)` — vendorId is a separate positional arg. HI budget category always forced to `bc-household-items` (stripped from request). WI budget lines include `invoices: []`; HI budget lines do not have an `invoices` field at all.

## Story #497 Subsidy & Payback Service Factories (2026-03-07)

`householdItems` requires `categoryId` (NOT NULL FK, seeded `hic-furniture`). `subsidyPaybackServiceFactory` uses raw SQL, not Drizzle. `supportsInvoices: false` for HI → always uses confidence margins, never actual invoice cost.

## Story #509 Unified Tags & Categories Management Page (2026-03-06)

Bugs #511 (migration 0016 used invalid `ALTER TABLE ... MODIFY` SQLite syntax) and #512 (`householdItemDepService.ts` referenced a removed `category` column) blocked ALL server tests calling `runMigrations()`. Migration 0016 seeds 8 HI categories (Furniture, Appliances, Fixtures, Decor, Electronics, Outdoor, Storage, Other). HIC entity has no `description` field (unlike BudgetCategory).

## Bug #482: HI Schedule Not Recalculated on Constraint Change (2026-03-06)

`createHouseholdItem` does NOT call `autoReschedule` (targetDeliveryDate stays null until first update). HI `isLate` is rarely true (CPM `maxES` defaults to today, floors past dates). `actualDeliveryDate` overrides CPM entirely when set (isLate always false).

## Story #390 Household Item Create & Edit Forms (2026-03-03)

`Vendor` interface has many required-nullable fields — include all in mocks. `HouseholdItemEditPage` 404-detection checks 3 message variants (`'404'`,`'not found'`,`'Not found'`). Create page: "Create Item"/"Back to Household Items"; Edit page: "Save Changes"/"Back to Item".

## Running Tests from a Worktree / EPIC-04 @cornerstone/shared Symlink Fix (historical)

Worktrees may lack `node_modules` — symlink from main repo (`ln -sf /main/node_modules /worktree/node_modules`), run jest from the worktree dir. SIGILL (exit 132) on worker spawn in some sandboxes → tests cannot run locally, rely on CI. When a worktree adds new `shared/` types, its `node_modules/@cornerstone/shared` symlink may resolve to the MAIN repo's shared (stale) — fix by re-pointing the symlink at the worktree's own `shared/` and rebuilding (`tsc -p shared/tsconfig.json`). Avoid `import type {Foo} from '@cornerstone/shared'` for brand-new types in test files; derive via `Parameters<typeof service.method>[N]` instead.

## Schema Quirk: tags table has NO updated_at

`tags` table (migration 0002): `id, name, color, created_at` only — no `updated_at`. `TagResponse` matches (no `updatedAt`).
