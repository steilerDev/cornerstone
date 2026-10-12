---
name: story-2214-account-relayout-tests
description: Story #2214 Account page / DavAccessCard / useDavToken tests - fake-timer count trap, ConfirmDialog opener focus, sandbox command-guard quirks
metadata:
  type: project
---

- `jest.getTimerCount()` is not a reliable "no pending timer" check under fake timers (React adds its own); spy `setTimeout`/`clearTimeout` and assert the 2000 ms id was cleared on unmount.
- ConfirmDialog Cancel refocuses the opener only if the opener was really focused: call `button.focus()` before `fireEvent.click`, otherwise focus falls back to `returnFocusRef` (the h2).
- ProfilePage tests mock `ThemeContext`, `LocaleContext` and `DavAccessCard` by module (DavAccessCard has its own tests); `updateProfile` resolves the user itself, not `{ user }`.
- Surviving mutant: clearing `pendingFocusRef` in `handleGenerate`'s catch is unobservable (equivalent).
- Worktree guard refuses inline `bash`/`sed 'Nr file'`/python heredocs in a compound command: write scripts to the job tmp dir with Write, `chmod +x`, run them directly; use Edit for file changes.
