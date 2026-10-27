---
name: bank-report-specs
description: Hazards found speccing/reviewing EPIC-21 #2243 (P4.11 bank report presets, grouped/paged invoices, Revert submission) — NavAnchor ignores target, ConfirmDialog is danger-only, aria-disabled on shared btn classes is unstyled, revert events need their own batchId, closure measuring
metadata:
  type: feedback
---

Found while speccing and reviewing #2243.

1. **`NavAnchor` + `target="_blank"` still navigates in-app.** It never passes `target` to `useLinkClickHandler`, so the plain left click is intercepted. A new-tab app link is a plain `<a href={useHref(routeUrl(...))} target="_blank" rel="noopener noreferrer">` (uncounted, no destination).
2. **`ConfirmDialog`'s confirm button always composes `btnDanger`**; `tone` has no `primary` branch (Style Guide claims one). Adding a primary branch puts one `.btnPrimary` site in every screen closure that imports ConfirmDialog — all screens sat exactly at baseline, so that is a rise everywhere. Non-destructive confirmations ship danger-styled + UX ack.
3. **`aria-disabled` on `sharedStyles.btnPrimary`/`btnSecondary` looks enabled** (shared CSS styles only `:disabled`; only btnIcon/btnText handle aria-disabled). Every "aria-disabled + aria-describedby" spec must add a local `[aria-disabled='true']` rule plus a hover override (ConfirmDialog.module.css pattern) as a second class — keeps the primary count unchanged.
4. **Events as undo data**: a revert must write its own `batchId` (+ `revertOf`) so it collapses into one History row and can be detected as "reverted"; deposit moves to `pending` write no row by default (ADR-040), so the revert path needs an explicit writeRow exception.
5. **Measure closures with the real analyzer**: `auditClient` from `plan/restructure/scripts/build-baseline.mjs` gives per-screen truth; a hand-rolled closure walk must `path.resolve` every resolved import or it double-counts / misses files.
6. **A type-only `?type=` preset in shared E2E DBs is nondeterministic** when the landing depends on how many sources exist — E2E must mock `GET /api/budget-sources`.

Related: [[grammar-component-specs]], [[restructure-baseline-hazards]], [[system-event-specs]], [[infinite-scroll-consumer-hazards]]
