---
name: story-2212-new-menu-object-form
description: #2212 New menu / ObjectForm dialog tests - helpers, traps, mutation-script pattern, the open focus-switch defect
metadata:
  type: project
---

- Helper `client/src/test/matchMediaControl.ts` (`installMatchMedia`) drives the 768px ObjectForm container switch; default jsdom matchMedia never matches (= phone Sheet).
- `RecordingRouter` always reports navigationType POP: for dialog-host tests (REPLACE/PUSH/POP-hold) use `MemoryRouter` + a probe with `useNavigationType`.
- Sibling insertion before a component remounts it (index-keyed): put a "late page" AFTER the dialog when testing overlay titles, else the test passes for the wrong reason.
- A `<select>` shows its first option for an unknown value: assert stale-id clearing through form state (disabled Save), not `.value`.
- A discard-confirm assertion must come right after the click; a later Escape closes the confirm and masks a missing busy guard.
- Mutation script: private `mutate.py` + `mutations.json` in the job tmp, backup + sha check per file, jest `--silent`; 92 mutants, 3 left (equivalent: silent flag reset, Vendors reservedParams; real defect below).
- Open defect (it.failing tripwire in ObjectForm.test.tsx): on a 768px container switch the new container's mount focus overwrites `lastFocusedRef`, so only the first field regains focus.
- Heredoc-heavy shell commands and computed args are refused in worktree sessions: write files with the Write tool, run python/lint scripts by literal path.
