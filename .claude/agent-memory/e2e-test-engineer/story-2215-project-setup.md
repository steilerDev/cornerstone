---
name: story-2215-project-setup
description: #2215 Settings > Project setup E2E: ProjectSetupPage/ReferenceListControl POM, reorder mocking, anchors, traps found in the live run.
metadata:
  type: project
---

- POM `e2e/pages/ProjectSetupPage.ts`: `ReferenceListControl` per list (`costCategories`, `purchaseCategories`, `orientations`). Row test ids carry the record id, so rows/handles/menus are found by NAME (`Reorder <name>`, `Actions for <name>`); the ⋯ menu is portalled (`getByRole('menuitem')` page-wide). `dialogPanel()` is viewport-dependent (Modal content box >= 768px, Sheet below) so it is a method, not a constructor-time property.
- The three lists are GLOBAL: reorder tests mock list + `PATCH .../reorder` via `e2e/fixtures/referenceListMocks.ts` (records `ids` bodies). One real-backend reorder check uses `toPass` with a retry because another worker's create/delete answers 409 REORDER_SET_MISMATCH.
- Anchors: `#house`, `#cost-categories`, `#purchase-categories`, `#orientations`, `#areas` (interim card), `#trades` (the pointer row itself takes focus). `?tab=` is rewritten by ONE replaceState; a `/budget/categories` redirect now targets `#cost-categories` and the TARGET hash wins over an incoming hash (`resolveRedirect`), so `?q=walk#walk` ends on `#cost-categories`.
- Traps hit: `POST /api/budget-categories` answers `{ budgetCategory }` (household-item-categories answers the bare entity) - the old spec's `body.id` was undefined and leaked rows; the orientations list is below the fold so `page.mouse` drags need `scrollIntoViewIfNeeded()` first; a `li` `hasText: 'Materials'` also matches the English description, so use the name span; announcements read "back at position 1." (no "of N") for cancel but "position 2 of 3" for dropped/position; two `page.goto` in a row right after load can bounce to `/login?next=` (aborted session check) - wait for `main` between them.
- Live run: `build2215e.sh` pattern deletes `*.test.ts(x)` from the build-context copy because other agents' in-flight unit tests can break `tsc` in the image build (not a production problem).
