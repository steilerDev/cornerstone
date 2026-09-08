---
name: shared-component-extension-specs
description: What to pre-empt in a spec when a story extends a shared component (DataTable et al.) — the three infrastructure hazards that silently break the consuming page, and the two review findings that survived to round 2 on #2046
metadata:
  type: project
---

Extending a shared component for one page's new mode needs the spec to pre-empt the *host infrastructure*, not just the component's own props. Story #2046 (`DataTable` expandable rows) produced a clean first-pass implementation because the spec named three hazards up front; two further defects still reached review because they were structural, not prop-level.

**Why:** each hazard is invisible at the diff level — the code reads correctly, compiles, and passes Jest. They are found by tracing the value from the control to its consumer, or not at all.

**How to apply:** when a spec adds a page-mode toggle or a mode-scoped column to a `DataTable` page, walk these five explicitly.

## Pre-empt in the spec (all three hit #2046)

1. **`useTableState` sweeps every unknown URL param into `tableState.filters`.** A page-owned mode param (`?openOnly=true`) becomes a phantom filter: forwarded to the API twice, and `hasActiveFilters` turns true, which silently swaps the page's empty state for the generic "no results / clear filters" one. Fix shape: an opt-in `reservedParams?: string[]` on the hook, defaulting to a module-level constant (a fresh `[]` default re-runs the sync effect every render).
2. **`useColumnPreferences` replaces `visibleColumns` wholesale from stored prefs.** Any newly added column key is absent from every existing user's stored set, so a new `ColumnDef` is invisible for everyone who has ever touched column settings. Fix shape: `ColumnDef.alwaysVisible`, merged in `DataTable` — never persisted, so the stored payload never gains a key the user cannot unset.
3. **`fetchAllInvoices`-style API clients whitelist params by name.** A param not in the whitelist is dropped without error and the control does nothing. Grep the control's symbol *outside* its own component before believing it is wired. (`invoicesApi.fetchAllInvoices` already silently drops `amountMin`/`amountMax`/`dateFrom` produced by `toApiParams()` — pre-existing, unrelated to #2046.)

## Found in review, worth spec'ing next time

4. **`hidden={…}` + a layout class on the same element.** See the checklist entry; the `hidden`-not-unmount rule for `aria-controls` targets must always ship with `.thatClass[hidden] { display: none; }`.
5. **A filtered array handed to a child that reports back positions.** `settingsColumns = columns.filter(c => !c.alwaysVisible)` plus an `onMoveColumn(from, to)` that splices the unfiltered `columnOrder` moved the wrong column *and persisted it*. Remap by key. Only reachable for users with no stored prefs — i.e. the default state, not the edge case it looked like.

Related: [[review-round-discipline]], [[story-2046-open-items]]
