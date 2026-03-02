# EPIC-03 Story Details

## Story 3.1 Schema Design (PR #97 merged)

- 6 tables: work_items, tags, work_item_tags (join), work_item_notes, work_item_subtasks, work_item_dependencies
- FK policies: assigned_user_id SET NULL, created_by SET NULL, all sub-entities CASCADE delete
- Status enum: 'not_started' | 'in_progress' | 'completed' | 'blocked'
- Dependency types: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish'
- Composite PKs: work_item_tags(work_item_id, tag_id), work_item_dependencies(predecessor_id, successor_id)
- Self-reference CHECK constraint prevents circular dependencies at DB level
- 7 indexes for query optimization
- Shared types + pagination wrapper in shared/src/types/

## Story 3.2 CRUD API (PR #98 merged)

- All 11 ACs verified across 44 UAT scenarios, 96 tests (52 service + 44 integration)
- 5 endpoints: POST, GET list, GET detail, PATCH, DELETE with cascades
- Pagination: page/pageSize/totalItems/totalPages
- Filtering: status, assignedUserId, tagId, search (case-insensitive LIKE)
- Tag update: replace all (not merge)
- camelCase properties in API responses
- assignedUser summary: id, displayName, email

## Story 3.3 Tag Management (PR #101 merged)

- All 10 ACs verified, 71 tests (40 service + 31 integration)
- 4 endpoints: POST /api/tags (201), GET (200), PATCH (200), DELETE (204)
- Case-insensitive uniqueness via SQL LOWER()
- Hex color validation at AJV + service level
- Frontend: TagManagementPage, TagPill (WCAG contrast), TagPicker (multi-select)
- Refinement items: missing :focus-visible, delete modal work item count, arrow-key nav

## Story 3.4 Notes & Subtasks API (PR #102)

- All 11 ACs verified, 114 tests (29+42 service, 16+27 integration), 912 total
- Notes: POST/GET/PATCH/DELETE with author/admin authorization
- Subtasks: POST/GET/PATCH/DELETE/reorder with auto sort-order
- Author/admin auth: `note.createdBy !== userId && !isAdmin` pattern
- Reorder: `/reorder` registered before `/:subtaskId` to avoid param collision
- Auto sortOrder: COALESCE(MAX(sort_order), -1) + 1
- Partial reorder allowed (subset of IDs) -- deviates from UAT-3.4-43
- Deleted user graceful handling: createdBy returns null (SET NULL FK)
- No maxLength on note content or subtask title (UAT-3.4-03/26 gap)
- Refinement items: add maxLength validation, decide partial vs full reorder, route-level deleted user test
