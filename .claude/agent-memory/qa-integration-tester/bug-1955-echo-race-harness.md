---
name: bug-1955-echo-race-harness
description: How to build a red-verifiable regression test for a debounce/echo race in a React hook (issue #1955, useColumnPreferences) — echo-on-resolve harness plus mutation probes to prove non-vacuity
metadata:
  type: project
---

Bug #1955: `useColumnPreferences` lost a column when two were enabled >500ms apart — the load
effect re-applied the resolving save's own echoed payload. Fix = local-authority ref guard on the
load effect + a serialized single-writer save queue (`drainSaves`).

## Harness shape that actually reproduces an echo race

**Put the echo on the write's `resolve`, not on the call.** `usePreferences.upsert` does
`await upsertPreference(...)` _then_ `setPreferences(...)`, so the store only publishes the payload
when the request settles. A harness that reassigns the fake store at call time is subtly wrong and
destroys the test's discriminating power: with the queue fix in place, the corrective second write
is issued synchronously in the drain loop right after the first settles, so a call-time echo
overwrites the stale payload _before_ the test's `rerender()` and the assertion then passes even
with the authority guard deleted.

```ts
mockUpsert.mockImplementation((key, value) => {
  const d = createDeferred();
  void d.promise.then(
    () => {
      prefsState = [makePreference(key, value)];
    },
    () => {},
  );
  return d.promise; // hold; test calls writes[n].resolve() / .reject()
});
mockUsePreferences.mockImplementation(() => makeUsePreferencesResult(prefsState));
```

Other essentials:

- `usePreferences` is mocked, so no React state backs `prefsState` — nothing re-renders on its own.
  The test must call `rerender()` (from `renderHook`) to stand in for the re-render the real
  optimistic `setPreferences` causes. **That `rerender()` is the bug trigger.**
- Keep `preferences` identity stable per store version (return `prefsState` itself, not a copy) so
  the load effect's `[preferences, preferenceKey]` deps only fire when the store really changed.
- `renderHook(({pageKey}) => hook(pageKey, COLS), { initialProps: { pageKey } })` so a test can
  `rerender({ pageKey: 'other' })` to exercise key changes.
- An interleaving log (`events.push('call:n' / 'settle:n')`) turns "the later write happened after
  the earlier one settled" into a single `toEqual` — pre-fix it reads `['call:0','call:1','settle:0']`.
- `mockReturnValue` is sugar for `mockImplementation` in jest 30, so an inner `beforeEach` can
  override an outer one's `mockReturnValue` — but `mockReset()` first to be explicit.

## Mutation probes beat reasoning about non-vacuity

Red-verification via `git stash push <prod file>` proves the tests catch the _original_ bug. It does
**not** prove each test guards a distinct part of the fix. Cheap way to prove that: back up the
fixed file, `perl -0pi -e 's/<condition>/<wrong variant>/'`, run, restore from backup, verify md5.
For #1955 (4 probes, each caught by exactly the intended test):

| Mutation                                                           | Tests that fail                              |
| ------------------------------------------------------------------ | -------------------------------------------- |
| authority guard neutered (`false`), queue kept                     | the three >500ms-gap state tests             |
| guard → `isLoaded` ("hydrate once on mount" trap)                  | pre-edit-store-update + pageKey-change tests |
| guard → bare boolean (`current !== null`)                          | pageKey-change test only                     |
| `savePreferences(updated,…)` → `savePreferences(visibleColumns,…)` | fast-coalesce payload test (+5 more)         |

The last one is why asserting the _payload_ (not just the call count) on the rapid-toggle path
matters: the pre-existing count-only test survives that mutation.

## Gotcha: never run repo-wide `npm run format` here

It reformatted 38 unrelated files (CLAUDE.md, agent-memory, shared types…). Scope to touched files:
`npx prettier --write <file>`. Recovery: `git checkout -- $(git status --porcelain | awk '{print $2}' | grep -v <your files>)`.
