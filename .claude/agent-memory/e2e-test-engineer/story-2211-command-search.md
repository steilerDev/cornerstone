---
name: story-2211-command-search
description: #2211 command search E2E - CommandSearchPanel POM, spec location, live-run findings (Back reopens palette defect, list-search text collision, pre-existing budget-source-move failure)
metadata:
  type: project
---

**Files:** `e2e/pages/components/CommandSearchPanel.ts` (dialog located by `has: command-search-input`, language neutral;
`search(q)` waits for the matching `/api/search?q=`), spec `e2e/tests/navigation/command-search.spec.ts` (S1-S21),
`AppShellPage.openSearch()`. Palette = Modal from 1024px, full-screen Sheet below (tablet too).

**Facts:** `@responsive` describes also run on desktop - skip with a width>=1024 guard. Sheet header (56px) is the
input row's grandparent; the input row itself is ~21px high. Company page route id is `company` (`vendor` redirects).
Vendor contacts API takes `firstName/lastName` (no `name`). Dark/German use fresh contexts (no preference writes).
The new list "Search everywhere for ..." row repeats typed text: `getByText(<typed>).first()` after `?q=` now hits the
row - scope to `tbody` (fixed in page-identity-tasks E6).

**Defect reported (S6 kept red):** AppShell `searchRequest` keeps its key after choosing a result, so browser Back to
the opener page re-opens the palette with the old query.

**Sandbox:** full-suite desktop run drowns in login 429s (isolated users); run folders per project. `budget-source-move`
"typing the source name" fails on the beta image too (picker portal covers Cancel) - pre-existing.
Write job scripts with the Write tool; heredocs, `&` and for-loops are refused in worktree sessions.
