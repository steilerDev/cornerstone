---
name: story-2211-command-search-tests
description: #2211 command search tests - rAF focus-steal across tests, LocaleContext mock, harness shape, helper files, open production defects pinned with it.failing
metadata:
  type: project
---

- `focusPageHeadingWhenReady` keeps a 60-frame requestAnimationFrame loop alive after a test ends and focuses the NEXT test's h1 (body is active), so Enter/keyboard goes to the h1 and navigation "does not happen" (flaky, order dependent). Fix in CommandSearch.test.tsx: spy `window.requestAnimationFrame`, record ids, cancel all in `afterEach`.
- Any test that renders `CommandSearch` needs the LocaleContext mock (`useFormatters` throws without a provider) and, for 401, an AuthContext mock; import the component lazily after `unstable_mockModule`.
- Harness: render `CommandSearch` INSIDE `CommandSearchProvider` (it reads the Paperless base URL from the provider context; outside it the document rows never become links), with `open` derived from `openKey === location.key` like AppShell. `nav-type` can read POP right after Enter: assert history actions with `waitFor`.
- Shared helpers: `client/src/test/commandSearchFixtures.ts` (`enT` with real en/common.json + interpolation, `makeItem/makeGroup/makeResponse`), `client/src/test/shortcutSnapshot.tsx` (registry dump button for page `n` registrations).
- Hook timers: `jest.getTimerCount()` after unmount includes a harness timer; assert timers via spies on setTimeout/clearTimeout instead. Pin 250/200 as literals, tests that import the constants cannot kill a constant mutant.
- Open production defects pinned with `it.failing` tripwires: `findMatchRanges` throws for any astral char (emoji) before a match (chars[] indexed per code point, folded.indexOf per UTF-16 unit); Invoices page `n` ignores `integrationReady` (primary button is disabled while the integration status loads).
- Mutation run: private `mutate.py` + `mutations.json` in the job tmp dir (160 mutants, hash-verified restore).
