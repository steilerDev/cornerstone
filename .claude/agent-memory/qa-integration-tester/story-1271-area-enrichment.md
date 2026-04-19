---
name: Story 1271/1272/1273 — Area Enrichment Tests
description: Patterns used for sourceEntityArea / parentItemArea / predecessor.area tests across diary, invoice budget lines, household item deps
type: project
---

## Area enrichment test patterns (2026-04-19)

Six test files created for issues #1271 (diary), #1272 (invoice budget lines), #1273 (household item deps):

**Server tests**: Use in-memory SQLite (`Database(':memory:')`) except `diaryService.area.test.ts` which uses file-based DB (matches the reference `diaryService.test.ts` pattern with `mkdtempSync`).

**Key API signatures** (verified against source):
- `getDiaryEntry(db, id)` — no userId param
- `listDiaryEntries(db, query)` — returns `{ items, pagination }` (NOT `{ entries }`)
- `updateDiaryEntry(db, id, data)` — no userId param, synchronous
- `listInvoiceBudgetLines(db, invoiceId)` — returns `{ budgetLines, remainingAmount }`
- `createInvoiceBudgetLine(db, invoiceId, data)` — returns `{ budgetLine, remainingAmount }`
- `householdItemDepService.listDeps(db, hiId)` — returns `HouseholdItemDepDetail[]`
- `householdItemDepService.createDep(db, hiId, { predecessorType, predecessorId })` — returns `HouseholdItemDepDetail`

**Schema gotcha**: `invoiceBudgetLines` table has NO `createdBy` column — omit from inserts.

**Frontend tests**: All 3 use `jest.unstable_mockModule` pattern (ESM). AreaBreadcrumb uses `useTranslation('areas')` — renders "No area" for null area, area name for non-null. i18n is globally initialized in test setup so no per-test mock needed.

**Test file paths**:
- `server/src/services/diaryService.area.test.ts`
- `server/src/services/invoiceBudgetLineService.area.test.ts`
- `server/src/services/householdItemDepService.area.test.ts`
- `client/src/pages/DiaryEntryDetailPage/DiaryEntryDetailPage.area.test.tsx`
- `client/src/pages/InvoiceDetailPage/InvoiceBudgetLinesSection.area.test.tsx`
- `client/src/pages/HouseholdItemDetailPage/HouseholdItemDetailPage.dep-area.test.tsx`

**Why:** Can't run tests locally (no jest binary in worktree). Submit to CI for validation.
