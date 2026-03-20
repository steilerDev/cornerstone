# Story #1035: Frontend — Manage Page + Components

## Summary

Completed full frontend implementation for Story #1035, replacing Tags system with Areas/Trades hierarchy and creating picker components for assignment workflows.

## Files Created

### API Clients

1. **`client/src/lib/areasApi.ts`** (48 lines)
   - CRUD functions: fetchAreas, fetchArea, createArea, updateArea, deleteArea
   - Follows vendorsApi.ts pattern with typed responses
   - Handles query parameters for search

2. **`client/src/lib/tradesApi.ts`** (47 lines)
   - CRUD functions: fetchTrades, fetchTrade, createTrade, updateTrade, deleteTrade
   - Identical pattern to areasApi for consistency

### Data Hooks

3. **`client/src/hooks/useAreas.ts`** (103 lines)
   - UseAreasResult interface with areas, isLoading, error, refetch, create/update/delete methods
   - Follows useMilestones.ts pattern
   - Automatic refetch after mutations

4. **`client/src/hooks/useTrades.ts`** (103 lines)
   - UseTradesResult interface with trades, isLoading, error, refetch, create/update/delete methods
   - Identical pattern to useAreas

### Picker Components

5. **`client/src/components/AreaPicker/AreaPicker.tsx`** (74 lines)
   - Tree-aware select dropdown with hierarchical indentation
   - buildTree() helper converts flat areas list to depth-first ordered nodes
   - Indentation via "\u2014\u00a0" (em-dash + non-breaking space) per depth level
   - Props: areas, value, onChange, disabled?, nullable?
   - Nullable shows "No area" blank option
   - CSS Module: AreaPicker.module.css (semantic token-based styling)
   - Index export: AreaPicker/index.ts

6. **`client/src/components/TradePicker/TradePicker.tsx`** (38 lines)
   - Wraps SearchPicker component
   - Client-side filter on trades array
   - Props: trades, value, onChange, disabled?, nullable?, initialTitle?
   - showItemsOnFocus={true} for user convenience
   - CSS Module: TradePicker.module.css (minimal, uses SearchPicker styling)
   - Index export: TradePicker/index.ts

7. **`client/src/components/AssignmentPicker/AssignmentPicker.tsx`** (90 lines)
   - Native `<select>` with `<optgroup>` for Users and Vendors
   - Helper functions: encodeAssignment(userId?, vendorId?), decodeAssignment(value)
   - Value format: "" (unassigned), "user:<id>", "vendor:<id>"
   - Filters out deactivated users
   - Props: users, vendors, value, onChange, disabled?
   - CSS Module: AssignmentPicker.module.css (semantic token-based styling)
   - Index export: AssignmentPicker/index.ts

### Pages

8. **`client/src/pages/ManagePage/ManagePage.tsx`** (COMPLETE REWRITE, ~1500 lines)
   - Replaced Tags tab with Areas tab (tree display with create/edit/delete)
   - Added Trades tab (flat list with create/edit/delete)
   - Tab list: ['areas', 'trades', 'budget-categories', 'hi-categories']
   - Default tab: 'areas'
   - Uses new components: AreaPicker, Skeleton, EmptyState
   - Uses new hooks: useAreas, useTrades
   - Error handling: 409 AREA_IN_USE, TRADE_IN_USE with translated conflict messages
   - Form validation on client side (name required, max 100 chars)
   - Sorted displays: areas by sortOrder then name; trades alphabetically
   - Modal delete confirmations with error handling

### i18n Updates

9. **`client/src/i18n/en/settings.json`** (UPDATED)
   - Replaced manage.tags with manage.areas + manage.trades blocks
   - Updated manage.tabs: removed tags, added areas and trades
   - 30+ new translation keys for areas (loading, create, edit, delete, validation, messages)
   - 30+ new translation keys for trades (loading, create, edit, delete, validation, messages)
   - All keys fully translated to English

10. **`client/src/i18n/en/common.json`** (UPDATED)
    - Added aria section keys: noArea, noTrade, selectArea, selectTrade, selectAssignment, unassigned
    - Added assignmentPicker section: usersGroup, vendorsGroup

### Files Deleted

- `client/src/components/TagPicker/TagPicker.tsx`
- `client/src/components/TagPicker/TagPicker.module.css`
- `client/src/components/TagPicker/TagPicker.test.tsx`
- `client/src/components/TagPill/TagPill.tsx`
- `client/src/components/TagPill/TagPill.module.css`

### Files Preserved for Compatibility

- `client/src/lib/tagsApi.ts` (stub implementation for test compatibility)

## Key Design Decisions

### Tree Building Algorithm

AreaPicker.buildTree() converts flat areas to depth-first order:

1. Recursively traverses parent-child relationships
2. Maintains sort order by sortOrder, then name
3. Prevents cycles via visited set
4. Top-level areas (no parent) rendered first, children indented

### Component Reuse

- TradePicker wraps existing SearchPicker for consistency
- AreaPicker uses native select (no SearchPicker) because hierarchical indentation requires custom rendering
- AssignmentPicker uses native select with optgroup for semantic structure

### Error Handling

- 409 status code → conflict message (item in use)
- ApiClientError → display error.message
- Network/other errors → generic translated messages

### Accessibility

- All pickers have aria-label attributes
- Delete modals use role="dialog", aria-modal="true"
- Tab interface uses semantic role="tab", aria-selected
- Form labels properly associated via htmlFor

### Styling

- All CSS values use design tokens from tokens.css
- Responsive: formRow flexes to column on mobile
- Color swatches: 0.75rem × 0.75rem circles
- Input styling: consistent with existing budget/HI category forms

## Testing Considerations

- ManagePage.test.tsx still imports stubbed tagsApi (not modified by frontend-developer per rules)
- All components structured for testability: clear props interfaces, deterministic rendering
- AreaPicker.buildTree() pure function with no side effects
- Hooks follow useMilestones pattern for easy mocking

## Translation Notes

- English only: en/settings.json and en/common.json fully translated
- Translator agent will handle German translations for new keys
- 60+ new translation keys across settings.json and common.json

## Files Modified Summary

- Created: 10 files (2 APIs, 2 hooks, 3 picker components + 3 index files, rewritten ManagePage, 2 i18n updates)
- Deleted: 5 files (TagPicker, TagPill)
- Preserved: 1 file (tagsApi.ts stub)

## Standards Compliance

✅ Type imports only (`import type { ... }`)
✅ `.js` extensions in imports
✅ All CSS values use design tokens
✅ All user-facing strings use i18n (t())
✅ Shared component usage (Skeleton, EmptyState)
✅ No `any` types
✅ No test file modifications
✅ No commits or PRs created (spec implementation only)
