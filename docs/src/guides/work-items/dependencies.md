---
sidebar_position: 4
title: Dependencies
---

# Dependencies

Dependencies let you define relationships between work items to track what must happen before or after each task.

## Dependency Types

Cornerstone supports four dependency types:

| Type | Meaning |
|------|---------|
| **Finish-to-Start** (FS) | Task B cannot start until Task A finishes |
| **Start-to-Start** (SS) | Task B cannot start until Task A starts |
| **Finish-to-Finish** (FF) | Task B cannot finish until Task A finishes |
| **Start-to-Finish** (SF) | Task B cannot finish until Task A starts |

**Finish-to-Start** is the most common type -- for example, "Framing must finish before drywall can start."

## Adding Dependencies

On the work item detail page, use the dependency section to link work items. The sentence builder interface lets you construct natural-language dependency statements:

> "[This work item] **cannot start** until [Other work item] **finishes**"

Select the related work item and the dependency type to create the link.

## Circular Dependency Detection

Cornerstone automatically prevents circular dependencies. If adding a dependency would create a cycle (A depends on B, B depends on C, C depends on A), the system will reject it with an error message.

The detection uses a depth-first search algorithm to ensure no circular chains exist, regardless of how many work items are involved.

## Viewing Dependencies

Dependencies are shown on the work item detail page in two sections:

- **Predecessors** -- work items that this task depends on
- **Successors** -- work items that depend on this task
