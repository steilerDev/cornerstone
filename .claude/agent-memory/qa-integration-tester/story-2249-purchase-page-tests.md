---
name: story-2249-purchase-page-tests
description: Story #2249 purchase page tests - fixtures, harness traps, product defects found, dead branch
metadata:
  type: project
---

- Fixtures: `client/src/test/purchasePageFixtures.ts` (`makePurchasePage`, `makePurchaseDep`). Run jest from repo root with the scratch helper pattern (`--collectCoverageFrom` per source file, filter the "importing JSON" noise with grep -v).
- A broken import in a production file (lib/actionError.ts used `../../lib/...` after a git mv) surfaces as "Configuration error: Could not locate module ... mapped as $1" in every suite that reaches it. Look at the moved file first.
- A refactor that renames a local (`money` -> `purchaseMoney`) can leave a ReferenceError in a branch only the list endpoint runs; the old listRows/route tests catch it, so run them before trusting new service tests.
- ConfirmDialog opened from the header menu returns focus to the page h1, not the menu trigger (the menu item is unmounted before restore); spec D15 said trigger. Same on every object page.
- A taskOrMilestone option with `kindWord` does not render the milestone's `secondary` date.
- `filterOptionsByLabel` does not trim: a whitespace query hides every milestone while the task search trims.
- RelatedList renders no Add button until rows load, so `grants ?? []` in GrantLinksList (line ~137) is unreachable.
- Visited tab panels stay mounted (ObjectTabs): assert aria-selected, not absence of a previously visited panel.
