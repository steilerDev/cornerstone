---
name: story-1947-wizardreducer
description: wizardReducer.ts pure unit test patterns — tier factories, staleness guards, M-I/M-J regression tests, exhaustiveness guard
metadata:
  type: project
---

New pure unit test file `client/src/pages/ReportWizardPage/wizardReducer.test.ts` (57 tests, 100% coverage on wizardReducer.ts).

**Why:** Story #1947 extracted inline reducer logic from ReportWizardPage into a pure module; QA owns the unit tests.

**Key patterns used:**

- `makeState(overrides?)` helper spreads `createInitialWizardState(null)` — keeps tests minimal and focused.
- Staleness guards tested with `toBe(state)` (same object reference) — proves the reducer short-circuits, not just "returns equivalent state".
- M-I regression (SELECT_SOURCE must NOT clear `aiError`): tested with a comment that the guard must fail if someone adds `aiError: ''` to that case.
- M-J regression (REPORT_REFRESHED no-op when report=null): `toBe(state)` reference check.
- Exhaustiveness guard (line 282, `action satisfies never`): cast to `any` to hit default branch.
- `nextRequestId` exported function: test that two consecutive calls produce strings where the second is +1 of the first (counter monotonically increases).

**How to apply:** For future pure reducer modules: use the same `makeState()` pattern, test staleness guards with `toBe`, test exhaustiveness with `any` cast.
