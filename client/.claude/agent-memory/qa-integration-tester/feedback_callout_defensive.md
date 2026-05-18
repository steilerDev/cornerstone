---
name: callouttool-defensive-returns
description: Lines 77 and 116 of CalloutTool.ts are genuinely unreachable defensive guards; 96.55% is the practical coverage ceiling for this file
metadata:
  type: feedback
---

`CalloutTool.ts` has two defensive `return []` statements (lines 77 and 116) at the end of
`onPointerMove` and `onPointerUp` respectively. They would only be reached if `phase` is `null`
while `draftShape` and module-level `drawState` are simultaneously set — an impossible combination
in the normal lifecycle.

**Why:** The module state machine ensures that whenever `draftShape` is set, `phase` is either
`'box'` or `'tail'`. The defensive returns are dead code present for TypeScript exhaustiveness.

**How to apply:**
- Do not spend time trying to engineer test scenarios to hit these lines.
- Accept 96.55% as the ceiling for `CalloutTool.ts` (statements: 96.55%, branches: 92.85%).
- Document in test file comments that these lines are intentionally unreachable.
