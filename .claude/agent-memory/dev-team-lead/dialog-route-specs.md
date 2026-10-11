---
name: dialog-route-specs
description: Hazards when speccing URL-backed dialogs over the previous page (EPIC-21 #2212 ObjectForm, BrowserRouter) — background location, host placement vs shell baseline, title re-assert, Back-while-dirty without useBlocker, page shortcuts firing under modals, n arbitration, focus after menu-row unmount
metadata:
  type: feedback
---

Found while speccing #2212 (P1.6, New menu + ObjectForm dialog routes).

1. **The app uses `BrowserRouter`, so `useBlocker` does not exist.** Migrating to a data router moves route errors away from `ChunkLoadErrorBoundary` and breaks `MemoryRouter` hook tests. For "Discard changes?" on Back, hold the form in the host on a POP away while dirty, then `navigate(1)` for Keep editing. Key the form by route id, never by `location.key`.
2. **"Page stays behind" = `<Routes location={display}>` with `state.background`.** Inside those Routes, `useLocation()` is the display location. Anything that needs the real URL (the dialog host, title re-assert) must live outside `<Routes>` or read a real-location context. On a deep link, map the display location to the parent list with **empty search**, or `useTableState` turns pre-fill params into filters. Validate the background with `safeAppPath`, and reject a dialog route as background.
3. **Where the host mounts decides the baseline.** A `.btnPrimary` Save imported into the AppShell closure raises `shell.primaryButtons`. Rendering the host from `App.tsx` (not a screen) keeps it at 0, and the UX line "the shell adds one primary" then needs a Style Guide deviation.
4. **Opening or closing a dialog route does not change the display location,** so page `useDocumentTitle` effects do not re-run after `RouteTitleFallback`'s layout effect. Add the real location key to the hook's deps.
5. **Page `useKeyboardShortcuts` fire while a Modal is open.** `n` on a focused dialog button re-pushed `/new`. Guard on `[aria-modal="true"]`. A shell fallback key needs registry arbitration: the page owner wins, whatever the registration order.
6. **A menu row unmounts before the dialog mounts,** so the dialog's captured opener is `<body>`. Carry `createOpener` in state and fall back to `[data-create-trigger]`.
7. **Verify UX premises about existing pages.** "The diary capture screen already uses areaId and date" was false (route-map `carries` listed them, but the page read neither, and diary entries have no area field). `ConfirmDialog tone="primary"` did not exist, and "pointer open focuses the first row, same as UserMenu" contradicted `OverflowMenu`.
8. **Two stacked focus traps both see one Escape.** Guard the lower container's close with a ref (`confirmOpenRef`), not with state in a closure.

**How to apply:** any story that turns a page into a URL-backed dialog or sheet, adds a global create/search surface, or registers a shell-level single-key shortcut.

Related: [[url-state-specs]], [[page-identity-specs]], [[restructure-baseline-hazards]], [[grammar-component-specs]]
