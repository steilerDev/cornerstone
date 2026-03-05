# EPIC-03 UAT Review Learnings (2026-02-16)

## Summary

Reviewed 366 UAT scenarios across 8 stories (#87-#94). 95%+ automatable via unit/integration/E2E tests.

## Automation Feasibility Patterns

### ✅ Fully Automatable (Integration/Unit)

- API endpoints → `app.inject()` tests
- Business logic algorithms → pure function unit tests
- Validation rules → unit tests
- Database constraints → integration tests with temp DB

### 🔵 E2E-Testable (Playwright, owned by qa-integration-tester)

- UI interactions (forms, dropdowns, modals)
- Browser-level keyboard shortcuts
- Accessibility (screen readers, focus indicators)
- URL state persistence (back button, bookmarks)
- Debounce timing

### ❌ Manual-Only (~5%)

- Migration transactional rollback (SQLite guarantees this)
- Browser-specific keyboard layouts
- Permission/filesystem tests (platform-specific)

## Common Clarification Patterns

### Error Body Structure

Always specify exact JSON format:

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human-readable message",
    "details": { "field": "specific error detail" }
  }
}
```

### Case-Insensitive Uniqueness

- Clarify: SQLite `COLLATE NOCASE` on column vs `LOWER()` normalization before insert?
- Example: tag names, user emails

### Date Validation

- Business rule (400 validation error) vs schema constraint?
- Example: `startDate <= endDate` validation

### Transaction Boundaries

- Multi-table operations need atomicity verification
- Example: create work item + assign tags (if tag insert fails, work item rollback?)

### Performance Baselines

Standard targets for EPIC-03:

- List endpoints with 100+ items → < 1s
- Cycle detection with 50+ nodes → < 100ms
- Tag deletion with 100+ work items → < 1s

## Test Coverage Split (EPIC-03)

### Integration Tests (my responsibility)

- API endpoints via `app.inject()`
- Business logic (validation, filtering, sorting)
- Database constraints (FK cascades, CHECK, unique)
- Algorithms (cycle detection)
- Client-side hooks (unit tests with `@testing-library/react`)

### E2E Tests (qa-integration-tester responsibility)

- Browser-level UI interactions
- Forms, dropdowns, modals, date pickers
- Keyboard shortcuts in browser context
- Accessibility features
- Responsive layouts across viewports
- URL state persistence

## Story-Specific Patterns

### #87 (Schema & Migration)

- Schema introspection: query `sqlite_master` for tables/indexes
- FK cascade tests: create related records, delete parent, verify cascade
- CHECK constraint tests: attempt invalid inserts, verify rejection
- Manual: migration rollback (SQLite transaction guarantees)

### #88 (CRUD API)

- All CRUD endpoints testable via `app.inject()`
- Filter/sort/pagination: verify SQL query logic
- Missing scenarios: concurrent updates, transaction isolation, performance with 100+ items

### #89 (Tags API & UI)

- Tag CRUD + case-insensitive uniqueness
- Color validation regex: `/^#[0-9A-Fa-f]{6}$/`
- Missing: color contrast calculation (if implemented), tag deletion performance

### #90 (Notes & Subtasks API)

- Authorization tests: author vs non-author, admin override
- Reorder endpoint: validate all subtask IDs included, no cross-work-item IDs
- Missing: note creation performance, reorder race conditions

### #91 (List Page)

- Integration focus: API query param handling
- E2E focus: filter UI, search debounce, URL state persistence

### #92 (Detail & Edit Page)

- Integration focus: PATCH endpoint logic
- Component tests: optimistic update revert with mocked API
- E2E focus: inline editing flows, dropdowns, date pickers

### #93 (Dependencies API & UI)

- **Highest priority**: Unit tests for cycle detection algorithm
- Test direct cycle, indirect cycle, complex graphs (50+ nodes)
- Test diamond pattern is valid (not circular)
- Missing: dependency type validation, performance with 100+ nodes

### #94 (Keyboard Shortcuts)

- **Unit tests for `useKeyboardShortcuts` hook** (highest priority)
- Test handlers called/not called based on focus state
- Test cleanup on unmount
- E2E focus: browser-level shortcut behavior, cross-browser compatibility

## Key Test File Naming Patterns

### API Integration Tests

- `server/src/routes/<resource>/<operation>.test.ts`
- Examples: `server/src/routes/work-items/create.test.ts`, `server/src/routes/tags/list.test.ts`

### Service Layer Unit Tests

- `server/src/services/<service>.test.ts`
- Examples: `server/src/services/dependencyService.test.ts` (cycle detection)

### Client Hook Unit Tests

- `client/src/hooks/<hook>.test.ts`
- Examples: `client/src/hooks/useKeyboardShortcuts.test.ts`

### Client Component Tests

- `client/src/pages/<page>.test.tsx`
- Examples: `client/src/pages/WorkItemDetailPage.test.tsx` (optimistic updates)

## Next Steps for EPIC-03 Development

1. **UAT validator** incorporates feedback and posts final scenarios to GitHub Issues
2. User reviews and approves UAT scenarios
3. **backend-developer** implements Story #87 (schema foundation)
4. **qa-integration-tester** (me) writes integration tests for Story #87 during implementation
5. Repeat for Stories #88-#94

## Coordination Points with E2E Engineer

- Stories #91, #92, #94 have heavy E2E coverage needs
- I will focus on API/hook unit tests, E2E engineer will cover browser interactions
- Shared responsibility: performance baselines (we measure API, E2E measures page load)
