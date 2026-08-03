---
name: issue-1812-i18n-sweep-json-dup-keys
description: Issue #1812 i18n sweep found 3 CODE_BUGs (JSON duplicate top-level keys wiping translations, 2 wrong-key-path bugs incl. a full component crash) — always check for duplicate top-level JSON keys when a spec adds new keys to an existing i18n namespace file
metadata:
  type: project
---

## Bug pattern: duplicate top-level keys in i18n JSON files silently wipe existing translations

When a frontend-developer spec adds new keys under an existing top-level namespace (e.g.
`filterBar.*`, `page.*`, `detailPage.*` in `diary.json`) but the object is appended as a **second**
top-level key with the same name instead of being merged into the existing object, `JSON.parse`
silently keeps only the **last** occurrence — wiping every pre-existing key in that object. This is
NOT a JSON syntax error (parses fine), so it's invisible unless you specifically check for
duplicate top-level keys. Found in `client/src/i18n/en/diary.json` during Issue #1812: 3 duplicate
top-level keys (`filterBar`, `page`, `detailPage`) wiped ~25 keys (page.title, page.newEntryButton,
detailPage.backLink/edit/delete/deleteTitle/deleteMessage/sourceType._, filterBar.filterMode_,
filterBar.searchLabel/searchPlaceholder, filterBar.draftsChipGroupLabel, etc.) — broke DiaryPage
heading/button, DiaryEntryDetailPage back/edit/delete/photos, DiaryFilterBar filter labels entirely.
17 tests failed across DiaryPage.test.tsx/DiaryEntryDetailPage.test.tsx/DiaryFilterBar.test.tsx as a
result — all traced to this one root cause via `python3 -c "import json; json.load(...)"` diffing
against `git diff` new/old key sets.

**Detection recipe** (run before trusting a diff that adds new i18n JSON keys):

```bash
python3 -c "
import re
content = open('path/to/en/namespace.json').read()
keys = re.findall(r'^  \"([^\"]+)\":', content, re.MULTILINE)
from collections import Counter
dupes = {k:v for k,v in Counter(keys).items() if v > 1}
print(dupes or 'no duplicates')
"
```

Run this across every touched `en/*.json` file in a spec that adds new keys — takes seconds, would
have caught this before running a single test.

## Bug pattern: `t()` called without importing/declaring `useTranslation` — crashes the whole component

`GanttChart.tsx` had `aria-label={t('gantt.workItemBarsAriaLabel')}` added per spec, but the spec's
own instruction to add `import { useTranslation } from 'react-i18next'` and
`const { t } = useTranslation('schedule')` was never actually implemented — `git diff` showed
ONLY the one-line JSX change, no import/hook addition anywhere in the file. Result:
`ReferenceError: t is not defined`, which crashes the entire GanttChart component on every render
(43 test failures, all the same root cause). This is a **Blocker** — the whole Timeline page is
unusable. **Always grep the diff for whether `useTranslation` was actually added** when a spec
instructs adding a hook to a component that didn't have one before — don't assume the diff matches
the spec just because the `t()` call is there.

## Bug pattern: wrong key path (spec said X, code used Y)

Two instances in this issue: `SignatureSection.tsx:95` used `t('addSignature')` instead of the
spec's `t('signature.addSignature')` (raw key rendered, key existed one level up); and
`DiaryEntryDetailPage.tsx:181` used `t('page.backLinkAriaLabel')` instead of the spec's
`t('detailPage.backLinkAriaLabel')`. Both are simple typos that render the raw i18n key as visible
text/aria-label. Cheap to catch: any test assertion on visible/aria-label text will fail with the
raw dotted key string appearing literally in the DOM — an easy tell vs. other failure types.

## Test-file-only fix pattern: JSX structural change from spec (not a bug)

When a spec deliberately changes `<strong>{name}</strong>` (separate text node) to a single
interpolated `t('key', { name })` string (spec instruction explicit about this), the resulting
DOM has one text node instead of two. `getByText('Energy Rebate')` (old, targeting the isolated
`<strong>` node) fails with `TestingLibraryElementError` even though visible text is character-for
-character unchanged. Fix: assert on the **full sentence** text instead
(`getByText('Are you sure you want to delete the program "Energy Rebate"?')`). This is a
TEST_BUG (assertion referencing a now-removed literal DOM pattern), safe to fix per the QA mandate
of "fix assertions ONLY if they reference now-removed literal patterns; text unchanged" — confirmed
by diffing the JSON key value against the pre-existing hardcoded string first.

## Useful patterns for direct-component i18n testing

- `SubsidyLinkSection.test.tsx` (new, 100% coverage, 17 tests): wraps in real `LocaleProvider` +
  mocks only `configApi.js`/`preferencesApi.js` (network calls), following the exact pattern in
  `EditBudgetLineModal.test.tsx`. Needed because the component calls `useFormatters()` for
  currency formatting on the fixed-reduction-type branch.
- `CostBreakdownTable.tsx`'s `PerspectiveToggle` is a **separate top-level function component in
  the same file** with its own `useTranslation('budget')` call — its `radiogroup` aria-label
  (`"Cost perspective"`) is independent of the main table's `t`, and needs its own dedicated test
  since none of the existing Min/Avg/Max-label tests exercise the `radiogroup` role/name.
- `InvoiceLinkModal.tsx` had zero tests for 11 of its ~24 new/pre-existing translated strings
  (error branches, amount-indicator variants, invoice-fallback label, success toast, click-outside
  dropdown close) despite passing tests — went from 81.98% to 96.39% statement coverage by adding
  16 new tests targeting specific uncovered branches (see git history on
  `client/src/components/budget/InvoiceLinkModal.test.tsx`). The `errors.selectInvoice` branch
  (line 150-151) is dead-in-practice: the UI auto-selects the first invoice on load and there's no
  way to deselect via the UI, so `!selectedInvoiceId` can never be true when the form is
  submittable — left uncovered deliberately, same category as the FST\_\* TOCTOU branch noted in
  [[issue-1811-fastify-error-code-mapping]].
