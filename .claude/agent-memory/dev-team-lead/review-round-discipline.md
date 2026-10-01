---
name: review-round-discipline
description: Reviewing an "all tests passing" handback — re-derive the accepted-deviation list yourself, and treat a green Jest suite as evidence about attributes, not about rendering
metadata:
  type: feedback
---

When a `[MODE: review]` handback arrives with "N/N tests passing" and a list of deviations "already flagged and accepted", verify both claims rather than scoping the review around them.

**Why:** on #2046 the handback was accurate about the tests (441/441 genuinely passed) and still shipped two blocking defects. One was invisible to Jest by construction; the other was inside an item the orchestrator had pre-labelled an accepted edge case. Deferring to either framing would have merged both.

**How to apply:**

- **Re-derive the severity of every "accepted deviation" from the code.** #2046's deviation 3 was described as a narrow latent edge case in column drag-reorder, out of scope per my own spec's "do not add ordering machinery". My spec sentence was about _where a column lands_ (cosmetic); the actual defect moved the wrong column and persisted it to the user's server-side preferences, and it hit users with **no** stored prefs — the default state, not an edge. Say plainly when overriding an accepted flag, and say why the original acceptance rested on a different claim.
- **A green Jest suite proves attributes and logic, never rendering.** jsdom applies no CSS module rules; `identity-obj-proxy` resolves classes to literal key names. Assertions on `toHaveAttribute('hidden')` and even jest-dom's `toBeVisible()` (attribute-aware) pass on a CSS-defeated `hidden`. For anything whose contract is _visual_, the authoritative guard is a Playwright assertion — check it exists, check it is not weakened, and require the unit test's header comment to say which half it owns.
- **E2E "collecting cleanly" is not "passing".** `E2E Gates` is main-only, so an E2E failure merges to `beta` green. When E2E has only been collected, read the assertions that cover the riskiest behaviour and predict their outcome by hand. On #2046 that is exactly how the mobile defect was confirmed: S16's `.not.toBeVisible()` was correct and would have gone red in CI.
- **Confirm lint attribution before reporting it.** The repo carries ~58 pre-existing ESLint findings. Lint the file's `HEAD` version and diff the counts rather than reporting the repo total as a PR finding. Also note `npm run lint` is `eslint . && npm run stylelint` — pre-existing eslint errors short-circuit stylelint, so run stylelint directly on the changed CSS.

- **Typecheck the workspaces whose test files changed.** On PR #2121 I approved after 416 green Jest tests, and CI's Static Analysis then failed with TS2532 on `mock.calls[0][1]`, because ts-jest does not enforce the strict tsc build. Run `npx tsc --noEmit -p server/tsconfig.json` (and client/shared as touched) before `[MODE: commit]`. In the `/tmp/cs-deps` symlinked sandbox, client tsc reports a spurious TS2883 in `client/src/test/testUtils.tsx` (non-portable inferred type through the symlink). Ignore it; it is environmental.

- **Check typography deliverables by code point, not by eye.** On #2013, the locale data was correct (42 U+201E / 42 U+201C), but the translator's memory note (the AC5 deliverable) stated the rule with U+201D and showed the "ASCII" quote as U+201D. Its index hook used the very mixed form the story removed. A test guards only the locale files, so a wrong memory note would have reintroduced the bug through the next translation. Dump `hex(ord(c))` counts for every file that describes the rule, not just the files the test covers.
- **Prettier-check every staged file before each commit, including `.md` under `.claude/`.** CI's Prettier gate covers `.claude/**`. On PR #2130, my own hand-edited memory file failed Static Analysis while every E2E shard was green. Run `npx prettier --check $(git diff --cached --name-only)` right before `git commit`, not just on the implementers' files.
- **A "stays open on failure" test is vacuous for error UX.** On #2124/#2125 the discard dialog set `deleteError` but never rendered it. QA's failure test asserted only that the dialog stayed open and buttons re-enabled, so it was green on the silent failure. When a dialog/form has a failure path, require the test to assert the visible error text, then require it to assert that a reopened dialog has no stale error.
- **Before "fixing" code to match the wiki, check the tests and history for a deliberate change.** The wiki said automatic diary entries can't be deleted. `diary.test.ts` asserted 204 with a `Story #808` comment, so the wiki was stale. Code that disagrees with the wiki is not automatically the bug.

Related: [[shared-component-extension-specs]]
