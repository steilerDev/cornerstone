# Jest/jsdom Test Infrastructure & Mock Patterns (frontend)

The frontend-developer never WRITES tests (QA owns them), but production changes ripple into
existing tests — these notes exist so you can predict the fallout and flag it for QA.

## Test Infrastructure (Jest + jsdom)

- `jest.unstable_mockModule()` for ESM module mocking (before import)
- `import { jest } from '@jest/globals'` — required in ESM mode
- CSS Modules mocked by `identity-obj-proxy` (returns class names as strings)
- `renderWithRouter()` wraps in `MemoryRouter` for isolated route testing (`client/src/test/testUtils.ts`)
- **Sidebar test**: expects exactly 3 buttons (close + ThemeToggle + logout) — updated Story 12.4
- **window.matchMedia polyfill**: Added to `client/src/test/setupTests.ts` — jsdom lacks matchMedia; ThemeContext requires it
- **aria-hidden="true" selector pitfall**: SVG icons also use `aria-hidden="true"`. AppShell overlay uses `data-testid="sidebar-overlay"` to distinguish it
- When a new Context is added, ALL tests that render components using that context must either mock the context or wrap with the provider. ThemeContext is mocked in Sidebar.test.tsx and AppShell.test.tsx.

## WorkItemCreatePage test mock pattern

When a page imports a shared component (e.g. WorkItemPicker) that itself imports from an API module,
the TEST must include ALL functions from that API module in its `jest.unstable_mockModule` mock,
even if the page doesn't use them directly. Otherwise Jest throws "does not provide an export named X".
Example: WorkItemPicker uses `listWorkItems` from workItemsApi — add it to the test mock even if
WorkItemCreatePage only uses `createWorkItem`.

## Test Mock Requirements When Page Imports New APIs

When adding new API imports to a page, update ALL test mock blocks:

1. Add `jest.fn()` declarations for each new function
2. Add to `jest.unstable_mockModule()` factory
3. Add `.mockReset()` in `beforeEach`
4. Add `.mockResolvedValue(...)` defaults in `beforeEach`
   Missing any step causes "does not provide an export named X" or test failures.

WorkItemDetailPage.test.tsx specifically needs mocks for:

- `../../lib/milestonesApi.js` → `listMilestones` default: `[]`
- `../../lib/workItemMilestonesApi.js` → `getWorkItemMilestones` default: `{ required: [], linked: [] }`

## Toast mock pattern

When a page gains `useToast()`, ALL tests rendering that page MUST add:
`jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({ useToast: () => ({ toasts: [], showToast: jest.fn(), dismissToast: jest.fn() }), ToastProvider: ({ children }) => children }))`
See `TimelinePage.test.tsx` for working example.

## Webpack DefinePlugin Globals in Tests

`__APP_VERSION__` (DefinePlugin globals) not available in Jest. Fix: add `globals: { __APP_VERSION__: '0.0.0-test' }` to the `client` project in `jest.config.ts`. Create `client/src/types/globals.d.ts` with `declare const __APP_VERSION__: string;`.
