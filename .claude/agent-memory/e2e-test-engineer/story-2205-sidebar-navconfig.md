---
name: story-2205-sidebar-navconfig
description: #2205 sidebar-from-NavConfig E2E facts - test ids, POM API, history now pushes, strict-mode collisions, sweep design
metadata:
  type: project
---

Sidebar test ids: `sidebar-section-<navSectionId>` and `sidebar-view-<routeId>`; views exist in the DOM only inside the active section. AppShellPage has `sectionLink/viewLink/openSection/openView/openSidebarIfDrawer/activeEntries/viewLinks/settingsNav`.

- Sidebar links are plain `Link`s: a click PUSHES (old SubNav tab clicks replaced). Tests that said "Back leaves the section" (money E5, tasks E8) now assert one push and Back returns to the previous page.
- Logo aria-label "Go to Home" collides with the 404 page's "Go to Home" link: NotFoundPage POM is scoped to `getByRole('main')`. Any new sidebar label equal to a page link name needs the same scoping.
- Locale-changing assertions live in i18n.spec.ts (dedicated user); the sidebar spec mocks `/api/auth/me` for the member case (no extra login).
- Sweep (`page-identity-sweep.spec.ts`): table keyed by route-map ids, completeness test vs ROUTE_MAP; Home/Companies h1s exempt (#2230/#2213); breadcrumb row present iff non-view page, 404 has none.
- Defect-id tagging: put `D-NN:` at the start of the test title that really fails on the defect; `npm run plan:check` defects part verifies.
