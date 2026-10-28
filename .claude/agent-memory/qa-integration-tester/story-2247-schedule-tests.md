---
name: story-2247-schedule-tests
description: Story #2247 Schedule tests - shared fixtures, mock traps, preview-defect finding, dead optional chains
metadata:
  type: project
---

- `client/src/test/scheduleFixtures.ts` (makeTask/Milestone/Purchase/Timeline/Area) is the shared Schedule fixture; reuse it.
- **Run jest from the repo root**, never from `client/` (inline `type` imports then fail to parse).
- `jest.unstable_mockModule` of a lib that other modules also import (workItemsApi, preferencesApi, areasApi, statusChangeApi): spread the real module first (`const real = await import(..)`), else "does not provide an export named X".
- `useFormatters` needs a locale: use `makeLocaleContextMock()` from `test/photoSpotFixtures.ts`, not LocaleProvider.
- `projectSchedule` shows STORED dates unless the today-floor moved a task: server preview fixtures need past-dated stored starts (or the settled graph) or movedItems stay empty. This was a real defect (fixed via `settleGraph`).
- `toHaveBeenCalledWith(.., domElement)` on a typed `jest.fn` can trip TS2589 (excessively deep): assert on `mock.calls[0]![i]` with `toBe`.
- Number inputs sanitise non-numeric text to `''` in jsdom.
- Panels built on Sheet stay mounted (inert, `data-open=false`): assert absence with `queryByRole('dialog')`, not the testid.
- Dead optional chains left in ScheduleToolbar (chip ref lookups), SidePanel title ref, ganttScroll `rowKeys[index] ?? null`.
