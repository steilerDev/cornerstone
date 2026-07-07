# Bug #1807 — stale mock drift from a transitively-added hook usage

**What happened**: BudgetLineForm gained an unconditional `getCurrencySymbol` (from
`useFormatters()`) and `vatRate` (from `useLocale()`) dependency. Test files that render
BudgetLineForm _directly_ (BudgetLineForm.test.tsx, AutoItemizeLineCard.inlineDraft.test.tsx,
etc.) had their `jest.unstable_mockModule` mocks updated to match. But
`AutoItemizePage.test.tsx` and `AutoItemizePage.queueSave.test.tsx` render BudgetLineForm only
_transitively_ — AutoItemizePage -> AutoItemizeLineList -> AutoItemizeLineCard -> (inline-draft
state) -> BudgetLineForm — and were missed. Their `useFormatters()`/`useLocale()` mocks (defined
locally per-file via `jest.unstable_mockModule`, not shared) still lacked the new fields, so
`getCurrencySymbol is not a function` fired at BudgetLineForm.tsx:217 whenever the inline-draft
path rendered. A prior QA pass reported "703/0" without having actually re-run these two files
after the BudgetLineForm change — the miss reached dev-team-lead review.

**Root lesson — grep for the component tag is not enough**: `grep -rl "<BudgetLineForm"` (or any
direct-usage grep) only finds _direct_ renderers. It cannot find call sites reached through
several layers of component composition (List -> Card -> conditional-state -> Form). When a
shared component gains a new _unconditionally-required_ hook call, the correct sweep is:
`grep -rl "mockModule('.*<hookOwningModule>\.js'"` across the whole client tree (i.e., every file
that mocks the module the hook lives in), then actually **run** each candidate file — not just
inspect it — because the only reliable signal is the runtime TypeError. There is no static way to
know which mocked-module consumers transitively render the changed component.

**Don't report suite counts you haven't re-run.** "703/0" is only trustworthy if every counted
file was executed in _this_ session against the _current_ source tree. If a prior report's number
is being carried forward without a fresh run, say so explicitly rather than restating it as
current fact — a stale pass count reads as a false all-clear to dev-team-lead/orchestrator.

**Fix pattern** (mirrors BudgetLineForm.test.tsx / AutoItemizeLineCard.inlineDraft.test.tsx):
add to the local `useFormatters()` mock: `getCurrencySymbol: () => '€'`; add to the local
`useLocale()` mock: `vatRate: 0.19` (plus `resolvedLocale`, `currency`, `syncWithServer: jest.fn()`
for shape fidelity, matching the real `LocaleContextValue` shape).

**Verified clean sweep for this specific incident** (2026-07-07, ~41 files matching
`mockModule('.*formatters\.js'` across `client/src`, excluding the 2 fixed + 11 already verified
by dev-team-lead): all passed, 1128 tests, 0 failures — no further BudgetLineForm-mock gaps found.
Full candidate list and counts are not worth re-recording here; if formatters.js/LocaleContext
gains another required field again, re-run the same grep and execute every match.
