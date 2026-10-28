---
sidebar_position: 3
title: Tasks
---

# Tasks

Tasks are the core of Cornerstone. Each task is a piece of work in your construction project -- from "Install kitchen cabinets" to "Schedule electrical inspection."

## Overview

Tasks support:

- **Statuses** -- Not started, In progress, or Done
- **Dates and scheduling** -- Planned dates, durations, "Not before" and "Start by" constraints, and rescheduling
- **Who** -- A company or a household member does each task
- **Areas** -- Hierarchical location assignment (e.g., "House / Ground Floor / Kitchen") with the full ancestor path shown as a breadcrumb wherever the task appears
- **Notes** -- Timestamped comments with author attribution
- **Checklist** -- Small to-dos within a task
- **Dependencies** -- Tasks that wait for other tasks or milestones, with the type of link and any lag between them
- **Cost** -- Cost lines and grants that pay for the task
- **Site diary** and **History** -- The diary entries about the task and a record of its changes
- **Document links** -- Attach documents from [Paperless-ngx](/guides/documents) (contracts, receipts, plans)

## Area Breadcrumbs

Every task now displays the full **area ancestor path** as a breadcrumb -- for example, `House / Ground Floor / Kitchen` -- so you always know where a task belongs without having to open its detail page. Breadcrumbs appear on:

- The task list (next to each row)
- The task page
- Task pickers (as a secondary line under the title)
- Embedded references from diary entries, invoices, and household items that link to a task

See [Areas & Trades](areas-and-trades) for how areas are organized and nested.

## List View

The **Tasks** page lists every task in your project, grouped by when it falls due. Tasks load as you scroll, so there are no page numbers to click through.

From top to bottom, the page has:

- **Search** -- Type in **Search tasks** (or press `/`) to match task titles. The count next to the list shows how many tasks match.
- **Status chips** -- Show one status at a time. **All** is selected by default.
- **Filters** -- A panel for narrowing the list by area, people, milestone, dates, and cost lines.
- **Group by** and **Sort** -- How the rows are arranged.

All filter, group, and sort settings are synced to the URL, so your view is bookmarkable and shareable.

On desktop the tasks appear in a table. On phones and tablets each task is shown as a card with the same actions.

![Task list page](/img/screenshots/work-items-list-light.png)

### Time Groups

By default the list is grouped by **Time**. Each task goes into exactly one group, and the groups appear in this order:

| Group | Tasks in it |
|-------|-------------|
| **Late** | Not done, and its forecast dates have slipped into the past (see below) |
| **This week** | Every in-progress task, and not-started tasks whose forecast start falls within the next 7 days, today included |
| **Next 2 weeks** | Not-started tasks whose forecast start falls 7 to 20 days from today |
| **Later** | Not-started tasks forecast to start after that, and not-started tasks with no start date |
| **Done** | Completed tasks |

A task is **Late** when it is not done and its forecast dates say it should already be underway or finished. For example, a not-started task such as "Lay bathroom tiles" whose planned start date has passed, or an in-progress task whose planned end date is behind today. Late tasks are listed first, so the ones that need attention are always at the top.

The **Done** group is collapsed while other groups still have tasks. Select the group heading to expand or collapse it.

### Status Chips

Pick one chip to show only the tasks in that status:

- **All** -- every task (the default)
- **Not started**
- **In progress**
- **Done**

### Filters Panel

Select **Filters** to narrow the list. The button shows how many filters are active, and **Clear filters** removes them all. The filters are:

- **Area** -- Picking a parent area also matches every task in its sub-areas. **No area** finds tasks that have not been assigned to any area, which is useful for cleaning up older or imported tasks.
- **Who** -- Filter by **Company** or by **Household member**. **Anyone** applies no filter.
- **Milestone** -- Show only the tasks linked to one milestone. **Any milestone** shows all of them.
- **Start date** and **End date** -- Limit the list to a range, using **From** and **To**.
- **Cost lines** -- Limit the list to tasks with a **Min** and **Max** number of linked cost lines.

### Group By

**Group by** arranges the rows by **Time** (the default), **Area**, **Company**, or **Status**. Time grouping works on the whole project, so it is always available. Area, Company, and Status grouping needs every task on the page, so above 100 tasks those options are turned off and the list shows why.

### Sort

**Sort** orders the rows by **Start date**, **End date**, **Title**, **Status**, **Expected cost**, or **Created**. Choose **Ascending** or **Descending** for the direction.

### Row Actions

Each row shows the task title and status, its planned **Dates**, **Who** does it, its **Expected cost**, and any **Waits for / Holds up** links to other tasks.

The row command depends on the task's status:

- **Start** on a not-started task asks when it started. The planned start date is suggested.
- **Mark done** on an in-progress task asks when it was finished.

On a phone or tablet card, the first entry of the **⋯** menu is the same command, but it applies immediately without the date step. Use the table on desktop when you want to record the actual start or finish date.

After any single-row status change (**Start**, **Mark done**, or **Reopen**), a short notification offers **Undo** if the change was a mistake. The **⋯** menu on each row has:

- **Open** -- Go to the task's detail page
- **Reopen** -- Reopen a done task (done tasks only)
- **Delete** -- Remove the task after a confirmation

### Selecting Several Tasks

Tick the checkboxes at the start of the rows, or tick the header checkbox to select all loaded tasks. A bar appears at the bottom of the screen with two actions:

- **Set status** -- Change every selected task to **Not started**, **In progress**, or **Done**
- **Set area** -- Pick an area in a dialog. The area is applied as soon as you pick it.

## Task Page

Click any task to open its page. The page has a header, a summary strip, and five tabs: **Overview**, **Timing**, **Cost**, **Site diary**, and **History**.

:::info Screenshot needed
The task page does not have a screenshot yet. One will be added with the next stable release.
:::

### Header

- The breadcrumb starts with **Tasks**, which returns you to the list. If you opened the task from another page, such as a company or a milestone, a back link returns you there as well
- The task title is the page heading. To change it, open **Overview** and select **Edit** in the **Details** card. There is no inline title editing
- The main button sets the status. A task that is not started shows **Start**. A task in progress shows **Mark done**. The status menu next to it lets you pick any status
- **Start** and **Mark done** ask for the date. Choose **Today**, **As planned** (the planned date), or **Pick a date**. A short **Undo** notification follows the change in case it was a mistake
- Once the task is done, the main button becomes **Log**. It opens the capture screen with the task's area and company filled in. See [Manual Diary Entries](/guides/diary/manual-entries#logging-for-a-task)
- The **⋯** menu has **Delete**. It asks for confirmation and lists what goes with the task, such as its cost lines and the tasks that no longer wait for it

### Summary Strip

The strip shows the facts that matter most at a glance. Select a fact to open the tab where you change it.

| Fact | What it shows |
|------|---------------|
| **When** | The planned dates, or **No dates yet** |
| **Where** | The area as a breadcrumb, or an empty value (shown as a dash) when no area is set |
| **Who** | The company or household member doing the task. A company with a phone number also gets a **Call** button |
| **Expected cost** | The expected cost, with the name of the grant that covers it. If several grants apply, the strip names the first and says how many more |
| **Waits for** | The first unfinished task this one waits for, followed by a **+n** count (for example, **+2**) when there are others, or **Nothing** |
| **Holds up** | How many tasks wait for this one (for example, **3 tasks**), or **Nothing** |
| **Documents** | The linked Paperless-ngx documents. Opens the list of documents |

### Overview

The **Overview** tab holds the task's description and who does it:

- **Details** -- The description comes first. **Edit** opens the title and description together. Without a description, the card says **No description yet**
- **Who and where** -- The company or household member, and the area. Select **Edit** to change them
- **Checklist** and **Notes** -- These cards appear once they have content. Until then, the **Add** menu offers **Checklist item** and **Note**
- **Checklist** -- Use the **⋯** menu on an item to **Move up**, **Move down**, **Rename**, or **Delete** it
- **Notes** -- Each note can be edited or deleted. Deleting a note asks for confirmation first

### Timing

The **Timing** tab holds everything about when the task happens:

- **Dates** -- The planned start and end, with the duration in days. Once the task is started or finished, the actual **Started** and **Finished** dates are shown too
- **Constraints** -- **Not before** (the earliest start) and **Start by** (the latest start). **Start by** cannot be earlier than **Not before**
- **Reschedule…** -- Opens a preview of the new dates and what they move. Select **Save** to apply them, then **Undo** if you change your mind
- **Waits for** and **Waiting for this task** -- The links to other tasks. Select **Add** to create a link, **Edit** to change its type and lag, or remove it. A removal can be undone. See [Dependencies](dependencies)
- **Milestones** -- Select **Link milestone** to tie the task to a milestone. The relation is either **This task waits for the milestone** or **This task counts toward the milestone**
- **Purchases waiting for this task** -- Purchases that wait for this task to finish

### Cost

The **Cost** tab shows the money side of the task:

- **Cost lines** -- The estimates come first, then one group for each offer or invoice the lines are linked to. **Add cost line** adds a line, **New invoice** creates an invoice, and **Link to offer or invoice** connects an estimate to an existing document. See [Task Costs](/guides/budget/work-item-budgets)
- **Grants** -- The grants that cover this task. **Add** links a grant. **Remove** unlinks one, and an **Undo** notification follows

### Site Diary

The **Site diary** tab lists the diary entries for the task. Entries for the task's company come first. Entries that match the task only through photo tags and dates are folded under **Other entries**. Select **Log for this task** to write a new entry, which starts with the task's area and company filled in. **Show all in the Site diary** opens the full diary, filtered to match.

### History

The **History** tab shows when the task was created, who created it, and when it was last updated, followed by its change history. **Show all in History** opens the full history.

### Keyboard Shortcuts on the Task Page

Press `e` to edit the task details, `Delete` to delete the task, and `?` to see all shortcuts. See [Keyboard Shortcuts](keyboard-shortcuts#task-detail).

## Next Steps

- [Creating Tasks](creating-work-items) -- How to create and edit tasks
- [Areas & Trades](areas-and-trades) -- Organize by location and specialty
- [Notes & Checklists](notes-and-subtasks) -- Add comments and checklist items
- [Dependencies](dependencies) -- Link tasks together
- [Keyboard Shortcuts](keyboard-shortcuts) -- Navigate faster with keyboard shortcuts
