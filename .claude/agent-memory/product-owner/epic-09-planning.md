# EPIC-09: Dashboard & Project Health Center

## Epic Issue: #9

- Priority: Should Have
- Sprint: 5
- Dependencies: EPIC-02, EPIC-03, EPIC-05, EPIC-06

## Stories (9 total)

| Story | Issue | Title                               | Priority | Blocked By | ACs |
| ----- | ----- | ----------------------------------- | -------- | ---------- | --- |
| 9.1   | #470  | User Preferences Infrastructure     | Must     | (none)     | 9   |
| 9.2   | #471  | Dashboard Layout & Data Shell       | Must     | #470       | 10  |
| 9.3   | #472  | Budget Summary Card                 | Must     | #471       | 8   |
| 9.4   | #473  | Budget Alerts & Source Utilization  | Must     | #472       | 7   |
| 9.5   | #474  | Timeline Status Cards               | Should   | #471       | 9   |
| 9.6   | #475  | Mini Gantt Preview Card             | Should   | #474       | 11  |
| 9.7   | #476  | Invoice & Subsidy Pipeline Cards    | Must     | #471       | 9   |
| 9.8   | #477  | Quick Actions & Navigation Card     | Should   | #471       | 5   |
| 9.9   | #478  | Responsive, Dark Mode & A11y Polish | Must     | all above  | 11  |

## Dependency Graph

```
9.1 (#470)
 └── 9.2 (#471)
      ├── 9.3 (#472)
      │    └── 9.4 (#473)
      ├── 9.5 (#474)
      │    └── 9.6 (#475)
      ├── 9.7 (#476)
      └── 9.8 (#477)
           │
9.3 + 9.4 + 9.5 + 9.6 + 9.7 + 9.8 ──► 9.9 (#478)
```

## Topological Development Order

1. #470 (9.1) — User Preferences Infrastructure
2. #471 (9.2) — Dashboard Layout & Data Shell
3. #472 (9.3), #474 (9.5), #476 (9.7), #477 (9.8) — can run in parallel
4. #473 (9.4) — after #472
5. #475 (9.6) — after #474
6. #478 (9.9) — after all others

## Board Status (set 2026-03-09)

- #470: Todo (ready to start)
- #471-#478: Backlog

## Node IDs

- EPIC-09: I_kwDORK8WYc7pGzMX
- #470: I_kwDORK8WYc7wEnmH
- #471: I_kwDORK8WYc7wEn86
- #472: I_kwDORK8WYc7wEoNH
- #473: I_kwDORK8WYc7wEofk
- #474: I_kwDORK8WYc7wEoy4
- #475: I_kwDORK8WYc7wEpA5
- #476: I_kwDORK8WYc7wEpNZ
- #477: I_kwDORK8WYc7wEpS8
- #478: I_kwDORK8WYc7wEplj

## AC Verification Notes

All 9 stories have well-formed acceptance criteria:

- All use "As a... I want... so that..." format
- All have numbered, testable ACs (total: 79 ACs across 9 stories)
- All reference parent epic #9
- All have correct priority and sprint labels
- Story 9.5 (#474) AC #8 notes chart library as architecture decision for product-architect
- Story 9.9 (#478) depends on ALL other stories (correctly modeled with 7 blocked-by links)
