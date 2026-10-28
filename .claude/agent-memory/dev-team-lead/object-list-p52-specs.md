---
name: object-list-p52-specs
description: Hazards found speccing EPIC-21 #2246 (Purchases, Companies, Milestones on ObjectList) — async chip options vs URL normalisation, chip param reused by a filter def, last-host DataTable features, list-only money figures, one holds-up definition for milestones
metadata:
  type: feedback
---

Found while speccing #2246 (P5.2), the last DataTable list pages.

1. **`normaliseListParams` drops a chip value missing from `config.chips.options`.** Options built from an async fetch (trades) are empty on mount, so a deep link `?tradeId=…` is wiped before they load. Gate the list on the options' first response (outer page component), or keep the value in the options.
2. **A filter def on the chip's own param breaks the chip model.** `setChip('all')` writes `param=all` explicitly, the filter count treats the chip as a filter, `clearSheetFilters` clears the chip. Overflow values belong in the chip config (template `chips.overflow`), not in the Filters panel.
3. **UX "in the template note row" claims can be false.** ObjectList's note row shows only host `note`, searching-all, grouping-unavailable and Clear filters; there is no automatic active-filter chip list.
4. **Migrating the last hosts strands DataTable features** (date/number/entity/string filters, `customFilters`, `onRowClick`) and their E2E specs (`datatable-date-range-picker`, `datatable-ux-fixes`). Inventory host-less features and specs; decide prune vs keep explicitly.
5. **A list's "Expected cost" must come from the money engine.** `totalPlannedAmount` (planned only) differs from engine `cost.expected` once lines are invoiced; footer totals over the filtered set and engine-based range filters force the in-memory list path.
6. **"Holds up" on a non-task subject (milestone) must call `computeHoldsUp`** (`milestone:<id>` node), not `dependentWorkItemCount` (direct only) — the same-label-different-count trap.
7. **UX column trims can drop capmap/defect-pinned capabilities** (Companies Phone + Call is D-34 and MNY-136; Purchases ranges HHI-019..024; milestone linked-tasks filter WRK-074). Diff capmap ids and `defects.json` pins before accepting a UX column/filter list.

Related: [[object-list-adopter-specs]], [[tasks-list-specs]], [[object-list-specs]], [[consistency-test-specs]]
