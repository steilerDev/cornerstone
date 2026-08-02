---
name: bank-report-wizard
description: Bank Report Wizard mini-epic — scope, story sequence, and the deposit-refund domain decisions made in story #1876 that later claim-report stories build on
metadata:
  type: project
---

# Bank Report Wizard (mini-epic)

**Why:** Homeowners must report claimed invoice amounts to the financing bank. Refunds mean a previously-claimed amount can go _negative_ in a later report, so the domain model had to support signed contributions before any report UI could be built.

**How to apply:** Story #1876 is the foundation — every downstream claim-report story consumes its aggregation semantics. Do not re-open those decisions when writing later stories; extend them.

## Story sequence

- **#1876 — Deposit refunds with negative claim adjustments.** Merged to `beta` via PR #1880 (2026-07-29). Landed first deliberately: riskiest, touches shared rollup logic, fully testable standalone. Spec ref: `bank-report-wizard-plan.md` §2a-0, §1, §6 item 1.
- **#1877 — Source contact fields, household sender setting & document attachment typing.** APPROVED by PO on PR #1883 (2026-07-29), all 9 ACs met. Spec ref: `bank-report-wizard-plan.md` §2a-0, §1, §6 item 2.
- **#1878 — Source report backend** (`getSourceReport`, `markInvoicesClaimed`). Merged. Contract in `shared/src/types/sourceReport.ts`.
- **#1879 — Wizard frontend, PDF pipeline & claim flow.** PR #1887 reviewed 2026-07-30 → CHANGES_REQUIRED, then **APPROVED** round 2 (see below).
- **#1891 — User-verification follow-up** (created 2026-07-30, `user-story`, board **Todo**, blocked-by #1879): `blob:` CSP fix for the preview, status-chip sizing, expandable step-3 invoice rows, and the deposit `budget_source_id` domain change. PR #1894 reviewed 2026-07-30 → CHANGES_REQUIRED (31/32, AC 4.6), then **APPROVED** round 2 at `74289586` (32/32). Decisions section below.
- **#1888 — stage-matched attachment indicator** (Backlog, deferred from #1879).
- **#1895 / #1896 / #1897 — claim close-out defects** from the product-architect audit of #1891's dual-rail deposit aggregation (PR #1894). All Backlog, created 2026-07-30. See §"Claim close-out defects" below.

## Refinement Round 2 (stories #1898–#1901, created 2026-07-31)

Source: user verification of the merged wizard; decomposed and approved via `/mini-epic` planning. No parent epic issue — standalone stories chained by blocked-by. All four board **Todo**. Chain: #1898 → #1899 → #1900 → #1901 (#1900 blocked-by both 1898+1899; #1901 blocked-by 1899+1900).

- **#1898 — Report table refinements.** Usage column (distinct `budgetLines[].linkedItem` names → fallback line `description` → `—`), attachments note from `documents[].attachmentType` (count + distinct types; untyped counted plainly), appendix-number column **deleted** (numbers had no in-document reference; append order unchanged), status column **dropped for `claim` + `proof-of-funds`, kept for `budget-overview`**, and a **deposit-specific footnote** distinct from the generic `†` split footnote.
- **#1899 — Settings step + report language.** Wizard goes to 5 steps: Report Type → Budget Source → Select Invoices → **Settings** → Preview & Export. New step 4 holds the en/de report-language picker (defaults to UI locale) plus the two relocated toggles. Report output (PDF text, dates, currency, cover letter, filename) fully renders in the selected language regardless of UI locale; wizard chrome stays in the UI locale.
- **#1900 — Editable HTML preview.** Step 5 becomes an HTML edit surface with **on-demand PDF** (no live PDF pane). Full cover letter — sender, recipient, reference, subject, body — all editable. Wording editable, **amounts/totals read-only** (derived). Edits are overrides on a generated baseline; a steps-1–4 change regenerates the baseline and clears edits behind a confirmation.
- **#1901 — AI generation** (Should Have). Explicit "Generate with AI" button gated by an "Enable AI assistance" toggle in step 4, only when `LLM_*` is configured. **One batched** server call → per-invoice usage descriptions + cover letter subject/body, in the selected report language. Fills the editable fields as a new baseline; regenerating warns before overwriting. Auto-itemize is the reference for plumbing + spinner/elapsed-seconds UX. Auth-required endpoint, **no persistence**.

**User decisions baked in — do not re-litigate:** status-column policy per report type; "letterhead" = the full cover letter with every block editable; AI is button-triggered, batched, and language-scoped; step 5 is HTML-edit + on-demand PDF with derived amounts locked.

**Deposit footnote rule (the subtle one):** an invoice whose shown amount is reduced or constituted by deposits must NOT get the generic "Amount shown reflects only the portion allocated to this source." An invoice whose only cross-source funding is a tagged/claimed deposit → deposit footnote only. A budget-line split across sources → keeps `†`. Both → both facts conveyed. Marker glyph/numbering is the dev-team-lead's call, but must not collide with the `†N` (split) / `*N` (skipped doc) namespaces.

## Claim close-out defects found auditing #1891 (2026-07-30)

The architect audit of the dual-rail aggregation confirmed **budget totals conserve correctly** — every defect found is in the **claim close-out** path, not the money math. Keep that distinction when triaging: conservation and close-out are separate correctness domains here, and a green conservation check says nothing about close-out.

- **#1895 (bug, HIGH / Must Have)** — `markInvoicesClaimed` (`sourceReportService.ts:506`) takes only `invoiceIds`: it flips every listed invoice `pending|paid`→`claimed` and sweeps EVERY deposit on them, with no `budget_source_id` and no report-slice filter. Confirming source A's claim permanently blocks source B's residual claim AND inflates `computeClaimedAmount(B)`. Also subsumes: step-3 line exclusions shrink the report amount but mark-claimed still claims the whole invoice → excluded portion permanently unclaimable. Fix direction: require `sourceId` + explicit `depositIds`; deposit-only close-out when the invoice stays claimable for another source (the arm at `:565-566` already supports it). Needs API Contract wiki update, possibly an ADR amendment. **Breaking API change.** No test covered the cross-source sweep.
- **#1896 (bug, MEDIUM / Should Have, blocked-by #1895)** — `createDeposit` has no parent-invoice-status guard, so a `quotation` invoice can carry a pending deposit, enter the claim slice via that deposit, then get rejected by the claimability check → `InvoicesNotClaimableError` rolls back the ENTIRE batch (asserted by `sourceReportService.test.ts` scenario 27 — the rollback is intended; the slice membership is the bug). Resolves naturally once #1895's deposit-only close-out lands. Interim UX: surface `err.error.details.invoiceIds`. Open domain question logged on the issue: should `createDeposit` reject deposits on quotation invoices outright, or is "deposit against a quote" legitimate?
- **#1897 (bug, MEDIUM / Should Have)** — `GET /api/budget-sources/:id/budget-lines` is deposit-blind (`budgetSourceService.ts:812-848` / `:850-888` attribute the whole itemized amount by parent-invoice status), while the work-item page uses the deposit-aware `budgetServiceFactory.getInvoiceAggregates`. Display divergence only, **predates #1891**. Rider in the same issue: `budgetSourceService.ts:387-390` coerces any non-`'claimed'` status arg to `'paid'` via ternary — latent, fix is `new Set([status])`.

The `isSplit` fix from the same audit was folded into PR #1894 directly — deliberately **no** issue for it.

**Outstanding wiki MUST FIX from the PR #1894 approval** (documentation only, must land before merge to satisfy AC 4.11): `API-Contract.md:4186` Rail A text still says tagged deposits are "excluded from the pro-rata pool entirely" and the residual uses "the remaining deposits" — that describes the fixed defect, not the code. `API-Contract.md:3609` still defines `isSplit` as line-derived only. Architect owns line 4186; **line 3609 was surfaced separately by me** and is easy to miss.

**#1895 and #1896 are pre-existing in kind since #1878** (line-split invoices); #1891's deposit tagging only widened #1895's blast radius. Neither blocks PR #1894.

## Contract facts downstream stories must respect

- **`SourceReportInvoice.allocatedAmount` is NEGATIVE for `lineKind: 'refund-adjustment'`** — server derives `lineKind = roundedAmount > 0 ? 'invoice' : 'refund-adjustment'`, so the sign and the kind are the same fact. Never re-negate at display time. This tripped up PR #1887 in four places.
- **`isSplit` is a server field** meaning "the invoice's funding spans 2+ distinct budget sources across **budget lines AND tagged deposits**" (widened in PR #1894; a `UNION` sub-query, still server-derived). It is NOT `allocatedAmount < invoiceAmount` (that's partial allocation to one source — a different question). Don't recompute it client-side.
- **Tagged-deposit aggregation is REDIRECT, not ADD** (the AC 4.6 blocker on PR #1894). In `splitByDepositsExcludingTagged`, a tagged deposit is excluded from the emitted `depositFractions` (Rail A) but **still subtracted from the residual denominator** — its money leaves Rail A and is re-added whole by Rail B. Rail A + Rail B across all sources must reconstruct exactly the invoice amount. Any future change here needs a conservation assertion (`A + B === invoiceAmount`), not just a per-source number.
- **`report.totalAmount` is the server's total over ALL invoices** in the status slice, already netting refunds. It is _not_ valid as the grand total once the user excludes invoices client-side.

## PR #1887 review outcome (2026-07-30) — CHANGES_REQUIRED

6 functional blockers + 7 MUST FIX display items. Blockers, in the fix order I gave:

1. **PDF pipeline throws at runtime** — `pdfMake.vfs = vfsModule.default` doesn't supply Roboto-Medium; every `bold: true` run fails, so no PDF ever renders. 3 E2E shards + `E2E Gates` red while `Quality Gates` was green.
2. Refund double-negation + running total adding refunds (contract violation above).
3. `t('invoiceStatus.*')` and `t('sourceReports.invoiceNumber')` resolve to nothing → raw keys on the bank-facing PDF.
4. PDF grand total ignores step-3 exclusions (rows/subtotals filtered, total not) → stated total ≠ line items.
5. `?sourceId=` deep link dead-ends — only the radio's `onChange` calls `getSourceReport`, and clicking an already-checked radio fires no event → step 3 skeletons forever.
6. Split rows never footnoted (marker borrowed from appendix numbering, collides with the skipped-doc namespace, vanishes without attachments); split badge _replaces_ the attachment indicator instead of accompanying it; "stage-matched" attachment (#1877 `attachmentType`) unimplemented.

**Lesson recorded in [[pr-review-patterns]]:** all six were invisible in a green unit suite — wrong-sign fixtures, key-echoing `t` mocks, and mocked PDF libs. Check the E2E artifacts, not the unit tests, for anything involving a third-party runtime pipeline.

### Round 2 (commits fdba5cd8/0bf8e674/09600edb/f6dbacfc) — **APPROVED** 2026-07-30

All 6 blockers + 7 MUST-FIX verified fixed at the root, independently re-checked against the diff. Notable outcomes worth reusing:

- Fix was `pdfMake.addVirtualFileSystem()` + `addFonts({ Roboto: {normal, bold: 'Roboto-Medium.ttf', …} })` — the missing piece was **font-family registration**, not the vfs assignment.
- **`realRender.test.ts` is the pattern to demand** for any third-party rendering pipeline: mocks nothing, real i18n bundles (en+de), real formatters, stubs only `fetch` with genuine pdf-lib bytes, asserts every bold style renders and that excluded rows are absent from the total. Ask for this by name in future PDF/canvas/export stories.
- Split footnotes re-modelled with **two marker namespaces** (`†N` splits, `*N` skipped docs) — reuse when a document needs independent footnote families.
- `includedTotal` computed in `merge.ts` and threaded into _both_ overview and cover letter.
- Accepted decision: the refund row's _Invoice Amount_ column shows the gross **positive** amount in the refund colour (the invoice's amount genuinely is positive; the refund is the contribution). The negative allocated amount + `(refund)` note carry the sign. Do not "fix" this back.

**Deferred AC → #1888** (standalone user-story, Backlog, blocked-by #1879): "stage-matched" attachment indicator. Deferred deliberately, not missed — `attachmentType` is invoice-only and frequently `null` (#1877), so a naive match rule would _hide_ the paperclip for legitimately attached docs. The `null` rule must be decided first; #1888's first AC captures that.

**Not attributable to this PR:** E2E shard 5 red on `invoices.spec.ts` "Effective Amount"/"Remaining Amount" (known #1876-era flake: singleton `table.invoices.columns` preference + debounced save leaking across retries; its fix has regressed) and `navigation/dashboard` "card is dismissed". Same two tests failed pre-fix. **Must be triaged before this mini-epic is promoted — `E2E Gates` is required on `main`.**

German report-type nouns approved (Verwendungsnachweis, Einreichung) — reasoning in [[glossary-decisions]].

## Domain decisions locked in by #1891 (user-verification follow-up to #1879)

Raised by the user after verifying PR #1887 on a real deployment. Four bundled points (2 bugs, 1 feature, 1 domain change), **all confirmed with the user — do not re-scope**.

- **Deposits carry an optional, DIRECT `budget_source_id`** (nullable, migration 0044, no backfill). USER-DECIDED: the link goes deposit → source, deliberately **not** routed via budget lines. Contradictions between a deposit's tagged source and what the invoice's budget lines imply are **explicitly accepted**. Do not add validation to reconcile them, and do not "fix" this into a line-derived path later.
- **New aggregation rule (locked in):** a _source-tagged_ deposit's status-sliced contribution counts **100%** toward its tagged source — even when the invoice has **no** budget lines for that source. _Untagged_ deposits keep the existing pro-rata apportionment. Applies uniformly to `budgetSourceService` rollups **and** `GET /api/source-reports`. This narrows, but does not replace, the #1876 `splitByDeposits` semantics — the pro-rata path in `computeStatusContributionByInvoice` remains the default for untagged rows.
- **Deposit form source picker default:** the invoice's only source; if multiple, the dominant-by-allocation one; if the invoice has no budget lines, no default and empty is valid.
- **Claiming stays invoice-level.** Step-3 line exclusions refine `allocatedAmount` / running total / PDF amounts only. An included invoice with excluded items must trigger an explicit warning in the mark-claimed confirmation. Do not let anyone turn line exclusion into partial claiming.
- **Report response gains** a per-invoice budget-line breakdown (line id, item name, work/household item link, per-line allocated portion) plus the invoice's deposits/refunds list — both exist to power the step-3 row expansion.
- **CSP bug worth remembering:** `frame-src 'self'` does **not** cover `blob:` URLs; the wizard preview iframe was blocked in every real deployment while CI stayed green, because the E2E assertion only checked that `src` was a non-empty `blob:` string. Any future "preview renders" AC must assert the frame **renders content**, not that a URL was assigned.

## Domain decisions locked in by #1877

- **`app_settings` is a new app-scoped key/value table** (migration 0043). The AC said "existing app-settings mechanism" but none existed — `user_preferences` is per-user. Household name/address live here. Reuse this table for future app-scoped settings; do not add another mechanism.
- **Household name & address live on the Manage page as a new first "Household" tab**, not on the per-user profile and not on a new settings page. Rationale: household-wide reference data belongs with the other household reference data. The Manage page's _default_ landing tab stays `areas` — do not change it, existing deep links depend on it.
- **Two Paperless pickers, deliberately asymmetric.** The invoice-_creation_ picker (`InvoicePaperlessPickerModal` → auto-itemize commit) offers NO attachment-type choice: the picked document IS the invoice's source document, so the server hard-sets `attachmentType: 'invoice'` in `commitAutoItemizeCreate`. Only the invoice _detail_ page's "Add Document" picker offers the optional choice. If a future reviewer flags the missing prompt as a bug, it is not — this is settled.
- **`attachmentType` is invoice-only and normalized server-side**, in both `createLink` and `updateAttachmentType` — not merely hidden in the UI. Any new entity type gets null automatically.
- **Attachment-type vocabulary reuses existing glossary terms** — Quotation/Angebot, Deposit/Abschlagszahlung, Invoice/Rechnung. No glossary additions were needed or approved for #1877.

## Domain decisions locked in by #1876

These are settled — build on them, don't re-litigate:

- **Refunds stored positive**, negated at display and aggregation time. `amount > 0` DB check still applies to refund rows.
- **`entryType` (`deposit` | `refund`) is immutable after creation.** Enforced by AJV `removeAdditional` stripping the field on PATCH → **200 no-op, not 400**. UI shows both radios _disabled_ in the edit modal rather than hiding the field.
- **Two independent sum invariants**, not one: Σ deposits ≤ invoice.amount AND Σ refunds ≤ invoice.amount. Distinct error codes `DEPOSITS_EXCEED_INVOICE_TOTAL` / `REFUND_EXCEEDS_INVOICE`.
- **Refund status semantics differ by consumer, and this is intentional** (both were specified explicitly in the ACs, they do not conflict):
  - `finalPaymentAmount`: only `paid`/`claimed` refunds reduce it (a pending refund hasn't returned money yet).
  - `splitByDeposits`: a refund contributes a negative fraction **in its own status slice**, including `pending`. Refunds are excluded from `residualFraction`.
- **Σ status slices no longer equals Σ invoice.amount** once refunds exist. The old invariant was load-bearing in tests — it now only holds for refund-free data. Any new rollup test must not assert it unconditionally.
- **Status lifecycle and labels reused verbatim** for refunds (Pending/Paid/Claimed). No relabeling, no 4th status — decided with the user.

## Open UX follow-ups (not blocking, raised on PR #1880)

- The same value `finalPaymentAmount` is labelled **"Effective Amount"** in the invoice list (new column, hidden by default) but **"Final payment"** in the invoice detail section. Align during a later wizard story.
- "Effective Amount" is net of deposits _and_ received refunds, not just "gross − refunds". Header alone can mislead; a tooltip is the cheap fix.
- The Effective Amount column is not sortable (computed, not stored) while "Remaining Amount" is.
- "Remaining Amount" in the invoice list stays **itemization-based** (amount − Σ budget lines) and was deliberately left unchanged. Different question from "how much is still to pay" — do not merge the two.

Related: [[glossary-decisions]] (the `Refund` term), [[standalone-bugs-and-stories]].

## Locale layering: artifact content vs. edit affordance (#1899, #1900 — settled)

The wizard has **two independent locales** and the split is deliberate. Do not "fix" the resulting
mixed-language UI — it was proposed as a change request on PR #1909 and ruled ACCEPTED.

- **Artifact content follows the report language.** Anything that will appear in the exported PDF —
  table captions, cover-letter text, status text, source-info block, footnotes, summary labels —
  renders in the user-selected report language. This is what makes the preview genuinely WYSIWYG.
- **Edit affordances follow the UI language.** Editable-field labels, buttons, headings, aria-labels
  — chrome that never reaches the PDF — stay in the user's UI locale, so someone who picks a report
  language they don't read can still operate the editor.

Consequence: a mobile card (and the cover-letter card) legitimately shows report-language captions
next to UI-language field labels. Forcing consistency costs either WYSIWYG fidelity or editor
usability; both are worse. No AC requires single-language cards.

**Single source of labels**: `buildReportContent` emits `ReportContent.labels` using `reportT`
(`i18n.getFixedT(reportLanguage, 'budget')`), consumed by BOTH `ReportContentEditor` and
`reportPdf/overviewPdf`. Added in #1900 to fix the preview/export mismatch the architect flagged.
Any new report label must go through `content.labels`, never a direct `t()` in either consumer —
a direct `t()` reintroduces the mismatch silently.

**Known gap, tracked as #1910**: report-language content carries no `lang` attribute, so screen
readers announce it with UI-locale pronunciation. Applies to the whole preview, predates #1900.

Related: [[pr-review-patterns]].

## Refinement Round 3 (issues #1929–#1933, created 2026-08-02)

Source: user inspection of downloaded report PDFs + a wizard walkthrough after #1901 merged. No parent epic; all board **Todo**, destined for `/batch-develop` (one issue = one branch/PR, no dependency chain declared — they touch disjoint files, but #1929 and #1932 both touch `reportPdf/`, so whichever lands second must re-verify the other's ACs).

- **#1929 — PDF layout robustness** (`bug`, **Must Have**). Three verified defects in the pdfmake pipeline: (a) `overviewPdf.ts` widths `['*','auto','auto','auto','auto','auto','*']` — five `auto` columns eat the printable width before the two `*` columns get anything, so the Usage column collapses and the table overflows the right page edge; the `allocatedAmount` cell is the worst offender because it carries an inline deposit badge + footnote markers. (b) `TABLE_LAYOUT` in `shared.ts` never sets `dontBreakRows`, so multi-line rows orphan across page breaks. (c) `buildPageHeader` renders ~60pt of content (14pt bold + 12pt subheader at `lineHeight: 1.4`, plus a 20pt bottom margin) into a **40pt** `pageMargins` top band → clipped and overlapping on pages 2+. ACs are outcome-focused; fixes are not prescribed.
- **#1930 — Attachment tier rules per report type** (`user-story`, Should Have). Replaces the per-invoice stage matching in `sourceReportService.ts` step h (~L286–339). **Tier order quotation(1) → deposit(2) → invoice(3); floors: budget-overview=1, claim=2, proof-of-funds=3; embed at-or-above the floor.** Depends only on report type + document type — no longer on invoice status, deposit split, or `targetStatuses`. **PR #1942 APPROVED round 1 (2026-08-02)**, all 11 AC met, 80/80 green. **But see #1943** — the architect found a frontend route that reaches AC2's forbidden outcome without violating AC2: `handleUseCaseChange` (`ReportWizardPage.tsx` L198–224) never clears `report`/`reportStatus`/`sourceId`, and step 2's Next is gated on `disabled={!sourceId}` (L686), which survives. Switching **budget-overview → claim** and clicking through carries a report filtered at the *budget-overview* tier floor into a claim export → **quotations embedded in a claim PDF handed to a bank**. Pre-existing (staled invoice slice + totals all along), but #1930 raised the consequence from a reconciliation error to an evidentiary one. Filed `bug` / **Must Have** / Todo, 2026-08-02; cross-referenced on #1930 (`issuecomment-5158312814`). **My ruling, recorded so it isn't re-litigated: clear `sourceId` too**, not just `report` — clearing `report` alone leaves the `!sourceId` gate satisfied, trading a stale-data bug for an empty-state bug. Clearing `sourceId` restores "step 3 is reachable only after an explicit source selection under the current use case", the same invariant step 1→2 already enforces; the extra click lands on a source list whose amounts were just re-fetched for the new use case. Watch the `?sourceId=` deep-link effect (L255–260, keyed on `!report`) — clearing `report` re-arms it, so #1943 AC8 requires that interaction be reasoned about explicitly. **Generalisable lesson: an AC that constrains a server-side derivation is not satisfied until the client is proven to re-derive it whenever its inputs change — check the state-reset paths, not just the computation.**
- **#1931 — Single "Enhance with AI" action + purpose-focused prompt** (`user-story`, Should Have). Drops the step-4 "Enable AI assistance" toggle entirely (it gated nothing but a button), renders one button when `llmEnabled`, relabels "Generate with AI" → "Enhance with AI", and rewrites the prompt to explain **why** each cost was incurred rather than restating the table columns.
- **#1932 — Cover letter overhaul** (`user-story`, Should Have). Formatted body (no markdown lib in `client/package.json` today — deliberately left as an architect/UX decision), explicit editable signature field + signature block, sender = user `displayName` + household address, professional letter layout, and the oversized reset-`X` fix.
- **#1933 — Select Invoices step UI fixes** (`bug`, Should Have). Wrong glyph, no open-invoice affordance, misaligned select-all, misaligned deposit dates cell.

### Rulings made while writing these — do not re-litigate

- **`attachmentType: null` = tier `invoice`** (#1930). Rationale: nulls are legacy/ambiguous, not known-weak evidence — the invoice-creation Paperless picker hard-sets `'invoice'`, so nulls come from pre-#1877 links and from users skipping the type choice. Treating null as the *lowest* tier would silently drop evidence from claim/proof-of-funds reports for existing data, which is worse than being over-inclusive (the user can deselect). Treating it as tier 3 is exactly no-regression while still stopping typed quotations from reaching claim reports. **This supersedes #1888's deferred design question** — #1888 stays open but is re-scoped to indicator *presentation* only.
- **Server-side single filter** (#1930 AC7). `merge.ts` embeds whatever `invoice.documents` holds and `ReportInvoiceList` lights on `documents.length > 0`, so filtering once server-side makes step 3 and the PDF agree for free. Never add a second client-side document filter.

### #1930 shipped — PR #1942 APPROVED (2026-08-02, round 1)

All 11 ACs met on head `4dfce4b8`; 80/80 tests green. Implementation is `server/src/services/shared/attachmentTierUtils.ts` (`ATTACHMENT_TIER`, `REPORT_TYPE_TIER_FLOOR`, `isDocumentIncludedForReportType`) — the single site for both the ordering and the floors. `splitByDepositsExcludingTagged` is gone from `sourceReportService`'s document path (still used by `budgetSourceService` for amounts — the #1930 Notes' "do not delete it" meant the util, not the local variable). Wiki `API-Contract.md` @ `a9b6e9e`.

- **QA deviation accepted**: AC1's table-driven scenario uses a *fresh invoice per report-type block* rather than one shared invoice queried three times. Correct call — no single invoice status sits in all three target slices (proof-of-funds needs `claimed`, which the claim slice excludes), so a shared fixture would have varied invoice-selection, the wrong variable. Status-invariance is proven separately by the `AC5` test. **General rule: when a table-driven test can't hold every variable constant, isolate the variable under test per block and prove the invariance claim in its own named test.**
- **Non-change-detecting tests are acceptable when the contract is asserted correctly** (informational finding I1). The proof-of-funds blocks of `scenario 16` and the `AC3` test would also have passed on `beta` (old stage derivation for a `claimed` no-deposit invoice also produced `stages={invoice}`). Flagged, not blocked — the ACs describe outcomes, and change-detection lives in the unit test plus AC1's budget-overview/claim blocks.
- **#1888 re-scope APPLIED** (issue body rewritten 2026-08-02, was still stale at review time). Null-handling AC replaced by a pointer to the tier ruling; the "attached but not stage-matched" third state struck (non-qualifying docs never reach the client now); a "no client-side filtering" AC added to protect #1930 AC7; coordination note with #1933 (same glyph) added. **Lesson: a supersedes-ruling written into issue A does not update issue B — apply the re-scope to B's body at the same time, or it will be found stale at review.**
- **#1909's "signature derived from sender" acceptance is REVERSED** (#1932). It was accepted at review time on the reasoning that `sender.split('\n')[0]` (the household name) was an adequate signatory; the user saw the output and rejected it. Record reversals like this rather than re-arguing them.
- **#1925 closes as a duplicate of #1932** when #1932 lands; its ACs are carried forward verbatim as #1932 section 6. #1925's own Notes already anticipated this.
- **The `Konstruktionsprojekt` prompt nit moves from #1917 to #1931.** `buildReportContentUserPrompt` L153 inverts the language ternary and is wrong in both branches; #1931 rewrites that prompt wholesale. #1917 keeps everything else, incl. the M2 `computeIncludedTotal` extraction and the `KI` glossary entry.
- **Prompt/validator cap divergence** (#1931). Prompt states 150/2000/200 (subject/body/description); `openAICompatibleProvider.ts` truncates at 200/3000/300. Resolution: one shared definition, effective values **150/2000/200** — the tighter set, partly because long descriptions aggravate #1929's Usage-column overflow. But #1929's ACs must hold at *any* length, since the step-5 editor is unbounded; neither issue may lean on the other. **Reaffirmed unchanged 2026-08-02** when ruling on #1929's AC conflict — a UI `maxLength` was explicitly rejected as the safety mechanism (see next entry).

### #1929 AC2-vs-AC4 conflict — ruling of 2026-08-02 (issue comment `5156932089`)

PR #1935 got CHANGES_REQUIRED from both `product-architect` and `ux-designer`. Architect measured real pdfmake 0.3.11 renders: `dontBreakRows` on an unbreakable row **taller than one page** makes pdfmake **silently drop the row's content** (cliff ≈ 475 chars in the 7-col shape, flat at 14 text-show ops from 500 chars to 3000). So AC2 ("no characters dropped") and AC4 ("no row split across pages") were mutually exclusive at unbounded length. Ruling, now in the issue body:

- **Precedence ladder replaces flat peer ACs.** I1 no character lost > I2 nothing outside the printable area > I3 row stays on one page > I4 no word broken. Lower number wins on conflict. **I3 yields to I1** (option (a)): a row that *can* fit one page is never split; a row that genuinely cannot may span pages, but content is never silently dropped. Rationale: a split row is visible and recoverable (repeating header + reconcilable totals); a dropped row is undetectable in a document handed to a bank. Integrity > presentation.
- **AC2's "no word cut mid-word" was over-broad and got rewritten.** It described the *clipping* defect, not typographic line-breaking. As written it created a second latent contradiction: a pdfmake `'*'` column never renders below its widest word's width (`columnCalculator.js:66-75`), and `Wärmedämmverbundsystem` = 128pt at 10pt Roboto, so AC1 was unsatisfiable for unbounded German compounds. **Now: a word may be broken across lines iff it is wider than its column alone, losing no character.** This is what made the contract satisfiable — the general lesson is to check whether an AC forbids a legitimate mechanism while trying to forbid a defect.
- **Rejected (b) truncation** (data loss on a bank document, politely announced) and **(c) a step-5 `maxLength`** — a UI cap is a UX affordance, not a correctness guarantee: it doesn't close the hole (vendor name + area line + attachments can still overflow a row), it isn't the only ingress (#1901 AI generation), and it puts a renderer invariant two layers away. A soft counter/hint is fine as separate future work — deliberately **not** filed.
- **Targets set** (7-col shape, worst-case other columns, measured not estimated): **600 chars** of German prose with zero degradation (3× #1931's 200 target, 2× the 300 validator cap); Usage column fits **~30 chars of German prose per line** (69.28pt / ~14 chars is a collapsed column in product terms); table body font floor **8pt**.
- **Permitted levers widened, scope unchanged** (still presentation-layer only): padding, border widths, table body font down to 8pt, column widths, fixed-vs-star, page margins, and the row's internal layout — including taking the usage stack out of the 7-column grid into a full-width sub-row. The column grid is *not* fixed by the issue. 7 real columns + a prose column on A4 portrait is genuinely tight; say so explicitly or the implementer assumes the grid is a constraint.
- **No continuation marker** on split rows — needs page-aware rendering, too much risk on a blocking Must Have, case is rare once columns are right.
- **New ACs**: AC12 (measure the ceiling from real renders, record it in the issue *and* a code comment, pin with boundary tests both sides), AC13 (running header survives an unbounded `sourceName` — architect's MEDIUM 5), AC14 (falsy-`statusText` malformed-row crash at `overviewPdf.ts` L~160, verified: 6 cells pushed against a 7-entry `widths`). AC11 strengthened: config-only assertions don't satisfy it; AC1–AC4 each need a real-render assertion. **Fix order is part of the contract**: geometry first, *then* the unbreakable-rows flag, then the residual over-tall row — reversing it converts a visible defect into silent data loss.
- **Process lesson**: both this round's CRITICAL findings and my own AC conflict came from configuration asserted in a comment rather than measured against a real render (`dontBreakRows` on `layout` where pdfmake never reads it; a Usage width documented as 185.28pt that renders at 69.28pt because pdfmake subtracts ~116pt of cell offsets first). For any PDF/layout AC, require the assertion to be made against the rendered result.

## #1929 closed — PR #1935 merged 2026-08-02 (squash `1c5aa62c`), 4 rounds, 5 follow-ups filed

Merged after four implementation rounds. Both `product-architect` and `ux-designer` reviewed by **rendering and rasterizing real PDFs** (throwaway Jest test → `/tmp` blob → `pdftoppm -r 150/300` → inspect PNGs), not by reading config — that technique is what caught every round's defect and is now the standard for any PDF-layout review here.

**The four-round arc, as a generalisable lesson** (architect, round 3): *"every cell that can hold unbounded text needs the cap, not just the first one that was noticed. Round 1 capped nothing, round 2 capped the wrong quantity (average glyph + perfect packing), round 3 capped the right quantity in the wrong scope (one field of a multi-field cell)."* Round 4 finally capped the right quantity at cell scope. When an AC is about a bound, ask **what quantity, at what scope** before accepting the fix.

Final state worth knowing: table width is now **exactly 515.28pt, unfalsifiable by input** (no `'*'` column left; 22 pathological cases all identical to the hundredth). `MAX_SAFE_USAGE_CHUNK_CHARS = 650`, `MAX_SAFE_SMALL_CHUNK_CHARS = 450`, `PAGE_TOP_MARGIN = 75`, table body font 8pt, `VENDOR_WIDTH = 45pt`. AC12's 600-char zero-degradation guarantee holds.

### Follow-ups filed 2026-08-02 (all parentless, Bank Report Wizard cluster)

- **#1937 — German header labels break mid-word** (`bug`, Should Have, **Todo**). `Auftragnehmer` 67.50pt in a 45pt column, `Rechnungsbetrag` 78.66pt in 48pt. pdfmake 0.3.11 has no hyphenation mode; widening was **measured and rejected** (drops Usage to ~79pt, fails AC3's ~30-chars-per-line floor). Fix is at the **i18n layer** — 2 finite translator-owned strings in 1 locale, not an engineering fix. Ranked near-term because it shows on *every page of every German report*, unconditionally.
- **#1938 — running header `generated at` label with no timestamp on pages 2+** (`bug`, Should Have, **Todo**). `merge.ts` L163–167 passes only `t('sourceReports.table.generatedAt')`; page 1 does it right at `overviewPdf.ts` L333 (`${label}: ${generatedAtText}`). **Pre-existing**, verified against `origin/beta` — not a #1929 regression.
- **#1939 — reportPdf geometry hygiene** (`tech-debt`, Should Have, **Todo**, **blocks #1932**). `HEADER_ROW_HEIGHT` → `HEADER_ROW_HEIGHT_MAX` (exports 68pt vs measured 45.81pt — correct *bound*, wrong *estimate*, and #1932 could under-fill whole pages reading it as typical); scope the `WORST_CASE_CHAR_ADVANCE_EM` comment (overclaimed at 0.89 and again at 1.04 — a 3,919-codepoint sweep found Cyrillic `Ѹ` U+0478 at 1.1611em; **value stays 1.04**, raising it drops the 7-col threshold 19→16 chars and breaks more German compounds); enumerate cell-content channels; relocate `PDF_STYLES` **down** into the geometry layer.
- **#1940 — continuation rows read as broken** (`enhancement`, Could Have, Backlog). The deferred "Could Have" from the #1929 ruling, now *observed*: `splitIntoPageSafeChunks` has no minimum trailing-chunk floor, so a row can carry a **single stray character** with all other columns blank. Only above the chunk ceilings, i.e. beyond AC12's guaranteed 600-char range; no data loss (I1 holds).
- **#1941 — editable override fields have no length limit** (`enhancement`, Could Have, Backlog). Zero `maxLength` in `client/src/components/reports/` or `EditableField/`; `attachmentsNote` is a client-side override that never round-trips, `areaText` is aggregate-unbounded (N × 200). **No longer a correctness risk** — round 4 bounded the renderer at cell scope. Input-side gap only.

### #1950 — guard test for the derived `Ѹ` ceiling (filed 2026-08-02 from PR #1948 round-3 review)

`tech-debt`, **Could Have**, Backlog, **blocked-by #1939**. Filed off the architect's PR #1948 approval comment ([5160266124](https://github.com/steilerDev/cornerstone/pull/1948#issuecomment-5160266124) §2), which **reframed its own earlier ask**: the deliverable is *not* re-running the 3,919-codepoint sweep, it's a **guard test that recomputes** the derived ceiling from `USAGE_WIDTH_7COL` / `TABLE_BODY_FONT_SIZE` / `TABLE_SMALL_FONT_SIZE` / `DEFAULT_LINE_HEIGHT`. Sweep left out as an explicit **non-goal**, not an optional AC — an "optional" AC isn't binary and makes the issue unfalsifiable.

The risk being guarded: `MAX_SAFE_USAGE_CHUNK_CHARS` (650) is **34 chars / 3 lines / 33.6pt over** its *derived* `Ѹ` ceiling of 616 (`44 lines × 14 chars`). Accepted on **input reachability** (needs 650 unbroken chars of archaic Church Slavonic Uk in one Usage cell), and because a `Ѹ`-safe value must sit in `[600, 616]`, collapsing AC12's margin over its 600-char floor from 8.3% to ~2.7%. `MAX_SAFE_SMALL_CHUNK_CHARS` (450) is genuinely safe (11.2% under 507). **Not a request to change 650** — the architect is comfortable with the risk.

Three durable rulings, all written into the issue rather than left implicit:

- **Comment and issue both, never one instead of the other.** The rationale stays in the code comment (AC 2.1 forbids moving/shortening/replacing it; AC 2.3 pins 650/450/1.04 and every width byte-identical) because *"anyone changing 650 or a column width reads that comment, not an issue tracker. Moving it out recreates the provenance loss that produced #1939."* The issue owns the **guard**; the comment owns the **rationale**.
- **Bounded-quantified vs unbounded-estimated is the line for "does this deserve a tracked owner."** `markerText` is unbounded with an estimated break-even → documentation only (folded into #1939). This is a bounded constant *provably* 34 chars past a derived ceiling → *"a quantified exceedance is a standing accepted risk with a number on it."* I would have collapsed these two; don't.
- **A derived bound with no test is a comment waiting to go stale.** Verified live: `overviewPdf.test.ts` pins `MEASURED_TRUE_CEILING` as re-typed `704`/`546` literals referencing **no geometry constant**, so widening the Usage column leaves them green while the real ceiling moves. Generalise: when a review accepts a *derived* number, ask what fails if its inputs change.

AC 1.3 fails in **both** directions (growth widens a reviewed risk; shrinkage makes the comment's figure wrong). AC 1.6 keeps the measured 44/39-line budgets as the sole pinned literals, labelled as real-render measurements. The architect's two "informational, do not re-round" cosmetics (`~2.6%`→`~2.7%`, the self-asserted-infallibility sentence) were **already fixed at head `a6871975`** — checked before deciding, nothing folded in.

### Merge/scope decisions in this triage

- **`markerText` (unbounded, ~250-skipped-doc break-even) and `invoiceNumber` (unbroken, capped at 100) were folded into #1939 as a documentation-only AC**, not filed separately. Their value is entirely "the next person reading this file knows the enumeration"— the same category as the comment-scoping work, and a standalone Could Have would never be picked up. AC7 + a scope guard forbid actually implementing a bound for them.
- **Vendor *data* breaking mid-word was recorded as an accepted limitation in #1937's Notes, not filed.** `ux-designer` round 4: at 45pt/8pt any 14+ char word breaks, and German trade names compound freely (`Rückerstattung` → `Rück`/`erstattung`) — a non-trivial minority of realistic names. Not filed because it is unbounded user data, AC2 permits it, nothing is lost, and the only lever (widening Vendor) costs Usage width and breaks AC3. Revisiting it needs a layout change, not a width tweak.
- **`PDF_STYLES` relocation had been deferred *to* #1932 in the round-3 review but never entered #1932's ACs** — it now lives in #1939 §4 so it isn't lost. Watch for this pattern: "we'll handle it in issue X" is only real if it lands in X's acceptance criteria.
- **Not filed:** the page-1 `PAGE_TOP_MARGIN = 93pt` blank gap above the cover-letter sender block — already inside #1932 AC 4.1; flagged on #1932 rather than duplicated.
- `addBlockedBy(#1932 ← #1939)` set, plus a prominent sequencing comment on #1932 (`issuecomment-5158212341`) covering the block, the `PDF_STYLES` direction constraint (`pageGeometry.ts` must **never** import `merge.ts` — that edge already runs the other way), and the #1941/#1938 shared-ground warnings.

## #1931 reviewed 2026-08-02 — PR #1944 APPROVED round 1, with two ACs deliberately unclaimed

All ACs met except 3.2/3.3, which were **not marked met** and were carried to UAT instead. Verified individually on `980c51a2` (109/109 local on `prompts.test.ts` + `contentLimits.test.ts`).

### The ruling worth reusing: unverifiable-AC precedent

AC 3.2/3.3 assert **live model output quality** ("reads as a purpose statement", "idiomatic German, no anglicised calques"). A mocked LLM returns the fixture author's prose, so a test claiming to verify them asserts the fixture, not the model — **worse than no test**, because it shows a green check against an unverified criterion. QA correctly wrote none.

**Ruling: merge is a code gate, Done is an acceptance gate — keep them apart.** Approved the PR (everything code can deliver is delivered; holding the branch gets nobody in front of a live model sooner and accumulates rebase risk), but **#1931 stays out of Done** until a human reads real EN and DE output with `LLM_*` configured. Posted Given/When/Then UAT scenarios on #1931 (fixture shape: 5+ invoices, mixed budget-line coverage, one with `notes`, both-interface-languages pass for 3.3). If UAT fails → **reopen #1931**, don't file a follow-up: they are its own unmet criteria.

**Contrast with the #1909 AC 4.6 acceptance**: there a real contract-level substitute existed (CSP `frame-src` assertion once headless Playwright proved to have no PDF viewer), so a documented deviation was right. Here there is no substitute at all. **An unverifiable AC with a substitute may be waived as a documented deviation; one without a substitute goes to UAT.**

### Other rulings

- **"Mit KI verbessern" accepted for AC 2.3.** My AC deliberately did not prescribe the string ("an equivalent in German that uses 'KI', consistent with existing `de` copy") — wording is `ux-designer`/`translator` territory. *verbessern* (improve existing) over *überarbeiten* (rework) is right and matches the English: the whole point of renaming Generate→Enhance was that the action improves content that already exists; *überarbeiten* would reintroduce in German the overstatement removed in English.
- **Unconditional `aria-describedby` description accepted as in-scope** though not literally in an AC: deleting the checkbox deleted its helper text, which was the only place overwrite behaviour was explained. Dirty-gating it would hide the warning from the user who most needs it.
- **Good AC-writing pattern to repeat**: AC 4.1 asked for "exactly one definition that both sides derive from". `contentLimits.test.ts` satisfied it by building its expected substrings *by interpolating the constant*, never typing the literal — so a hardcoded number reappearing in `prompts.ts` fails the assertion instead of silently passing. Ask for derivation, not equality.
- Non-blocking follow-ups left on the PR (not filed): user-prompt tail still says `letterBody` "summarizing the report" (old framing, weaker instruction sitting closer to the output — first suspect if UAT 3.4 fails); stale E2E locator name `generateWithAiButton` vs the "Enhance with AI" accessible name.

### #1917 bookkeeping done

**L3 struck from #1917's body** (comment `issuecomment-5158606180`) after verifying the ternary is gone, both branches emit the fixed literal `German construction project`, `Konstruktionsprojekt` is absent from source, and `prompts.test.ts` pins its absence. No `Bauprojekt` rename needed — no German noun remains. **Rest of #1917 open and unchanged**: M1–M4, L1 (`sourceId!` re-verified still at `ReportWizardPage.tsx:574`), L2, L5, and the **`KI` glossary entry — still #1917's, not absorbed**: PR #1944 does not touch `glossary.json` and the file still has no `KI` entry.

## #1945 review follow-ups filed 2026-08-02 — #1946 (M2) and #1947 (M3), plus #1943 amendments

`product-architect` APPROVED PR #1945 (#1943) with three mediums. **M1 was fixed inside PR #1945 rather than filed** — the precedent below is the reusable part.

### The M1 precedent: a finding that defeats the PR's own AC is not a follow-up

M1 was an untokenized `getSourceReport` race — an in-flight fetch from the *previous* use case could win an out-of-order resolution and re-populate `report` while step 3 was reachable, reaching **exactly the #1943 end state** (claim export embedding quotation-tier docs). Filing it would have marked #1943's AC1 met while a live route to the headline defect remained open. Fixed in-PR with a monotonic `reportRequestRef` token (`ReportWizardPage.tsx` L146/229/269/274/281). **Rule: a review finding that defeats an AC of the story under review belongs in that story's PR, regardless of the reviewer's medium/low severity label** — reviewer severity answers "does this block merge", not "is the AC actually met".

### #1946 (bug, **Must Have**, Todo) — in-flight AI generation survives a use-case change

`runAiGeneration` resolves into `setAiContent(result)`; while generating, `aiContent` is `null`, so `guardedUpdate`'s dirty predicate is false and a use-case change applies **with no confirmation**. Post-#1931 the prompt is purpose-focused and the request carries `type: useCase`, so the landed result is narrative written for the **wrong report purpose** — the architect's point that the *mechanism* is symmetric with a source change but the *consequence* is not.

- **Must Have despite the architect's "Medium"** — recorded on the issue to stop re-litigation. Medium-for-PR and MoSCoW are different scales; the architect explicitly asked for it before the cluster's `beta`→`main` promotion. Same blast radius as #1943/#1929: credibility of a bank-facing artifact.
- **Product ruling on the discard question (option b of three)**: widen `guardedUpdate`'s dirty predicate to include `isGeneratingAi` → the confirmation runs; confirm invalidates the in-flight request via a token, cancel lets it finish. Rejected (a) silent invalidation — generation is slow (visible elapsed timer) and metered, the guard exists to protect content that isn't cheap to recreate, and an in-flight generation *is* that, just not arrived. Rejected (c) block-until-settled — freezes the wizard for up to `LLM_REQUEST_TIMEOUT_MS` and invents a trapped-behind-a-hung-request failure mode. **Never trap a user behind a network call they can't cancel.**
- **Widen the predicate inside `guardedUpdate` itself, not per-handler** — every caller mutates an AI-request input or the baseline; one place makes the invariant structural, which is the whole lesson of #1943. Closes the symmetric source-change variant for free.
- AC12 explicitly **forbids new E2E**: a late-resolving stale response is invisible to the assertions (architect's own analysis of scenarios 13/14). Deterministic unit test with controlled promise resolution, not a timing spec.

### #1947 (tech-debt, **Should Have**, Backlog, blocked-by #1946) — `useReducer` refactor

1,156 lines / 38 hooks; the "what a transition invalidates" invariant is hand-maintained across two handlers. **Filed as its own issue, NOT folded into #1912** — #1912 is a Could Have grab-bag of cosmetic nits; folding a state-machine refactor in would bury it behind a Could Have label, make #1912 un-sizable, and lose the evidence trail, which *is* the justification.

- **The evidence table is the argument**: one handler produced four defects of one shape in one batch — #1943 (transition didn't invalidate state it owned), its AC8 deep-link second-order effect (the fix created the next bug), M1 (pending write re-populated cleared state), M2/#1946 (same, plus the guard couldn't see what it guards). Two of the four were *caused by the patch before them*. Put that table in any future "should we refactor" argument.
- **Should Have, with a checkable trigger instead of a vague "soon"**: *the next change that adds transition-owned state to this component should be preceded by this refactor.* Raise at refinement if a report-wizard state story lands while it's open.
- Architect's **L3** (`deepLinkAppliedRef` boolean → `useRef<string|null>`) folded in as a nice-to-have per coordinator — the applied id is immutable for the component's lifetime (sole `?sourceId=` producer is a cross-route `navigate()` from `BudgetSourcesPage.tsx:1318`), so a boolean is sufficient today.

### #1943 body amended + audit comment (`issuecomment-5159716825`)

- **AC4 reworded — original was unsatisfiable by design.** "always identical to a clean start" is violated by `attachDocuments` and `reportLanguageOverride`, which are *correctly* sticky. **A UAT tester reading it literally would have failed the story for working as designed.** Now scoped to the `getSourceReport` payload, the exclusion sets, and the tier floor, with the two preferences named as out-of-scope. **Pattern to watch: an equivalence AC must name what is excluded, or sticky user preferences will read as failures.**
- **AC5 enumeration completed — `skippedDocuments` and `aiError` were omitted, both ruled CLEAR** (not KEEP, against the architect's "probably fine"). `skippedDocuments` is only overwritten on a *successful* generation, so a later failure re-displays the previous report's warnings against a new report — in a bank-facing flow. `aiError` can hold `EMPTY_SELECTION`, raised from exclusion sets this very reset clears, so it's guaranteed inapplicable. Both one-line, zero reachability risk.
- **Carried as #1946 AC9/AC10, not by reopening #1943** — the PR is approved and neither is a defect in what it shipped; the gap was in the enumeration, which now lives on the issue. Said so explicitly on the comment so the addendum doesn't read as goalposts moving after approval.

## #1933 ACs 2.1/2.7 corrected 2026-08-02 — AC described a layout that doesn't exist

Both ACs were written against "the mobile card" for the invoice row. **There is no mobile card for the invoice row**: `.invoiceRow` is a single CSS Grid at every viewport (`ReportInvoiceList.module.css` L35–43, no media-query override). The file's only breakpoint (`@media (max-width: 767px)`, L363) swaps `.tableWrapper` for `.mobileCardList` on the **nested** budget-lines (`ReportInvoiceList.tsx` L355+) and deposits (L539+) sub-tables. Verified on disk before amending.

Reworded to "every viewport" with the 44×44px target **unconditional** (strictly stronger than the original mobile-only intent, and right for a checkbox-adjacent control at any pointer type), plus an explicit "do not introduce a card layout to satisfy this". `ux-designer` had already designed against the real structure rather than the AC's premise — agreed with that call. **AC 4.3's mobile-card reference is correct and was deliberately left alone** (the deposits sub-table really does have one) — noted on the issue so nobody "fixes" it by analogy.

### Recurring AC-writing failure mode — now seen twice in one day

#1943 AC4 (equivalence AC that didn't name its exclusions) and #1933 AC2.1/2.7 (AC premised on a layout that doesn't exist) are the same defect: **an AC that misdescribes the thing being built gets read literally at UAT and fails a correct implementation.** Both were caught by a reviewer designing/implementing against reality rather than against my text. Mitigations to apply when writing ACs:

- Before writing a viewport- or layout-conditional AC, **check the CSS for an actual breakpoint** — don't infer a responsive variant from the presence of `mobileCard` classes elsewhere in the same file.
- For equivalence/"identical to" ACs, **name what is excluded** or sticky user preferences will read as failures.
- When an AC is corrected on an open issue, annotate the AC inline with a date + pointer to the correction comment, and say in the comment *why*, so the original premise isn't reintroduced from memory of the old text.

## #1932 user scope ruling 2026-08-02 — plain text with line breaks, not markdown

Comments: `issuecomment-5160251632` (decision), `issuecomment-5160258752` (AC change log).

**User, verbatim: "no full wysiwyg necessary - just a simple text body with line breaks".** So: plain text, no markdown, no rich-text editor, **no new client dependency**. Bold phrases and bulleted lists are **out of scope** even though #1932's Problem section cites them as motivation. The issue's "Needs a design decision before implementation" note is struck — this is no longer an architect/UX call. `ux-designer` still owns letter layout (AC 4.4).

### Premise correction — the stated defect was largely false

**pdfmake already honours `\n`.** `node_modules/pdfmake/js/TextBreaker.js` L30–34 and L53–58 treat `\n`/`\r\n` as a *required* line end, so a single text node renders embedded newlines as line breaks. The sender block has depended on this all along (`senderLines.join('\n')` in one node, pinned in `coverLetterPdf.test.ts` L80–90). The body's line-break round trip **already works and is merely unpinned**.

Consequence: #1932 section 1 collapsed from a feature build to **regression guards + one new requirement**. Worth keeping the guard anyway — the per-token inline-run technique used elsewhere in `reportPdf/` for pdfmake's all-or-nothing `wordBreak` would silently destroy `\n` handling if ever applied to the body. That is a working-but-unpinned behaviour with a plausible silent breaker, which is exactly what a test is for.

**Lesson: verify a "does not survive rendering" claim against the renderer's source before writing ACs around fixing it.** Cheap (one grep in `node_modules`), and it flipped this section's size.

### The plain-text ruling *created* one requirement rather than removing it

**AC 1.6 is now load-bearing.** `server/src/services/budgetExtraction/prompts.ts` L~142 ("Letter body") says nothing about output format. An LLM asked for a business letter readily emits `**emphasis**` and `- bullets`; under plain-text rendering those print as literal asterisks in the PDF a bank reads. Same defect class as the #1916 prompt-input findings — **when a formatting model is simplified, re-check what the LLM prompt assumes about it.**

### Vacuous ACs: strike with a stated replacement, never delete

- **1.4** (formatting discoverability) → STRUCK, replaced inline by a negative (must not advertise formatting support) + a concrete ask (`rows={6}` textarea must show multi-paragraph structure without scrolling).
- **1.5** (XSS-safe formatted rendering) → VACUOUS BY CONSTRUCTION, retained as a negative constraint: no `dangerouslySetInnerHTML`, no HTML parsing, no markup interpretation on the body path. Flagged as blocking if violated — it is precisely the AC a future "let's just add marked" PR breaks.
- **1.3** inverted: markup-looking characters must render **literally**; no markdown/rich-text dep added to `client/package.json`.

Deleting a vacuous AC reads as an oversight and invites re-litigation; striking it with the replacement stated inline does not.

### Non-formatting defects are genuinely independent — with one intra-issue coupling I had to add

Sections 2 (signature), 3 (sender), 4 (layout), 5 (reset-X CSS) do **not** depend on the formatting model. Two caveats found on disk:

- **§2 ↔ §3 are coupled to each other**, in code today: `applyOverrides.ts` L66–68 recomputes `signature` from an overridden sender (`sender.split('\n')[0]`), `types.ts` L44 documents `signature` as `DERIVED`, and `realRender.test.ts` L997 pins the recompute. Making signature first-class means a sender edit must stop overwriting an explicit signature, and that test must be **updated, not deleted**. Filed as new **AC 2.6** — would otherwise have been a review-time surprise.
- **Paragraph *spacing* moved §1 → §4.** With no markup carrying paragraph semantics, whether a blank line stays a full empty line or becomes typographic spacing is a layout call. AC 4.1 amended to own it.
- §5 (reset-X) is pure shared-component CSS and is fully severable — could be split out if #1932 ever needs shrinking.

### #1925 fold-in unaffected

All four carried ACs stand verbatim — #1925 is the date **caption** in the letter head plus caption chrome styling, neither of which touches the body model. Added a note above section 6 saying so, so the ruling isn't read as having disturbed the fold-in.

### #1939 → #1932 handoff (blocked-by is a single edge)

`#1932 blockedBy` = **only #1939** (verified via GraphQL `blockedBy(first:10)`). PR **#1948** open, no review posted yet. Clear the edge as soon as #1948 merges; nothing else gates #1932. Post-#1939 facts recorded in #1932's Notes for the implementer:

- **`PDF_STYLES` is defined in `pageGeometry.ts`** and re-exported from `merge.ts` (existing `from './merge.js'` imports keep working) — new letter styles go in `pageGeometry.ts`, which must **never** import from `merge.ts`.
- **`HEADER_ROW_HEIGHT_MAX`** is a ceiling (68pt vs 45.81pt measured), not an estimate. The cover letter ends with a hard `pageBreak: 'after'` so it never shares a page with the table — if #1932's implementation reaches for the constant at all, the layout approach has drifted.
- #1932 should not touch `overviewPdf.ts`; #1937 owns that file's German-header work.

## #1932 reviewed — PR #1951 APPROVED round 1 (2026-08-02)

All 40 ACs met on `c17d9d44` + the locally-committed E2E follow-up `d60a98b3`. Provisional local runs: 149/149 (applyOverrides + coverLetterPdf + prompts), 63/63 (realRender), stylelint exit 0.

### Rulings worth reusing

- **AC 1.2 — a line-count-plus-spacing proof satisfies a "real render" AC.** `.positions.length` read off a node after `getBlob()`, plus uniform non-zero inter-line gaps, is *sufficient* proof that typed line/blank-line structure survived — no per-line text reconstruction needed — **when the body is a single text node whose `.text` is separately asserted byte-identical**. It genuinely discriminates: a collapsed blank line gives 3 not 4, and a per-token inline-run reflow (the #1929 `wordBreak` technique) destroys `\n` and fails. `._inlines` is the wrong signal — LayoutBuilder drains it to `[]` via `.shift()`; `.positions` is what survives with the right cardinality.
- **"Updated, not deleted" is satisfied by "kept intact and still correct."** `realRender.test.ts:1057` (sender-override recomputes signature) was left untouched and still passes — it now describes the *fallback* branch. My AC's real concern was deletion of the pin. Downgraded the un-reworded title to informational; the adjacent AC 2.6 test is the actual guard against restoring the unconditional recompute.
- **Chrome-vs-content adjacency in different languages is correct, not broken.** `closingLabel` ("Grußformel", interface `t()`) sitting directly above `closing` ("Sincerely,", `reportT`) is #1909's rule applied consistently — same relationship "Betreff" already has with English subject text. Stacking them **vertically** is what makes it read as caption-and-artifact rather than one broken sentence. This is also the whole basis of Option B below.
- **#1925 Option B (restyle caption as chrome) beat Option A (`reportT` the caption)** because Option A would have fixed AC 6.1 by breaking AC 6.2 — every sibling caption in that panel is interface-language, so translating only one makes it the single inconsistent caption.
- **Duplicate closure transfers ownership; it does not require every AC independently green.** Closed #1925 (board Wont-Do) with one AC only partially met, moving that residual to a MUST FIX on the PR where it would actually be acted on. Keeping it open would track the same work twice.

### My own AC-transcription error — second instance of this failure mode

**#1925 has SIX ACs; my #1932 §6 carried four** and I wrote "all four carried ACs stand verbatim." Dropped its AC3 (PDF date stays bare/label-free) and AC5 (unit pins both sides). Both had to be checked at review time, and AC5 turned out **partial** — the PDF side is pinned by exact equality, the editor side pins only pre-existing behaviour, not the colon-free caption that *is* the fix. **Rule: when folding issue B into issue A, count B's ACs and map every one explicitly — a dropped AC surfaces as an unverified claim at close time.** Companion to the #1933 AC 2.1/2.7 entry (ACs that misdescribe reality); this is ACs that silently go missing.

### Findings filed as MUST FIX on #1951 (non-blocking)

1. **German `closing` carries a comma** — `"Mit freundlichen Grüßen,"`. DIN 5008: **no comma** after the Grußformel; English `"Sincerely,"` correctly takes one. One-char `de`-only fix. Recurring class: translator mirroring English punctuation into a locale with a different convention.
2. **New Closing read-only row has zero unit coverage** — deleting the JSX leaves every test green, so AC 4.2's preview-mirroring is unpinned.
3. **#1925 AC5 editor-side pin missing** — nothing asserts the date caption renders colon-free.

Also flagged: stray untracked `client/src/lib/reportPdf/__scratch_ux1951.test.ts` (ux-designer's scratch render test, claimed deleted, wasn't; not gitignored → `git add -A` would sweep it in), and re-run `ci-wait.sh` after pushing `d60a98b3` since the green on `c17d9d44` predates the E2E suite change.

### AC 7.3 ordering ruled correct

E2E belongs in the PR that closes the story, not a follow-up issue — deferring lets the story merge with a documented AC unmet. Scenarios 21–24 pair viewport with theme (desktop+light, mobile+dark) rather than a full 2×2; accepted as the existing convention in that spec file. **#1932 stays out of Done until UAT** — the user rejected the prior output by looking at a generated PDF, so acceptance is a human reading a real exported cover letter in EN and DE (same merge-gate-vs-Done-gate split as #1931).
