---
sidebar_position: 5
title: Invoice Deposits
---

# Invoice Deposits

Many construction invoices are paid in stages -- a deposit on signing, a progress payment at milestones, and a final payment on handover. Cornerstone lets you track these staged payments as **deposits** within a single parent invoice, so your budget rollups reflect what has actually been paid out at any point in time rather than waiting for the full invoice to settle.

## What is a Deposit?

A deposit is a partial payment recorded against an invoice. Each deposit has its own amount, due date, status, and (optionally) a description. The amounts you record as deposits eat into the invoice total -- whatever is left after the deposits is the **final payment**, which uses the parent invoice's status.

The math is:

- `final payment = max(0, invoice total − deposits − refunds already received)`
- When net deposits exceed the invoice total, the final payment displays as 0. If the company will pay back the excess, record a refund entry -- pending refunds then show under **Refunds due to you** on the Invoices page.

Each deposit is one of three statuses, mirroring the parent invoice status model:

| Status | Meaning |
|--------|---------|
| **Pending** | Deposit is scheduled (or due) but not yet paid |
| **Paid** | Deposit has been paid to the company |
| **Claimed** | Deposit has been claimed back from / reimbursed by a financing source |

Allowed transitions: `pending → paid`, `paid → claimed`, and the reverse path (`claimed → paid → pending`) to correct mistakes.

## Adding a Deposit

Open any invoice's detail page. The **Deposits** section appears below the invoice header and shows:

- The current deposit count
- A list of existing deposits with amount, due date, status badge, and description
- An **Add deposit** button

Click **Add deposit** to open the form:

| Field | Description |
|-------|-------------|
| **Amount** | Deposit amount. Must be positive. The form warns if net deposits (deposits minus refunds) would exceed the invoice total, but does not block the save. |
| **Due date** | When the deposit is owed -- used for the schedule and for the overdue indicator. |
| **Status** | Pending (default), Paid, or Claimed. |
| **Paid date** | Shown when status is Paid or Claimed -- defaults to today, change if it was paid earlier. |
| **Claimed date** | Shown when status is Claimed -- defaults to today, change if it was claimed earlier. |
| **Description** | Optional free-text label (e.g., "30% on contract signing", "Milestone payment after framing"). |

Save the form to record the deposit. The Deposits list re-renders with the new entry, and the budget rollups across linked tasks and purchases update immediately to reflect the contribution.

## Editing and Deleting Deposits

Each deposit row has an overflow menu with **Edit** and **Delete**.

- **Edit** opens the same form with the deposit's current values. Status changes are restricted to the allowed transitions above; for example, you cannot move directly from Pending to Claimed -- mark it Paid first.
- **Delete** removes the deposit. If the deposit is Paid or Claimed, the modal warns you that deleting will reduce the paid/claimed amount rolled up against cost lines.

You can also mark a deposit as Paid or Claimed without editing it: the **mark paid** and **mark claimed** quick actions in the overflow menu open a small confirmation modal where you can set the paid or claimed date.

If you mark a deposit Paid or Claimed by mistake, use the same menu to revert it -- the action is allowed and shows a transient error banner if the revert fails (for example, due to a network glitch).

## How Deposits Affect Budget Rollups

Deposits change the **timing** of cost recognition, not the total. Cornerstone splits each invoice across its deposits proportionally for every cost line the invoice is linked to:

- **`actualCost`** (total) -- the full itemized amount counts toward the cost line regardless of deposit status. Even a Pending deposit contributes to actualCost, because the invoice as a whole is a committed cost.
- **`actualCostPaid`** -- only the portion of the itemized amount covered by **Paid** or **Claimed** deposits, plus the residual final payment if the parent invoice is itself Paid or Claimed.
- **`actualCostClaimed`** -- only the portion covered by **Claimed** deposits, plus the residual final payment if the parent invoice is Claimed.

In practice: if you have a €10,000 invoice linked to a cost line at its full €10,000, and you record a €3,000 Paid deposit while the invoice itself is still Pending, the cost line shows €10,000 actual cost but only €3,000 paid. The remaining €7,000 stays as a pending obligation until either the parent invoice transitions to Paid or you add more Paid deposits to cover it.

The **status breakdown summary** on each invoice list and the per-source budget overview both use this deposit-aware math, so paid and claimed amounts always reflect real cash flow rather than waiting for the entire invoice to settle.

## Offers and Deposits

Offer invoices accept deposits the same way as regular invoices. On **Money > Overview** an offer counts at its face value, with no range added. A deposit counts toward Paid only once its own status is Paid or Claimed.

## Cascade Behaviour

Deposits are owned by the parent invoice. Deleting an invoice cascades and removes all its deposits in the same transaction -- you do not need to delete deposits one by one before deleting the invoice.

## Next Steps

- [Invoices & Vendors](vendors-and-invoices) -- creating invoices and linking them to cost lines
- [Budget Overview](budget-overview) -- how deposit-aware totals roll up across categories and sources
- [Subsidies](subsidies) -- subsidy calculations also use itemized amounts and respect deposit status
