---
name: gotcha-wizard-raf-focus-steal
description: ReportWizardPage moves focus to the step h2 in a requestAnimationFrame after every step change; typing right after navigation loses keystrokes on loaded CI; plus once-mock leakage cascade
metadata:
  type: feedback
---

ReportWizardPage focuses the new step's `<h2>` inside `requestAnimationFrame` on every step change. If a test starts `user.type` before that frame fires, focus jumps from the input to the heading mid-typing and the keystrokes are lost (e.g. the max-file-size limit stays empty, so the page skips the sizing gate).

**Why:** #2167 CI shard 4 flaked on 3 `ReportWizardPage.parts.test.tsx` tests. Not reproducible unloaded; reproduced by stubbing `window.requestAnimationFrame` to `setTimeout(cb, 12..60)`. The lost keystrokes also left a `mockResolvedValueOnce` unconsumed; `jest.clearAllMocks()` keeps once-queues, so it leaked into the next test and caused a second, unrelated-looking failure.

**How to apply:** after navigating to a step and before typing, `await waitFor(() => expect(heading level 2 name X).toHaveFocus())`; assert the typed value (`toHaveValue`) in the helper; `mockReset()` the pipeline mocks in `beforeEach` instead of relying on `clearAllMocks`. Do NOT raise `asyncUtilTimeout` for this. Reproduce timing flakes with the rAF stub, not CPU hogs (hogs were inconsistent).
