# EPIC-09: Dashboard & Project Health Center — Planning

## Stories (Sprint 5)

| Story | Issue | Title | Priority | Depends On | Board Status |
|-------|-------|-------|----------|------------|-------------|
| 9.1 | #470 | User Preferences Infrastructure | Must | none | Todo |
| 9.2 | #471 | Dashboard Layout & Data Shell | Must | 9.1 | Backlog |
| 9.3 | #472 | Budget Summary Card | Must | 9.2 | Backlog |
| 9.4 | #473 | Budget Alerts & Source Utilization | Must | 9.3 | Backlog |
| 9.5 | #474 | Timeline Status Cards | Should | 9.2 | Backlog |
| 9.6 | #475 | Mini Gantt Preview Card | Should | 9.5 | Backlog |
| 9.7 | #476 | Invoice & Subsidy Pipeline Cards | Must | 9.2 | Backlog |
| 9.8 | #477 | Quick Actions & Navigation | Should | 9.2 | Backlog |
| 9.9 | #478 | Responsive, Dark Mode & A11y Polish | Must | all above | Backlog |

## Dependency Graph

```
9.1 → 9.2 → 9.3 → 9.4
            → 9.5 → 9.6
            → 9.7
            → 9.8
9.3 + 9.4 + 9.5 + 9.6 + 9.7 + 9.8 → 9.9
```

## Key Design Decisions

- User preferences stored server-side (migration creates `user_preferences` table)
- Theme migrated from localStorage to API-backed on first auth load
- Dashboard card hide/show persisted as preference `dashboard.hiddenCards`
- Chart library must be pure JS (no native binaries per dependency policy)
- Mini Gantt is a separate read-only SVG component (not the full GanttChart)
- Mobile: primary cards always visible, secondary cards collapsed with summary headers

## Board Option IDs (correct)

- Backlog: `7404f88c`
- Todo: `dc74a3b0`
- In Progress: `296eeabe`
- Done: `c558f50d`

Note: The task description provided incorrect option IDs (`2a1be691` for Backlog, `47fc9ee4` for Todo). The correct IDs are the ones from the project board query above.

## UAT Scenarios

All posted as comments on respective issues. Total: 67 scenarios across 9 stories.
