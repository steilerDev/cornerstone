# EPIC-05: Budget Management Architecture

## Schema (Migration 0003)

8 tables created in `0003_create_budget_tables.sql`:

- `budget_categories` - TEXT PK, name UNIQUE, sort_order, color, description. 10 default categories seeded.
- `vendors` - TEXT PK, created_by FK SET NULL, name NOT UNIQUE, no separate address fields
- `invoices` - TEXT PK, vendor_id FK CASCADE, REAL amount, 3 statuses (pending/paid/overdue)
- `budget_sources` - TEXT PK, 4 source_types, REAL total_amount/interest_rate, 3 statuses
- `subsidy_programs` - TEXT PK, percentage/fixed reduction_type, 5 application_statuses
- `subsidy_program_categories` - composite PK junction, CASCADE both sides
- `work_item_vendors` - composite PK junction, CASCADE both sides, idx on vendor_id (DROPPED in 0005)
- `work_item_subsidies` - composite PK junction, CASCADE both sides, idx on subsidy_program_id

## Schema (Migration 0004 -- SUPERSEDED by 0005)

Added flat budget columns to work_items: planned_budget, actual_cost, confidence_percent, budget_category_id, budget_source_id. These are removed by migration 0005.

## Schema (Migration 0005 -- Story 5.9 Budget System Rework)

1. **Created `work_item_budgets`**: TEXT PK, work_item_id FK CASCADE, description, planned_amount REAL >= 0, confidence enum (own_estimate/professional_estimate/quote/invoice), budget_category_id FK SET NULL, budget_source_id FK SET NULL, vendor_id FK SET NULL, created_by FK SET NULL, timestamps. Indexes on work_item_id, vendor_id, budget_category_id, budget_source_id.
2. **Recreated `work_items`**: Removed planned_budget, actual_cost, confidence_percent, budget_category_id, budget_source_id columns. Uses SQLite table recreation pattern.
3. **Recreated `invoices`**: Added work_item_budget_id FK SET NULL. Changed status enum from pending/paid/overdue to pending/paid/claimed. Overdue -> pending in data migration.
4. **Dropped `work_item_vendors`**: Replaced by work_item_budgets.vendor_id.

Confidence margin mapping: own_estimate=20%, professional_estimate=10%, quote=5%, invoice=0%.

## Key Design Decisions

- TEXT UUID PKs (corrected from proposed INTEGER AUTOINCREMENT to match convention)
- created_by nullable with ON DELETE SET NULL (consistent with work_items)
- No created_by on budget_categories (shared org resource)
- REAL for monetary amounts (sufficient at <5 user scale)
- datetime('now') DEFAULT on timestamps as safety net for seed data
- Default category IDs are deterministic strings: bc-materials, bc-labor, etc.
- No payment schedule table (terms/notes fields sufficient for this scale)
- Budget lines replace flat budget columns for multi-line support per work item
- `overdue` replaced by `claimed` -- overdue is better computed from dueDate vs current date
- Actual cost is computed (sum of linked invoices), not stored

## API Contract (Story 5.1 - Budget Categories)

5 endpoints, all auth required, no role restriction:

- GET /api/budget-categories -> { categories: [...] } sorted by sort_order, unpaginated
- POST /api/budget-categories -> BudgetCategory (201)
- GET /api/budget-categories/:id -> BudgetCategory
- PATCH /api/budget-categories/:id -> BudgetCategory (partial update)
- DELETE /api/budget-categories/:id -> 204 (409 CATEGORY_IN_USE if referenced)

New error code: CATEGORY_IN_USE (409) with details { subsidyProgramCount, workItemCount }

Validation: name 1-100 chars unique case-insensitive, description max 500, color hex #RRGGBB, sortOrder >= 0

List wrapper key: `categories` (not `data`), consistent with `tags`/`users` pattern.

## API Contract (Story 5.2 - Vendors)

5 endpoints, all auth required, no role restriction:

- GET /api/vendors -> paginated { items, pagination }, search by q (name/specialty), sort by name/specialty/created_at/updated_at
- POST /api/vendors -> { vendor: Vendor } (201)
- GET /api/vendors/:id -> { vendor: VendorDetail } (includes invoiceCount, outstandingBalance)
- PATCH /api/vendors/:id -> { vendor: VendorDetail } (partial update, returns detail with computed fields)
- DELETE /api/vendors/:id -> 204 (409 VENDOR_IN_USE if has invoices or work_item_vendors)

New error code: VENDOR_IN_USE (409) with details { invoiceCount, workItemCount }

Validation: name 1-200 chars required, specialty max 200, phone max 50, email max 200 valid format, address max 500, notes max 2000

Shared types: Vendor, VendorDetail, CreateVendorRequest, UpdateVendorRequest, VendorListQuery, VendorCreateResponse, VendorDetailResponse (in shared/src/types/vendor.ts)

Design decisions:

- Paginated (unlike budget categories) because vendor list can grow to dozens
- List uses { items, pagination } standard wrapper (consistent with work items)
- Detail/single responses wrapped in { vendor: ... }
- GET by ID and PATCH return VendorDetail (with computed invoice fields)
- POST returns Vendor (no computed fields needed for new vendor)
- outstandingBalance = sum of amount where status IN ('pending','overdue')
- createdBy exposed as UserSummary (id, displayName, email)

## Wiki Updates

- Schema page: all 8 tables documented with rationale, updated ER diagram
- API Contract: budget categories CRUD + vendor CRUD endpoints, CATEGORY_IN_USE + VENDOR_IN_USE error codes
- Issue #142 comment with budget category architecture summary
- Issue #143 comment with vendor architecture summary

## Story 5.2 PR Review Issues Found (PR #151)

BLOCKING:

1. List response key: implementation uses `{ vendors, pagination }` but contract specifies `{ items, pagination }`. Fix everywhere: service, route, client api module, page, all tests.
2. Email format validation missing: contract says "Valid email format if provided" — no AJV format or regex check present.
3. notes maxLength: implementation allows 10000 chars, contract says 2000. Fix both createVendorSchema and updateVendorSchema.

NON-BLOCKING:

- email maxLength: contract=200, implementation=255 (255 is actually RFC-correct — recommend updating contract to 255)
- Search placeholder mentions "phone or email" but backend only searches name+specialty
- N+1 queries in listVendors (toVendor calls a user lookup per row) — acceptable at this scale

## API Contract (Story 5.3 - Invoices, #144)

4 endpoints nested under vendors, all auth required, no role restriction:

- GET /api/vendors/:vendorId/invoices -> { invoices: [...] } sorted by date desc, NOT paginated
- POST /api/vendors/:vendorId/invoices -> { invoice: Invoice } (201)
- PATCH /api/vendors/:vendorId/invoices/:invoiceId -> { invoice: Invoice }
- DELETE /api/vendors/:vendorId/invoices/:invoiceId -> 204

No new error codes needed (uses existing NOT_FOUND, VALIDATION_ERROR, UNAUTHORIZED).

Validation: amount > 0 required, date required (ISO 8601), dueDate >= date, invoiceNumber max 100, notes max 2000, status one of pending/paid/claimed (default: pending). Optional workItemBudgetId FK.

Shared types in shared/src/types/invoice.ts: Invoice, InvoiceStatus, CreateInvoiceRequest, UpdateInvoiceRequest, InvoiceListResponse, InvoiceResponse.

Design decisions:

- Not paginated: vendor typically has <50 invoices (consistent with notes/subtasks/tags pattern)
- Nested under vendor: all endpoints require :vendorId in path
- Invoice must belong to specified vendor; mismatch returns 404 (no info leakage)
- Response wrappers: { invoice: {...} } for single, { invoices: [...] } for list
- createdBy auto-set to authenticated user, exposed as UserSummary | null
- No migration needed: invoices table exists from 0003
- Branch: feat/144-invoice-management

## API Contract (Story 5.9 - Budget Lines)

4 endpoints nested under work items, all auth required, no role restriction:

- GET /api/work-items/:workItemId/budgets -> { budgets: [...] } NOT paginated
- POST /api/work-items/:workItemId/budgets -> { budget: WorkItemBudgetLine } (201)
- PATCH /api/work-items/:workItemId/budgets/:budgetId -> { budget: WorkItemBudgetLine }
- DELETE /api/work-items/:workItemId/budgets/:budgetId -> 204 (409 BUDGET_LINE_IN_USE if has invoices)

New error code: BUDGET_LINE_IN_USE (409) with details { invoiceCount }

WorkItemBudgetLine response includes computed fields: confidenceMargin, actualCost (sum all linked invoices), actualCostPaid (sum paid invoices), invoiceCount.

Validation: plannedAmount >= 0 required, description max 500, confidence enum, budgetCategoryId/budgetSourceId/vendorId optional FK references.

Modified endpoints:

- WorkItemDetail now includes `budgets: WorkItemBudgetLine[]` (embedded, not paginated)
- Invoice create/update accepts optional `workItemBudgetId`
- Invoice status enum changed: pending/paid/overdue -> pending/paid/claimed
- Vendor delete checks work_item_budgets.vendor_id (details: { invoiceCount, budgetLineCount })
- Category delete checks work_item_budgets.budget_category_id (details: { subsidyProgramCount, budgetLineCount })

Summary types added: VendorSummary (id, name, specialty), BudgetSourceSummary (id, name, sourceType)
