# Story #471 Dashboard Layout & Data Shell — Test Notes

**Test files**:
- `client/src/components/DashboardCard/DashboardCard.test.tsx` (12 unit tests)
- `client/src/pages/DashboardPage/DashboardPage.test.tsx` (22 integration tests, replaces stub)

## Key Patterns

- **DashboardPage mocks**: 5 API modules + `usePreferences` hook all use `jest.unstable_mockModule`
  (relative paths with `.js`). The hook mock returns a `UsePreferencesResult` shape with `upsert`,
  `remove`, `refresh`, `preferences`, `isLoading`, `error`.
- **usePreferences mock shape**: `upsert: mockFn as unknown as (key: string, value: string) => Promise<void>`
  — needs double cast because `jest.fn<() => Promise<void>>()` doesn't satisfy the typed overload.
- **Loading state count**: 7 skeletons for 7 data-backed cards (budgetOverview maps to 2 cards:
  Budget Summary + Budget Alerts). Quick Actions has no `dataSource`, renders children immediately.
- **Customize dropdown**: uses `role="menu"` on container, `role="menuitem"` on each re-enable button.
  The Customize trigger button has `aria-haspopup="menu"`.
- **Re-enable close pattern**: `setCustomizeOpen(false)` is called inline in the onClick handler
  (not in `handleReEnableCard`) — the dropdown closes immediately on click.

## Bug #712 Filed

`DashboardPage.tsx:200` reads `invoicesResult.value.items.length` but `InvoiceListPaginatedResponse`
uses `.invoices` (not `.items`). The `isEmpty` flag for Invoice Pipeline is always `undefined === 0`
→ false. The invoice card empty state can never trigger. Tests for that empty state are omitted pending fix.

## ApiClientError constructor

`new ApiClientError(statusCode: number, error: ApiError)` — NOT `(error, statusCode)`.
`ApiError` has `{ code: ErrorCode, message: string, details?: Record<string, unknown> }`.
`ErrorCode` uses `'INTERNAL_ERROR'` (not `'INTERNAL'`). Always check `shared/src/types/errors.ts`.
