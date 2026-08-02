/**
 * Page Object Model for the Bank Report Wizard page (/budget/reports) — Story #1879.
 *
 * 5-step structure (as of Story #1899 — a "Settings" step was inserted at position 4, pushing
 * the old step 4 (preview + actions) to position 5):
 *   1. Report Type (`Step1UseCase.tsx`)
 *   2. Budget Source (`Step2Source.tsx`)
 *   3. Select Invoices (`ReportInvoiceList.tsx`)
 *   4. Settings (`Step4Settings.tsx`) — NEW: report-language radio group + the
 *      attach-documents/cover-letter toggles (moved here from the old step 4)
 *   5. Preview & Export (`Step5Actions.tsx` + `ReportContentEditor.tsx`) — renamed/renumbered
 *      from the old step 4; REWORKED again by Story #1900 into an editable HTML surface with
 *      on-demand PDF generation (see the step-5 bullet below for the full detail)
 *
 * The page renders:
 * - An h1 "Bank Reports" page title (PageLayout)
 * - BUDGET_TABS SubNav ("Reports" tab, 5th)
 * - A WizardStepper (`client/src/components/WizardStepper`): BOTH trees below are ALWAYS
 *   present in the DOM simultaneously — visibility is toggled purely via a
 *   `@media (max-width: 767px)` CSS rule in `WizardStepper.module.css` (`.stepper{display:
 *   none}`/`.stepperMobile{display:flex}` under the breakpoint), not conditional rendering.
 *   Locators that need viewport-specific behavior must assert visibility (`toBeVisible()` /
 *   `not.toBeVisible()`), never DOM presence (`toHaveCount()`), against these two trees.
 *   - Desktop (>=768px, visible): `<nav><ol class*="stepList">` of `<li class*="stepItem">`,
 *     each containing either a `<button class*="stepButton">` (reachable step, stepNum <=
 *     maxReachedStep) or a non-interactive `<div class*="stepButtonDisabled">` (forward-locked
 *     step — NOT a button, not in the a11y/tab tree). Now 5 items (`stepItems.nth(3)` =
 *     "Settings", `stepItems.nth(4)` = "Preview & Export").
 *   - Mobile (<768px, visible): `<p class*="stepCount">` (now "Step N of 5") + `<div
 *     class*="dotIndicators"><div class*="dot">` (now 5 dots).
 *
 *   NOTE: `WizardStepper`'s own strings (`reportWizard.stepOfTotal`,
 *   `reportWizard.stepperAriaLabel`) and every `common.button.*` call in
 *   `ReportWizardPage.tsx` (`next`/`back`/`cancel`/`confirm`/`retry`) resolve to MISSING i18n
 *   keys as of this story (confirmed against `client/src/i18n/en/{budget,common}.json` — no
 *   `reportWizard` namespace/key exists anywhere, and `budget.json`'s own `common` object is a
 *   FLAT `{retry, cancel, ...}` shape, not `common.button.*`). Locators below therefore
 *   deliberately avoid depending on that text and use structural/class selectors instead. See
 *   the story's filed bug report for the full list.
 * - Step 1 (`Step1UseCase.tsx`): `role="radiogroup"` (aria-label "Which report do you need?"),
 *   3 `<label class*="useCaseCard">` cards, each with a hidden radio input
 *   (`input[name="useCase"][value="budget-overview"|"claim"|"proof-of-funds"]`).
 * - Step 2 (`Step2Source.tsx`): `role="radiogroup"` (aria-label "Select a budget source"),
 *   `<label class*="sourceRow">` per source, `input[name="source"][value=<sourceId>]`,
 *   discretionary sources sorted last with `class*="sourceRowDisc"`.
 * - Step 3 (`ReportInvoiceList.tsx`, `client/src/components/reports/`): header
 *   `[class*="listHeader"] input[type=checkbox]` (select-all — accessible name "Select all
 *   invoices"; **fixed by Issue #1933**, see the marker paragraph below for why this locator
 *   no longer scopes via `[class*="headerCheckbox"]`), `<div class*="invoiceRow">` per
 *   allocated invoice with its own `input[type=checkbox]` (aria-label "Toggle invoice
 *   {vendor} #{number}" — this one DOES resolve correctly), an unallocated group toggle
 *   (`[class*="unallocatedHeader"]`, `aria-expanded`), and a `SelectionActionBar`
 *   (`[class*="count"]` text, "Clear selection" button — text is ALSO a missing-prop bug,
 *   located structurally).
 * - Step 4 (`Step4Settings.tsx`, NEW): a `role="group"` (aria-labelledby an
 *   `<h3 id="report-language-heading">`, accessible name "Report language") containing two
 *   plain (NOT visually hidden) radio inputs `input[name="reportLanguage"][value="en"|"de"]`
 *   with literal (non-translated) "English"/"Deutsch" labels, followed by the SAME
 *   `#attachDocuments`/`#includeCoverLetter` checkboxes that used to live on the old step 4 —
 *   same DOM ids, just relocated. This step has NO preview iframe — `ReportPdfPreview` is only
 *   mounted on step 5, so preview state changes triggered here (including a report-language
 *   change) are only OBSERVABLE once you advance to step 5 — as of Story #1900, that no longer
 *   means calling a `waitForPreview*` helper: `reportLanguage` now only feeds the CLIENT-SIDE
 *   editable content (`ReportContentEditor.tsx`'s live field VALUES, e.g. `letterField('subject')`),
 *   reactively and without any PDF generation; a PDF is only produced on-demand via
 *   `openPdfPreviewModal()`/`download()`/`clickUploadToPaperless()`.
 * - Step 5 (`Step5Actions.tsx` + `ReportContentEditor.tsx`, renamed/renumbered from the old step
 *   4) — REWORKED by Story #1900 from an always-present auto-regenerating PDF iframe into an
 *   editable HTML surface with ON-DEMAND PDF generation:
 *   - `ReportContentEditor.tsx` renders the effective (overrides-applied) report content as
 *     live, always-editable `EditableField` inputs (`client/src/components/EditableField/`) —
 *     NOT click-to-edit. A cover letter card (`[class*="coverLetterCard"]`, only when
 *     `content.coverLetter` is non-null) with visibly-labelled fields (`getByLabel('Sender'
 *     |'Recipient'|'Reference'|'Subject'|'Body')` — `Recipient`/`Reference` only when their
 *     underlying value is non-null) plus a read-only `dateLine`, followed by a `<table
 *     class*="table">` inside `[class*="tableWrapper"]` (the ONLY `<table>` inside that
 *     wrapper — `.summaryTable` is a separate sibling table outside it, so scoping via the
 *     wrapper avoids the shared "table" class-substring collision) with one row per invoice:
 *     read-only vendor/invoiceNumber/date/status-badge/amounts cells, plus a dense (unlabelled)
 *     `usageText` `EditableField` (accessible name `Usage text for {{vendor}},
 *     {{invoiceNumber}}` — `sourceReports.editable.usageTextAriaLabel`) and, only when
 *     `row.attachmentsNote !== null`, an `attachmentsNote` `EditableField` (`Attachments note
 *     for {{vendor}}, {{invoiceNumber}}`). Each `EditableField` shows a `[class*="editedDot"]`
 *     indicator (a DOM SIBLING of the input within `[class*="fieldWrapper"]`, conditionally
 *     MOUNTED not just opacity-toggled — see `hasEditedIndicator`) and a `[class*="resetButton"]`
 *     (a DOM SIBLING of `fieldWrapper` itself, one level further up — see `resetField`) only
 *     while that specific field `isEdited`.
 *   - **Fixed (#1904)**: below 767px, the desktop `<table>` (`display:none` under the
 *     breakpoint) is replaced by a mobile-card fallback — `[class*="mobileCardList"]`, a
 *     DIRECT CHILD `[class*="mobileCard"]` per invoice (see `mobileCard()`), each containing
 *     `[class*="mobileCardRow"]` pairs. **Round 3 markup change**: the READ-ONLY rows (Vendor,
 *     Invoice Number, Date, Status, Invoice Amount, Allocated Amount) no longer use `<label>`
 *     elements — they render as a `[class*="mobileCardCaption"]` span (the caption) followed by
 *     a `[class*="mobileCardValue"]` span (the value); there is nothing to `getByLabel()` for
 *     these. The EDITABLE rows (`usageText`/`attachmentsNote` `EditableField`s), conversely,
 *     now DO get a real, visible `label` prop (unlike the desktop table's dense/unlabelled
 *     copy) — see `mobileUsageField()`'s docstring for why that changes its accessible-name
 *     lookup strategy. Both the desktop `<table>` and the mobile card list are ALWAYS in the
 *     DOM simultaneously (CSS `display:none` toggles per viewport, same convention as the
 *     `WizardStepper` desktop/mobile trees above) — `usageField()`/`attachmentsNoteField()`
 *     stay correctly scoped to `contentTable` and therefore never collide with the mobile
 *     copy, but any NEW mobile-specific locator (`mobileCard()`/`mobileUsageField()` below)
 *     must likewise stay scoped to `mobileCardList`, or it will strict-mode-collide with the
 *     desktop table's copy. **Follow-up bug (#1908)**: `.mobileCardList`
 *     itself has no default `display: none` outside the `@media (max-width: 767px)` block (a
 *     one-line CSS gap relative to the established pattern elsewhere, e.g.
 *     `InvoiceDepositsSection.module.css`), so it is currently ALSO visible — duplicating
 *     every row — on desktop/tablet, not just hidden as intended. Scenario 1 in
 *     `reportWizardEditableContent.spec.ts` asserts `mobileCardList` is not visible on
 *     desktop as a regression guard for the fix. The cover letter card has no mobile-specific
 *     CSS at all and stays visible/usable at every width regardless of either bug.
 *   - No auto-generation, no debounce: `Step5Actions.tsx` gained a NEW leftmost "Preview PDF"
 *     button (`sourceReports.editable.previewPdf`) which is now the ONLY way to see rendered
 *     PDF output on step 5 — clicking it calls `generatePdfFromContent()` fresh (always a new
 *     `URL.createObjectURL()` blob, never memoized/skipped) and opens a wide `Modal`
 *     (`role="dialog"`, name `sourceReports.editable.previewModalTitle` = "PDF Preview")
 *     wrapping the UNCHANGED `ReportPdfPreview.tsx` — same `iframe[title="Report PDF
 *     preview"]`/`[class*="pdfLoadingOverlay"]`/`[class*="pdfPreviewWrapper"]` structure as
 *     before, just now scoped INSIDE the modal instead of permanently mounted on the page. The
 *     modal's own close affordance is the shared `Modal` component's built-in header × button
 *     (accessible name `common:aria.closeDialog` = "Close dialog") — `ReportWizardPage.tsx`
 *     passes no `footer` prop to this particular `Modal` instance (no separate "Close" button).
 *     Download PDF / Upload to Paperless are ALSO now on-demand (`generatePdfFromContent()` is
 *     called fresh inside each handler, independent of whether the preview modal was ever
 *     opened) — every action button disables (`Step5Actions.tsx`'s `activeAction !== null`
 *     gate) for the duration of its own generation and re-enables once settled, regardless of
 *     success/failure (`finally`/synchronous-clear in every handler).
 *   - `skippedDocuments` (per-document PDF-attachment failures, e.g. an unreachable Paperless
 *     preview URL — reason `footnoteFetchFailed`/`footnoteInvalidPdf`,
 *     `sourceReports.table.<reason>`) render as a `[class*="skippedNote"]` block on the STEP 5
 *     PAGE ITSELF (below `ReportContentEditor`, above `Step5Actions`) once any action has run —
 *     NOT inside the PDF preview modal, which has no skip-note rendering of its own.
 * - Discard-edits confirmation modal (Story #1900): `role="dialog"` (name
 *   `sourceReports.editable.discardConfirmTitle` = "Discard your edits?"), shown whenever a
 *   guarded step 1-4 mutation (use case, source, any invoice/line toggle, settings toggle) is
 *   attempted while `overrides` is non-empty (`isDirty`). "Keep Editing"
 *   (`[class*="btnSecondary"]`) closes without discarding; "Discard and Continue"
 *   (`[class*="btnPrimary"]`) clears `overrides` THEN applies the originally-attempted change.
 * - Claim confirmation modal: `role="dialog"` (name "Mark Invoices as Claimed?"). Structurally
 *   never concurrent with the PDF preview modal or the discard-confirm modal (all three are
 *   independent `showX` booleans, only one user action path opens any given one at a time) —
 *   but if a PDF preview modal IS left open, its backdrop/overlay will intercept clicks
 *   intended for anything underneath (including the Mark Claimed button), so always
 *   `closePdfPreviewModal()` before triggering another modal-opening action.
 * - Claim success: `[class*="bannerSuccess"]` banner (replaces the action buttons in step 5).
 *
 * Story #1901: AI-generated usage descriptions and cover letter. REWORKED by Issue #1931 to
 * remove the double opt-in (see below) and rename the action.
 * - Step 4 (`Step4Settings.tsx`): as of Issue #1931 there is NO AI-related section here at
 *   all — the step renders only its original two sections (report-language group, then
 *   attach-documents/cover-letter checkboxes). The old "Enable AI assistance" checkbox
 *   (`#enableAiAssistance`) and its `aiEnabled` state are gone entirely; the single gate for the
 *   AI action now lives purely on Step 5, keyed off `llmEnabled` alone.
 * - Step 5: when `llmEnabled` (`GET /api/config`'s `llmEnabled` field — true iff all `LLM_*` env
 *   vars are set server-side) is true, an `[class*="aiGenerateRow"]` block appears ABOVE
 *   `ReportContentEditor` — no prior opt-in required, no toggle to discover or miss. The E2E
 *   containers (`e2e/containers/cornerstoneContainer.ts`) set no `LLM_*` environment variables at
 *   all, so against the real, unmocked backend `llmEnabled` is always `false` — the only way to
 *   reach the `true` branch in E2E is `page.route('**\/api/config', ...)`. The block contains: an
 *   "Enhance with AI" button (`generateWithAiButton`, `sourceReports.editable.enhanceWithAi` —
 *   renamed from "Generate with AI" by Issue #1931, since the action improves existing
 *   deterministic content rather than generating from nothing) that disables itself
 *   (`isGeneratingAi`) for the duration of the call and carries
 *   `aria-describedby="enhanceWithAiDescription"` pointing at a sibling visually-hidden
 *   `<span id="enhanceWithAiDescription" class*="srOnly">` (`enhanceWithAiDescription` below,
 *   `sourceReports.editable.enhanceWithAiDescription`) — added because the deleted checkbox's
 *   helper text was the only pre-click explanation of the overwrite behavior available to
 *   screen-reader users, and it renders unconditionally alongside the button (same `llmEnabled`
 *   gate, not contingent on any dirty/edited state); a decorative (`aria-hidden="true"`)
 *   `Spinner` inside the button while pending; an elapsed-seconds caption
 *   (`[class*="aiGeneratingCaption"]`, `sourceReports.editable.generating` = "Generating…
 *   ({{seconds}}s)", `aria-live="polite"`) visible only while pending, ticking via a 1s
 *   `setInterval`; an inline error (`[role="alert"]` `FormError`, scoped to `aiGenerateRow` so
 *   it never collides with the claim-flow's own banner) shown only after a failed generation;
 *   and a provenance note (`[class*="aiGeneratedNote"]`, `sourceReports.editable.aiGeneratedNote`
 *   = "Content generated with AI — review before submitting.") shown once `aiContent` is set AND
 *   generation has settled (`!isGeneratingAi`) — absent both before the first generation and
 *   while a generation is in flight.
 * - Generated content lands in the SAME baseline the derived (#1898) content occupies
 *   (`applyAiContent`, applied before `overrides`) — NOT as an override. `EditableField`'s
 *   `isEdited` is `key in overrides`, so freshly-generated AI text shows NO edited-dot/reset
 *   button anywhere (`hasEditedIndicator` returns `false` for every field right after a
 *   successful generation) even though its value differs from the plain derived baseline — it
 *   only becomes "edited" once a human subsequently types into that field.
 * - Regenerating: `handleGenerateWithAiClick` checks ONLY `Object.keys(overrides).length > 0`
 *   (manual edits), NOT whether `aiContent` already exists — so regenerating a second time with
 *   no manual edits since the first generation runs immediately, no overwrite modal. With a
 *   manual edit present, it shows the SAME `Modal` component family as the discard-confirm modal
 *   (`role="dialog"`, name `sourceReports.editable.aiOverwriteConfirmTitle` = "Overwrite your
 *   edits?"): "Overwrite and Generate" (`btnPrimary`, `aiOverwriteAndGenerate`) runs the
 *   generation immediately (clearing `overrides` as a side effect of `runAiGeneration` succeeding
 *   — see `applyAiContent`'s docstring); "Keep Editing" (`btnSecondary`, same translation key/
 *   button as the discard modal) closes without ever calling the generate-content endpoint.
 * - A confirmed step 1-4 mutation via the discard-confirm modal (`guardedUpdate`) clears BOTH
 *   `overrides` AND `aiContent` (`isDirty = overrides.length > 0 || aiContent !== null`) —
 *   generated content does not survive a discarded/confirmed upstream change any more than a
 *   manual edit does, and the derived (#1898/#1900) baseline reasserts itself.
 *
 * Story #1923: report table cleanup — shared footnotes, inline deposit label, claim metadata
 * suppression, total-only summary, area in Usage.
 * - `sourceInfoBlock` (declared above) is now conditionally rendered — `{!content.isClaim && (
 *   ...)}` — and ABSENT from the DOM entirely for `claim` reports (AC3.1), not merely hidden.
 *   `budget-overview`/`proof-of-funds` reports are unaffected (still render it).
 * - `allocatedMarkers` (the `†`/`‡` text appended after the Allocated Amount, still plain text —
 *   no dedicated locator, read via the row/card's own text) is now SHARED/unnumbered per report
 *   — at most one `†` (any split row) and one `‡` (any deposit-reduced row) — never `†1`/`†2`/
 *   per-invoice numbering. `footnotesBlock`/`footnoteItems` (declared above) mirror this: at
 *   most 2 `<li>` entries total, each `{marker}: {text}` with NO `Vendor (Invoice No.) — `
 *   prefix (dropped — the note is no longer invoice-specific).
 * - A constituted-deposit row (the allocation is made up entirely by a deposit tagged to the
 *   reported source) carries NO marker at all — instead an inline `Badge` (`depositBadge`/
 *   `mobileDepositBadge` below) reading "Deposit"/"Abschlagszahlung". There is correspondingly
 *   no "This is a deposit." footnote anymore (`depositConstitutedFootnote` key removed).
 * - `summaryTable`/`summaryTableRows` (declared above) now contains exactly ONE row — `Total`/
 *   `Gesamt` — regardless of how many distinct invoice statuses are included; the old
 *   per-status `Outstanding`/`Paid`/`Quotation`/`Claimed Subtotal` rows are gone
 *   (`sourceReports.table.subtotal` key removed).
 * - `usageAreaText`/`mobileUsageAreaText` below: a read-only leaf-area sub-line rendered under
 *   a row's Usage field, only when the linked item(s) resolve to an area — see the method's own
 *   docstring for why it can never be silently dropped by AI-generated usage text.
 *
 * Back/Next button locators (`step2BackButton`/`step2NextButton`/`step4BackButton`/
 * `step4NextButton`/`step5BackButton`, etc.): every step body is rendered from a single
 * `{currentStep === N && ...}` block, so exactly ONE `[class*="buttonRow"]` div is ever present
 * in the DOM at a time — these locators are therefore all built from the SAME page-wide
 * `[class*="buttonRow"] [class*="btnSecondary"|"btnPrimary"]` queries (re-used/aliased across
 * steps, e.g. `step3BackButton = step2BackButton`), which re-resolve to whichever step's
 * buttonRow is currently mounted. Steps 2-4 have both a Back (`btnSecondary`) and Next
 * (`btnPrimary`) button; step 5 has Back only. `.first()`/`.last()` never disambiguate Back
 * from Next here (that's already done by the distinct `btnSecondary`/`btnPrimary` class
 * queries) — they exist only as a defensive tie-breaker in case more than one match is ever
 * present, and are consequently interchangeable for a single-button buttonRow (step 5).
 *
 * Story #1891 follow-up additions (`ReportInvoiceList.tsx`):
 * - Each allocated invoice row is a `<div class*="invoiceRow">` on a `1.5rem auto 1fr auto
 *   auto auto` grid: [chevron|non-interactive span] [TriState checkbox + vendor info]
 *   [status Badge `class*="statusChip"`] [amount] [attachment column]. The row is only
 *   expandable (chevron rendered as a real `<button class*="expandButton">` with
 *   `aria-expanded`/`aria-controls="invoice-expand-{invoiceId}"`) when
 *   `budgetLines.length > 0 || deposits.length > 0`; otherwise a bare `aria-hidden` span
 *   fills the grid cell and there is nothing to expand.
 * - The expansion panel (`class*="expansionPanel"`, `id="invoice-expand-{invoiceId}"`) is a
 *   DOM SIBLING immediately after the row's own `invoiceRow` div (both children of the same
 *   per-invoice wrapper `<div key={invoice.invoiceId}>`), not a descendant — locators below
 *   reach it via `xpath=following-sibling::*`.
 * - Inside the panel: an items sub-table (`class*="subTableSection"` #1, budget lines, else
 *   `EmptyState`) then a deposits sub-table (`class*="subTableSection"` #2, else
 *   `EmptyState`) — always in this DOM order, so `.nth(0)`/`.nth(1)` disambiguates without
 *   depending on i18n heading text.
 * - Each budget-line row's exclusion checkbox has `aria-label="Exclude {name} from report"`
 *   (`sourceReports.expand.excludeItemAriaLabel`, `name` = line description or
 *   `t('sourceReports.expand.unnamedLine')`). Toggling it updates `excludedLineIds`
 *   (`ReportWizardPage.tsx`), which is applied PURELY client-side via
 *   `applyLineExclusions()` (`client/src/lib/reportExclusions.ts`) — it subtracts the
 *   excluded lines' `allocatedPortion` from the invoice's `allocatedAmount` for display/PDF
 *   purposes only. It NEVER touches `excludedInvoiceIds` — the invoice is still submitted in
 *   full to `markInvoicesClaimed` regardless of line exclusions (hence the claim-confirm
 *   modal's warning block, see `markClaimedWarningBlock` below).
 * - **Fixed regression (#1892)**: `applyLineExclusions` clamps a fully-excluded invoice's
 *   `allocatedAmount` to exactly `0`. `ReportInvoiceList`'s `allocatedInvoices` filter is
 *   `inv.allocatedAmount > 0 || inv.lineKind === 'refund-adjustment' || inv.budgetLines.length > 0
 *   || inv.deposits.length > 0` — the added `budgetLines.length > 0 || deposits.length > 0`
 *   clauses keep a fully-line-excluded invoice (net exactly 0, `lineKind` stays `'invoice'`)
 *   visible as a `€0.00` row instead of being filtered out, which also preserves the only UI
 *   path back to un-excluding those lines (the row's own expand toggle). The PDF and the actual
 *   claim submission were never affected either way (both operate on `excludedInvoiceIds`, not
 *   the filtered display list) — this was a display-only regression. See
 *   `reportWizardExpansion.spec.ts` Scenario 4 for the regression-guard test.
 * - Deposits sub-table's "Allocated Source" column renders a source-colored Badge only when
 *   `deposit.budgetSourceId === report.source.id` (the CURRENTLY viewed source); any other
 *   value (including a different source's id) renders a plain `—` — deposits tagged to a
 *   different source are never shown as tagged in someone else's report.
 * - Claim confirm modal warning block: `[role="alert"]` (`class*="warningBlock"`) rendered
 *   inside the modal ONLY when at least one included (non invoice-excluded) invoice has one
 *   or more excluded lines — text is `sourceReports.confirmClaimExcludedItemsWarning`
 *   ("{{count}} invoice(s) have excluded line items and will keep their current claim status —
 *   the excluded portion stays claimable in a future report."). Note this is orthogonal to
 *   whether confirming actually submits anything: `handleMarkClaimed` excludes any invoice with
 *   an excluded line from `invoiceIds` entirely (see the claim-scope note below), so an
 *   all-excluded-lines-no-deposits selection shows this warning AND then hits the "nothing
 *   claimable" guard on confirm.
 * - Claim-scope split (Issue #1895/#1896/#1918): `handleMarkClaimed` (`ReportWizardPage.tsx`)
 *   submits `invoiceIds` (included invoices with zero excluded lines) and `depositIds` (all
 *   non-`claimed` deposits of included invoices, INCLUDING deposits of invoices left out of
 *   `invoiceIds`) as separate arrays to `markInvoicesClaimed`. If both computed arrays are
 *   empty, the client never calls the API — it shows `sourceReports.claimNothingClaimable` as
 *   the `claimErrorBanner` and closes the confirm modal. Otherwise the SERVER decides which
 *   invoices actually flip to `claimed` (an invoice with other-source budget-line interest is
 *   left pending even if requested) and which deposits sweep — the success banner
 *   (`sourceReports.claimSuccess`, `claimSuccessBanner`) reports `{{invoices}} invoice(s) and
 *   {{deposits}} deposit(s) marked as claimed` using the SERVER's `claimedInvoiceIds`/
 *   `claimedDepositIds` counts, not the client's request counts — the two can differ (e.g. a
 *   quotation invoice can be requested but never flips; an invoice with other-source interest
 *   is requested but stays pending — "deposit-only close-out").
 *
 * Issue #1933: Select Invoices step visual/affordance fixes.
 * - `.invoiceRow`/`.listHeader` gained a 7th grid track (`1.5rem auto 1fr auto auto auto
 *   auto`, was 6) purely to host the new open-invoice affordance below — no existing column's
 *   content changed shape.
 * - Open-invoice affordance: a shared `IconLinkButton` (`client/src/components/IconLinkButton/`)
 *   rendered as the row's 7th/last grid cell, a DOM SIBLING of `.attachmentColumn` — NOT
 *   nested inside the `<label class*="checkboxWithContent">` that wraps the row's own
 *   checkbox, so activating it can never toggle inclusion (AC 2.5). It renders a real
 *   `<a>` (react-router `Link`, `target="_blank" rel="noopener noreferrer"`), so
 *   `getByRole('link', ...)` resolves it — see `openInvoiceLink()` below. There is NO mobile
 *   card layout for this row at any viewport (the grid is unconditional — see the CSS file's
 *   lack of an `.invoiceRow`/`.listHeader` override inside its `@media (max-width: 767px)`
 *   block), so the affordance and its 44×44px touch target apply identically at desktop,
 *   tablet, and mobile.
 * - Select-all alignment fix: the header's checkbox wrapper used to compose
 *   `${styles.headerCheckbox} ${styles.checkboxWithContent}` — `.headerCheckbox`'s own
 *   `justify-content: center` fought `.checkboxWithContent`'s row-checkbox alignment,
 *   pulling the select-all checkbox off the per-row checkboxes' shared left edge/vertical
 *   axis. `.headerCheckbox` is now removed entirely (from both the TSX and the CSS module) —
 *   the header wrapper is a bare `.checkboxWithContent` div, identical to each row's
 *   `.checkboxWithContent` label, so both align on the same grid track. `selectAllCheckbox`
 *   below was updated accordingly: it now scopes via the (still-present) `.listHeader`
 *   container class instead of the removed `.headerCheckbox` class.
 * - Attachment glyph fix: the has-documents indicator's SVG path (inside the unchanged
 *   `.paperclip`/`.noDocument` structure/classes/aria text) was swapped from Feather's
 *   `refresh-cw` to an actual paperclip path — no locator changes, the element remains a
 *   non-interactive `<div>` with the same accessible text.
 * - Deposit-dates alignment fix: `.depositDatesCell` is no longer an unconditional flex
 *   column — at desktop/tablet it is now a plain `<td>` (baseline-aligned with its sibling
 *   cells, spacing between date lines via `.depositDatesCell > div + div { margin-top }`
 *   instead of `gap`); the flex-column layout is now scoped inside the SAME
 *   `@media (max-width: 767px)` block as the mobile card list, preserving the original
 *   layout there. No locator changes — `depositRow()` below is unaffected.
 * - See `reportWizard.spec.ts`'s "Issue #1933" describe block for the affordance's new-tab
 *   behavior, wizard-state preservation, mobile-viewport repeat, accessible-name contract,
 *   and the select-all alignment regression guard — all four things unreachable from unit
 *   tests (real new browsing context, and CSS layout/alignment, which jsdom cannot render).
 */

import { expect, type Page, type Locator, type Download } from '@playwright/test';

export const REPORT_WIZARD_ROUTE = '/budget/reports';

export type SourceReportUseCase = 'budget-overview' | 'claim' | 'proof-of-funds';

export class ReportWizardPage {
  readonly page: Page;

  // Page shell
  readonly heading: Locator;

  // Stepper — desktop
  readonly stepListDesktop: Locator;
  readonly stepItems: Locator;
  // Stepper — mobile
  readonly mobileStepCount: Locator;
  readonly mobileDots: Locator;

  // Step 1: Use case
  readonly useCaseRadioGroup: Locator;
  readonly step1NextButton: Locator;

  // Step 2: Source
  readonly sourceRadioGroup: Locator;
  readonly step2BackButton: Locator;
  readonly step2NextButton: Locator;

  // Step 3: Invoices
  readonly selectAllCheckbox: Locator;
  readonly invoiceRows: Locator;
  readonly unallocatedGroupToggle: Locator;
  readonly unallocatedRows: Locator;
  readonly selectionActionBar: Locator;
  readonly selectionCountLabel: Locator;
  readonly clearSelectionButton: Locator;
  readonly emptyState: Locator;
  readonly step3BackButton: Locator;
  readonly step3NextButton: Locator;

  // Step 4: Settings (report language + attach-documents/cover-letter options)
  readonly reportLanguageGroup: Locator;
  readonly attachDocumentsCheckbox: Locator;
  readonly includeCoverLetterCheckbox: Locator;
  readonly step4BackButton: Locator;
  readonly step4NextButton: Locator;

  // Step 5: Preview + actions (renamed/renumbered from the old "step 4" — Story #1899).
  // Story #1900: the PDF preview is no longer permanently mounted here — see `pdfPreviewModal*`
  // below.
  readonly previewPdfButton: Locator;
  readonly downloadButton: Locator;
  readonly markClaimedButton: Locator;
  readonly finishWithoutMarkingButton: Locator;
  readonly uploadPaperlessButton: Locator;
  readonly claimErrorBanner: Locator;
  readonly claimSuccessBanner: Locator;
  readonly claimSuccessInvoicesLink: Locator;
  readonly skippedDocumentsNote: Locator;
  readonly step5BackButton: Locator;

  // Story #1900: on-demand PDF preview modal (opened by `previewPdfButton`, replaces the old
  // always-present step-5 iframe).
  readonly pdfPreviewModal: Locator;
  readonly pdfPreviewModalCloseButton: Locator;
  readonly pdfPreviewModalIframe: Locator;
  readonly pdfPreviewModalLoadingOverlay: Locator;
  readonly pdfPreviewModalErrorBanner: Locator;

  // Story #1900: discard-edits confirmation modal (guards step 1-4 mutations while dirty).
  readonly discardConfirmModal: Locator;
  readonly discardConfirmKeepEditingButton: Locator;
  readonly discardConfirmDiscardButton: Locator;

  // Story #1900: editable report content (ReportContentEditor.tsx) — cover letter card + table.
  readonly coverLetterCard: Locator;
  // Read-only source-info block (Round 3 addition) — sits between the cover letter card and
  // the table heading, rendering `content.labels.source`/`sourceType`/`reference`/`generatedAt`
  // paired with `content.sourceInfo.*` values, one `<p>` per line. Scoped via `[class*=...]` so
  // assertions against it never collide with unrelated page text (e.g. the step 2 source list).
  readonly sourceInfoBlock: Locator;
  readonly contentTable: Locator;
  // Mobile-card fallback for the same content (fixed #1904; see class docstring's "Fixed
  // (#1904)" paragraph for the dual-DOM-tree caveat, and #1908 for the desktop-visible
  // follow-up bug).
  readonly mobileCardList: Locator;

  // Story #1923: report table cleanup — total-only summary table (`.summaryTable`, a sibling
  // `<table>` OUTSIDE `.tableWrapper` — see `contentTable`'s own docstring for why that scoping
  // avoids a substring collision) and the shared footnotes block (`.footnotes`, now at most 2
  // `<li>` entries — one per marker (`†`/`‡`) — never one per invoice; see `depositBadge`'s
  // docstring below for the constituted-deposit case, which carries NO marker at all).
  readonly summaryTable: Locator;
  readonly summaryTableRows: Locator;
  readonly footnotesBlock: Locator;
  readonly footnoteItems: Locator;

  // Claim confirm modal
  readonly claimConfirmModal: Locator;
  readonly claimConfirmModalBody: Locator;
  readonly claimConfirmConfirmButton: Locator;
  readonly claimConfirmCancelButton: Locator;

  // Data-loading error
  readonly errorLoadingDataBanner: Locator;

  // Story #1891: expandable rows, items/deposits sub-tables, claim warning
  readonly markClaimedWarningBlock: Locator;

  // Story #1901: AI-generated usage descriptions and cover letter. Issue #1931 removed the
  // Step 4 opt-in checkbox entirely — the row below is now gated purely on `llmEnabled` (see
  // class docstring).
  // Step 5 — only present when `llmEnabled` is true.
  readonly aiGenerateRow: Locator;
  readonly generateWithAiButton: Locator;
  // The visually-hidden description the button's `aria-describedby` points at (Issue #1931
  // a11y addition — see class docstring).
  readonly enhanceWithAiDescription: Locator;
  readonly aiGeneratingCaption: Locator;
  readonly aiErrorBanner: Locator;
  readonly aiGeneratedNote: Locator;
  // AI overwrite-confirm modal (distinct from the discard-confirm modal — same component,
  // different title/copy; see class docstring).
  readonly aiOverwriteConfirmModal: Locator;
  readonly aiOverwriteAndGenerateButton: Locator;
  readonly aiOverwriteKeepEditingButton: Locator;

  /**
   * Console messages captured since construction whose text matches
   * `/content security policy/i`. Registered in the constructor — NOT lazily on first use —
   * so a violation that fires before/during `goto()` is never missed (mirrors the established
   * convention in `invoice-auto-itemize-page.spec.ts` Scenario 18's `page.on('console', ...)`
   * CSP-error capture). A blocked `frame-src` navigation for the report preview `<iframe>`
   * surfaces here as a Chromium-emitted `'error'`-type console message, e.g.
   * `Refused to frame 'blob:...' because it violates the following Content Security Policy
   * directive: "frame-src 'self'".`
   */
  private readonly cspViolationMessages: string[] = [];

  constructor(page: Page) {
    this.page = page;

    page.on('console', (msg) => {
      if (msg.type() === 'error' && /content security policy/i.test(msg.text())) {
        this.cspViolationMessages.push(msg.text());
      }
    });

    this.heading = page.getByRole('heading', { level: 1 });

    this.stepListDesktop = page.locator('[class*="stepList"]');
    this.stepItems = this.stepListDesktop.locator('[class*="stepItem"]');
    this.mobileStepCount = page.locator('[class*="stepCount"]');
    this.mobileDots = page.locator('[class*="dotIndicators"] [class*="dot"]');

    this.useCaseRadioGroup = page.getByRole('radiogroup', { name: 'Which report do you need?' });
    this.step1NextButton = page.locator('[class*="metadataCard"] [class*="btnPrimary"]').first();

    this.sourceRadioGroup = page.getByRole('radiogroup', { name: 'Select a budget source' });
    this.step2BackButton = page.locator('[class*="buttonRow"] [class*="btnSecondary"]').first();
    this.step2NextButton = page.locator('[class*="buttonRow"] [class*="btnPrimary"]').first();

    // Issue #1933: `.headerCheckbox` was removed (it fought `.checkboxWithContent`'s
    // alignment — see class docstring) — scope via the still-present `.listHeader`
    // container instead.
    this.selectAllCheckbox = page.locator('[class*="listHeader"] input[type="checkbox"]');
    this.invoiceRows = page.locator('[class*="invoiceRow"]');
    this.unallocatedGroupToggle = page.locator('[class*="unallocatedHeader"]');
    this.unallocatedRows = page.locator('[class*="unallocatedRow"]');
    this.selectionActionBar = page.locator('[class*="bar"]').filter({
      has: page.locator('[class*="count"]'),
    });
    this.selectionCountLabel = this.selectionActionBar.locator('[class*="count"]');
    this.clearSelectionButton = this.selectionActionBar.locator('[class*="btnSecondaryCompact"]');
    this.emptyState = page.locator('[class*="emptyState"]');
    this.step3BackButton = this.step2BackButton;
    this.step3NextButton = this.step2NextButton;

    this.reportLanguageGroup = page.getByRole('group', { name: 'Report language' });
    this.attachDocumentsCheckbox = page.locator('#attachDocuments');
    this.includeCoverLetterCheckbox = page.locator('#includeCoverLetter');
    this.step4BackButton = this.step2BackButton;
    this.step4NextButton = this.step2NextButton;

    this.previewPdfButton = page.getByRole('button', { name: 'Preview PDF' });
    this.downloadButton = page.getByRole('button', { name: 'Download PDF' });
    // `Step5Actions.tsx` (renamed from `Step4Options.tsx` — Story #1899) correctly passes
    // `{ count: selectedInvoiceCount }` to `t('sourceReports.markClaimed')`. The regex still
    // matches on the surrounding text rather than an exact digit so the locator doesn't need
    // to change if the count itself varies per scenario.
    this.markClaimedButton = page.getByRole('button', { name: /Mark .+ invoices as claimed/i });
    this.finishWithoutMarkingButton = page.getByRole('button', { name: 'Finish without marking' });
    this.uploadPaperlessButton = page.getByRole('button', { name: 'Upload to Paperless' });
    this.claimErrorBanner = page.locator('[class*="bannerError"]');
    this.claimSuccessBanner = page.locator('[class*="bannerSuccess"]');
    this.claimSuccessInvoicesLink = this.claimSuccessBanner.getByRole('link');
    this.skippedDocumentsNote = page.locator('[class*="skippedNote"]');
    this.step5BackButton = page.locator('[class*="buttonRow"] [class*="btnSecondary"]').last();

    // Story #1900: on-demand PDF preview modal.
    this.pdfPreviewModal = page.getByRole('dialog', { name: 'PDF Preview' });
    this.pdfPreviewModalCloseButton = this.pdfPreviewModal.getByRole('button', {
      name: 'Close dialog',
    });
    this.pdfPreviewModalIframe = this.pdfPreviewModal.locator('iframe[title="Report PDF preview"]');
    this.pdfPreviewModalLoadingOverlay = this.pdfPreviewModal.locator(
      '[class*="pdfLoadingOverlay"]',
    );
    // `FormError` (`variant="banner"`, the default) renders `[class*="banner"]` with
    // `role="alert"` — used inside the modal only when `actionError` is set (a hard PDF
    // generation failure, distinct from a per-document `skippedDocuments` entry).
    this.pdfPreviewModalErrorBanner = this.pdfPreviewModal.locator('[role="alert"]');

    // Story #1900: discard-edits confirmation modal.
    this.discardConfirmModal = page.getByRole('dialog', { name: 'Discard your edits?' });
    this.discardConfirmKeepEditingButton =
      this.discardConfirmModal.locator('[class*="btnSecondary"]');
    this.discardConfirmDiscardButton = this.discardConfirmModal.locator('[class*="btnPrimary"]');

    // Story #1900: editable report content.
    this.coverLetterCard = page.locator('[class*="coverLetterCard"]');
    // The `<table>` inside `[class*="tableWrapper"]` specifically — `.summaryTable` is a
    // separate sibling `<table>` OUTSIDE the wrapper, so scoping via the wrapper (rather than a
    // bare `[class*="table"]`, which would also match `.summaryTable`/`.tableWrapper`
    // themselves via substring) lands unambiguously on the row table.
    this.sourceInfoBlock = page.locator('[class*="sourceInfoBlock"]');
    this.contentTable = page.locator('[class*="tableWrapper"] table');
    this.mobileCardList = page.locator('[class*="mobileCardList"]');

    // Story #1923.
    this.summaryTable = page.locator('[class*="summaryTable"]');
    this.summaryTableRows = this.summaryTable.locator('tbody tr');
    this.footnotesBlock = page.locator('[class*="footnotes"]');
    this.footnoteItems = this.footnotesBlock.locator('li');

    this.claimConfirmModal = page.getByRole('dialog', { name: 'Mark Invoices as Claimed?' });
    this.claimConfirmModalBody = this.claimConfirmModal.locator('p');
    this.claimConfirmConfirmButton = this.claimConfirmModal.locator('[class*="btnPrimary"]');
    this.claimConfirmCancelButton = this.claimConfirmModal.locator('[class*="btnSecondary"]');

    this.errorLoadingDataBanner = page.locator('[class*="metadataCard"] [role="alert"]').first();

    // Warning block ([role="alert"], class*="warningBlock") shown inside the claim-confirm
    // modal only when an included invoice has excluded lines (see class docstring above).
    this.markClaimedWarningBlock = this.claimConfirmModal.locator('[role="alert"]');

    // Story #1901 / Issue #1931: AI-generated usage descriptions and cover letter.
    this.aiGenerateRow = page.locator('[class*="aiGenerateRow"]');
    this.generateWithAiButton = this.aiGenerateRow.getByRole('button', {
      name: 'Enhance with AI',
    });
    this.enhanceWithAiDescription = page.locator('#enhanceWithAiDescription');
    this.aiGeneratingCaption = this.aiGenerateRow.locator('[class*="aiGeneratingCaption"]');
    // Scoped to `aiGenerateRow` so this never collides with the claim-flow's own
    // `claimErrorBanner` (a plain `sharedStyles.bannerError` div with `role="alert"`, elsewhere
    // on step 5 — distinct markup from this `FormError` banner variant, but both share the
    // `role="alert"` semantics, hence the defensive scoping here).
    this.aiErrorBanner = this.aiGenerateRow.locator('[role="alert"]');
    this.aiGeneratedNote = this.aiGenerateRow.locator('[class*="aiGeneratedNote"]');

    this.aiOverwriteConfirmModal = page.getByRole('dialog', { name: 'Overwrite your edits?' });
    this.aiOverwriteAndGenerateButton =
      this.aiOverwriteConfirmModal.locator('[class*="btnPrimary"]');
    this.aiOverwriteKeepEditingButton =
      this.aiOverwriteConfirmModal.locator('[class*="btnSecondary"]');
  }

  async goto(sourceId?: string): Promise<void> {
    const url = sourceId
      ? `${REPORT_WIZARD_ROUTE}?sourceId=${encodeURIComponent(sourceId)}`
      : REPORT_WIZARD_ROUTE;
    await this.page.goto(url);
    await this.heading.waitFor({ state: 'visible' });
  }

  // ─── Step 1 ──────────────────────────────────────────────────────────────

  useCaseCard(useCase: SourceReportUseCase): Locator {
    return this.page.locator(`input[name="useCase"][value="${useCase}"]`);
  }

  async selectUseCase(useCase: SourceReportUseCase): Promise<void> {
    // Clicking the (visually-hidden) radio input directly toggles it and fires onChange
    // (the enclosing <label class*="useCaseCard"> also intercepts clicks anywhere in the
    // card, but targeting the input is unambiguous regardless of card layout).
    await this.useCaseCard(useCase).click({ force: true });
  }

  // ─── Step 2 ──────────────────────────────────────────────────────────────

  sourceRow(sourceId: string): Locator {
    return this.page.locator(`input[name="source"][value="${sourceId}"]`);
  }

  sourceRowByName(sourceName: string): Locator {
    return this.page
      .locator('[class*="sourceRow"]')
      .filter({ has: this.page.locator('[class*="sourceName"]', { hasText: sourceName }) });
  }

  async selectSource(sourceId: string): Promise<void> {
    await this.sourceRow(sourceId).click({ force: true });
  }

  // ─── Step 3 ──────────────────────────────────────────────────────────────

  /**
   * An invoice row within the (allocated) list, matched by vendor name AND invoice number
   * (both rendered as separate text nodes within the row — `vendorName` alone can collide
   * across seed data from other tests running in parallel).
   */
  invoiceRow(vendorName: string, invoiceNumber: string): Locator {
    return this.invoiceRows.filter({ hasText: vendorName }).filter({ hasText: invoiceNumber });
  }

  invoiceRowCheckbox(vendorName: string, invoiceNumber: string): Locator {
    return this.invoiceRow(vendorName, invoiceNumber).locator('input[type="checkbox"]');
  }

  /**
   * The open-invoice affordance (IconLinkButton, Issue #1933) for a given invoice row —
   * opens /budget/invoices/:id in a new tab, structurally outside the row's checkbox <label>.
   */
  openInvoiceLink(vendorName: string, invoiceNumber: string): Locator {
    return this.invoiceRow(vendorName, invoiceNumber).getByRole('link', {
      name: new RegExp(`${vendorName}.*${invoiceNumber}`),
    });
  }

  /**
   * The refund-adjustment row for a given invoice (Issue #1876 refund entries surfaced in a
   * source report as a separate `lineKind: 'refund-adjustment'` line, red "Refund" badge +
   * negative amount). Disambiguated from the invoice's own `lineKind: 'invoice'` row — both
   * can share the same vendor name + invoice number text.
   */
  refundRow(vendorName: string, invoiceNumber: string): Locator {
    return this.invoiceRow(vendorName, invoiceNumber).filter({
      has: this.page.locator('[class*="refund"]'),
    });
  }

  regularInvoiceRow(vendorName: string, invoiceNumber: string): Locator {
    return this.invoiceRow(vendorName, invoiceNumber).filter({
      hasNot: this.page.locator('[class*="refund"]'),
    });
  }

  async toggleInvoiceExclusion(vendorName: string, invoiceNumber: string): Promise<void> {
    await this.invoiceRowCheckbox(vendorName, invoiceNumber).click();
  }

  /**
   * The row's own displayed amount element — `[class*="amount"]` WITHOUT the `Column`
   * substring, so it excludes the `.amountColumn` grid-cell wrapper (which also contains
   * "amount" as a substring) and resolves to the innermost `.amount`/`.amount.amountNegative`
   * div regardless of whether the row is a plain invoice or a refund-adjustment (which nests
   * an extra unstyled wrapper `<div>` around a Badge + this same element).
   */
  invoiceRowAmount(vendorName: string, invoiceNumber: string): Locator {
    return this.invoiceRow(vendorName, invoiceNumber)
      .locator('[class*="amount"]:not([class*="Column"])')
      .first();
  }

  /**
   * The chevron expand/collapse button for an allocated invoice row (Story #1891). Only
   * present when the invoice has budget lines and/or deposits — see class docstring.
   */
  invoiceExpandToggle(vendorName: string, invoiceNumber: string): Locator {
    return this.invoiceRow(vendorName, invoiceNumber).locator('[class*="expandButton"]');
  }

  /**
   * The expansion panel for an allocated invoice row — a DOM SIBLING of the row's own
   * `invoiceRow` div (both children of the same per-invoice wrapper), not a descendant, so
   * this is reached via a relative `following-sibling::` xpath rather than `.locator()`
   * descendant search. Only present in the DOM while `isExpanded` is true.
   */
  expansionPanel(vendorName: string, invoiceNumber: string): Locator {
    return this.invoiceRow(vendorName, invoiceNumber).locator(
      'xpath=following-sibling::*[contains(@class,"expansionPanel")]',
    );
  }

  /**
   * The items (budget lines) sub-table section — always the FIRST `class*="subTableSection"`
   * child of the expansion panel, whether it renders the real `<table>` or the `EmptyState`
   * fallback (`budgetLines.length === 0`). Structural indexing avoids depending on i18n
   * heading text.
   */
  itemsSubTable(vendorName: string, invoiceNumber: string): Locator {
    return this.expansionPanel(vendorName, invoiceNumber)
      .locator('[class*="subTableSection"]')
      .nth(0);
  }

  /**
   * The deposits sub-table section — always the SECOND `class*="subTableSection"` child of
   * the expansion panel (see `itemsSubTable` docstring for the same structural-order
   * rationale).
   */
  depositsSubTable(vendorName: string, invoiceNumber: string): Locator {
    return this.expansionPanel(vendorName, invoiceNumber)
      .locator('[class*="subTableSection"]')
      .nth(1);
  }

  /**
   * A specific budget-line row within the items sub-table, matched by its description text
   * (or `t('sourceReports.expand.unnamedLine')` for an unnamed line).
   */
  itemRow(vendorName: string, invoiceNumber: string, lineDescription: string): Locator {
    return this.itemsSubTable(vendorName, invoiceNumber)
      .locator('tbody tr')
      .filter({ hasText: lineDescription });
  }

  /**
   * The "Include" checkbox for a specific budget line, matched by its
   * `aria-label="Exclude {name} from report"` (`sourceReports.expand.excludeItemAriaLabel`).
   * Unchecking it excludes the line from the display/PDF amount (never from claim eligibility
   * — see class docstring).
   */
  itemExclusionCheckbox(
    vendorName: string,
    invoiceNumber: string,
    lineDescription: string,
  ): Locator {
    return this.itemsSubTable(vendorName, invoiceNumber).getByRole('checkbox', {
      name: `Exclude ${lineDescription} from report`,
    });
  }

  /**
   * A specific deposit row within the deposits sub-table, matched by its formatted amount
   * text (e.g. from `useFormatters().formatCurrency`).
   */
  depositRow(vendorName: string, invoiceNumber: string, formattedAmount: string): Locator {
    return this.depositsSubTable(vendorName, invoiceNumber)
      .locator('tbody tr')
      .filter({ hasText: formattedAmount });
  }

  async toggleSelectAll(): Promise<void> {
    await this.selectAllCheckbox.click();
  }

  async expandUnallocatedGroup(): Promise<void> {
    await this.unallocatedGroupToggle.click();
  }

  // ─── Cross-step navigation ───────────────────────────────────────────────

  /**
   * Clicks a reachable step's circle in the desktop stepper (1-indexed). Only valid for
   * `stepNum <= maxReachedStep` — steps beyond that render a non-interactive `<div>`, not a
   * button, and this locator will fail to find a clickable element (by design — see
   * `isStepInteractive`).
   */
  async goToStep(stepNum: number): Promise<void> {
    await this.stepItems
      .nth(stepNum - 1)
      .locator('[class*="stepButton"]:not([class*="Disabled"])')
      .click();
  }

  /** True if the desktop stepper renders step `stepNum` as an actual `<button>` (reachable). */
  async isStepInteractive(stepNum: number): Promise<boolean> {
    const item = this.stepItems.nth(stepNum - 1);
    return (await item.locator('button').count()) > 0;
  }

  async goNextFromStep1(): Promise<void> {
    await this.step1NextButton.click();
  }

  async goNextFromStep2(): Promise<void> {
    await this.step2NextButton.click();
  }

  async goNextFromStep3(): Promise<void> {
    await this.step3NextButton.click();
  }

  async goBack(): Promise<void> {
    await this.step2BackButton.click();
  }

  // ─── Step 4: Settings ────────────────────────────────────────────────────

  /**
   * The report-language radio input for a given language (`input[name="reportLanguage"]`,
   * literal `value="en"|"de"`). Unlike the step 1/2 radios, this one is a plain, NOT
   * visually-hidden input — no `force: true` needed to click it directly.
   */
  reportLanguageRadio(lang: 'en' | 'de'): Locator {
    return this.page.locator(`input[name="reportLanguage"][value="${lang}"]`);
  }

  async selectReportLanguage(lang: 'en' | 'de'): Promise<void> {
    await this.reportLanguageRadio(lang).click();
  }

  async toggleAttachDocuments(): Promise<void> {
    await this.attachDocumentsCheckbox.click();
  }

  async toggleCoverLetter(): Promise<void> {
    await this.includeCoverLetterCheckbox.click();
  }

  /**
   * Copy of all Content-Security-Policy violation console messages captured since this POM
   * was constructed (see `cspViolationMessages` field docstring). Exposed for tests that want
   * to assert on it directly rather than only through `openPdfPreviewModal`'s implicit check.
   */
  getCspViolations(): string[] {
    return [...this.cspViolationMessages];
  }

  /**
   * Fetches the report wizard page's own HTTP response and returns the CSP header's
   * `frame-src` directive as its space-separated source tokens (e.g. `["'self'", 'blob:']`).
   * Throws if the header or the directive is missing.
   *
   * This is a direct server-side contract check — it fails deterministically against a
   * pre-fix `frameSrc: ["'self'"]` `helmetPlugin.ts` config (no `blob:` token) and passes
   * deterministically once `blob:` is added, entirely independent of what a given browser
   * (headless or not) actually does when asked to navigate an `<iframe>` to a `blob:` PDF URL.
   * See `assertPreviewHardened`'s docstring for why this replaced the earlier
   * `page.frames()`-based navigation-matching technique.
   */
  async fetchCspFrameSrcDirective(): Promise<string[]> {
    const response = await this.page.request.get(REPORT_WIZARD_ROUTE);
    const cspHeader = response.headers()['content-security-policy'];
    if (!cspHeader) {
      throw new Error(
        `Expected a Content-Security-Policy response header on ${REPORT_WIZARD_ROUTE}, got none.`,
      );
    }
    const frameSrcMatch = cspHeader.match(/frame-src\s+([^;]+)/i);
    const frameSrcValue = frameSrcMatch?.[1];
    if (!frameSrcValue) {
      throw new Error(`Expected a frame-src directive in the CSP header, got: "${cspHeader}"`);
    }
    return frameSrcValue.trim().split(/\s+/);
  }

  /**
   * HARDENED proof that the report preview is genuinely permitted — Story #1891 AC, reworked
   * TWICE per two separate TEST_ENVIRONMENT-fix follow-ups (see below for why).
   *
   * ATTEMPT 1 (superseded): polling `page.frames()` for a browsing-context frame whose live
   * `url()` matched the iframe's `blob:` src attribute, treating a match as proof the
   * navigation actually completed (as opposed to being silently CSP-blocked while the DOM
   * `src` attribute still got set by React). That technique turned out to be UNVERIFIABLE in
   * this project's CI environment: Playwright's bundled headless Chromium shell has no
   * built-in PDF viewer plugin, so an `<iframe>` pointed at a PDF `blob:` URL aborts/blanks
   * WITHOUT ever completing a navigation or firing a CSP violation — `page.frames()` never
   * contains a matching frame REGARDLESS of whether the CSP frame-src directive is correct.
   * Confirmed via CI run 30530648400 (shard 2): even with a 10s poll, zero frame matches AND
   * zero CSP console violations, on a build where the `blob:` fix was already present.
   *
   * ATTEMPT 2 (superseded): replaced the frame-navigation check with an in-page
   * `fetch(blobSrc)` (inside `page.evaluate`) that read the blob's size/MIME type, reasoning
   * that a genuinely-resolvable non-empty PDF blob was proof enough on its own. That ALSO
   * turned out to be a dead end, for a different reason: the app's own CSP `connect-src` is
   * `'self'` and does not (and must not) include `blob:` — `fetch()`/`XHR` to a `blob:` URL is
   * itself a `connect-src`-governed request, so the in-page fetch was blocked by the exact
   * policy this test exists to verify. The application itself never fetches its own preview
   * blob (the browser resolves `<iframe src="blob:...">` internally, not via `fetch`), so
   * loosening `connect-src` to accommodate this test technique would weaken production CSP for
   * no product reason — rejected. Confirmed via CI run 30531695763 (shard 2): every scenario
   * failed in ~2s with `page.evaluate: TypeError: Failed to fetch`.
   *
   * CURRENT APPROACH — two independent, headless-safe signals, both of which must pass here,
   * plus the plain src-attribute check callers already do before calling this method:
   *  1. Direct CSP header assertion (`fetchCspFrameSrcDirective`) — the deterministic core. A
   *     server-side contract check that fails against a pre-fix `frameSrc: ["'self'"]` config
   *     and passes against the fixed `["'self'", 'blob:']` config, regardless of browser
   *     behavior.
   *  2. Zero CSP-violation console messages (`cspViolationMessages`) — defense in depth for
   *     real (non-headless-shell) browsers, where a frame-src block always also logs a console
   *     error synchronously with the blocked navigation.
   *
   * See the e2e-test-engineer agent memory (`general-e2e-patterns.md`) for the investigation
   * record of both superseded attempts, and the connect-src pitfall specifically, so a future
   * refactor doesn't re-add an in-page blob fetch.
   */
  private async assertPreviewHardened(): Promise<void> {
    const frameSrcValues = await this.fetchCspFrameSrcDirective();
    if (!frameSrcValues.includes("'self'") || !frameSrcValues.includes('blob:')) {
      throw new Error(
        "Expected CSP frame-src directive to include both 'self' and blob:, got: " +
          `[${frameSrcValues.join(', ')}]`,
      );
    }

    if (this.cspViolationMessages.length > 0) {
      throw new Error(
        `Detected ${this.cspViolationMessages.length} Content-Security-Policy violation ` +
          `console message(s) while loading the report preview: ` +
          `${this.cspViolationMessages.join('; ')}`,
      );
    }
  }

  /**
   * Clicks "Preview PDF" (Step5Actions, the leftmost step-5 action button —
   * `sourceReports.editable.previewPdf`) and waits for the on-demand PDF Modal to open and
   * settle: the modal becomes visible, its loading overlay clears (best-effort — a fast,
   * attachment-less generation can complete before the transient spinner ever has an
   * observable "visible" window, same lesson as elsewhere in this suite — harmless if it never
   * appears), the iframe is visible with a non-empty `blob:` src, AND (Story #1891 hardening,
   * unaffected by this story) that src is proven safe via `assertPreviewHardened`. Story #1900
   * replaced the old
   * always-present, auto-regenerating step-5 iframe with this on-demand flow — every call
   * genuinely (re)generates the PDF from the CURRENT effective content (including any
   * unsaved field edits), there is no debounce/memoization to wait out. PDF generation
   * (pdfmake + pdf-lib, both loaded via dynamic `import()`) can be slow, especially on the
   * first call of a test (cold chunk load) — callers should pair this with `test.slow()` and
   * rely on Playwright's default generous `expect()` timeout rather than a short custom one.
   */
  async openPdfPreviewModal(): Promise<void> {
    await this.previewPdfButton.click();
    await this.pdfPreviewModal.waitFor({ state: 'visible' });
    await this.pdfPreviewModalLoadingOverlay.waitFor({ state: 'hidden' }).catch(() => {});
    await this.pdfPreviewModalIframe.waitFor({ state: 'visible' });
    const src = await this.pdfPreviewModalIframe.getAttribute('src');
    if (!src || !src.startsWith('blob:')) {
      throw new Error(`Expected PDF preview modal iframe src to be a blob: URL, got "${src}"`);
    }
    await this.assertPreviewHardened();
  }

  /**
   * Closes the PDF preview modal via its built-in header × close button (shared `Modal`
   * component — `ReportWizardPage.tsx` passes no `footer` for this instance) and waits for it
   * to unmount. `onClose` synchronously revokes the modal's blob URL and clears
   * `actionError`/`modalPreviewUrl` — always close the modal before triggering another
   * modal-opening action (e.g. Mark Claimed), since its backdrop otherwise intercepts clicks
   * intended for the page underneath.
   */
  async closePdfPreviewModal(): Promise<void> {
    await this.pdfPreviewModalCloseButton.click();
    await this.pdfPreviewModal.waitFor({ state: 'hidden' });
  }

  /** Current PDF preview modal iframe `blob:` src — only meaningful while the modal is open. */
  async getPreviewSrc(): Promise<string> {
    return (await this.pdfPreviewModalIframe.getAttribute('src')) ?? '';
  }

  // ─── Story #1900: editable report content (ReportContentEditor.tsx) ────────────────────────

  private static readonly LETTER_FIELD_LABELS = {
    sender: 'Sender',
    recipient: 'Recipient',
    reference: 'Reference',
    subject: 'Subject',
    body: 'Body',
  } as const;

  /**
   * A cover-letter `EditableField` by its VISIBLE label (`sourceReports.editable.*Label`) —
   * scoped to `coverLetterCard` so this can never collide with an unrelated "Reference" label
   * elsewhere on the page. `recipient`/`reference` are only present in the DOM when their
   * underlying value is non-null (see class docstring) — callers must confirm the field exists
   * for the scenario's seed data before using it.
   *
   * `{ exact: true }` is REQUIRED here (fixed — shard-2 CI regression, e.g. run 30632348922):
   * each field's `resetButton` — mounted only once that field `isEdited` — has an
   * `aria-label="Reset {{field}} to generated text"` (`resetFieldAriaLabel`), which CONTAINS
   * the field's own label text as a substring (e.g. "Reset Subject to generated text" contains
   * "Subject"). `getByLabel()`'s default non-exact matching therefore strict-mode-collides the
   * input with its own reset button the moment a test edits the field and then re-resolves this
   * SAME locator (e.g. `expect(subject).toHaveValue(...)` after `editField(subject, ...)`) —
   * deterministic, not flaky, and previously caught EVERY cover-letter scenario that edits a
   * field before re-querying it (Scenario 3, 4, 15). `exact: true` matches only the full
   * accessible name ("Subject"), never the longer reset-button string.
   */
  letterField(key: keyof typeof ReportWizardPage.LETTER_FIELD_LABELS): Locator {
    return this.coverLetterCard.getByLabel(ReportWizardPage.LETTER_FIELD_LABELS[key], {
      exact: true,
    });
  }

  /**
   * A specific row of the editable content table, matched by vendor name AND invoice number
   * (mirrors `invoiceRow`'s disambiguation rationale on the step-3 `ReportInvoiceList` grid —
   * this is a SEPARATE DOM tree, `ReportContentEditor.tsx`'s own `<table>`, not the step-3
   * one).
   */
  contentTableRow(vendorName: string, invoiceNumber: string): Locator {
    return this.contentTable
      .locator('tbody tr')
      .filter({ hasText: vendorName })
      .filter({ hasText: invoiceNumber });
  }

  /**
   * The dense (unlabelled) `usageText` `EditableField` for a table row — accessible name
   * `Usage text for {{vendor}}, {{invoiceNumber}}` (`sourceReports.editable.usageTextAriaLabel`).
   * Playwright's default (non-`exact`) role-name matching is a substring match, so this still
   * resolves once the field becomes edited and its accessible name gains the
   * `sourceReports.editable.editedSuffix` (" (edited)") tail.
   */
  usageField(vendorName: string, invoiceNumber: string): Locator {
    return this.contentTableRow(vendorName, invoiceNumber).getByRole('textbox', {
      name: `Usage text for ${vendorName}, ${invoiceNumber}`,
    });
  }

  /**
   * The `attachmentsNote` `EditableField` for a table row — only present when
   * `row.attachmentsNote !== null` (i.e. the invoice has linked documents). Same
   * substring-name-matching note as `usageField`.
   */
  attachmentsNoteField(vendorName: string, invoiceNumber: string): Locator {
    return this.contentTableRow(vendorName, invoiceNumber).getByRole('textbox', {
      name: `Attachments note for ${vendorName}, ${invoiceNumber}`,
    });
  }

  /**
   * A single mobile-card row within `mobileCardList` (fixed #1904) — a DIRECT CHILD
   * (`>` combinator) so this never also matches a nested `[class*="mobileCardRow"]`
   * label/value pair, which shares the "mobileCard" class substring. Matched by vendor name
   * AND invoice number, mirroring `contentTableRow`'s disambiguation rationale — this is a
   * SEPARATE, always-in-DOM tree from the desktop `<table>`, not merely a hidden duplicate of
   * the same elements (see class docstring's "Fixed (#1904)" paragraph).
   */
  mobileCard(vendorName: string, invoiceNumber: string): Locator {
    return this.mobileCardList
      .locator('> [class*="mobileCard"]')
      .filter({ hasText: vendorName })
      .filter({ hasText: invoiceNumber });
  }

  /**
   * The mobile card's own `usageText` `EditableField` — as of Round 3, this DIVERGES from the
   * desktop table's dense/unlabelled `usageField()`: the mobile-card copy now gets a real,
   * visible `label={t('sourceReports.table.usage')}` prop ("Usage"), so `EditableField.tsx`
   * renders an actual `<label htmlFor>` and — per its `effectiveAriaLabel` branch — suppresses
   * `aria-label` entirely (the accessible name comes from the associated `<label>` instead, not
   * from the vendor/invoiceNumber-specific `ariaLabel` string still passed as a prop but no
   * longer used for naming while `label` is set). The accessible name is therefore just
   * "Usage" — identical across every mobile card — so disambiguation between rows relies
   * entirely on scoping via `mobileCard()` first (never query this role/name page-wide). This
   * MUST stay scoped to a specific `mobileCard()`, both to disambiguate from other rows and to
   * avoid strict-mode-colliding with the desktop table's differently-scoped copy (both trees
   * are always in the DOM simultaneously).
   */
  mobileUsageField(vendorName: string, invoiceNumber: string): Locator {
    return this.mobileCard(vendorName, invoiceNumber).getByLabel('Usage', { exact: true });
  }

  // ─── Story #1923: report table cleanup ───────────────────────────────────────────────────

  /**
   * The inline "Deposit" `Badge` (`[class*="depositBadge"]`, composed from the shared
   * `.attachmentDeposit` variant) rendered in a desktop content-table row's Allocated Amount
   * cell when `row.isDeposit` — a constituted-deposit row (AC2.1), i.e. the row's allocation is
   * made up entirely by a deposit tagged to the CURRENTLY reported source. Carries NO `†`/`‡`
   * marker of its own. Scoped to the row so it never collides with `mobileDepositBadge`'s copy
   * (both trees share the `depositBadge` class and are always in the DOM simultaneously, per
   * the class docstring's dual-DOM-tree convention).
   */
  depositBadge(vendorName: string, invoiceNumber: string): Locator {
    return this.contentTableRow(vendorName, invoiceNumber).locator('[class*="depositBadge"]');
  }

  /** The same inline "Deposit" badge within a mobile card's Allocated Amount value (AC6.2). */
  mobileDepositBadge(vendorName: string, invoiceNumber: string): Locator {
    return this.mobileCard(vendorName, invoiceNumber).locator('[class*="depositBadge"]');
  }

  /**
   * The read-only, non-editable leaf-area sub-line (`[class*="usageAreaText"]`) rendered below
   * a desktop row's `usageText` field when `row.areaText` is non-null (AC5.2) — distinct
   * comma-joined leaf area names, never concatenated into the editable `usageText` string
   * itself (AC5.3), so it survives both manual edits and AI-generated usage text overwriting
   * `usageText` (`applyAiContent.ts` only ever assigns `row.usageText`, never `row.areaText`).
   * Absent entirely (not an empty element) when the row has no area (AC5.4).
   */
  usageAreaText(vendorName: string, invoiceNumber: string): Locator {
    return this.contentTableRow(vendorName, invoiceNumber).locator('[class*="usageAreaText"]');
  }

  /** The same area sub-line within a mobile card's Usage field (AC6.2). */
  mobileUsageAreaText(vendorName: string, invoiceNumber: string): Locator {
    return this.mobileCard(vendorName, invoiceNumber).locator('[class*="usageAreaText"]');
  }

  /** Fills an `EditableField` (input or textarea) with `value`, firing its `onChange`. */
  async editField(field: Locator, value: string): Promise<void> {
    await field.fill(value);
  }

  /**
   * Whether `field`'s edited-dot indicator (`[class*="editedDot"]`) is currently in the DOM.
   * `EditableField.tsx` CONDITIONALLY MOUNTS the dot only while `isEdited` is true (not merely
   * opacity-toggled) — it's a DOM SIBLING of `field` within the same `[class*="fieldWrapper"]`
   * container, reached by walking up one level then searching descendants.
   */
  async hasEditedIndicator(field: Locator): Promise<boolean> {
    return (await field.locator('xpath=..').locator('[class*="editedDot"]').count()) > 0;
  }

  /**
   * `field`'s per-field reset button (`[class*="resetButton"]`), which reverts that one field
   * to its generated baseline value. The button is a DOM SIBLING of `field`'s
   * `[class*="fieldWrapper"]` — one level further up than the edited dot (see
   * `EditableField.tsx`'s `container > [label?, fieldWrapper, resetButton?]` structure) — and,
   * like the dot, only mounted while `field` `isEdited`. Exposed separately from `resetField`
   * (which just clicks it) so callers that need the locator itself — e.g. to measure its touch
   * target size — don't have to duplicate the DOM traversal.
   */
  resetButtonFor(field: Locator): Locator {
    return field.locator('xpath=../..').locator('[class*="resetButton"]');
  }

  /** Clicks `field`'s reset button — see `resetButtonFor`'s docstring for the DOM traversal. */
  async resetField(field: Locator): Promise<void> {
    await this.resetButtonFor(field).click();
  }

  // ─── Story #1900: discard-edits confirmation modal ──────────────────────────────────────────

  /** "Discard and Continue" — clears all overrides then applies the originally-attempted change. */
  async confirmDiscard(): Promise<void> {
    await this.discardConfirmDiscardButton.click();
    await this.discardConfirmModal.waitFor({ state: 'hidden' });
  }

  /** "Keep Editing" — closes the modal without discarding anything or applying the change. */
  async cancelDiscard(): Promise<void> {
    await this.discardConfirmKeepEditingButton.click();
    await this.discardConfirmModal.waitFor({ state: 'hidden' });
  }

  // ─── Story #1901: AI generation ──────────────────────────────────────────────────────────

  /**
   * Clicks "Enhance with AI" and returns immediately (does NOT wait for the call to settle) —
   * callers that mock a delayed response use this to observe the pending state
   * (`aiGeneratingCaption`/disabled button) before resolving the mock, and callers expecting the
   * overwrite-confirm modal use this to trigger it without racing a generation that never starts.
   */
  async clickGenerateWithAi(): Promise<void> {
    await this.generateWithAiButton.click();
  }

  /** "Overwrite and Generate" — closes the AI overwrite modal and runs the generation. */
  async confirmAiOverwrite(): Promise<void> {
    await this.aiOverwriteAndGenerateButton.click();
    await this.aiOverwriteConfirmModal.waitFor({ state: 'hidden' });
  }

  /** "Keep Editing" — closes the AI overwrite modal WITHOUT ever calling generate-content. */
  async cancelAiOverwrite(): Promise<void> {
    await this.aiOverwriteKeepEditingButton.click();
    await this.aiOverwriteConfirmModal.waitFor({ state: 'hidden' });
  }

  // ─── Step 5: actions ─────────────────────────────────────────────────────────────────────────

  /**
   * Clicks Download PDF and waits for the browser download event. Generation is on-demand
   * (Story #1900) — after the download resolves, also waits for the button's own busy/disabled
   * state to clear (`Step5Actions.tsx`'s `activeAction !== null` gate, cleared unconditionally
   * once `handleDownload` settles) so callers can safely chain a further action immediately
   * afterward without racing the still-in-flight React state update.
   */
  async download(): Promise<Download> {
    const [download] = await Promise.all([
      this.page.waitForEvent('download'),
      this.downloadButton.click(),
    ]);
    await expect(this.downloadButton).toBeEnabled();
    return download;
  }

  async clickMarkClaimed(): Promise<void> {
    await this.markClaimedButton.click();
    await this.claimConfirmModal.waitFor({ state: 'visible' });
  }

  async confirmClaim(): Promise<void> {
    await this.claimConfirmConfirmButton.click();
  }

  async cancelClaimConfirm(): Promise<void> {
    await this.claimConfirmCancelButton.click();
    await this.claimConfirmModal.waitFor({ state: 'hidden' });
  }

  async clickFinishWithoutMarking(): Promise<void> {
    await this.finishWithoutMarkingButton.click();
  }

  /**
   * Clicks Upload to Paperless and waits for its own on-demand generation + upload to fully
   * settle (busy state clears — same rationale as `download()`) before returning, so callers
   * can immediately assert the resulting toast/side effect without a race.
   */
  async clickUploadToPaperless(): Promise<void> {
    await this.uploadPaperlessButton.click();
    await expect(this.uploadPaperlessButton).toBeEnabled();
  }
}
