---
name: Story #1030 Implementation
description: Migration 0028 + shared types foundation for EPIC-18 (Areas & Trades)
type: project
---

## Story #1030 Complete: Migration + Shared Types Foundation

**Status**: Implemented and pushed to `feat/1030-migration-shared-types`
**Commit**: 647acbe — feat(epic-18): Migration 0028 + shared types foundation (Story #1030)

### What Was Done

#### 1. SQL Migration (0028_areas_trades_rework.sql)

- Created `trades` table with 15 default trades (Plumbing, HVAC, Electrical, etc.)
- Migrated `vendor.specialty` string values to new trades lookup table
- Recreated `vendors` table: removed specialty column, added trade_id FK
- Recreated `vendor_contacts` table (dropped and recreated to maintain data)
- Created `areas` table with hierarchical support (name + parent_id self-reference)
- Added `area_id` and `assigned_vendor_id` columns to `work_items`
- Replaced `room` column with `area_id` on `household_items`
- Dropped all tag-related tables (`tags`, `work_item_tags`, `household_item_tags`)
- Updated default budget categories (added Waste, removed Equipment/Landscaping/Utilities/Insurance/Contingency if unused)

#### 2. New Shared Type Files

- **shared/src/types/area.ts** — AreaSummary, AreaResponse, AreaListResponse, CreateAreaRequest, UpdateAreaRequest, AreaListQuery
- **shared/src/types/trade.ts** — TradeSummary, TradeResponse, TradeListResponse, CreateTradeRequest, UpdateTradeRequest, TradeListQuery

#### 3. Updated Shared Types

**workItem.ts**:

- Removed `import type { TagResponse } from './tag.js'`
- Added `VendorSummary` interface (id + name + trade)
- WorkItemSummary: removed `tags`, added `assignedVendor` + `area`
- WorkItemDetail: removed `tags`, added `assignedVendor` + `area`
- CreateWorkItemRequest/UpdateWorkItemRequest: removed `tagIds`, added `assignedVendorId` + `areaId`
- WorkItemListQuery: removed `tagId`, added `assignedVendorId` + `areaId`

**householdItem.ts**:

- Updated HouseholdItemVendorSummary: `specialty: string | null` → `trade: TradeSummary | null`
- HouseholdItemSummary: removed `room` + `tagIds`, added `area`
- HouseholdItemDetail: removed `tags` field
- CreateHouseholdItemRequest/UpdateHouseholdItemRequest: removed `room` + `tagIds`, added `areaId`
- HouseholdItemListQuery: removed `room` + `tagId`, added `areaId`, removed 'room' from sortBy

**vendor.ts**:

- Updated Vendor interface: `specialty: string | null` → `trade: TradeSummary | null`
- CreateVendorRequest/UpdateVendorRequest: `specialty` → `tradeId`
- VendorListQuery: `specialty` → `trade` in sortBy, added `tradeId` filter

**timeline.ts**:

- Added `assignedVendor: VendorSummary | null` to TimelineWorkItem
- Added `area: AreaSummary | null` to TimelineWorkItem
- Removed `tags: TagResponse[]` from TimelineWorkItem

**budget.ts**:

- Removed duplicate VendorSummary definition
- Now imports VendorSummary from workItem.ts

**errors.ts**:

- Added `AREA_IN_USE` error code (409)
- Added `TRADE_IN_USE` error code (409)

**schema.ts** (Drizzle ORM):

- Added `trades` table definition with indexes
- Added `areas` table definition with hierarchical support (self-referencing parent_id)
- Updated `vendors` table: removed specialty, added tradeId FK
- Updated `workItems` table: added areaId and assignedVendorId FKs
- Updated `householdItems` table: removed room, added areaId FK
- Removed tags, workItemTags, householdItemTags table definitions
- Imported `type AnySQLiteColumn` for the self-referencing areas.parent_id type

**index.ts**:

- Removed tag exports (Tag, TagResponse, CreateTagRequest, UpdateTagRequest, TagListResponse)
- Added area exports (AreaSummary, AreaResponse, AreaListResponse, AreaSingleResponse, CreateAreaRequest, UpdateAreaRequest, AreaListQuery)
- Added trade exports (TradeSummary, TradeResponse, TradeListResponse, TradeSingleResponse, CreateTradeRequest, UpdateTradeRequest, TradeListQuery)
- Added VendorSummary to WorkItems exports
- Removed VendorSummary from WorkItemBudgets exports (no duplicate)

### Type Validation

All production type definitions compile cleanly (verified individually):

- area.ts ✓
- trade.ts ✓
- workItem.ts ✓
- householdItem.ts ✓
- vendor.ts ✓
- timeline.ts ✓
- budget.ts ✓
- errors.ts ✓
- workItemBudget.ts ✓

Test files in shared have expected failures (using old properties: room, tags, tagIds, specialty) — these will be fixed by QA when updating tests.

### Downstream Dependencies

Subsequent stories depend on these foundation types:

- **Story #1031 + #1032** (Areas + Trades Backend CRUD): Will implement GET/POST/PATCH/DELETE endpoints
- **Story #1033 + #1034** (Work Item + HI Rework): Will update service/route handlers to use new fields
- **Story #1035** (Frontend Manage Page): Will create UI for areas/trades management
- **Story #1037** (Frontend Entity Integration): Will add area/vendor selection to work item/HI forms

### Important Notes

- The migration uses the vendor table recreation pattern from migration 0026 (drop old, create new, copy data, rename)
- Areas support hierarchical structure via parent_id self-reference using AnySQLiteColumn type annotation
- VendorSummary is now unified (defined once in workItem.ts, imported by budget.ts) to avoid duplication
- Tags are completely removed from the database schema and API types
- No routes or services are implemented in this story — pure foundation work
