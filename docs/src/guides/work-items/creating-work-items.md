---
sidebar_position: 1
title: Creating Tasks
---

# Creating Tasks

## Creating a New Task

From the Tasks page, click the **New task** button (or press `n`) to open the creation form.

### Required Fields

- **Title** -- A descriptive name for the task

### Optional Fields

- **Description** -- Detailed information about the task
- **Status** -- Not started (default), In progress, or Done
- **Start Date** / **End Date** -- When the task should begin and finish
- **Duration** -- How long the task takes (auto-calculated from dates if both are set)
- **Assigned To** -- The company or household member doing this task. Pick one. Type to search: companies are listed first, then household members. Picking another one replaces the first, so a task never has both. See [Assigned To](/guides/home/what-moved-where#assigned-to)
- **Area** -- A location within your project (e.g., "Kitchen", "Ground Floor")
- **Start After** / **Start Before** -- Scheduling constraints for company or weather dependencies

## Editing a Task

From the task detail page, click the **Edit** button (or press `e`) to modify any field. Changes are saved when you submit the form.

## Deleting a Task

From the task detail page, click the **Delete** button (or press `Delete`). You'll be asked to confirm before the task is permanently removed.

:::caution
Deleting a task also removes all its notes, subtasks, and dependency relationships. This action cannot be undone.
:::

## Statuses

| Status | Description |
|--------|-------------|
| **Not started** | Task has not begun |
| **In progress** | Task is actively being worked on |
| **Done** | Task is finished |

## Scheduling

Tasks support flexible scheduling:

- Set a **start date** and **end date** for a fixed schedule
- Set a **duration** to auto-calculate the end date from the start date
- Use **Start After** and **Start Before** constraints to indicate external dependencies (e.g., "start after weather permits" or "start before inspection deadline")
