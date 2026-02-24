import { createPortal } from 'react-dom';
import type { WorkItemStatus } from '@cornerstone/shared';
import styles from './GanttTooltip.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GanttTooltipData {
  title: string;
  status: WorkItemStatus;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  assignedUserName: string | null;
}

export interface GanttTooltipPosition {
  /** Mouse X in viewport coordinates. */
  x: number;
  /** Mouse Y in viewport coordinates. */
  y: number;
}

interface GanttTooltipProps {
  data: GanttTooltipData;
  position: GanttTooltipPosition;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<WorkItemStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
};

const STATUS_BADGE_CLASSES: Record<WorkItemStatus, string> = {
  not_started: styles.statusNotStarted,
  in_progress: styles.statusInProgress,
  completed: styles.statusCompleted,
  blocked: styles.statusBlocked,
};

const TOOLTIP_WIDTH = 240;
const TOOLTIP_HEIGHT_ESTIMATE = 130;
const OFFSET_X = 12;
const OFFSET_Y = 8;

function formatDisplayDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  // Input is YYYY-MM-DD; format to a readable form
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(days: number | null): string {
  if (days === null) return '—';
  if (days === 1) return '1 day';
  return `${days} days`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * GanttTooltip renders a positioned tooltip for a hovered Gantt bar.
 *
 * Rendered as a portal to document.body to avoid SVG clipping issues.
 * Position is derived from mouse viewport coordinates with flip logic
 * to avoid overflowing the viewport edges.
 */
export function GanttTooltip({ data, position }: GanttTooltipProps) {
  // Compute tooltip x/y, flipping to avoid viewport overflow
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

  let tooltipX = position.x + OFFSET_X;
  let tooltipY = position.y + OFFSET_Y;

  // Flip horizontally if it would overflow the right edge
  if (tooltipX + TOOLTIP_WIDTH > viewportWidth - 8) {
    tooltipX = position.x - TOOLTIP_WIDTH - OFFSET_X;
  }

  // Flip vertically if it would overflow the bottom edge
  if (tooltipY + TOOLTIP_HEIGHT_ESTIMATE > viewportHeight - 8) {
    tooltipY = position.y - TOOLTIP_HEIGHT_ESTIMATE - OFFSET_Y;
  }

  const content = (
    <div
      className={styles.tooltip}
      role="tooltip"
      style={{ left: tooltipX, top: tooltipY, width: TOOLTIP_WIDTH }}
      data-testid="gantt-tooltip"
    >
      {/* Header: title + status badge */}
      <div className={styles.header}>
        <span className={styles.title}>{data.title}</span>
        <span className={`${styles.statusBadge} ${STATUS_BADGE_CLASSES[data.status]}`}>
          {STATUS_LABELS[data.status]}
        </span>
      </div>

      <div className={styles.separator} aria-hidden="true" />

      {/* Date range */}
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>Start</span>
        <span className={styles.detailValue}>{formatDisplayDate(data.startDate)}</span>
      </div>
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>End</span>
        <span className={styles.detailValue}>{formatDisplayDate(data.endDate)}</span>
      </div>

      {/* Duration */}
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>Duration</span>
        <span className={styles.detailValue}>{formatDuration(data.durationDays)}</span>
      </div>

      {/* Assigned user */}
      {data.assignedUserName !== null && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Owner</span>
          <span className={styles.detailValue}>{data.assignedUserName}</span>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}
