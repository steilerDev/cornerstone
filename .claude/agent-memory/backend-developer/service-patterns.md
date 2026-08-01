# Service-Layer Reference Patterns (beyond basic CRUD)

## Junction Table Pattern (M:N with individual add/remove semantics)

Reference `server/src/services/workItemVendorService.ts` for work item ↔ vendor links:

- `listXLinks(db, id)` — join through junction table, map to full entity shape
- `linkXToY(db, xId, yId)` — validate both exist, check for existing link (409 if found), insert
- `unlinkXFromY(db, xId, yId)` — validate parent exists, check link exists (404 if not), delete
- Return `Vendor` or `SubsidyProgram` (full entity) from link/unlink operations

## Junction Table Pattern (M:N with replace-all semantics)

Reference `server/src/services/subsidyProgramService.ts` for linking programs to categories:

- `loadApplicableCategories(db, id)` — select junction rows, then `inArray` on category IDs
- `replaceCategoryLinks(db, id, categoryIds)` — delete existing rows, insert new rows
- `validateCategoryIds(db, categoryIds)` — `inArray` select + diff found vs requested for missing IDs
- On update: check `data.categoryIds !== undefined` (not `length > 0`) to distinguish "replace with empty" from "no change"
- Always bump `updatedAt` even if only junction table changed (no scalar fields updated)

## Aggregation Service Pattern (read-only, no CRUD)

Reference `server/src/services/budgetOverviewService.ts` for read-only aggregation:

- Use `db.get<ResultType>(sql`...`)` for single-row aggregations (totals, counts)
- Use `db.all<ResultType>(sql`...`)` for multi-row aggregations (GROUP BY results)
- Raw SQL via `sql` tagged template from `drizzle-orm` — better than Drizzle query builder for complex GROUP BY/CASE
- `COALESCE(SUM(...), 0)` to avoid null results when no rows exist
- `CASE WHEN ... THEN ... ELSE 0 END` inside SUM for conditional aggregation
- No need for `select().from()` chaining when raw SQL is cleaner
