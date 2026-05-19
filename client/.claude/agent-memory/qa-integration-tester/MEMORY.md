# QA Integration Tester Memory

- [i18n mock interception (ESM)](feedback_i18n_mock.md) — `jest.unstable_mockModule('react-i18next')` does NOT intercept in this project's local ESM worktree setup; real EN translations are used in jsdom tests
- [Scoping radio queries in ToolPalette](feedback_radio_scoping.md) — always scope font-size radio queries with `within(getFontSizeGroup())` because "Medium" and "Large" appear in both stroke-width and font-size groups
- [CalloutTool defensive returns](feedback_callout_defensive.md) — lines 77 and 116 of CalloutTool.ts are genuinely unreachable (defensive guards when phase is in impossible state); 96.55% is the practical coverage ceiling
