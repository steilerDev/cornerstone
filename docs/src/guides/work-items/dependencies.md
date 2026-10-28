---
sidebar_position: 4
title: Dependencies
---

# Dependencies

Dependencies link a task to the work it has to wait for. They tell Cornerstone what must happen before or after each task, so the schedule moves with it when something slips.

## Dependency Types

Each link has one of four types. The type says which edge of each task the link connects. The task page spells the type out in plain words:

| Type | Wording on the task page | Meaning |
|------|--------------------------|---------|
| **Finish-to-Start** | Finishes before this starts | The later task cannot start until the earlier one finishes |
| **Start-to-Start** | Starts before this starts | The later task cannot start until the earlier one starts |
| **Finish-to-Finish** | Finishes before this finishes | The later task cannot finish until the earlier one finishes |
| **Start-to-Finish** | Starts before this finishes | The later task cannot finish until the earlier one starts |

**Finish-to-Start** is the most common type. For example, "Framing must finish before drywall can start."

A **lag** adds a number of days between the two tasks. A lag of 2 days means the later task starts two days after the earlier one finishes. A negative lag lets the tasks overlap.

## Adding a Dependency

Dependencies are managed on the **Timing** tab of the task page. Both lists work the same way:

- **Waits for** -- The tasks this one cannot start before. Select **Add** to choose a task this one waits for
- **Waiting for this task** -- The tasks that cannot start before this one. Select **Add** to choose a task that waits for this one

In the dialog:

1. Choose the **Task** on the other end of the link
2. Choose **How they connect**. The options are the four types, worded as shown in the table above
3. Enter the **Lag in days**. Leave it at 0 for no delay. A negative number lets the tasks overlap

Select **Save** to add the link.

You can also set a dependency when you create a task. The **Waits for** field on the new task form links each chosen task with a Finish-to-Start dependency and no lag. You can change the type and lag later on the **Timing** tab. See [Creating Tasks](creating-work-items#waits-for).

## Editing and Removing a Dependency

Select **Edit** on a dependency in the **Waits for** or **Waiting for this task** list to change its type or lag. Select **Remove** to delete it. A removal can be undone with the **Undo** notification that follows.

## Circular Dependency Detection

Cornerstone automatically prevents circular dependencies. If adding a dependency would create a cycle (A depends on B, B depends on C, C depends on A), the system will reject it with an error message.

The detection uses a depth-first search algorithm to ensure no circular chains exist, regardless of how many tasks are involved.

## Viewing Dependencies

Each task page shows its links on the **Timing** tab, in two lists:

- **Waits for** -- Tasks this one waits for
- **Waiting for this task** -- Tasks that wait for this one

The summary strip at the top of the page gives the same information at a glance, with **Waits for** and **Holds up** counts. Select either fact to open the **Timing** tab.

## Dependencies on the Timeline

Dependencies are also visualized on the [schedule chart](/guides/timeline/gantt-chart) as arrows connecting task bars. The arrow direction and attachment points reflect the dependency type. Hover over a bar to highlight all its connected arrows. The [scheduling engine](/guides/timeline/gantt-chart#auto-schedule) uses dependencies to calculate optimal dates automatically.
