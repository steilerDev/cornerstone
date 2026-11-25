---
name: story-2258-term-hints
description: #2258 term hints and first-open language E2E: TermHintControl POM, opacity-based tooltip check, deviations from spec, static-only verification
metadata:
  type: project
---

- `TermHint` bubble is always in the DOM with `opacity:0/1` (role=tooltip): assert `toHaveCSS('opacity', ...)`, never `toBeVisible()` (passes at 0). Locate the bubble from the term via `parent::span/following-sibling::span[@role="tooltip"]` (`pages/components/TermHintControl.ts`).
- Popover = ⓘ button + AnchoredPanel `role=dialog` named "What these terms mean". Phone Schedule legend is a sheet: Escape #1 closes the panel, #2 the sheet.
- Invoices "Split" column is `defaultVisible:false` and not sortable; the sortable header with an ⓘ is Milestones "Waits for" (used for the does-not-sort check).
- `openAsLocaleUser` got an optional `contextOptions` arg; `fixtures/i18nValue.ts` has `i18nValue` + `projectContextOptions` (keeps phone viewport in hand-made contexts). Phone = width <= 767.
- Old UI strings changed by #2258 were updated across e2e (SSO button, auth-provider cells Password/Single sign-on, "Whole build", "Split with AI", Offer/Progress payment badges, Company labels). Re-scan method: collect removed en/de values from `git diff` of locale files and match against e2e string literals both ways (single words too).
- Verified statically only (`tsc`, eslint, `playwright --list`); no live run.
  **Why:** guards against re-deriving these traps. **How to apply:** before editing hint/legend/list-header tests.
