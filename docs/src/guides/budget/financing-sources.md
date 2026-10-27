---
sidebar_position: 2
title: Financing
---

# Financing

Financing is where the money for your project is set up and tracked. Open **Money > Financing** to see every way the project is paid for, in two groups on one page:

- **Loans & own funds** -- your funding sources: a bank loan, a credit line, savings, other money, and your **Own funds**
- **Grants** -- subsidies and grant programs that reduce the cost, covered in [Grants](subsidies)

Each card shows the figures for one source or grant. Select its name to open its page.

:::info Screenshot needed
A screenshot of the Financing page is not available yet.
:::

## Glossary

| Term | Meaning |
|------|---------|
| **Funding source** | A place the money comes from: a bank loan, a credit line, savings, other money, or your Own funds |
| **Grant** | A subsidy or grant program that reduces the cost of the tasks and purchases it covers |
| **Own funds** | Your own money, kept as a built-in funding source. Renamed from "Discretionary Funding" when you upgrade |
| **Allocated** | The expected cost of the cost lines a funding source pays for |
| **Paid** | Money already paid out for invoices funded by the source |
| **Submitted** | Invoices already sent to the bank in a bank report |
| **Ready to submit** | Invoices that can go into the next bank report for a loan or credit line |
| **Unallocated** | The part of the amount that no cost line uses yet. When a source is over-allocated, it shows as a negative figure |

## The Financing Page

The page header has **Prepare bank report** as its main action and a page actions menu with **Print**. Next to the group headings are two buttons, **Add funding source** and **Add grant**.

### Funding source cards

Each funding source card shows:

- The **name**, its **type** (Bank loan, Credit line, Savings, Other, or Own funds), and its **status** (Active, Used up, or Closed)
- The **rate**, when one is set
- The figures **Amount**, **Allocated**, **Paid**, **Submitted**, and **Unallocated**
- A bar that shows how much of the amount is submitted, paid, and allocated
- **Ready to submit** with a count and an amount, on bank loan and credit line cards only
- **Documents (n)** with a **Link** action, when Paperless-ngx is connected

Bank loan and credit line cards also have a **⋯** menu with **Prepare bank report**, which opens the [Bank Reports](bank-reports) wizard with that loan already selected.

### Own funds

**Own funds** is a funding source that Cornerstone creates for you. It cannot be deleted, and it does not show **Ready to submit**, because it is not a loan. You can rename it, and you can set its amount to 0 or more.

Lines that [Split with AI](auto-itemize) creates are funded from Own funds by default, until you choose a different source for each line.

### Grant cards

Each grant card shows the name, status, and rate (or the stored fixed reduction on older grants). It also lists:

- **Eligible costs up to** -- the cap, or **No cap**
- **Expected** -- the amount the grant is expected to pay
- **Covered items** -- how many tasks and purchases the grant is linked to
- **Deadline** -- with the word **Overdue** when the deadline has passed and the grant is not yet received or rejected

## Adding a Funding Source

Select **Add funding source** on the Financing page, or choose **Funding source** from the **New** menu. The dialog asks for:

- **Name** (required)
- **Type** (required): Bank loan, Credit line, Savings, or Other
- **Amount** (required): the total available from this source, more than 0
- **Status**
- **Interest rate** (optional, 0 to 100)

Under **More details** you can add the terms, a reference number, a contact address, and notes. A reference number and a contact address are what the bank report needs for its cover letter.

## The Funding Source Page

Select a funding source's name to open its page.

### Header

- The **status** chip (Active, Used up, or Closed). Select it to change the status. Use **Undo** right after a change to revert it.
- The main action. For a bank loan or a credit line it is **Prepare bank report**. For other types it is the next status step.
- **⋯** menu with **Delete**. Delete is not offered for Own funds. Deleting asks for confirmation and shows how many lines and documents are affected. A source that cost lines still use cannot be deleted; move those lines first.

### Summary strip

The strip shows **Amount**, **Allocated**, **Paid**, **Submitted**, **Unallocated**, **Rate** (when set), and **Documents (n)**.

When the source is over-allocated, the **Unallocated** figure shows the negative amount in red, and a warning appears above the tabs: **Over-allocated by ...** with a **Move lines…** button. Select **Move lines…** to go to the **Cost** tab and pick the lines to move.

### Overview tab

- **Allocation** -- the bar and a legend for Submitted, Paid, and Allocated
- **Details** -- name, type, amount, interest rate, terms, reference, contact address, and notes. Select **Edit** to change them and save

### Cost tab

The **Cost** tab lists every cost line this source pays for, grouped by area, then by task or purchase, then by line. Each task or purchase heading shows whether it is a **Task** or a **Purchase**, and links to its page.

To move lines to another source:

1. Tick the checkbox next to one or more lines. Your selection stays while you expand and collapse areas.
2. Select **Move to another source** in the selection bar.
3. Pick the target funding source and confirm.

The lines move to the new source, and both sources update. The move has no **Undo**. To reverse it, move the lines back.

:::tip
Use the Cost tab to model a what-if. For example, move the lines of a payment that a grant will cover to a different source, and compare the figures on the two cards.
:::

### History tab

The **History** tab lists the events for this source. When you send invoices to the bank in one bank report, the history shows the whole submission as one row, with the **Submission** badge. Select **Show all in History** to open the full History page.

To undo a submission that was recorded by mistake, select **Revert submission** on its row. The dialog shows how many invoices go back to To pay and how many go back to Paid, and each invoice returns to the status it had before. The row then shows a **Reverted** badge, and the revert is added as its own row. A submission cannot be reverted if an invoice in it has changed status since, or if it was already reverted. See [Reverting a submission](bank-reports#reverting-a-submission).

## Documents

When Paperless-ngx is connected, each funding source has a **Documents (n)** button, such as for loan contracts. Select it to open the Documents panel, where you can link, open, and unlink documents. See [Linking Documents](/guides/documents/linking-documents) for details.

If Paperless-ngx is not connected and the source has no linked documents, the button is not shown.

## Related Pages

- [Grants](subsidies) -- the grants that appear under **Grants** on this page
- [Bank Reports](bank-reports) -- prepare a report for a loan or credit line
- [Money Overview](budget-overview) -- the funding sources in the overall budget
