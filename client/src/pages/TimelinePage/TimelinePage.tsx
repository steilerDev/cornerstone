import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTimeline } from '../../hooks/useTimeline.js';
import { useMilestones } from '../../hooks/useMilestones.js';
import { GanttChart, GanttChartSkeleton } from '../../components/GanttChart/GanttChart.js';
import { MilestonePanel } from '../../components/milestones/MilestonePanel.js';
import { CalendarView } from '../../components/calendar/CalendarView.js';
import { ScheduleSubNav } from '../../components/ScheduleSubNav/ScheduleSubNav.js';
import {
  type ZoomLevel,
  COLUMN_WIDTHS,
  COLUMN_WIDTH_MIN,
  COLUMN_WIDTH_MAX,
  SIDEBAR_WIDTH,
} from '../../components/GanttChart/ganttUtils.js';
import styles from './TimelinePage.module.css';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

// SVG icon for dependency arrows toggle (arrow connector symbol)
function ArrowsIcon({ active }: { active: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {/* Two nodes connected by an arrow */}
      <circle cx="4" cy="10" r="2.5" stroke="currentColor" strokeWidth={active ? 2 : 1.5} />
      <circle cx="16" cy="10" r="2.5" stroke="currentColor" strokeWidth={active ? 2 : 1.5} />
      {/* Arrow shaft */}
      <line
        x1="6.5"
        y1="10"
        x2="11.5"
        y2="10"
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.5}
        strokeLinecap="round"
      />
      {/* Arrowhead */}
      <polyline
        points="10,7.5 12.5,10 10,12.5"
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Entity filter icons
// ---------------------------------------------------------------------------

function WorkItemsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <rect x="3" y="4" width="14" height="3" rx="1" fill="currentColor" opacity="0.3" />
      <rect x="3" y="9" width="10" height="3" rx="1" fill="currentColor" />
      <rect x="3" y="14" width="12" height="3" rx="1" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

function MilestonesIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 12 12"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <polygon points="6,0 12,6 6,12 0,6" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function HouseholdItemsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <path
        d="M3 9L10 3l7 6v8a1 1 0 01-1 1H4a1 1 0 01-1-1V9z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
      <rect
        x="7"
        y="12"
        width="6"
        height="5"
        rx="0.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

type EntityType = 'work-items' | 'milestones' | 'household-items';

const ALL_ENTITY_TYPES: EntityType[] = ['work-items', 'milestones', 'household-items'];

const FILTER_PARAM = 'filter';

/** Parse the `?filter=` URL param into a Set of active entity types. */
export function parseFilterParam(raw: string | null): ReadonlySet<EntityType> {
  if (raw === null) return new Set(ALL_ENTITY_TYPES);
  const parts = raw
    .split(',')
    .filter((p): p is EntityType => (ALL_ENTITY_TYPES as string[]).includes(p));
  return parts.length > 0 ? new Set(parts) : new Set(ALL_ENTITY_TYPES);
}

/** Serialize the active set back to a URL param string. */
export function serializeFilterParam(active: ReadonlySet<EntityType>): string {
  return ALL_ENTITY_TYPES.filter((t) => active.has(t)).join(',');
}

const ZOOM_OPTIONS: { value: ZoomLevel; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

// ---------------------------------------------------------------------------
// TimelinePage
// ---------------------------------------------------------------------------

/** Compute the default responsive column width for the current viewport and zoom level. */
function computeDefaultColumnWidth(zoom: ZoomLevel, chartAreaWidth: number): number {
  let columnsVisible: number;
  if (zoom === 'day') {
    columnsVisible = 21; // approximately 3 weeks of days
  } else if (zoom === 'week') {
    columnsVisible = 9; // approximately 2 months of weeks
  } else {
    columnsVisible = 4; // approximately 4 months
  }

  const rawWidth = chartAreaWidth > 0 ? chartAreaWidth / columnsVisible : COLUMN_WIDTHS[zoom];
  const min = COLUMN_WIDTH_MIN[zoom];
  const max = COLUMN_WIDTH_MAX[zoom];
  return Math.max(min, Math.min(max, rawWidth));
}

const ZOOM_STEP_FACTOR = 0.2; // 20% per step

export function TimelinePage() {
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const [showArrows, setShowArrows] = useState(true);
  const [highlightCriticalPath, setHighlightCriticalPath] = useState(true);
  const { data, isLoading, error, refetch } = useTimeline();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ---- Column width state for zoom in/out ----
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const [columnWidth, setColumnWidth] = useState<number>(() => COLUMN_WIDTHS['month']);

  // On mount and when zoom changes, compute the responsive default column width
  useEffect(() => {
    const el = chartAreaRef.current;
    const areaWidth = el ? el.clientWidth - SIDEBAR_WIDTH : 0; // sidebar width from ganttUtils
    setColumnWidth(computeDefaultColumnWidth(zoom, areaWidth));
  }, [zoom]);

  // Keyboard Ctrl+= / Ctrl+- for zoom in/out
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        adjustColumnWidth(1);
      } else if (e.key === '-') {
        e.preventDefault();
        adjustColumnWidth(-1);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  function adjustColumnWidth(direction: number) {
    setColumnWidth((current) => {
      const min = COLUMN_WIDTH_MIN[zoom];
      const max = COLUMN_WIDTH_MAX[zoom];
      const step = Math.max(1, Math.round(current * ZOOM_STEP_FACTOR));
      const next = current + direction * step;
      return Math.max(min, Math.min(max, next));
    });
  }

  const isAtMinZoom = columnWidth <= COLUMN_WIDTH_MIN[zoom];
  const isAtMaxZoom = columnWidth >= COLUMN_WIDTH_MAX[zoom];

  // ---- Entity type filter ----
  const activeEntities: ReadonlySet<EntityType> = parseFilterParam(searchParams.get(FILTER_PARAM));

  function toggleEntity(type: EntityType) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const current = parseFilterParam(prev.get(FILTER_PARAM));
        if (current.has(type) && current.size === 1) return prev;
        const updated = new Set(current);
        if (updated.has(type)) {
          updated.delete(type);
        } else {
          updated.add(type);
        }
        next.set(FILTER_PARAM, serializeFilterParam(updated));
        return next;
      },
      { replace: true },
    );
  }

  // ---- View toggle: gantt (default) or calendar ----
  const rawView = searchParams.get('view');
  const activeView: 'gantt' | 'calendar' = rawView === 'calendar' ? 'calendar' : 'gantt';

  function setActiveView(view: 'gantt' | 'calendar') {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (view === 'gantt') {
          next.delete('view');
          // Remove calendarMode when switching to gantt to keep URL clean
          next.delete('calendarMode');
        } else {
          next.set('view', view);
        }
        return next;
      },
      { replace: true },
    );
  }

  // ---- Milestone state ----
  const [showMilestonePanel, setShowMilestonePanel] = useState(false);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<number | undefined>(undefined);
  const milestones = useMilestones();

  // Build a map from milestone ID → projected date for the MilestonePanel.
  // Sourced from the timeline response so the panel can show late indicators.
  const projectedDates = useMemo<ReadonlyMap<number, string | null>>(() => {
    if (data === null) return new Map();
    return new Map(data.milestones.map((m) => [m.id, m.projectedDate]));
  }, [data]);

  const handleItemClick = useCallback(
    (id: string) => {
      void navigate(`/project/work-items/${id}`, { state: { from: 'schedule' } });
    },
    [navigate],
  );

  const handleHouseholdItemClick = useCallback(
    (id: string) => {
      void navigate(`/project/household-items/${id}`, { state: { from: 'schedule' } });
    },
    [navigate],
  );

  // ---- Filtered data arrays for display ----
  const filteredWorkItems = activeEntities.has('work-items') ? (data?.workItems ?? []) : [];
  const filteredMilestones = activeEntities.has('milestones') ? (data?.milestones ?? []) : [];
  const filteredHouseholdItems = activeEntities.has('household-items')
    ? (data?.householdItems ?? [])
    : [];

  const hasWorkItemsWithDates =
    data !== null &&
    data.workItems.some((item) => item.startDate !== null || item.endDate !== null);

  const isEmpty = data !== null && data.workItems.length === 0;

  return (
    <div className={styles.page} data-testid="timeline-page">
      {/* Page header: title + toolbar */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Schedule</h1>

        <div className={styles.toolbar}>
          {/* Milestones panel toggle — shown in both views */}
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={() => setShowMilestonePanel(true)}
            title="Manage milestones"
            aria-label="Open milestones panel"
            data-testid="milestones-panel-button"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 12 12"
              width="16"
              height="16"
              fill="none"
              aria-hidden="true"
              style={{ display: 'block' }}
            >
              <polygon
                points="6,0 12,6 6,12 0,6"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
              />
            </svg>
            <span>Milestones</span>
          </button>

          {/* Entity filter toggle — shown in both views */}
          <div
            className={styles.entityFilterToggle}
            role="group"
            aria-label="Entity filter"
            data-testid="entity-filter-group"
          >
            {(
              [
                { type: 'work-items' as EntityType, label: 'Work Items', Icon: WorkItemsIcon },
                { type: 'milestones' as EntityType, label: 'Milestones', Icon: MilestonesIcon },
                {
                  type: 'household-items' as EntityType,
                  label: 'Household Items',
                  Icon: HouseholdItemsIcon,
                },
              ] as const
            ).map(({ type, label, Icon }) => {
              const isActive = activeEntities.has(type);
              const isLastActive = isActive && activeEntities.size === 1;
              return (
                <button
                  key={type}
                  type="button"
                  className={`${styles.entityFilterButton} ${
                    isActive ? styles.entityFilterButtonActive : ''
                  }`}
                  aria-pressed={isActive}
                  aria-label={`${label}: ${isActive ? 'shown' : 'hidden'}`}
                  title={
                    isLastActive
                      ? `${label} (cannot hide last type)`
                      : isActive
                        ? `Hide ${label}`
                        : `Show ${label}`
                  }
                  onClick={() => toggleEntity(type)}
                  disabled={isLastActive}
                  data-testid={`entity-filter-${type}`}
                >
                  <Icon />
                  <span className={styles.entityFilterLabel}>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Gantt-specific controls: arrows toggle + zoom level + column zoom */}
          {activeView === 'gantt' && (
            <>
              {/* Arrows toggle (icon-only) */}
              <button
                type="button"
                className={`${styles.arrowsToggle} ${showArrows ? styles.arrowsToggleActive : ''}`}
                aria-pressed={showArrows}
                aria-label={showArrows ? 'Hide dependency arrows' : 'Show dependency arrows'}
                onClick={() => setShowArrows((v) => !v)}
                title={showArrows ? 'Hide dependency arrows' : 'Show dependency arrows'}
              >
                <ArrowsIcon active={showArrows} />
              </button>

              {/* Critical path highlight toggle (icon-only) */}
              <button
                type="button"
                className={`${styles.arrowsToggle} ${highlightCriticalPath ? styles.arrowsToggleActive : ''}`}
                aria-pressed={highlightCriticalPath}
                aria-label={
                  highlightCriticalPath
                    ? 'Hide critical path highlighting'
                    : 'Show critical path highlighting'
                }
                onClick={() => setHighlightCriticalPath((v) => !v)}
                title={
                  highlightCriticalPath
                    ? 'Hide critical path highlighting'
                    : 'Show critical path highlighting'
                }
                data-testid="critical-path-toggle"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  width="16"
                  height="16"
                  fill="none"
                  aria-hidden="true"
                  style={{ display: 'block' }}
                >
                  {/* Lightning bolt icon for critical path */}
                  <path
                    d="M11 2L5 11h4l-1 7 6-9h-4l1-7z"
                    stroke="currentColor"
                    strokeWidth={highlightCriticalPath ? 2 : 1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill={highlightCriticalPath ? 'currentColor' : 'none'}
                  />
                </svg>
              </button>

              {/* Zoom level toggle */}
              <div className={styles.zoomToggle} role="toolbar" aria-label="Zoom level">
                {ZOOM_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className={`${styles.zoomButton} ${zoom === value ? styles.zoomButtonActive : ''}`}
                    aria-pressed={zoom === value}
                    onClick={() => setZoom(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Column zoom: - and + buttons */}
              <div
                className={styles.columnZoomGroup}
                role="group"
                aria-label="Column zoom"
                title="Adjust column width (Ctrl+scroll or Ctrl+=/−)"
              >
                <button
                  type="button"
                  className={styles.columnZoomButton}
                  onClick={() => adjustColumnWidth(-1)}
                  disabled={isAtMinZoom}
                  aria-label="Zoom out columns"
                  title="Zoom out (Ctrl+−)"
                >
                  −
                </button>
                <button
                  type="button"
                  className={styles.columnZoomButton}
                  onClick={() => adjustColumnWidth(1)}
                  disabled={isAtMaxZoom}
                  aria-label="Zoom in columns"
                  title="Zoom in (Ctrl+=)"
                >
                  +
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Schedule sub-navigation: Gantt / Calendar view toggle */}
      <ScheduleSubNav activeView={activeView} onViewChange={setActiveView} />

      {/* Chart / calendar area */}
      <div className={styles.chartArea} ref={chartAreaRef}>
        {/* Loading state */}
        {isLoading && <GanttChartSkeleton />}

        {/* Error state */}
        {!isLoading && error !== null && (
          <div className={styles.errorBanner} role="alert" data-testid="timeline-error">
            <svg
              className={styles.errorIcon}
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>{error}</span>
            <button type="button" className={styles.errorBannerRetry} onClick={refetch}>
              Try again
            </button>
          </div>
        )}

        {/* Empty state (Gantt view only — calendar always shows the grid) */}
        {!isLoading && error === null && isEmpty && activeView === 'gantt' && (
          <div className={styles.emptyState} data-testid="timeline-empty">
            <svg
              className={styles.emptyStateIcon}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <h2 className={styles.emptyStateTitle}>No work items to display</h2>
            <p className={styles.emptyStateDescription}>
              Add work items with start and end dates to see them on the timeline.
            </p>
            <Link to="/project/work-items" className={styles.emptyStateLink}>
              Go to Work Items
            </Link>
          </div>
        )}

        {/* No-dates warning — items exist but none have dates set (Gantt view only) */}
        {!isLoading &&
          error === null &&
          !isEmpty &&
          !hasWorkItemsWithDates &&
          data !== null &&
          activeView === 'gantt' && (
            <div className={styles.emptyState} data-testid="timeline-no-dates">
              <svg
                className={styles.emptyStateIcon}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <h2 className={styles.emptyStateTitle}>No scheduled work items</h2>
              <p className={styles.emptyStateDescription}>
                Your work items don&apos;t have start and end dates yet. Set dates on your work
                items to see them positioned on the timeline.
              </p>
              <Link to="/project/work-items" className={styles.emptyStateLink}>
                Go to Work Items
              </Link>
            </div>
          )}

        {/* Gantt chart (data loaded, has work items, gantt view selected) */}
        {!isLoading &&
          error === null &&
          data !== null &&
          data.workItems.length > 0 &&
          activeView === 'gantt' && (
            <GanttChart
              data={{
                ...data,
                workItems: filteredWorkItems,
                milestones: filteredMilestones,
                householdItems: filteredHouseholdItems,
              }}
              zoom={zoom}
              columnWidth={columnWidth}
              onItemClick={handleItemClick}
              showArrows={showArrows}
              highlightCriticalPath={highlightCriticalPath}
              onMilestoneClick={(milestoneId) => {
                setSelectedMilestoneId(milestoneId);
                setShowMilestonePanel(true);
              }}
              onHouseholdItemClick={handleHouseholdItemClick}
              onCtrlScroll={(delta) => adjustColumnWidth(delta > 0 ? 1 : -1)}
            />
          )}

        {/* Calendar view (data loaded, calendar view selected) */}
        {!isLoading && error === null && data !== null && activeView === 'calendar' && (
          <CalendarView
            workItems={filteredWorkItems}
            milestones={filteredMilestones}
            householdItems={filteredHouseholdItems}
            dependencies={data.dependencies}
            onMilestoneClick={(milestoneId) => {
              setSelectedMilestoneId(milestoneId);
              setShowMilestonePanel(true);
            }}
          />
        )}
      </div>

      {/* Milestone CRUD panel */}
      {showMilestonePanel && (
        <MilestonePanel
          milestones={milestones.milestones}
          isLoading={milestones.isLoading}
          error={milestones.error}
          onClose={() => {
            setShowMilestonePanel(false);
            setSelectedMilestoneId(undefined);
          }}
          initialMilestoneId={selectedMilestoneId}
          hooks={{
            createMilestone: milestones.createMilestone,
            updateMilestone: milestones.updateMilestone,
            deleteMilestone: milestones.deleteMilestone,
            linkWorkItem: milestones.linkWorkItem,
            unlinkWorkItem: milestones.unlinkWorkItem,
          }}
          onMutated={refetch}
          projectedDates={projectedDates}
        />
      )}
    </div>
  );
}

export default TimelinePage;
