---
sidebar_position: 2
title: History
---

# History

The History page is the automatic record of what changed in your project. Cornerstone adds an entry whenever something significant changes elsewhere in the application, so you get a chronological history without any manual effort. History entries are always recorded; there is no setting to turn them off.

Open it from the **History ›** link at the top of the Site diary, or from **History** in the sidebar (on phones, use **More** and then **History**).

## What It Lists

Each row has a small type badge, such as **Task status**, **Invoice status** or **Submission**, followed by one sentence that describes the change. Typical rows read like this (all names are invented):

| Type badge | Example sentence |
|------------|------------------|
| **Task status** | "Tile the bathroom went from Not started to In progress" |
| **Invoice status** | "Invoice T-014 went from To pay to Paid" |
| **Payment** | "Progress payment for invoice T-014 went from To pay to Paid" |
| **Invoice recorded** | "Invoice T-014 recorded for Company A" |
| **Grant status** | "Energy grant went from Applied to Approved" |
| **Milestone moved** | "Facade milestone is 3 days late. Projected 12 March, target 9 March." |
| **Submission** | "3 invoices submitted to the bank, 4,200.00" (see below) |

Events are written in the language you are using in Cornerstone. Each row links to the item that changed, so you can open it directly. A payment row opens its payment.

## One Row per Bank Submission

When you send several invoices to the bank in one bank report, Cornerstone records each invoice, but the History page shows the whole submission as **one row** with the **Submission** badge. The sentence gives the number of invoices and their total, for example "3 invoices submitted to the bank, 4,200.00". Below it, the row lists the first invoice numbers, for example "Invoices T-001, T-002, T-003". Its link opens the page of that funding source, labelled with the funding source's name. The **Revert submission** button on the row undoes the submission; see [Bank Reports](/guides/budget/bank-reports#reverting-a-submission).

Submissions recorded before this change are shown as ordinary invoice status rows, because Cornerstone cannot tell which of them belonged together. A deleted funding source shows "No longer exists" instead of a link.

## Filters

The type chips are always shown above the list. Choose one kind of change, such as **Task status**, **Payment** or **Invoice status**. **Submission** shows only bank submissions. **Payment** shows invoices and progress payments you marked as paid; a submission is never counted as a payment.

The other filters are below the chips:

- **Object** -- Pick a task, invoice, grant or milestone to see only its history. The filter shows the object's name. If the object was deleted, it shows "No longer exists"
- **Search** -- Type a word to find matching changes, for example the name of a vendor
- **From** and **To** -- Limit the list to a range of dates

On phones, a **Filters** button opens these filters. On larger screens they are always visible.

**Over budget** and **Schedule update** are still available as type chips, but only older records carry them. Cornerstone no longer creates new rows of these two kinds.

Type and object filters apply to automatic changes only. Dates and search apply to every row.

### Include Site Diary Entries

Turn on **Include site diary entries** to add the entries you wrote in the Site diary to the History list. Drafts that you have not saved are never included. Your entries follow the same dates and search as the automatic changes, and they ignore the type and object filters.

## Hidden Delay Notes

When a milestone is moved again after it was already reached, the extra delay note is hidden by default to keep the list short. The History page shows a line such as "1 later delay note is hidden." Click **Show hidden** to display these notes, and **Hide again** to collapse them.

## Repeated Changes

When the same change happens several times in a row, the repeats are collapsed into one row that shows the count and the date range.

## Limitations

- History entries **cannot be edited or deleted** -- they are system-generated records
- Entries are created at the time the change happens; they are not added for changes that happened before this feature existed
