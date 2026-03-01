---
sidebar_position: 2
title: Milestones
---

# Milestones

Milestones represent major checkpoints in your construction project -- moments like "Foundation complete", "Roof installed", or "Final inspection". They help you track whether your project is on schedule at a glance.

## Creating a Milestone

1. Open the **Timeline** page
2. Click the **Milestones** button in the toolbar (diamond icon)
3. In the milestone panel, click **+ New Milestone**
4. Enter a **title** and **target date**
5. Click **Save**

The milestone will appear as a diamond marker on both the [Gantt chart](gantt-chart) and [calendar view](calendar-view) at its target date.

## Editing a Milestone

From the milestone panel (click the Milestones button in the toolbar):

1. Find the milestone in the list
2. Click the **edit** icon (pencil) next to it
3. Update the title or target date
4. Click **Save**

You can also click a milestone diamond directly on the Gantt chart or calendar to open the panel with that milestone selected for editing.

## Deleting a Milestone

1. Open the milestone panel
2. Click the **delete** icon (trash) next to the milestone, or open the edit view and click **Delete Milestone** at the bottom
3. Confirm the deletion in the dialog

:::caution
Deleting a milestone removes all its work item links. This action cannot be undone.
:::

## Linking Work Items

Milestones support two types of work item relationships:

### Contributing Work Items

Contributing work items are tasks that must be completed for the milestone to be achieved. The milestone's **projected completion date** is calculated as the latest end date among all its contributing work items.

To link a contributing work item:

1. Open the milestone panel and select a milestone for editing
2. In the **Contributing Work Items** section, search for and select a work item
3. The work item is now linked to the milestone

### Dependent Work Items

Dependent work items are tasks that cannot start until the milestone is reached. This is useful for gating downstream work on a milestone being achieved.

To link a dependent work item:

1. Open the milestone panel and select a milestone for editing
2. In the **Dependent Work Items** section, search for and select a work item
3. The work item is now linked as dependent on the milestone

To unlink a work item of either type, click the remove button next to it in the milestone edit view.

## Late Milestone Detection

A milestone is considered **late** when its projected completion date (based on the end dates of contributing work items) exceeds its target date. Late milestones are highlighted with a warning color on both the Gantt chart and in the milestone panel.

The milestone panel shows both the **target date** and the **projected date** for each milestone, making it easy to identify schedule slippage.

## Milestone States

| State | Visual | Meaning |
|-------|--------|---------|
| Incomplete (on track) | Blue diamond outline | Projected date is on or before target date |
| Late | Red/warning diamond | Projected date exceeds target date |
| Completed | Green filled diamond | All contributing work items are completed |

## Milestone Panel

The milestone panel is a slide-over dialog accessible from the toolbar. It provides:

- **List view** -- All milestones sorted by target date, with status indicators, target dates, projected dates, and work item counts
- **Create view** -- Form to create a new milestone
- **Edit view** -- Form to update the milestone, plus work item linking sections

Use **Escape** to close the panel or navigate back from a sub-view.

:::info Screenshot needed
A screenshot of the milestone panel will be added on the next stable release.
:::
