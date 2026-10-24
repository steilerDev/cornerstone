---
name: cost-lines-grid
description: Shipped cost-line grid (Split with AI, offer/invoice split, new-invoice review) - columns, actions, move rule, merge. Replaces the old card-based auto-itemize flow.
metadata:
  type: project
---

The auto-itemize flow is grid-based. The old card flow (AutoItemizeLineCard, BudgetLinePickerModal, EditBudgetLineModal, the per-card "Assign" button and the queued "Creating New" create-line) is GONE from the UI. Do not document it.

**Where the grid is used** (`client/src/components/CostLineForm/CostLineGrid.tsx`, row in `CostLineGridRow.tsx`, model in `costLineGridModel.ts`):

- Split with AI page (`pages/AutoItemizePage`) and the new-invoice review screen (`pages/PaperlessInvoiceReviewPage`): both render `AutoItemizeLines`, options `AUTO_ITEMIZE_GRID_OPTIONS` in `hooks/useAutoItemizeLines.ts` (targets, category + funding source columns, include, select, existing lines).
- Offer/invoice split (`CostLineGridDialog.tsx`, `DOCUMENT_OPTIONS`): targets and category column, no include, select or funding-source column.
- Item hosts (`ITEM_OPTIONS`): no targets column.

**Column order (verified in `CostLineGrid.tsx` header, cells in `CostLineGridRow.tsx`)**: Row, Include (include option), Select (select option), Description, Quantity, Unit, Unit price, Entered as, Gross, Belongs to (targets option), Cost category (`columns` includes category), Funding source (`columns` includes fundingSource), Actions. English labels: Row, Include, Select, Description, Quantity, Unit, Unit price, Entered as, Gross, Belongs to, Cost category, Funding source, Actions.

**Actions cell**: Duplicate (always), Use existing (existingLines and unlinked rows), Remove (when more than one row).

**AI certainty**: rendered as a line under the description (`renderRowExtra` in `AutoItemizeLines.tsx`), not as its own column.

**Move rule** (verified):

- Client-only validation: `costLineValues.ts` `validateValues` sets the `moveType` error when the row has no invoice (`invoiceId === null`), a target is picked, and `target.type !== row.lineType`. Text: "A line without an offer or invoice can only move to the same kind of item." (`costLines.json` `errorMoveType`).
- Server has no matching error string. `invoiceBudgetLineService.ts` `editAndMoveBudgetLine` supports cross-table moves for invoice-linked lines. `householdItemBudgetService.ts` rejects cross-table moves on the household-item budget PATCH endpoints.
- So: invoice-linked lines can move to either a task or a purchase; unlinked lines only within their kind.

**Merge** (Select column): sums are client-side, only descriptions and category vocabulary go to the LLM, lowest confidence kept, "Restore original lines" undo until save. Assigned lines cannot be selected.

**Paste and keyboard**: paste up to 200 rows (Description, Quantity, Unit, Unit price); Ctrl/⌘+D duplicate, Ctrl/⌘+Backspace remove empty row, Ctrl/⌘+S or Ctrl/⌘+Enter save.

Anchors in use: `auto-itemize#merge-related-lines-into-one`, `work-item-budgets#editing-a-linked-cost-line`, `vendors-and-invoices#splitting-an-offer-or-invoice-into-cost-lines`, `auto-itemize#6-assign-each-line-and-set-its-category-and-funding-source` (Docusaurus drops the "6.").

See also [[invoice-status-words]] and [[release-history]].
