# Gantt / Calendar / Timeline / Milestones (EPIC-06 and fixes)

## Gantt Chart Architecture (EPIC-06)

- SVG-based, column-width pixel positioning
- `ZoomLevel`: `'day' | 'week' | 'month'`; `COLUMN_WIDTHS`, `COLUMN_WIDTH_MIN`, `COLUMN_WIDTH_MAX` in `ganttUtils.ts`
- All coordinate functions accept optional `columnWidth` param (override default for zoom in/out)
- Milestone rows come AFTER work item rows: `rowIndex = workItemCount + milestoneIndex`
- SVG height = `totalRowCount * ROW_HEIGHT` (totalRowCount includes milestone rows)
- Ghost SVG polygon: plain `<polygon>` with `fill="transparent"`, `strokeDasharray`, `aria-hidden`, NO interactions
- **Test pitfall**: `layer.querySelector('polygon')` finds the FIRST polygon — ghost is rendered before active diamond for late milestones. Use `querySelectorAll('polygon')[polygons.length - 1]` to get the active one.

## Drag-and-Drop Hook (Story 6.6 — `useGanttDrag.ts`)

**CRITICAL**: React 19 `react-hooks/refs` ESLint rule forbids `ref.current = value` during render.
Must update ref ONLY inside event handlers. Pattern:

```typescript
const dragStateRef = useRef<DragState | null>(null);
// NO: dragStateRef.current = dragState; (during render — ESLint error)
// YES: update ref inside handleBarPointerDown, handleSvgPointerMove, handleSvgPointerUp, handleSvgPointerCancel
```

Also: `handleSvgPointerMove` must update `dragStateRef.current` with new preview dates so `handleSvgPointerUp` reads the latest state (React state update is async).

## Gantt Arrow Hover Highlight (issue #287, PR #288)

Arrow hover interaction pattern:

- `GanttArrows` owns local `hoveredArrowKey: string | null` state (for per-arrow CSS dimming)
- `GanttArrows` calls `onArrowHover(connectedIds, description, mousePos)` upward to `GanttChart`
- `GanttChart` owns `hoveredArrowConnectedIds: ReadonlySet<string> | null`
- Milestone IDs encoded as `"milestone:<id>"` to fit in same `Set<string>` as work item IDs
- `GanttChart` computes `barInteractionStates` (Map<string, BarInteractionState>) and `milestoneInteractionStates` (Map<number, MilestoneInteractionState>)
- `GanttBar` accepts `interactionState?: 'highlighted'|'dimmed'|'default'` → CSS class
- `GanttMilestones` accepts `milestoneInteractionStates?: ReadonlyMap<number, MilestoneInteractionState>`
- `GanttTooltip` has 3 kinds: `'work-item'`, `'milestone'`, `'arrow'` (new)
- Arrow tooltip shown immediately (no debounce) via `kind: 'arrow'` with `description` string
- Arrow aria-labels use human-readable descriptions (not technical "Finish-to-Start")
- Keyboard focus on `<g tabIndex={0}>` triggers same highlight/dim via `onFocus`/`onBlur`
- CSS: `.highlighted { filter: brightness(1.2) drop-shadow(...) }` and `.dimmed { opacity: 0.3 }`
- Dimmed bars override hover: `.dimmed:hover { filter: none; opacity: 0.3 }`

## Gantt Milestone Dependency Arrows (Fix 3, fix/epic-06-uat-fixes)

- `GanttArrows.tsx` extended with `MilestonePoint` type (x, y diamond center) + 4 new optional props
- New `milestoneArrow` color field in `ArrowColors` interface → resolved from `--color-gantt-arrow-milestone`
- Token added to tokens.css: `--color-gantt-arrow-milestone: var(--color-blue-500)` (light+dark)
- Two arrow types: contributing (WI end → diamond, FS-style) + required (diamond → WI start)
- Path routing: `buildMilestoneOrthoPath()` — orthogonal paths with STANDOFF=10, wraps around if reversed
- Dashed stroke: `strokeDasharray="5 3"`, opacity=0.65
- `GanttChart.tsx` computes 4 useMemo maps: `milestonePoints`, `milestoneContributors`, `workItemRequiredMilestones`, `milestoneTitles`
- Milestone X uses active date (projectedDate for late, targetDate otherwise) matching GanttMilestones positioning

## Calendar Lane Allocation + Item Colors (Fix 2, fix/epic-06-uat-fixes)

- `allocateLanes(weekStart, weekEnd, items)` in `calendarUtils.ts` — greedy lane assignment
  - Returns `Map<itemId, laneIndex>` (0-based); multi-day items first by descending span length
  - Ensures consistent vertical position for multi-day items across all cells in a week row
- `getItemColor(itemId)` — djb2-style hash to 1-8 color index (deterministic)
- `CalendarItem.tsx` exports `LANE_HEIGHT_COMPACT = 20` and `LANE_HEIGHT_FULL = 26` (px)
- `CalendarItem` props: `laneIndex?: number` (absolute `top` via inline style) + `colorIndex?: number` (palette color via inline style)
- `MonthGrid`: `position:relative` itemsContainer, lane map per week row, milestones stacked after item lanes
- `WeekGrid`: one lane map for whole week, `position:relative` on dayCell via inline style
- Status CSS classes (`.notStarted`, `.inProgress`, etc.) KEPT for test compatibility; inline palette color overrides them visually
- Calendar palette tokens: `--calendar-item-{1-8}-bg` + `--calendar-item-{1-8}-text` in tokens.css (light + dark)

## MilestoneWorkItemLinker — Bidirectional Relationships (Fix 4, then Fix 5-UI)

- `MilestoneDetail.workItems` = contributing items (editable via `milestone_work_items` table)
- `MilestoneDetail.dependentWorkItems: WorkItemDependentSummary[]` = items blocked by this milestone
- `WorkItemDependentSummary { id: string; title: string }` in `shared/src/types/milestone.ts`
- Linker view has two sections: "Contributing Work Items" (editable) + "Dependent Work Items" (ALSO EDITABLE as of UAT Round 2 Fix 5-UI)
- Both sections use `WorkItemSelector` component with `onLinkDependent`/`onUnlinkDependent` callbacks
- Backend endpoints: `POST /api/milestones/:id/dependents/:workItemId`, `DELETE /api/milestones/:id/dependents/:workItemId`
- API client: `addDependentWorkItem(milestoneId, workItemId)` and `removeDependentWorkItem(milestoneId, workItemId)` in `milestonesApi.ts`
- Dialog title for linker view = "Manage Work Items" (changed from "Contributing Work Items")
- `MilestoneSummary` has both `workItemCount` and `dependentWorkItemCount` fields
- Milestone list row displays "N contributing, M dependent" (only non-zero counts shown)

## WorkItemDetail Constraints Section (Fix 4 + Fix 1 UAT Round 2)

- New file: `client/src/lib/workItemMilestonesApi.ts` — 5 functions for work item milestone relationships
- `getWorkItemMilestones(workItemId)` → `WorkItemMilestones { required, linked }`
- `add/removeRequiredMilestone(workItemId, milestoneId)` / `add/removeLinkedMilestone(workItemId, milestoneId)`
- Right column has unified "Constraints" section (as of UAT Round 2 Fix 1 — 5 subsections):
  1. Duration (FIRST — `.constraintSubsectionFirst`, no top border) — moved from left column
  2. Date Constraints (startAfter/startBefore)
  3. Dependencies (predecessors/successors — unchanged)
  4. Required Milestones (must complete before WI starts — chip badges)
  5. Linked Milestones (WI contributes to — chip badges with success-green color)
- Left column: old "Constraints" section (startAfter + startBefore + duration) fully REMOVED; Duration standalone section REMOVED
- Milestone chips: `milestoneChip` class (primary-bg blue), `milestoneChipLinked` modifier (success green)
- CSS: `constraintSubsection` / `constraintSubsectionFirst` / `milestoneChip*` in module CSS
- Type note: `MilestoneSummaryForWorkItem.name` (chips) vs `MilestoneSummary.title` (picker dropdown)
- allMilestones loaded in initial `Promise.all` via `listMilestones()`; `getWorkItemMilestones` fetches both required+linked in one call

## TimelinePage Post Auto-Schedule Removal (Fix 1, fix/epic-06-uat-fixes)

- `scheduleApi.ts` and `scheduleApi.test.ts` DELETED — scheduling is server-side automatic
- CSS class `toolbarButton` replaces old `autoScheduleButtonPrimary` for the Milestones button
- Old CSS classes removed: `autoScheduleButton`, `autoScheduleButtonPrimary`, `scheduleError`, and all `.dialog*` classes
- `App.test.tsx` no longer mocks `scheduleApi.js` — the mock was only needed because TimelinePage imported it
- `e2e/pages/TimelinePage.ts` POM no longer has `autoScheduleButton`, `autoScheduleDialog`, `autoScheduleConfirmButton`, `autoScheduleCancelButton` properties, or `openAutoScheduleDialog/confirmAutoSchedule/cancelAutoSchedule` methods
- `e2e/tests/timeline/timeline-schedule.spec.ts` DELETED — feature removed

## WorkItemDetailPage E2E POM Layout (Fix 5, fix/epic-06-uat-fixes, PR #272)

`e2e/pages/WorkItemDetailPage.ts` POM section locators updated to match current layout:

- `durationSection` (NEW) — left column h2 "Duration" (only duration days)
- `constraintsSection` (MOVED) — right column h2 "Constraints" combined section; contains h3 subsections: Date Constraints, Dependencies, Required Milestones, Linked Milestones
- `dependenciesSection` REMOVED — h2 "Dependencies" no longer exists; it is now h3 under h2 "Constraints"
- test line 66: `dependenciesSection` → `constraintsSection`
