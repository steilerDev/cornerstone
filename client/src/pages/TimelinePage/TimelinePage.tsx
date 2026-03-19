import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTimeline } from '../../hooks/useTimeline.js';
import { GanttChart, GanttChartSkeleton } from '../../components/GanttChart/GanttChart.js';
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

// Zoom options defined inside component to access translations

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
  const { t } = useTranslation('schedule');
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const [showArrows, setShowArrows] = useState(true);
  const [highlightCriticalPath, setHighlightCriticalPath] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const newRef = useRef<HTMLDivElement>(null);
  const { data, isLoading, error, refetch } = useTimeline();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const zoomOptions: { value: ZoomLevel; label: string }[] = [
    { value: 'day', label: t('timeline.zoomOptions.day') },
    { value: 'week', label: t('timeline.zoomOptions.week') },
    { value: 'month', label: t('timeline.zoomOptions.month') },
  ];

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

  // Close New dropdown on outside click
  useEffect(() => {
    if (!newOpen) return;
    function handleClick(e: MouseEvent) {
      if (newRef.current && !newRef.current.contains(e.target as Node)) {
        setNewOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [newOpen]);

  // Close New dropdown on Escape key
  useEffect(() => {
    if (!newOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setNewOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [newOpen]);

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
  const location = useLocation();
  const activeView: 'gantt' | 'calendar' = location.pathname.includes('/calendar')
    ? 'calendar'
    : 'gantt';

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

  const handleMilestoneClick = useCallback(
    (id: number) => {
      void navigate(`/project/milestones/${id}`, { state: { from: 'schedule' } });
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
        <h1 className={styles.pageTitle}>{t('timeline.page.title')}</h1>

        <div className={styles.toolbar}>
          {/* Entity filter toggle — shown in both views */}
          <div
            className={styles.entityFilterToggle}
            role="group"
            aria-label={t('timeline.toolbar.entityFilter')}
            data-testid="entity-filter-group"
          >
            {(
              [
                {
                  type: 'work-items' as EntityType,
                  labelKey: 'timeline.toolbar.workItems',
                  Icon: WorkItemsIcon,
                },
                {
                  type: 'milestones' as EntityType,
                  labelKey: 'timeline.toolbar.milestones',
                  Icon: MilestonesIcon,
                },
                {
                  type: 'household-items' as EntityType,
                  labelKey: 'timeline.toolbar.householdItems',
                  Icon: HouseholdItemsIcon,
                },
              ] as const
            ).map(({ type, labelKey, Icon }) => {
              const label = t(labelKey);
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
                  aria-label={`${label}: ${isActive ? t('timeline.toolbar.hideLabel') : t('timeline.toolbar.showLabel')}`}
                  title={
                    isLastActive
                      ? `${label} (${t('timeline.toolbar.cannotHideLastType')})`
                      : isActive
                        ? `${t('timeline.toolbar.hideLabel')} ${label}`
                        : `${t('timeline.toolbar.showLabel')} ${label}`
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
                aria-label={
                  showArrows
                    ? t('timeline.toolbar.hideDependencyArrows')
                    : t('timeline.toolbar.showDependencyArrows')
                }
                onClick={() => setShowArrows((v) => !v)}
                title={
                  showArrows
                    ? t('timeline.toolbar.hideDependencyArrows')
                    : t('timeline.toolbar.showDependencyArrows')
                }
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
                    ? t('timeline.toolbar.hideCriticalPath')
                    : t('timeline.toolbar.showCriticalPath')
                }
                onClick={() => setHighlightCriticalPath((v) => !v)}
                title={
                  highlightCriticalPath
                    ? t('timeline.toolbar.hideCriticalPath')
                    : t('timeline.toolbar.showCriticalPath')
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
              <div
                className={styles.zoomToggle}
                role="toolbar"
                aria-label={t('timeline.toolbar.zoomLevel')}
              >
                {zoomOptions.map(({ value, label }) => (
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
                aria-label={t('timeline.toolbar.columnZoom')}
                title={t('timeline.toolbar.adjustColumnWidth')}
              >
                <button
                  type="button"
                  className={styles.columnZoomButton}
                  onClick={() => adjustColumnWidth(-1)}
                  disabled={isAtMinZoom}
                  aria-label={t('timeline.toolbar.zoomOutColumns')}
                  title="Zoom out (Ctrl+−)"
                >
                  −
                </button>
                <button
                  type="button"
                  className={styles.columnZoomButton}
                  onClick={() => adjustColumnWidth(1)}
                  disabled={isAtMaxZoom}
                  aria-label={t('timeline.toolbar.zoomInColumns')}
                  title="Zoom in (Ctrl+=)"
                >
                  +
                </button>
              </div>
            </>
          )}

          {/* New dropdown button */}
          <div className={styles.newContainer} ref={newRef}>
            <button
              type="button"
              className={styles.newButton}
              onClick={() => setNewOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={newOpen}
              aria-label={t('timeline.toolbar.newButton')}
              data-testid="timeline-new-button"
            >
              {t('timeline.toolbar.newButton')}
            </button>
            {newOpen && (
              <div className={styles.newDropdown} role="menu">
                <button
                  type="button"
                  className={styles.newMenuItem}
                  role="menuitem"
                  onClick={() => {
                    setNewOpen(false);
                    void navigate('/project/work-items/new');
                  }}
                  data-testid="timeline-new-work-item"
                >
                  {t('timeline.toolbar.newWorkItem')}
                </button>
                <button
                  type="button"
                  className={styles.newMenuItem}
                  role="menuitem"
                  onClick={() => {
                    setNewOpen(false);
                    void navigate('/project/household-items/new');
                  }}
                  data-testid="timeline-new-household-item"
                >
                  {t('timeline.toolbar.newHouseholdItem')}
                </button>
                <button
                  type="button"
                  className={styles.newMenuItem}
                  role="menuitem"
                  onClick={() => {
                    setNewOpen(false);
                    void navigate('/project/milestones/new');
                  }}
                  data-testid="timeline-new-milestone"
                >
                  {t('timeline.toolbar.newMilestone')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Schedule sub-navigation: Gantt / Calendar view toggle */}
      <ScheduleSubNav />

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
              {t('timeline.errorBanner.tryAgain')}
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
            <h2 className={styles.emptyStateTitle}>{t('timeline.emptyState.noItems')}</h2>
            <p className={styles.emptyStateDescription}>
              {t('timeline.emptyState.noItemsMessage')}
            </p>
            <Link to="/project/work-items" className={styles.emptyStateLink}>
              {t('timeline.emptyState.goToWorkItems')}
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
              <h2 className={styles.emptyStateTitle}>{t('timeline.emptyState.noScheduled')}</h2>
              <p className={styles.emptyStateDescription}>
                {t('timeline.emptyState.noScheduledMessage')}
              </p>
              <Link to="/project/work-items" className={styles.emptyStateLink}>
                {t('timeline.emptyState.goToWorkItems')}
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
              onMilestoneClick={handleMilestoneClick}
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
          />
        )}
      </div>
    </div>
  );
}

export default TimelinePage;
