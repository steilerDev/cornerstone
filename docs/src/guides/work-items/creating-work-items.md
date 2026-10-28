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
- **Who** -- The company or household member doing this task. Pick one. Type to search: companies are listed first, then household members. Picking another one replaces the first, so a task never has both. See [Who](/guides/home/what-moved-where#who)
- **Area** -- A location within your project (e.g., "Kitchen", "Ground Floor")
- **Duration (days)** -- How long the task takes
- **Not before** and **Start by** -- Scheduling constraints for company or weather dependencies. See [Scheduling](#scheduling)
- **Tags** -- Labels to group related tasks
- **Waits for** -- The tasks this one cannot start before. See [Waits for](#waits-for)

Dates are not part of the creation form. Set the start and end dates on the **Timing** tab of the task page after the task exists.

## Waits for

**Waits for** links the new task to the tasks it depends on. Type to search, and pick one or more tasks. Each chosen task becomes a Finish-to-Start dependency with no lag, so this task starts after the chosen task finishes.

You can change the type and lag of these links, or add links from the other side, on the **Timing** tab of the task page. See [Dependencies](dependencies).

## Editing a Task

On the task page, open the **Overview** tab and select **Edit** in the **Details** card to change the title and description. Select **Edit** in the **Who and where** card to change who does the task or where it is. Dates and constraints are changed on the **Timing** tab.

Changes are saved when you submit the form.

## Deleting a Task

On the task page, open the **⋯** menu and choose **Delete**, or press `Delete`. You'll be asked to confirm before the task is permanently removed. The confirmation lists what goes with it.

:::caution
Deleting a task also removes its checklist and notes, and the cost lines on it. Tasks that were waiting for it no longer wait for it. This action cannot be undone.
:::

## Statuses

| Status | Description |
|--------|-------------|
| **Not started** | Task has not begun |
| **In progress** | Task is actively being worked on |
| **Done** | Task is finished |

Status is changed on the task page with the main button (**Start** or **Mark done**), or from the status menu next to it. See [Header](/guides/work-items#header).

## Scheduling

Tasks support flexible scheduling. These are set on the **Timing** tab:

- Set the **Start** and **End** dates on the **Dates** card for a fixed schedule
- Set the **Duration** in days
- Use the **Constraints** card to set **Not before** and **Start by**. These indicate external dependencies, such as "start after weather permits" or "start before inspection deadline". **Start by** cannot be earlier than **Not before**
- Use **Reschedule…** to preview new dates before you save them
