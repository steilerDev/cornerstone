# EPIC-04: Household Items Architecture

## ADR-016: Separate Entity with Parallel Structure

Decision: Household items are a separate `household_items` table (not STI on work_items, not EAV).

### Rationale

- Work items have scheduling/dependencies; household items have purchase status/delivery tracking
- Scheduling engine unaffected
- No nullable column confusion
- Budget overview aggregates both via UNION queries

## Schema (Migration 0010)

6 new tables:

1. **household_items**: Main entity
   - TEXT PK (UUID), name, description, category (CHECK 8 values), status (CHECK 4 values)
   - vendor_id FK->vendors ON DELETE SET NULL
   - url, room (free text), quantity (>=1), order_date, expected_delivery_date, actual_delivery_date
   - created_by FK->users ON DELETE SET NULL, created_at, updated_at
   - Indexes: category, status, room, vendor_id, created_at

2. **household_item_tags**: M:N junction (composite PK)
3. **household_item_notes**: Per-item notes (TEXT PK, content, created_by FK)
4. **household_item_budgets**: Mirrors work_item_budgets exactly (no invoice linkage)
5. **household_item_work_items**: Simple M:N junction (no dep types like FS/SS/FF/SF)
6. **household_item_subsidies**: M:N with subsidy_programs (composite PK)

### Category Values

furniture, appliances, fixtures, decor, electronics, outdoor, storage, other

### Status Values

not_ordered, ordered, in_transit, delivered

### Shared Tables Reused

- tags (global resource)
- vendors (contractors + suppliers)
- budget_categories, budget_sources
- subsidy_programs
- document_links (already supports household_item entity_type)

## API Contract (20 Endpoints)

- Household Items: GET list (paginated/filterable/sortable), POST create, GET detail, PATCH update, DELETE
- Notes: GET list, POST create, PATCH update, DELETE (author/admin check)
- Budget Lines: GET list, POST create, PATCH update, DELETE (mirrors work item budget line endpoints)
- Work Item Links: GET list, POST link, DELETE unlink (simple M:N, 409 on duplicate)
- Subsidy Links: GET list, POST link, DELETE unlink (simple M:N, 409 on duplicate)
- Subsidy Payback: GET (same calculation as work item payback)

### List Query Params

- Filters: category, status, vendorId, room, tagId, q (full-text search on name/description/room)
- Sort: name, category, status, room, order_date, expected_delivery_date, created_at, updated_at

### Response Shapes

- HouseholdItemSummary: includes tagIds[], budgetLineCount, totalPlannedAmount
- HouseholdItemDetail: extends Summary with tags[], workItems[], subsidies[]
- Budget lines include actualCost/actualCostPaid/invoiceCount (always 0 for household items, shape consistency)

### Budget Overview Update

- GET /api/budget/overview must aggregate across BOTH work_item_budgets and household_item_budgets
- Response shape unchanged; backend uses UNION queries

## No New Error Codes Needed

- Existing codes cover all cases (NOT_FOUND, VALIDATION_ERROR, CONFLICT, UNAUTHORIZED, FORBIDDEN)

## Wiki Pages Updated

- Schema.md: EPIC-04 section with all 6 tables + migration SQL
- API-Contract.md: 20 endpoints (~1050 lines)
- ADR-016-Household-Items-Architecture.md: New ADR
- ADR-Index.md: Added ADR-016 entry
- PR #395: docs(epic-04) targeting beta
