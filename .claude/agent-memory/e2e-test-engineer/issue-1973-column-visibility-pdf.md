---
name: issue-1973-column-visibility-pdf
description: Issue #1973 E2E coverage — column-visibility toggles wired through to the generated PDF, superseding #1966's DOM-only coverage. New POM locators, 6 rewritten/added scenarios, viewport-scope reasoning.
metadata:
  type: project
---

## What changed in production (frontend-developer, this issue)

`hiddenColumns` moved from `ReportContentEditor` local `useState` into `ReportWizardPage`'s
wizard-reducer `ContentTier` (`wizardReducer.ts`), threaded through to
`generatePdfFromContent`/`overviewPdf.ts`. Single source of truth for the base column set per use
case and the locked column lives in `client/src/lib/reportContent/columns.ts`
(`isColumnLocked`/`visibleReportColumns`/`REQUIRED_REPORT_COLUMN = 'allocatedAmount'`), consumed
by both the editor UI and the PDF geometry engine (AC 2.1).

Key reducer facts (`client/src/pages/ReportWizardPage/wizardReducer.ts`):
- `SELECT_USE_CASE` spreads `freshContentTier()` → `hiddenColumns` resets to `new Set()` on every
  use-case change (AC 5.1). This is the SAME mechanism that already clears `overrides`/`aiContent`.
- `DISCARD_EDITS` explicitly PRESERVES `hiddenColumns` (`hiddenColumns: state.hiddenColumns`
  overridden back in after the `freshContentTier()` spread) — column visibility is a presentation
  choice, not a "content edit" that the discard-confirm modal guards.
- `hiddenColumns` is never persisted (no preference endpoint involved at all) — AC 5.2/5.3 fall
  out for free: a full page reload wipes the in-memory reducer state entirely, same as every other
  wizard-run-scoped field.
- `SET_ATTACH_DOCUMENTS` only touches `SettingsTier` — going back to Settings and toggling
  attachDocuments does NOT reset `hiddenColumns`, so a single seeded fixture can walk through all
  4 combinations of the AC 6.2 warning-banner matrix without re-navigating from scratch.

Both the desktop `<table>` and the mobile `.mobileCardList` gate on the exact same `show(col)`
derivation in `ReportContentEditor.tsx` — confirmed by grep, no `@media` rule anywhere touches
`.columnToggles`/`.columnToggleGroup`. The ux-designer's finding that the toggle group itself has
**no responsive hiding** is correct and verified independently here.

## E2E work done

Rewrote the pre-existing "Scenario 24, #1966" describe block in
`e2e/tests/budget/reportWizardEditableContent.spec.ts` (renamed **Scenario 28** — the file already
had an unrelated, unrenumbered "Scenario 24" collision for the signature-reset test at the OLD
line ~2236; both used the literal string "Scenario 24" and I did not touch the signature one) and
added 5 new scenarios (29-33), picking fresh numbers past the file's existing max (27, the
lang-attribute scenarios) rather than reusing/renumbering anything else in the file.

- **Scenario 28** (desktop only, by documented exclusion): DOM-level baseline carried forward
  verbatim per the spec's explicit instruction — checkbox presence/count, `<th>`+`<td>` removal
  via `getByRole('columnheader'/'cell')` (requires real table semantics, absent from the mobile
  card list), no-PATCH assertion (AC 7.1, AC 5.2).
- **Scenario 29** (desktop only — download mechanism isn't viewport-dependent): THE scenario that
  closes the #1966 gap (AC 1.2/7.2). Size-diff, not byte-parsing: seed Usage with ~40 sentences of
  real text, download baseline (all columns), hide Usage, download again, assert
  `hiddenSize < baselineSize`. Deliberately NOT a bare `>1000 bytes` check (that's Scenario 8's
  weaker shape, which would pass identically whether or not the toggle reached generation) — a
  code comment at the assertion says so explicitly per the spec's instruction, to survive a future
  "simplify this" pass.
- **Scenario 30** (`@responsive`, all 3 viewports): AC 2.2 locked checkbox — `toBeDisabled()`,
  non-empty resolvable `aria-describedby` target, and `uncheck({force: true})` (bypasses
  Playwright's actionability check, which would otherwise refuse to interact with a disabled
  element outright) still leaves it checked afterward — a genuine behavioral proof, not a
  restatement of `toBeDisabled()`.
- **Scenario 31** (`@responsive`, all 3 viewports): AC 6.2 warning banner, all 4 combinations of
  (Usage hidden/visible) × (attachDocuments on/off) in ONE test/ONE fixture, using the
  `SET_ATTACH_DOCUMENTS`-doesn't-reset-`hiddenColumns` fact above to avoid re-seeding.
- **Scenario 32** (`@responsive`, all 3 viewports): AC 5.1 use-case reset — hide a column on
  `claim` (6 checkboxes), walk back to step 1 via 4× `goBack()` (viewport-independent — see
  below), switch to `budget-overview`, walk forward, assert 7 checkboxes ALL checked (not just
  "no longer hidden" — proves the new use case's own base-set SIZE, not just a stale 6).
- **Scenario 33** (`@responsive`, all 3 viewports): AC 5.3 reload reset — reach step 5 via the
  `?sourceId=` deep-link pattern (`wizard.goto(sourceId)`, mirroring `reportWizard.spec.ts`
  Scenario 7), hide a column, `page.reload()` (URL still carries the query param), re-walk the
  deep-link flow, assert the full 6-checkbox base set restored.

## Viewport-scope decision (AC 7.3)

Scenario 28 stays desktop-only WITH a documented reason (ARIA table-role dependency) — this is the
one exclusion AC 7.3 explicitly allows ("a code comment states which are excluded and why").
Scenarios 30-33 (checkbox-state assertions that don't depend on table semantics at all — the
toggle group renders identically at every viewport) run at all 3 configured viewports via
`{ tag: '@responsive' }`, with NO per-viewport branching needed in the assertion bodies (verified
via `--list`: 53 tests total in the file across [desktop]/[tablet]/[mobile], vs. 34 before this
issue). Scenario 29 (PDF download) stays desktop-only — the download mechanism itself isn't
viewport-dependent, only the DOM-interaction scenarios are; this matches the E2E spec's explicit
carve-out.

## POM additions (`e2e/pages/ReportWizardPage.ts`)

- `columnToggleGroup` = `page.getByRole('group', { name: 'Show/hide columns' })` — was previously
  inlined at every call site in the old #1966 test; factored out since it's now reused across 6
  scenarios.
- `usageHiddenAttachmentsWarning` = `page.locator('[class*="bannerWarning"]')` — scoped by
  CSS-module class (verified via grep: `bannerWarning` is used by exactly ONE component in the
  whole client tree, `ReportContentEditor.tsx`), not by text, so it's stable against copy edits
  and unambiguous against the page's other `role="status"` regions (`Toast`, several
  `srOnly`/loading indicators — confirmed via grep there are ~15 other `role="status"` elements
  across the app, several of which could plausibly be present on this same page).

## Reusable navigation fact confirmed this session

`goBack()` (`page.locator('[class*="buttonRow"] [class*="btnSecondary"]').first()`, re-queried
lazily at each `.click()`) is safe to call repeatedly to walk backward through MULTIPLE steps
(verified: only one `buttonRow` is ever mounted at a time across all 5 wizard steps) — 4 calls
walk step 5 → step 1. This is viewport-independent, unlike `goToStep()` which clicks the
desktop-only stepper widget (CSS-hidden below 768px) and would fail at the `mobile` project.
Prefer `goBack()` over `goToStep()` for any `@responsive`-tagged test that needs to navigate
backward.

## Prior-CI triage performed for this session (see also `known-flakes-and-regressions.md`)

Checked recent beta-merged PRs' full E2E results (`gh pr view <n> --json statusCheckRollup`,
since `gh run list --branch beta --workflow "Quality Gates"` only surfaces promotion-PR runs, not
individual story/bugfix PRs — those run as `pull_request` checks on the PR's own head branch, not
a push to `beta`). Found ONE red shard in the last ~15 merges: PR #2007 ("refactor(reports):
remove TFunction from reportPdf/*", merged 2026-08-05), shard 10/16, both attempt+retry failed on
`invoices/invoice-vendor-change.spec.ts:129` [tablet] "Changing the vendor and saving updates the
detail page and vendor list" with `TimeoutError: locator.waitFor: Timeout 10000ms exceeded`.
Confirmed via `gh pr view 2007 --json files` that PR #2007's diff touches ONLY
`reportContent`/`reportPdf`/`ReportWizardPage.tsx` files — nothing under `invoices/` or
`vendors/` — so this is unrelated to that PR's own change and NOT caused by #1973's work either
(different domain entirely). Not yet triaged to root cause (single occurrence so far, not
established as a recurring flake) — flagging here for whoever next touches
`invoice-vendor-change.spec.ts` or investigates a shard-10 tablet failure. Did not attempt a fix
(out of scope for #1973, and a single occurrence isn't enough evidence to diagnose confidently).
