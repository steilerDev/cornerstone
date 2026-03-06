---
sidebar_position: 4
title: Delivery & Dependencies
---

# Delivery & Dependencies

Household items have a delivery-focused scheduling model. Unlike work items which have start and end dates with durations, household items are treated as zero-duration terminal nodes -- they represent a single delivery event that depends on other work being completed first.

## Delivery Dates

Each household item can track several dates:

| Field | Description |
|-------|-------------|
| **Order Date** | When the item was or will be ordered |
| **Earliest Delivery Date** | Start of the expected delivery window |
| **Latest Delivery Date** | End of the expected delivery window |
| **Target Delivery Date** | Computed from dependencies -- the earliest date the item could arrive based on predecessor completion |
| **Actual Delivery Date** | When the item actually arrived |

The **target delivery date** is automatically calculated by the scheduling engine based on the item's dependencies. If a household item depends on a work item that finishes on March 15, the target delivery date will be March 15 or later.

## Late Detection

A household item is flagged as **late** when its target delivery date has passed but the item has not yet arrived (no actual delivery date recorded). Late items are visually indicated in the list and detail views.

## Timeline Dependencies

Household items can depend on **work items** and **milestones**. All dependencies are treated as finish-to-start with zero lag -- the household item's delivery cannot happen until the predecessor is complete.

### Adding Dependencies

On the household item detail page, use the **Dependencies** section to add predecessors:

1. Click **Add Dependency**
2. Choose the predecessor type -- **Work Item** or **Milestone**
3. Select the specific work item or milestone
4. The target delivery date recalculates automatically

### Viewing on the Gantt Chart

Household items with dependencies appear on the [Gantt chart](/guides/timeline/gantt-chart) as diamond markers (similar to milestones). Dependency arrows connect predecessors to the household item, and the scheduling engine includes them in critical path calculations.

### Example

A typical dependency chain might look like:

1. **Work item**: "Install kitchen cabinets" (ends March 10)
2. **Household item**: "Kitchen countertop" (depends on cabinets, target delivery March 10)
3. **Work item**: "Install countertop" (depends on countertop delivery)

This ensures the countertop is not scheduled for delivery until the cabinets are installed, and the installation work does not start until the countertop arrives.
