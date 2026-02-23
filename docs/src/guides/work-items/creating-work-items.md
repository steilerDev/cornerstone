---
sidebar_position: 1
title: Creating Work Items
---

# Creating Work Items

## Creating a New Work Item

From the work items list, click the **New Work Item** button (or press `n`) to open the creation form.

### Required Fields

- **Title** -- A descriptive name for the task

### Optional Fields

- **Description** -- Detailed information about the task
- **Status** -- Not Started (default), In Progress, Completed, or Blocked
- **Start Date** / **End Date** -- When the task should begin and finish
- **Duration** -- How long the task takes (auto-calculated from dates if both are set)
- **Assigned To** -- Which user is responsible for this task
- **Tags** -- One or more color-coded labels
- **Start After** / **Start Before** -- Scheduling constraints for vendor or weather dependencies

## Editing a Work Item

From the work item detail page, click the **Edit** button (or press `e`) to modify any field. Changes are saved when you submit the form.

## Deleting a Work Item

From the work item detail page, click the **Delete** button (or press `Delete`). You'll be asked to confirm before the item is permanently removed.

:::caution
Deleting a work item also removes all its notes, subtasks, and dependency relationships. This action cannot be undone.
:::

## Statuses

| Status | Description |
|--------|-------------|
| **Not Started** | Task has not begun |
| **In Progress** | Task is actively being worked on |
| **Completed** | Task is finished |
| **Blocked** | Task cannot proceed due to a blocker |

## Scheduling

Work items support flexible scheduling:

- Set a **start date** and **end date** for a fixed schedule
- Set a **duration** to auto-calculate the end date from the start date
- Use **Start After** and **Start Before** constraints to indicate external dependencies (e.g., "start after weather permits" or "start before inspection deadline")
