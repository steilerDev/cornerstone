---
name: objectlist-adopter-patterns
description: How the first ObjectList adopter (Invoices, #2238) solved chip counts, row refresh and create-flow cycles; reuse for Tasks/Purchases/Milestones/Companies
metadata:
  type: project
---

- Chip counts need `list.filtersActive`, which only exists after `useObjectList`. Pass `useObjectList` a stable base config (plain chip labels, filter defs carrying only param names) and give `ObjectList` a second config with counted labels and the real filter defs (`pages/InvoicesPage/useInvoicesList.ts`).
- Row refresh after a status change: fetch the same query with `ids=<keys>` plus `pageSize=1` for fresh figures; `updateItem` the survivors, `removeItem` one leaver, but call `list.refresh()` when two or more leave (`removeItem` sets `totalItems` from a stale length) or rows remain unloaded. Figures from the refresh are kept in a `{seq, meta}` override valid while `list.fetchSequence` is unchanged.
- A host hook that needs `list.refresh` before the list exists (create flow feeds the filters) gets it through a ref set in an effect (`refreshRef`).
- Child-row testIds: `dataTableTestId(prefix, childId, surface)`; table child cells are the host's own `<td>` classes (ObjectList's cell classes are private).
- Orphan-sweep i18n keys with a node script over all non-test client files (keys are used from several pages); list removed keys for the translator.
