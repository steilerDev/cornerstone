---
name: vocabulary-pass-specs
description: Hazards when speccing a locale-wide vocabulary sweep or in-place term hints (EPIC-21 P6.1a) — banned-word scan design, money-label rises from rewordings and markup, nested-hint and aria-labelledby leaks
metadata:
  type: feedback
---

A banned-synonym sweep over `client/src/i18n/{en,de}` needs a scan that strips canon forms first. Otherwise "Funding sources", "Remaining on offer", "Checklist item" and "Project setup" count as hits for "Sources", "Remaining", "item" and "Project". The scan must also be plural-aware: en `s|es`, de `e|en|n|s|es|ern`. The first #2258 scan missed every "Line items" and "Vendors" until I added plural suffixes. Banned words that are themselves canon forms (Open, Overview, Overdue, Net) are context-only and cannot be machine-checked. List them explicitly in the test, so a new collision fails loudly.

**Why:** in #2258 the naive regex reported about 300 hits. With stripping and plurals the real worklist was about 190 keys, including about 44 bare "item" uses in generic DataTable/SearchPicker defaults.

**How to apply:**

- Before writing reworded `en` values, run them through `normalizeLabel` + `MONEY_WORDS` (import from `plan/restructure/scripts/build-baseline.mjs`, compare with `baseline.json` and `glossaryLabels()`). "New funding source" and "Cost breakdown" would have been rises. A scratch script that parses the spec's key→value table catches these before handback.
- Do not put `<tag>` markup (Trans) in short locale strings: `"<term>Over-allocated</term> by {{amount}}"` normalises to a 2-word money label, which is a rise. Use a separate ⓘ control instead.
- An in-place hint (Tooltip) inside an element that `aria-labelledby` points at leaks the definition into the accessible name: opacity-hidden text still counts. Hand the label id to the term span (SummaryStrip), or put an ⓘ beside headings.
- Hint hosts are often links (StatTile with `to`), buttons (ObjectList sort headers) or `<label>`s. Spec "never nested" and give the fallback (ⓘ after it, or a `title` on buttons).
- A new shared component goes in as a helper file inside an existing counted folder (`components/Tooltip/TermHint.tsx`). A new `X/X.tsx` is a sharedComponents rise.
- Dead keys carrying banned words (whole `budget.vendors` group) are cheaper to delete than to translate. Spec them as "prove unused, then delete", and check template prefixes and `I18N_UNION_KEYS`.
- A glossary proposal that adds a term with a `formerly` entry also needs an entry in `TERMS_WITHOUT_DESTINATION` (`client/src/navigation/searchDestinations.ts`) or a search destination. Otherwise `searchDestinations.extras.test.ts` (former-name coverage guard) fails. Put that file in the frontend spec whenever G-proposals add terms. #2258 missed it for "Budget overview".
- QA's `tsc --noEmit -p client/tsconfig.json` is the only local check that catches a missing `import type` in a types-only file. Jest erases types. #2258 shipped `RelatedList/types.ts` without the `TermHintTerm` import.
- An inline control that stops event propagation to protect row/header handlers must stop only the keys it handles (Enter/Space). A blanket `onKeyDown={stopPropagation}` swallows every key before the document bubble listeners see it (`useKeyboardShortcuts`, `useGoToShortcuts`, `useFocusTrap` Escape). #2258's TermHint shipped this way, and the review sent it back. Spec the key list explicitly, and ask QA for a test that other keys still propagate.
- Review: `scan-privacy --profile full` over the whole code `git diff` always flags the synthetic `€` amounts in test assertions (money profile). The gate is PR/spec text plus `plan:check`'s privacy step; scan new files separately (they came back clean). `PhotosPage.test.tsx` "refresh after saving fails" flakes about 1 in 3 under load (rAF focus on an unmounting toggle, pre-existing, not caused by #2258).

Related: [[restructure-i18n-specs]], [[status-vocabulary-switch-specs]], [[ux-visual-spec-verification]]
