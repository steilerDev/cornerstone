---
sidebar_position: 1
title: Schedule Chart
---

# Schedule Chart

The schedule chart is the main view of the Schedule page. It shows your tasks, milestones, and purchases on a time axis, with dependency arrows that show what waits for what.

## Opening the Schedule

Select **Schedule** under **Tasks** in the sidebar. The chart opens scrolled to today, with the first current row near the top.

Cornerstone remembers your zoom, **Show**, **Group**, and area settings for your user account, so the chart opens the way you left it. If you open a shared link, the settings in that link are used instead.

Scroll position and zoom never reset. When you open a task from the chart and then go **Back**, you return to the same position.

## Chart Layout

The chart has three main areas:

- **Row labels** -- A fixed panel on the left with one row per task, milestone, or purchase. Each row shows its title, with the area and company underneath, such as "Kitchen plumbing · Example Plumbing Co."
- **Time grid** -- The main area with vertical grid lines for time periods and horizontal bars for each row
- **Header** -- A date header at the top showing the time scale (days, weeks, or months)

Each task is displayed as a colored bar whose horizontal position and width represent its start date, end date, and duration. The bar color reflects the task's status:

| Status | Color |
|--------|-------|
| Not Started | Blue |
| In Progress | Blue (primary) |
| Completed | Green |
| Blocked | Red/Warning |

### Today Marker

A vertical line marks today's date on the chart, making it easy to see which tasks are in the past, present, or future.

## Toolbar

The toolbar above the chart has these controls. Labels match what you see on screen.

| Control | What It Does |
|---------|--------------|
| **Day**, **Week**, **Month** | Sets the zoom level (see [Zoom Levels](#zoom-levels)) |
| **Show** | Chooses which kinds of items and markers the chart draws (see [Show Options](#show-options)) |
| **Group** | Groups the rows by **Time** or by **Area** (see [Grouping and Areas](#grouping-and-areas)) |
| Area chip | Limits the chart to one area and its sub-areas. **All areas** clears it |
| **Today** | Scrolls the chart back to today |
| More schedule actions (⋯) | Contains **Subscribe in calendar app** |
| **Legend** | Opens a panel that explains the marks on the chart |

The chart has no **Add** menu. To add a task, milestone, or purchase, use the global **New** button. It pre-fills the week you are looking at and the area you have selected.

## Zoom Levels

The toolbar provides three zoom levels that control the time scale:

| Zoom | Grid Lines | Best For |
|------|-----------|----------|
| **Day** | One column per day, major lines on Mondays | Short-term detail (next few weeks) |
| **Week** | One column per week, major lines on month boundaries | Medium-term planning (1-3 months) |
| **Month** | One column per month | Long-term overview (full project) |

Switch zoom levels using the **Day**, **Week**, and **Month** buttons in the toolbar. The default zoom level is Month.

### Column Width

To change how wide each time column is within your zoom level, use one of these:

- **Ctrl + scroll wheel** while hovering over the chart
- **Ctrl + =** (zoom in) and **Ctrl + -** (zoom out) keyboard shortcuts

The chart has no column width buttons.

## Show Options

Select **Show** to choose what the chart draws. The button reads **Show · 2 changed**, for example, when you have changed the defaults.

- **Tasks**, **Milestones**, and **Purchases** -- Turn each kind on or off. At least one of these three stays on
- **Dependency arrows** -- Draws the arrows between linked items (on by default)
- **Critical path** -- Highlights the critical path (on by default)
- **Done** -- Shows completed tasks (off by default, so finished work is hidden). The Legend shows how many done items are hidden

## Grouping and Areas

**Group** sets how the rows are arranged:

- **Time** -- Rows in date order
- **Area** -- Rows grouped under their area. Rows with no area are listed last, under **No area**

The area chip limits the chart to one area. Picking an area also includes its sub-areas, so a parent area shows everything beneath it. Choose **All areas** to clear the limit.

If your filters hide everything, the chart says **Nothing to show** and suggests turning on more under **Show** or choosing **All areas**.

## Dependency Arrows

When tasks have [dependencies](/guides/work-items/dependencies), the chart draws arrows between them to show the relationship. All four dependency types are visualized:

- **Finish-to-Start (FS)** -- Arrow from the end of the predecessor to the start of the successor
- **Start-to-Start (SS)** -- Arrow from the start of the predecessor to the start of the successor
- **Finish-to-Finish (FF)** -- Arrow from the end of the predecessor to the end of the successor
- **Start-to-Finish (SF)** -- Arrow from the start of the predecessor to the end of the successor

To hide the arrows, turn off **Show** > **Dependency arrows**.

## Critical Path

The critical path is the longest chain of dependent tasks that determines the minimum project duration. Any delay on a critical path task delays the entire project.

- Critical path bars have a thick orange border
- Turn highlighting on or off with **Show** > **Critical path**
- Both the task bars and their dependency arrows are highlighted when the critical path is shown

## Late and Held-Up Tasks

A task is drawn with a hatched bar, a red outline, and a chip when it is late itself (the chip reads **Late · n d**, with the number of days) or when it is held up by a late task before it (the chip reads **Held up**). The **Legend** explains these marks.

A dashed outline shows the **planned** dates of a task. Compare it with the bar to see how far the task has moved from its plan.

## Milestones and Purchases

[Milestones](milestones) appear as diamonds at their target date. Purchases with a delivery date appear as delivery markers. Select a diamond or a delivery marker to open its side panel.

## Side Panel

Select a task bar, a milestone diamond, a delivery marker, or a row to open the side panel. The panel is docked beside the chart on wide screens, slides over the chart on smaller screens, and appears as a bottom sheet on phones.

The panel has these sections:

- **When** -- The dates and duration. If a task has been moved, the panel shows its planned dates next to the current ones
- **Who** -- The person or company, with a **Call** button when a phone number is on file
- **Status** -- The current status. Select **Undo** to reverse a status change you just made
- **Waits for** -- The items that must happen first, shown with a left arrow (←)
- **Holds up** -- The items that wait for this one, shown with a right arrow (→)
- **Open task**, **Open milestone**, or **Open purchase** -- Opens the full page
- **Reschedule…** -- Opens the reschedule view for a task, inside the side panel (see [Rescheduling a Task](#rescheduling-a-task))

## Rescheduling a Task

You can move a task's end date or change its duration without leaving the chart:

1. Select the task on the chart, then select **Reschedule…** in the side panel. The side panel switches to the reschedule view. Select **Back** to return to the task's details without saving
2. Change the **End date** or the **Duration** in days. The view shows the **Start** for reference
3. Read the preview before you save. It lists the tasks and milestones that move, and how far, such as "Ends March 12 instead of March 10, 2 days later". It also shows how many unfinished items the task holds up, whether the project completion date changes ("Completion moves from March 30 to April 2."), and dashed outlines on the chart where the affected bars will go
4. Select **Save** once the preview is ready

After you save, a notice confirms the change, with an **Undo** button to reverse it.

If the end date is before the start, or the duration is less than 1 day, the view shows an error and does not save.

## Tooltips

With a mouse, hover over a task bar, milestone diamond, or delivery marker to see a quick tooltip. The side panel has the full details.

**Task tooltips show:**
- Title and status
- Start and end dates
- Planned and actual duration
- Owner, area, and company
- **Waits for** and **Holds up** relationships
- **Holds up n tasks**: how many unfinished tasks move if this one slips, counting the full chain of waiting tasks and milestone gates. This is the same count Home shows for the task

**Milestone tooltips show:**
- Title and target date
- Projected completion date
- Contributing and dependent tasks
- **Holds up n tasks**: the unfinished tasks that wait on this milestone, counted the same way as for tasks
- Completion status

## Phones

On phones, the Schedule opens on **Agenda**. The agenda is a list of the weeks, with a mini bar for each item.

To switch to the chart, select **Chart** in the **Agenda / Chart** toggle above the page. The chart keeps the item names in a sticky column on the left while you scroll sideways.

Tap an item to open its side panel as a bottom sheet.

## Scrolling and Navigation

- **Horizontal scroll** to move through time (the names stay fixed)
- **Vertical scroll** to see more rows when the list is longer than the screen
- The chart opens at today. Select **Today** in the toolbar to return there at any time

## Keyboard Navigation

The chart supports keyboard navigation for accessibility:

- **Arrow keys** -- Navigate between bars
- **Enter / Space** -- Activate the focused bar
- **Escape** -- Dismiss tooltips
- **Ctrl + = / Ctrl + -** -- Zoom the column width in and out

## Auto-Schedule

The scheduling engine automatically adjusts dates for tasks that have not started yet. This happens:

- When you add or modify dependencies between tasks
- When the server detects a new calendar day has begun (auto-reschedule)

The engine uses the **Critical Path Method (CPM)** and respects:

- All four dependency types (FS, SS, FF, SF)
- Lead and lag days on dependencies
- Start-after and start-before constraints on tasks
- Actual start and end dates for in-progress or completed tasks (these are never moved)

:::caution
Only tasks with status **Not Started** are rescheduled automatically. In-progress and completed tasks keep their actual dates.
:::

![Schedule chart with dependency arrows and critical path](/img/screenshots/timeline-gantt-dependencies-light.png)
