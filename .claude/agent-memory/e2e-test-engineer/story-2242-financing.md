---
name: story-2242-financing
description: #2242 Financing/funding source/grant pages — POMs, seed helpers, grant-delete cleanup trap, static-only verification
metadata:
  type: project
---

POMs: `FinancingPage`, `FundingSourcePage`, `GrantPage`, `FinancingFormDialog` (e2e/pages/). Seeds: `fixtures/financingSeed.ts` (`createSource`, `createGrant`, `deleteGrant`, `findOwnFundsId`, `readFinancing`), `fixtures/sourceLineMocks.ts` (Cost-tab line/move mocks). Suites in `tests/financing/`. Old BudgetSourcesPage/SubsidyProgramsPage POMs and 5 budget specs deleted.

- **Grant delete trap**: server 409s `SUBSIDY_PROGRAM_IN_USE` while tasks are linked; cleanup runs newest-first (grant before its tasks), so `deleteGrant` unlinks covered items (GET /items, DELETE `/api/<work|household>-items/:id/subsidies/:gid`) before deleting.
- Own funds source name is "Own funds" (migration 0049); id still `discretionary-system`. Financing/source/grant pages are not sidebar views except `financing`; bankReport, source, grant highlight `sidebar-view-financing`.
- Strip fact order: source amount, allocated, paid, submitted, unallocated, rate (not Own funds), documents (Paperless on); grant rate, cap, expected, deadline, documents.
- Verified statically only (tsc, eslint, prettier, `playwright test --list`); no live run.
