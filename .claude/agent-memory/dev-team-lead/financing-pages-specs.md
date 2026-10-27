---
name: financing-pages-specs
description: Hazards found speccing EPIC-21 #2242 (Financing, funding source and grant pages) — new-screen ≤1-primary rule forces hosting in existing page dirs, ObjectHeader primary is required, AC fields with no stored column, figure markers that mix count and money, history object types without own events, command-search terms orphaned by interim-view removal, required list-row fields vs typed test literals
metadata:
  type: feedback
---

Found while speccing #2242 (P4.10). Each was invisible in the AC/UX text.

1. **A new `pages/<Dir>` screen may have at most 1 primary and 1 search field over its whole import closure** (`compareBaseline`, "new screen"). `ObjectHeader` (1) + `SectionCard` (1) already make 2, so no detail page can live in a new directory. Host new pages in the directory of the page they replace (Financing + source page in `BudgetSourcesPage/`, grant page in `SubsidyProgramsPage/`) and pre-measure with the scratch `closure.mjs`. Never rename a page dir (removed + new screen).
2. **`ObjectHeader.primary` is required (exactly one).** A UX "no primary on this page" is a false premise; spec a state table (link / forward status via `forwardActionTo` / `useLogPrimary`).
3. **AC fields can have no column.** AC13 asked for a row Edit of "amount covered", but the grant link tables have only the two ids and the story says "no schema change". Escalate (PO) with the computed-figure reading; never invent storage.
4. **A `data-figure` element must hold only the money figure.** UX put "3 · €x" in one marked span; `parseMoney` would read the count's digits. Marker on the amount, count in a sibling testid span.
5. **History object filters assume the subject owns events.** A funding source has none: its bank-report rows are invoice events with `metadata.budgetSourceId`. A new `HISTORY_OBJECT_TYPES` member needs its own filter, batch collapse kept on, `resolveSourceEntity` case and a union i18n key.
6. **Deleting NavConfig interim views orphans command-search terms** (`Funding source`, `Grant`, `Bank report` had former names and resolved only through those views). Add `TERM_EXTRAS` / `TERMS_WITHOUT_DESTINATION` rows in the same step; a new glossary term with `formerly` needs one too.
7. **A required field added to a widely used summary type** (`WorkItemSummary`) breaks dozens of typed test literals under tsc. Use an optional field documented "always sent on list rows".
8. **Route flips live in `shared/` (backend-owned)** and `ATTENTION_LINK_ROUTES satisfies ServedRouteId[]`, so the flip, the attention link switch and the live redirects go in the backend phase, before any FE page work.
9. **A new i18n namespace needs a `de` file that only the translator may write**; a subtree in an existing namespace avoids a cross-agent bootstrap gap.

**How to apply:** any story that builds new object pages, replaces interim nav views, or adds per-subject figures.

Related: [[restructure-baseline-hazards]], [[detail-template-specs]], [[first-detail-page-adopter-specs]], [[money-overview-specs]], [[route-map-staging-specs]], [[related-list-picker-specs]]
