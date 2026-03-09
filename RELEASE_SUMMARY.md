## What's New

This release reworks the invoice-budget-line relationship from a one-to-one model to a flexible many-to-many design. A single invoice can now be linked to multiple budget lines across work items and household items, each with an itemized amount that attributes a specific portion of the invoice to that budget line.

### Highlights

- **Multiple Budget Lines per Invoice** -- Link several budget lines from different work items and household items to a single invoice, each with its own itemized amount. A computed "Remaining" row on the invoice page shows any unallocated portion of the invoice total.
- **Bidirectional Linking** -- Attach budget lines to invoices from the invoice detail page (two-step picker: select item, then budget line) or directly from a work item or household item's Budget tab.
- **Invoice Groups on Item Pages** -- When multiple budget lines on the same item share an invoice, they collapse into a grouped view showing the invoice total, each line's planned amount, and its itemized amount.
- **Accurate Subsidy Calculations** -- Subsidy reductions now use the itemized invoice amount as the cost basis when a budget line is linked to an invoice, instead of the planned estimate.
- **Accessibility Improvements** -- Focus-visible states, ARIA attributes on invoice groups, keyboard navigation, and 44px touch targets on mobile.

### Breaking Changes

- The old single-budget-line picker on the invoice create/edit modals has been removed. Budget lines are now linked after invoice creation from the invoice detail page or from item detail pages.
