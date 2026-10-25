---
name: story-2237-money-overview
description: '#2237 Money overview E2E: BudgetOverviewPage POM + test ids, buildMockBreakdown/mockMoneyOverview fixtures, surface rules (table vs list), traps hit in the live run.'
metadata:
  type: project
---

- POM `e2e/pages/BudgetOverviewPage.ts` (rewritten): ids `money-headline(-figure|-verdict-badge|-range|-explain-toggle|-explain)`, `money-summary`, `money-fact-<funding-total|expected-cost|expected-grants|paid|still-to-pay>`, `money-funding-row-<id>`, `breakdown-{view|payment|estimate|show}-<value>` chips (payment values `all|paid|outstanding`), `breakdown-sources-button` + `-panel`/`-sheet` (+ `-panel-clear|-panel-done` / `-sheet-clear|-done`), `breakdown-row|cell|toggle-<key>`, `breakdown-total(-<col>)`, `breakdown-list(-row-<key>|-heading|-back)`, `breakdown-status`, `money-page-actions` (the trigger button), `money-action-print|bank-overview`, `money-print-summary`.
- Fixtures: `moneyMocks.ts` `mockMoneyOverview(page, opts)` installs overview + breakdown mocks (breakdown honours `deselectedSources`, records requests); `buildMockBreakdown` derives every view from six invented lines (total 18,800 / paid 2,000 / still to pay 1,100). Overview mocks must be `{ overview: { subsidySummary }, money }`.
- Table and drill list are both mounted; switched by a CONTAINER query (card width 768px), so table assertions run on desktop only and the phone scenarios on the mobile project. Print forces the table on every width.
- Traps: `CreateMenu.choose()` already opens the menu (calling `open()` first toggles it shut); controlled source checkboxes revert for a tick, so `.check()/.uncheck()` throws ("did not change its state") - click then `expect`; a debounced refetch needs `expect.poll` on recorded requests; the mobile bottom sheet stays mounted after close (use `toBeHidden`, not `toHaveCount(0)`); an aria-disabled checkbox inside the sheet can be outside the viewport (use focus + Space).
- AC9 real-API seed: a task line POST needs `budgetSourceId` (400 "budgetSourceId is required"); an offer is an invoice with status `quotation` linked via `POST /api/invoices/:id/budget-lines`.
- Below 1024px the h1 is the title-menu button; `PageTitle` marks it `data-print-title` and `print.css` prints it as plain h1 text (chevron hidden), so the title prints on every viewport (#2237).
- Run recipe: `build2237e.sh` (node_modules-free copy, strip `*.test.ts(x)`), `pwrun2224.sh` with image 1.64.1; ~1240 tests across 3 projects in ~7 min with 4 workers. FC1 failed once when the whole consistency+navigation set ran in parallel (page figures lacked FC2's seeded invoice) and passed on rerun; `home.spec` H18 mobile "Frame load interrupted" is a reload flake.
