---
name: story-2258-vocabulary-german-tests
description: Story #2258 vocabulary + term-hint tests: disk-walk guard recipe, jest --changedSince for ripple, popover/tooltip test quirks, glossary gap
metadata:
  type: project
---

Story #2258 (P6.1a) added guard tests (`bannedSynonyms.test.ts`, `germanLabels.test.ts`, `termHints.test.ts`, `detectLocale.test.ts`) and TermHint/TermHintPopover tests.

- **Ripple finding**: a vocabulary pass rewrites en/de JSON, so ~370 test files are "related". `node --experimental-vm-modules node_modules/.bin/jest --changedSince=HEAD --maxWorkers=3 > file` finds the stale expectations in one run; a bare `client/src/pages` run (455 files) is too slow. Run it in the background with a Monitor, never `pkill -f jest` (it kills the tool shell).
- **Guard recipe**: strip glossary canon forms (longest first, `\p{L}` boundaries) before matching doNotUse words, so "Funding sources" stays legal; context-only bans (Net, Open, Overdue, Overview) are asserted as an exact list.
- **Glossary gap**: German "Unteraufgabe" is a retired label but glossary only lists "Teilaufgabe" as formerly; the guard keeps it in a `NOT_IN_GLOSSARY` exemption of the "documented" check.
- **Report-type ids** are `budget-overview | claim | proof-of-funds` (draw-down request is `claim`).
- **Popover/tooltip tests**: TermHint tooltip text is always in the DOM (`role=tooltip`, class `visible` toggles); `TermHintPopover` is an `AnchoredPanel` dialog named "What these terms mean", button label `Explain “<term>”` (curly quotes) or "Explain these terms".
- A component given `t` as a prop (ReportInvoiceList, Step1UseCase) gets key-echo labels in tests, but TermHint/Popover use the real i18n, so match label spans by key text and hint text by the real English definition.
- Adding a `unionKeys` set means bumping the count (82) and declaration-order list in `unionKeys.test.ts`.
