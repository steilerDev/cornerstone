---
name: object-list-adopter-specs
description: Hazards found speccing the first ObjectList adopter (#2238 Invoices) — template gaps (child title/status cells, All chip count, above-list slot), column prefs vs chip-scoped columns, refresh() clears rows, server work hidden behind "Layers C", retiring the only surface of a figure
metadata:
  type: feedback
---

Found while speccing #2238 (P4.6), the first page on the #2234 template. P5.1 and P5.2 adopt the
same template, so expect the same gaps there.

1. **Template gaps show up only with a real adopter.**
   - Child rows render the title, status and command cells empty, so a child can't carry its own
     label, chip or Mark paid. The fix is optional `renderChildTitle`/`Status`/`Command`.
   - The All chip label is owned by the template, so it has no count (`allLabel`).
   - No slot above the results for a summary strip (`aboveList`).
   - No host text in the note row (`note`).
   - Filter defs each get their own fieldset, so they can't share a "Show only" group
     (`fieldset` grouping).
   - **How to apply:** read `ObjectListRow`/`ObjectListToolbar` against every UX element, before
     assuming the props cover it.
2. **Chip-scoped columns vs `useColumnPreferences`.**
   - The visible set is initialised once, and a stored pref replaces it wholesale. So columns that
     appear later, or keys added after the user saved, stay hidden.
   - Fix: a static column superset with `hiddenColumnKeys`, plus a hook rule: keys absent from the
     stored `order` follow `defaultVisible`.
   - Remap the dialog's indices against the filtered list.
3. **`list.refresh()` clears the items** (`useInfiniteScroll` reset), so after a row action focus
   lands on the h1, not the next row.
   - Use `refreshRows(keys)` instead: re-query with an `ids` filter, then `updateItem` or
     `removeItem`, plus a `pageSize=1` call for fresh counts.
   - Undo may still refresh, because focus is in the toast then.
4. **"Layers: C" hid server work again.** Filters on a batched (100-row) list must run on the
   server, and so must totals of the filtered set. Reclassify to L, backend first.
5. **Retiring a stat card can remove the only UI surface of a figure.**
   - Ready to submit was shown only on the Invoices card until Financing (4.10).
   - **How to apply:** grep `data-figure="<kind>"` before deleting cards, and escalate the interim
     gap.
6. **A sum footer over a status chip is not the figure with the same label.** Σ of the Paid chip's
   rows is not the money service's Paid. Drop the footer, or give it no marker and a different label.

7. **Child cells and fixed-bar fixes drift from the docs (#2238 review).**
   - Child-row cells that show user text (a progress payment's description) need `useUserText()`
     like the parent row; specs list them explicitly, the adopter will not infer it.
   - Changing a shared bar's positioning (SelectionActionBar sticky -> fixed + spacer) leaves the
     Style Guide's component description stale; name the wiki line in the fix spec.

Related: [[object-list-specs]], [[consistency-test-specs]], [[shared-component-extension-specs]], [[infinite-scroll-consumer-hazards]], [[history-page-specs]]
