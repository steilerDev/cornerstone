---
name: story-2232-consistency-test
description: '#2232 consistency test: figureSurfaces registry (data-figure markers), figure-consistency.spec FC1-FC5, moneyMocks fixture (overview mocks MUST carry `money`), tooltip holdsUp mock, live-run recipe notes.'
metadata:
  type: project
---

- Registry `e2e/fixtures/figureSurfaces.ts`: `PROJECT_SURFACES` (home.pulse, money.overview, invoices.summary), subject surfaces (company page ×2 markers, Home attention row, Schedule tooltip), `LEFT_SCREENS`, `PENDING_SURFACES`. Readers use only `[data-figure=…]` inside a container; `parseMoney` returns cents. A new surface that shows one of the five figures is registered here in the same PR. FC5 gates only pending entries whose `screen` is a route-map id (`financing`).
- Spec `e2e/tests/consistency/figure-consistency.spec.ts` (isolated user, prefs `locale`/`home.movedNoticeSeen`/`home.setupDismissed`). FC1 uses the read-API / read-pages / read-API retry (`JSON` equality of the two `money` reads) on the shared DB; FC2/FC3 seed own records (company + invoice + paid progress payment; chain A→B→C, A late with a distinctive start offset -11 so it never joins another spec's N2 group).
- **Overview mocks must include `money`**: after #2232 `BudgetOverviewPage` reads `res.money.leftToSpend`, so every `page.route('/api/budget/overview')` mock returning only `{ overview }` crashes the page. Use `mockMoneySummary()` from `e2e/fixtures/moneyMocks.ts` (done in cost-basis, no-hero-card, print, source-filter, budget-overview specs).
- Timeline mocks: `buildTimeline({ holdsUp })` passes `holdsUp` through; without it the tooltip label reads "Holds up 0 tasks". The tooltip label counts the whole chain (computeHoldsUp) while its list shows direct successors only.
- Source-filter Scenario 2 became "Left to spend stays and reads Whole project": the figure ignores the source filter by design (money service, whole project).
- Live-run: build image via `build2232e.sh`-style script (node_modules-free copy), run with the 1.64.1 playwright image via `pwrun2224.sh`; ~660 tests per desktop run in ~2 min with 4 workers.
