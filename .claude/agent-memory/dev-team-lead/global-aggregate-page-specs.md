---
name: global-aggregate-page-specs
description: Hazards to pre-empt when speccing a page that aggregates ALL rows of a table (photo spots, dashboards): shared E2E DB, empty-state untestable live, drafts, disabled-at-end focus drop, reused components with hardcoded English
metadata:
  type: feedback
---

When a story adds a page that aggregates every row of a table (e.g. #2162 photo spots across all diary photos), pre-empt these in the spec:

- **E2E runs against one shared DB across workers**, so other specs pollute global counts and rows. Scope assertions to uniquely named fixtures (unique area/orientation names per test) and locate rows/columns by name, never by index or total count. The only way to E2E the "no data at all" empty state is to `page.route`-mock the aggregate endpoint.
- **Decide draft/soft-state inclusion explicitly** and cite precedent (ADR-022: exports filter `status='saved'`; diary drafts are auto-created on first interaction and auto-purged, so their photos are transient).
- **Prev/next with the `disabled` attribute at list ends** drops focus to `<body>` when the focused button disables. Spec a hand-off to the opposite control (or heading) and a Playwright `toBeFocused()`. Spec it as a **`useLayoutEffect`**, not `useEffect`: the browser's focus fixup can run before a passive effect (router navigations commit in a transition), so a passive effect finds `activeElement === body` and bails. jsdom passes either way.
- **A page-level `document` keydown listener (arrows/Escape) must ignore events whose target is outside the component root** (except `body`). AppShell's own Escape closes the ≤1024px sidebar on `document`, so an unscoped viewer Escape also navigates away. Listener order can't be relied on, and AppShell doesn't `preventDefault`.
- **Every state of a full-page route needs the h1**, not only the ready state. A heading passed as a slot into the ready-state component disappears from loading, error, not-found and empty.
- **Reusing an existing component on a new surface re-exposes its latent defects** (e.g. `DiaryEntryTypeBadge` hardcoded English title/aria-label). Under fix-or-block, fold the fix into the spec rather than let a reviewer find it.
- AppShell offers `data-layout="full-height"` on a page root to drop `.pageContent` padding (used by AutoItemizePage). Use it for edge-to-edge viewers instead of negative margins.

**Why:** I found each of these while speccing #2162 (2026-10-01). The E2E-shared-DB and focus-drop classes have both bitten earlier stories ([[infinite-scroll-consumer-hazards]]).

**How to apply:** Any spec for a cross-entity browse/aggregate page or a stepper viewer.
