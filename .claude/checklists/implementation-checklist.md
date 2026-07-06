# Implementation Checklist

Machine-readable checklist of recurring review findings. The dev-team-lead MUST read this before generating specs and include a `## Compliance Checklist` section in every spec output.

This checklist is updated after each epic's lessons-learned sync (see `/epic-close` step 14) and after each fix loop (see `/develop` step 9).

---

## Frontend — Display & Formatting

- [ ] **Null/undefined rendering**: All nullable fields must render a placeholder (e.g., `—` or `N/A`) when null/undefined. Never render empty strings or "null"/"undefined" text.
- [ ] **Date formatting**: Use the project's `formatDate()` / `formatDateTime()` utilities from `client/src/lib/format.ts`. Never use raw `.toLocaleDateString()` or hardcoded date format strings.
- [ ] **Currency formatting**: Use the project's `formatCurrency()` utility. Never hardcode currency symbols or decimal precision.
- [ ] **Number formatting**: Use `formatNumber()` for display. Handle zero, negative, and large numbers explicitly.
- [ ] **Empty states**: Every list/table view must use the shared `EmptyState` component when data is empty. Never show a blank page or raw "No data" text.
- [ ] **Loading states**: Every async data fetch must show the shared `Skeleton` component during loading. Never show a blank container or raw "Loading..." text.
- [ ] **Fraction-to-percent display**: Decimal-fraction constants (e.g. `CONFIDENCE_MARGINS` where `0.2` means 20%) must be multiplied by 100 before percentage display. This is a recurring finding flagged independently by the architect and product owner (e.g. PR #401).

## Frontend — Forms & Validation

- [ ] **Client/server validation parity**: Frontend input constraints (`maxLength`, `min`/`max`, required) must match the backend schema exactly. Recurring mismatches: `maxLength={100}` vs backend 200 (PR #151), frontend allowing `0` where the backend requires `exclusiveMinimum: 0` (PR #153).
- [ ] **Field-level form errors**: Form pages must parse and surface field-level API validation errors next to the offending inputs, not just a generic "Failed to save" banner. This is a recurring pattern in form pages.

## Frontend — Design Tokens & Styling

- [ ] **No hardcoded colors**: All `color`, `background`, `border-color`, `box-shadow` values must use `var(--token-name)` from `tokens.css`. Stylelint enforces this.
- [ ] **No hardcoded spacing**: All `margin`, `padding`, `gap` values must use spacing tokens (`var(--space-*)` or `var(--gap-*)`).
- [ ] **No hardcoded radii**: All `border-radius` values must use `var(--radius-*)` tokens.
- [ ] **No hardcoded font sizes**: All `font-size` values must use `var(--font-size-*)` tokens.
- [ ] **No hardcoded transition durations**: All `transition` duration values must use `var(--transition-*)` tokens (e.g., `--transition-fast`, `--transition-normal`). Never hardcode `0.2s`, `150ms`, etc.
- [ ] **Semantic token usage**: Use tokens for their intended purpose. Hover backgrounds must use `var(--color-bg-hover)`, never `var(--color-border)` or other non-bg tokens as background values.
- [ ] **Dark mode**: All color properties must use CSS custom properties that switch in `[data-theme="dark"]`. Verify no hardcoded `#hex` or `rgb()` values.
- [ ] **No colors in inline style props**: Never put color values (`color-mix()`, `backgroundColor: 'var(--token)'`, etc.) in inline `style` props — inline styles bypass stylelint's token enforcement entirely (recurring: PR #792, PR #1681). Use a CSS-module class, or a `data-*` attribute with a CSS attribute selector for dynamic variants.

## Frontend — Shared Components

- [ ] **Badge usage**: Status indicators must use the shared `Badge` component with appropriate variant maps. Never create inline status pills or colored spans.
- [ ] **Badge variant map completeness**: Every `BadgeVariantMap` entry must include BOTH `label` (translated via `t()`) AND `className` (the CSS module class). A missing `className` leaves the CSS variant rule with no effect (style is dead on arrival); a missing/hardcoded `label` ships untranslated English to users. This is a recurring bug (e.g. PR #1548 shipped `UNASSIGNED_BADGE_VARIANTS` without `className`, so the `.iblUnassigned` rule never applied).
- [ ] **SearchPicker usage**: Entity selection dropdowns must use the shared `SearchPicker` component. Never create custom search dropdowns.
- [ ] **Modal usage**: Dialog overlays must use the shared `Modal` component. Never create custom overlay/backdrop implementations.
- [ ] **Skeleton usage**: Loading placeholders must use the shared `Skeleton` component.
- [ ] **EmptyState usage**: Empty data displays must use the shared `EmptyState` component.
- [ ] **FormError usage**: Error display must use the shared `FormError` component.
- [ ] **No one-off components**: Every new UI component must be designed as a reusable shared component in `client/src/components/`.
- [ ] **Compose shared CSS classes**: CSS utility classes (buttons, modals, loading, empty states, sr-only) must use `composes:` from `client/src/styles/shared.module.css`. Never duplicate shared class definitions.

## Frontend — React Hooks

- [ ] **useEffect resource cleanup**: Any `useEffect` that calls `setTimeout`, `setInterval`, `addEventListener`, or similar must return a cleanup function (`return () => clearTimeout(id)` / `return () => clearTimeout(timer)` / `return () => removeEventListener(...)`). Omitting cleanup causes the ESLint rule `web-api-no-leaked-timeout` to warn and can produce memory leaks and stale callbacks.
- [ ] **No side effects in render**: Avoid `new Date()`, `Math.random()`, or other side effects at the top level of functional components or outside hooks. Move to `useMemo` or `useEffect`. ESLint `@eslint-react/purity` enforces this.

## Frontend — Accessibility & Responsiveness

- [ ] **ARIA labels**: All interactive elements (buttons, links, inputs) must have accessible names via `aria-label`, `aria-labelledby`, or visible text content.
- [ ] **Keyboard navigation**: All interactive elements must be reachable via Tab. Custom widgets must support arrow-key navigation.
- [ ] **Focus-visible styling**: All custom buttons, toggles, and interactive elements must have `:focus-visible { outline: none; box-shadow: var(--shadow-focus); }` styling. This is a recurring review finding — never rely on browser defaults for custom interactive elements.
- [ ] **Focus management**: Modals must trap focus. Dynamic content must manage focus appropriately.
- [ ] **Reduced motion**: Any CSS with `transition` or `animation` must include a `@media (prefers-reduced-motion: reduce) { transition: none; animation: none; }` guard.
- [ ] **ARIA role redundancy**: When using `role="status"`, do not also add `aria-live="polite"` (it is implicit). Use `role="status" aria-atomic="true"` instead.
- [ ] **Touch targets**: All interactive elements must be at least 44x44px on mobile viewports.
- [ ] **Responsive layout**: All pages must adapt to mobile, tablet, and desktop viewpoints using breakpoint tokens.

## Backend — API Conventions

- [ ] **Error response shape**: All error responses must use the standard `{ error: { code, message, details } }` shape.
- [ ] **HTTP status codes**: Use the correct status codes per the API contract (200, 201, 204, 400, 401, 403, 404, 409, 500).
- [ ] **Input validation**: All user inputs must be validated at the API boundary. Return 400 with descriptive error codes for validation failures.
- [ ] **Parameterized queries**: All database queries must use parameterized values. Never interpolate user input into SQL strings.
- [ ] **Wiki documentation**: When adding or changing API endpoints, fields, or query parameters, update `wiki/API-Contract.md` and `wiki/Schema.md` accordingly. This is a recurring architect review finding.
- [ ] **Named error codes from acceptance criteria**: When an AC specifies a custom error code (e.g. `ACCOUNT_DEACTIVATED`, `MUTUALLY_EXCLUSIVE_BUDGET_LINK`), return that exact code via `AppError` with the code set explicitly. Do not use a `ValidationError` subclass that emits a generic `VALIDATION_ERROR` (recurring: PR #56, PR #414).

## Backend — Data Handling

- [ ] **snake_case in DB, camelCase in TS**: Database columns use snake_case; TypeScript code uses camelCase. ORM mapping handles conversion.
- [ ] **Cascade deletes**: When deleting parent entities, ensure child records are cleaned up (via FK cascades or explicit deletion).
- [ ] **Transaction safety**: Multi-step mutations that must be atomic should use database transactions.

## Shared — TypeScript Conventions

- [ ] **Type imports**: Use `import type { Foo } from './foo.js'` for type-only imports (enforced by ESLint `consistent-type-imports`).
- [ ] **ESM extensions**: Include `.js` extension in all import paths.
- [ ] **No `any`**: Avoid `any` types. Use proper typing or `unknown` with type guards.
- [ ] **Strict mode**: All code must compile under `"strict": true` without errors.

## Testing

- [ ] **Test authorship**: Developer agents MUST NOT author tests — the qa-integration-tester writes all unit/integration tests and the e2e-test-engineer writes all Playwright tests. Verify the `Co-Authored-By` trailer on every commit touching test files (recurring BLOCKING finding across 3+ PRs, e.g. PR #152).
- [ ] **Co-located tests**: Test files (`*.test.ts` / `*.test.tsx`) live next to the source files they test, not in separate `__tests__/` directories.
- [ ] **Test file parity**: Every new production file under `server/src/`, `client/src/`, or `shared/src/` must have a corresponding `.test.ts` or `.test.tsx` file. Type-only files (`**/types/**`), re-exports, and configuration files are exempt. The dev-team-lead enforces this during review.
- [ ] **95% coverage target**: New and modified code must meet the 95% unit test coverage target. The QA agent must run each new test file with `--coverage` and verify 95%+ statement coverage before committing.
- [ ] **No mocking of internal modules**: Integration tests should use real implementations where possible. Only mock external services and system boundaries.
- [ ] **E2E route coverage**: Every application route must have at least smoke-level E2E test coverage. The E2E test engineer verifies route coverage as part of every E2E task.
- [ ] **UAT scenarios tagged "Automated (E2E)"**: Every UAT scenario marked as automated must have a corresponding Playwright test before the story is approved — scenario-level coverage, not just route-level (recurring BLOCKING finding, e.g. PR #152, PR #157).
- [ ] **E2E post-mutation assertions**: After actions that trigger a data mutation (clicking a button, selecting a picker item), use Playwright's retrying assertions (`toContainText()`, `toHaveText()`, `toBeVisible()`) rather than reading the DOM immediately with `textContent()` + sync `expect()`. `waitForResponse()` resolves at the network level before React re-renders the DOM — a sync DOM read immediately after it will see stale content.
- [ ] **E2E text locators after label changes**: When a production PR renames a UI label, update all E2E test locators that match that text. Regex locators like `/hide linked/i` silently break when the label changes to "Hide already-linked documents" (no contiguous match). Prefer `data-testid` attributes for stability; when using text regex, keep the pattern broad enough to survive minor rewording (e.g. `/hide.*linked/i`).
- [ ] **E2E canvas interaction coordinates**: When interacting with a Konva `<canvas>` (or any element centered inside a flex container), use `page.locator('canvas').first().boundingBox()` — NOT the parent container's bounding box — to calculate mouse coordinates. A flex-centered canvas occupies only a portion of its parent; coordinates derived from the parent land outside the canvas and Konva's `getPointerPosition()` returns null, silently preventing shape commits.
- [ ] **E2E stale CI (E2E Cache Warmup cancelled)**: If a PR shows "E2E Cache Warmup cancelled" in CI (QG fails even though all test/lint/docker jobs pass), the branch is stale relative to beta. Rebase onto the latest `origin/beta` and force-push to trigger a fresh CI run.
- [ ] **E2E `test.slow()` vs explicit assertion timeouts**: `test.slow()` triples the project-level `expect.timeout` (e.g. 15s → 45s), but an explicit `{ timeout: 15_000 }` override on an individual `expect(...).toBeVisible()` _negates_ that tripling, capping the wait at the literal value. Under heavy parallel CI load this causes intermittent failures even though the app and API are correct. When a test calls `test.slow()`, either omit per-assertion timeout overrides (let the tripled budget apply) or set them to the full tripled value (e.g. `45_000`). Prefer awaiting the gating network response (`waitForResponse` registered _before_ the triggering click) over a fixed wall-clock timeout.
- [ ] **E2E modal interception**: When a feature wraps an existing user interaction inside a new modal (e.g. file selection → "Add photo details" modal before upload), ALL existing E2E tests that exercise the downstream behavior (upload queue, photo card appearance) must be updated to dismiss the modal first. The dev-team-lead must flag this in `[MODE: review]` if affected E2E tests are not updated in the same PR.
- [ ] **E2E locale timing after page reload**: Do not use `page.waitForResponse(GET /api/users/me/preferences)` to gate assertions after `page.reload()` — the response may fire before `reload()` is called (from React's async post-load mounts), leaving the locale update unobserved. Use `await page.waitForLoadState('networkidle')` after `reload()` instead to ensure all async requests, including the preferences fetch, have settled before asserting on locale-dependent UI.
- [ ] **E2E shard redistribution risk**: Adding new spec files (especially `@responsive`-tagged ones with many tests) changes the Playwright shard distribution across all shards. Tests that were in a passing shard may move to a shard where they time out or race differently. After adding new spec files, the E2E test engineer should re-run all shards on a main-targeted PR to confirm no previously-hidden timing failures surface in new shard positions.

## i18n — Translations

- [ ] **No duplicate JSON keys**: Verify no duplicate keys exist in translation JSON files. JSON parsers silently take the last value, which masks missing translations.
- [ ] **English only for dev agents**: Frontend-developer and backend-developer write only English (`en`) locale keys. All non-English translations are handled by the translator agent.
- [ ] **Use `t()` for all user-facing strings**: Never hardcode text in JSX. Use `t('namespace:key')` from react-i18next.
