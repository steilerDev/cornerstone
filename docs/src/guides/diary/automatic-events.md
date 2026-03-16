---
sidebar_position: 2
title: Automatic Events
---

# Automatic System Events

Cornerstone automatically creates diary entries when significant changes happen elsewhere in the application. These events give you a chronological audit trail of your project without any manual effort.

## How It Works

When you perform certain actions in Cornerstone -- such as changing a work item's status, creating an invoice, or triggering a schedule recalculation -- the system automatically generates a diary entry recording what happened. These entries appear in the diary timeline alongside your manual entries, sorted by date.

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

## Reading Automatic Events

Each automatic event includes:

- **Title** -- A summary of what changed (e.g., "Work item 'Install kitchen cabinets' moved to In Progress")
- **Body** -- Additional context about the change (no "[Source]" prefix -- the body contains plain descriptive text)
- **Related item link** -- A "Go to related item" link that navigates directly to the entity that triggered the event (work item, invoice, milestone, etc.)

Automatic events do not have metadata, weather, or photo attachments.

## Filtering

On the diary page, use the filter chips to isolate automatic events:

1. Select the **Automatic** chip to show only system-generated entries
2. Additional type-specific chips appear for finer filtering:
   - **Work Item** -- Work item status changes
   - **Invoice** -- Both invoice creation and invoice status changes
   - **Milestone** -- Milestone delay events
   - **Budget** -- Budget breach events
   - **Schedule** -- Schedule change events
   - **Subsidy** -- Subsidy change events

## Limitations

- Automatic events **cannot be edited or deleted** -- they are system-generated records
- Events are created at the time the triggering action occurs; they are not retroactively generated for past changes
