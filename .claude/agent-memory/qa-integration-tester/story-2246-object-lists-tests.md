---
name: story-2246-object-lists-tests
description: Story #2246 Purchases/Companies/Milestones list tests - engine map gap, fixtures, template quirks pinned
metadata:
  type: project
---

- Money engine `result.items` only holds items with a cost line or grant share: `money.get(id)!` for a no-line purchase crashed GET /api/household-items (fixed by seeding zeros in getHouseholdItemListMoney). Regression tests in moneyService.householdItemList.test.ts and figures.consistency.test.ts.
- Fixtures: client/src/test/purchaseListFixtures.ts, milestoneListFixtures.ts (pattern of taskListFixtures).
- Template quirks (not defects): `headingCount="always"` makes headings "Purchases (3)", so App.test heading regexes need `( \(\d+\))?`; a chip alone shows "(n)" not "(n of m)"; setChip('all') writes `tradeId=all`; AJV removeAdditional strips unknown query params (no 400).
- RecordingRouter logs `GO -1` for navigate(-1), not POP.
- useCompaniesList: initial tradeIdsRef lambda is never called (effect replaces it first) - function coverage 90.9, statements/branches fine.

**Why:** avoids re-deriving these when touching the object-list pages again.
**How to apply:** reuse the fixtures and expect these behaviours.
