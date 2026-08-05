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
- **#1930 — Attachment tier rules per report type** (`user-story`, Should Have). Replaces the per-invoice stage matching in `sourceReportService.ts` step h (~L286–339). **Tier order quotation(1) → deposit(2) → invoice(3); floors: budget-overview=1, claim=2, proof-of-funds=3; embed at-or-above the floor.** Depends only on report type + document type — no longer on invoice status, deposit split, or `targetStatuses`. **PR #1942 APPROVED round 1 (2026-08-02)**, all 11 AC met, 80/80 green. **But see #1943** — the architect found a frontend route that reaches AC2's forbidden outcome without violating AC2: `handleUseCaseChange` (`ReportWizardPage.tsx` L198–224) never clears `report`/`reportStatus`/`sourceId`, and step 2's Next is gated on `disabled={!sourceId}` (L686), which survives. Switching **budget-overview → claim** and clicking through carries a report filtered at the _budget-overview_ tier floor into a claim export → **quotations embedded in a claim PDF handed to a bank**. Pre-existing (staled invoice slice + totals all along), but #1930 raised the consequence from a reconciliation error to an evidentiary one. Filed `bug` / **Must Have** / Todo, 2026-08-02; cross-referenced on #1930 (`issuecomment-5158312814`). **My ruling, recorded so it isn't re-litigated: clear `sourceId` too**, not just `report` — clearing `report` alone leaves the `!sourceId` gate satisfied, trading a stale-data bug for an empty-state bug. Clearing `sourceId` restores "step 3 is reachable only after an explicit source selection under the current use case", the same invariant step 1→2 already enforces; the extra click lands on a source list whose amounts were just re-fetched for the new use case. Watch the `?sourceId=` deep-link effect (L255–260, keyed on `!report`) — clearing `report` re-arms it, so #1943 AC8 requires that interaction be reasoned about explicitly. **Generalisable lesson: an AC that constrains a server-side derivation is not satisfied until the client is proven to re-derive it whenever its inputs change — check the state-reset paths, not just the computation.**
- **#1931 — Single "Enhance with AI" action + purpose-focused prompt** (`user-story`, Should Have). Drops the step-4 "Enable AI assistance" toggle entirely (it gated nothing but a button), renders one button when `llmEnabled`, relabels "Generate with AI" → "Enhance with AI", and rewrites the prompt to explain **why** each cost was incurred rather than restating the table columns.
- **#1932 — Cover letter overhaul** (`user-story`, Should Have). Formatted body (no markdown lib in `client/package.json` today — deliberately left as an architect/UX decision), explicit editable signature field + signature block, sender = user `displayName` + household address, professional letter layout, and the oversized reset-`X` fix.
- **#1933 — Select Invoices step UI fixes** (`bug`, Should Have). Wrong glyph, no open-invoice affordance, misaligned select-all, misaligned deposit dates cell.

### Rulings made while writing these — do not re-litigate

- **`attachmentType: null` = tier `invoice`** (#1930). Rationale: nulls are legacy/ambiguous, not known-weak evidence — the invoice-creation Paperless picker hard-sets `'invoice'`, so nulls come from pre-#1877 links and from users skipping the type choice. Treating null as the _lowest_ tier would silently drop evidence from claim/proof-of-funds reports for existing data, which is worse than being over-inclusive (the user can deselect). Treating it as tier 3 is exactly no-regression while still stopping typed quotations from reaching claim reports. **This supersedes #1888's deferred design question** — #1888 stays open but is re-scoped to indicator _presentation_ only.
- **Server-side single filter** (#1930 AC7). `merge.ts` embeds whatever `invoice.documents` holds and `ReportInvoiceList` lights on `documents.length > 0`, so filtering once server-side makes step 3 and the PDF agree for free. Never add a second client-side document filter.

### #1930 shipped — PR #1942 APPROVED (2026-08-02, round 1)

All 11 ACs met on head `4dfce4b8`; 80/80 tests green. Implementation is `server/src/services/shared/attachmentTierUtils.ts` (`ATTACHMENT_TIER`, `REPORT_TYPE_TIER_FLOOR`, `isDocumentIncludedForReportType`) — the single site for both the ordering and the floors. `splitByDepositsExcludingTagged` is gone from `sourceReportService`'s document path (still used by `budgetSourceService` for amounts — the #1930 Notes' "do not delete it" meant the util, not the local variable). Wiki `API-Contract.md` @ `a9b6e9e`.

- **QA deviation accepted**: AC1's table-driven scenario uses a _fresh invoice per report-type block_ rather than one shared invoice queried three times. Correct call — no single invoice status sits in all three target slices (proof-of-funds needs `claimed`, which the claim slice excludes), so a shared fixture would have varied invoice-selection, the wrong variable. Status-invariance is proven separately by the `AC5` test. **General rule: when a table-driven test can't hold every variable constant, isolate the variable under test per block and prove the invariance claim in its own named test.**
- **Non-change-detecting tests are acceptable when the contract is asserted correctly** (informational finding I1). The proof-of-funds blocks of `scenario 16` and the `AC3` test would also have passed on `beta` (old stage derivation for a `claimed` no-deposit invoice also produced `stages={invoice}`). Flagged, not blocked — the ACs describe outcomes, and change-detection lives in the unit test plus AC1's budget-overview/claim blocks.
- **#1888 re-scope APPLIED** (issue body rewritten 2026-08-02, was still stale at review time). Null-handling AC replaced by a pointer to the tier ruling; the "attached but not stage-matched" third state struck (non-qualifying docs never reach the client now); a "no client-side filtering" AC added to protect #1930 AC7; coordination note with #1933 (same glyph) added. **Lesson: a supersedes-ruling written into issue A does not update issue B — apply the re-scope to B's body at the same time, or it will be found stale at review.**
- **#1909's "signature derived from sender" acceptance is REVERSED** (#1932). It was accepted at review time on the reasoning that `sender.split('\n')[0]` (the household name) was an adequate signatory; the user saw the output and rejected it. Record reversals like this rather than re-arguing them.
- **#1925 closes as a duplicate of #1932** when #1932 lands; its ACs are carried forward verbatim as #1932 section 6. #1925's own Notes already anticipated this.
- **The `Konstruktionsprojekt` prompt nit moves from #1917 to #1931.** `buildReportContentUserPrompt` L153 inverts the language ternary and is wrong in both branches; #1931 rewrites that prompt wholesale. #1917 keeps everything else, incl. the M2 `computeIncludedTotal` extraction and the `KI` glossary entry.
- **Prompt/validator cap divergence** (#1931). Prompt states 150/2000/200 (subject/body/description); `openAICompatibleProvider.ts` truncates at 200/3000/300. Resolution: one shared definition, effective values **150/2000/200** — the tighter set, partly because long descriptions aggravate #1929's Usage-column overflow. But #1929's ACs must hold at _any_ length, since the step-5 editor is unbounded; neither issue may lean on the other. **Reaffirmed unchanged 2026-08-02** when ruling on #1929's AC conflict — a UI `maxLength` was explicitly rejected as the safety mechanism (see next entry).

### #1929 AC2-vs-AC4 conflict — ruling of 2026-08-02 (issue comment `5156932089`)

PR #1935 got CHANGES_REQUIRED from both `product-architect` and `ux-designer`. Architect measured real pdfmake 0.3.11 renders: `dontBreakRows` on an unbreakable row **taller than one page** makes pdfmake **silently drop the row's content** (cliff ≈ 475 chars in the 7-col shape, flat at 14 text-show ops from 500 chars to 3000). So AC2 ("no characters dropped") and AC4 ("no row split across pages") were mutually exclusive at unbounded length. Ruling, now in the issue body:

- **Precedence ladder replaces flat peer ACs.** I1 no character lost > I2 nothing outside the printable area > I3 row stays on one page > I4 no word broken. Lower number wins on conflict. **I3 yields to I1** (option (a)): a row that _can_ fit one page is never split; a row that genuinely cannot may span pages, but content is never silently dropped. Rationale: a split row is visible and recoverable (repeating header + reconcilable totals); a dropped row is undetectable in a document handed to a bank. Integrity > presentation.
- **AC2's "no word cut mid-word" was over-broad and got rewritten.** It described the _clipping_ defect, not typographic line-breaking. As written it created a second latent contradiction: a pdfmake `'*'` column never renders below its widest word's width (`columnCalculator.js:66-75`), and `Wärmedämmverbundsystem` = 128pt at 10pt Roboto, so AC1 was unsatisfiable for unbounded German compounds. **Now: a word may be broken across lines iff it is wider than its column alone, losing no character.** This is what made the contract satisfiable — the general lesson is to check whether an AC forbids a legitimate mechanism while trying to forbid a defect.
- **Rejected (b) truncation** (data loss on a bank document, politely announced) and **(c) a step-5 `maxLength`** — a UI cap is a UX affordance, not a correctness guarantee: it doesn't close the hole (vendor name + area line + attachments can still overflow a row), it isn't the only ingress (#1901 AI generation), and it puts a renderer invariant two layers away. A soft counter/hint is fine as separate future work — deliberately **not** filed.
- **Targets set** (7-col shape, worst-case other columns, measured not estimated): **600 chars** of German prose with zero degradation (3× #1931's 200 target, 2× the 300 validator cap); Usage column fits **~30 chars of German prose per line** (69.28pt / ~14 chars is a collapsed column in product terms); table body font floor **8pt**.
- **Permitted levers widened, scope unchanged** (still presentation-layer only): padding, border widths, table body font down to 8pt, column widths, fixed-vs-star, page margins, and the row's internal layout — including taking the usage stack out of the 7-column grid into a full-width sub-row. The column grid is _not_ fixed by the issue. 7 real columns + a prose column on A4 portrait is genuinely tight; say so explicitly or the implementer assumes the grid is a constraint.
- **No continuation marker** on split rows — needs page-aware rendering, too much risk on a blocking Must Have, case is rare once columns are right.
- **New ACs**: AC12 (measure the ceiling from real renders, record it in the issue _and_ a code comment, pin with boundary tests both sides), AC13 (running header survives an unbounded `sourceName` — architect's MEDIUM 5), AC14 (falsy-`statusText` malformed-row crash at `overviewPdf.ts` L~160, verified: 6 cells pushed against a 7-entry `widths`). AC11 strengthened: config-only assertions don't satisfy it; AC1–AC4 each need a real-render assertion. **Fix order is part of the contract**: geometry first, _then_ the unbreakable-rows flag, then the residual over-tall row — reversing it converts a visible defect into silent data loss.
- **Process lesson**: both this round's CRITICAL findings and my own AC conflict came from configuration asserted in a comment rather than measured against a real render (`dontBreakRows` on `layout` where pdfmake never reads it; a Usage width documented as 185.28pt that renders at 69.28pt because pdfmake subtracts ~116pt of cell offsets first). For any PDF/layout AC, require the assertion to be made against the rendered result.

## #1929 closed — PR #1935 merged 2026-08-02 (squash `1c5aa62c`), 4 rounds, 5 follow-ups filed

Merged after four implementation rounds. Both `product-architect` and `ux-designer` reviewed by **rendering and rasterizing real PDFs** (throwaway Jest test → `/tmp` blob → `pdftoppm -r 150/300` → inspect PNGs), not by reading config — that technique is what caught every round's defect and is now the standard for any PDF-layout review here.

**The four-round arc, as a generalisable lesson** (architect, round 3): _"every cell that can hold unbounded text needs the cap, not just the first one that was noticed. Round 1 capped nothing, round 2 capped the wrong quantity (average glyph + perfect packing), round 3 capped the right quantity in the wrong scope (one field of a multi-field cell)."_ Round 4 finally capped the right quantity at cell scope. When an AC is about a bound, ask **what quantity, at what scope** before accepting the fix.

Final state worth knowing: table width is now **exactly 515.28pt, unfalsifiable by input** (no `'*'` column left; 22 pathological cases all identical to the hundredth). `MAX_SAFE_USAGE_CHUNK_CHARS = 650`, `MAX_SAFE_SMALL_CHUNK_CHARS = 450`, `PAGE_TOP_MARGIN = 75`, table body font 8pt, `VENDOR_WIDTH = 45pt`. AC12's 600-char zero-degradation guarantee holds.

### Follow-ups filed 2026-08-02 (all parentless, Bank Report Wizard cluster)

- **#1937 — German header labels break mid-word** (`bug`, Should Have, **Todo**). `Auftragnehmer` 67.50pt in a 45pt column, `Rechnungsbetrag` 78.66pt in 48pt. pdfmake 0.3.11 has no hyphenation mode; widening was **measured and rejected** (drops Usage to ~79pt, fails AC3's ~30-chars-per-line floor). Fix is at the **i18n layer** — 2 finite translator-owned strings in 1 locale, not an engineering fix. Ranked near-term because it shows on _every page of every German report_, unconditionally.
- **#1938 — running header `generated at` label with no timestamp on pages 2+** (`bug`, Should Have, **Todo**). `merge.ts` L163–167 passes only `t('sourceReports.table.generatedAt')`; page 1 does it right at `overviewPdf.ts` L333 (`${label}: ${generatedAtText}`). **Pre-existing**, verified against `origin/beta` — not a #1929 regression.
- **#1939 — reportPdf geometry hygiene** (`tech-debt`, Should Have, **Todo**, **blocks #1932**). `HEADER_ROW_HEIGHT` → `HEADER_ROW_HEIGHT_MAX` (exports 68pt vs measured 45.81pt — correct _bound_, wrong _estimate_, and #1932 could under-fill whole pages reading it as typical); scope the `WORST_CASE_CHAR_ADVANCE_EM` comment (overclaimed at 0.89 and again at 1.04 — a 3,919-codepoint sweep found Cyrillic `Ѹ` U+0478 at 1.1611em; **value stays 1.04**, raising it drops the 7-col threshold 19→16 chars and breaks more German compounds); enumerate cell-content channels; relocate `PDF_STYLES` **down** into the geometry layer.
- **#1940 — continuation rows read as broken** (`enhancement`, Could Have, Backlog). The deferred "Could Have" from the #1929 ruling, now _observed_: `splitIntoPageSafeChunks` has no minimum trailing-chunk floor, so a row can carry a **single stray character** with all other columns blank. Only above the chunk ceilings, i.e. beyond AC12's guaranteed 600-char range; no data loss (I1 holds).
- **#1941 — editable override fields have no length limit** (`enhancement`, Could Have, Backlog). Zero `maxLength` in `client/src/components/reports/` or `EditableField/`; `attachmentsNote` is a client-side override that never round-trips, `areaText` is aggregate-unbounded (N × 200). **No longer a correctness risk** — round 4 bounded the renderer at cell scope. Input-side gap only.

### #1950 — guard test for the derived `Ѹ` ceiling (filed 2026-08-02 from PR #1948 round-3 review)

`tech-debt`, **Could Have**, Backlog, **blocked-by #1939**. Filed off the architect's PR #1948 approval comment ([5160266124](https://github.com/steilerDev/cornerstone/pull/1948#issuecomment-5160266124) §2), which **reframed its own earlier ask**: the deliverable is _not_ re-running the 3,919-codepoint sweep, it's a **guard test that recomputes** the derived ceiling from `USAGE_WIDTH_7COL` / `TABLE_BODY_FONT_SIZE` / `TABLE_SMALL_FONT_SIZE` / `DEFAULT_LINE_HEIGHT`. Sweep left out as an explicit **non-goal**, not an optional AC — an "optional" AC isn't binary and makes the issue unfalsifiable.

The risk being guarded: `MAX_SAFE_USAGE_CHUNK_CHARS` (650) is **34 chars / 3 lines / 33.6pt over** its _derived_ `Ѹ` ceiling of 616 (`44 lines × 14 chars`). Accepted on **input reachability** (needs 650 unbroken chars of archaic Church Slavonic Uk in one Usage cell), and because a `Ѹ`-safe value must sit in `[600, 616]`, collapsing AC12's margin over its 600-char floor from 8.3% to ~2.7%. `MAX_SAFE_SMALL_CHUNK_CHARS` (450) is genuinely safe (11.2% under 507). **Not a request to change 650** — the architect is comfortable with the risk.

Three durable rulings, all written into the issue rather than left implicit:

- **Comment and issue both, never one instead of the other.** The rationale stays in the code comment (AC 2.1 forbids moving/shortening/replacing it; AC 2.3 pins 650/450/1.04 and every width byte-identical) because _"anyone changing 650 or a column width reads that comment, not an issue tracker. Moving it out recreates the provenance loss that produced #1939."_ The issue owns the **guard**; the comment owns the **rationale**.
- **Bounded-quantified vs unbounded-estimated is the line for "does this deserve a tracked owner."** `markerText` is unbounded with an estimated break-even → documentation only (folded into #1939). This is a bounded constant _provably_ 34 chars past a derived ceiling → _"a quantified exceedance is a standing accepted risk with a number on it."_ I would have collapsed these two; don't.
- **A derived bound with no test is a comment waiting to go stale.** Verified live: `overviewPdf.test.ts` pins `MEASURED_TRUE_CEILING` as re-typed `704`/`546` literals referencing **no geometry constant**, so widening the Usage column leaves them green while the real ceiling moves. Generalise: when a review accepts a _derived_ number, ask what fails if its inputs change.

AC 1.3 fails in **both** directions (growth widens a reviewed risk; shrinkage makes the comment's figure wrong). AC 1.6 keeps the measured 44/39-line budgets as the sole pinned literals, labelled as real-render measurements. The architect's two "informational, do not re-round" cosmetics (`~2.6%`→`~2.7%`, the self-asserted-infallibility sentence) were **already fixed at head `a6871975`** — checked before deciding, nothing folded in.

### Merge/scope decisions in this triage

- **`markerText` (unbounded, ~250-skipped-doc break-even) and `invoiceNumber` (unbroken, capped at 100) were folded into #1939 as a documentation-only AC**, not filed separately. Their value is entirely "the next person reading this file knows the enumeration"— the same category as the comment-scoping work, and a standalone Could Have would never be picked up. AC7 + a scope guard forbid actually implementing a bound for them.
- **Vendor _data_ breaking mid-word was recorded as an accepted limitation in #1937's Notes, not filed.** `ux-designer` round 4: at 45pt/8pt any 14+ char word breaks, and German trade names compound freely (`Rückerstattung` → `Rück`/`erstattung`) — a non-trivial minority of realistic names. Not filed because it is unbounded user data, AC2 permits it, nothing is lost, and the only lever (widening Vendor) costs Usage width and breaks AC3. Revisiting it needs a layout change, not a width tweak.
- **`PDF_STYLES` relocation had been deferred _to_ #1932 in the round-3 review but never entered #1932's ACs** — it now lives in #1939 §4 so it isn't lost. Watch for this pattern: "we'll handle it in issue X" is only real if it lands in X's acceptance criteria.
- **Not filed:** the page-1 `PAGE_TOP_MARGIN = 93pt` blank gap above the cover-letter sender block — already inside #1932 AC 4.1; flagged on #1932 rather than duplicated.
- `addBlockedBy(#1932 ← #1939)` set, plus a prominent sequencing comment on #1932 (`issuecomment-5158212341`) covering the block, the `PDF_STYLES` direction constraint (`pageGeometry.ts` must **never** import `merge.ts` — that edge already runs the other way), and the #1941/#1938 shared-ground warnings.

## #1931 reviewed 2026-08-02 — PR #1944 APPROVED round 1, with two ACs deliberately unclaimed

All ACs met except 3.2/3.3, which were **not marked met** and were carried to UAT instead. Verified individually on `980c51a2` (109/109 local on `prompts.test.ts` + `contentLimits.test.ts`).

### The ruling worth reusing: unverifiable-AC precedent

AC 3.2/3.3 assert **live model output quality** ("reads as a purpose statement", "idiomatic German, no anglicised calques"). A mocked LLM returns the fixture author's prose, so a test claiming to verify them asserts the fixture, not the model — **worse than no test**, because it shows a green check against an unverified criterion. QA correctly wrote none.

**Ruling: merge is a code gate, Done is an acceptance gate — keep them apart.** Approved the PR (everything code can deliver is delivered; holding the branch gets nobody in front of a live model sooner and accumulates rebase risk), but **#1931 stays out of Done** until a human reads real EN and DE output with `LLM_*` configured. Posted Given/When/Then UAT scenarios on #1931 (fixture shape: 5+ invoices, mixed budget-line coverage, one with `notes`, both-interface-languages pass for 3.3). If UAT fails → **reopen #1931**, don't file a follow-up: they are its own unmet criteria.

**Contrast with the #1909 AC 4.6 acceptance**: there a real contract-level substitute existed (CSP `frame-src` assertion once headless Playwright proved to have no PDF viewer), so a documented deviation was right. Here there is no substitute at all. **An unverifiable AC with a substitute may be waived as a documented deviation; one without a substitute goes to UAT.**

### Other rulings

- **"Mit KI verbessern" accepted for AC 2.3.** My AC deliberately did not prescribe the string ("an equivalent in German that uses 'KI', consistent with existing `de` copy") — wording is `ux-designer`/`translator` territory. _verbessern_ (improve existing) over _überarbeiten_ (rework) is right and matches the English: the whole point of renaming Generate→Enhance was that the action improves content that already exists; _überarbeiten_ would reintroduce in German the overstatement removed in English.
- **Unconditional `aria-describedby` description accepted as in-scope** though not literally in an AC: deleting the checkbox deleted its helper text, which was the only place overwrite behaviour was explained. Dirty-gating it would hide the warning from the user who most needs it.
- **Good AC-writing pattern to repeat**: AC 4.1 asked for "exactly one definition that both sides derive from". `contentLimits.test.ts` satisfied it by building its expected substrings _by interpolating the constant_, never typing the literal — so a hardcoded number reappearing in `prompts.ts` fails the assertion instead of silently passing. Ask for derivation, not equality.
- Non-blocking follow-ups left on the PR (not filed): user-prompt tail still says `letterBody` "summarizing the report" (old framing, weaker instruction sitting closer to the output — first suspect if UAT 3.4 fails); stale E2E locator name `generateWithAiButton` vs the "Enhance with AI" accessible name.

### #1917 bookkeeping done

**L3 struck from #1917's body** (comment `issuecomment-5158606180`) after verifying the ternary is gone, both branches emit the fixed literal `German construction project`, `Konstruktionsprojekt` is absent from source, and `prompts.test.ts` pins its absence. No `Bauprojekt` rename needed — no German noun remains. **Rest of #1917 open and unchanged**: M1–M4, L1 (`sourceId!` re-verified still at `ReportWizardPage.tsx:574`), L2, L5, and the **`KI` glossary entry — still #1917's, not absorbed**: PR #1944 does not touch `glossary.json` and the file still has no `KI` entry.

## #1945 review follow-ups filed 2026-08-02 — #1946 (M2) and #1947 (M3), plus #1943 amendments

`product-architect` APPROVED PR #1945 (#1943) with three mediums. **M1 was fixed inside PR #1945 rather than filed** — the precedent below is the reusable part.

### The M1 precedent: a finding that defeats the PR's own AC is not a follow-up

M1 was an untokenized `getSourceReport` race — an in-flight fetch from the _previous_ use case could win an out-of-order resolution and re-populate `report` while step 3 was reachable, reaching **exactly the #1943 end state** (claim export embedding quotation-tier docs). Filing it would have marked #1943's AC1 met while a live route to the headline defect remained open. Fixed in-PR with a monotonic `reportRequestRef` token (`ReportWizardPage.tsx` L146/229/269/274/281). **Rule: a review finding that defeats an AC of the story under review belongs in that story's PR, regardless of the reviewer's medium/low severity label** — reviewer severity answers "does this block merge", not "is the AC actually met".

### #1946 (bug, **Must Have**, Todo) — in-flight AI generation survives a use-case change

`runAiGeneration` resolves into `setAiContent(result)`; while generating, `aiContent` is `null`, so `guardedUpdate`'s dirty predicate is false and a use-case change applies **with no confirmation**. Post-#1931 the prompt is purpose-focused and the request carries `type: useCase`, so the landed result is narrative written for the **wrong report purpose** — the architect's point that the _mechanism_ is symmetric with a source change but the _consequence_ is not.

- **Must Have despite the architect's "Medium"** — recorded on the issue to stop re-litigation. Medium-for-PR and MoSCoW are different scales; the architect explicitly asked for it before the cluster's `beta`→`main` promotion. Same blast radius as #1943/#1929: credibility of a bank-facing artifact.
- **Product ruling on the discard question (option b of three)**: widen `guardedUpdate`'s dirty predicate to include `isGeneratingAi` → the confirmation runs; confirm invalidates the in-flight request via a token, cancel lets it finish. Rejected (a) silent invalidation — generation is slow (visible elapsed timer) and metered, the guard exists to protect content that isn't cheap to recreate, and an in-flight generation _is_ that, just not arrived. Rejected (c) block-until-settled — freezes the wizard for up to `LLM_REQUEST_TIMEOUT_MS` and invents a trapped-behind-a-hung-request failure mode. **Never trap a user behind a network call they can't cancel.**
- **Widen the predicate inside `guardedUpdate` itself, not per-handler** — every caller mutates an AI-request input or the baseline; one place makes the invariant structural, which is the whole lesson of #1943. Closes the symmetric source-change variant for free.
- AC12 explicitly **forbids new E2E**: a late-resolving stale response is invisible to the assertions (architect's own analysis of scenarios 13/14). Deterministic unit test with controlled promise resolution, not a timing spec.

### #1947 (tech-debt, **Should Have**, Backlog, blocked-by #1946) — `useReducer` refactor

1,156 lines / 38 hooks; the "what a transition invalidates" invariant is hand-maintained across two handlers. **Filed as its own issue, NOT folded into #1912** — #1912 is a Could Have grab-bag of cosmetic nits; folding a state-machine refactor in would bury it behind a Could Have label, make #1912 un-sizable, and lose the evidence trail, which _is_ the justification.

- **The evidence table is the argument**: one handler produced four defects of one shape in one batch — #1943 (transition didn't invalidate state it owned), its AC8 deep-link second-order effect (the fix created the next bug), M1 (pending write re-populated cleared state), M2/#1946 (same, plus the guard couldn't see what it guards). Two of the four were _caused by the patch before them_. Put that table in any future "should we refactor" argument.
- **Should Have, with a checkable trigger instead of a vague "soon"**: _the next change that adds transition-owned state to this component should be preceded by this refactor._ Raise at refinement if a report-wizard state story lands while it's open.
- Architect's **L3** (`deepLinkAppliedRef` boolean → `useRef<string|null>`) folded in as a nice-to-have per coordinator — the applied id is immutable for the component's lifetime (sole `?sourceId=` producer is a cross-route `navigate()` from `BudgetSourcesPage.tsx:1318`), so a boolean is sufficient today.

### #1943 body amended + audit comment (`issuecomment-5159716825`)

- **AC4 reworded — original was unsatisfiable by design.** "always identical to a clean start" is violated by `attachDocuments` and `reportLanguageOverride`, which are _correctly_ sticky. **A UAT tester reading it literally would have failed the story for working as designed.** Now scoped to the `getSourceReport` payload, the exclusion sets, and the tier floor, with the two preferences named as out-of-scope. **Pattern to watch: an equivalence AC must name what is excluded, or sticky user preferences will read as failures.**
- **AC5 enumeration completed — `skippedDocuments` and `aiError` were omitted, both ruled CLEAR** (not KEEP, against the architect's "probably fine"). `skippedDocuments` is only overwritten on a _successful_ generation, so a later failure re-displays the previous report's warnings against a new report — in a bank-facing flow. `aiError` can hold `EMPTY_SELECTION`, raised from exclusion sets this very reset clears, so it's guaranteed inapplicable. Both one-line, zero reachability risk.
- **Carried as #1946 AC9/AC10, not by reopening #1943** — the PR is approved and neither is a defect in what it shipped; the gap was in the enumeration, which now lives on the issue. Said so explicitly on the comment so the addendum doesn't read as goalposts moving after approval.

## #1933 ACs 2.1/2.7 corrected 2026-08-02 — AC described a layout that doesn't exist

Both ACs were written against "the mobile card" for the invoice row. **There is no mobile card for the invoice row**: `.invoiceRow` is a single CSS Grid at every viewport (`ReportInvoiceList.module.css` L35–43, no media-query override). The file's only breakpoint (`@media (max-width: 767px)`, L363) swaps `.tableWrapper` for `.mobileCardList` on the **nested** budget-lines (`ReportInvoiceList.tsx` L355+) and deposits (L539+) sub-tables. Verified on disk before amending.

Reworded to "every viewport" with the 44×44px target **unconditional** (strictly stronger than the original mobile-only intent, and right for a checkbox-adjacent control at any pointer type), plus an explicit "do not introduce a card layout to satisfy this". `ux-designer` had already designed against the real structure rather than the AC's premise — agreed with that call. **AC 4.3's mobile-card reference is correct and was deliberately left alone** (the deposits sub-table really does have one) — noted on the issue so nobody "fixes" it by analogy.

### Recurring AC-writing failure mode — now seen twice in one day

#1943 AC4 (equivalence AC that didn't name its exclusions) and #1933 AC2.1/2.7 (AC premised on a layout that doesn't exist) are the same defect: **an AC that misdescribes the thing being built gets read literally at UAT and fails a correct implementation.** Both were caught by a reviewer designing/implementing against reality rather than against my text. Mitigations to apply when writing ACs:

- Before writing a viewport- or layout-conditional AC, **check the CSS for an actual breakpoint** — don't infer a responsive variant from the presence of `mobileCard` classes elsewhere in the same file.
- For equivalence/"identical to" ACs, **name what is excluded** or sticky user preferences will read as failures.
- When an AC is corrected on an open issue, annotate the AC inline with a date + pointer to the correction comment, and say in the comment _why_, so the original premise isn't reintroduced from memory of the old text.

## #1932 user scope ruling 2026-08-02 — plain text with line breaks, not markdown

Comments: `issuecomment-5160251632` (decision), `issuecomment-5160258752` (AC change log).

**User, verbatim: "no full wysiwyg necessary - just a simple text body with line breaks".** So: plain text, no markdown, no rich-text editor, **no new client dependency**. Bold phrases and bulleted lists are **out of scope** even though #1932's Problem section cites them as motivation. The issue's "Needs a design decision before implementation" note is struck — this is no longer an architect/UX call. `ux-designer` still owns letter layout (AC 4.4).

### Premise correction — the stated defect was largely false

**pdfmake already honours `\n`.** `node_modules/pdfmake/js/TextBreaker.js` L30–34 and L53–58 treat `\n`/`\r\n` as a _required_ line end, so a single text node renders embedded newlines as line breaks. The sender block has depended on this all along (`senderLines.join('\n')` in one node, pinned in `coverLetterPdf.test.ts` L80–90). The body's line-break round trip **already works and is merely unpinned**.

Consequence: #1932 section 1 collapsed from a feature build to **regression guards + one new requirement**. Worth keeping the guard anyway — the per-token inline-run technique used elsewhere in `reportPdf/` for pdfmake's all-or-nothing `wordBreak` would silently destroy `\n` handling if ever applied to the body. That is a working-but-unpinned behaviour with a plausible silent breaker, which is exactly what a test is for.

**Lesson: verify a "does not survive rendering" claim against the renderer's source before writing ACs around fixing it.** Cheap (one grep in `node_modules`), and it flipped this section's size.

### The plain-text ruling _created_ one requirement rather than removing it

**AC 1.6 is now load-bearing.** `server/src/services/budgetExtraction/prompts.ts` L~142 ("Letter body") says nothing about output format. An LLM asked for a business letter readily emits `**emphasis**` and `- bullets`; under plain-text rendering those print as literal asterisks in the PDF a bank reads. Same defect class as the #1916 prompt-input findings — **when a formatting model is simplified, re-check what the LLM prompt assumes about it.**

### Vacuous ACs: strike with a stated replacement, never delete

- **1.4** (formatting discoverability) → STRUCK, replaced inline by a negative (must not advertise formatting support) + a concrete ask (`rows={6}` textarea must show multi-paragraph structure without scrolling).
- **1.5** (XSS-safe formatted rendering) → VACUOUS BY CONSTRUCTION, retained as a negative constraint: no `dangerouslySetInnerHTML`, no HTML parsing, no markup interpretation on the body path. Flagged as blocking if violated — it is precisely the AC a future "let's just add marked" PR breaks.
- **1.3** inverted: markup-looking characters must render **literally**; no markdown/rich-text dep added to `client/package.json`.

Deleting a vacuous AC reads as an oversight and invites re-litigation; striking it with the replacement stated inline does not.

### Non-formatting defects are genuinely independent — with one intra-issue coupling I had to add

Sections 2 (signature), 3 (sender), 4 (layout), 5 (reset-X CSS) do **not** depend on the formatting model. Two caveats found on disk:

- **§2 ↔ §3 are coupled to each other**, in code today: `applyOverrides.ts` L66–68 recomputes `signature` from an overridden sender (`sender.split('\n')[0]`), `types.ts` L44 documents `signature` as `DERIVED`, and `realRender.test.ts` L997 pins the recompute. Making signature first-class means a sender edit must stop overwriting an explicit signature, and that test must be **updated, not deleted**. Filed as new **AC 2.6** — would otherwise have been a review-time surprise.
- **Paragraph _spacing_ moved §1 → §4.** With no markup carrying paragraph semantics, whether a blank line stays a full empty line or becomes typographic spacing is a layout call. AC 4.1 amended to own it.
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

- **AC 1.2 — a line-count-plus-spacing proof satisfies a "real render" AC.** `.positions.length` read off a node after `getBlob()`, plus uniform non-zero inter-line gaps, is _sufficient_ proof that typed line/blank-line structure survived — no per-line text reconstruction needed — **when the body is a single text node whose `.text` is separately asserted byte-identical**. It genuinely discriminates: a collapsed blank line gives 3 not 4, and a per-token inline-run reflow (the #1929 `wordBreak` technique) destroys `\n` and fails. `._inlines` is the wrong signal — LayoutBuilder drains it to `[]` via `.shift()`; `.positions` is what survives with the right cardinality.
- **"Updated, not deleted" is satisfied by "kept intact and still correct."** `realRender.test.ts:1057` (sender-override recomputes signature) was left untouched and still passes — it now describes the _fallback_ branch. My AC's real concern was deletion of the pin. Downgraded the un-reworded title to informational; the adjacent AC 2.6 test is the actual guard against restoring the unconditional recompute.
- **Chrome-vs-content adjacency in different languages is correct, not broken.** `closingLabel` ("Grußformel", interface `t()`) sitting directly above `closing` ("Sincerely,", `reportT`) is #1909's rule applied consistently — same relationship "Betreff" already has with English subject text. Stacking them **vertically** is what makes it read as caption-and-artifact rather than one broken sentence. This is also the whole basis of Option B below.
- **#1925 Option B (restyle caption as chrome) beat Option A (`reportT` the caption)** because Option A would have fixed AC 6.1 by breaking AC 6.2 — every sibling caption in that panel is interface-language, so translating only one makes it the single inconsistent caption.
- **Duplicate closure transfers ownership; it does not require every AC independently green.** Closed #1925 (board Wont-Do) with one AC only partially met, moving that residual to a MUST FIX on the PR where it would actually be acted on. Keeping it open would track the same work twice.

### My own AC-transcription error — second instance of this failure mode

**#1925 has SIX ACs; my #1932 §6 carried four** and I wrote "all four carried ACs stand verbatim." Dropped its AC3 (PDF date stays bare/label-free) and AC5 (unit pins both sides). Both had to be checked at review time, and AC5 turned out **partial** — the PDF side is pinned by exact equality, the editor side pins only pre-existing behaviour, not the colon-free caption that _is_ the fix. **Rule: when folding issue B into issue A, count B's ACs and map every one explicitly — a dropped AC surfaces as an unverified claim at close time.** Companion to the #1933 AC 2.1/2.7 entry (ACs that misdescribe reality); this is ACs that silently go missing.

### Findings filed as MUST FIX on #1951 (non-blocking)

1. **German `closing` carries a comma** — `"Mit freundlichen Grüßen,"`. DIN 5008: **no comma** after the Grußformel; English `"Sincerely,"` correctly takes one. One-char `de`-only fix. Recurring class: translator mirroring English punctuation into a locale with a different convention.
2. **New Closing read-only row has zero unit coverage** — deleting the JSX leaves every test green, so AC 4.2's preview-mirroring is unpinned.
3. **#1925 AC5 editor-side pin missing** — nothing asserts the date caption renders colon-free.

Also flagged: stray untracked `client/src/lib/reportPdf/__scratch_ux1951.test.ts` (ux-designer's scratch render test, claimed deleted, wasn't; not gitignored → `git add -A` would sweep it in), and re-run `ci-wait.sh` after pushing `d60a98b3` since the green on `c17d9d44` predates the E2E suite change.

### AC 7.3 ordering ruled correct

E2E belongs in the PR that closes the story, not a follow-up issue — deferring lets the story merge with a documented AC unmet. Scenarios 21–24 pair viewport with theme (desktop+light, mobile+dark) rather than a full 2×2; accepted as the existing convention in that spec file. **#1932 stays out of Done until UAT** — the user rejected the prior output by looking at a generated PDF, so acceptance is a human reading a real exported cover letter in EN and DE (same merge-gate-vs-Done-gate split as #1931).

## #1951 architecture-review follow-ups filed 2026-08-02 — #1952 (MEDIUM-1) and #1953 (LOW)

Architect's PR #1951 review ([comment 5160566459](https://github.com/steilerDev/cornerstone/pull/1951#issuecomment-5160566459)) verdict was CHANGES_REQUIRED on one HIGH (E2E Scenario 24 seeds neither `contactAddress` nor `reference`, so the cover letter never mounts and the scenario passes vacuously then hangs) — that gets fixed in the PR, not filed. Two non-blocking findings filed:

- **#1952** (tech-debt, Should Have, **Todo**) — the AC 1.6 plain-prose guarantee is prompt-level only. `validateGenerateReportContentResult` (`openAICompatibleProvider.ts` L316-390) type-checks and truncates; it strips no markup. Render path is literal end to end: `applyAiContent.ts` L39 → `coverLetterPdf.ts` L61 `{ text: coverLetter.body }`, no markup parser anywhere.
- **#1953** (tech-debt, Could Have, **Backlog**, blocked-by #1932) — `letterSubject` false-shares `SUBHEADER_FONT_SIZE`, which `headerFootprint()` L144 consumes to compute `PAGE_TOP_MARGIN`.

### Rulings worth reusing

- **Coerce-vs-reject at an LLM response boundary: match the policy the field already has.** Ruled #1952 as _strip_, not _reject_. Decisive argument was **blast radius per call**: one generation produces subject + body + every per-invoice description, so rejecting over two asterisks discards unrelated correct output, costs a second paid round-trip, and may fail identically on retry with the same model. Reinforcing: the validator already _truncates_ over-length values on these very fields, so adding a harsher policy for a _milder_ violation is incoherent; and the fields are human-editable in the preview, which makes repair-and-continue the right default with the human as backstop. Generalizable: **at an LLM boundary, prefer the repair that preserves the expensive parts of the response, and never introduce a stricter failure mode for a cosmetic defect than the one already accepted for a structural one.**
- **When a hardening AC's real risk is false positives, weight the ACs there.** #1952's §2 (six byte-identical-passthrough guards: `Pos. 3 - Dachstuhl`, `Rechnung #2024-117`, `Beträge < 500 EUR`, lone `*`, umlauts/`ß`/`€`, and the compliant-body case) is as long as §1 (the stripping itself). Reason recorded in-issue: a strip that mangles a reference number is worse than the markup, because the reader cannot tell a character went missing. Also AC 1.8 — if stripping empties a non-empty field, keep the original.
- **"Don't repeat the literal" is not "these are the same value."** #1953's whole ruling. The UX spec directed reusing `SUBHEADER_FONT_SIZE` with the rationale _"don't hand-write `fontSize: 12` as a second copy of that constant"_ — a magic-literal argument. Its design reasoning for the subject line ("bold + bumped size makes it read as a subject") is standalone and never references the running header. So the equality is **coincidental** and the fix is an **independent literal**; the architect's suggested `const LETTER_SUBJECT_FONT_SIZE = SUBHEADER_FONT_SIZE;` is explicitly ruled out because it fixes the name while preserving the coupling. **When a shared constant is challenged, read the sharing rationale for whether it argues DRY or argues semantic identity — only the latter justifies keeping the share.**
- **#1939's drift class has an inverse, and it needs filing too.** #1939 removed _two drifting copies of one value_; #1953 splits _one shared name over two values that happen to be equal_. Same symptom (an edit with a consequence the author never looked at), opposite cause. #1937 and #1938 are both open against that same running header, which is what makes the split worth doing _before_ they land.
- **Record an architect's deferral trigger in the file, not only in the issue.** `letterSubject` is the first `PDF_STYLES` entry with no geometry consumer; architect set the split trigger at the **second** one, target shape `pageGeometry ← pdfStyles ← merge`. #1953 AC 3.1 puts that in the `pageGeometry.ts` module header. Same principle as #1950's "comment owns the rationale, issue owns the guard" — a trigger recorded only in a closed issue is lost.
- **Amend an honest interim wiki statement, don't delete it.** #1932's PR adds "instructed but not enforced" to `API-Contract.md`; #1952 AC 4.1 says amend that bullet. Prevents the next author reading a stale "not enforced" line after enforcement lands.

### Two things deliberately NOT filed

- German trailing comma (`"Mit freundlichen Grüßen,"`) — already fixed in the PR; was also my own MUST FIX #1.
- **`react/no-danger` eslint rule** for AC 1.5 — architect said "I own `eslint.config.js`; I will take this as a follow-up." **Verified not filed** (latest repo issue was #1953 at the time). Left alone to avoid a duplicate and asked for it on the PR comment. **Pattern: when a reviewer claims a follow-up as its own, verify it exists before assuming; if it doesn't, prompt rather than file.**

### PR body staleness — checked downstream, clean

The "No new E2E coverage — deferred" line was already corrected (now lists Scenarios 21-24, checkbox ticked). Checked both propagation paths: no open `beta → main` promotion PR, and `RELEASE_SUMMARY.md` predates the report-wizard work entirely (it covers Cost Basis filter / auto-itemize merge / diary defaults) and is regenerated by `docs-writer` at promotion. Nothing downstream consumed the stale claim.

## PR #1959 rulings (2026-08-03) — footnotes removed, glossary short-form approved

`fix(reports): improve report PDF UX`, the **user's own PR**, held the `beta → main` promotion (#1958). Three product questions, all ruled without blocking promotion.

### The reversal: shared footnotes → inline labels

#1959 removed the `†`/`‡` markers **and their explanatory sentences**, replacing them with inline grey labels on the allocated amount: `(partial)`/`(Teilbetrag)` and `(less deposit)`/`(abzgl. Abschlag)`. This reverses **#1923 AC1.1, AC1.2, AC2.3, AC2.4** — which #1898 §4 had itself already been superseded by. `allocatedMarkers` gone from `types.ts`, replaced by `isSplit`/`isDepositReduced`.

**Ruling: labels accepted, sentences must come back as a report-level legend (#1965, Must Have).** The differentiator is _which_ sentence is load-bearing:

- `(partial)` is nearly self-evident — the table prints **Invoice Amount** and **Allocated Amount** side by side, so the label only has to name the reason for a difference the reader can already see.
- `(less deposit)` loses a **materially different claim**. The footnote said the deposit was claimed **separately** — accounted for in another submission. "less deposit" is equally consistent with the deposit never being claimed, and leaves a double-claim question open when it resurfaces. On a Verwendungsnachweis/Mittelabruf that has audit consequences.

**Generalizable: for outbound financial copy, ask what a label lets the reader _conclude_, not whether it is accurate. `(less deposit)` is true and still misleading by omission.**

**Why the fix is cheap (checked, load-bearing for the ruling):** the footnote _rendering channel is fully intact_ and merely unused. `buildReportContent.ts` declares `footnotes: ReportContentFootnote[] = []` (L232) and returns it (L289) but never pushes; `ReportContentEditor.tsx` L445-450 renders it; `overviewPdf.ts` appends `reportContent.footnotes` **verbatim** (pinned by the `overviewPdf.test.ts` case "appends reportContent.footnotes verbatim…", which is also the only surviving reader of the two i18n keys — as fixture text). So the legend is a **producer-only change** and preview/PDF parity comes free. **Pattern: before ruling a restoration too expensive, check whether the mechanism was removed or only orphaned.**

**Legend must NOT go in the cover letter** — it is user-editable (#1932), so an editable qualification can be deleted, silently removing a material statement from a financial document. Report-level and non-editable, like the existing footnote block.

**The orphan-key cleanup was deliberately NOT filed as a deletion issue.** `splitFootnote`/`depositReducedFootnote` are _consumed_ by #1965, so filing "delete these orphans" would race the legend. #1965 AC 3.2 pins retention; its Notes record deletion as the Wont-Do alternative. **Pattern: when a cleanup follow-up and a restoration follow-up target the same artifact, one issue must own both or the cleanup wins by arriving first.**

### What was NOT an AC reversal (checked, initially framed as one)

**#1923 AC5.3 substance survives.** The area name moved from a sub-line to an inline grey suffix, but `areaText` is **still a separate row field** (`buildReportContent.ts` L196/L214) and `applyAiContent.ts` still only assigns `row.usageText` (L50) — so AI-generated usage text cannot drop the area, which was AC5.3's _stated rationale_. #1923's own Notes delegated the area sub-line's **visual treatment** to `ux-designer`. So E2E Scenario 20's rewrite is a presentation change within delegated authority. **Pattern: an AC that states its own rationale should be judged against the rationale, not the prescribed rendering — that is what the rationale is there for.**

### Stale ACs on closed/released issues — comment, don't rewrite

Both #1898 and #1923 are CLOSED + `released on @beta`. **Ruled: do not rewrite their ACs; post a dated supersession comment** naming which ACs died, by which PR, what still holds, and where the new source of truth is. Rewriting a released story's ACs falsifies the record of what was accepted and loses the design reasoning. The standing "stale AC is a real defect" rule targets ACs that a _future_ implementer or UAT run will read as live spec — a supersession comment discharges that risk without destroying history. Posted on both (#1923 comment also lists the non-superseded ACs explicitly, since AC2.1/2.2/2.5/3/4 all still hold).

Also noted on #1898: its §4 has now been superseded **twice** (#1898 → #1923 → #1959). That churn is itself the argument that the footnote _presentation_ was never settled, and it supports abandoning the glyphs — which is why #1965 keeps the sentences but not the markers.

### Glossary: `Abschlag` APPROVED as a space-constrained short form

Full ruling on **#1917** (the pending glossary-refinement pass, same place the `KI` entry lives; translator implements, PO does not edit `glossary.json`).

`depositReducedInlineLabel` = `abzgl. Abschlag` ships as written, against the glossary-approved `Deposit → Abschlagszahlung`. Translator measured with fontkit against the real embedded `Roboto-Regular.ttf` at 8pt in the fixed 75pt `ALLOCATED_AMOUNT_WIDTH`: `" (Abschlagszahlung)"` = 72.85pt (the existing sibling badge, so it **sets the real ceiling**), `" (abzgl. Abschlag)"` = 63.95pt, `" (abzgl. Abschlagszahlung)"` = **96.07pt, overflows by ~21pt**.

**The decisive arithmetic the options list missed: option (c), "a shorter compliant string", is unavailable.** `Abschlagszahlung` alone eats 72.85 of 75pt, so **no qualifier of any length fits** — not `abzgl.`, not `ohne`, not the accounting `./.`. Keeping the full term therefore forces dropping the qualifier, collapsing this label into the _constituted_-deposit label (`(Abschlagszahlung)`, #1923 AC2.1). Those are different facts — "this row **is** a deposit" vs "this amount is **reduced because** deposits were claimed separately". **Collapsing them is a worse information loss than the abbreviation.**

Option (b), widening the column, rejected on **risk not cost**: `ALLOCATED_AMOUNT_WIDTH` is #1929 geometry that took **four rounds** and real render-and-rasterize measurement, precisely because Usage was collapsing and the table overflowed the page edge. Reopening it for zero reader benefit is a bad trade. And `Abschlag`/`Abschlagszahlung` are the same concept in German construction practice (cf. `Abschlagsrechnung`); `abzgl. Abschlag` is idiomatic invoice German. No reader is misled — the bar set by the Verwendungsnachweis/Einreichung precedent.

**Why it earns a glossary entry rather than a silent exception: without one a future compliance sweep "fixes" it in good faith and silently breaks a bank-facing PDF, invisibly to the unit suite.** The entry must record the 75pt column and the measurement as the _reason_, not just list the variant. **Generalizable: a deliberate deviation from an approved term needs a recorded reason at the glossary, or the next sweep reverts it.**

### Glossary: `split`'s three German forms — NO entry, deliberately

`anteilig` (adj.) / `Anteil` (noun) / `Teilbetrag` (noun), each role-correct, mirroring English's own `partial`/`split`/`portion`. **Ruled: not drift, no entry.** The glossary prevents _semantic_ divergence — one concept becoming two concepts. It is **not a single-surface-form registry**, and pinning one form here would force ungrammatical copy across an adjective and two nouns. Recorded on #1917 as "reject if proposed later" so a future translator does not re-escalate. Revisit only if the _English_ is unified — a copy story, not a glossary one.

### Issues filed from the PR #1959 sweep (2026-08-03)

All parentless, Bank Report Wizard cluster. #1959 was the user's own PR and held promotion #1958.

| Issue     | Substance                                                                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#1965** | Report-level, non-editable legend restoring the `(partial)` / `(less deposit)` explanatory sentences (Must Have; producer-only fix — the footnote channel is orphaned, not removed) |
| **#1966** | E2E coverage for the column toggles                                                                                                                                                 |
| **#1967** | `attachmentsNote` override is unreachable                                                                                                                                           |
| **#1968** | Meta-suffix emitted as a single run                                                                                                                                                 |
| **#1969** | `testPrefix` / `authenticatedPage` fixture cleanup                                                                                                                                  |
| **#1970** | Configurable auth rate limits — see [auth-rate-limits-1970.md](auth-rate-limits-1970.md)                                                                                            |
| **#1971** | `search-users.spec.ts` leftovers                                                                                                                                                    |
| **#1972** | Column-preference saves fail silently + dead `isLoaded`                                                                                                                             |

## #1973 column visibility (2026-08-03) — user overruled my invented floor

**Requirement**: _"If i de-select a column in the preview it shouldn't render in the pdf"_, then, when asked which columns are mandatory: _"generalize the use case i want to be able to specify an arbitrary amount of columns - only the allocated amount is a mandatory column"_.

**My floor was rejected.** I proposed "at least one of Vendor / Invoice # must remain, on row-auditability grounds." The user rejected it as an **invented compliance rule**. Allocated Amount alone is a legal document. **Lesson, generalizable: when I flag "I don't want to invent a compliance rule" and then invent one anyway on plausible-sounding domain reasoning, that is still inventing one.** Allocated Amount's own mandatory status survived only because it rests on two _structural_ facts in this codebase (summary-row amounts and the #1959 inline labels both live in that cell), not on a domain claim. **Structural justification survives user scrutiny; purposive domain reasoning does not.**

**The floor was accidentally protecting something real** — worth remembering as a pattern. `buildSummaryRow` puts the label in the last _leading_ cell (before the amount columns). With no leading columns visible the label had nowhere to go and totals would print as bare numbers. Removing the floor promoted that from "impossible by construction" to "must be ruled on": R2 = no total ever prints unlabelled; where no leading cell exists the label goes **in the same cell as the amount**. **When a constraint is removed, re-derive what it was silently guaranteeing — the constraint's _reason_ may have been wrong while its _effect_ was load-bearing.**

**Corrected the coordinator's reading of "arbitrary"** (Q5). It read as "the report type's base set is not a ceiling — a claim could re-add Status." Wrong: `buildReportContent.ts:203` sets `status: isOverview ? status : null`, so there is **no status value** for claim/proof-of-funds. Re-adding it renders a column of blanks in a bank document. Ruled: **the base set IS the ceiling, for a data reason not a policy one.** "Arbitrary" frees the subset among columns the report _has_; it does not conjure unproduced data. Named the alternative explicitly (make `buildReportContent` produce status for claims) so the user can request it rather than having me decide. **Generalizable: a user's scope-widening ruling does not implicitly authorize inventing data.**

**Q3 — legend conditional or unconditional?** Ruled **unconditional**, #1965 **blocks** #1973 (`addBlockedBy` set). Hiding Invoice Amount destroys the adjacency that was my _entire_ stated reason for accepting bare `(partial)` on PR #1959. Decisive argument against conditionality: **`(less deposit)` was already insufficient regardless of adjacency** (missing word = _separately_), so the legend block must print unconditionally anyway — conditioning the other sentence saves nothing and adds a branch whose output a reader cannot predict. AC 6.1 explicitly forbids implementing it as `if invoiceAmount hidden then legend`. Cross-link comment posted on #1965 so the raised necessity isn't lost.

**Q4 persistence** — per-session in `ReportWizardPage` state, **not** `useColumnPreferences`. Strengthened by the ruling: 96 legal subsets with no floor means the right set varies per recipient, so a sticky per-user value is wrong more often than right _and_ wrong invisibly. Resets on use-case change (third instance of the #1943/#1946 hazard — handled up front, not filed later).

**Q7 (new, from the ruling)** — Usage is now hideable and it is the **only elastic column** (`USAGE_WIDTH_*COL` = leftover). Ruled the _observable outcome_, left the mechanism to the architect: width never exceeds `printableWidth()` (unconditional); surplus goes to a free-form text column (Usage, else Vendor); when neither is visible **the table renders narrower than the page, left-aligned** — a 2-column numeric table stretched across 515pt looks broken in a bank document. Degenerate case = one 75pt column.

**Geometry facts pinned** (`overviewPdf.ts` / `pageGeometry.ts`): fixed widths Vendor 45, Invoice # 63, Date 46, Status 40, InvoiceAmount 48, Allocated 75; Usage = `usableColumnWidth(n) - fixedSum`. Subsets: overview 2^6=**64**, claim 2^5=**32**, **96 total**, counts 1–7. **Hiding a column can only make Usage _wider_** → per-line char counts rise, row heights fall, so every measurement-pinned bound moves in the _safe_ direction (exception: hiding Usage itself). Noted in AC 3.6 as a mitigating fact for the implementer.

**#1966 closed as superseded, not amended** (board Wont-Do, supersession comment with an AC→AC carry-forward table). Its Notes asserted "nothing about them should reach the generated PDF" — the deleted premise — and its AC1 asserted DOM removal only, which **would pass while the PDF still contained every column**. Amending would have left a tech-debt/test-only issue carrying a functional change and erased the record of the reversal. **Rule: when a user reverses a design decision, close the issue built on the old premise and carry its still-valid ACs forward with attribution — don't rewrite it.**

**Sequencing: after the #1958 promotion.** Stated as my own opinion, not deferred. #1958 is green/CLEAN at 54 commits with #1959 in it; this blocks on #1965 anyway; and it generalizes the exact module that produced two real defects that day. The ruling made the surface _larger_ (no floor → degenerate single-column geometry + summary-label relocation). The shipped hint is **honest** — a stale string is cheap to reverse, a malformed bank document is not.

### #1973 rev 3 — spec reconciliation, and a stale-body process failure

**Process failure worth avoiding: I rewrote the #1973 body (rev 1 → rev 2) but only reported the _rulings_ in my handback, not "the body has been rewritten and the numbering changed."** The coordinator and `dev-team-lead` both then worked from a cached rev 1, and the dev-team-lead filed the 1-column floor as a _contradiction to be fixed_ when it had already been fixed. Substance never diverged; only R/AC numbers did (rev 2 reassigned R1–R8 and the AC numbers wholesale). **Rule: when amending an already-reported issue body, say "body rewritten, numbering reassigned" explicitly in the handback, and put an amendment log in the issue's Notes.** #1973 now carries one.

**Adopted the spec's answer over my own on the summary label.** I ruled "label in the same cell as the amount"; the spec's **three-tier fallback** is better and is now R2 + AC 4.6: last visible leading column (**92**/96 subsets) → Invoice Amount if visible → **separate two-column block beneath the table** (**4** subsets: `{allocatedAmount}` and `{allocatedAmount, usage}` × 2 use cases). Verified the parity argument on disk: `ReportContentEditor.tsx:442-445` renders `content.summaryRows` as its own block independent of column visibility, so the PDF _matches_ the HTML preview exactly where in-table placement is impossible. **Tier 3 increases preview parity rather than costing it — a fallback that converges on the existing preview is strictly better than one that invents a new form.**

**AC 3.7, the one-sided chunk-budget clamp — a real correction to my AC.** My 3.6 said "recompute `MAX_SAFE_USAGE_CHUNK_CHARS` from the subset's actual Usage width", which implies upward scaling is legitimate. It is not. Hiding columns only _widens_ Usage (chars/line 16 → up to 50), so the 650 budget gets more conservative and this change cannot breach it. **The hazard is the opposite and arrives later: a future _added_ column narrows Usage, drops the true ceiling below 650, and silently reinstates the #1929 content-loss defect.** 650 rests on a **single real-render measurement at one width**; extrapolating upward is what caused the round-3 defect. So the clamp **scales down, never up**, AC 3.7 requires a test for _both_ directions, and a comment must record the asymmetry as deliberate so it isn't "optimised" away as dead code. **Generalizable: a bound pinned by one measurement may be scaled toward safety but never away from it — and one-sided clamps need a recorded reason or they read as bugs.**

**Verified geometry figures** (taken as computed from the spec, not re-derived): **72** of 96 subsets equal `printableWidth()` (48 overview + 24 claim); **24** render narrower (16 + 8), totals **84.00pt** (`tableOffsetsTotal(1)` 9.00 + 75) to **315.00pt** (`tableOffsetsTotal(5)` 43.00 + 272). I independently spot-checked both endpoints and the 72/24 split against the constants and they hold.

**Q5/R6 confirmed by the coordinator** ("your Q5 correction was right and I was wrong") — the type's base set is the ceiling for the `status: isOverview ? status : null` **data** reason. Note it is **R6** in rev 2+, not R7 as in rev 1.

### PR #2004 review — #1888 accepted, #1910 rejected on AC3 (2026-08-05)

**#1888 shipped clean** as a step-3 helper line (AC4's second branch), not per-row accessible naming: `sourceReports.attachmentsNote` interpolating `t('sourceReports.useCase.${report.type}')`. Two checks that made it an accept rather than a "probably fine": all three `SourceReportType` values have `useCase.*` keys in **both** locales (no raw-key fallback for any report type), and the render gate `allocatedInvoices.length > 0` coincides **exactly** with the rows that render an indicator — unallocated rows render none — so there is no state with an unexplained paperclip and none with an explanation and nothing to explain. **When an AC is satisfied by a page-level helper line rather than per-item labelling, the finding to hunt is the gate: does the line appear in every state where the thing it explains is visible, and only those?**

**#1910 AC3 failed — the "blanket-tag + partial counter-tag" antipattern.** The PR put `lang="<report-language>"` on `ReportContentEditor`'s `.container` and counter-tagged only the `<h3>`s and the column-toggle hint `<p>`. AC3 enumerates "editable-field labels, **buttons**, headings"; `EditableField`'s visible `<label>`, its reset `<button aria-label>`, its input `aria-label` (dense usage cells), its sr-only edited hint, the column-toggle `role="group"` `aria-label`, and the two read-only field labels all still inherit the report language. `LocaleContext.tsx:78` sets `documentElement.lang` to the UI locale, so these announced **correctly before this PR** — i.e. the PR _relocates_ the defect the story exists to remove onto a different element set. **Generalizable: when an AC enumerates element classes, tick each one off individually — a PR that handles the first-named class reads as done. And when a fix works by overriding an inherited value, the finding is always "what else inherits from the node you tagged?"**

The finding survives either reading of AC3 ("not inside the report-language subtree" vs "counter-tagged back to UI locale"), which is why it was worth stating as robust to interpretation rather than arguing for one reading. I gave two closure routes (complete the counter-tagging vs. move `lang` onto the report-content nodes only) and explicitly left the choice to dev-team-lead/architect — the second route is the one that does not silently regress when UI chrome is next added to the component.

**Its own tests pin the incomplete approach**: the unit test "applies uiLang to every `<h3>`" and E2E Scenario 26 stay green while AC3 fails. Correctly-tagged-by-inheritance content, for the record: all `content.labels.*` / `content.*` (table `<th>`s, column-toggle label text, mobile-card captions, source-info block, deposit/split notes) — server-generated report content. `ReportPdfPreview.tsx` untouched and renders an `<iframe>`, so #1910's "preview only, PDF out of scope" boundary holds by construction.

**Coordinator's AC numbering was wrong again** (4th instance): the brief listed #1910 "AC4: `ReportPdfPreview.tsx` not touched", which is a Notes-section scope boundary, not an AC; canonical AC4 is the no-redundant-`lang` criterion. Reviewed against the issue bodies and said so in the comment.

### PR #2004 round 2 — Option A fix, rejected again (2026-08-05, commit `64c07b8a`)

The fix ("Option A surgical tagging") removed `uiLang`, untagged `.container` / `<h3>`s / the column-toggle hint, added `EditableField.lang?` → the `<input>`/`<textarea>`, and moved `lang={lang}` onto `.sourceInfoBlock`, `.tableWrapper`, `.mobileCardList`, `.summaryTable`, `.footnotes`. That resolved the loudest part of round-1 H1. **Rejected again on three findings, all traceable to not re-asking round 1's own diagnostic question after the tag moved down a level.**

- **H2 (AC5 red, not merely unmet)** — E2E Scenario 25 (`e2e/tests/budget/reportWizardEditableContent.spec.ts:2450`) still asserts `container.getAttribute('lang') === 'de'` on the node the fix deliberately stopped tagging. **Only the comment above the assertion was rewritten to describe Option A.** Confirmed failing on Shard 2/16 test #168 + retry. Shards 3/8 red = known diary/dashboard flakes. **Pattern: when a behaviour-inverting fix lands, grep the test suite for the OLD assertion, not for the old comment — an updated comment over a stale expect is the most convincing false green there is.** Also: a red shard here blocks the next `beta`→`main` promotion (`E2E Gates` is main-only) even with `Quality Gates` green.
- **H3 (AC1 regression introduced BY the fix)** — `ReportContentEditor.tsx:110` (`coverLetter.dateLine`, from `reportFormatters.formatDate`) and `:165` (`coverLetter.closing`, documented in `reportContent/types.ts:47` as `reportT(...)` artifact content) are report-language values in bare `.readOnlyValue` spans covered by none of the six tagged nodes. The round-1 container approach _did_ cover them. **Pattern: a blanket→surgical refactor must be audited for what the blanket was silently covering; narrowing a wrong-but-broad tag can drop correct coverage. Enumerate the old subtree's report-language leaves and check each against the new tagged set.**
- **H4 (AC3 residue)** — `.tableWrapper:240` and `.mobileCardList:345` still enclose `EditableField` chrome: the reset `<button>` (`EditableField.tsx:99`, UI-language `aria-label`/`title`), the sr-only edited hint (`:88`), and the desktop usage `<input>`'s UI-language `aria-label` sitting on the very element given `lang={lang}`. Load-bearing fact: `ReportWizardPage.tsx:861` passes `t={t}` (UI `t`), **not** `reportT` — so every `t()` string in the component is UI language, while `content.*`/`content.labels.*` are report language. The mobile usage field's visible `label={content.labels.usage}` IS report content and is correctly tagged.
- **Ruled acceptable-with-documentation**: the desktop `aria-label`-on-a-`lang`-tagged-input conflict is a genuine one-element-one-lang tension, not sloppiness. Offered `aria-labelledby`→untagged sr-only span **or** a documented deviation in the AC3 close-out. **Distinguishing "oversight" from "intrinsic tension" and pricing them differently is what keeps a third rejection from reading as perfectionism.**
- **M1** — Scenario 27 (`:2566`) asserts the container has no `lang` when languages match, but under Option A the container has no `lang` in _either_ case, so it passes with the `reportLanguage !== resolvedLocale` guard deleted. Another instance of "assertions that pass on nothing" — retarget to `.tableWrapper`.
- **M2 fix verified genuine**: `makeReport([], [oneUnallocated])` bypasses `EmptyState` while keeping `allocatedInvoices.length === 0`, so the guard under test is actually reached. Flagged L1: no positive anchor asserting the unallocated row rendered, so it can silently re-become vacuous.

### PR #2004 round 3 — H2/H3/H4/M1/L1 all fixed, rejected a third time on H5 (2026-08-05, commit `04e4ae0c`)

Fix moved `lang` off `.tableWrapper`/`.mobileCardList` onto `<thead lang={lang}>`, tagged the two
`.readOnlyValue` spans, retargeted E2E Scenarios 25/26/27 to `<thead>`, and anchored the M2 test.
All five verified genuinely fixed.

- **CI as review evidence, not just diff-reading**: `Shard 2/16` was **failure** on `64c07b8a` and
  **success** on `04e4ae0c`. Diffing the same PR's shard results across commits is the cheapest proof
  that a test fix is real. Shard 8/16 red on **all three** commits (`2744d75b`/`64c07b8a`/`04e4ae0c`)
  → standing dashboard #1735 failure, provably not introduced.
- **H5 (blocking, AC1)** — the H4 fix emptied two wrappers and only reconciled `<thead>`. Desktop
  `<tbody>` (dateText, statusText Badge, both amount texts, refundNoteText, `labels.deposit`/
  `splitNote`/`depositReducedNote`, `.usageMetaText` incl. **#1888's own attachmentsNote**) and the
  **entire** `.mobileCardList` are untagged. Load-bearing: `ReportContentEditor.module.css:286-292`
  hides `.table` and shows `.mobileCardList` at ≤767px, so **the mobile viewport has zero `lang`
  tagging in the whole table region** — AC1 unmet for one viewport, and `.mobileCardList` _had_ the
  tag in the previous commit, so it is a net regression within the PR. Also internally inconsistent:
  the same seven `content.labels.*` strings are tagged in `<thead>` and untagged in the mobile captions.
- **Same pattern as H3, one level down** (third instance in this PR): the fix audited only the leaves
  I happened to name and did not re-run the enumeration on the subtrees it emptied. **When you demand
  a tag be removed, name the replacement coverage in the same breath — otherwise the next round is
  the mirror-image finding.** My round-2 H4 didn't, and this round is the cost.
- **Retracted a takeaway of my own**: round 2's "deleted `uiLang`" was read as a ruling against any
  UI-language counter-tag. It wasn't — a _targeted_ counter-tag on chrome is the standard HTML pattern
  for interleaved languages and is AC3-compliant; round 1's error was the **blanket on `.container`
  with only `<h3>`s counter-tagged**. Offered it as mechanism (b) (restore wrapper tags + counter-tag
  `EditableField`'s reset button and sr-only hint) alongside (a) leaf tagging, and said (b) is
  strictly better because it also covers the mobile usage `<label>` for free. **A rejection that
  corrects a misreading of the previous rejection costs less than a fourth round.**
- `EditableField.lang` reaches only `<input>`/`<textarea>` (`:69`,`:78`), never the `<label>` (`:58`),
  and that label is polymorphic — UI `t()` in the cover letter, report `content.labels.usage` on mobile.
  That asymmetry is why mechanism (a) can't cover the mobile label without a new prop; granted a
  documented deviation there rather than demanding the prop.
- **M2 (non-blocking)** — `npx prettier --check` fails on `ReportContentEditor.tsx:110`/`:165`.
  **`npm run lint` is `eslint . && npm run stylelint` — no Prettier — and `ci.yml` has no
  `format:check` step, so formatting drift merges silently.** Worth checking on every PR touching
  client code; it only surfaces later as unrelated drift in someone else's `npm run format`.
- `gh pr review --request-changes` fails with "Can not request changes on your own pull request" on
  this cluster (human is the PR author, agent operates as that account) → the verdict lives in a
  `gh pr comment`, same as the architect's reviews here.

### PR #2004 round 4 — APPROVED (2026-08-05, commit `03a30990`, comment `5189956686`)

Fix took mechanism (b) verbatim: restored `lang` on `.tableWrapper`/`.mobileCardList`, added
`EditableField.uiLang` → reset `<button>` + sr-only edited hint only (**not** the `<label>`, which is
polymorphic). 184/184 local, `prettier --check` clean, `Quality Gates` green, **`Shard 2/16` green**
(was red on `64c07b8a`), `Shard 8/16` red on **all four** commits → standing #1735, not introduced.

**#1888 accepted unchanged** — `ReportInvoiceList.tsx` byte-identical to round 1 (`git diff <r1> <r4> -- <file>`
empty). **Cheapest possible re-verification of an already-accepted issue inside a multi-issue PR: diff its
files against the commit you accepted, don't re-read them.**

**#1910 accepted on all 5 canonical ACs**, with one Medium MUST FIX left non-blocking:

- **M1 — column-visibility toggle labels** (`ReportContentEditor.tsx:230-246`) render
  `content.labels.*` (report language) but `.tableHeadingRow`/`.columnToggleGroup` are **siblings** of
  `.tableWrapper` → untagged. Same seven strings are tagged in `<thead>` a few pixels below, so the
  component is internally inconsistent. Prescribed mechanism: `lang={lang}` on the `<label>` at `:248`,
  **not** on `.columnToggles` — the wrapper carries the UI-language `role="group"` `aria-label` and
  tagging it would manufacture a second one-element-one-lang deviation.
- **Why MUST FIX and not a 4th rejection**: 6-7 word residue, duplicated in a correctly-tagged
  `<thead>`, and **I missed it in both my round-2 and round-3 enumerations** — round 1 listed
  "column-toggle label text" as correctly-tagged-by-inheritance and I never re-checked it after the
  `.container` tag came off. **Generalizable: when a finding is in a class I twice failed to name,
  its severity is capped by my own enumeration failure — block on what I asked for, MUST FIX what I
  didn't.** Blocking would also have re-risked the freshly-green Shard 2/16.
- **Closed the enumeration properly this time**: listed every `content.coverLetter.*` /
  `labels.*` / `sourceInfo.*` / `rows[].*` / `summaryRows[].*` / `footnotes[]` render site against the
  tagged-node set and said in the comment that M1 is the only one outside. After four rounds of
  mirror-image enumeration gaps, **stating the enumeration as exhaustive is what ends the cycle** —
  otherwise each round only proves the previously-named leaves are fixed.
- **L1 — told them explicitly NOT to remove the now-redundant `<thead lang>`.** It's duplicative
  under `.tableWrapper`, AC4's non-redundancy clause is scoped to the equal-language case, and E2E
  25/26/27 all target `<thead>`. **A tidy-up that reads as obviously correct can be the next
  regression; pre-empt it in the approval.**
- **L2 — comment rot, exact mirror of round 2's H2**: the E2E comments (`:2442-2445`, `:2461`, `:2502`)
  and the unit describe-block still say "Option A ... without over-tagging", which round 4 partly
  reverses. Round 2 was stale `expect` + fresh comment (false green); this is fresh `expect` + stale
  comment (misleads the next reader only). **Both directions are worth flagging; only one is blocking.**
- `row.attachmentsNote` (in `.usageMetaText`) is built with `reportT` (`buildReportContent.ts:196`→`:96`/`:106`)
  → report language, correctly under the tag. Distinct from #1888's step-3 helper line (UI `t()`, correctly outside).
- **Coordinator AC numbering wrong a 5th time**: brief listed six #1910 ACs incl. "AC6 mobile viewport
  covered" — #1910 has five and none is about mobile; that was my own round-3 H5, derived from AC1.
  Reviewing against the issue body is what surfaced M1's AC1 framing.
- **#1910 does NOT need a human UAT pass** (unlike #1931/#1932): `lang` correctness is structurally
  verifiable from the DOM. Named the optional confirmation scenario anyway. Both issues → Done on merge
  once M1 is resolved.

### PR #2004 round 5 — M1 closed, final APPROVED (2026-08-05, commit `6a3eb7ec`, comment `5190184975`)

`lang={lang}` added to the `<label>` at `ReportContentEditor.tsx:245` — exactly the prescribed node
(not `.columnToggles`, not `.columnToggleGroup`, both of which would have over-tagged: the former
carries the UI-language `aria-label`, the latter also encloses the `t()`-sourced `.columnToggleHint`).

**Verified M1 by local mutation + revert, not by report**: deleting the prop flips the new test
`"de"` → `null`. Also mutation-checked the _second_, unrequested test in the same commit (the
`EditableField.uiLang` wiring integration test) because it guards an **optional** prop whose deletion
is type-legal and would leave every other suite green — stripping all `uiLang={uiLang}` call sites
fails it (`>= 1` → `0`). **Generalizable: a test added to guard an optional prop deserves its own
mutation check, since the failure mode it exists for is exactly the one that stays type-legal and green.**
Its `for (const btn of resetButtons) expect(lang).toBe('en')` loop is tautological (selector already
filters `lang="en"`); the load-bearing assertions are the `>= 1` anchor + the `button[lang="de"] === 0`
negative. Flagged as cosmetic, no action.

Re-ran the full exhaustiveness check (`grep content.labels.` × `grep lang=`): all report-language
content covered at `:201`, `:245`, `:253`, `:255`, `:359`, `:469`, `:483` + `EditableField` call sites;
only `t()` chrome untagged. **No further findings** — the round-4 "state the enumeration as exhaustive"
move is what made round 5 a one-item confirmation instead of another mirror-image round.

**Shard 8/16 characterised and filed as #2005** (bug, Must Have, Todo) rather than hand-waved as
"pre-existing": three `dashboard.spec.ts` Scenario 13 (#1735) "New Invoice" tests fail on initial run
**and** retry (not a flake) — no modal opens in either the Paperless-configured or not-configured
branch. Proof it is PR-independent: **identical failure on the head commits of #1999, #2000, #2002**
(three unrelated _merged_ beta PRs) plus both prior #2004 commits. **Cheap technique: to prove a red
shard isn't yours, check other recent merged PRs' head commits — not `beta` itself, which never runs
full E2E.** Wrote AC1 as a _classification_ AC (production defect vs E2E fixture defect) so I filed the
bug without usurping the dev-team-lead's Test Failure Debugging Protocol call; AC3 forbids a weakened
assertion. Left the `InvoicesPage.tsx:277-293` `integrationStatus` null-gate as a labelled starting
point, not a conclusion. Flagged in the sign-off that `E2E Gates` being main-only means this **blocks
the next promotion** while not blocking this merge.

## #2001 reviewed — PR #2007 APPROVED round 1 (2026-08-05)

`refactor(reports): remove TFunction from reportPdf/*`. All 9 ACs met, one Medium non-blocking finding.
The story existed to **close a class** (#1938 and #1993 had each fixed one call site of the same shape),
so the review question was "is the class closed", not "do the three call sites work".

**Verification techniques worth reusing:**

- **AC5-style grep ACs: run the grep over the whole directory at the head commit, then go one step
  further than the AC text.** AC5 only asked for `TFunction`; I also grepped all 9 production `.ts`
  files for `i18n`, `useTranslation`, `toLocale*`, `Intl.` — the ADR-034 contract is "never reach the
  ambient locale", and `TFunction`-free is a proxy for that, not the thing itself. (All clean here.)
- **AC7 "verified to discriminate" ACs get an actual mutation run.** Throwaway worktree at the head
  commit (`git worktree add --detach /tmp/<x> <sha>` + symlink the root `node_modules` — npm-workspace
  worktrees under `.claude/worktrees/` resolve the root `node_modules` by upward lookup, `/tmp` ones
  don't), mutate, run, revert, `git worktree remove --force`. 9 tests red under 3 mutations, 116 green
  after revert. **Mutate the i18n _key_ too, not just the value** — swapping in a wrong-but-existing
  key proved the AC1 tests pin the specific key rather than "some string".
- **A refactor that moves a string from call time to build time needs a staleness check, and it is a
  memoization question, not a rendering one.** Here: labels moved from `reportT` passed into
  `generateReportPdf` to `reportContent.labels`. Safe only because `baselineContent`'s `useMemo` deps
  include `reportT`, which is memoized on `reportLanguage`. Check the dep array; a missing dep would
  have made the label silently stick to the first-selected language.

**Medium M1 (non-blocking) — the fix re-opened the same hazard class in a new form.** `overviewPdf.ts`
resolved the dynamic skip-reason via `labels.skipReasonLabels[reason as 'a' | 'b'] ?? reason`. The
`as` cast + `??` fallback is exactly the "enforced by convention" shape the story was written to kill:
a third `SkippedDocument['reason']` would compile silently and echo a raw identifier into a document
handed to a bank. **Ruling: capped at Medium, not blocking, because AC2 as written is about values the
code _can produce today_ and the union is closed.** But flagged with the two-line typed-parameter fix
(`Map<string, SkippedDocument['reason'][]>` in `overviewPdf.ts` + `merge.ts`) and an explicit offer to
file it as a follow-up instead. **Pattern: when a refactor's purpose is "close the class", check
whether the fix introduces a fresh instance of the class — an unchecked `as` cast plus a silent `??`
fallback is the usual shape.**

**Also:** AC8's own warning ("ts-jest emits no type diagnostics; a green Jest run does not mean the
field is wired everywhere") fired exactly as written — commit `3b26a82c` fixed 4 missed
`ReportContentLabels` construction sites after CI typecheck went red. An AC that names the trap from a
prior PR earns its keep. Every AC here is machine-checkable, so **#2001 goes to Done on merge, no UAT**
(contrast the #1931 live-LLM ACs). `gh pr review --approve` refuses own-authored PRs → verdict in a
comment. #2005 is now **closed** and all 16 E2E shards are green on this head commit — the promotion
blocker recorded above is cleared.

## PR #2008 (#2003 ADR-034 overflow enforcement + #1980 legend assertions) — REJECTED round 1 (2026-08-05, head `664bf048`, comment `5192596322`)

Verdict posted as a **comment** (`gh pr review --request-changes` refuses: human-authored PR — the recurring quirk).

### C1 — the AC that says "prove it can fail" was the AC that failed. Metric is a constant.

`max(node.positions[].horizontalRatio) <= 1` (ADR-034 rule #1) is **structurally `0`** for this pipeline. pdfmake `DocumentContext.js:515-529` (0.3.11) returns `left: this.x` — the **write cursor's left edge** when the position was recorded, not the rightward extent of content. Every node lives in one full-width table anchored at the left margin ⇒ `this.x - pageMargins.left === 0`, always.

Proven by three experiments in a worktree, then reverted:

- `WORST_CASE_CHAR_ADVANCE_EM: 1.04 → 0.1` (no token ever gets `wordBreak: 'break-all'` — the exact regression the `'W'.repeat(30)` fixtures exist for) → **all 7 tests green**.
- `VENDOR_WIDTH: 45 → 600` (~85pt wider than the whole printable area) → **all 7 tests green**.
- `toBeLessThanOrEqual(1)` → `(-1)` to read the value out of the failure message → `Received: 0` for **all 8** call sites, in **all three** states.

**Reusable patterns:**

1. **To test whether an inequality assertion discriminates, invert the bound and read the value out of the failure message.** `toBeLessThanOrEqual(-1)` printing `Received: 0` in every state is a one-command proof of vacuity — far faster than reasoning about the metric's semantics. Do this on any new `<=` / `>=` / `toBeGreaterThan` assertion whose measured quantity you haven't seen printed.
2. **A revert-test on a synthetic fixture proves the helper, not the assertion.** #2008's revert-test built a `widths: [600, 50]` table by hand — a shape `buildOverviewContent()` cannot emit (all columns numeric, total `=== printableWidth()` by construction). It passed while both production mutations also passed. **Demand the revert-test mutate the production constant the AC names**, not a fixture the production path can't reach.
3. **When the implementation ships with a comment conceding it doesn't cover the case, that concession IS the finding.** The helper's own `NOTE` said "A single overflowing column whose left edge is at the page margin still records horizontalRatio≈0" — which describes this pipeline's only shape. Read new explanatory comments as admissions, not as documentation.
4. **A documented bar can be wrong.** Don't assume an ADR rule is implementable as written; #2003 existed only because rule #1 was documented-but-unenforced, and enforcing it revealed the rule itself is unmeasurable here. Second correction cycle on the same rule (the `_minWidth` mis-transcription was the first). Escalate as a rule correction to `product-architect`, not a pointer tweak.

### C2 — wiki pointer documenting a guarantee refuted by the same PR's code comment

Added ADR line claimed "…so a passing `<= 1` assertion on production content is **non-vacuous**". Worse than no pointer: the next width edit reads it as covered. **Rule: a wiki pointer asserting a property must be verified like an AC.**

### C3 — the PR's own new E2E test red in CI, initial run + retry

Shard 2/16, `reportWizardEditableContent.spec.ts:1780`, `expect(pageText).toContain('(less deposit)')`. `depositReducedInlineLabel` is `"less deposit"` (deliberate NBSP, pinned by `i18n.parity.test.ts`); **`locator.textContent()` does NOT normalize whitespace, `toContainText()` does.** The failure message _looks_ like the substring is present because terminals render U+00A0 as a space — read the received string with `cat -A`/codepoints before calling it a flake. #1980's own Notes had warned about this exact trap.

`E2E Gates` is `main`-only ⇒ a red shard merges to `beta` on a green `Quality Gates` and lands on the next promotion (the #2005 pattern). **Always check every shard's conclusion on the head SHA, not just `Quality Gates`.**

### Met / not met

- #2003: helper ✓ (reusable, throws pre-render), fixtures ✓ (structure), ADR pointer present ✗ (content false), **falsifiability ✗**.
- #1980: AC2 ✓ (`filter().length`, N=2 fixture discriminates), AC3 ✓ (Low: needles from `t()` — a renamed key makes the negative pass trivially), AC4 ✓ (verified fixture against `buildReportContent.ts:157-166`: split needs `isSplit && budgetLines.length > 0`, so `budgetLines: []` + untagged deposits isolates `depositReduced`), AC1 **partial** (presence yes; the measurement is the constant-`0` ratio plus `getPageCount() >= 1`, which no successful render can fail — AC had named `PRINTABLE_WIDTH_PT` and it went unused), AC5 ✗ (red).
- Scope clean; test-only; AC ownership split (QA 1-4, E2E 5) respected in trailers.

### Round 2 — APPROVED (2026-08-05, head `4f4b93e3`, comment `5193215663`)

All three criticals fixed at the root. Verdict again in a comment (`--approve` refuses own-authored PRs).
Final metric: per-Usage-cell **`_minWidth <= widths[i]._calcWidth`** after a real render, 2 blocks ×
{claim, budget-overview} × {en, de} = 8 assertions. `maxHorizontalRatio` kept with its `[600, 50]`
revert-test as the **table-box positioning** check — its only consumer, but ADR-sanctioned, so not dead
scaffolding. ADR-034 rule #1 corrected (3rd correction) + Deviation Log row; I amended **#2003's body**
with a supersession block so the old `<= 1` bullet isn't read as live spec.

**Reusable patterns — all five are cheap and generalise:**

1. **To verify a vacuity fix, re-run the exact mutations that stayed green last round.** Don't invent new
   ones. `WORST_CASE_CHAR_ADVANCE_EM 1.04→0.1` and `VENDOR_WIDTH 45→600` both went green→**all 8 fail**;
   that mirror-image result is the whole proof, and it's unarguable because the reader already knows those
   two mutations were the false negatives. Add one direct mechanism-removal (`wordBreak` line deleted) to
   cover the AC's other arm.
2. **"Moves with the input" is the positive signal, the mirror of "is a constant".** Received `212.93` /
   `7.10` / ~`33` across states, and legend `_minWidth` `36.80` (en) vs `54.86` (de). Quote two differing
   values from the same assertion and vacuity is ruled out without arguing about semantics.
3. **When a fix removes a vacuous assertion, check whether it was REPLACED or merely deleted.** #1980 AC1
   went vacuous → **absent**; that is not progress on the AC, and it's easy to miss because the diff looks
   like a cleanup. Carried M1 at Medium (unchanged severity — the *presence* half guards the #1959 channel,
   and re-grading my own round-1 Medium upward would be moving goalposts).
4. **Before demanding a measurement, probe that it exists** — the mirror of "a documented bar can be
   unmeasurable" (round 1's lesson #4). I probed the rendered legend nodes and found `_minWidth` /
   `_maxWidth` / `positions[0].pageInnerWidth` (515.28 = the file's `PRINTABLE_WIDTH_PT`) before saying the
   fix was 2 lines. `horizontalRatio: 0` on that very node re-confirmed C1's root cause for free.
5. **To prove an E2E failure is a flake, find a green run whose subtree is byte-identical.**
   `git diff <green-sha> <red-sha> -- e2e/` empty **and** a fully-green 16-shard run 16 min earlier is
   determinative — far stronger than "known flake" folklore or a rerun. Also check the *previous* round's
   shard map: shard 3/16 was green at `664bf048` (shard 2/16 was the red one), which rules out a
   shard-boundary shift from the new fixture (the worker-hash hazard). Failure here was
   `diary-automatic-events.spec.ts:100`, unrelated. Still asked for a shard re-run before merge (#2005).

**Documented-deviation loop closed end to end, worth reusing verbatim:** unmeasurable ADR bar → escalate as
a *rule correction* to `product-architect` (not a pointer tweak) → ADR corrected with a Deviation Log entry
→ PO amends the **open** issue's body with a dated supersession block + inline `~~strikethrough~~` on the
superseded step. The ADR's own new text carries the right lesson: *"a revert-test proves the helper can fire
on some input, not that it can fire on the input the rule is about."*

**Done gates:** #2003 → Done on merge (every AC machine-checked). **#1980 → Done only if M1 lands**, else I
record a deviation on AC1 — the one criterion whose stated measurement exists in no form.
Architect's Lows still open: `collectAllStrings` forked 3× (`:884`/`:1151`/`:3207`); helper comment header
still says *"content overflowed the page horizontally"* (the framing the ADR corrects) and cites
`src/DocumentContext.js:528` vs the ADR's `DocumentContext.js:490`.

---

## PR #2010 — #1973 column visibility wired through to the PDF — APPROVED round 1 (2026-08-05, `b5b03bec`)

Verdict in a **comment** (PR authored by `steilerDev` = the token identity, so `gh pr review --approve`
is rejected as self-approval — same constraint as #2004/#2008). 33 criteria across 8 groups walked
individually: **28 satisfied, 5 Medium partials, 0 functional gaps.** All 16 E2E shards + `E2E Gates`
green on the head SHA.

**What landed well, and is worth copying into future AC design:**

- **A sanity test on the enumerator itself.** `allLegalHiddenSets()` bitmasks over the free-column list;
  a separate test asserts it yields 64/32 and never puts `allocatedAmount` in a hidden set. Without that,
  a silently-shrunk enumerator takes every downstream 96-subset assertion with it and nothing goes red.
  Every subset loop also asserts `checked === 96/72/24` rather than trusting the iteration.
- **A positive control on a negative assertion.** E2E AC 5.2 fires a real PATCH via `page.evaluate()`,
  asserts the interceptor caught it, resets the counter, *then* asserts the toggles produce zero. This is
  the general fix for "assertions that pass on nothing" — demand it whenever an AC is "X never happens".
- **A forced click as behavioural proof of `disabled`.** `uncheck({ force: true }).catch(() => {})` then
  re-assert `toBeChecked()` — genuinely different from restating `toBeDisabled()`.
- **A size-diff against the test's own baseline**, not a bare `> 1000 bytes`, as the E2E proxy for
  "the toggle reached PDF generation". The bare-size shape is what let #1966 pass while preview-only.

**Five Medium partials — all the same shape: an AC's second clause dropped while the first was met.**
M1 AC 4.1 (cell *count* asserted, header *text in order* not). M2 AC 4.2 (continuation rows explicitly
excluded from the 96-loop by fixture choice — the test comment says so). M3 AC 4.5 (96-loop checks
`amountText` only, never the label — the exact half I'd flagged as most likely to be quietly unmet).
M4 AC 3.3 (`expect(absorber).not.toBeNull()` would pass for *any* absorber; AC 3.5's loop `continue`s past
the absorber, so a wrong one is doubly unchecked). M5 AC 7.4 (PR body still says results "will be appended").
**Lesson: when an AC is a compound sentence, tick each clause off separately — the first clause getting a
test is what makes the second one invisible.**

**Verified by hand what the missing assertion would have covered** rather than just reporting the hole:
worst-case vendor-as-absorber is the 6-column overview subset, `515.28 − 51.5 − 272 = 191.78pt`, never
below the 45pt pin — so M4 is a coverage hole, not a defect, and gets capped at Medium on that basis.
`tableOffsetsTotal(n) = n*8.5 + 0.5`; `printableWidth() = 515.28`.

**Two AC-text errors were mine** (posted as a dated correction comment on #1973, body left intact):
1. **AC 4.6's "92 subsets" is wrong — Tier 1 is 88.** 92 = 96−4, which folded Tier 2 into Tier 1. Tier 2 is
   `{alloc, invoiceAmount}` and `{alloc, invoiceAmount, usage}` × 2 use cases = 4. 88+4+4 = 96. The tests
   asserted the partition *behaviourally* (exact row arrays per tier) and never the count, which is why a
   correct implementation didn't fail — **assert partitions behaviourally, not by cardinality.**
2. **AC 5.3's "leaving and re-entering the step" over-reached R5.** R5 says the selection dies with the
   *run*; `overrides` survive in-run step navigation, so `hiddenColumns` should too. The AC as written would
   have mandated a *third* instance of the #1943/#1946 silent-state-loss class. Implementation resets on
   reload + use-case change, preserves across step nav and `DISCARD_EDITS`, documents why. Corrected reading
   published; AC satisfied under it.

**R6 non-smuggling confirmed three ways** (worth reusing as a checklist for "did the fix quietly grant the
thing I declined?"): the enabling file (`buildReportContent.ts`) is absent from the diff entirely; the data
is structurally absent (`CLAIM_COLUMNS` has no `status`); and a test passes `hiddenColumns` containing
`'status'` to a claim editor and still finds no checkbox.

**Merge gate vs Done gate applied:** every AC is machine-checked (incl. the degenerate 1-column case through
*real unmocked pdfmake* in `realRender.test.ts`), so nothing blocks merge. But R7's narrower-than-page table
(84.00pt single column on a 515.28pt page) and R2's Tier-3 summary block are *visual* judgments no assertion
can make — **#1973 → UAT, stays In Progress, not Done-on-merge. If UAT rejects either, reopen #1973; the
ruling would be what was wrong, not the implementation.**

**L2 for the user:** `de` warning renders `„Verwendung"` — German opening low-9 quote closed by ASCII `"`.
Translator documented it as matching `selectForMergeAriaLabel`, honestly — but `de/budget.json` has exactly
**2** `„` and **0** `“`, so the "convention" is one prior instance. Flagged, not blocked; worth a follow-up
fixing both. **When an agent cites a codebase convention, count the instances.**

### #2010 follow-ups filed (2026-08-05) — #2011 / #2012 / #2013 / #2014

Coordinator ruling: **a green PR is not reopened to absorb non-blocking findings.** All four filed as
issues, Backlog, blocked-by #1973. Reusable: this is the standing disposition for architect/PO Mediums
raised on an already-green PR — file, don't expand.

- **#2011** (`bug`, Should Have) — architect M3: tier-3 summary block laid out against `printableWidth()`
  instead of the table's own width. `{allocatedAmount}` alone → total ~431pt from an 84pt table. **R7's
  own "a stretched numeric table looks broken" failure mode, relocated below the table.**
  **Why it slipped, and the rule that generalises: R7 and R2 were written separately, in different
  revisions, against different problems — neither anticipated that the same degenerate subsets fire both.
  When a ruling introduces a new element OUTSIDE an existing element's geometry, state its width
  relationship to that element explicitly. Two rulings that each constrain a different element can
  produce an unstated third outcome wherever their triggers coincide.**
- **#2012** (`tech-debt`, Should Have) — M1+M2+M4 bundled, plus the stale `92 subsets` surviving in the
  test title at `overviewPdf.test.ts:2026` (folded in, not filed separately — one line, same file).
  Framed around the shared shape: **"correct by construction, therefore untested" is a claim about
  today's code shape, and its whole value is that it stops holding silently.**
- **#2013** (`bug`, Should Have) — German mixed quotes, **both** instances (user ruled: fix, but not on
  that PR). AC 2 asks for a repo-wide `„`-count == `“`-count check so the mixed form can't re-accumulate.
- **#2014** (`tech-debt`, Could Have) — state the `ContentTier` `DISCARD_EDITS` preserve-vs-discard rule
  in `wizardReducer.ts`. Architect put the architecture in the wiki ("Multi-step wizard state: tier
  factories") but was authorised only one production-comment edit. **Inverse of "comment keeps the
  rationale, issue owns the guard": here the guard already exists and what's missing is the rule telling
  the next person the guard was a decision, not an accident.**

**#1973 disposition recorded on the issue:** stays **In Progress pending UAT** on merge, not Done —
R7's narrow table and R2's tier-3 block are visual judgments. **Separated #2011 from a #1973 reopen
explicitly, because #2011 is a live candidate for exactly that UAT rejection:** a **width** rejection is
#2011; a **design** rejection ("the total should not have left the table at all, at any width") reopens
#1973, because then the *ruling* was wrong. Worth reusing whenever a follow-up issue overlaps the same
surface a parent issue is going to UAT on — say which rejection routes where, before UAT runs.
