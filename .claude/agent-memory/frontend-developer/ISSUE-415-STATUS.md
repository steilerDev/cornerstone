# Issue #415 - Household Item Timeline Dependencies Implementation Status

## Completed

### Production Code (Ready for Commit)

1. **GanttChart.tsx** (from earlier session)
   - Added HI rendering with circles (not bars)
   - Full event handling (mouse/keyboard)
   - Complete integration with unifiedRows pattern

2. **GanttArrows.tsx** (just completed)
   - hiArrows useMemo computing arrows from WI/milestone to HI circles
   - Full JSX rendering with hover/focus support
   - Connected IDs properly set for highlighting

3. **GanttSidebar.tsx** (just completed)
   - UnifiedRow type extended to include householdItem variant
   - Rendering of HI rows with circle icon
   - Muted text styling consistent with milestones

4. **GanttSidebar.module.css** (just completed)
   - CSS classes for HI rows and icons
   - Responsive behavior (hide labels on tablet/mobile)

5. **householdItemWorkItemsApi.ts** (just completed)
   - Type corrections: WorkItemSummary instead of non-existent HouseholdItemWorkItemSummary
   - Function signatures updated

### Test Fixture Updates (Minimal, QA to Complete)

- Timeline test fixtures: Added `householdItems: []`
- WorkItemLinkedHouseholdItemSummary: Added delivery date fields
- householdItemWorkItemsApi test: Updated to use WorkItemSummary

## Blockers

**Pre-commit hook fails due to test fixture compilation errors in files NOT modified by this work:**

- HouseholdItemDetailPage.test.tsx, .tsx
- HouseholdItemEditPage.test.tsx
- HouseholdItemsPage.test.tsx
- HouseholdItemCreatePage.test.tsx

These errors are NOT caused by GanttChart changes - they're caused by the backend adding `dependencies`, `earliestDeliveryDate`, `latestDeliveryDate` to HouseholdItemDetail and HouseholdItemSummary types.

## Next Steps for QA Agent

**CRITICAL: QA agent must fix test fixtures before production code can be committed**

1. Update all HouseholdItem test fixtures to include:
   - `dependencies: HouseholdItemDepDetail[]` (empty for most fixtures)
   - `earliestDeliveryDate: string | null`
   - `latestDeliveryDate: string | null`

2. Update all WorkItemSummary test fixtures in HouseholdItemDetailPage tests:
   - Add: actualStartDate, actualEndDate, durationDays, tags, startAfter, startBefore

3. Remove or update old `workItems` property references in:
   - HouseholdItemDetailPage tests (property doesn't exist in HouseholdItemDetail type)

## Files Ready for Commit

Once QA fixes the test fixtures, these files will compile cleanly:

- client/src/components/GanttChart/GanttArrows.tsx
- client/src/components/GanttChart/GanttSidebar.tsx
- client/src/components/GanttChart/GanttSidebar.module.css
- client/src/lib/householdItemWorkItemsApi.ts
- client/src/App.test.tsx (minor fixture update)
- client/src/components/GanttChart/GanttChart.test.tsx (minor fixture update)
- client/src/hooks/useTimeline.test.tsx (minor fixture update)
- client/src/pages/TimelinePage/TimelinePage.test.tsx (minor fixture update)
- client/src/lib/householdItemWorkItemsApi.test.ts (type corrections)

## Remaining Work Not Started

Per Issue #415 requirements (not yet tackled):

- GanttSidebar.tsx: Add HI row rendering (**DONE**)
- Calendar Integration: Filter/display HI delivery events
- WorkItemDetailPage: Update dependent HIs section
