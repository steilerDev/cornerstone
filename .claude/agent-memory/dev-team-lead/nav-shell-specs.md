---
name: nav-shell-specs
description: Hazards when speccing the sidebar/tab-row removal (EPIC-21 0.12) and epic exit tests — capability loss from deleted tabs, NavLink double-highlight, interim views vs page identity, defect coverage moving with deleted tests, every-page sweeps
metadata:
  type: feedback
---

Found while speccing #2205 (P0.12, sidebar from NavConfig + Phase 0 exit tests).

1. **Deleting a tab row can delete the only entry to a page.** BUDGET_TABS was the only nav entry to Funding sources, Grants and the Bank report; their target parent (Financing) was still `planned`. **How to apply:** for every tab removed, check that the target nav (NavConfig views, `navSections()`) still reaches each tab's route today, not just in the final IA. Stage gaps with data (`interimUntil: RouteId` on the view), like the route map's `stage`/`interim`.
2. **An interim nav view silently changes page identity.** #2202's `isNavView` treats every `views[]` route as a view, which drops the breadcrumb trail and breaks the earlier story's tests. Exclude interim views from page identity explicitly, and test it with a mutation.
3. **`NavLink` prefix matching double-highlights** (section + view). Resolve one active entry from the route map: the parent chain, then `owns` as a fallback for interim aliases. Render `Link` with a computed `aria-current`.
4. **Tests that die with the removed UI may carry defect coverage.** The D-23 "members are not offered Users/Backups" assertions lived in Settings tab-row tests. Move them to the new surface, and keep the defect token.
5. **"Exit test: every X has a test"** needs a registry plus a check that can fail (ids → files containing the token, run inside `plan:check`). An "every page" E2E sweep needs a completeness assertion against the route map.
6. **The UX spec said "existing behaviour; keep" for drawer focus, which does not exist.** Verify premises about current behaviour as you would AC premises.

**Why:** each of these would have surfaced late: as a capability-preservation review finding, a broken earlier-story suite, or a silently shrunk defect coverage.

Related: [[page-identity-specs]], [[route-map-staging-specs]], [[restructure-baseline-hazards]]
