---
sidebar_position: 1
title: Creating Tasks
---

# Creating Tasks

## Creating a New Task

From the Tasks page, click the **New task** button (or press `n`) to open the creation form.

### Essential Fields

- **Title** (required) -- A descriptive name for the task
- **Area** -- A location within your project (e.g., "Kitchen", "Ground Floor")
- **Who** -- The company or household member doing this task. Pick one. Type to search: companies are listed first, then household members. Picking another one replaces the first, so a task never has both. See [Who](/guides/home/what-moved-where#who)
- **Planned cost** -- An optional first estimate for the task. See [Planned cost](#planned-cost)
- **Duration (days)** -- How long the task takes. Zero is accepted

### More Details

Select **More details** to show the rest of the form:

- **Description** -- Detailed information about the task
- **Status** -- Not started (default), In progress, or Done
- **Not before** and **Start by** -- Scheduling constraints for company or weather dependencies. See [Scheduling](#scheduling)
- **Waits for** -- The tasks this one cannot start before. See [Waits for](#waits-for)

Dates are not part of the creation form. Set the start and end dates on the **Timing** tab of the task page after the task exists.

Select **Save** to create the task. You are taken to its page.

## Planned Cost

**Planned cost** is the amount you expect the task to cost. When you save the task, it creates the first cost line of the task as an estimate:

- **Empty** -- No cost line is created. You can add one later on the task page.
- **0** -- Creates a zero estimate, for work that is free or already included.
- **An amount** -- Creates a cost line for that amount. Under **Entered as**, choose **Net** (the default, the amount without VAT) or **Gross** (the amount including VAT). Once you type an amount, a line shows the VAT split.

The cost line takes the task's title as its description. It has no category and no funding source. Set those, and add more cost lines, on the **Cost** tab of the task page.

If the task is created but its cost line cannot be saved, the task still exists. You are taken to its page, which opens on the **Cost** tab, and a message above the tabs says the planned cost could not be saved. Add the cost on the **Cost** tab. Close the message when you're done. If a **Waits for** link also failed, the page opens on **Timing** instead and both messages show above the tabs.

## Waits for

**Waits for** links the new task to the tasks it depends on. Type to search, and pick one or more tasks. Each chosen task becomes a Finish-to-Start dependency with no lag, so this task starts after the chosen task finishes.

You can change the type and lag of these links, or add links from the other side, on the **Timing** tab of the task page. See [Dependencies](dependencies).

## Editing a Task

On the task page, open the **Overview** tab and select **Edit** in a card. The card shows the same fields and labels as the creation form:

- **Details** -- **Title** and **Description**, edited together
- **Who and where** -- **Who** and **Area**

Duration, the actual **Started** and **Finished** dates, **Not before** and **Start by** are changed on the **Timing** tab. Planned cost is set only when the task is created. Cost lines are changed on the **Cost** tab.

Each card saves on its own, so select **Save** in the card you changed.

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
