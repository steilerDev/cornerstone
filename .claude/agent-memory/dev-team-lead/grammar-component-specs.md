---
name: grammar-component-specs
description: Hazards when speccing app-wide interaction components (StatusMenu, UndoToast, ConfirmDialog; EPIC-21 #2209) — closure-counted primary buttons, persistent live regions vs E2E alert locators, portal-scoped CSS vars, textContent-changing a11y suffixes, dry-run delete counts, undo/event-dedup without schema
metadata:
  type: feedback
---

Found while speccing #2209 (P1.3 grammar foundations).

1. **A primary button inside a shared component raises `primaryButtons` on every host page.** `build-baseline.mjs` sums per-file counts over each page's import closure. A UX spec that says "a dialog step doesn't count as the page's primary" is wrong for the analyzer. **How to apply:** use secondary classes inside shared components, and ship a `tone="primary"` branch only with its first adopter (that story owns the baseline effect).
2. **An always-mounted empty `role="alert"` region breaks E2E.** About 15 unscoped `page.locator('[role="alert"]')` / `getByRole('alert')` locators exist, including `toHaveCount(1)`. Use `aria-live="assertive"` with no role for a persistent error region. Never set `aria-atomic="true"` on a persistent `role="status"` (page objects use `[role="status"][aria-atomic="true"]`).
3. **Shell CSS variables do not reach portals.** `--topbar-height` is declared on `.appShell`, so a panel portaled to `body` gets an invalid `calc()`. Size floating panels with the Floating UI `size()` `availableHeight`.
4. **An sr-only suffix inside a status button changes its `textContent`.** That breaks many `toHaveText('Paid')`-style unit and E2E assertions. Put the hint in `aria-describedby` on a `hidden` span beside the button; the name stays equal to the visible label (WCAG 2.5.3).
5. **"Counts that match the server" need a dry-run read.** A DELETE response cannot inform a dialog before the user confirms. Spec one `GET /api/delete-impact/:type/:id` that mirrors each DELETE's cascades and set-nulls. Rows that block a DELETE with 409 are not effects.
6. **ADR-040 W3 cannot read "same user / from→to" from automatic rows before story 2.4** (`created_by` and `metadata` are NULL). An in-process ledger of written status events works without a schema change. Writers that skip some targets (deposit `→pending` writes no row) must still pass through the writer so W3 can retract the earlier event.
7. **Verify UX "server should" questions against code before deciding.** In #2209, future actual dates were accepted and reverse moves kept actual dates; PLAN H4 even relies on the latter. The real bug was elsewhere: not_started→done with a picked end date stamped start = today > end.

8. **A "convert every confirmation" inventory must grep four shapes, not just `role="dialog"`:** `<Modal` with delete, remove or restore titles; overlays with no role (`className={styles.modal}`, 5 on the Task page that the baseline cannot see); inline Confirm/Cancel swaps (`BudgetLineCard`, Purchase dependencies); and `window.confirm`. The Task page cost line had a swap **and** a modal at once (a double confirmation). Also grep the i18n title keys (`deleteTitle|removeTitle|confirmTitle|deactivateModal|restoreModal`). In #2209 the coordinator chose "all of them" over the UX scope (12 + 2 → 37 sites).

9. **Review: a surface that switches roles per step tends to nest non-item content in `role="menu"`.** In #2209 the desktop StatusMenu put its "Now: …" header inside the panel that carried `role="menu"`, while the phone path wrapped only the rows. Spec "the `role="menu"` element contains only menuitems and separators; the header sits outside it (OverflowMenu pattern)" for **every** surface. Also add a `:hover` override to every `aria-disabled` busy rule on composed buttons (shared `btn*:hover:not(:disabled)` still matches).

Related: [[restructure-baseline-hazards]], [[nav-shell-specs]], [[ux-visual-spec-verification]]
