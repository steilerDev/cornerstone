---
sidebar_position: 2
title: Milestones
---

# Milestones

Milestones represent major checkpoints in your construction project -- moments like "Foundation complete", "Roof installed", or "Final inspection". They help you track whether your project is on schedule at a glance.

## Creating a Milestone

1. Open **Milestones** under **Tasks** in the sidebar
2. Select **New milestone** (or press **n**)
3. Enter a **title** and **target date**
4. Save the milestone

The milestone will appear as a diamond marker on both the [Gantt chart](gantt-chart) and [calendar view](calendar-view) at its target date.

## Editing a Milestone

1. Open the milestone from the [Milestones list](#milestones-list). Its page opens
2. Select **Edit**
3. Update the title or target date
4. Save your changes

You can also click a milestone diamond directly on the Gantt chart or calendar to open that milestone's page.

## Deleting a Milestone

1. Open the milestone's page from the [Milestones list](#milestones-list)
2. Select **Delete Milestone** and confirm the deletion in the dialog

:::caution
Deleting a milestone removes all its task links. This action cannot be undone.
:::

## Linking Tasks

Milestones support two types of task relationships:

### Linked Items

Linked tasks are tasks that must be completed for the milestone to be achieved. The milestone's **projected completion date** is calculated as the latest end date among all its linked tasks. Linked tasks are counted under **Waits for** on the [Milestones list](#milestones-list). Purchases can be linked in the same section.

To link a task:

1. Open the milestone from the [Milestones list](#milestones-list)
2. In the **Linked Items** section, search for and select a task
3. The task is now linked to the milestone

### Dependent Work Items

Dependent tasks are tasks that cannot start until the milestone is reached. This is useful for gating downstream work on a milestone being achieved. Dependent tasks are counted under **Holds up** on the [Milestones list](#milestones-list).

To link a dependent task:

1. Open the milestone from the [Milestones list](#milestones-list)
2. In the **Dependent Work Items** section, search for and select a task
3. The task is now linked as dependent on the milestone

To unlink a task of either type, select the remove button next to it on the milestone's page.

## Late Milestone Detection

A milestone is considered **late** when its projected completion date (based on the end dates of its linked tasks) exceeds its target date. Late milestones are highlighted with a warning color on both the Gantt chart and on the Milestones list.

The Milestones list shows both the **target date** and the **projected date** for each milestone, making it easy to identify schedule slippage.

## Milestone States

Each milestone shows one status word on the [Milestones list](#milestones-list):

| Status | Meaning |
|--------|---------|
| **Upcoming** | The milestone is not reached, and its projected date matches its target date or has not been set |
| **Early · n d** | The projected date is n days before the target date |
| **Late · n d** | The projected date is n days after the target date |
| **Reached** | The milestone is complete |

## Milestones List

Open **Milestones** under **Tasks** in the sidebar to see every milestone in one flat list. The list is not grouped.

The list shows these columns:

- **Milestone**
- **Target** -- the target date
- **Projected** -- the projected date, based on its linked tasks
- **Status** -- one of the status words above
- **Waits for** -- how many tasks the milestone waits for
- **Holds up** -- how many tasks cannot start until the milestone is reached

The list is sorted by **Target date** by default. Use **Sort** to order it by **Title**, **Projected**, **Status** or **Waits for** instead.

Above the list, the chips **Upcoming** and **Reached** show only milestones with that status. Select **Filters** to narrow the list by **Target date** and by **Waits for**.

Select a row to open that milestone's page. Press **n** to open the **New milestone** dialog.

:::info Screenshot needed
The Milestones list replaced the milestone panel. A new screenshot is needed for this section.
:::
