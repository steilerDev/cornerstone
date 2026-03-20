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

## Frontend — Design Tokens & Styling

- [ ] **No hardcoded colors**: All `color`, `background`, `border-color`, `box-shadow` values must use `var(--token-name)` from `tokens.css`. Stylelint enforces this.
- [ ] **No hardcoded spacing**: All `margin`, `padding`, `gap` values must use spacing tokens (`var(--space-*)` or `var(--gap-*)`).
- [ ] **No hardcoded radii**: All `border-radius` values must use `var(--radius-*)` tokens.
- [ ] **No hardcoded font sizes**: All `font-size` values must use `var(--font-size-*)` tokens.
- [ ] **No hardcoded transition durations**: All `transition` duration values must use `var(--transition-*)` tokens (e.g., `--transition-fast`, `--transition-normal`). Never hardcode `0.2s`, `150ms`, etc.
- [ ] **Semantic token usage**: Use tokens for their intended purpose. Hover backgrounds must use `var(--color-bg-hover)`, never `var(--color-border)` or other non-bg tokens as background values.
- [ ] **Dark mode**: All color properties must use CSS custom properties that switch in `[data-theme="dark"]`. Verify no hardcoded `#hex` or `rgb()` values.

## Frontend — Shared Components

- [ ] **Badge usage**: Status indicators must use the shared `Badge` component with appropriate variant maps. Never create inline status pills or colored spans.
- [ ] **SearchPicker usage**: Entity selection dropdowns must use the shared `SearchPicker` component. Never create custom search dropdowns.
- [ ] **Modal usage**: Dialog overlays must use the shared `Modal` component. Never create custom overlay/backdrop implementations.
- [ ] **Skeleton usage**: Loading placeholders must use the shared `Skeleton` component.
- [ ] **EmptyState usage**: Empty data displays must use the shared `EmptyState` component.
- [ ] **FormError usage**: Error display must use the shared `FormError` component.
- [ ] **No one-off components**: Every new UI component must be designed as a reusable shared component in `client/src/components/`.
- [ ] **Compose shared CSS classes**: CSS utility classes (buttons, modals, loading, empty states, sr-only) must use `composes:` from `client/src/styles/shared.module.css`. Never duplicate shared class definitions.

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

- [ ] **Co-located tests**: Test files (`*.test.ts` / `*.test.tsx`) live next to the source files they test, not in separate `__tests__/` directories.
- [ ] **95% coverage target**: New and modified code must meet the 95% unit test coverage target.
- [ ] **No mocking of internal modules**: Integration tests should use real implementations where possible. Only mock external services and system boundaries.

## i18n — Translations

- [ ] **No duplicate JSON keys**: Verify no duplicate keys exist in translation JSON files. JSON parsers silently take the last value, which masks missing translations.
- [ ] **English only for dev agents**: Frontend-developer and backend-developer write only English (`en`) locale keys. All non-English translations are handled by the translator agent.
- [ ] **Use `t()` for all user-facing strings**: Never hardcode text in JSX. Use `t('namespace:key')` from react-i18next.
