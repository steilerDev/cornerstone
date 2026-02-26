/**
 * CalendarMilestone — diamond marker for a milestone shown in a calendar day cell.
 *
 * Styled consistently with the Gantt diamond markers, using the same CSS tokens.
 * Clicking opens the Milestones panel (via callback).
 */

import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { TimelineMilestone } from '@cornerstone/shared';
import styles from './CalendarMilestone.module.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CalendarMilestoneProps {
  milestone: TimelineMilestone;
  /** Called when user clicks or activates the milestone marker. */
  onMilestoneClick?: (milestoneId: number) => void;
  /**
   * Called when mouse enters the milestone marker — passes milestone ID and
   * mouse viewport coordinates for tooltip positioning.
   */
  onMouseEnter?: (milestoneId: number, mouseX: number, mouseY: number) => void;
  /** Called when mouse leaves the milestone marker. */
  onMouseLeave?: () => void;
  /** Called when mouse moves over the milestone marker — for updating tooltip position. */
  onMouseMove?: (mouseX: number, mouseY: number) => void;
}

// ---------------------------------------------------------------------------
// Diamond icon
// ---------------------------------------------------------------------------

function DiamondIcon({ completed }: { completed: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 10 10"
      width="10"
      height="10"
      aria-hidden="true"
      className={completed ? styles.diamondComplete : styles.diamondIncomplete}
      style={{ flexShrink: 0 }}
    >
      <polygon points="5,0 10,5 5,10 0,5" strokeWidth="1.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CalendarMilestone({
  milestone,
  onMilestoneClick,
  onMouseEnter,
  onMouseLeave,
  onMouseMove,
}: CalendarMilestoneProps) {
  function handleClick() {
    onMilestoneClick?.(milestone.id);
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }

  function handleMouseEnter(e: ReactMouseEvent<HTMLDivElement>) {
    onMouseEnter?.(milestone.id, e.clientX, e.clientY);
  }

  function handleMouseMove(e: ReactMouseEvent<HTMLDivElement>) {
    onMouseMove?.(e.clientX, e.clientY);
  }

  const statusLabel = milestone.isCompleted ? 'completed' : 'incomplete';

  return (
    <div
      role="button"
      tabIndex={0}
      className={`${styles.milestone} ${milestone.isCompleted ? styles.milestoneComplete : styles.milestoneIncomplete}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => onMouseLeave?.()}
      onMouseMove={handleMouseMove}
      aria-label={`Milestone: ${milestone.title}, ${statusLabel}`}
      aria-describedby="calendar-view-tooltip"
      data-testid="calendar-milestone"
    >
      <DiamondIcon completed={milestone.isCompleted} />
      <span className={styles.title}>{milestone.title}</span>
    </div>
  );
}
