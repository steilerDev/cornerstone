import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, matchPath } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { routePattern, routeUrl } from '@cornerstone/shared';
import type { TimelineResponse } from '@cornerstone/shared';
import { useTimeline } from '../../hooks/useTimeline.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { GanttChart, GanttChartSkeleton } from '../../components/GanttChart/GanttChart.js';
import type {
  GanttChartControl,
  GanttPreviewGhost,
  GanttScrollAnchor,
} from '../../components/GanttChart/GanttChart.js';
import { GanttLegend } from '../../components/GanttChart/GanttLegend.js';
import { ScheduleAgenda } from '../../components/GanttChart/ScheduleAgenda.js';
import { CalendarView } from '../../components/calendar/CalendarView.js';
import { useCreateContext } from '../../components/CreateMenu/CreateMenuContext.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { FormError } from '../../components/FormError/FormError.js';
import {
  type ZoomLevel,
  COLUMN_WIDTHS,
  COLUMN_WIDTH_MIN,
  COLUMN_WIDTH_MAX,
  SIDEBAR_WIDTH,
} from '../../components/GanttChart/ganttUtils.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { fetchFailureMessage } from '../../lib/fetchFailure.js';
import { weekStart } from '../../lib/feedWeeks.js';
import { todayLocalIsoDate } from '../../lib/localDate.js';
import { barDates } from '../../lib/scheduleDates.js';
import { SCHEDULE_PHONE_VIEWS, filterTimeline, parseRowKey } from '../../lib/scheduleView.js';
import type { ScheduleRowKey } from '../../lib/scheduleView.js';
import { buildTree } from '../../lib/areaTreeUtils.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { useOnObjectCreated } from '../../lib/objectCreatedEvents.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { PageTitle } from '../../components/PageLayout/PageTitle.js';
import shared from '../../styles/shared.module.css';
import { PANEL_TEST_ID, ScheduleItemPanel } from './ScheduleItemPanel.js';
import { ScheduleToolbar } from './ScheduleToolbar.js';
import { useScheduleView } from './useScheduleView.js';
import styles from './TimelinePage.module.css';

// ---------------------------------------------------------------------------
// Helpers
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

const PANEL_SELECTOR = `[role="dialog"], [data-testid="${PANEL_TEST_ID}"]`;

const ROW_KEY_PATTERN = /^(?:(?:task|purchase):.+|milestone:\d+)$/;

function isRowKey(value: unknown): value is ScheduleRowKey {
  return typeof value === 'string' && ROW_KEY_PATTERN.test(value);
}

function scrollStorageKey(locationKey: string): string {
  return `schedule.scroll:${locationKey}`;
}

/** The scroll anchor saved for a history entry; anything unusable is null. */
export function readScheduleAnchor(locationKey: string): GanttScrollAnchor | null {
  try {
    const raw = sessionStorage.getItem(scrollStorageKey(locationKey));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { date, rowKey, rowOffset } = parsed as Record<string, unknown>;
    if (typeof date !== 'string' || typeof rowOffset !== 'number') return null;
    if (rowKey !== null && !isRowKey(rowKey)) return null;
    return { date, rowKey, rowOffset };
  } catch {
    return null;
  }
}

/** Saves the anchor so "Back" from an opened object restores the position. */
export function writeScheduleAnchor(locationKey: string, anchor: GanttScrollAnchor): void {
  try {
    sessionStorage.setItem(scrollStorageKey(locationKey), JSON.stringify(anchor));
  } catch {
    // Storage may be unavailable (private mode); the position is then simply not remembered.
  }
}

/** Whether the row a selection points at is still in the data. */
function rowExists(data: TimelineResponse, key: ScheduleRowKey): boolean {
  const { kind, id } = parseRowKey(key);
  if (kind === 'task') return data.workItems.some((item) => item.id === id);
  if (kind === 'milestone') return data.milestones.some((milestone) => String(milestone.id) === id);
  return data.householdItems.some((item) => item.id === id);
}

/** Registers the create pre-fill. Mounted only in the chart and agenda (D11): at page level its effect would run after the Calendar's and clear the Calendar's date. */
function SchedulePrefill({ date, areaId }: { date: string; areaId: string | null }) {
  useCreateContext({ date, areaId: areaId ?? undefined });
  return null;
}

// ---------------------------------------------------------------------------
// TimelinePage
// ---------------------------------------------------------------------------

export function TimelinePage() {
  const { t } = useTranslation('schedule');
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const view = useScheduleView();
  const { data, isLoading, failure, refetch } = useTimeline();
  const location = useLocation();
  const navigate = useNavigate();
  const originState = useOriginState();
  const phone = useMediaQuery('(max-width: 767px)');
  const legendId = useId();
  // A phone's legend is a modal sheet: it opens only on a tap in this session, never from the stored state.
  const [phoneLegendOpen, setPhoneLegendOpen] = useState(false);
  const legendToggleRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<GanttChartControl | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useOnObjectCreated('task', refetch);
  useOnObjectCreated('milestone', refetch);
  useOnObjectCreated('purchase', refetch);

  const { zoom } = view;

  // ---- View: chart (default) or calendar ----
  const activeView: 'gantt' | 'calendar' = matchPath(
    routePattern('scheduleCalendar'),
    location.pathname,
  )
    ? 'calendar'
    : 'gantt';
  const isCalendar = activeView === 'calendar';
  const viewTitle = isCalendar ? tc('navigation.calendar') : tc('navigation.schedule');
  useDocumentTitle(viewTitle);
  const showAgenda = !isCalendar && phone && view.phoneView === 'agenda';

  // ---- Column width: the zoom level's default, adjusted with Ctrl+wheel / Ctrl+= / Ctrl+- ----
  const [columnWidth, setColumnWidth] = useState<number>(() => COLUMN_WIDTHS['month']);

  useEffect(() => {
    const areaWidth = chartAreaRef.current!.clientWidth - SIDEBAR_WIDTH;
    setColumnWidth(computeDefaultColumnWidth(zoom, areaWidth));
  }, [zoom]);

  const adjustColumnWidth = useCallback(
    (direction: number) => {
      setColumnWidth((current) => {
        const min = COLUMN_WIDTH_MIN[zoom];
        const max = COLUMN_WIDTH_MAX[zoom];
        const step = Math.max(1, Math.round(current * ZOOM_STEP_FACTOR));
        return Math.max(min, Math.min(max, current + direction * step));
      });
    },
    [zoom],
  );

  useEffect(() => {
    if (isCalendar) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey) return;
      // A dialog or the docked panel owns its own keys.
      if (e.target instanceof Element && e.target.closest(PANEL_SELECTOR)) return;
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
  }, [isCalendar, adjustColumnWidth]);

  // ---- Filtered data ----
  const filtered = useMemo(
    () =>
      data
        ? filterTimeline(data, {
            show: view.show,
            areaId: isCalendar ? null : view.areaId,
            applyDone: !isCalendar,
          })
        : null,
    [data, view.show, view.areaId, isCalendar],
  );
  const areaOrder = useMemo(() => buildTree(view.areas).map((node) => node.area.id), [view.areas]);

  // ---- Selection and the Reschedule preview ----
  const [selectedKey, setSelectedKey] = useState<ScheduleRowKey | null>(null);
  const [previewGhosts, setPreviewGhosts] = useState<readonly GanttPreviewGhost[]>([]);

  const handleSelect = useCallback((key: ScheduleRowKey, opener: HTMLElement) => {
    openerRef.current = opener;
    setSelectedKey(key);
  }, []);

  const handlePanelClose = useCallback(() => {
    setSelectedKey(null);
    setPreviewGhosts([]);
  }, []);

  // A selected row that disappeared (deleted elsewhere) closes the panel; focus goes to the heading.
  const activeKey =
    selectedKey !== null && data !== null && rowExists(data, selectedKey) ? selectedKey : null;
  const selectionLost = selectedKey !== null && data !== null && activeKey === null;
  useEffect(() => {
    if (selectionLost) headingRef.current?.focus();
  }, [selectionLost]);

  // ---- Scroll position: remembered per history entry; the visible week feeds the create pre-fill ----
  const [initialAnchor] = useState(() => readScheduleAnchor(location.key));
  const currentWeek = weekStart(todayLocalIsoDate());
  const [visibleWeek, setVisibleWeek] = useState(currentWeek);
  const locationKey = location.key;
  const handleAnchorChange = useCallback(
    (anchor: GanttScrollAnchor) => {
      writeScheduleAnchor(locationKey, anchor);
      setVisibleWeek(weekStart(anchor.date));
    },
    [locationKey],
  );

  const legendOpen = phone ? phoneLegendOpen : view.legendOpen;
  const { legendOpen: storedLegendOpen, setLegendOpen } = view;
  const handleLegendToggle = () => {
    if (phone) setPhoneLegendOpen(!phoneLegendOpen);
    else setLegendOpen(!storedLegendOpen);
  };

  const handleToday = useCallback(() => controlRef.current?.scrollToToday(), []);

  const handleMilestoneClick = useCallback(
    (id: number) => {
      void navigate(routeUrl('milestone', { id }), { state: originState });
    },
    [navigate, originState],
  );

  // ---- Body states ----
  const hasWorkItemsWithDates =
    data !== null &&
    data.workItems.some((item) => {
      const d = barDates(item);
      return d.start !== null || d.end !== null;
    });
  const calendarIsEmpty =
    data !== null &&
    data.workItems.length === 0 &&
    data.milestones.length === 0 &&
    data.householdItems.length === 0;
  const nothingShown =
    filtered !== null &&
    filtered.data.workItems.length === 0 &&
    filtered.data.milestones.length === 0 &&
    filtered.data.householdItems.length === 0;

  const loading = isLoading || !view.ready;
  const retryButton = (
    <button type="button" className={shared.btnSecondary} onClick={refetch}>
      {tc('button.retry')}
    </button>
  );
  const tasksHref = routeUrl('workItems');

  function renderChartBody(timeline: TimelineResponse, shown: TimelineResponse) {
    if (timeline.workItems.length === 0) {
      return (
        <div className={styles.stateBlock} data-testid="timeline-empty">
          <EmptyState
            messageAs="h2"
            message={t('view.empty.title')}
            description={t('view.empty.description')}
            action={{ label: t('view.empty.action'), href: tasksHref }}
          />
        </div>
      );
    }
    if (!hasWorkItemsWithDates) {
      return (
        <div className={styles.stateBlock} data-testid="timeline-no-dates">
          <EmptyState
            messageAs="h2"
            message={t('view.noDates.title')}
            description={t('view.noDates.description')}
            action={{ label: t('view.noDates.action'), href: tasksHref }}
          />
        </div>
      );
    }
    if (nothingShown) {
      return (
        <div className={styles.stateBlock} data-testid="schedule-filtered-empty">
          <EmptyState
            messageAs="h2"
            message={t('view.filtered.title')}
            description={t('view.filtered.description')}
          />
        </div>
      );
    }
    if (showAgenda) {
      return (
        <ScheduleAgenda
          data={shown}
          selectedKey={activeKey}
          onSelect={handleSelect}
          controlRef={controlRef}
        />
      );
    }
    return (
      <GanttChart
        data={shown}
        zoom={zoom}
        columnWidth={columnWidth}
        showArrows={view.show.has('arrows')}
        highlightCriticalPath={view.show.has('critical')}
        groupBy={view.group}
        areaOrder={areaOrder}
        selectedKey={activeKey}
        previewGhosts={previewGhosts}
        onSelect={handleSelect}
        onCtrlScroll={(delta) => adjustColumnWidth(delta > 0 ? 1 : -1)}
        initialAnchor={initialAnchor}
        onAnchorChange={handleAnchorChange}
        controlRef={controlRef}
      />
    );
  }

  function renderBody() {
    if (loading) return <GanttChartSkeleton />;
    if (data === null || filtered === null) {
      return (
        <div className={styles.stateBlock} data-testid="timeline-error">
          <FormError message={fetchFailureMessage(failure!, tErrors, t('view.error.load'))} />
          {retryButton}
        </div>
      );
    }
    return (
      <>
        {failure !== null && (
          <div className={styles.refreshError} data-testid="schedule-refresh-error">
            <FormError message={fetchFailureMessage(failure, tErrors, t('view.error.load'))} />
            {retryButton}
          </div>
        )}
        {isCalendar ? (
          <CalendarView
            workItems={filtered.data.workItems}
            milestones={filtered.data.milestones}
            householdItems={filtered.data.householdItems}
            dependencies={data.dependencies}
            isEmpty={calendarIsEmpty}
            holdsUp={data.holdsUp}
            onMilestoneClick={handleMilestoneClick}
          />
        ) : (
          renderChartBody(data, filtered.data)
        )}
      </>
    );
  }

  return (
    <div className={styles.page} data-testid="timeline-page">
      <div className={styles.pageHeader}>
        <PageTitle title={viewTitle} className={styles.pageTitle} headingRef={headingRef} />
        <ScheduleToolbar
          view={view}
          variant={isCalendar ? 'calendar' : 'chart'}
          showZoom={!showAgenda}
          onToday={handleToday}
          areas={view.areas}
          legendId={legendId}
          legendOpen={legendOpen}
          onLegendToggle={handleLegendToggle}
          legendToggleRef={legendToggleRef}
        />
      </div>

      {!isCalendar && phone && (
        <div className={styles.phoneToggle}>
          <div className={shared.segmented} role="group" aria-label={t('view.phoneView.ariaLabel')}>
            {SCHEDULE_PHONE_VIEWS.map((mode) => (
              <button
                key={mode}
                type="button"
                className={`${shared.segmentedButton} ${
                  view.phoneView === mode ? shared.segmentedButtonActive : ''
                }`}
                aria-pressed={view.phoneView === mode}
                onClick={() => view.setPhoneView(mode)}
                data-testid={`schedule-phone-view-${mode}`}
              >
                {t(I18N_UNION_KEYS.schedulePhoneView.key(mode))}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isCalendar && (
        <>
          <SchedulePrefill date={showAgenda ? currentWeek : visibleWeek} areaId={view.areaId} />
          <GanttLegend
            open={legendOpen}
            id={legendId}
            returnFocusRef={legendToggleRef}
            doneHidden={filtered?.doneHidden ?? 0}
            showDone={view.show.has('done')}
            onClose={() => setPhoneLegendOpen(false)}
          />
        </>
      )}

      <div className={styles.body}>
        <div className={styles.chartArea} ref={chartAreaRef}>
          {renderBody()}
        </div>
        {!isCalendar && data !== null && (
          <ScheduleItemPanel
            subject={activeKey}
            data={data}
            onClose={handlePanelClose}
            returnFocusRef={openerRef}
            onChanged={refetch}
            onPreviewChange={setPreviewGhosts}
          />
        )}
      </div>
    </div>
  );
}

export default TimelinePage;
