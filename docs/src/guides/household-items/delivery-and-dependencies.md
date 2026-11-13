---
sidebar_position: 4
title: Delivery & Dependencies
---

# Delivery & Dependencies

Purchases have a delivery-focused scheduling model. Unlike tasks, which have start and end dates with durations, a purchase is treated as a zero-duration end point. It represents a single delivery event that waits for other work to be completed first.

## Delivery Dates

Each purchase can track several dates. They appear on the **Timing** tab, in the **Delivery** card:

| Field | Description |
|-------|-------------|
| **Ordered on** | When the purchase was or will be ordered |
| **Earliest delivery** | Start of the expected delivery window |
| **Latest delivery** | End of the expected delivery window |
| **Target delivery** | Calculated from the tasks and milestones the purchase waits for. It is the earliest date the purchase could arrive, based on when those are finished. You cannot edit it |
| **Delivered on** | When the purchase actually arrived |

The **target delivery** date is calculated by the scheduling engine from the purchase's **Waits for** links. If a purchase waits for a task that finishes on March 15, the target delivery date will be March 15 or later.

The summary strip at the top of the purchase page shows the delivery date in one line: the delivered date once the purchase has arrived, otherwise the target date, otherwise the delivery window.

## Late Detection

A purchase is **late** when its delivery date has passed and nothing has arrived. The purchase page shows a **Late · n d** badge, where *n* counts the days since the planned delivery date. The same badge appears in the summary strip, and the Schedule panel uses it for purchases too.

The **Delivery** card on the **Timing** tab explains which date was missed:

- When the latest delivery date has passed, the card says that the latest delivery date has passed and nothing has arrived
- When only a target date is set and it has passed, the card names the target delivery date instead
- When neither applies, the card says that the delivery is now expected after its planned window

A purchase that has arrived is never shown as late.

## Waits For

A purchase can wait for **tasks** and **milestones**. All waits are finish-to-start with zero lag: the delivery cannot happen until the task or milestone is complete.

### Adding a Wait

On the purchase page, open the **Timing** tab and select **Add** in the **Waits for** card. Choose a task or a milestone from the search. Search finds tasks on the server, so type a few letters of the name. The target delivery date recalculates automatically.

### Removing a Wait

Select the remove control on a row in the **Waits for** card. A short **Undo** notification follows, so you can restore the link if you removed it by mistake.

### Viewing on the Schedule Chart

Purchases with waits appear on the [schedule chart](/guides/timeline/gantt-chart) as delivery markers, similar to milestones. Dependency arrows connect the tasks and milestones to the purchase, and the scheduling engine includes them in critical path calculations.

### Example

A typical chain might look like:

1. **Task**: "Install kitchen cabinets" (ends March 10)
2. **Purchase**: "Kitchen countertop" (waits for the cabinets task, target delivery March 10)

This ensures the countertop is not scheduled for delivery until the cabinets are installed.
