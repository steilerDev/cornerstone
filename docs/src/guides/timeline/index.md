---
sidebar_position: 4
title: Schedule
---

# Schedule

The Schedule page gives you a visual overview of your construction project. It shows your tasks, milestones, and purchases on one time chart, so you can see what needs to happen, when, and in what order.

## Overview

The schedule provides:

- **Schedule chart** -- An interactive chart showing tasks as horizontal bars on a time axis, with milestones as diamonds, purchase deliveries as markers, dependency arrows, and critical path highlighting. See [Schedule Chart](gantt-chart)
- **Calendar** -- A monthly or weekly grid showing tasks as multi-day bars, milestones as diamond markers, and purchases on their delivery dates. See [Calendar View](calendar-view)
- **Milestones** -- Named checkpoints with target dates that track major project progress points
- **Scheduling Engine** -- Automatic date calculations based on dependencies, duration, and constraints
- **Auto-Reschedule** -- Server-side automatic rescheduling of not-started tasks when a new day begins

Open **Schedule**, **Calendar**, and **Milestones** from the **Tasks** group in the sidebar.

## How It Fits Together

Tasks that have **start and end dates** appear on both the schedule chart and the calendar. [Dependencies](/guides/work-items/dependencies) between tasks determine the order of work and are visualized as arrows on the chart.

**Milestones** mark important checkpoints in your project. You can link tasks to milestones so that the milestone's projected completion date reflects the latest end date of its linked tasks.

The **scheduling engine** uses the Critical Path Method (CPM) to calculate optimal dates for your tasks, respecting all dependency relationships and constraints. When you trigger auto-schedule, it adjusts dates for not-started tasks to ensure dependencies are satisfied.

![Schedule chart view](/img/screenshots/timeline-gantt-light.png)

## Next Steps

- [Schedule Chart](gantt-chart) -- Learn about the chart, its toolbar, and rescheduling
- [Milestones](milestones) -- Create and manage project milestones
- [Calendar View](calendar-view) -- Navigate your schedule with monthly and weekly calendars
