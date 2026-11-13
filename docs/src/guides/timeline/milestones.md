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

The milestone will appear as a diamond marker on both the [schedule chart](gantt-chart) and [calendar](calendar-view) at its target date.

## Milestone Page

Open a milestone from the [Milestones list](#milestones-list), or select **Open milestone** in the schedule's side panel. On the calendar, selecting a milestone diamond opens the page directly.

The page has a header, a summary strip, and three tabs: **Overview**, **Work**, and **History**.

### Header

- The breadcrumb starts with **Milestones**, which returns you to the list. If you opened the milestone from another page, a back link returns you there as well
- The milestone title is the page heading. To rename the milestone, open **Overview** and select **Edit** in the **Details** card
- The status chip shows the milestone's status: **Upcoming**, **Late · n d**, **Early · n d**, or **Reached**
- The main button sets the status. A milestone that is not reached shows **Mark reached**, which asks for the date. Choose **Today**, **Pick a date**, or **On target** (the target date). **On target** appears only once the target date has passed, and a milestone cannot be reached on a future date. A short **Undo** notification follows the change in case it was a mistake
- Once a milestone is reached, the main button becomes **Reopen**. Reopening clears the reached date. The **Undo** notification that follows restores the reached state and its date
- **Change target** sits next to the main button until the milestone is reached. It opens the **Details** card on the **Overview** tab with the target date ready to edit
- The **⋯** menu has **Delete**. It asks for confirmation and lists what goes with the milestone

### Summary Strip

The strip shows the facts that matter most at a glance. Select a fact to open the tab where you change it.

| Fact | What it shows |
|------|---------------|
| **Target** | The target date |
| **Projected** | The latest end date of the tasks that count toward the milestone. It reads **No tasks yet** when no task counts toward it, and **No dates yet** when those tasks have no dates. Once the milestone is reached, this fact becomes **Reached** and shows the date it was reached |
| **Against target** | **Late · n d**, **Early · n d**, **On target** (upcoming with a projected date), **Upcoming** (no projected date), or **Reached**, always as text |
| **Counts toward** | The number of tasks that count toward the milestone, followed by how many of them are still open. Reads **None yet** when there are none |

### Overview

The **Overview** tab holds the **Details** card. It shows the description first, followed by the **Target date**, the **Reached on** date once the milestone is reached, and the **Color**. Empty rows show **Nothing added yet** or **No color**.

Select **Edit** to change the title, the target date, the description, and the color. The title and the target date are required.

### Work

The **Work** tab has two lists:

- **Counts toward this milestone** -- tasks only. The projected date is taken from these tasks. Select **Add task** to choose a task. Use the row's **⋯** menu and **Remove** to take a task out of the list
- **Waiting for this milestone** -- tasks and purchases that cannot go ahead until the milestone is reached. Each row shows its kind, **Task** or **Purchase**, its status, and its date. Select **Add task or purchase** to choose one. For example, a dishwasher purchase can wait for the "Electrical inspection" milestone

A purchase can only wait for a milestone. It never counts toward one, so purchases appear only in **Waiting for this milestone**.

A task cannot be in both lists. The picker hides tasks that are already in the other list. If the other list changed in another window, the page shows an inline message instead: **This task counts toward this milestone, so it cannot wait for it.** or **This task waits for this milestone, so it cannot count toward it.**

**Remove** takes a row out of its list without asking for confirmation. A short notification with **Undo** follows, so you can put the row back.

### History

The **History** tab shows when the milestone was created, who created it, and when it was last updated. Below that, it lists the events that happened to the milestone. Repeated delay events are combined into one entry, and delay events after the milestone was reached are not shown.

### Keyboard Shortcuts on the Milestone Page

Press `e` to edit the milestone details, `Delete` to delete the milestone, and `?` to see all shortcuts.

## Deleting a Milestone

1. Open the milestone's page from the [Milestones list](#milestones-list)
2. Open the **⋯** menu and select **Delete**, then confirm the deletion in the dialog

:::caution
Deleting a milestone removes its links to tasks and purchases. This action cannot be undone.
:::

## Late Milestone Detection

A milestone is considered **late** when its projected completion date (based on the end dates of the tasks that count toward it) exceeds its target date. Late milestones are highlighted with a warning color on both the schedule chart and on the Milestones list.

The Milestones list shows both the **target date** and the **projected date** for each milestone, making it easy to identify schedule slippage.

## Milestone States

Each milestone shows one status word on the [Milestones list](#milestones-list):

| Status | Meaning |
|--------|---------|
| **Upcoming** | The milestone is not reached, and its projected date matches its target date or has not been set |
| **Early · n d** | The projected date is n days before the target date |
| **Late · n d** | The projected date is n days after the target date |
| **Reached** | The milestone is complete |

On the milestone's page, the **Against target** fact reads **On target** when the milestone is upcoming and has a projected date. A milestone without a projected date (no tasks with dates) reads **Upcoming**, as it does on the list.

## Milestones List

Open **Milestones** under **Tasks** in the sidebar to see every milestone in one flat list. The list is not grouped.

The list shows these columns:

- **Milestone**
- **Target** -- the target date
- **Projected** -- the projected date, based on the tasks that count toward it
- **Status** -- one of the status words above
- **Waits for** -- how many tasks the milestone waits for
- **Holds up** -- how many tasks cannot start until the milestone is reached

The list is sorted by **Target date** by default. Use **Sort** to order it by **Title**, **Projected**, **Status** or **Waits for** instead.

Above the list, the chips **Upcoming** and **Reached** show only milestones with that status. Select **Filters** to narrow the list by **Target date** and by **Waits for**.

Select a row to open that milestone's page. Press **n** to open the **New milestone** dialog.

:::info Screenshot needed
The Milestones list replaced the milestone panel. A new screenshot is needed for this section.
:::

:::info Screenshot needed
The milestone page does not have a screenshot yet. One will be added with the next stable release.
:::
