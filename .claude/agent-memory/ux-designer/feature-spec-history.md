---
name: feature-spec-history
description: Detailed notes from past visual specs posted to GitHub issues, in case a related story/PR references the same components again
metadata:
  type: project
---

## Issue #1900 — Bank Report Wizard Step 5: editable HTML preview before export

Replaces Step 5's live PDF iframe with editable HTML (cover letter fields + report table + footnotes) and makes PDF on-demand. Part of "Bank Report Wizard — Refinement Round 2" mini-epic.

- **New shared component spec'd**: `EditableField` (`client/src/components/EditableField/`), `as="input"|"textarea"` variant, wraps `shared.module.css` `.input`/`.textarea` base + adds at-rest tinted-background affordance (`--color-bg-tertiary`), hover (`--color-bg-secondary`), edited-dot + per-field reset button. Needed because no existing component covers "always-editable field with baseline-diff indicator" — see next point for why the obvious candidate was rejected.
- **Rejected `WorkItemDetailPage`'s click-to-edit pattern as reuse target** (`isEditingTitle`/`isEditingDescription`, `.inlineFieldWrapper`, `.autosaveIndicator`, `.clearDateButton` in `WorkItemDetailPage.module.css`): that's hidden-until-click + explicit Save/Cancel + direct API persist per field — a different paradigm from "always-visible input, ambient override, page-level discard-confirmation" needed here. Don't conflate the two when a future story mentions "inline editing" — check which paradigm actually applies first.
- **Read-only cells need no `aria-readonly`**: for a cell that must never be editable (amounts/totals here), the spec is simply "render plain text, no `<input>` at all" — no form control means no programmatic marking is needed; `aria-readonly` only has meaning on actual controls. Don't over-engineer read-only-ness onto a control that shouldn't exist in the first place.
- **Discard-edits confirmation precedent found**: `AutoItemizePage.tsx` already has this exact "you have unsaved edits, are you sure" Modal (`autoItemize.cancelConfirmTitle/cancelConfirmBody`, footer `btnPrimary` "Discard Changes" first + `btnSecondary` "Keep Editing" second). Mandated reuse of that exact button-order/label convention rather than the page's own amber `.warningBlock` (that's reserved for an informational sub-note inside a larger confirm, e.g. the claim-modal's excluded-items notice on this same page — not the primary discard-confirm dialog itself).

## Issue #1901 — Bank Report Wizard: AI-generated usage descriptions and cover letter

Adds an opt-in "Enable AI assistance" toggle (Step 4) + "Generate with AI" batched-call action (Step 5) that fills #1900's `EditableField`s as a new baseline. Same mini-epic as #1900.

- **"Mutates content" vs. "consumes content" is the placement litmus test** for a new Step-5 action: `Step5Actions.tsx` is exclusively export/finalize actions (Preview/Download/Claim/Paperless) that read `effectiveContent` — they never write to it. "Generate with AI" writes to the editable baseline (same category as Step 1–4's `guardedUpdate` mutations), so it was specified as a standalone row above `ReportContentEditor`, not folded into `Step5Actions`. Apply this same test to any future Step-5 action proposal.
- **LLM-availability gating: absent entirely, not disabled-with-tooltip** — confirmed again (matches the `photo-annotator`/autoItemize precedent of never showing a dead-end affordance for an unconfigured integration). Source the "is LLM configured" flag by extending `GET /api/config` rather than adding a parallel endpoint.
- **AI-filled content becomes the baseline, not an override**: post-generation, `EditableField.isEdited` must read `false` for AI-filled fields (no edited-dot) until the user actually edits — "reset" then returns to AI text, not pre-AI derived text. This is a data-model implication (`buildReportContent`'s derived baseline vs. `ReportContentOverrides`), flagged explicitly as an open item for dev-team-lead/backend to resolve — not fully a UX call once it touches how `applyOverrides`/`overrideKey` are structured.
- **Provenance indicator: one small note under the step heading, not per-field AI badges.** Per-field badges on every usage-text cell would clash with the existing status Badge column and lose meaning the instant a field is edited (does the badge disappear?). A single `.optionHelper`-styled note ("this content was AI-generated") after a successful run is enough; it doesn't need to survive per-field edit tracking or appear in exports (no persistence per the issue's scope).
- **Elapsed-seconds spinner pattern for an _inline_ action (not full-page)**: `AutoItemizePage`'s `Spinner size="lg"` + caption is for full-page blocking loads. For an inline button-triggered generation, scale down to `Spinner size="sm" color="muted"` inline in the button (same as `Step5Actions`'s existing per-button spinners) plus a separate `aria-live="polite"` caption span next to it — don't reuse `size="lg"` for anything that isn't a full-page takeover.
- **Error surfacing for an LLM action inside an existing editable page: inline `FormError`, not toast.** Toasts (`showToast`) are for transient success/failure notices on terminal actions (e.g. Paperless upload). A retryable, in-place, actionable failure (like `claimError` in `Step5Actions`) gets an inline `FormError`/`formErrorBanner` near the triggering button instead.
- **Wide-Modal precedent**: `shared.module.css`'s `.modalContent` comment explicitly documents "use a local override to adjust max-width per dialog type" — this is the sanctioned way to get a wide PDF-preview Modal; no dedicated "large modal" component/prop exists and none is needed.
- **Table/mobile-card breakpoint**: reused `ReportInvoiceList`'s existing `max-width: 767px` split verbatim rather than the page's own ad hoc `860px` breakpoint (`.step4Layout` collapse) — the two breakpoints coexist in this file for different purposes (860px = two-column layout collapse, 767px = table→cards), don't conflate them.
- Full field inventory for the cover letter (from `coverLetterPdf.ts`): sender (household name+address), recipient (`source.contactAddress`), reference (`source.reference`, optional), subject (per-use-case string), body (per-use-case template with `{{total}}`). A signature block also exists in the generated PDF (echoes household name a second time) but isn't in the issue's "settled decisions" list of 5 editable fields — spec'd it as derived-display-only (mirrors Sender), flagged as an open question rather than deciding unilaterally.

## Issue #1876 — Deposit Refunds with Negative Claim Adjustments

`InvoiceDepositsSection` gains an entry-type choice (Deposit/Refund); refunds render as negative rows reusing the exact same status Badge/labels (Pending/Paid/Claimed) — no relabeling, per explicit user decision.

- **Entry-type radio group**: no segmented-control component exists in the codebase — reused the plain `<input type="radio">` + `role="group"` pattern from `AutoItemizePage.module.css` `.modeSelector` (mode: append/replace) verbatim instead of inventing a new control. This is the only other radio group in the app; treat it as the canonical pattern for any future "choose one of N" form field that isn't a `<select>`.
- **Negative amount color**: `var(--color-danger-text-on-light)` (light=red-700, dark=red-300) — same alias already used by `--color-status-blocked-text`/`--color-user-inactive-text`/`--color-diary-issue-text`, so reusing it for a plain negative-amount `<span>` (not inside a badge) carries no new contrast risk.
- **Refund type tag**: new `Badge` variant `refund` added to `Badge.module.css`, reusing `--color-status-blocked-bg`/`-text` (the existing red badge pair) rather than inventing new `--color-danger-badge-*` tokens (those don't exist — only success/warning have a `-badge-bg` alias family).
- **Sign not by color alone**: satisfied via two channels — the Badge's literal "Refund" text label, plus `formatCurrency(-amount)` producing a literal minus-sign string (Intl.NumberFormat handles negative currency natively, no manual sign formatting needed).
- **"Effective amount" displays** (invoice list `remainingAmount` column, detail `finalPaymentAmount` row): these are pre-existing slots whose value becomes refund-aware server-side — deliberately did NOT recolor them red/danger, since they're a computed remainder, not a refund row itself; recoloring would falsely imply an error state. Left their existing token treatment untouched.
- **Scope boundary**: raw `invoice.amount` in the Invoice Details card is the gross contracted total and stays out of scope — only displays literally labeled "remaining amount" become net-of-refunds per the AC wording.
- Flagged a real pre-existing a11y gap while reading `InvoiceDepositsSection.tsx`: `OverflowMenu triggerAriaLabel` falls back to the hardcoded string `'deposit'` (`deposit.description ?? 'deposit'`) — needs to become entry-type-aware once refunds exist, or a refund row's menu announces "deposit" to screen readers.

## Story #1736 — Invoice Vendor Change

- Vendor picker in invoice edit modal: `SearchPicker<Vendor>` with `showItemsOnFocus`, `initialTitle={editForm.vendorName}`, `id="edit-vendor"` for label association
- `searchFn`: `fetchVendors({ q: query, pageSize: 50 })` returning `res.vendors`
- `InvoiceFormState` extension: `vendorId: string` + `vendorName: string`; `openEditModal` pre-fills both
- Field position: NEW full-width `.field` between "Invoice Number/Amount" row and "Invoice Date/Due Date" row; required, `FormError variant="field"` below picker
- API 404 on vendor change: surface via existing `editError` banner path, key `invoiceDetail.messages.vendorNotFound`
- Reference implementation: `DiaryEntryForm` daily_log branch (lines 354–373)

## Story #1551 — Discretionary Funding + Auto-origin badge

- AutoItemizePage already has a per-line "Funding Source" `<select>` that pre-fills to discretionary — recommended informational note above `.lineList`, not a column
- Note style: `--color-primary-bg` bg, `--color-border` border, `3px solid --color-primary` left border, `--radius-md`
- New `.autoOrigin` Badge variant (blue-tinted `--color-primary-bg`/`--color-primary-badge-text`) distinct from `.info` (gray) — separates "data origin" semantic from "assignment label" semantic
- `BreakdownBudgetLine` shared type needs `origin: 'manual' | 'auto'`; `getSourceBadgeStyleKey(null)` → `'sourceUnassigned'`, `getSourceColorIndex(null)` → `0`

## DiaryEntryForm Patterns (Story #1672)

- `daily_log` metadata section: `.metadataSection` with `--color-bg-secondary` bg, `--color-border` border, `--radius-md`, `--spacing-4` padding
- `.formRow` auto-fit grid is wrong for time pickers — use explicit `.formRowTwoCol` (`1fr 1fr`) so columns never wrap on tablet
- Vendor selector: `SearchPicker` + `showItemsOnFocus`; time inputs: native `<input type="time" step="60">`; cross-field validation error goes below the row, single `validationErrors.dailyLogWorkTime` key
- Duration display: `role="status" aria-atomic="true"` (no separate `aria-live`), computed client-side
- `DailyLogMetadata` type needs `vendorId?`, `vendorName?`, `workStart?`, `workEnd?`
- Watch for i18n key collision: `form.vendor` already used by delivery entry type — use `form.dailyLogVendor` if label differs

## Story #1679 — Paperless-first Invoice Creation

- Picker modal: `max-width: min(900px, calc(100vw - 2rem))`, mobile full-screen with `border-radius: 0`
- Correspondent filter: `SearchPicker` in the wrapper component, NOT inside `DocumentBrowser`
- `DocumentBrowser` new props: `defaultHideLinked?`, `onOpenInPaperless?`, `paperlessUrl?`
- "Open in Paperless" per-card link: `opacity: 0` → `1` on hover/focus-within, always opaque on mobile, wrapped in `prefers-reduced-motion: no-preference`
- LLM vendor suggestion reuses existing `SuggestionBadge` (not a new Badge variant)
- New wrapper component `InvoicePaperlessPickerModal` at `client/src/components/invoices/` — justified (invoice-creation-specific chrome + reusable)
- URL pattern: `{paperlessUrl}/documents/{document.id}/details`

## Story #1723 — AreaPicker Hierarchy Display

- Dropped em-dash indentation in favor of ancestor-path secondary line (see [component-patterns.md](component-patterns.md))
- `AreaResponse` has NO `ancestors` field — computed client-side via `parentId` traversal (`getAncestorPath` helper in `areaTreeUtils.ts`)
- WCAG AA contrast verified: `--color-text-muted` on `--color-bg-primary`: 4.6:1 light, 5.0:1 dark, 4.5:1 hover (boundary) — all pass
- Core bug driving the story: `PhotoMetadataSidepanel` used a raw `SearchPicker<AreaResponse>` instead of `AreaPicker`

## Story #1553 — Full Edit for Budget Lines (PR #1554)

- `BudgetLineForm` parent-picker extends to the edit path: collapsed "Linked item" row + "Change" button when `currentParentId` is set
- Modal width: `min(540px, calc(100vw - 2rem))`
- New i18n keys (namespace `budget`): `linkedItemLegend`, `changeParentButton`, `cancelChangeParentButton`, `moveButton`, `movingButton`, `moveCrossTableHint`, `moveCrossTableHintReverse`
- `parentPickerTab`/`modeBtn` missing `:focus-visible` (pre-existing gap, WCAG 2.4.7 Medium)

## Story 4.9 — Invoice Linking for HI Budget Lines (Issue #413)

See `story-4-9-invoice-linking-hi.md`. Entity type toggle (`role="group"` + `role="radio"`), "Linked To" column hidden at tablet.

## Story #1545 — Unassigned IBL + One-Shot Parent Assignment (PR #1548)

- IBL table `tdLinkedItem` cell: `display:flex; align-items:center; gap:var(--spacing-2)` wrapper
- Parent picker section in BudgetLineForm: inset panel with `--color-bg-tertiary` bg
- Modal width for edit with picker visible: `min(640px, calc(100vw - 2rem))`
- Focus auto-advance: use `requestAnimationFrame` (not `setTimeout`) for React 19 concurrent rendering

## Issue #1891 — Bank Report Wizard follow-up (status chip, expandable rows, deposit source)

- **Grid-item stretch bug pattern**: a `Badge` (or any `display:inline-flex` element) placed as a **direct CSS Grid item** still stretches to fill its column under default `justify-items: stretch` — `inline-flex` on the element itself does NOT prevent this; only `justify-self: start` on the grid item does. Native `<table>`/`<td>` layouts (e.g. `DataTable`) never have this problem, which is why `InvoicesPage`'s identical `Badge` usage looked fine while `ReportInvoiceList`'s (a CSS Grid row) stretched. Check for this specific failure mode whenever a `Badge`/pill sits directly inside a `grid-template-columns` row rather than a `<td>` or flex child.
- Root cause in `ReportInvoiceList.module.css`: `grid-template-columns: auto 1fr auto auto auto` (5 tracks) but the checkbox+vendor content was merged into ONE `<label>` grid item, so it silently consumed only the first `auto` track and the `Badge` fell into the `1fr` track meant for vendor content. Fix: `grid-column: span 2` on the merged label + `justify-self: start` on the badge — restores correct column-to-content mapping AND prevents stretch.
- **Tri-state checkbox design call**: when a parent-invoice checkbox needs to reflect item-level exclusions (some-but-not-all budget lines within an included invoice excluded), use `TriStateCheckbox` with `indeterminate` = "included but reduced by item exclusions" — but keep the click handler wired to the SAME whole-invoice include/exclude toggle as before. Never give indeterminate state its own new click semantics — that would blur "claiming stays invoice-level" into looking like partial-claim UI.
- Deposit/refund **entry type** as an explicit table column (not just implied by badge omission): unlike `InvoiceDepositsSection`'s convention (only refund gets a badge, deposit is unmarked), when an AC explicitly lists "entry type" as a required displayed field, give BOTH values a visible `Badge` (`Deposit` → `BadgeStyles.info`, `Refund` → local `.refund` class) rather than relying on the omission-implies-deposit shortcut.
- `MassMoveModal.tsx`/`.module.css` (`.warningBlock`/`.warningIconContainer`/`.warningIcon`, amber triangle SVG, `role="alert"`) is the richer icon+heading+body warning pattern — prefer it over `InvoiceDepositsSection`'s plain-text `.warningBanner` when the warning is about a consequential/irreversible action. Both are currently component-scoped duplicates of the same CSS; flagged as a future `shared.module.css` promotion candidate, not yet blocking.
- `SelectionActionBar`'s count `<span>` has no `aria-live` — pre-existing gap, worth fixing opportunistically (shared component) whenever a story adds more granular controls that drive its total.
- Deposit status badges can reuse the SAME `.pending`/`.paid`/`.claimed` classes already defined for invoice-status badges within the SAME file, when the value domains match — check for existing same-file classes before adding new ones or reaching for another file's copy.

## Issue #1898 — Bank Report PDF: Usage column, attachment notes, deposit footnote (pdfmake, not CSS)

First spec written for `client/src/lib/reportPdf/overviewPdf.ts` — a `pdfmake` content tree, not a React component. No tokens.css, no dark mode, no Component Reuse Audit apply here; state that explicitly in the spec so reviewers don't look for it.

- **PDF style inventory** (`merge.ts`): `defaultStyle` fontSize 11/lineHeight 1.4; `tableHeader` 10pt bold white-on-`#1f2937`; `tableCell` 10pt; `small` 9pt `#6b7280` (the one reusable "muted text" token — used for footnotes, source-info stack, header/footer timestamps; reuse it verbatim for any new secondary/subordinate PDF text rather than inventing a new style). `REFUND_TEXT_COLOR = #991b1b` in `shared.ts`. No `italics: true` anywhere in this file — don't introduce it as a first here.
- `#6b7280` on white paper ≈ 4.83:1 contrast — passes WCAG AA 4.5:1 for the 9pt `small` style (below the large-text exemption threshold). Worth recomputing/citing this whenever adding new muted-text PDF content, since pdfmake output isn't covered by the app's normal stylelint/token contrast tooling.
- Two-family footnote marker precedent already existed (`*N` skip-doc, `†N` split) before this story added a third (`‡N` deposit) — pattern for adding an Nth footnote family: own independent counter per family, append as a new block in the flat footnote list (no headers), and add top-margin only at each new family's _first_ entry (not between same-family entries) once 2+ glyph systems coexist.
- Caught and corrected a column-count assumption in the requesting brief ("overview: 6 cols" was off by one — recomputed to 7 once Usage is added on top of the existing 6 base columns, appendix having been conditional/extra, not one of the 6). Always recompute column-set arithmetic myself rather than trusting a parent-agent's inline count — it's exactly the kind of thing a visual spec exists to pin down precisely.
- Flagged (not fixed — out of scope for a visual spec) a structural risk: `overviewPdf.ts`'s subtotal/total rows hardcode the bold-label cell to a fixed column index. Recommended an index-agnostic rule instead: label always sits immediately left of Invoice Amount, everything else (including new trailing columns) empty — avoids per-report-type branching bugs as columns become conditional.
- Width strategy for a 2nd prose column: don't split remaining `'*'` space evenly with the existing prose column (Vendor) — weight the new, more content-heavy column higher via pdfmake's `'2*'` syntax (Vendor `'*'`, Usage `'2*'`, all `auto` columns unchanged).

**Correction (PR #1902, reviewed and approved)**: pdfmake **0.3.11 does not support weighted-star width syntax at all** — `'2*'` isn't parsed as "2 shares," it crashes the real (unmocked) renderer with `unsupported number: NaN` (`@types/pdfmake`'s `Size` type is only `number | 'auto' | '*' | percentage-string` — no weighted-star). QA/dev caught this via `pdfMake.createPdf().getBlob()` real-render tests, which mocked-only tests can't catch. **Never spec `'N*'` weighted-star widths for this pdfmake version again** — for a 2nd flexible/prose column, either (a) accept an equal `'*'`/`'*'` split (what shipped, and what I approved — still strictly better than the pre-story 100%-to-one-column state, and safe across locales), or (b) if genuine 1:N weighting is required, it needs a fixed-point-number width (pdfmake supports plain numbers, e.g. `120`) computed against a known page width, not a percentage (percentages risk overflow against the variable-width `auto` columns, especially since German status/date labels run wider than English — this file already has a prior width regression from exactly that cause, see the "German overview table column widths" test block in `realRender.test.ts`). Point of reference for future specs: `client/src/lib/reportPdf/shared.ts` (`TABLE_LAYOUT`) and `overviewPdf.ts`/`realRender.test.ts` are the pdfmake-specific width/layout precedent files now, not `tokens.css`.

## Story #1804 — Backup Scheduler Status (node-cron 4.5 adoption)

- Spec posted on issue #1804; implemented in PR #1834 (approved — see [pr-review-findings.md](pr-review-findings.md))
- Section card above `.toolbar`, `<dl>`/`<dt>`/`<dd>` status rows, new Badge `.success` variant, `Skeleton` + `sharedStyles.bannerError` for loading/error states
- Mobile: `.schedulerStatusRow` → `flex-direction: column` at `<768px`

## Issue #1899 — Bank Report Wizard: Settings step (5th step, report language)

Part of the Bank Report Wizard Refinement Round 2 mini-epic (follows #1898). Spec posted on the issue; not yet implemented.

- **Report language picker**: reused the `AutoItemizePage.module.css` `.modeSelector` radio-group pattern again (2nd confirmed use after #1876's deposit entry-type picker — now a firmly established precedent, not a one-off). Explicitly rejected a `<select>` even though `ProfilePage.tsx` already has a language `<select>` for the app-wide locale (3 options incl. "System") — for exactly 2 always-visible options inside a wizard step, a radio group is more scannable than a dropdown open/close interaction.
- **Language labels are literal untranslated strings** `"English"`/`"Deutsch"` (not `t()`-wrapped) — precedent is `ProfilePage.tsx:389-390`'s existing app-locale `<select>`, which does the same for the same reason (autonyms, not translated demonyms). Called this out explicitly in the spec so a PR reviewer doesn't flag it as a missed-i18n-key bug.
- **Focus ring decision**: deliberately did NOT add a custom `box-shadow: var(--shadow-focus)` ring to the new radio group — kept the native browser `:focus-visible` outline to stay consistent with the sibling `.optionCheckbox` controls in the very same step, which also rely on the native outline (no custom ring exists there today). Don't treat "every new control must get a custom focus ring" as an absolute rule — matching the immediate visual siblings can be the more consistent choice.
- **Found a real responsive risk while auditing `WizardStepper` for a 5th step**: the desktop `<nav>` stepper (`WizardStepper.module.css` `.stepper`) has no `overflow-x` handling and the mobile dot-view only activates at `max-width: 767px`. Going from 4→5 full-text-label steps pushes the natural row width past a typical ~700px tablet content area well before that 767px cutoff — an `768px`-vs-`767px` off-by-one boundary that was invisible at 4 steps but becomes real at 5. Fix specified: a `768px–1023px` tablet-range media query shrinking `.stepList` gap, `.connector` width, and `.label` font-size (not just relying on the existing mobile/desktop binary). **Any future story that adds another step to an existing `WizardStepper` instance should re-check this same boundary** — it's a per-step-count risk, not a one-time fix.
- Confirmed (via grep) `--breakpoint-*` tokens do not exist anywhere in `tokens.css` — see [token-reference.md](token-reference.md) for the permanent note; don't reference them in future specs.
