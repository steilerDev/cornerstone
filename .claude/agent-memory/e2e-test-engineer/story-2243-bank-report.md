---
name: story-2243-bank-report
description: Bank report (Draw-down request) restructure E2E (#2243) - landing rule, new POM/fixtures, aria-disabled and paging-sentinel traps, revert flows
metadata:
  type: project
---

- New specs: `reportWizardPresets.spec.ts` (A1-A7), `reportWizardSubmission.spec.ts` (B1-B6); fixtures `reportWizardMocks.ts` (mock `GET /api/budget-sources` + `/api/source-reports?`), `reportSeed.ts` (`seedReadyLoan`, `markSubmitted` returns the batchId, `invoiceStatus`).
- Landing rule (`resolveReportPreset`): type + known source -> step 3; unknown source -> step 2 + FormError; type alone -> step 3 only with exactly ONE non-closed bank_loan/credit_line. The shared DB holds other loans, so type-only scenarios MUST mock budget sources. `?sourceId=` without `type` still starts at step 1.
- Presets do not focus a step heading: use `expectOnStep(n, heading)` (aria-current + stepCompleted), `waitForStepSettled` only after button navigation.
- Next on step 3 and Mark at zero are `aria-disabled`, not disabled: `toBeDisabled()` passes, but `click()` waits forever for "enabled" - use `click({ force: true })`.
- Paging: a plain click on "Show more invoices" scrolls the sentinel into the 600px lookahead and races the auto-load; the POM dispatches the click event instead, and the spec shortens the viewport to 700px so the first batch is exactly 25.
- Mark dialog is a ConfirmDialog (`alertdialog`, testIds `report-mark-confirm/-cancel`); nothing-claimable and 409 show inside it and hide the action. Revert dialog prefix `revert-submission`; button `revert-submission-<batchId>`; Cancel returns focus to the opener.
- N8 link is read from `GET /api/attention` (row key `N8:budget_source:<id>`) instead of through Home, which avoids Home's setup-checklist / preference state.
- "No sender set" needs a blank sender = blank display name AND empty House address; the spec mocks `/api/auth/me` with displayName ' ' (real payload spread) and `/api/settings`.
- Not run live (sandbox); validated with tsc, eslint, prettier, `playwright --list`.
