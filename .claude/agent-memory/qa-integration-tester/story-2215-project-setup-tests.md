---
name: story-2215-project-setup-tests
description: #2215 Project setup tests - AJV coercion on reorder, stage-mocking trap for navHref, delete-impact fallback defect, jsdom limits
metadata:
  type: project
---

- Reorder routes run under the app-wide AJV (coerceTypes + removeAdditional): `ids: 'a'` and `[.., 2, ..]` coerce (then 409, not 400) and extra body keys are stripped (200). 400s come only from empty, missing, duplicate, over 500, empty or over-64 ids.
- Faking a route as served: `getRouteEntry` mock does not reach `routeUrl`/`navHref` (they call the shared module's own copy). Also mock `navigation/navActive.js` `navHref` (spread the actual module) when the served branch builds an href.
- Redirect target hash wins over the visitor's fragment (`resolveRedirect`): tests that assert fragment survival (RouteRedirect, legacyUrlWalk) must exempt targets that carry their own `#anchor` (`/budget/categories` -> `#cost-categories`).
- Service-level reorder accepts a duplicate id list whose SET equals the current set (only the route's `uniqueItems` blocks it). Test duplicates at the route.
- Prod defect pinned with `it.failing` in ReferenceList.test.tsx: without `deleteImpactType` the component still calls `useDeleteImpact('orientation', id)`, so deleting a cost/purchase category fetches `/delete-impact/orientation/<id>`.
- jsdom cannot blur a handle when keyed rows move, so the `refocusRef` blur guard in `useReorder` has no killing test (mutant survives); the `confirmOpenRef` guard in the dialog is an equivalent mutant (dirty already true).
- Corrupted test file (NUL tail) once appeared after a sed -i racing a generator; check `wc -c` vs `tr -d '\000'` if a file ends in blanks.
