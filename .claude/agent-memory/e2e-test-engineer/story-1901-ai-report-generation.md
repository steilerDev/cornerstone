---
name: story-1901-ai-report-generation
description: Bank Report Wizard AI-generated usage descriptions/cover letter (Story #1901) — new spec file, POM additions, mocking pattern for GenerateReportContent.
metadata:
  type: project
---

Story #1901 adds an opt-in "Enable AI assistance" toggle (Step 4 Settings, `#enableAiAssistance`,
only rendered in the DOM at all when `GET /api/config`'s `llmEnabled` is true) and a "Generate
with AI" button (Step 5) to the Bank Report Wizard. One batched `POST
/api/source-reports/generate-content` call returns `{ letterSubject, letterBody, descriptions:
Record<invoiceId, string> }` and is applied as a NEW BASELINE (`applyAiContent`, layered before
manual `overrides`, not as an override itself) — so freshly-generated text shows NO edited-dot
indicator anywhere until a human subsequently edits it.

New spec file: `e2e/tests/budget/reportWizardAiGeneration.spec.ts` (8 scenarios: 1 real/unmocked +
7 with `**/api/config` + `**/api/source-reports/generate-content` route mocks). New POM additions
in `e2e/pages/ReportWizardPage.ts`: `aiToggle`, `aiGenerateRow`, `generateWithAiButton`,
`aiGeneratingCaption`, `aiErrorBanner`, `aiGeneratedNote`, `aiOverwriteConfirmModal` +
`aiOverwriteAndGenerateButton`/`aiOverwriteKeepEditingButton`, plus methods
`toggleAiEnabled`/`clickGenerateWithAi`/`confirmAiOverwrite`/`cancelAiOverwrite`. Added
`API.sourceReportsGenerateContent` to `e2e/fixtures/testData.ts`.

**Key gotchas found while writing this**:

- The E2E container config (`e2e/containers/cornerstoneContainer.ts`'s `environment` object) sets
  no `LLM_*` env vars at all — `llmEnabled` is deterministically `false` against the real,
  unmocked backend. This is what makes Scenario 1 (toggle absent) a TRUE e2e test with zero
  mocking, and it's also why every other scenario MUST mock `GET /api/config` (`mockLlmEnabled` —
  fetch-real-then-override-one-field, same pattern as `auto-itemize.spec.ts`'s
  `mockConfigEnabled`) before it can reach the AI UI at all.
- `handleGenerateWithAiClick` in `ReportWizardPage.tsx` gates the overwrite-confirm modal on
  `Object.keys(overrides).length > 0` ONLY — NOT on whether `aiContent` already exists. So
  regenerating a second time right after a first AI generation (no manual edits since) runs
  directly with no modal (Scenario 5). Don't assume "AI content already present" alone triggers
  the guard for regeneration — it doesn't (only for the SEPARATE discard-confirm guard on step
  1-4 mutations, where `isDirty = overrides.length > 0 || aiContent !== null` DOES include
  `aiContent`).
- **Trap I hit and fixed**: `wizard.letterField('subject')`/`letterField('body')` only render at
  all when `report.source.contactAddress` or `.reference` is set (drives `includeCoverLetter`'s
  default). Any AI-generation scenario that touches the cover letter fields MUST seed the budget
  source with `contactAddress`/`reference` — I initially forgot this on 3 of 7 mocked scenarios
  (Scenarios 5, 6, 7) and had to backfill it. If a future edit adds a scenario using
  `letterField(...)`, check the source seed includes both fields first.
- LLM error translations are SHARED, feature-neutral keys in `errors.json`
  (`LLM_NOT_CONFIGURED`/`LLM_UNREACHABLE`/`LLM_INVALID_RESPONSE`/`LLM_UPSTREAM_ERROR`) used by
  BOTH auto-itemize and report-content generation. **Reworded PR #1916 (2026-08-01, PO review
  feedback)**: the original wording said "extraction service"/"Auto-itemization is not
  configured", which was auto-itemize-specific and misleading when the same code renders for
  report generation. Current (feature-neutral) English strings: `LLM_NOT_CONFIGURED` = "AI
  assistance is not configured on this server.", `LLM_UNREACHABLE` = "The AI service could not be
  reached. Please try again.", `LLM_INVALID_RESPONSE` = "The AI service returned an unusable
  response. Please try again.", `LLM_UPSTREAM_ERROR` = "The AI service reported an error. Please
  try again." (German: "Der KI-Dienst …" / "KI-Unterstützung ist auf diesem Server nicht
  konfiguriert."). Updated the 3 e2e occurrences of the old wording (2 in
  `reportWizardAiGeneration.spec.ts` — one in the `LLM_UNREACHABLE` mock body, one in the actual
  `toContainText` assertion — and 1 in `invoice-auto-itemize-page.spec.ts`'s mock body, which
  doesn't assert message text so was updated for fixture realism only, not test correctness). Use
  the CURRENT `errors.json` strings above when asserting error
  text, not a report-specific wording.
- `aiErrorBanner` is scoped to `aiGenerateRow` (`this.aiGenerateRow.locator('[role="alert"]')`) —
  needed because the claim-flow's own error banner (`claimErrorBanner`) is a SEPARATE
  `[role="alert"]` elsewhere on the same step-5 page; an unscoped `page.getByRole('alert')` would
  strict-mode-collide once both could theoretically be present.
- Delayed-response gated-mock pattern (register route, await an externally-resolved `Promise<void>`
  gate before `route.fulfill`) is the SAME technique already established in
  `invoice-auto-itemize-page.spec.ts`'s `LLM_UNREACHABLE` scenario — reused verbatim, not
  reinvented, to assert the pending spinner/caption state deterministically before releasing the
  mock response.

**Not executed locally**: no live browser run in this sandbox session (see
`sandbox-live-verification.md` — Playwright's browser-binary download is still network-policy
blocked here). Verified via `npx tsc --noEmit -p e2e` (zero errors in the new/modified files; the
many pre-existing errors elsewhere in `e2e/` are unrelated repo-wide noise) and
`npx eslint`/`npx prettier --write` on just the touched files (clean).
