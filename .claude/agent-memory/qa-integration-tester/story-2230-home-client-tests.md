---
name: story-2230-home-client-tests
description: Story #2230 Home client QA - shared fixtures/harnesses, jest invocation noise, defects pinned with it.failing, unreachable branches
metadata:
  type: project
---

- Fixtures: `client/src/test/attentionFixtures.ts` (`makeRow(rule)` per rule, `makeAttention`, `makeAgendaItem`, `makeWeek`, `makePulse`, `makeSetup`, `makeDiaryEntry`; T = 2026-03-10), `attentionHarness.tsx` (AttentionList providers + ToastList Undo), `homeRender.tsx` (`renderHome`). N10 fixture status must be a real household status (`purchased`), not `ordered`.
- Jest must run from the repo root (`npx jest client/src/...`), not from `client/` (babel config error). Filter the "importing JSON without an import attribute" noise with grep -v; `--silent` helps.
- Real-i18n text tests: `i18next.createInstance()` with `en/de common.json`, `getFixedT`; en `holdsUp.soon_one` is "1 starts", `_other` "2 start" (spec-intended grammar, easy to mis-assert).
- Both #2230 defects (catch-up focus, notice on prefs failure) were fixed; their tests are plain `it` now. Reaching StatusMenu's focusFallback getter needs a status with no transitions (e.g. 'mystery'); the Review-all focus getter's left arm needs `fireEvent.click` (no focus, opener = body).
- Defect tokens carried: D-01/D-02 in AttentionList tests, D-03 PulseSection, D-25 LatestSection empty state, D-05 already in BudgetBar.test.
- Unreachable: CatchUpDialog `closeRef.current?.focus()` null arm (Close is always mounted) - the only branch gap (92.9%).
