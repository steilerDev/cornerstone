# EPIC-04: Household Items & Furniture Management -- Planning Notes

## Stories

| #   | Issue | Title                                           | Priority    | Status  | Depends On       |
| --- | ----- | ----------------------------------------------- | ----------- | ------- | ---------------- |
| 4.1 | #387  | Household Items Schema & Migration              | Must Have   | Todo    | (none)           |
| 4.2 | #388  | Household Items CRUD API                        | Must Have   | Todo    | #387             |
| 4.3 | #389  | Household Items List Page                       | Must Have   | Backlog | #388             |
| 4.4 | #390  | Household Item Create & Edit Form               | Must Have   | Backlog | #388             |
| 4.5 | #391  | Household Item Detail Page                      | Must Have   | Backlog | #388             |
| 4.6 | #392  | Household Items Budget Integration              | Must Have   | Backlog | #387, #388       |
| 4.7 | #393  | Work Item Linking for Installation Coordination | Must Have   | Backlog | #387, #388, #391 |
| 4.8 | #394  | Responsive & Accessibility Polish               | Should Have | Backlog | #389, #390, #391 |

Story 8.6 (#359, EPIC-08) is also a sub-issue of EPIC-04, blocked by #391 (detail page).

## Dependency Chain

```
4.1 (schema) ─── > 4.2 (CRUD API) ──┬─> 4.3 (list page) ───────┬─> 4.8 (polish)
                                     ├─> 4.4 (create/edit form) ─┤
                                     ├─> 4.5 (detail page) ──────┤
                                     │                           └─> 8.6 (doc linking)*
                                     ├─> 4.6 (budget integration)
                                     └─> 4.7 (work item linking, also needs 4.5)
```

## Key Design Decisions

1. **Distinct entity**: Household items are NOT work items (Section 5, Key Decisions). Separate table, separate routes, separate pages.
2. **Shared resources**: Reuses existing `tags` table (new junction `household_item_tags`), existing `vendors` table, existing budget categories/sources/subsidies.
3. **Budget pattern**: `household_item_budgets` mirrors `work_item_budgets` exactly (same columns, same confidence enum, same FK pattern).
4. **Work item linking**: M:N junction table `household_item_work_items` for coordination. Informational relationship, NOT a scheduling dependency in the Gantt engine.
5. **Purchase status workflow**: not_ordered -> ordered -> in_transit -> delivered (4 states, no backward transitions enforced at DB level).
6. **Category enum**: furniture, appliances, fixtures, decor, other.
7. **Room**: Free-text field (no predefined enum). Dynamic filter populated from distinct values.
8. **Document linking**: Already supported via EPIC-08's `document_links` table with `entity_type='household_item'`. Story 8.6 handles the UI.
9. **Budget overview integration**: Story 4.6 ensures household item budget lines contribute to project-wide totals (category sums, source usage, overall budget).

## Requirements Coverage

| Requirement Section                      | Covered By                 |
| ---------------------------------------- | -------------------------- |
| 2.3 Item Management                      | 4.1, 4.2, 4.3, 4.4, 4.5    |
| 2.3 Budget Integration                   | 4.6                        |
| 2.3 Timeline Integration (data model)    | 4.7                        |
| 2.3 Timeline Integration (visualization) | EPIC-06 (future extension) |
| 2.3 Document Links                       | 8.6 (#359, EPIC-08)        |
| 4 User Stories - track purchases         | 4.2, 4.3, 4.4, 4.5         |
| 4 User Stories - delivery dates          | 4.2, 4.4, 4.5              |
| 4 User Stories - link to work items      | 4.7                        |
| 4 User Stories - link documents          | 8.6                        |
| 4 User Stories - timeline delivery dates | EPIC-06 extension          |
| 5 Key Decisions - NOT work items         | All (separate entity)      |

## Acceptance Criteria Counts

- Story 4.1: 8 ACs, 9 UAT scenarios
- Story 4.2: 10 ACs, 17 UAT scenarios
- Story 4.3: 11 ACs, 13 UAT scenarios
- Story 4.4: 12 ACs, 13 UAT scenarios
- Story 4.5: 12 ACs, 15 UAT scenarios
- Story 4.6: 10 ACs, 12 UAT scenarios
- Story 4.7: 10 ACs, 11 UAT scenarios
- Story 4.8: 12 ACs, 13 UAT scenarios
- **Total**: 85 ACs, 103 UAT scenarios
