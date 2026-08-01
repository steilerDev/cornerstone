# Budget & Invoice Pages (EPIC-05 and later)

## Budget Section Pages (Story #149, PR #158)

- BudgetSubNav: `client/src/components/BudgetSubNav/BudgetSubNav.tsx` — 5-tab sub-nav on all budget section pages. Uses NavLink + `end` per tab. Horizontal scroll on mobile.
- Shared formatters: `client/src/lib/formatters.ts` — `formatCurrency(n)` (EUR), `formatPercent(n)`. All budget pages use this.
- Page header pattern: all budget pages use `<h1>Budget</h1>` + `<h2>Section Name</h2>`. Loading/error states also render BudgetSubNav.
- Sidebar: single "Budget" NavLink (no `end`) to `/budget`. Total 9 nav links + 1 GitHub = 10 total links. Sidebar.test.tsx updated accordingly.
- App.test.tsx: budget heading test now checks for `level: 1` with `/^budget$/i` (not "Budget Categories").
- AppShell.test.tsx: budget link test uses `/^budget$/i` (not "budget categories").
- Routing: `/budget` → nested `overview`, `categories`, `vendors`, `vendors/:id`, `sources`, `subsidies` in App.tsx
- BudgetSourcesPage (PR #145): inline CRUD; `BudgetSourceType`: bank_loan/credit_line/savings/other; `BudgetSourceStatus`: active/exhausted/closed
- SubsidyProgramsPage (Story #146): inline CRUD; loads budget categories via fetchBudgetCategories() for multi-select checkboxes; `SubsidyReductionType`: percentage/fixed; `SubsidyApplicationStatus`: eligible/applied/approved/received/rejected
- Dynamic CSS Module class lookup for enum-keyed badges: use a helper function with a Record map (NOT bracket notation `styles['type-bank_loan']` — CSS Modules require camelCase keys)
- AppShell.test.tsx used `/budget/i` regex for nav link assertion — adding a second "budget" link breaks `getByRole` (multiple matches). Always use specific text like `/budget categories/i` or `/budget sources/i`

## WorkItem Budget Lines (EPIC-05 Stories 5.9-5.12)

- `work_item_budgets` table replaces flat budget fields. `WorkItemDetail.budgets: WorkItemBudgetLine[]`
- `workItemBudgetsApi.ts`: `fetchWorkItemBudgets`, `createWorkItemBudget`, `updateWorkItemBudget`, `deleteWorkItemBudget`
- `workItemsApi.ts` has subsidy linking: `fetchWorkItemSubsidies`, `linkWorkItemSubsidy`, `unlinkWorkItemSubsidy`
- Vendor linking functions (`fetchWorkItemVendors`, `linkWorkItemVendor`, `unlinkWorkItemVendor`) were REMOVED from `workItemsApi.ts` in Story 5.12 — they were dead code after the budget rework
- `Invoice` type now has `workItemBudgetId: string | null` field; `CreateInvoiceRequest`/`UpdateInvoiceRequest` support `workItemBudgetId?: string | null`
- BudgetOverview (post hero-bar rewrite): REPLACED summary cards + category table with Budget Health Hero card. Hero card: header (title + BudgetHealthIndicator badge), 3-column metrics row (Available Funds / Projected Range / Remaining), BudgetBar stacked bar, footer (subsidies + sources), CategoryFilter multi-select dropdown. Old test file tests OLD design — QA must rewrite 23/34 tests.

## Invoice Management (Story #144, feat/144-invoice-management)

- `client/src/lib/invoicesApi.ts` — fetchInvoices, createInvoice, updateInvoice, deleteInvoice
- Nested API path: `/vendors/${vendorId}/invoices`, `/vendors/${vendorId}/invoices/${invoiceId}`
- `InvoiceStatus`: `'pending' | 'paid' | 'overdue'` — no `warning` tokens; use `--color-status-not-started-*` for pending (gray), success for paid, blocked for overdue
- `status_${invoice.status}` CSS class naming for status badge variants (e.g. `status_paid`, `status_overdue`)
- Outstanding balance = sum of pending + overdue invoices (computed client-side after fetch)
- Responsive table (desktop) + card list (mobile via CSS `display: none` toggle)
- `useCallback` + `useEffect([id, loadInvoices])` pattern for data fetching with memoized callback
- After create/update/delete: optimistic update to `invoices` state + `void loadVendor()` to refresh stats cards
- `formatDate()` helper: `dateStr.slice(0,10).split('-')` → `new Date(year, month-1, day)` to avoid timezone issues
- `InvoiceFormState` interface with all string fields (amount as string for input, parsed with parseFloat before API call)
- Avoid naming collision: vendor edit uses `editForm/setEditForm`, invoice edit uses `editInvoiceForm/setEditInvoiceForm`
- VendorDetailPage test: "coming soon" test WILL FAIL — QA must update to mock invoicesApi + test new behavior

## Invoice & Subsidy Pipeline Cards (Story #476, feat/476-invoice-subsidy-pipeline)

**InvoicePipelineCard** (`client/src/components/InvoicePipelineCard/`):

- Receives `invoices: Invoice[]` + `summary: InvoiceStatusBreakdown` props
- Filters to pending invoices, sorts by date (oldest first), shows top 5
- Overdue detection: parse date with `new Date(year, month-1, day)`, compare < today's midnight
- Displays vendor name, invoice number (or `#${id.slice(0,8)}`), amount (formatCurrency), date (formatDate)
- Overdue badge (`data-testid="overdue-badge"`) with warning color via `rgba(251, 146, 60, 0.15)` background
- Footer: pending total + "View all invoices" link to `/budget/invoices`
- Empty state: `"No pending invoices"` when no pending items

**SubsidyPipelineCard** (`client/src/components/SubsidyPipelineCard/`):

- Receives `subsidyPrograms: SubsidyProgram[]` prop
- Groups by lifecycle status: eligible/applied/approved/received/rejected (in that order, only show non-empty groups)
- Per-group: count, fixed-reduction total (sum `reductionValue` where `reductionType === 'fixed'`), deadline warning
- Deadline warning: if ANY program has `applicationDeadline` within 14 days (inclusive) and >= 0 days future
- Status badges: gray (eligible), blue (applied), green (approved+received), red (rejected)
- Footer: "View all subsidies" link to `/budget/subsidies`
- Empty state: `"No subsidy programs found"`

**Integration into DashboardPage**:

- Added state: `invoices: Invoice[]`, `invoiceSummary: InvoiceStatusBreakdown | null`, `subsidyPrograms: SubsidyProgram[]`
- Fetching: `Promise.allSettled` includes `fetchAllInvoices({ pageSize: 10 })` and `fetchSubsidyPrograms()`
- isEmpty logic: invoices card = `invoices.filter(inv => status === 'pending').length === 0`
- Conditional render: `invoiceSummary ? <InvoicePipelineCard ... />` and `<SubsidyPipelineCard ... />`
