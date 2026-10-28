---
sidebar_position: 3
title: Calendar View
---

# Calendar View

The calendar shows your project schedule as a familiar calendar grid. It shows tasks as colored bars spanning their date range, milestones as diamond markers on their target dates, and purchases on their delivery dates.

## Accessing the Calendar

Select **Calendar** under **Tasks** in the sidebar. The calendar has its own page, separate from the [Schedule chart](gantt-chart).

The Calendar uses the **Show** menu from the Schedule. You can turn on or off **Tasks**, **Milestones**, and **Purchases**. At least one of the three stays on. The Calendar always keeps finished tasks visible, so the **Done** option applies only to the Schedule chart.

## Monthly View

The monthly view displays a calendar grid with seven columns (Monday through Sunday) and rows for each week of the month.

- **Tasks** appear as colored horizontal bars that span across the days of their duration
- **Multi-week tasks** wrap across rows, appearing in each week they span
- **Milestones** appear as diamond markers on their target date
- **Purchases** appear on their delivery dates
- **Today** is highlighted with a distinct background color

### Navigation

- Use the **previous** and **next** arrow buttons to move to the previous or next month
- Select **Today** to jump back to the current month
- The current month and year are displayed in the toolbar header

## Weekly View

The weekly view shows a single week with taller rows, giving more vertical space for tasks that overlap on the same days.

- Same visual treatment as the monthly view: colored bars for tasks, diamonds for milestones
- Use the **previous** and **next** arrow buttons to move to the previous or next week
- Select **Today** to jump back to the current week

Switch between the monthly and weekly views with the **Month** and **Week** buttons in the calendar toolbar.

## Task Interactions

### Tooltips

Hover over a task bar to see a tooltip with:

- Title and status
- Start and end dates
- Duration (planned and actual)
- Assigned user
- Dependency information
- **Holds up n tasks**: how many unfinished tasks move if this one slips, counting the full chain of waiting tasks and milestone gates. This is the same count the Schedule shows for the task

### Cross-Cell Highlighting

When you hover over a multi-day task that spans multiple calendar cells, all cells belonging to that task are highlighted simultaneously, making it easy to see the full extent of the task.

### Navigation to Detail

Select a task bar to open its detail page.

## Milestone Interactions

Select a milestone diamond on the calendar to open that [milestone's page](milestones#editing-a-milestone), where you can edit it.

Hover over a milestone diamond to see a tooltip showing:

- Title and target date
- Projected completion date
- Contributing and dependent tasks
- **Holds up n tasks**: the unfinished tasks that wait on this milestone, counted the same way as for tasks
- Completion status

## Adding Items

The Calendar has no **Add** menu. Use the global **New** button to add a task, milestone, or purchase.

![Calendar monthly view](/img/screenshots/timeline-calendar-light.png)
