---
name: restructure-baseline-hazards
description: EPIC-21 pattern-baseline metrics that a harmless-looking client fix can raise or lower (router Link destinations, hand-rolled dialogs, primary buttons), and how to spec around them
metadata:
  type: feedback
---

`plan/restructure/scripts/build-baseline.mjs` measures per-screen counts over each page's **import closure**. A change in one shared component therefore moves the counts of every screen that imports it.

**Why:** in #2196 (EmptyState reloads the app), the obvious fix `<a href>` → `<Link>` would have added +1 `destinations` to most screens. The analyzer counts only react-router `Link`/`NavLink` JSX tags, so the existing `<a href>` was invisible to it. `plan:check` would have failed late, in CI, with a pure measurement artefact.

**How to apply:**

- Shared component needs in-app navigation without a new destination: keep `<a href>`, add `useHref(to)` + `useLinkClickHandler(to)` in a small inner component (also keeps no-href usage router-free for tests). State this as a spec decision so reviewers don't "fix" it back to `<Link>`.
- Replacing a hand-rolled `role="dialog"`/`aria-modal` with shared `Modal` lowers `handRolledDialogs`; re-baseline with `npm run plan:build` in the same PR.
- `primaryButtons` counts classes whose CSS (or `composes` chain) sets `background: var(--color-primary)`; `btnConfirmDelete`/`btnSecondary` don't count.
- Before speccing any Link/button/dialog swap, grep `analyzeFile` in build-baseline.mjs for what it counts.

Related: [[restructure-i18n-specs]], [[ux-visual-spec-verification]]
