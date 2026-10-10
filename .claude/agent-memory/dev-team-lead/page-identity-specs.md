---
name: page-identity-specs
description: Hazards when speccing h1/document.title/breadcrumb/origin-Back work (EPIC-21 0.11a–c) — title effect ordering, views vs Back, origin-state validation, smoke-test title, capmap vs UX retire lists, stale auth after local login, backslash open redirect, tab effects pushing history, static-page origin labels, placeholder money labels
metadata:
  type: feedback
---

Found while speccing #2202 (EPIC-21 P0.11a, page identity for Tasks/Purchases/Milestones).

1. **`document.title` needs an ordering design, not just a hook.**
   - Pages that have not adopted the hook keep the previous page's title.
   - A cleanup that resets the title runs in the passive phase, _after_ layout effects, so it overwrites any fallback.
   - **How to apply:** put a root fallback in a `useLayoutEffect` (keyed on pathname) and the page hook in a `useEffect` with no cleanup. Include `pathname` in the hook's deps, so two objects with the same name still re-assert the title. Write a test with that mutation.
2. **Views must never show the origin Back.** "Show Back when origin ≠ breadcrumb parent" makes every list opened from an object show "Back to ‹object›", because views have no parent. State the rule explicitly; the UX spec only discussed detail pages.
3. **Origin in router state goes into an `href`.** Validate it in one reader: in-app path only, starting with `/`, not `//`, no `\`. Store the label as a name or route, never pre-translated. Derive NavConfig labels at render time.
4. **A browser-title change breaks `smoke.test.ts` `toHaveTitle(/cornerstone/i)`** once a house name shows. The E2E DB is shared, and `settings-manage.spec.ts` sets the name concurrently. Spec a complete `/api/settings` mock or structural title regexes.
5. **Check the capmap `to` before retiring a control the UX spec lists for removal.** HHI-048 keeps "Retry / Back to Purchases" in the error state, while UX §2 said to retire the per-page back links.
6. **UX "keep existing text" can conflict with banned glossary words** (e.g. "Work Item Not Found"). Decide it in the spec, give the reason, and flag it for the ux review.

Found while speccing #2204 (P0.11c, deep links and the auth pages):

7. **Local sign-in leaves `AuthContext.user` stale.** `LoginPage` navigates without `refreshAuth()`. So `RoleGuard` shows "No access" to an admin, and any `useAuth().user` consumer stays idle until a reload. **How to apply:** any spec that makes a post-login landing matter (`?next=`) must refresh auth before navigating, and add an E2E check that deep-links to an admin page.
8. **The server's `isSafeRedirect` accepted `/\host`.** Browsers read the backslash as `//`. The hole was latent until a story started feeding user URLs into it. **How to apply:** use one shared validator (`safeAppPath`) for every redirect, `next` and origin, and pull security review in.
9. **`useEffect(() => setSearchParams(state))` pushes history on mount and on every change** (the D-10 Back trap). **How to apply:** derive the tab from the URL, write it only in the handler with `replace`, and test that `historyAction` is `REPLACE` with an unchanged entry count.

Found while speccing #2203 (P0.11b, Money):

10. **"No label, no Back" silently hides Back for static non-view pages** (bank report, sub-lists). A label registry by route id fixes it. Keep the registry out of `isNavView`, or those pages lose their trail.
11. **Placeholder-only i18n strings shrink under the money-label baseline.** `normalizeLabel` strips `{{…}}`, so `"{{x}}: {{n}} cost lines, {{a}}"` counts as the 3-word label ": cost lines," and is a rise. Check every new aria/label value _after_ placeholder removal.
12. **A page with its own sticky header row** (`display:flex; align-items:center`) needs a column wrapper for breadcrumbs plus h1, or the trail sits beside the title.

**Why:** each of these would have surfaced late, as a reviewer finding or a CI-only failure, after the implementers had copied the spec.

Related: [[restructure-baseline-hazards]], [[route-map-staging-specs]], [[url-state-specs]]
