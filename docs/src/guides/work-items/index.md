---
sidebar_position: 3
title: Work Items
---

# Work Items

Work items are the core of Cornerstone. Each work item represents a task in your construction project -- from "Install kitchen cabinets" to "Schedule electrical inspection."

## Overview

Work items support:

- **Statuses** -- Not started, In progress, or Done
- **Dates and scheduling** -- Start dates, end dates, durations, and scheduling constraints
- **User assignment** -- Assign tasks to any user on your instance
- **Areas** -- Hierarchical location assignment (e.g., "House / Ground Floor / Kitchen") with the full ancestor path shown as a breadcrumb wherever the work item appears
- **Notes** -- Timestamped comments with author attribution
- **Subtasks** -- Checklist items within a work item
- **Dependencies** -- Relationships between work items (what must happen before or after)
- **Document links** -- Attach documents from [Paperless-ngx](/guides/documents) (contracts, receipts, plans)

## Area Breadcrumbs

Every work item now displays the full **area ancestor path** as a breadcrumb -- for example, `House / Ground Floor / Kitchen` -- so you always know where a task belongs without having to open its detail page. Breadcrumbs appear on:

- The work item list (next to each row)
- The work item detail page
- Work item pickers (as a secondary line under the title)
- Embedded references from diary entries, invoices, and household items that link to a work item

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

![Work items list page](/img/screenshots/work-items-list-light.png)

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

## Detail View

Click any work item to see its full detail page with all fields, notes, subtasks, dependencies, and linked documents. Linked documents open from the **Documents (n)** button.

![Work item detail page](/img/screenshots/work-item-detail-light.png)

## Next Steps

- [Creating Tasks](creating-work-items) -- How to create and edit tasks
- [Areas & Trades](areas-and-trades) -- Organize by location and specialty
- [Notes & Subtasks](notes-and-subtasks) -- Add comments and checklists
- [Dependencies](dependencies) -- Link work items together
- [Keyboard Shortcuts](keyboard-shortcuts) -- Navigate faster with keyboard shortcuts
