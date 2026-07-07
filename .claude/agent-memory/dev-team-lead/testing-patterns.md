---
name: testing-patterns
description: Jest/TS testing gotchas found during review — ThemeProvider vs mocking ThemeContext, JSX.Element typing, dynamic imports, matcher misuse, overly-broad absence regexes.
metadata:
  type: feedback
---

# Testing Patterns (Jest / TS / React)

## React Component Testing: Use ThemeProvider, Not unstable_mockModule

For components that use `useTheme()`, wrap renders in `ThemeProvider` rather than using `jest.unstable_mockModule` to mock ThemeContext. This is the established pattern in `LoginPage.test.tsx`.

Control light/dark mode via localStorage:

```tsx
localStorage.setItem('theme', 'light' | 'dark');
// ThemeProvider reads localStorage on mount
render(
  <ThemeProvider>
    <Component />
  </ThemeProvider>,
);
```

Clean up with `localStorage.clear()` in `afterEach`.

**Do NOT use `jest.unstable_mockModule` for ThemeContext** — it's unreliable (mock registration timing issues in ESM) and unnecessary when ThemeProvider is available.

## Test Type Annotations: Avoid JSX.Element

In test files, `JSX.Element` is not available without importing React. Use `typeof SomeModule.ComponentName` instead:

```tsx
import type * as ComponentTypes from './Component.js';
let Component: typeof ComponentTypes.Component;
```

## Dynamic Imports in Tests: import type vs Dynamic import

- `import type * as Foo from './Foo.js'` is safe at the top of test files — type-only imports do NOT load the module at runtime.
- Use `await import('./Foo.js')` inside `beforeEach` for the actual runtime module load.
- This pattern allows the module to be loaded after any mocks are registered.

## toBeGreaterThanOrEqual: Numbers Only

`expect(str).toBeGreaterThanOrEqual('2026-01-10')` fails TypeScript strict check — the matcher expects `number | bigint`. For date string comparisons, use `.toBe()` or `toMatch()` or compare `>= expected`.

## Test Assertion: Regex Too Broad for Absence Checks

When asserting that a UI element is **absent** via `queryByText(/pattern/)`, ensure the pattern cannot also match other elements (e.g., the document title). Overly broad patterns like `/2025/` will find the year in a title like "Invoice 2025" and fail.

Use anchored or specific patterns:

```tsx
// BAD: too broad, matches title text too
expect(screen.queryByText(/2025/)).not.toBeInTheDocument();

// GOOD: only matches formatted date strings like "Mar 15, 2025"
expect(screen.queryByText(/^[A-Z][a-z]+ \d+, \d{4}$/)).not.toBeInTheDocument();
```
