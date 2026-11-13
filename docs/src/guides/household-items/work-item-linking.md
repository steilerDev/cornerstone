---
sidebar_position: 3
title: Task Linking
---

# Task Linking

Purchases can wait for tasks to coordinate installation. For example, you might make "Kitchen faucet" wait for the "Plumbing rough-in" task so you know the faucet needs to arrive before plumbing work begins.

A link is a dependency: the purchase waits for the task. It is added from the purchase, and the task shows it in return. A purchase can also wait for a milestone.

## Linking from a Purchase

On the purchase page, open the **Timing** tab. The **Waits for** card lists every task and milestone the purchase waits for. Select **Add** to find a task or a milestone and add it. Remove a link with the remove control on its row, and use the **Undo** notification if you removed it by mistake.

Tasks are found by search on the server, so type a few letters of the task title to find it. See [Delivery & Dependencies](delivery-and-dependencies#waits-for) for how the link affects the delivery date.

## Seeing Purchases on a Task

Purchases that wait for a task are listed on that task's **Timing** tab, under **Purchases waiting for this task**. The task page does not have a separate linking section, so change the link from the purchase when you need to.

## Use Cases

- **Installation coordination** -- Link a purchase to the task that will install it so you can verify the item has arrived before scheduling the work
- **Area planning** -- Link all purchases destined for a specific area to the task that prepares that area
- **Dependency tracking** -- Combined with [timeline dependencies](delivery-and-dependencies), linking ensures delivery dates align with the construction schedule
