---
name: pr-review-findings
description: Past PR design-review findings, verdicts, and recurring bug patterns worth checking on future reviews
metadata:
  type: project
---

## PR #792 — Budget Sources Bar Chart

- `color-mix()` in inline `style` prop bypasses the token system — allocate a named token instead
- Legend dot `8px` = `var(--spacing-2)` — always swap raw px dot sizes to nearest spacing token
- `--color-border-strong` as text `color` for a separator — use `--color-text-muted` instead

## PR #1490 — Measurement & Freehand Tools (APPROVED/comment)

See `pr-1490-measurement-freehand.md`. Medium: `labelAttrs { display:'none' }` dead code in render.ts — refinement item.

## PR #1681 — Paperless Invoice Picker (CHANGES_REQUIRED)

- `--color-danger-text` misuse — see [token-reference.md](token-reference.md)
- RECURRING BUG: when a page is refactored from a source page, CSS class migration is often incomplete — always grep all `styles.*` references in TSX against defined classes in the module to catch missing definitions
- z-index stacking collision with sibling overlay (e.g. unlink button from #1680) — see [token-reference.md](token-reference.md)

## PR #1844 — i18n/a11y sweep, 69 hardcoded strings → t() (CHANGES_REQUESTED → fixed in aeeaffb4 → APPROVED, both posted via `--comment`)

Follow-up commit aeeaffb4 fixed all 4 broken keys by reusing existing keys rather than inventing new ones: TimelinePage → `timeline.toolbar.zoomOutTitle`/`zoomInTitle`, BudgetSourcesPage → `sources.form.placeholders.terms`/`notes` + `sources.form.terms`, VendorDetailPage → `vendorDetail.invoices` (dropped the invented `invoicesAriaLabel`, reused the plain label instead). Verified all three resolve with exact original-string preservation in en+de. Re-ran the resolution-check script scoped to the branch's own new `t()` calls — 0 unresolved (2 flags were pre-existing/false-positive: conditional `useTranslation()` namespace not caught by regex, and one bug already broken on `beta` before #1812 touched the file).

Large i18n sweep converting hardcoded aria-label/placeholder/title strings to `t()` across ~27 components. Found 4 genuinely broken translation keys that render as literal key strings in the UI (i18next default: no `parseMissingKeyHandler`/`returnNull` in `client/src/i18n/index.ts`, so missing key → key path shown verbatim to users):

- `TimelinePage.tsx` called `t('toolbar.zoomOut')`/`t('toolbar.zoomIn')` but the JSON key actually added was `timeline.toolbar.zoomOutTitle`/`zoomInTitle` (namespace `schedule`) — wrong path AND wrong leaf name.
- `BudgetSourcesPage.tsx` called `t('budgetSources.termsPlaceholder')` etc. — `budgetSources` was never added as a top-level key anywhere in `budget.json` (should've been under existing `sources` key).
- `VendorDetailPage.tsx` called `t('vendorDetail.invoicesAriaLabel')` — only `vendorDetail.invoices` (plain label, no aria variant) exists.

**Recurring check to always run on i18n-conversion PRs**: for every changed `.tsx` file, resolve its `useTranslation(ns)` namespace(s), then script-verify every `t('key.path')` call resolves in `en/{ns}.json` (accounting for i18next `_one`/`_other` plural suffixes as false positives). A key that doesn't resolve renders as the literal key string — this is a functional/visual regression, not just a translation nit, and is easy to miss by eyeballing diffs alone since the diff itself looks plausible (translated title/placeholder swapped 1:1). None of these were caught by tests — no test asserted the actual rendered string.

Also found (non-blocking): `SubsidyProgramsPage.tsx` delete-confirm modal collapsed `<strong>{name}</strong>` embedded in JSX into a flat `t(key, {name})` interpolation — loses bold emphasis around the interpolated value. Recurring pattern to watch for: JSX with embedded `<strong>`/`<em>` around an interpolated variable can't be flattened into a plain `t()` call without losing that formatting — needs `<Trans>` or the JSX split preserved.

Process note: `--request-changes` blocked (own PR) as usual — posted `--comment` with clear "CHANGES_REQUESTED" verdict text in the body instead; that succeeded fine via `gh pr review --comment --body-file`.

## PR #1834 — Backup Scheduler Status (APPROVED)

Reviewed against the issue #1804 spec (see [feature-spec-history.md](feature-spec-history.md)). Near-perfect spec conformance: all tokens verified present in tokens.css, dark mode routes through existing semantic tokens, mobile override matches spec verbatim, Badge/Skeleton/bannerError reused correctly, i18n keys present in both locales.

- Only finding: informational nit on `<p>` hint as a direct child of `<dl>` (HTML content-model violation) — traced back to my own spec's JSX, not an implementation deviation; non-blocking.

## PR #1845 — Locale-aware display formatters (formatDate/formatPercent/formatFileSize/formatHours/formatWeekday\*/formatDateTimeWithZone) (APPROVED via gh api comment, own PR)

Consolidated ~10 previously hardcoded-`'en-US'` or ad-hoc `toFixed()`/manual-string call sites in `client/src/lib/formatters.ts` behind app-locale-aware formatters (Gantt tooltips/header, calendar aria-labels, document dates, diary work-duration hours, signature timestamps, file sizes, percents). Script-verified de-DE `Intl` output for every new formatter against the PR's own test assertions (all matched) rather than eyeballing — see [pr-review-findings.md](pr-review-findings.md) process notes and the #1844 lesson below.

Findings, both informational/non-blocking:

- `formatPercent`'s `Intl.NumberFormat` grouping means English output for values ≥1000 gained a thousands separator (`"1,500%"` vs old `"1500%"`) that the PR's disclosed "byte-identical except two cases" claim didn't call out — a 3rd, undisclosed English-output edge case. Only affects an sr-only announcement, only at ≥10x-over-budget values. General lesson recorded in MEMORY.md: always check `toFixed()`→`Intl.NumberFormat()` swaps for grouping-separator diffs at large values, not just decimal-separator correctness.
- `formatDateForAria` (pre-existing pattern, not introduced by this PR but newly localized here) keeps English sentence order in German output ("Dienstag, Februar 24, 2026" instead of "Dienstag, 24. Februar 2026") — accepted deferred grammar gap per task brief.

Verified mechanism of the disclosed "document dates fixed off-by-one-day UTC bug": old code did `new Date(isoString).toLocaleDateString('en-US')` (parses as UTC instant, converts to browser-local zone — can roll the calendar day for non-UTC users); new `formatDate` slices `YYYY-MM-DD` and builds a local-midnight `Date` directly, avoiding the UTC→local conversion. Real fix, not a regression.

Confirmed `gh pr review --approve` (not just `--request-changes`) also fails with "Can not approve your own pull request" on own PRs — same workaround as request-changes: `gh api repos/.../issues/{N}/comments`.

## PR #1847 — Stylelint enforcement + ~20 new tokens 1:1 extraction (Issue #1815) (APPROVED via gh api comment, own PR)

Full remediation of 370 latent stylelint violations, plus wiring `stylelint` into `npm run lint`/`lint:fix` and a new CI `Stylelint` step (`static-analysis` job). Also fixed `.stylelintrc.json`'s `tokens.css` override (missing `color-function-alias-notation: null`, was causing 116 of the 370 violations). Verified every claim in the PR description by direct diff inspection rather than trusting the summary:

- **`declaration-property-value-disallowed-list`** in `.stylelintrc.json` bans raw integer `z-index` and `font-weight` values via regex `/^\d+$/` — this is *why* `--z-raised: 1` and the `--z-local` escape hatch exist. Useful to know before flagging a future PR for "why didn't they just use `z-index: 1`" — it's lint-enforced, not stylistic preference.
- **New `--z-local` pattern** (first use in `PhotoMetadataSidepanel.module.css`): `--z-local: <value>;` declared immediately before `z-index: var(--z-local);` inside the same selector. Sanctioned escape hatch for component-internal arbitrary z-index offsets that don't belong in the shared global z-scale (`--z-dropdown`/`--z-overlay`/`--z-sidebar`/`--z-modal`) and aren't reused elsewhere. Recommended this get written into the Style Guide as the standard pattern for any future stylelint-blocked one-off literal.
- **`--z-raised: 1`** fills the gap below `--z-dropdown: 10` for "lift element above local siblings" — swapped in 1:1 for every existing `z-index: 1` (and `calc(var(--z-raised) + 1)` for what was `z-index: 2`) across `CostBreakdownTable`, `GanttSidebar`, `DashboardPage`, `WorkItemDetailPage`, `BudgetOverviewPage`, `TimelinePage`, `calendar/CalendarView`.
- **`--color-photo-*` family** (9 tokens: overlay-caption, control-bg/-hover, bar-bg, border, focus-ring, active-bg, action-primary-bg, action-danger-bg): deliberately theme-invariant (no dark override) — consumed by `PhotoViewer`, `PhotoCard`, `PhotoAnnotator`, all always-dark lightbox/editor chrome. This resolves two items I'd previously flagged as acceptable-but-not-ideal in [photo-annotator-patterns.md](photo-annotator-patterns.md): the dark-surface rgba hardcodes are now real tokens, and `PhotoAnnotator`'s `z-index: 1000` is now `var(--z-modal)`.
- **`--color-tooltip-*` family** (7 tokens: subdued, bullet, separator, status-not-started/in-progress/completed/late-bg): extracted from what used to be *component-scoped* custom properties re-declared inline in `GanttTooltip.module.css` under `.tooltip` and `[data-theme='dark'] .tooltip`. Only flag from this review: the tokens.css section comment says "GANTT TOOLTIP TOKENS" and sits in the Gantt-prefixed region, but the token names themselves are generic `--color-tooltip-*` (not `--color-gantt-tooltip-*`) — inconsistent with the rest of that section's `--color-gantt-` prefix convention, though defensible since a separate shared `Tooltip` component uses the same `--color-bg-inverse` surface pattern and could reuse these later. Low severity, non-blocking, flagged as a wiki/comment cleanup follow-up.
- **`--color-warning-badge-bg`** matches the existing `--color-{semantic}-badge-bg`/`-badge-text`/`-badge-bg-alt` scheme (`success`, `primary` already had entries) — good precedent, no `-badge-text` companion needed since consumer uses `var(--color-warning)` directly.
- **`--shadow-text-overlay`** — clean 1:1 extraction from `LinkedDocumentCard`'s inline text-shadow-over-thumbnail exception comment, preserved verbatim.
- **Visual-parity math verified, not assumed**: `InvoicePipelineCard .itemOverdue` swapped `rgba(251,146,60,0.08)` for solid `--color-warning-bg` (`#fff7ed`) — flattened the old rgba over white by hand (≈`rgb(255,246,239)` vs `rgb(255,247,237)`), confirms imperceptible difference, not a silent regression.
- **Real bug fix confirmed independently**: `InvoiceBudgetLinesSection.module.css` had `@extend .td;` (Sass syntax) in a project with zero Sass/postcss-extend tooling (confirmed no `postcss.config.*` extend plugin, no other `@extend` usage anywhere in repo) — was silently inert, so `tdDescription`/`tdCategory`/`tdPlanned`/`tdItemized`/`tdActions` never got `.td`'s padding. Fix replaces with the literal `padding: var(--spacing-3)`, matching `.td` exactly.
- **Legacy-duplicate-class dedup pattern** (also seen in PR #1846's i18n key dedup): `HouseholdItemDetailPage.module.css` and `CostBreakdownTable.module.css` each had select classes (`.modalContent`/`.modalTitle`/`.modalActions`/`.section`/`.sectionTitle`/`.propertyGrid`/`.property`/`.propertyLabel`; `.rowSourceDetail .colName`/`.nameIndented`) defined **twice** — an untokenized legacy block followed later by a fully-tokenized one. CSS last-wins means only the second block ever rendered; deleting the first is dead-code removal with zero visual change. **Recurring verification method**: grep `^\.classname {` counts in old vs. new file, confirm survivor is the tokenized one, confirm TSX references still resolve.
- **`print.css`** correctly uses Layer-1 palette tokens (`--color-black`, `--color-gray-700/300`) directly instead of Layer-2 semantic tokens — this is the right call since print output is intentionally theme-invariant (always black-on-white paper), a legitimate exception to the usual "never use Layer 1 in `.module.css`" rule. Also modernized deprecated `page-break-*`/`clip: rect()` to `break-*`/`clip-path: inset(50%)`.

Verification method worth reusing: `awk '/^\+/ && !/^\+\+\+/' <diff> | grep -Ei '#[0-9a-fA-F]{3,6}|rgba?\('` and equivalent greps for `z-index:\s*[0-9]`/`font-weight:\s*[0-9]` against the full diff (excluding `tokens.css`) — fast way to confirm zero hardcoded-value regressions slipped past stylelint across a large multi-file remediation PR, rather than spot-checking a handful of files.

## Process notes

- Cannot `--request-changes` on your own PRs — use `--comment` instead, and note this in the review body
- `gh pr review --comment` via `--body-file` can fail silently — use `gh api repos/.../issues/{N}/comments` instead (the issues API works for PR comments too)
- When posting long GitHub comments with special chars (backticks, CSS `var()` calls), write to `/tmp/spec.md` (or similar) and use `--body-file`

## PR #1846 — i18n parity guard + usePhotos error translation (APPROVED via gh api comment, own PR)

Small surface: usePhotos hook errors now translated (2 new photoViewer keys `networkError`/`unexpectedError`, en+de), 5 orphaned photoAnnotator keys + dead CSS (`.resetButton`/`.modalActions`/`.confirmButton`) removed, 5 shadowed literal-duplicate JSON keys removed (diary/householdItems/schedule, both locales), new `i18n.parity.test.ts` guard (en/de key parity + raw-text duplicate-key scanner across all namespace files).

Script-verify method for duplicate-key removals: parse the pre-PR JSON with Python's `json.loads(..., object_pairs_hook=...)` tracking repeated keys per object scope — reproduces exactly what `JSON.parse`/last-wins resolves to (same semantics as the browser/webpack JSON loader). Then grep the consuming `.tsx` for the actual `t('ns:path...')` calls to confirm which of the two (shadowed vs. surviving) values was ever rendered. Found: in `schedule.json`, `milestones.detail` had two `edit` keys and two `view` keys as *direct siblings* (not nested — watch for this, easy to misread indentation and think one is nested inside the other); `MilestoneDetailPage.tsx` only ever consumes the surviving (last) `view` block's fields, the first (removed) `view` block's `linkedItems`/`workItem`/etc. were separately duplicated as sibling top-level `detail.*` keys the component actually uses — so the whole first `view` object was double-dead (both a duplicate AND functionally redundant with existing live keys).

Bonus finding (informational, not blocking, not caused by this PR): even after dedup, `schedule.json`'s surviving `detail.edit` object (`title`/`form.*`) and `diary.json`'s `create.title`/`edit.title` keys are themselves entirely unreferenced by any `t()` call — real page headings/field labels live under separate `createPage.*`/`editPage.*`/`entryForm.*`/`detail.view.*` keys. Orphan-key sweeps that target only *literal duplicates* (this PR) or only *known-dead feature keys* (the 5 photoAnnotator keys) can still leave a residue of never-referenced-at-all keys behind — worth a follow-up sweep that cross-references every namespace key against `grep -rn "t('<ns-prefix>"` call sites, not just against duplicate-key detection.

For dead-CSS verification: CSS Modules are locally scoped, so a repo-wide grep for a removed class name (e.g. `modalActions`) will hit dozens of *unrelated* components' own same-named local classes — always narrow the grep to the specific component file that imports the CSS module being edited, not the whole repo.
