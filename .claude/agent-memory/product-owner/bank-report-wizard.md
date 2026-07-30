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
- **#1891 — User-verification follow-up** (created 2026-07-30, `user-story`, board **Todo**, blocked-by #1879): `blob:` CSP fix for the preview, status-chip sizing, expandable step-3 invoice rows, and the deposit `budget_source_id` domain change. Decisions section below.
- **#1888 — stage-matched attachment indicator** (Backlog, deferred from #1879).
- **#1895 / #1896 / #1897 — claim close-out defects** from the product-architect audit of #1891's dual-rail deposit aggregation (PR #1894). All Backlog, created 2026-07-30. See §"Claim close-out defects" below.

## Claim close-out defects found auditing #1891 (2026-07-30)

The architect audit of the dual-rail aggregation confirmed **budget totals conserve correctly** — every defect found is in the **claim close-out** path, not the money math. Keep that distinction when triaging: conservation and close-out are separate correctness domains here, and a green conservation check says nothing about close-out.

- **#1895 (bug, HIGH / Must Have)** — `markInvoicesClaimed` (`sourceReportService.ts:506`) takes only `invoiceIds`: it flips every listed invoice `pending|paid`→`claimed` and sweeps EVERY deposit on them, with no `budget_source_id` and no report-slice filter. Confirming source A's claim permanently blocks source B's residual claim AND inflates `computeClaimedAmount(B)`. Also subsumes: step-3 line exclusions shrink the report amount but mark-claimed still claims the whole invoice → excluded portion permanently unclaimable. Fix direction: require `sourceId` + explicit `depositIds`; deposit-only close-out when the invoice stays claimable for another source (the arm at `:565-566` already supports it). Needs API Contract wiki update, possibly an ADR amendment. **Breaking API change.** No test covered the cross-source sweep.
- **#1896 (bug, MEDIUM / Should Have, blocked-by #1895)** — `createDeposit` has no parent-invoice-status guard, so a `quotation` invoice can carry a pending deposit, enter the claim slice via that deposit, then get rejected by the claimability check → `InvoicesNotClaimableError` rolls back the ENTIRE batch (asserted by `sourceReportService.test.ts` scenario 27 — the rollback is intended; the slice membership is the bug). Resolves naturally once #1895's deposit-only close-out lands. Interim UX: surface `err.error.details.invoiceIds`. Open domain question logged on the issue: should `createDeposit` reject deposits on quotation invoices outright, or is "deposit against a quote" legitimate?
- **#1897 (bug, MEDIUM / Should Have)** — `GET /api/budget-sources/:id/budget-lines` is deposit-blind (`budgetSourceService.ts:812-848` / `:850-888` attribute the whole itemized amount by parent-invoice status), while the work-item page uses the deposit-aware `budgetServiceFactory.getInvoiceAggregates`. Display divergence only, **predates #1891**. Rider in the same issue: `budgetSourceService.ts:387-390` coerces any non-`'claimed'` status arg to `'paid'` via ternary — latent, fix is `new Set([status])`.

The `isSplit` fix from the same audit was folded into PR #1894 directly — deliberately **no** issue for it.

**#1895 and #1896 are pre-existing in kind since #1878** (line-split invoices); #1891's deposit tagging only widened #1895's blast radius. Neither blocks PR #1894.

## Contract facts downstream stories must respect

- **`SourceReportInvoice.allocatedAmount` is NEGATIVE for `lineKind: 'refund-adjustment'`** — server derives `lineKind = roundedAmount > 0 ? 'invoice' : 'refund-adjustment'`, so the sign and the kind are the same fact. Never re-negate at display time. This tripped up PR #1887 in four places.
- **`isSplit` is a server field** meaning "budget lines reference >1 distinct source". It is NOT `allocatedAmount < invoiceAmount` (that's partial allocation to one source — a different question). Don't recompute it client-side.
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
