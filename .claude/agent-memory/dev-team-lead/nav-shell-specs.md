---
name: nav-shell-specs
description: Hazards when speccing shell work (EPIC-21 0.12 sidebar, 1.1 top bar) — capability loss from deleted tabs, NavLink double-highlight, interim views, defect coverage in deleted tests, sticky inside never-scrolling mainContent, shell ARIA selector changes in E2E, shell primary-button closure, breadcrumb portal
metadata:
  type: feedback
---

Found while speccing #2205 (P0.12, sidebar from NavConfig + Phase 0 exit tests).

1. **Deleting a tab row can delete the only entry to a page.** BUDGET_TABS was the only nav entry to Funding sources, Grants and the Bank report; their target parent (Financing) was still `planned`. **How to apply:** for every tab removed, check that the target nav (NavConfig views, `navSections()`) still reaches each tab's route today, not just in the final IA. Stage gaps with data (`interimUntil: RouteId` on the view), like the route map's `stage`/`interim`.
2. **An interim nav view silently changes page identity.** #2202's `isNavView` treats every `views[]` route as a view, which drops the breadcrumb trail and breaks the earlier story's tests. Exclude interim views from page identity explicitly, and test it with a mutation.
3. **`NavLink` prefix matching double-highlights** (section + view). Resolve one active entry from the route map: the parent chain, then `owns` as a fallback for interim aliases. Render `Link` with a computed `aria-current`.
4. **Tests that die with the removed UI may carry defect coverage.** The D-23 "members are not offered Users/Backups" assertions lived in Settings tab-row tests. Move them to the new surface, and keep the defect token.
5. **"Exit test: every X has a test"** needs a registry plus a check that can fail (ids → files containing the token, run inside `plan:check`). An "every page" E2E sweep needs a completeness assertion against the route map.
6. **Sidebar view switches must `replace`, not push.** ADR-038 rule 8 says view changes replace. Tab rows already did. My #2205 spec wrongly said "each sidebar click pushes one entry", and the E2E agent then weakened two earlier-story replace tests to match. **How to apply:** when navigation moves from tab rows to a sidebar, keep `replace` for switches within a section, and push for section changes and for leaving detail pages. Check any test diff that flips `replaceState` to `pushState` against the ADR.
7. **The UX spec said "existing behaviour; keep" for drawer focus, which does not exist.** Verify premises about current behaviour as you would AC premises.

Found while speccing #2206 (P1.1, desktop top bar):

8. **Sticky inside `.mainContent` never sticks.** `.mainContent` has `overflow-y: auto` but never scrolls: `.appShell` has `min-height` and the document scrolls. Any `position: sticky` inside it (incl. page sticky headers) is dead. Put shell chrome in a non-overflow wrapper and E2E-check `boundingBox().y === 0` after scrolling.
9. **Shell-wide ARIA changes break attribute selectors in E2E.** `OverflowMenu` `aria-haspopup="true"`→`"menu"` hit 4 E2E files that use `button[aria-haspopup="true"]`. Grep `e2e/` for the old attribute value, not only labels.
10. **`screens.shell` counts the whole AppShell closure.** The mobile FAB was the shell's one primary button, so "shell contributes no primary button" ACs touch sub-1024 UI too.
11. **UX error states can be unreachable.** `AuthContext.logout()` never rejects, so a log-out failure toast is dead code. Read the context before you spec an error path.
12. **Moving breadcrumbs into a bar:** portal from the single `PageBreadcrumbs` entry point (`useMediaQuery` plus a slot context) so one instance exists. Page-wide breadcrumb counts that are subtracted from `main`-scoped counts (no-tab-rows) go negative.

13. **No interim capability gaps on beta (orchestrator, #2206).** Beta publishes images, so a story that moves controls into desktop-only chrome must keep the old controls on the other viewports. Hide them with CSS `display: none` on a container, never delete them, until the story for that viewport removes them. Exactly one control per action may be accessible per viewport. Spec it up front and do not offer "accept the gap" as an option.

14. **Structural guards from earlier stories catch new shapes.** The #2205 `noTabRows` "copied tab array" detector (two or more objects with `href`/`to` + `label`) flagged the user menu's entry array. Before speccing an array of labelled links, grep the AST guards in `client/src/navigation/*.test.ts` and spec the narrowing up front, e.g. skip `kind: 'link'` menu entries and add a self-test proving real tab rows still fail.

**Why:** each of these would have surfaced late: as a capability-preservation review finding, a broken earlier-story suite, or a silently shrunk defect coverage.

Related: [[page-identity-specs]], [[route-map-staging-specs]], [[restructure-baseline-hazards]]
