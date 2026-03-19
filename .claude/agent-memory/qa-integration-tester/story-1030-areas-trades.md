---
name: Story #1030 EPIC-18 Areas & Trades Migration — Test Updates
description: Test file update patterns for migration 0028 schema changes (specialty→tradeId, room→areaId, tags removed)
type: project
---

# Story #1030 — Migration + Shared Types (EPIC-18 Areas & Trades Rework)

**Branch**: `feat/1030-migration-shared-types`
**PR**: #1042
**Status**: Test files updated and committed; CI blocked by backend production code bugs (not test issues)

## Schema Changes (migration 0028)

- `vendors.specialty` → `vendors.trade_id` FK to `trades` table
- `household_items.room` → `household_items.area_id` FK to `areas` table
- Tables DROPPED: `tags`, `work_item_tags`, `household_item_tags`
- Tables ADDED: `areas`, `trades`, `work_item_areas`, `vendor_contacts` (partial list)
- 15 default trades seeded: `trade-plumbing`, `trade-electrical`, `trade-roofing`, `trade-landscaping`, etc.

## Test Files Updated (16 files, 1 deleted)

- `server/src/services/vendorService.test.ts` — specialty → tradeId, sort 'specialty' → sort 'trade'
- `server/src/services/workItemService.test.ts` — removed tags entirely, tagId filter → areaId filter
- `server/src/services/householdItemService.test.ts` — removed tags/room, added area, areaId filter
- `server/src/services/shared/converters.test.ts` — removed toTagResponse tests, specialty → tradeId in vendor row
- `server/src/services/shared/validators.test.ts` — removed validateTagIds tests, specialty → tradeId in vendor insert
- `server/src/services/timelineService.test.ts` — removed tag helpers/tests, added area/assignedVendor tests
- `server/src/db/migrations/0010_household_items.test.ts` — post-0028 schema: area_id column, idx_household_items_area_id, no room/tags
- `server/src/services/tagService.test.ts` — DELETED (tags feature removed)
- Various service tests: `budgetOverviewService.household.test.ts`, `documentLinkService.test.ts`, `householdItemDepService.test.ts`, `workItemVendorService.test.ts`, `invoiceService.test.ts`, `invoiceService.household.test.ts`, `householdItemService.totalActual.test.ts`, `schedulingEngine.householdItems.test.ts` — all changed `specialty: null` → `tradeId: null`, `tagIds: []` removed

## Key Patterns

- `createTestVendor` helpers: `specialty: null` → `tradeId: null`
- `createTestHouseholdItem` helpers: `room: null` → `areaId: null`, remove `tagIds: []`
- When `runMigrations()` runs ALL migrations including 0028, migration test files that use raw SQL must reflect post-0028 state
- `0010_household_items.test.ts` verifies migration 0010 state but because `runMigrations()` runs all up to current, `room`/`household_item_tags`/`tags` no longer exist in actual DB state
- Index assertions: `idx_household_items_room` → `idx_household_items_area_id`

## Production Code Bugs Blocking CI (NOT QA's fix)

10 production code bugs in backend files — reported in PR #1042 comment:

1. `src/db/schema.ts:18` — `AnySQLiteColumn` not exported from drizzle-orm
2. `src/services/shared/converters.ts` — still imports `tags`/`TagResponse`/`specialty`
3. `src/services/shared/validators.ts` — still imports `tags`
4. `src/services/vendorService.ts` — still references `specialty` column
5. `src/services/workItemService.ts` — still references `workItemTags`/`tags`/`TagResponse`/`tagIds`/`tagId`
6. `src/services/householdItemService.ts` — still references `householdItemTags`/`tags`/`room`/`tagIds`
7. `src/services/tagService.ts` — entire file references removed types (should be deleted)
8. `src/services/timelineService.ts` — still references `workItemTags`/`tags`; missing `assignedVendor`/`area` in mapping
9. `src/routes/tags.ts` — still imports removed request/response types
10. `src/routes/dav.ts` — still passes `specialty` to vendor objects

**Why:** Backend developer did not update production service files when implementing the migration and shared types changes.
