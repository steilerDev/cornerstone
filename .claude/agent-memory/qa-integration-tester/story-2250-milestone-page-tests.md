---
name: story-2250-milestone-page-tests
description: Milestone page (#2250) test traps — strip testids vs labels, tab param omitted for default tab, fetchDeleteImpact numeric id, server projection quirk, jest output noise filter
metadata:
  type: project
---

- Strip: a fact's `summary-fact-<id>` testid is the dd/link; the label lives in the dt, so assert the label with `toHaveAccessibleName(/^Label /)`, not `toHaveTextContent`.
- Default tab (`overview`) is not written to the URL: assert `aria-selected` on the tab, not `?tab=overview`.
- `useDeleteImpact('milestone', numId)` passes a number: `fetchDeleteImpact` is called with `('milestone', 1)`.
- Document title section for milestones is "Tasks" (nav registry), e.g. `Roof closed · Tasks · Cornerstone`.
- Empty RelatedList has no `*-add` testid; use `getByRole('button', {name: 'Add task'})`. Status words: task completed = "Done", purchase purchased = "Ordered".
- Server: fixtures that insert tasks directly skip autoReschedule, so the stored start is stale and projection keeps it (planned and forecast runs agree); not an engine bug. Purchase status CHECK is planned/purchased/scheduled/arrived.
- `jest.spyOn` on an ESM-mocked module namespace throws "read only property": add a `mockUpdate` fn to the mock factory instead.
- Pipe client jest output through `grep -vE "^Jest: importing"` (JSON import warnings flood the tail).
- Heavy server route suites need `NODE_OPTIONS="--experimental-vm-modules --max-old-space-size=6000"` and `-i` (no `--maxWorkers` together with `-i`).
- `tsc -p client` reports two TS2883 errors in `client/src/test/homeRender.tsx` and `testUtils.tsx` in this sandbox (symlinked /tmp/cs-deps); environmental, not from new tests.
