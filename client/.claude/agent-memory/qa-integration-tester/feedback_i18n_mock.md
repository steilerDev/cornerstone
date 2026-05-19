---
name: i18n-mock-interception-esm
description: jest.unstable_mockModule('react-i18next') does not intercept in this project's local ESM worktree Jest setup — real EN translations are used in jsdom tests
metadata:
  type: feedback
---

`jest.unstable_mockModule('react-i18next', ...)` is included in test files but does NOT intercept
the real module in the local ESM worktree setup. Tests see real EN translation strings.

**Why:** The project uses `--experimental-vm-modules` for ESM Jest. The mock registration may race
with module resolution in the local worktree environment. This works correctly in CI.

**How to apply:**

- Never write assertions that match on raw translation keys (e.g., `t('fontSizeMedium')` → `'fontSizeMedium'`)
- Always use the real EN locale strings: "Font size", "Small", "Medium", "Large", "Extra large", "Stroke width", etc.
- When querying by accessible name that could collide across multiple components (e.g., "Medium" for both stroke and font-size), use `within()` to scope queries to the specific radiogroup.
