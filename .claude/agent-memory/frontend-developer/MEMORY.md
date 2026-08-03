# Frontend Developer Memory

Always-needed rules inline below; everything else lives in the topic files indexed at the bottom.

## CRITICAL: QA Owns ALL Tests

**The frontend-developer MUST NEVER write test files.** This rule has no exceptions.

- `qa-integration-tester` owns unit tests, integration tests, and component tests; `e2e-test-engineer` owns Playwright E2E tests
- Developer agents implement production code only — never `*.test.ts` / `*.test.tsx` files
- Violating this rule causes BLOCKING PR rejection (as happened in PR #152 where frontend-developer wrote 211 tests)
- When UI changes break existing tests (even trivial count updates like 8→9), delegate ALL test fixes to the QA agent
- If you find yourself writing a test file, stop and delegate to the QA agent instead

## Project Structure

- Components: `client/src/components/ComponentName/ComponentName.tsx` + `ComponentName.module.css`
- Pages: `client/src/pages/PageName/PageName.tsx`
- API client: `client/src/lib/apiClient.ts` (get/post/put/del, ApiClientError, NetworkError)
- Auth API: `client/src/lib/authApi.ts`
- Global styles: `client/src/styles/index.css`
- Design tokens: `client/src/styles/tokens.css`
- Test utilities: `client/src/test/testUtils.ts` (renderWithRouter helper)

## Design Tokens (always applies)

- Use semantic tokens in CSS, never raw hex/rgba values — Stylelint enforces this
- Dark mode via `[data-theme="dark"]` block in tokens.css; all color properties must switch
- Verification: `grep -rn '#[0-9a-fA-F]' client/src --include="*.module.css"` must return ZERO results
- Full token catalog, dark-mode conventions, ThemeContext details → `design-tokens.md`

## Build & Quality Gates

```bash
npm run lint            # ESLint (0 errors required)
npm run format:check    # Prettier (all files)
npm run typecheck       # builds shared first, then typechecks server+client
npm test -- --maxWorkers=2  # jsdom OOMs with >2 workers. Single test: add --workerIdleMemoryLimit="256MB" --maxWorkers=1
npm run build           # shared → client (webpack) → server (tsc)
```

Sandbox note: `npm run build` fails in sandbox with AJV `addKeywords` error — pre-existing env issue, not our code. CI passes.

## Responsive Breakpoints

- Mobile: `@media (max-width: 767px)`
- Tablet: `@media (min-width: 768px) and (max-width: 1024px)`
- Desktop: `@media (min-width: 1025px)`
- Touch targets: `min-height: 44px` on mobile/tablet
- Sidebar: static on desktop, fixed + translateX(-100%) on mobile/tablet

## Shared CSS Utilities Module

`client/src/styles/shared.module.css` — composable CSS utility classes. All values use design tokens.
Use CSS Modules `composes` directive to inherit:

```css
.myButton {
  composes: btnPrimary from '../../styles/shared.module.css';
}
```

Available classes: `btnPrimary`, `btnPrimaryCompact`, `btnSecondary`, `btnSecondaryCompact`,
`btnDanger`, `btnConfirmDelete`, `input`, `select`, `textarea`, `modal`, `modalBackdrop`,
`modalContent`, `modalActions`, `card`, `loading`, `emptyState`, `bannerSuccess`, `bannerError`.
NOTE: `--line-height-normal` token does NOT exist — use literal `1.5` in textarea.

## Formatters (always use, never reimplement)

`client/src/lib/formatters.ts` — `formatCurrency(n)` (EUR), `formatPercent(n)`, `formatDate(dateStr, fallback='—')`.
`formatDate` is timezone-safe: splits `YYYY-MM-DD` parts, constructs `new Date(year, month-1, day)`; "Feb 27, 2026" format.
Exception: InvoicesPage/InvoiceDetailPage/VendorDetailPage have LOCAL `formatCurrency` (USD) — do NOT replace with the shared EUR one.

## Refinement Workflow — QA Test Coordination (CRITICAL)

Before changing any public-facing property (aria-label, data-testid, role, DOM structure),
ALWAYS search for existing QA tests that assert on those values:

```bash
grep -r "aria-label\|getByRole\|getByTestId\|toHaveAttribute" client/src/components/<component>/
```

If tests exist, the change is BLOCKED until the QA agent updates tests first.
In a refinement PR, skip items blocked by QA tests and note them in:

1. The commit message ("deferred — blocked by existing QA tests")
2. The PR description ("Deferred items")
3. A PR comment tagged **[frontend-developer]**

Also check before removing exported functions — if any test file imports it,
removing it will fail typecheck. Keep the export and note it as QA-deferred.

## Index — topic files (same directory)

- `design-tokens.md` — open before any styling work: token catalog, 3-layer architecture, dark-mode conventions (PR #126), ThemeContext, dark-mode form-input rules
- `stylelint-setup.md` — how Stylelint enforces token usage; open when a lint error mentions stylelint rules
- `components.md` — open when touching shared components: Logo, NavLink active-state, Sidebar footer, WorkItemPicker, segmented toggle, DependencySentenceBuilder, Toast, BudgetBar/Tooltip, DashboardCard; also records the topic list from a former patterns file that no longer exists
- `budget-invoices.md` — open for budget/invoice/subsidy pages: BudgetSubNav, budget line APIs, invoice CRUD patterns, pipeline dashboard cards
- `gantt-calendar.md` — open for Timeline/Gantt/Calendar/Milestone work: SVG architecture, drag hook (React 19 refs rule), arrow hover, lane allocation, constraints section, related E2E POM layout
- `api-routing.md` — open when calling APIs or navigating: UserResponse/PaginatedResponse shapes, auth routes, dependency direction-swap semantics, navigation origin state
- `i18n-invisible-chars.md` — open before adding an NBSP/invisible char to a locale file: literal-not-escape convention, why grep misses it, how to verify by render, and the identical-looking test failures it causes
- `qa-tripwire-tests.md` — open when a task says a fix will flip an `it.failing` guard: why the flip signal can be swallowed by a shared helper, and what to do instead
- `testing-mocks.md` — open when your change will break existing tests: ESM mock patterns, mock-block update checklist, Toast/context mocks, DefinePlugin globals in Jest
- `git-tooling.md` — open on webpack config changes or git/CI trouble: worktree remotes, object corruption/permission recovery, npm audit policy, Prettier/CI format gap
- `photo-metadata-sidepanel.md` — photo metadata side panel notes (open for photo UI work)
- `story-1035-summary.md` — ManagePage unified tags/categories story notes
- `ISSUE-415-STATUS.md` — household item timeline dependency status notes
