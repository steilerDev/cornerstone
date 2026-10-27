---
name: financing-shared-pieces
description: #2242 Phase B shared pieces (EntityMultiPicker, ObjectHistorySection, GrantChips, FinancingCreateProvider, SourceBudgetLinePanel ref handle) and the lint/React-19 gotchas hit building them
metadata:
  type: project
---

- `EntityMultiPicker` (components/EntityPicker): special options become chips (label from the SpecialOption); grant form maps `NO_CATEGORY_OPTION_ID` to `includesNoCategoryItems`.
- `ObjectHistorySection` takes `entityType`, `entityId`, `revision`, `labels`, `testIdPrefix`; the section id and `${prefix}-show-all` testid derive from the prefix. History URL filter regex in `historyQuery.ts` must list every `HISTORY_OBJECT_TYPES` member.
- `SourceBudgetLinePanel` selection props are now required (no read-only mode); it exposes `ref` (React 19 ref prop, not forwardRef) with `focusFirstCheckbox()`.
- `@eslint-react/set-state-in-effect` is a warning budget item: reset-on-open state uses the "adjust state during render" pattern (`wasOpen`), as in DocumentsPanel `initialView`.
- Provider dialogs (`FinancingCreateProvider`) call the schema hook inside tiny per-kind components, never conditionally.
- Item/area selection in `SourceBudgetLinePanel` uses `TriStateCheckbox` beside plain h3/h4 headings (role=checkbox on containers breaks a11y: children are presentational). The block click convenience returns early on `closest('input, a, button, label')`.
- Orphan i18n sweep: script every leaf key against non-test `ts/tsx` literals plus `${`-prefix and unionKeySet prefixes before deleting (done for `sources.*` / `subsidies.*` in #2242 Phase C).
- Financing page lives in `pages/BudgetSourcesPage/` (baseline: one own `btnPrimary` there); cards are page-local; `data-figure` only in `FinancingSourceCard`.
- Funding source page (#2242 D): lines hook lives in useFundingSourceRecord.ts; SectionCard has no prior adopters, FundingSourceDetailsSection is the first edit-form pattern (draft state + dirty diff + PATCH of changed fields).
