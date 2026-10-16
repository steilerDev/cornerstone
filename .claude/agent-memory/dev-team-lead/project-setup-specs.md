---
name: project-setup-specs
description: Hazards found speccing EPIC-21 #2215 (Settings > Project setup, ReferenceList, atomic reorder, entriesLanguage) — suppressed in-use error details, page-served query maps vs plan:check, routeUrl on planned ids, `to` keys in array literals, money labels via glossary-noun interpolation, required shared fields breaking typed test literals
metadata:
  type: feedback
---

Found while speccing #2215 (P1.9). Each one was a premise in the UX or architect contract that the code contradicted.

1. **In-use 409s carry no `details`.** `CategoryInUseError`, `VendorInUseError` and the other in-use classes pass `suppressDetails = true` (#315 hardening). The error handler drops `details`, and the route tests assert that it is undefined. A contract that says "blocked state with counts from `error.details`" is false. Grep `AppError.ts` for `suppressDetails` before you spec any client read of `err.error.details`, and escalate unsuppressing to the owner and security.
2. **A `done` query map must sit on a redirect base.** `build-routes.mjs` rule 4 rejects it on a page. A legacy `?tab=` that the page itself converts becomes `stage: 'interim', interim: 'page'`. Leaving it `planned` breaks E2E `legacy-url-walk` E1b ("planned query maps keep the query intact").
3. **`routeUrl()` only accepts `ServedRouteId`.** `routeUrl('areas')` does not compile while the route is `planned`. Interim-guarded links use `navHref(id)` (a runtime check that throws if unserved) behind `isRouteServed(id)`.
4. **`build-baseline.mjs` counts +1 `destinations` per array-literal object with a `to` property.** That holds anywhere in the closure. The `noTabRows` guard flags arrays of `{href|to, label}` too. Write pointer rows as JSX.
5. **Money-label rises from short per-list titles** ("New cost category"). A per-list `"New {{item}}"` template avoids them: the placeholder is stripped before counting, and the `item` value is the exact glossary form, which is exempt. Keep the templates per list so German gender agrees.
6. **Adding a required field to a shared response type breaks typed test literals.** About 10 `HouseholdSettings` fixtures across report tests fail `tsc` (not Jest). Give QA a grep-derived sweep list.
7. **UX "the dialog Save is not counted" is false again** (see [[grammar-component-specs]] 1). The owner's target "9 → 1" was unreachable: escalate with the closure arithmetic.

**How to apply:** any story that builds a reference or taxonomy list, converts legacy `?tab=` URLs, links to a planned route, or adds a field to a shared settings or response type.

Related: [[restructure-baseline-hazards]], [[route-map-staging-specs]], [[object-home-move-specs]], [[settings-page-relayout-specs]]
