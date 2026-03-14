---
name: EPIC-16 Floor Plans & Utility Tracking Planning
description: Story issue numbers, phases, and dependency graph for EPIC-16 (Floor Plans & Utility Tracking 2.5D)
type: project
---

## EPIC-16: Floor Plans & Utility Tracking (2.5D) — Issue #752

Created 2026-03-13. 22 stories across 6 phases. All in Backlog status.

**Why:** New capability for documenting building layout, wall construction, and utility routing.
**How to apply:** Stories follow strict dependency chains through 6 phases. Phase 1 must complete before Phase 2 can start. FP-10 (Surface Layers) can start in parallel with Phase 2 since it only depends on FP-1.

### Story Issue Map

| Story | Issue | Title                                | Phase | Blocked By |
| ----- | ----- | ------------------------------------ | ----- | ---------- |
| FP-1  | #753  | Schema & Migration                   | 1     | None       |
| FP-2  | #754  | Material & Utility Type Catalogs     | 1     | #753       |
| FP-3  | #755  | Lots & Buildings CRUD                | 1     | #753       |
| FP-4  | #756  | Floors CRUD & Building Detail        | 1     | #755       |
| FP-5  | #757  | Lot View Canvas                      | 1     | #755       |
| FP-6  | #758  | Floor Plan Canvas (Read-Only)        | 2     | #756       |
| FP-7  | #759  | Wall Drawing Interaction             | 2     | #758       |
| FP-8  | #760  | Rooms CRUD & Labels                  | 2     | #758       |
| FP-9  | #761  | Doors & Windows                      | 2     | #759       |
| FP-10 | #762  | Surface Layers Backend               | 3     | #753       |
| FP-11 | #763  | Wall Cross-Section View              | 3     | #758, #762 |
| FP-12 | #764  | Ceiling & Floor Surface Layers       | 3     | #762, #758 |
| FP-13 | #765  | Utility Lines Backend                | 4     | #762       |
| FP-14 | #766  | Layer Detail View (Read-Only)        | 4     | #763, #765 |
| FP-15 | #767  | Utility Drawing Interaction          | 4     | #766       |
| FP-16 | #768  | Utility Terminals                    | 4     | #765, #766 |
| FP-17 | #770  | Connection Guides                    | 4     | #765, #766 |
| FP-18 | #771  | Cross-Floor Connections              | 5     | #758, #756 |
| FP-19 | #772  | Stairs                               | 5     | #758, #756 |
| FP-20 | #773  | Ceiling Shapes                       | 5     | #764       |
| FP-21 | #774  | Utility Overlay on Floor Plan        | 6     | #758, #765 |
| FP-22 | #775  | Responsive View-Only & Accessibility | 6     | All above  |

### Key Notes

- Note: Issue #769 was skipped (not created by us) — FP-17 is #770
- ADRs: ADR-020 (Konva.js), ADR-021 (Polymorphic Layers), ADR-022 (JSON Path Segments), ADR-023 (View Hierarchy)
- New deps: konva + react-konva (pure JS, no native binaries per dep policy)
- Migration: 0019_floor_plans.sql (14 tables)
- FP-10 can run in parallel with Phase 2 (only depends on FP-1)
- FP-18/FP-19 can run in parallel with Phase 3/4 (only depend on Phase 1-2)
