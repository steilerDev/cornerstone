---
sidebar_position: 3
title: Task Costs
---

# Task Costs

Each task can have one or more **cost lines** that track what that task costs. A cost line is one priced line on a task or purchase. It is either an **estimate** you made yourself or a line from a company's **offer** or **invoice**. Each cost line connects a task to a cost category and a [financing source](financing-sources).

:::note Renamed from budget lines
Earlier versions called these **budget lines**. The same lines are now called **cost lines** everywhere in the app.
:::

## The Cost Tab

On the task page, open the **Cost** tab. Its **Cost lines** list shows every cost line on the task, with the **Estimates** first and then one group for each offer or invoice the lines are linked to. **Add cost line** adds a line, **New invoice** creates an invoice, and the **Grants** list below shows the grants that cover the task.

Each line shows a **state chip** that tells you where its amount comes from:

| State | Meaning |
|-------|---------|
| **Estimate** | Not linked to an offer or invoice yet. The amount is your planned amount. |
| **Offered** | Linked to a company's offer. |
| **Invoiced** | Linked to an invoice that is not paid yet. |
| **Paid** | Linked to an invoice that has been paid. |
| **Submitted** | Linked to an invoice that has been submitted for reimbursement from a financing source. |

Amounts are shown **gross**, which means including VAT. Hover over an amount, or focus it with the keyboard, to see the **net** amount and the VAT in a tooltip.

## Adding a Cost Line

Click **Add cost line** on the **Cost** tab. The form asks for:

- **Description** -- What the cost is (e.g., "Oak flooring", "Electrician labour")
- **Pricing** -- **Unit pricing** (quantity times unit price, the default) or **Direct amount** (one total)
- **Entered as** -- **Net** (the default) or **Gross**. See [VAT handling](#vat-handling) below.
- **Basis** -- What the amount rests on (see below)
- **Cost category** and **Funding source** -- Where the cost belongs and which source pays for it
- **Company** -- Optional. The company you expect to pay for this line. Type to search. If no company matches, choose **New company ‹text›** to create it and select it

After you save, the form stays open with **Add another** so you can enter the next line straight away. To enter many lines at once, use the grid described in [Invoices & Companies](vendors-and-invoices#splitting-an-offer-or-invoice-into-cost-lines).

## Basis

The **Basis** of an estimate says what the amount rests on. On **Money > Overview**, the basis also sets the range (**Low** to **High**) for a line that is not yet linked to an offer or invoice:

| Basis | Range on Money > Overview | Meaning |
|-------|--------------------------|---------|
| **Own estimate** | +/- 20% | Your personal rough estimate |
| **Professional estimate** | +/- 10% | An estimate from a contractor or professional |

A line linked to an offer or invoice does not use the basis you pick. Its basis is **Offer** or **Invoice**, set by the linked document. On the task and purchase pages, and on Money > Overview, such a line counts at its face value with no margin.

As your project moves from early estimates to offers to invoices, the budget overview becomes more accurate.

Once a line is linked to an offer or invoice, its basis is set by that document and shows as read-only text (**Offer** or **Invoice**), with the note "Set by the linked offer" or "Set by the linked invoice".

## Linking to Invoices

When a company's offer or invoice arrives for work covered by a cost line, you can link the line to it. You can do this from either direction:

- **From the invoice or offer page** -- split the document into cost lines on tasks and purchases. See [Invoices & Companies](vendors-and-invoices#splitting-an-offer-or-invoice-into-cost-lines).
- **From the Cost tab of the task page** -- on an estimate, click **Link to offer or invoice** and pick the offer or invoice. Enter the amount that applies to this line.

A cost line can be linked to **at most one** offer or invoice. When several lines on the same task belong to the same document, they appear together in one group, headed by the document number and its total.

See [Invoices & Companies](vendors-and-invoices) for the full picture of managing offers, invoices and their lines.

## Editing a Linked Cost Line

Cost lines linked to an offer or invoice -- including lines created by [Split with AI](auto-itemize) -- can be edited in place, without unlinking them first. Click **Edit** in the line's row actions to open the form. From there you can:

- **Change the line details** -- description, amount, cost category, funding source, company, and the amount that ties the line to its offer or invoice.
- **Move the line to another item.** The **Belongs to** field re-homes the line on another task or purchase. A linked line can move to either a task or a purchase. A line that is not linked to an offer or invoice can only move to an item of the same kind (a task to a task, a purchase to a purchase); the form refuses the other kind with "A line without an offer or invoice can only move to the same kind of item."

The link to the offer or invoice is kept when you move the line. Only the item it belongs to changes.

### Removing a Link

**Remove from offer** or **Remove from invoice** (also shown as **Unlink**) detaches the line from its offer or invoice. On an offer page the action reads **Remove from offer**; on an invoice page it reads **Remove from invoice**. The line stays on the task as an estimate.

The link is removed at once, with no confirmation dialog. A message appears with an **Undo** button. Select **Undo** to link the line to the same offer or invoice again. If the line has changed since, Undo does not restore the link, and the message says so.

**Delete** removes the cost line, after a confirmation dialog. A line linked to an offer or invoice cannot be deleted until you remove the link.

## Grants

A [grant](subsidies) can pay back part of the cost of a task. On the **Cost** tab, the **Grants** list shows every grant that covers the task. Select **Add** to link a grant to the task. Select **Remove** on a grant to unlink it. An **Undo** notification follows, so you can restore the link if you removed the wrong one. When no grant covers the task, the list says so.

The grants on a task also appear in its summary strip as **Expected cost**, with the name of the first grant and a count of any others.

## Multiple Cost Lines per Task

A single task can have many cost lines. For example, "Renovate bathroom" might have separate cost lines for plumbing, electrical, and tiling -- each in a different category and potentially funded by different financing sources.

## VAT Handling

Each cost line has an **Entered as** setting:

- **Net** (the default for new lines) -- the amount you type excludes VAT. Cornerstone adds VAT at the rate set for your instance (19% by default).
- **Gross** -- the amount you type already includes VAT.

With unit pricing, the form shows the result as you type. For example, 10 units at a net unit price of 100 give "Gross 1,190.00 (net 1,000.00 + VAT 19%)".

Amounts are stored gross, and the Cost lines table shows gross amounts with the net amount in the tooltip. Because every line is stored the same way, comparisons in the [Money Overview](budget-overview) and the printed reports are like-for-like, whatever pricing mode you chose for each line.
