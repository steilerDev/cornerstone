---
name: Standalone budget/invoice bugs and stories (no active parent epic)
description: Index of standalone Todo items for budget, invoice, and quotation flows after EPIC-15 closed. Useful when a future invoice/budget epic is opened.
type: project
---

After EPIC-15 (#602, Budget-Line Invoice Linking Rework) closed in 2026-03, several invoice/budget improvements landed as standalone issues without a parent epic. The only currently open epic is EPIC-16 (Floor Plans, unrelated). When a new invoice/budget epic is created, consider linking these as sub-issues:

**Why:** the natural parent (EPIC-15) is closed, so we accept ungrouped stories rather than re-opening a closed epic. Cluster of related work signals a future epic.

**How to apply:** when triaging a new invoice/budget user-reported improvement, check this list — if it's growing (≥4 items), propose a new epic at the next planning cycle.

## Items

- **#1369** — hide-linked filter on Paperless picker (Todo, 2026-04-28 batch)
- **#1370** — disable scroll-wheel on numeric inputs (Todo, 2026-04-28 batch)
- **#1371** — "Includes VAT" parity for direct-amount budget lines (Todo, 2026-04-28 batch)
- **#1372** — vendor in invoice picker (Todo, 2026-04-28 batch)
- **#1373** — "Claimed" total on Budget Invoices summary (Todo, 2026-04-28 batch)
- **#1389** — remove Budget Health hero card from /budget/overview (Todo, 2026-04-29 batch)
- **#1390** — source-name badge missing from print preview (Todo, 2026-04-29 batch)
- **#1401** — Unify budget-line creation form on invoice/quotation flow and auto-link with planned amount (Todo, 2026-05-10) — **new story** addressing form parity gap between invoice picker create-form and item-side rich form, plus auto-link after create.
- **#1421** — Surface overdue pending invoices and deposits in invoice overview (5th conditional summary box, warning colors, count breakdown `X invoices, Y deposits` + summed amount) (Todo, 2026-05-15 batch)
- **#1422** — Increase vertical spacing between Invoices page summary boxes and search bar (use spacing token, match other list pages) (Todo, 2026-05-15 batch)
- **#1423** — Deposit kebab popover clipped by list container — portal/escape clipping bounds (Todo, 2026-05-15 batch). May share a fix with budget line kebab in #1425.
- **#1424** — Edit deposit dialog shows raw i18n keys `buttons.cancel`/`buttons.save` instead of localized labels (Todo, 2026-05-15 batch)
- **#1425** — Budget line items lack kebab + full-edit-dialog parity with deposit line items — requires dev-team-lead audit of deposit edit experience to mirror it (Todo, 2026-05-15 batch). Larger UX/consistency change, not just a styling fix.
- **#1439** — Direct-mode VAT toggle double-applies 19% uplift on budget line `plannedAmount`. Bug introduced by #1371 (closed 2026-04-28) which added the VAT checkbox to direct mode without removing the form-side pre-multiplier. Hook `useBudgetSection.ts` line 196-197 multiplies by 1.19 before submit while `includesVat=false` is also persisted, so `effectivePlannedAmount()` applies another ×1.19. Unit-pricing branch is correct (raw `qty × unitPrice` stored). (Todo, 2026-05-17 batch).
- **#1440** — Quotation-linked budget line shows `€0.00 – €0.00` on work item detail page. Root cause: `depositAggregateUtils.ts:179` explicitly excludes quotation invoices from `actualCost` (`// Skip quotations from actualCost (matches existing behavior)`), and `BudgetLineCard.tsx:50` multiplies the (zero) `actualCost` by 0.95 / 1.05 for quoted lines. Contradicts `BaseBudgetLine.actualCost` doc which says "sum of all linked invoices (any status)". (Todo, 2026-05-17 batch).
- **#1441** — Quotations don't contribute to work item total cost (Budget Cost Overview); quotation rows missing vendor name in `InvoiceGroup` header. Same root cause as #1440: `computeBudgetTotals()` in `budgetConstants.ts:42-58` uses `b.actualCost × 0.95 / 1.05` for quotation lines → contributes zero. Vendor missing: `InvoiceGroup.tsx:87-112` header layout has no vendor slot, and `BudgetLineInvoiceLink` shared type (lines 40-47) lacks `vendorName`. Coordinated fix with #1440. (Todo, 2026-05-17 batch).

- **#1426** — CRITICAL: diary photo data loss on create-flow upload failure. Spec proposes auto-draft + immediate photo upload on first interaction (24 ACs, 10 architect Qs, multi-story). Edit page already uploads immediately; create page buffers in `pendingFiles`. (Todo, 2026-05-15). See [standalone-diary-bugs.md](standalone-diary-bugs.md).
- **#1553** — Full edit for invoice budget lines + linked-item (parent) move. Invoice→Budget Lines→Edit today only edits `itemizedAmount`; expand to all fields + parent-picker on WI/HI inline edit. 20 ACs / 5 sections. Move semantics from `budgetLineAssignService` (same-table = UPDATE FK; cross-table = insert + repoint IBL + delete). 4 open architect Qs. (Todo, 2026-05-22).
- **#1600** — Auto-itemize `AutoItemizePage` assignment Modal, 3 flaws (lines ~1223-1382): (1) `SearchPicker` dropdown clipped by Modal/`pickerContent`/`pickerStep` overflow; (2) `useBudgetLinePicker` only shows "Create new budget line" in empty-state branch (`budgetLines.length===0`); (3) `showCreateBudgetLineForm` seeds `initialForm` with empty strings, forcing re-entry of props already on `ExtractedLine`. Spec: server-side auto-create (Option A preferred) vs form pre-fill (Option B); needs "Created from auto-itemization" badge approval. 18 ACs. (Todo, 2026-05-26).
- **#1545/#1546/#1547** — Mini-epic "Auto-itemize invoices from Paperless OCR", 3 stories, chain A→B→C (C blocked by A+B). A(#1545): unassigned budget lines + one-shot parent assignment (13 ACs, migration 0036 drops NOT NULL on `work_item_budgets.work_item_id`, adds `origin`, POST `/api/budget-lines/:id/assign`). B(#1546): BudgetExtractionService + OpenAI-compatible LLM gateway (11 ACs, ADR, first outbound LLM integration, needs security-engineer review; env `LLM_BASE_URL/API_KEY/MODEL/REQUEST_TIMEOUT_MS`, `autoItemizeEnabled` on `/api/config`). C(#1547): auto-itemize endpoint + UI (19 ACs, POST `/api/invoices/:invoiceId/auto-itemize` dry-run+commit; append vs replace where replace nukes only `origin='auto'`). (Todo, 2026-05-21). Note: auto-itemize has NO parent epic — standalone.
- **#1833** — Auto-itemize Save creates DUPLICATE budget lines on commit retry. `materializeInlineDrafts` (`client/src/lib/autoItemizeDraftUtils.ts`) POSTs new budget lines BEFORE the atomic commit, but both `handleSave` handlers (`PaperlessInvoiceReviewPage.tsx` via `POST /api/invoices/auto-itemize/commit`; `AutoItemizePage.tsx` via `POST /api/invoices/:invoiceId/auto-itemize`) keep materialized lines in a local var, never `setLines`. On commit failure (e.g. `ITEMIZED_SUM_EXCEEDS_INVOICE`) retry re-materializes → 2nd line created; 1st orphaned but still counts toward planned-cost rollups. Fix: persist materialized IDs into state so retry uses assign-existing (server junction dedup guard). 4 ACs. (Todo, 2026-07-07).
- **#1723** — Photo lightbox picker UX (photo parents EPIC-13 #446 + annotation epic #1472 both CLOSED). Follow-up to #1674/PR #1676. Lightbox `PhotoMetadataSidepanel` switches raw `SearchPicker<AreaResponse>` → shared `AreaPicker`; AreaPicker gets ancestor-path secondary line + depth indentation; hierarchy-aware area search; OrientationPicker filter matches description OR name. 18 ACs / 5 sections. ONE combined PR. (Todo, 2026-06-16). See [standalone-photo-stories.md](standalone-photo-stories.md).

**2026-05-17 batch** (#1439-#1441) brings the standalone count to 16. Three bugs cluster around VAT/quotation arithmetic and display: VAT double-uplift (#1439), zero quoted amount on line cards (#1440), zero quotation contribution to totals + missing vendor (#1441). #1440 and #1441 share a root cause (quotations excluded from `actualCost`) and should be bundled in a single fix PR with a canonical decision on the `actualCost` contract (include quotations vs add a new `quotedAmount` field). Subsidy/payback math invariants (`actualCostPaid` semantics) must be preserved.

**2026-05-15 batch** brings the standalone count to 13 — strong signal to propose a new "Budget/Invoice UX Polish" epic at the next planning cycle. Themes clustering: overdue/alerting (#1421), kebab/edit affordance parity (#1423, #1425), header layout consistency (#1422, partly #1389/#1390), i18n hygiene (#1424), VAT/quotation arithmetic (#1439-#1441). Suggest grouping into 4 epic themes if/when opened: (a) overdue & alerting, (b) line-item editing parity (deposit/budget/quotation), (c) header & layout polish, (d) VAT & quotation correctness.

## Related code references

- Slim invoice-side form: `client/src/pages/InvoiceDetailPage/InvoiceBudgetLinesSection.tsx` (lines ~744–883, `handleCreateBudgetLine` at ~232)
- Rich item-side form: `client/src/components/budget/BudgetLineForm.tsx`
- Shared form-state hook: `client/src/hooks/useBudgetSection.ts` (`BudgetLineFormState`, `emptyForm`, VAT multiplier logic in `handleSaveBudgetLine`)
- Shared API contract: `CreateBudgetLineRequest` in `shared/src/types/budget.ts` already supports quantity/unit/unitPrice/includesVat/vendorId
- Invoice-line link API: `client/src/lib/invoiceBudgetLinesApi.ts`, `server/src/routes/invoiceBudgetLines.ts`
