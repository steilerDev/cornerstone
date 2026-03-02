# EPIC-03 Refinement Items

Consolidated from PR reviews #97, #98, #101, #102, #103, #104, #105, #106.
Posted as comment on issue #3: https://github.com/steilerDev/cornerstone/issues/3#issuecomment-3914124400

## Summary: 40 items total

- Backend: 11 items (#1-11)
- Frontend: 21 items (#12-32)
- Accessibility: 3 items (#33-35)
- Testing: 3 items (#36-38)
- Documentation/Wiki: 2 items (#39-40)
- Future/informational: 5 items (not numbered, deferred)

## Key Backend Items

- LIKE wildcard escaping in search (PR #98)
- maxLength constraints on notes/subtasks AJV schemas (PR #102)
- Extract shared ensureWorkItemExists helper (PR #102)
- Reconcile dependency error codes with API Contract (PR #103)
- DFS depth/iteration limits for cycle detection (PR #103)
- Populate dependency predecessor dropdown (PR #105)
- Eliminate redundant data fetching on detail page (PR #105)

## Key Frontend Items

- Multi-select for status/tag filters (PR #104, AC gap)
- Replace alert()/confirm() with custom modals (PR #105)
- Modifier key guard on keyboard shortcuts (PR #106)
- Fix menuRef shared across all rows (PR #104)
- Preserve filter/sort state on back navigation (PR #105)

## Blocking item was resolved

- PR #102: Reorder endpoint partial array issue was fixed before merge (subtaskService.ts line 249 now validates length)

## Wiki Updates Needed

- Schema Wiki: created_by nullability (NOT NULL contradicts SET NULL)
- API Contract Wiki: dependency error code nesting pattern, cyclePath vs cycle field name
