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
