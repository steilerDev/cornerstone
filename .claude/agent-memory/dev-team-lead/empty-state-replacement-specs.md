---
name: empty-state-replacement-specs
description: Hazards when a spec replaces a rendered component (grid, chart) with an EmptyState, or re-lays-out multi-day calendar items — unmocked E2E against the shared DB, unfiltered emptiness, ARIA grid ownership, overflow from uncounted rows
metadata:
  type: feedback
---

When an empty state _replaces_ a component that used to render with no data (the calendar grid in #2198), every E2E test that asserted that component without mocking data becomes non-deterministic. The shared E2E DB may or may not hold matching rows when the test runs.

**Why:** in `timeline-calendar.spec.ts`, the gridcell, columnheader, week-grid and dark-mode tests ran unmocked. They passed only because the grid rendered for an empty dataset.

**How to apply:**

- Grep `e2e/` for the replaced component's locators (roles and testids) and list each unmocked test. Require a data mock (`page.route`) in each.
- Compute "empty" from the **unfiltered** data. Hiding everything with a filter is not "nothing exists".
- E2E mocks often omit array fields (`householdItems`). The emptiness check needs `?? []`.

**Multi-day calendar items:**

- Render one segment per week. Place it inside the gridcell of its first day and stretch it with `right: calc((1 - span) * (100% + 1px))`.
- An overlay directly under `role="row"` breaks ARIA grid ownership.
- Per-day pieces multiply tab stops and leave continuation pieces without labels.

**Overflow:** when absolutely positioned stacks size a container in JS, check that **every** stacked kind is counted. Purchases were missing from the height in both grids. Also check that the row can actually grow (`flex: 1; min-height: 0` cannot).

Related: [[global-aggregate-page-specs]], [[unmodified-tests-constraint]], [[restructure-baseline-hazards]]
