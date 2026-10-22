---
name: detail-template-specs
description: Hazards found speccing EPIC-21 #2233 (ObjectHeader, SummaryStrip, ObjectTabs, SectionCard, DocumentsPanel) — className-only primary counting, planned routes in shared panels, no useBlocker, retiring a shared component without a new counted file, portal Escape bubbling, component-vs-adoption scoping
metadata:
  type: feedback
---

Found while speccing #2233 (P4.1).

1. **`primaryButtons` counts only a JSX attribute literally named `className` whose value contains `X.Y`.** A render prop (`primary({ className: styles.primary })`) or a `triggerClassName={…}` prop is invisible, so it would hide a real primary. Spec one module-private polymorphic `PrimaryControl` rendered once with `className={styles.primary}`; its inner JSX uses `className={className}`. Add a static source test asserting exactly one `styles.primary`.
2. **A shared panel that links to a `stage: 'planned'` route** (Documents › Browse all → `documents`, P5.8) must gate the link on `isRouteServed(id)`; the route story then makes it appear with no code change.
3. **The app uses `BrowserRouter`**, so `useBlocker` is unavailable. "Reuse ObjectForm's leave blocker" in a UX spec is a false premise: dirty forms guard `beforeunload` only.
4. **Building a replacement for a component with live consumers**: deleting the old one (and giving hosts an interim trigger) beats leaving both alive for several stories. Two implementations would mean two unlink behaviours (Confirm vs Undo). Count the host page tests that `unstable_mockModule` the old path; QA must repoint them.
5. **Retiring a shared component whose single consumer still needs it**: moving it into a new PascalCase file in a lowercase domain dir (`components/reports/X.tsx`) is a new counted shared component (a rise). Inline it as a non-exported function in the consumer's file and keep its DOM identical for E2E.
6. **React portals bubble synthetic events through the React tree.** A form-level Escape/Enter handler also sees keys from portaled popovers (OverflowMenu, StatusMenu, SearchPicker listbox). Check `formRef.current.contains(e.target)` and `isEscapeHandled(e.nativeEvent)`. Portaled sheet content's React handler runs before the document-level focus trap, so `markEscapeHandled` there works for "Escape goes back one view".
7. **"Components" stories in a phased plan**: check the later stories' ACs (header/strip/tab/height ACs on each page story) before deciding adoption scope. Pixel-height ACs cannot be proven without a page (jsdom has no layout), so hand them to the first adopter's own height AC and say so in the PR.
8. **UX "normalise `?tab=` to the first tab"** rewrites every detail URL on load. Prefer "first tab = no param, unknown param removed with replace".

Related: [[restructure-baseline-hazards]], [[grammar-component-specs]], [[photos-spots-specs]], [[shell-popover-specs]]
