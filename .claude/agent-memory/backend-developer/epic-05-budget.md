# EPIC-05 Budget Management Notes

## Migration 0003

- File: `server/src/db/migrations/0003_create_budget_tables.sql`
- Creates 8 tables: budget_categories, vendors, invoices, budget_sources, subsidy_programs + 3 junction tables
- Seeds 10 default budget categories with deterministic IDs (bc-materials, bc-labor, etc.)
- All monetary fields use `REAL` in SQL (not INTEGER)

## Schema Additions (schema.ts)

- Added `real` to the drizzle-orm/sqlite-core import for monetary columns
- `invoices.amount` and `budget_sources.totalAmount/interestRate` and `subsidy_programs.reductionValue` use `real()`
- Junction tables use `primaryKey({ columns: [...] })` composite PKs

## Error Code CATEGORY_IN_USE

- Added to `shared/src/types/errors.ts` ErrorCode union
- `CategoryInUseError` class in `server/src/errors/AppError.ts`
- Returns HTTP 409 with `details: { subsidyProgramCount, workItemCount }`
- Work item count always 0 until `budget_category_id` FK is added to work_items (later story)

## Service Pattern (budgetCategoryService.ts)

- Same pattern as tagService.ts
- Case-insensitive name uniqueness via `LOWER()` SQL function
- `deleteBudgetCategory` checks `subsidyProgramCategories` junction table before deleting
- `toBudgetCategory()` mapper function for DB row -> API shape

## Route Pattern (budgetCategories.ts)

- Same pattern as tags.ts
- GET / returns `{ categories: [...] }` (NOT paginated)
- POST / returns the created category directly (201)
- GET /:id / PATCH /:id return the category directly (200)
- DELETE /:id returns 204 empty

## Registered in app.ts

```typescript
await app.register(budgetCategoryRoutes, { prefix: '/api/budget-categories' });
```

## Standalone Invoice API Pattern (cross-vendor)

Added in standalone invoice feature (branch `feat/standalone-invoice-api`):

- `Invoice.vendorName: string` is now a required field — `toInvoice()` resolves it from vendors table
- `Invoice.workItemBudget: WorkItemBudgetSummary | null` — enriched budget line details (added by PR #202)
- `listAllInvoices(db, query)` in `invoiceService.ts`:
  - Paginated cross-vendor listing using `innerJoin(vendors, eq(invoices.vendorId, vendors.id))`
  - Global status summary (unfiltered) via separate `GROUP BY invoices.status` query
  - Supports filtering: `status`, `vendorId`, `q` (LIKE on invoiceNumber with escaping)
  - Supports sorting by: `date` (default), `amount`, `status`, `vendor_name`, `due_date`
  - Returns `{ invoices, pagination: PaginationMeta, summary: InvoiceStatusBreakdown }`
  - **CRITICAL**: `listAllInvoices()` has an inline `.map()` (not using `toInvoice()`) — any new `Invoice` fields must be added to BOTH `toInvoice()` AND the inline map
- `getInvoiceById(db, id)` — cross-vendor single lookup, throws `NotFoundError` if missing
- Route file: `server/src/routes/standaloneInvoices.ts` — registered at `/api/invoices`
- New shared types exported: `InvoiceStatusSummary`, `InvoiceStatusBreakdown`, `InvoiceListPaginatedResponse`, `InvoiceDetailResponse`, `WorkItemBudgetSummary`

## InvoiceSummary Type Disambiguation

Two different "InvoiceSummary" concepts:

- `InvoiceSummary` from `workItemBudget.ts` (re-exported in `index.ts`) — per-invoice row embedded in `WorkItemBudgetLine.invoices[]`
- `InvoiceStatusBreakdown` from `invoice.ts` — status-grouped count/total aggregates (was previously named `InvoiceSummary` before rename in feat branch)
