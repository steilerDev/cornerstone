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
- **#1879 — Wizard frontend, PDF pipeline & claim flow.** PR #1887 reviewed 2026-07-30 → **CHANGES_REQUIRED** (see below). Final story of the mini-epic.

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

German report-type nouns approved (Verwendungsnachweis, Einreichung) — reasoning in [[glossary-decisions]].

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
