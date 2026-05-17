---
name: print-and-i18n-lessons
description: Lessons from re-enabling 8 stale E2E skips in i18n.spec.ts and budget-overview-print.spec.ts (PR #1447, 2026-05-17)
metadata:
  type: feedback
---

## CostBreakdownTable DOM structure: area vs work-item rows

Area rows render names in `<span>` (via `<span>{areaName}</span>`). Work-item rows render names inside `<Link>` → `<a>` (NOT span). When writing row filters:
- Area row: `filter({ has: page.locator('span', { hasText: /^AreaName$/ }) })` — works
- Work-item row: MUST use `filter({ has: page.locator('a', { hasText: /^ItemName$/ }) })` or simply `filter({ hasText: 'ItemName' })` if the name is unique enough
- `breakdownAreaRow(name)` POM helper uses `filter({ hasText: name })` — safe for unambiguous names, breaks for "Keller" vs "Kellerbau"

**Why:** WorkItemRow component renders `<Link to=...>{item.title}</Link>`, which is `<a>`, not `<span>`. Using `locator('span', ...)` on work-item names returns zero elements.

## Budget print: :global(@media print) in CSS Module is silently dropped

`BudgetOverviewPage.module.css` uses `:global(@media print) { :root { --color-bg-primary: #ffffff; } }` — this syntax is NOT supported by PostCSS CSS Modules and is silently dropped from the compiled bundle. The dark mode CSS variable reset was never working. Bug filed as issue #1451.

**Implication for tests:** Cannot test "dark mode CSS vars reset to light in print" via reading `--color-bg-primary` from documentElement — the rule is missing from the bundle. Test remains failing (correctly) until the production CSS is fixed.

## Budget print: throwaway element background-color zeroed by print.css

`client/src/styles/print.css` has `* { background-color: transparent !important }`. This zeroes any `background-color` set on throwaway elements created for CSS variable normalization, making `getComputedStyle(el).backgroundColor` return `rgba(0,0,0,0)` instead of the resolved color.

**Fix:** Read CSS custom properties directly from `documentElement.getPropertyValue('--var-name')` rather than applying them as background-color to a throwaway element. This avoids the `transparent !important` override, but only measures the declared value, not the computed background.

## usePrintExpansion closure bug (production, issue #1450)

`usePrintExpansion` has `[expandedKeys, ...]` in its useEffect dependency array. When `handleBeforePrint` fires `setExpandedKeys(allKeys)`, React re-renders, `expandedKeys` changes, and the effect re-runs. The re-run removes the old handlers (which had `snapshot` captured) and installs new handlers (with `snapshot = null`). When `afterprint` fires, the NEW `handleAfterPrint` runs with `snapshot = null` → state is never restored.

**Fix (for frontend dev):** Store the snapshot in a `useRef` instead of a local variable — refs persist across effect re-runs.

## i18n test isolation: shared admin user locale preference

24 concurrent workers (8 workers × 3 viewport projects) all use the same admin user. The locale preference is a single SQLite row. Any PATCH from any worker overwrites all others' PATCH.

**Working strategy:**
- `afterEach(resetToEnglish)` is FINE — cleanup after each test
- `beforeEach(resetToEnglish)` DOUBLES concurrent PATCH frequency and breaks OTHER tests (e.g. "Key page headings") that rely on the locale being stable during execution. DO NOT add beforeEach resets.
- For tests that need a known English baseline at START, call `setLanguage(page, 'en')` inside the test body, immediately before the navigation that requires it.
- For tests that read server prefs after setLanguage('de'), use `expect.poll()` instead of direct GET → assertion, because a concurrent worker's `afterEach(resetToEnglish)` PATCH can race with the GET.

## i18n locale: page.reload() required after goto() for LocaleContext to re-read localStorage

`setLanguage(page, 'de')` calls `page.goto('/')` + sets localStorage. A SUBSEQUENT `page.goto(ROUTES.home)` is a React Router client-side navigation and does NOT re-initialize `LocaleContext`. To see the German text, call `page.reload()` after `page.goto()`. This is the SAME URL — React Router recognizes the same route and skips remount.

Pattern:
```typescript
await setLanguage(page, 'de');
await page.goto(ROUTES.home);
await page.reload();
await expect(page.getByRole('heading', { level: 1, name: 'Projekt' })).toBeVisible();
```

## "Language preference saved to server" test: expect.poll for locale heading

After `setLanguage('de')` + clearing localStorage + `page.goto('/')`, the app fetches `GET /api/users/me/preferences` asynchronously and calls `setLocale('de')` via `syncWithServer`. This is async. `expect.poll()` is the correct pattern:

```typescript
await expect
  .poll(
    async () => {
      const h1 = page.getByRole('heading', { level: 1 });
      return (await h1.count()) > 0 ? await h1.textContent() : null;
    },
    { timeout: 10000 },
  )
  .toBe('Projekt');
```

## Budget Overview print test: startPrint() timing

`startPrint()` dispatches `beforeprint` then calls `emulateMedia('print')`. The React `usePrintExpansion` hook calls `setExpandedKeys(allKeys)` asynchronously. The `waitForFunction` pattern `section.querySelector('[aria-expanded="true"]')` resolves too early (any expanded row, not specifically the deep Kellerbau row). For deep nesting assertions, either use `waitFor({ state: 'visible' })` on the specific row or a more specific `waitForFunction` condition.
