# Dev Team Lead Memory

## DELEGATION IS MANDATORY — ZERO EXCEPTIONS

Every production file change MUST go through a Haiku agent (backend-developer or frontend-developer) via the Agent tool.
The orchestrator audits commit trailers after every session. Missing Haiku co-author trailers = work rejected and reset.

Past sessions have violated this rule by:

- Writing "quick fixes" directly (lint, imports, one-liners)
- Fixing CI failures in source code directly
- Applying post-review suggestions directly

Correct behavior for ALL of these: write a spec, launch Haiku agent.

## Effective Spec Patterns

- **Small fix**: "In file X line Y, change A to B because Z"
- **Reference-based**: "Follow the pattern in file X to create file Y with these differences: ..."
- **Full feature**: Files to create, types, signatures, reference files, contract excerpts, verification checklist

## Sandbox Node Module Corruption

The worktree sandbox frequently has corrupted packages. Common symptoms and fixes:

- **ESLint plugin fails**: Copy `node_modules/eslint-plugin-react-hooks` from main project.
- **tsc binary fails** with `SyntaxError: Invalid or unexpected token` in `_tsc.js`: Copy both `tsc.js` and `_tsc.js` from main project's `node_modules/typescript/lib/`.
- **saxes fails**: Copy `node_modules/saxes` from main project.
- **Pattern**: `cp -r /path/to/main/node_modules/<package> /path/to/worktree/node_modules/<package>`

The main project is always at `/Users/franksteiler/Documents/Sandboxes/cornerstone/`.

## Shared Package: Must Compile Before Server Tests

`server/` tests import from `@cornerstone/shared`. The package exports `dist/index.d.ts` (compiled). If `shared/dist/` doesn't exist, server tests fail with TS errors on shared types.

**Fix**: Build shared before running server tests:

```bash
/path/to/main/node_modules/.bin/tsc --project /path/to/worktree/shared/tsconfig.json
```

Or use worktree tsc if not corrupted: `npm run build -w shared`

The pre-commit hook calls `npm run typecheck` which calls `npm run build -w shared` first, so committing will trigger the build automatically.

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

## Commit Strategy: Pre-commit Hook Handles Everything

The pre-commit hook runs lint-staged + typecheck + build + audit automatically. Just `git commit` and the hook validates. Avoid manually running `npm test` or `npm run build` beforehand (per CLAUDE.md policy).

## Nested Claude Sessions: Use Agent Tool, Not CLI

`claude --model haiku ...` fails with "Claude Code cannot be launched inside another Claude Code session." The CLI cannot be used for delegation. Use the **Agent tool** with `subagent_type` and `model: "haiku"` instead — this is how delegation works within Claude Code. Never implement production code directly as dev-team-lead.

## Drizzle-orm sql.join: Available in 0.45.1

`sql.join(items, separator)` is available as a method on the `sql` tagged template function in drizzle-orm 0.45.x (marked as the recommended API in type definitions). Use it for dynamic IN clauses:

```ts
const inList = ids.map((id) => sql`${id}`);
sql`WHERE id IN (${sql.join(inList, sql`, `)})`;
```

## AutosaveIndicator: CSS import from page module

The `AutosaveIndicator` component legitimately imports CSS classes from `WorkItemDetailPage.module.css`. CSS Modules are locally scoped so cross-component class sharing works without leakage. This is intentional — avoid duplicating CSS definitions.

## Test Assertion: Regex Too Broad for Absence Checks

When asserting that a UI element is **absent** via `queryByText(/pattern/)`, ensure the pattern cannot also match other elements (e.g., the document title). Overly broad patterns like `/2025/` will find the year in a title like "Invoice 2025" and fail.

Use anchored or specific patterns:

```tsx
// BAD: too broad, matches title text too
expect(screen.queryByText(/2025/)).not.toBeInTheDocument();

// GOOD: only matches formatted date strings like "Mar 15, 2025"
expect(screen.queryByText(/^[A-Z][a-z]+ \d+, \d{4}$/)).not.toBeInTheDocument();
```

## Prettier: Run from Worktree Directory, Not Root

Prettier must be run from within the worktree directory to use the correct `.prettierrc`. Running from the parent project root uses a different config and may not format correctly (or not format at all for workspace packages).

```bash
# CORRECT: Run from worktree
cd /path/to/worktree && node_modules/.bin/prettier --write client/src/...

# WRONG: Running from parent can use wrong config
cd /path/to/main/project && prettier --write worktree/client/src/...
```

The pre-commit hook (lint-staged) runs Prettier correctly via the hook's CWD. CI also uses the correct path. Only manual formatting runs need the worktree CWD.

## Git Index Corruption Recovery

If `git add` fails with `fatal: index file smaller than expected`:

```bash
rm /path/to/main/.git/worktrees/<worktree-name>/index
git -C /path/to/worktree reset
```

After reset, files show as unstaged modifications and can be `git add`-ed normally.

## See Also

- `debugging.md` (if created) for deeper debugging notes
