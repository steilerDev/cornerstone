---
name: documents-page-specs
description: Hazards found speccing/reviewing EPIC-21 #2252 (Documents page) — ObjectList closure counts 2 primaries (Filters count bubble span), required ObjectList primary, last planned route id breaks planned-id tests and strands isRouteServed guards, planned conditional rule beside the page, paperlessStatusNeeded flips shell fetch, sortBy vs sort carries, dead consumer side of a removed interim mapper
metadata:
  type: feedback
---

Found while speccing #2252 (P5.8).

1. **A new `pages/<Dir>` built on `ObjectList` measures `primaryButtons: 2`**: the header primary plus `<span className={shared.filtersToggleCount}>` in `ObjectListFiltersPanel` (CSS `background-color: var(--color-primary)` matches `isPrimaryClass` on any element). HistoryPage's 1 is the same bubble. Specced a counter fix (primary only on `button`/`a`/`input`/components; counts only drop). Pre-measure with a scratch closure script importing `analyzeFile`/`resolveImport` from `build-baseline.mjs`.
2. **`ObjectList`/`ObjectListHeader` `primary` was required.** A list page without a create action needs the prop made optional (PO: extend the template, no dummy).
3. **When the last planned route id is flipped, "planned id" tests have nowhere to move**: `routeUrl.test.ts` `@ts-expect-error routeUrl('<planned>')` becomes an unused directive (tsc error), runtime planned cases need a mocked route map, `legacy-url-walk` E1b and `searchDestinations.test` assert `planned.length > 0`. Check `ROUTE_MAP` for remaining planned ids before telling QA to "move the example".
4. **A gated page's conditional redirect rule is a separate route-map entry with its own `stage`** (`/documents (Paperless off)` was planned). Flip both or `liveConditionalRules(id)` is empty and the gate never redirects.
5. **Serving the first Paperless-gated nav route makes `paperlessStatusNeeded()` true**: AppShell fetches `/api/paperless/status` on every mount; shell unit tests need the API mocked; E2E specs mocking "configured" now see the nav item.
6. **ObjectList URL params are `sortBy`/`sortOrder`**; UX/PO "sort/order" carries must follow the template.
7. **Interim mappers pinned by tests** (`searchResultTarget` paperless_document → external, INTERIM PIN) flip with the route, and their plumbing (base-URL context) becomes dead — delete it.
8. **Deleting an interim mapper's producer leaves its consumer side dead** (review round): the `SearchResultTarget` `kind: 'external'` variant, its row branch/glyph, the `newTabHintId` hidden span in `CommandSearchBody` and the `commandSearch.opensInNewTab` key (en + de). Inventory the render/type/hint/i18n side in the spec, not only the plumbing that feeds it.
9. **With no planned id left, `isRouteServed` guards in `navConfig.ts` become unreachable against the real map.** Keep them (future planned ids, nav must never show/fetch for an unserved route) and cover them with a patched `isRouteServed` (`navConfig.interim.test.ts` precedent) — don't let QA just drop the case.
10. **RelatedList copy is fixed** ("Remove", "‹t› removed from ‹list›."); unlink semantics need optional `removeLabel`/`removedMessage` props. `EntityPickerDialog` closes on pick with no error slot — use RelatedList `kind: 'picker'` + inline EntityPicker + FormError when the AC wants the server refusal inline.

11. **A new always-on shell fetch breaks call-index E2E mocks** (CI round 1): once AppShell fetches `/api/paperless/status` on mount, mocks that answer by call number (`calls === 1 ? configured : off`, `probes === 1 ? fail : gated success`) hand call 1 to the shell, so the page gets the wrong body or hangs. Grep `e2e/tests` for counters on the same route when a shell/global fetch is added; switch them to a flag flipped after the page has loaded.
12. **A conditionally mounted `SidePanel` loses focus return below 1440 px**: its `Sheet` path restores focus only on an `open` true→false transition, never on unmount (docked path focuses in `dismiss`). Unit tests at jsdom width miss it; E2E tablet/mobile catch it. Use `Sheet`'s `restoreFocusOnUnmount` (+ `skipOpenerRef`) or keep the panel mounted.
13. **ObjectList's title column is never sortable** (plain `<th>`); only `columns[]` with `sortValue` render header buttons. A "column header sort" AC/E2E must name a `sortValue` column.

Related: [[area-page-specs]], [[object-list-specs]], [[route-map-staging-specs]], [[restructure-baseline-hazards]]
