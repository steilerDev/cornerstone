---
name: story-2207-phone-tablet-shell
description: Test patterns and gotchas for the phone/tablet shell (BottomBar, MoreSheet, Sheet, compact TopBar, PageTitle view menu)
metadata:
  type: project
---

Story #2207 (EPIC-21 P1.2a). Patterns that were non-obvious:

- **1024 px switch in tests**: jsdom `matchMedia` never matches, so AppShell renders the compact shell by default. Install a controllable `window.matchMedia` (a `matches` getter plus a listener Set you fire on a simulated resize) to test wide, compact and the resize round trip. `(any-pointer: fine)` is a separate query on the same stub.
- **`jest.resetModules()` + a hook with module-level state** (`useHardwareKeyboard`): RTL registers `afterEach`/`beforeAll` hooks on import, so it cannot be re-imported inside a test ("Hooks cannot be defined inside tests"), and the old RTL would run the fresh hook on a second React copy. Re-import `react` and `react-dom/client` after the reset and render with `createRoot` + `React.act`; unmount every root in `afterEach` or the old module's document listener fires outside `act` and warns.
- **Unserved routes cannot be rendered**: `navHref()` throws for Areas, History and Documents (not served yet), so MoreSheet cannot be given the full `NAV_SECTIONS`. The middle More group is empty today, which doubles as the "empty group renders no list" proof.
- **PageTitle needs a Router even with no view menu** (its hooks are unconditional per spec). `PageLayout.test.tsx` was wrapped in a `MemoryRouter`; the spec's "stays green unmodified" did not hold.
- **Sidebar tests**: the sidebar no longer computes sections, so tests use a `Host` that mirrors AppShell (`navSections` + `resolveNavActive`). `Logo` inside the sidebar still calls `useTheme`, so keep the ThemeContext mock there.
- **History-back rule**: BrowserRouter keeps `history.state.idx`; MemoryRouter does not. Set it with `window.history.replaceState({ idx: 1 }, '')` and restore it afterwards. `useNavigationType()` (`POP` vs `PUSH`) proves back-vs-push through the real shell.
- **Mutation checks** by copying production files to the job tmp dir, editing one line with `sed`, running the suites, then `cp` back and `diff`ing to prove restoration.
- `git status` fails in this worktree (`wiki/.git` not recognized); list changed tests by hand.
- Heredocs, `xargs npx`, and python fed from a heredoc in the same command are refused by the worktree guard: write scripts to the job tmp dir with the Write tool and run them.
- Dark `--color-primary` on `--color-bg-tertiary` is 4.07:1 (below 4.5), the pressed state of the active bottom-bar slot. Fixed by `.slotActive:active { background-color: var(--color-bg-hover) }` (4.94 dark / 4.95 light); `tokenContrast.test.ts` has a plain contrast test and a rule pin, so deleting the rule fails.
- `previousPath` records pathname by `history.state.idx` (a Map), so a replace (view switch) overwrites its own index and never becomes the previous page. MemoryRouter does not write `history.state`, so tests bump `idx` by hand before each navigation.
