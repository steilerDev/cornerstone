import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTimeline } from '../../hooks/useTimeline.js';
import { GanttChart, GanttChartSkeleton } from '../../components/GanttChart/GanttChart.js';
import type { ZoomLevel } from '../../components/GanttChart/ganttUtils.js';
import styles from './TimelinePage.module.css';

const ZOOM_OPTIONS: { value: ZoomLevel; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export function TimelinePage() {
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const { data, isLoading, error, refetch } = useTimeline();
  const navigate = useNavigate();

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

  return (
    <div className={styles.page} data-testid="timeline-page">
      {/* Page header: title + zoom toggle */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Timeline</h1>

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
          <GanttChart data={data} zoom={zoom} onItemClick={handleItemClick} />
        )}
      </div>
    </div>
  );
}

export default TimelinePage;
