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

## Per-Story Review Notes (moved from MEMORY.md 2026-07-07)

- **Story 4.1 (#387)** — PR #396 APPROVED. Architect refined schema: flat planned_cost/actual_cost/notes replaced by `household_item_budgets`/`household_item_notes` tables (mirrors EPIC-05). Extra columns: url, quantity. Category enum expanded to 8. 6 tables in migration 0010. Document link cascade is application-layer (Story 4.2).
- **Story 4.2 (#388)** — PR #397 APPROVED. 5 CRUD endpoints, 90 tests (46 service + 44 route). Search uses `q` param. Vendor summary includes `specialty`. documentLinkService validates household_item entity type.
- **Story 4.5 (#391)** — PR #400 REQUEST CHANGES. AC #11 fail: vendor/URL rows hidden when null instead of "--". AC #6 Notes section N/A — `household_item_notes` needs its own CRUD API (like work_item_notes), none exist yet. Follow-up story needed for HI notes CRUD.
- **Story 4.6 (#392)** — PR #401 APPROVED (round 2). Fixed: budgetSummary in GET detail via getBudgetSummary()/getTotalSubsidyReduction(); confidence margin uses Math.round(...\*100); focus-visible/reduced-motion/aria/touch targets. AC #4 subsidy API uses POST/DELETE per-item (non-blocking deviation from PUT replace-all).
- **Story 4.7 (#393)** — PR #402 REQUEST CHANGES round 1. 9/10 ACs. AC #3 FAIL: linked WI start/end dates rendered as raw ISO on HouseholdItemDetailPage (line 734) instead of formatDate(). Test authorship correct. 57 tests.
- **Story 4.9 (#413)** — PR #414 REQUEST CHANGES round 1. 7/10 ACs. AC #3: error code generic `VALIDATION_ERROR` not `MUTUALLY_EXCLUSIVE_BUDGET_LINK`. AC #6: invoice date not rendered in HI budget invoices. AC #9: no "Linked To" column, no VendorDetailPage change. Migration 0011. Budget overview UNION ALL aggregates WI+HI invoices.
- **Story 4.10 (#415)** — PR #416 APPROVED. All 11 ACs. Replaces `household_item_work_items` with `household_item_deps` (migration 0012). HIs modelled as zero-duration CPM nodes. CRUD on `/api/household-items/:id/dependencies`. Gantt circle markers (amber pending/green delivered). Two non-blocking: AC #5 returns 409 (consistent w/ CircularDependencyError) not 400; AC #6 timeline query filters only on delivery dates.
- **Story 4.11 (#467)** — Inline date/dependency editing on HI Detail Page. Restructures into Details / Dates & Delivery / Dependencies sections; inline autosave for order/actual/earliest/latest delivery dates. Edit page reduced to details-only. Blocked by #391.
- **Story 8.6 (#359, EPIC-08)** — linked as sub-issue, blocked by #391 (detail page).
