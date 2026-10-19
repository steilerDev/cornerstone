---
sidebar_position: 2
title: System Events
---

# System Events

Cornerstone records significant changes elsewhere in the application as diary entries, so you get a chronological History of your project without any manual effort. System events are always recorded; there is no setting to turn them off.

## How It Works

When something changes -- for example a work item's status, an invoice, a schedule recalculation, or a subsidy -- Cornerstone writes a History entry describing it. These entries appear in the diary timeline alongside your manual entries, sorted by date.

## Event Types

| Event Type | What Triggers It |
|------------|-----------------|
| **Work Item Status** | A work item moves to a different status (e.g., "Not Started" to "In Progress" or "Completed") |
| **Invoice Created** | A new invoice is added to a vendor |
| **Invoice Status** | An invoice status changes (e.g., "Pending" to "Paid" or "Claimed") |
| **Milestone Delay** | A milestone's projected completion date moves past its target date |
| **Budget Breach** | Actual or projected costs for a budget category exceed the allocated amount |
| **Schedule** | The project schedule is recalculated (e.g., after auto-scheduling or dependency changes) |
| **Subsidy** | A subsidy program's status or amount changes |

## Reading System Events

- **Language** -- Events are written in the language you are using in Cornerstone.
- **Repeats** -- When the same change happens several times in a row, the repeats are collapsed into one entry that shows the count and the date range.
- **Hidden delay notes** -- A milestone delay logged after the milestone was already reached is hidden by default. Click **Show hidden** in the diary to display these notes, and **Hide again** to collapse them.
- **Related item** -- Each event links to the item that changed. A progress-payment event opens its payment directly.

System events do not have metadata, weather, or photo attachments.

## Filtering

On the diary page, use the filter chips to isolate system events:

1. Select the **History** chip to show only system-generated entries
2. Additional type-specific chips appear for finer filtering:
   - **Work Item** -- Work item status changes
   - **Invoice** -- Both invoice creation and invoice status changes
   - **Milestone** -- Milestone delay events
   - **Budget** -- Budget breach events
   - **Schedule** -- Schedule change events
   - **Subsidy** -- Subsidy change events

## Limitations

- System events **cannot be edited or deleted** -- they are system-generated records
- Events are created at the time the triggering action occurs; they are not retroactively generated for past changes
