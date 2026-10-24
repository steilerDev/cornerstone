---
name: object-list-specs
description: Hazards found speccing EPIC-21 #2234 (ObjectList template) — baseline analyzer follows `import type`, searchFields 0→1 on a ReferenceList host, PO rulings that assume page migration, overlapping chip facets, server grouping feasibility
metadata:
  type: feedback
---

Found while speccing #2234 (P4.2).

1. **The baseline analyzer follows `import type` as well.** `useColumnPreferences`, `DataTableHeader`, `DataTableColumnSettings` and `EnumFilter` type-import `DataTable.tsx`. That pulls in its closure: 5 primaries (`BooleanFilter` 3, `DataTablePagination`, `DateRangePicker`) and 1 search field. A new template "built on DataTable primitives" inherits all of that.
   - **How to apply:** measure candidate imports first, with a small script around `analyzeFile` + `resolveImport` (script kept in /tmp, run with node). Then decouple the types, e.g. a minimal structural type in the hook, or extract markup into a file that does not import `DataTable.tsx`.
2. **Adding a search to a shared list component raises `searchFields` on every host screen** (ManagePage 0→1). The comparator already allows one search field on a _new_ screen. Mirroring that rule for existing screens (≤1 = unrecorded) is a principled amendment. Approve it in the spec like the #2192 glossary exemption, and flag it to the owner.
3. **PO rulings may assume the template story migrates the pages** ("route-map carries drop page/pageSize in this PR"). When adopter stories own the pages (P4.6/P5.1/P5.2), list the conflicting items as escalations. Do not silently apply them, and do not silently ignore them.
4. **Chip facets with overlapping predicates** (To pay ⊇ offers with pending deposits): a `GROUP BY status` is wrong. Use one `SUM(CASE…)` pass with an "outside default chip" set, plus an unfiltered pass for the heading's "of m".
5. **"Must work above 100 rows" for a grouping**: check whether the list service already has an in-memory path. `listWorkItems` does, for projected-date sorting, so time-window bucketing costs O(n). Feasibility can be confirmed without escalating.
6. **Removing a row from an offset-paged infinite list skips a server row.** Spec: refresh when `hasMore`, local removal otherwise.

7. **Review round 1 found three gaps the spec left implicit.**
   - The narrow card rendered the title-cell `renderSecondary` as a third line, which breaks "two lines".
   - Pruning the selection when rows left updated only a non-live bar, so nothing was announced.
   - An empty note row on the table surface added an extra flex gap.
   - **How to apply:** spec per surface what each slot renders, and spec that every implicit state change goes through the announcer.

Related: [[detail-template-specs]], [[restructure-baseline-hazards]], [[infinite-scroll-consumer-hazards]], [[shared-component-extension-specs]]
