import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useTimeline } from '../../hooks/useTimeline.js';
import { runSchedule } from '../../lib/scheduleApi.js';
import { updateWorkItem } from '../../lib/workItemsApi.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { GanttChart, GanttChartSkeleton } from '../../components/GanttChart/GanttChart.js';
import type { ZoomLevel } from '../../components/GanttChart/ganttUtils.js';
import type { ScheduledItem } from '@cornerstone/shared';
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

function AutoScheduleIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
      style={{
        display: 'block',
        animation: spinning ? 'spin 0.8s linear infinite' : undefined,
      }}
    >
      <path
        d="M10 3a7 7 0 100 14A7 7 0 0010 3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray={spinning ? '22 10' : '44 0'}
      />
      {!spinning && (
        <>
          {/* Clock hands */}
          <line
            x1="10"
            y1="6"
            x2="10"
            y2="10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <line
            x1="10"
            y1="10"
            x2="13"
            y2="12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ZOOM_OPTIONS: { value: ZoomLevel; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

// ---------------------------------------------------------------------------
// Auto-schedule confirmation dialog
// ---------------------------------------------------------------------------

interface AutoScheduleDialogProps {
  scheduledItems: ScheduledItem[];
  isApplying: boolean;
  applyError: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function AutoScheduleDialog({
  scheduledItems,
  isApplying,
  applyError,
  onConfirm,
  onCancel,
}: AutoScheduleDialogProps) {
  // Count items with changed dates
  const changedCount = scheduledItems.filter(
    (item) =>
      item.scheduledStartDate !== item.previousStartDate ||
      item.scheduledEndDate !== item.previousEndDate,
  ).length;

  const content = (
    <div
      className={styles.dialogOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auto-schedule-dialog-title"
      data-testid="auto-schedule-dialog"
    >
      <div className={styles.dialog}>
        <div className={styles.dialogHeader}>
          <h2 id="auto-schedule-dialog-title" className={styles.dialogTitle}>
            Auto-Schedule Preview
          </h2>
        </div>

        <div className={styles.dialogBody}>
          <p className={styles.dialogDescription}>
            The scheduling engine has calculated optimal dates using the Critical Path Method.
            {changedCount > 0 ? (
              <>
                {' '}
                <strong>{changedCount} work item{changedCount !== 1 ? 's' : ''}</strong> will have
                their dates updated.
              </>
            ) : (
              ' No date changes are needed — your schedule is already optimal.'
            )}
          </p>

          {scheduledItems.length > 0 && (
            <div className={styles.dialogItemList} aria-label="Scheduled items preview">
              <div className={styles.dialogItemListHeader}>
                <span>Work Item</span>
                <span>New Start</span>
                <span>New End</span>
              </div>
              {scheduledItems.slice(0, 10).map((item) => {
                const hasChanged =
                  item.scheduledStartDate !== item.previousStartDate ||
                  item.scheduledEndDate !== item.previousEndDate;
                return (
                  <div
                    key={item.workItemId}
                    className={`${styles.dialogItemRow} ${hasChanged ? styles.dialogItemRowChanged : ''}`}
                  >
                    <span className={styles.dialogItemId} title={item.workItemId}>
                      {item.workItemId.substring(0, 8)}…
                    </span>
                    <span className={styles.dialogItemDate}>{item.scheduledStartDate}</span>
                    <span className={styles.dialogItemDate}>{item.scheduledEndDate}</span>
                  </div>
                );
              })}
              {scheduledItems.length > 10 && (
                <div className={styles.dialogItemMore}>
                  +{scheduledItems.length - 10} more items
                </div>
              )}
            </div>
          )}

          {applyError !== null && (
            <div className={styles.dialogError} role="alert">
              {applyError}
            </div>
          )}
        </div>

        <div className={styles.dialogFooter}>
          <button
            type="button"
            className={styles.dialogButtonCancel}
            onClick={onCancel}
            disabled={isApplying}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.dialogButtonConfirm}
            onClick={onConfirm}
            disabled={isApplying || changedCount === 0}
            data-testid="auto-schedule-confirm"
          >
            {isApplying ? 'Applying…' : `Apply ${changedCount} Change${changedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

// ---------------------------------------------------------------------------
// Format date for toast display
// ---------------------------------------------------------------------------

function formatDateShort(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// TimelinePage
// ---------------------------------------------------------------------------

export function TimelinePage() {
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const [showArrows, setShowArrows] = useState(true);
  const { data, isLoading, error, refetch, updateItemDates } = useTimeline();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // ---- Auto-schedule state ----
  const [isScheduleLoading, setIsScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduledItems, setScheduledItems] = useState<ScheduledItem[] | null>(null);
  const [isApplyingSchedule, setIsApplyingSchedule] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const handleItemClick = useCallback(
    (id: string) => {
      void navigate(`/work-items/${id}`);
    },
    [navigate],
  );

  const hasWorkItemsWithDates =
    data !== null &&
    data.workItems.some((item) => item.startDate !== null || item.endDate !== null);

  const isEmpty = data !== null && data.workItems.length === 0;

  // ---- Drag-drop callbacks ----

  const handleItemRescheduled = useCallback(
    (
      _itemId: string,
      oldStartDate: string,
      oldEndDate: string,
      newStartDate: string,
      newEndDate: string,
    ) => {
      showToast(
        'success',
        `Rescheduled: ${formatDateShort(oldStartDate)}–${formatDateShort(oldEndDate)} → ${formatDateShort(newStartDate)}–${formatDateShort(newEndDate)}`,
      );
    },
    [showToast],
  );

  const handleItemRescheduleError = useCallback(() => {
    showToast('error', 'Failed to save new dates. Please try again.');
  }, [showToast]);

  // ---- Auto-schedule ----

  async function handleAutoScheduleClick() {
    setIsScheduleLoading(true);
    setScheduleError(null);

    try {
      const result = await runSchedule({ mode: 'full' });
      setScheduledItems(result.scheduledItems);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setScheduleError(err.error.message ?? 'Failed to run scheduling engine.');
      } else if (err instanceof NetworkError) {
        setScheduleError('Network error. Please check your connection.');
      } else {
        setScheduleError('An unexpected error occurred.');
      }
    } finally {
      setIsScheduleLoading(false);
    }
  }

  async function handleApplySchedule() {
    if (!scheduledItems) return;
    setIsApplyingSchedule(true);
    setApplyError(null);

    const itemsToUpdate = scheduledItems.filter(
      (item) =>
        item.scheduledStartDate !== item.previousStartDate ||
        item.scheduledEndDate !== item.previousEndDate,
    );

    try {
      // Apply all PATCH requests in parallel
      await Promise.all(
        itemsToUpdate.map((item) =>
          updateWorkItem(item.workItemId, {
            startDate: item.scheduledStartDate,
            endDate: item.scheduledEndDate,
          }),
        ),
      );

      setScheduledItems(null);
      refetch();
      showToast(
        'success',
        `Auto-schedule applied: ${itemsToUpdate.length} item${itemsToUpdate.length !== 1 ? 's' : ''} updated.`,
      );
    } catch (err) {
      if (err instanceof ApiClientError) {
        setApplyError(err.error.message ?? 'Failed to apply schedule.');
      } else {
        setApplyError('Failed to apply schedule. Please try again.');
      }
    } finally {
      setIsApplyingSchedule(false);
    }
  }

  function handleCancelSchedule() {
    setScheduledItems(null);
    setApplyError(null);
  }

  return (
    <div className={styles.page} data-testid="timeline-page">
      {/* Page header: title + toolbar (auto-schedule + arrows toggle + zoom toggle) */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Timeline</h1>

        <div className={styles.toolbar}>
          {/* Auto-schedule button */}
          <button
            type="button"
            className={styles.autoScheduleButton}
            onClick={() => void handleAutoScheduleClick()}
            disabled={isScheduleLoading || isLoading}
            title="Auto-schedule work items using Critical Path Method"
            aria-label="Auto-schedule work items"
            data-testid="auto-schedule-button"
          >
            <AutoScheduleIcon spinning={isScheduleLoading} />
            <span>Auto-schedule</span>
          </button>

          {scheduleError !== null && (
            <span className={styles.scheduleError} role="alert">
              {scheduleError}
            </span>
          )}

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
        </div>
      </div>

      {/* Chart area */}
      <div className={styles.chartArea}>
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

        {/* Empty state */}
        {!isLoading && error === null && isEmpty && (
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
            <Link to="/work-items" className={styles.emptyStateLink}>
              Go to Work Items
            </Link>
          </div>
        )}

        {/* No-dates warning — items exist but none have dates set */}
        {!isLoading && error === null && !isEmpty && !hasWorkItemsWithDates && data !== null && (
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
              Your work items don&apos;t have start and end dates yet. Set dates on your work items
              to see them positioned on the timeline.
            </p>
            <Link to="/work-items" className={styles.emptyStateLink}>
              Go to Work Items
            </Link>
          </div>
        )}

        {/* Gantt chart (data loaded, has work items) */}
        {!isLoading && error === null && data !== null && data.workItems.length > 0 && (
          <GanttChart
            data={data}
            zoom={zoom}
            onItemClick={handleItemClick}
            showArrows={showArrows}
            onItemRescheduled={handleItemRescheduled}
            onItemRescheduleError={handleItemRescheduleError}
            onUpdateItemDates={updateItemDates}
          />
        )}
      </div>

      {/* Auto-schedule confirmation dialog */}
      {scheduledItems !== null && (
        <AutoScheduleDialog
          scheduledItems={scheduledItems}
          isApplying={isApplyingSchedule}
          applyError={applyError}
          onConfirm={() => void handleApplySchedule()}
          onCancel={handleCancelSchedule}
        />
      )}
    </div>
  );
}

export default TimelinePage;
