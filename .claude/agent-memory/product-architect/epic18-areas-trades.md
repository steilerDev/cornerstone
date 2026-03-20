---
name: EPIC-18 Areas & Trades Architecture
description: Schema, API contract, and ADR details for EPIC-18 structured dimensions replacing tags
type: project
---

## EPIC-18: Area & Trade Structured Dimensions

**ADR-028** (Accepted) — replaces generic tags with Areas (hierarchical) and Trades (flat).

### Schema Changes (Migration 0018)
- NEW: `areas` table (self-ref parent_id, ON DELETE CASCADE, UNIQUE(name, parent_id))
- NEW: `trades` table (UNIQUE name, 15 seeded defaults)
- MOD: `vendors` — add `trade_id` FK (ON DELETE SET NULL), ignore `specialty` (not dropped due to SQLite ALTER limitations)
- MOD: `work_items` — add `area_id` (ON DELETE SET NULL), add `assigned_vendor_id` (ON DELETE SET NULL), CHECK(assigned_user_id IS NULL OR assigned_vendor_id IS NULL) enforced at app layer
- MOD: `household_items` — add `area_id` (ON DELETE SET NULL), ignore `room` (not dropped)
- DROP: `tags`, `work_item_tags`, `household_item_tags`
- Budget category defaults: ADD bc-waste, conditionally DELETE bc-equipment/landscaping/utilities/insurance/contingency
- HI category defaults: ADD hic-equipment, conditionally DELETE hic-outdoor/hic-storage

### API Changes
- NEW: `/api/areas` CRUD (no pagination, search filter, tree built client-side)
- NEW: `/api/trades` CRUD (no pagination, search filter)
- REMOVED: All `/api/tags/*`
- MOD: Work items — `tags[]` → `area: {id, name, color} | null`, added `assignedVendor`, removed `tagIds`
- MOD: Household items — `tags[]` → `area`, removed `room`, removed `tagIds`
- MOD: Vendors — `specialty` → `trade: {id, name, color} | null`, added `tradeId` filter
- MOD: Timeline — work items include `area` and `assignedVendor` instead of `tags`
- MOD: CalDAV feeds — vendor TITLE uses trade name instead of specialty
- New error codes: `AREA_IN_USE`, `TRADE_IN_USE`

### Key Design Decisions
- D1: Area hierarchy via self-referencing parent_id (arbitrary depth)
- D2: Area cardinality M:1 (one area per item, nullable)
- D3: Trade transitivity via JOINs (work_item -> vendor -> trade)
- D4: Assignment mutually exclusive (user XOR vendor) via CHECK
- D5: Room field dropped without data migration
- D6: Specialty → Trade migration not automated (users reassign manually)
- D7: Category default changes conditional (only delete unused)

### Stories
#1030 Migration + Shared Types, #1031 Areas Backend, #1032 Trades Backend + Vendor Update,
#1033 Work Item Rework, #1034 HI Rework, #1035 Frontend Manage Page, #1037 Frontend Entity Integration
