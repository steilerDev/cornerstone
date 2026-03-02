# Epic Patterns and Conventions

## Issue Format

Each epic issue has this structure:

- Title: "EPIC-NN: Descriptive Title"
- Labels: `epic`, one `priority: X` label, one `sprint-N` label
- Body sections: Description, Requirements Coverage (with specific section references), Dependencies (by EPIC-ID), Goals

## Scoping Decisions

- Budget CRUD vs Budget Dashboard: EPIC-05 covers all budget CRUD operations and data management. EPIC-09 covers aggregated views, dashboards, and variance alerts displayed prominently.
- Work Item list view is in EPIC-03. Gantt chart and calendar view are in EPIC-06.
- Paperless-ngx config (API endpoint, auth token) is in EPIC-02. Document browsing, linking, and display is in EPIC-08.
- Drag-and-drop on Gantt chart is in EPIC-06. Cross-cutting UX polish (keyboard shortcuts everywhere, touch optimization, performance) is in EPIC-10.
- Household item delivery display on the timeline is shared: EPIC-04 provides the data/link model, EPIC-06 provides the visual rendering.

## Dependency Chains (Critical Path)

1. EPIC-01/02 (Sprint 1) -> EPIC-03 (Sprint 2) -> EPIC-05 (Sprint 3) -> EPIC-04 (Sprint 4) -> EPIC-08 (Sprint 4) -> EPIC-07 (Sprint 5)
2. EPIC-01/02 (Sprint 1) -> EPIC-03 (Sprint 2) -> EPIC-06 (Sprint 3) -- parallel to budget chain

## Sprint Planning Notes

- Sprint 3 has the most parallelism: EPIC-05 and EPIC-06 can be worked on simultaneously
- Sprint 4: EPIC-08 has a soft dependency on EPIC-04; can start with work item doc linking while household items are being built
- Sprint 5 is the most flexible: all three epics (07, 09, 10) are independent of each other
