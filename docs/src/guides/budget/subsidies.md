---
sidebar_position: 6
title: Grants
---

# Grants

A **grant** is a subsidy or grant program that pays back part of the cost of specific work. Grants appear under **Grants** on the **Money > Financing** page, next to your [funding sources](financing-sources). Each grant has a rate, an optional cap, and a list of the tasks and purchases it covers.

:::info Screenshot needed
A screenshot of the grant page is not available yet.
:::

## Adding a Grant

Select **Add grant** on the Financing page, or choose **Grant** from the **New** menu. The dialog asks for:

- **Name** (required)
- **Rate (%)** (required): the share of the covered costs the grant pays, above 0 and up to 100
- **Link tasks / purchases** (required): choose at least one task or purchase the grant covers
- **Eligible costs up to** (optional): a cap on the amount the grant can pay

Under **More details** you can set the status, the deadline, the cost categories, a description, the eligibility rules, and notes.

New grants are percentage-based. The dialog does not offer a fixed amount.

## Grant Statuses

| Status | Meaning |
|--------|---------|
| **Eligible** | Identified as a grant you qualify for, not yet applied |
| **Applied** | Application has been submitted, awaiting decision |
| **Approved** | Grant approved but money not yet received |
| **Received** | Grant money has been received |
| **Rejected** | Application was denied |

Only grants with **Approved** or **Received** status count toward **Expected** on the [Money Overview](budget-overview) and the Financing page. Eligible, applied, and rejected grants are tracked but do not change the figures.

## Covered Items

A grant pays only for the tasks and purchases linked to it, on its **Work** tab. A grant with cost categories but no linked tasks or purchases counts **0** until you link items. This is the most common reason a grant shows a small **Expected** amount.

Within a linked item, the grant applies to:

- every cost of the item, when the grant has no cost categories
- only the costs in the grant's cost categories, when it has categories
- costs without a category too, when **No category** is ticked

### Linking tasks and purchases

1. Open the grant and select the **Work** tab.
2. Select **Link tasks / purchases**. A picker opens.
3. Tick one or more tasks or purchases. Each one appears as a chip. Remove a chip to untick it.
4. Select **Link n items**.

Items that are already linked do not appear in the picker again.

### Covered items list

Each covered item shows its kind (Task or Purchase), its area, and the **covered amount**: the part of its cost that the grant pays, as the Money Overview calculates it. The covered amount is computed from the item's cost lines. You cannot type it in, and rows have no Edit action.

To remove an item, select **Remove** on its row. Cornerstone shows an **Undo** message for a short time, so you can restore it.

Removing an item from a grant does not change the item itself.

:::note
If you link no items yet, the Work tab says **No covered items yet** and shows **Expected** as 0. The grant starts to count once you link tasks or purchases.
:::

## Expected Amount

The **Expected** figure is the grant's payout for the covered costs:

- **Percentage grants:** the rate applied to the covered costs, capped at **Eligible costs up to** if you set a cap
- **Legacy fixed grants:** the stored amount for each covered item, capped the same way

The **Overview** tab repeats this in the section **How the expected grant is calculated**, with the actual rate, covered costs, and cap.

A task or purchase can be covered by several grants. Each grant shows its own covered amount.

## Legacy Fixed-Amount Grants

Earlier versions let you create grants with a fixed amount, such as a $2,000 insulation grant. Those grants keep working, and they show the stored amount everywhere a rate would show, with the label **Fixed reduction** and the amount. Their figures do not change.

To edit a fixed-amount grant, open its **Details** and change the **Fixed reduction** amount. New grants cannot be created as fixed amounts.

## The Grant Page

Select a grant's name on the Financing page to open it.

### Header

- The **status** chip. Select it to change the status, and use **Undo** right after a change to revert it.
- The main action is the next status step for the grant.
- **⋯** menu with **Delete**. See [Deleting a grant](#deleting-a-grant).

### Summary strip

The strip shows the **Rate** (or the fixed reduction for legacy grants), **Eligible costs up to** (or **No cap**), **Expected**, **Deadline**, and **Documents (n)**.

### Overview tab

- **Details** -- name, rate, status, deadline, description, and notes. Select **Edit** to change them and save
- **Eligibility** -- the cost categories, the **No category** option, and the eligibility rules. Select **Edit** to change them
- **How the expected grant is calculated** -- the explanation described above

### Work tab

The **Work** tab holds the covered items described above. Use it to link and remove tasks and purchases.

### History tab

The **History** tab lists the events recorded for this grant.

## Deleting a grant

Select **⋯ > Delete** on the grant page. Cornerstone asks for confirmation first.

A grant that still covers tasks cannot be deleted. The message reads: "This grant covers tasks. Remove them on its Work tab first." Remove the tasks on the **Work** tab, then delete the grant.

Purchases do not block deletion. When you delete a grant, its linked purchases are unlinked, and the purchases themselves stay.

## Documents

When Paperless-ngx is connected, each grant has a **Documents (n)** button, such as for application forms and approval letters. Select it to open the Documents panel, where you can link, open, and unlink documents. See [Linking Documents](/guides/documents/linking-documents) for details.

If Paperless-ngx is not connected and the grant has no linked documents, the button is not shown.

## Related Pages

- [Financing](financing-sources) -- funding sources and the Financing page
- [Money Overview](budget-overview) -- the expected grants in the overall budget
- [Household Items](/guides/household-items) -- purchases that a grant can cover
