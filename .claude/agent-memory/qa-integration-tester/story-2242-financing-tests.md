---
name: story-2242-financing-tests
description: Story #2242 Financing/funding source/grant tests - env recipe, dead-branch ceilings, mock ripples, patterns that worked
metadata:
  type: project
---

**Env (this sandbox)**: Node 22 by default. Prepend the scratchpad `node24/node_modules/.bin` to PATH and
set `NODE_OPTIONS="--experimental-vm-modules --max-old-space-size=6000"`. `. env.sh` does a `cd` to the repo root,
so a `cat > relative/path` after sourcing it writes at the root (found a stray test file there once): always use
repo-root-relative paths after sourcing.

**Coverage per whole file**: with `--collectCoverageFrom=<file>` and several test files. For branch gaps dump
`coverage-final.json` and print `branchMap` arms with 0 hits (loc line + arm) instead of reading the table.

**Dead branches cap some server files below 95% branches** (no test can reach them): `householdItemService.ts`
(`result?.count ?? 0` helpers, `metaRow?.x ?? 0` in filterMeta, vendor/user `?? null` after a set FK),
`services/shared/itemGrantChips.ts` (`result.get(id)?.push`), `EntityMultiPicker` (`?.focus()` after
getElementById). Report them as production simplification candidates, do not mock around them.

**Mock ripples hit this story**:

- A partial `unstable_mockModule` of `workItemsApi` / `subsidyProgramsApi` / `financingApi` breaks any file that imports
  `entityPickerKinds` or `grantForm` transitively (missing `listWorkItems`, `createSubsidyProgram`). Spread the actual
  module (`import * as actual`) or add the extra export.
- Page tests that render `GrantChips` need `formatPercent`/`formatCurrency` in a mocked `useFormatters`.
- The real `LocaleProvider` re-syncs the language after mount, which re-creates `t`; hooks whose `reload` depends on `t`
  then fetch twice. In page tests use a static `LocaleContext` mock (`useLocale` value) instead.

**Patterns that worked**: stateful `Host` wrapper for selection panels; stubbing `EntityMultiPicker` with buttons that call
`onChange` with `itemType/entityId` options; capturing `showUndoToast` args and calling `onUndo` directly;
`fireEvent(el, new KeyboardEvent(...))` for events pre-marked with `markEscapeHandled`; `queryByRole('alertdialog')`
for ConfirmDialog (it is not a `dialog`); ObjectHistorySection test id is `section-<testIdPrefix>`.

**Behaviour that looks like a bug but is intended**: an invoiced budget line counts at its invoice amount in
`money.allocated`, not at the planned estimate; the grant list sorts by name so "Grant Five" precedes "Grant Four";
PageBreadcrumbs hides Back when the origin is already a trail ancestor (Financing for the Bank report).
