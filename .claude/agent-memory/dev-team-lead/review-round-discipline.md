---
name: review-round-discipline
description: Reviewing an "all tests passing" handback — re-derive the accepted-deviation list yourself, and treat a green Jest suite as evidence about attributes, not about rendering
metadata:
  type: feedback
---

When a `[MODE: review]` handback arrives with "N/N tests passing" and a list of deviations "already flagged and accepted", verify both claims rather than scoping the review around them.

**Why:** on #2046 the handback was accurate about the tests (441/441 genuinely passed) and still shipped two blocking defects. One was invisible to Jest by construction; the other was inside an item the orchestrator had pre-labelled an accepted edge case. Deferring to either framing would have merged both.

**How to apply:**

- **Re-derive the severity of every "accepted deviation" from the code.** #2046's deviation 3 was described as a narrow latent edge case in column drag-reorder, out of scope per my own spec's "do not add ordering machinery". My spec sentence was about *where a column lands* (cosmetic); the actual defect moved the wrong column and persisted it to the user's server-side preferences, and it hit users with **no** stored prefs — the default state, not an edge. Say plainly when overriding an accepted flag, and say why the original acceptance rested on a different claim.
- **A green Jest suite proves attributes and logic, never rendering.** jsdom applies no CSS module rules; `identity-obj-proxy` resolves classes to literal key names. Assertions on `toHaveAttribute('hidden')` and even jest-dom's `toBeVisible()` (attribute-aware) pass on a CSS-defeated `hidden`. For anything whose contract is *visual*, the authoritative guard is a Playwright assertion — check it exists, check it is not weakened, and require the unit test's header comment to say which half it owns.
- **E2E "collecting cleanly" is not "passing".** `E2E Gates` is main-only, so an E2E failure merges to `beta` green. When E2E has only been collected, read the assertions that cover the riskiest behaviour and predict their outcome by hand. On #2046 that is exactly how the mobile defect was confirmed: S16's `.not.toBeVisible()` was correct and would have gone red in CI.
- **Confirm lint attribution before reporting it.** The repo carries ~58 pre-existing ESLint findings. Lint the file's `HEAD` version and diff the counts rather than reporting the repo total as a PR finding. Also note `npm run lint` is `eslint . && npm run stylelint` — pre-existing eslint errors short-circuit stylelint, so run stylelint directly on the changed CSS.

Related: [[shared-component-extension-specs]]
