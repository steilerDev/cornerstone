---
name: EPIC-18 Area & Trade Planning
description: Planning details for EPIC-18 (Area & Trade Structured Dimensions) — story decomposition, dependencies, and design decisions
type: project
---

## EPIC-18: Area & Trade Structured Dimensions

**Epic Issue**: #1029
**Priority**: Must Have
**Created**: 2026-03-19

### Summary

Replaces generic tags (color + name, M:N with work items and household items) with two purpose-built dimensions:

- **Area**: spatial organization (where in the house) — hierarchical via self-referencing parent_id
- **Trade**: craft/skill classification (what kind of work) — flat list, linked to vendors

Also replaces: HI freetext `room` → Area FK, vendor freetext `specialty` → Trade FK.

### Stories

| Story | Issue | Title                               | Blocked By   |
| ----- | ----- | ----------------------------------- | ------------ |
| 18.1  | #1030 | Migration + Shared Types            | —            |
| 18.2  | #1031 | Areas Backend CRUD                  | #1030        |
| 18.3  | #1032 | Trades Backend CRUD + Vendor Update | #1030        |
| 18.4  | #1033 | Work Item Rework (Backend)          | #1031, #1032 |
| 18.5  | #1034 | Household Item Rework (Backend)     | #1031, #1032 |
| 18.6  | #1035 | Frontend — Manage Page + Components | #1033, #1034 |
| 18.7  | #1037 | Frontend — Entity Integration       | #1035        |

### Key Design Decisions

- D1: Area hierarchy — arbitrary depth, no enforced levels
- D2: Area cardinality — M:1 (one area per item, nullable)
- D3: Trade transitivity — via JOINs, not denormalized
- D4: Work item assignment — mutually exclusive user XOR vendor (CHECK constraint)
- D5: Room field dropped without data migration
- D6: Specialty → Trade migration with deduplication
- D7: Category default changes conditional (only delete unused)

### Migration Details (Story 18.1)

- Migration file: `0028_areas_trades_rework.sql`
- New tables: `areas`, `trades`
- Modified tables: `work_items` (+area_id, +assigned_vendor_id), `household_items` (+area_id, -room), `vendors` (-specialty, +trade_id)
- Dropped tables: `tags`, `work_item_tags`, `household_item_tags`
- 15 default trades inserted
- New budget category "Waste", new HI category "Equipment"

### UAT Scenarios

All posted as comments on respective story issues (2026-03-19).
