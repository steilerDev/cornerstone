---
name: issue-1959-inline-meta-and-labels
description: PR #1959 reversed two earlier report-table designs (†/‡ shared footnotes from #1923, distinct area sub-line) into inline labels + one combined meta line; which E2E locators/scenarios had to be rewritten and how each new assertion was made non-vacuous. Issue #1965 then reinstated legend footnotes for split/depositReduced rows.
metadata:
  type: project
---

PR #1959 ("improve report PDF UX") deliberately **superseded** two designs earlier rounds had
asked for, in `ReportContentEditor.tsx` / `buildReportContent.ts`:

1. `†`/`‡` markers + the shared footnote list (Story #1923 AC1) → grey inline `<span
class*="inlineNote">` in the **Allocated Amount cell**: `(partial)` / `(less deposit)`
   (de `(Teilbetrag)` / `(abzgl. Abschlag)`). `ReportContentRow.allocatedMarkers` → `isSplit` /
   `isDepositReduced` booleans. `buildReportContent` pushed **zero** footnotes after #1959, so
   `.footnotes` had no producer — `footnotesBlock`/`footnoteItems` survived in the POM as
   **negative-only** guards.

   **Issue #1965 update (fix/report-pdf-ux-improvements branch):** `buildReportContent.ts` now
   pushes ONE deduplicated legend entry per active flag: `splitInvoiceIds.size > 0` → one `'split'`
   footnote ("Amount shown reflects only the portion allocated to this source."),
   `depositReducedInvoiceIds.size > 0` → one `'depositReduced'` footnote. `footnotesBlock` /
   `footnoteItems` are NO LONGER negative-only guards. Scenarios with split or deposit-reduced rows
   must assert a **positive** count; constituted-deposit-only rows (Scenario 17) still assert
   `toHaveCount(0)` because neither set is non-empty for them. Scenario 18 (two split invoices)
   asserts `footnotesBlock` count=1, `footnoteItems` count=1, and the legend sentence IS present in
   `main`'s text content.

2. `.usageAreaText` sub-line + the separate editable `Attachments Note` column → ONE read-only
   `.usageMetaText` line inside the Usage cell: `[areaText, attachmentsNote].join(' · ')`
   (U+00B7 middle dot, spaces on both sides). The `attachmentsNote` `EditableField` is gone
   entirely, so a content-table row / mobile card now has **exactly one textbox** (Usage) — the
   crispest available guard against that column coming back.

**Why:** the user owns #1959 and asked for it in the promotion; source-of-truth hierarchy makes
the PR body the spec, so the tests were rewritten, not the code.

**How to apply:** POM renames are `usageAreaText`→`usageMetaText`,
`mobileUsageAreaText`→`mobileUsageMetaText`, plus new `inlineNote()`/`mobileInlineNote()`;
`attachmentsNoteField()` deleted. Rewritten scenarios: editableContent 2, 17, 18, 20 and
aiGeneration 8. Every "old design is gone" negative is paired with a positive so it cannot pass
against a mis-seeded page (e.g. Scenario 18 asserts `(partial)` present _and_ `†`/`‡` absent
_and_ the long-form footnote sentence absent from `main`; Scenario 20 asserts the attachments
note text IS rendered _and_ the row has one textbox).

Facts worth reusing:

- `toHaveText`/`toContainText` normalize whitespace, so the desktop `inlineNote` span's leading
  space (` (partial)`) is absorbed — `toHaveText('(partial)')` is correct.
- Attachment note text for a `claim` report with `attachmentType: 'invoice'` is
  `1 attachment: Invoice`. The tier gate is
  `server/src/services/shared/attachmentTierUtils.ts`: floors are quotation(1) for
  budget-overview, deposit(2) for claim, invoice(3) for proof-of-funds; `null` counts as tier 3.
  So a 'invoice'-tagged link shows up in claim reports — don't guess, that file is the only
  definition.
- `document_links` is unique on `(entity_type, entity_id, paperless_document_id)`, so a
  hardcoded `paperlessDocumentId` in a spec cannot collide across parallel workers/projects.
- `AppShell.tsx` renders a real `<main>` element, so `page.locator('main')` is a safe
  page-scope text container.
- **Column-visibility checkboxes (`role="group"`, "Show/hide columns") shipped with #1959 with
  NO E2E coverage** — deliberately not added on the critical path, because a new test case
  reshuffles shard membership. Pick this up when the promotion isn't blocking.
- Sub-agents share the worktree here: a `prettier --check` on a `client/` file can transiently
  fail because another agent is mid-write. Re-check before reporting it as broken.

See [[known-flakes-and-regressions]], [[story-1900-editable-report-preview]],
[[story-1879-report-wizard]].
