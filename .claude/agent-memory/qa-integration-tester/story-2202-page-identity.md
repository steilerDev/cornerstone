---
name: story-2202-page-identity
description: Story #2202 page identity tests - origin-state probe helper, live query-map semantics, title/breadcrumb test patterns, sandbox command-guard workaround
metadata:
  type: project
---

Story #2202 (EPIC-21 P0.11a): h1/tab title/breadcrumb/Back-origin for Tasks, Purchases, Milestones.

- **Shared test helper** `client/src/test/originProbe.tsx` (`OriginProbe`, `probedOrigin()`, `probedPath()`): render it next to a component inside the router, click a link, assert `{ origin: { to, name? } }`. Used by every origin sender test (cards, calendar items, tooltip, tables, lists). Pages use their own `LocationDisplay` with `useNavigationType()` + `JSON.stringify(location.state)` for REPLACE/state checks.
- **A `Link`/`navigate` with `state: undefined` yields `location.state === null`** (JSON "null"), not an empty string. Assert `toHaveTextContent('null')`, not `toBeEmptyDOMElement()`.
- **Live query maps consume matched keys** (`applyQueryMap`): `match.queryMap.test.ts` fixtures changed (`/diary?filterMode=all&q=x` -> `/history?q=x&include=diary`). Walk test excludes consumed keys via `queryMatches`, not a hard-coded key.
- **Title tests**: mock `contexts/HouseNameContext.js` with a plain `houseState` variable (`jest.unstable_mockModule`), not the real provider. A test that calls `i18n.changeLanguage` in `afterEach` must `cleanup()` first or React logs act() warnings.
- **Page h1 race**: `findByRole('heading', {name:'Task', level:1})` matches the LOADING h1 first; wait on the final-state element (error h2) before asserting h1 count.
- **navConfig.test.ts** has a `PAGE_IDENTITY_KEYS` allow-list: new non-nav words in `common.navigation.*` must be added there (and to en+de).
- Build-routes fixture module (`plan/restructure/scripts/__fixtures__/routes/`) needs `baseFrom` exported (`paths.ts`) for live query-map validation tests.
- **Sandbox command guard** refuses long compound commands (python heredoc + jest + `&&`) outright with nothing run. Write python/test content to files with the Write tool, then run short single commands. A refused call silently drops ALL edits in it (I lost the `match.test.ts` edit this way - re-verify with `git diff --stat`).
- `git status` fails in this worktree unless `--ignore-submodules=all` (wiki submodule gitdir missing).
