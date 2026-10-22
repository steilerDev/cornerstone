---
name: shell-popover-specs
description: Hazards found speccing EPIC-21 #2231 (attention bell popover + shell-level shared state) — rich content in AnchoredPanel (nested popovers, stacked dialogs, toasts), shared-state test-literal breakage, exact-title E2E vs live counts, new components/ dir vs baseline
metadata:
  type: feedback
---

Found while speccing #2231 (P3.4). The UX spec missed all of them.

1. **AnchoredPanel outside-press counts portaled children as outside.** A StatusMenu row inside a panel opens its own portaled AnchoredPanel. A mousedown there closes the outer panel, which unmounts the menu before the click lands. The same happens with a stacked ConfirmDialog (Modal portal) and with the toast Undo button. Exclude `[data-anchored-panel]`, `[aria-modal="true"]` and `[data-toast-container]` from outside presses.
2. **A non-trapping AnchoredPanel inside a trapping one: Escape closes both.** The trap and the panel's document listener both fire. Use a capture-phase listener that marks the event handled (a WeakSet in useFocusTrap), and make the trap skip events marked handled.
3. **The popover z-index (`--z-modal + 100`) sits above every dialog.** A ConfirmDialog opened from inside the panel renders _under_ it. For a panel that hosts dialogs, use a `layer="dialog"` mode on `useDialogLevel`.
4. **Lifting a hook into a provider: don't add required members to its result type.** Section tests build `UseAttentionResult` literals, so a required member breaks tsc in unmodified tests. Put the new members on the provider's extended type.
5. **Live counts in `document.title` break exact-title E2E**: smoke, page-identity-sweep and page-identity-tasks assert `^Home · …`, and the shared E2E DB has attention rows. The same goes for exact accessible names (`name: 'Needs attention', exact: true`). Grep `toHaveTitle` and `exact: true` for the page or control.
6. **New `components/X/X.tsx` = a baseline rise** unless it is in allowedAdditions. Put small family members in an existing folder (`components/Badge/CountBadge.tsx`).

**How to apply:** any popover that hosts rows with actions, any shell-level shared state, any count put into a title or accessible name. Related: [[grammar-component-specs]], [[home-page-specs]], [[integrations-page-specs]], [[page-identity-specs]]
