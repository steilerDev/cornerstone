/**
 * CalendarMilestone — diamond marker for a milestone shown in a calendar day cell.
 *
 * Styled consistently with the Gantt diamond markers, using the same CSS tokens.
 * Clicking opens the Milestones panel (via callback).
 */

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { TimelineMilestone } from '@cornerstone/shared';
import styles from './CalendarMilestone.module.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CalendarMilestoneProps {
  milestone: TimelineMilestone;
  /** Called when user clicks or activates the milestone marker. */
  onMilestoneClick?: (milestoneId: number) => void;
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

export function CalendarMilestone({ milestone, onMilestoneClick }: CalendarMilestoneProps) {
  function handleClick() {
    onMilestoneClick?.(milestone.id);
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }

  const statusLabel = milestone.isCompleted ? 'completed' : 'incomplete';

  return (
    <div
      role="button"
      tabIndex={0}
      className={`${styles.milestone} ${milestone.isCompleted ? styles.milestoneComplete : styles.milestoneIncomplete}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`Milestone: ${milestone.title}, ${statusLabel}`}
      title={milestone.title}
      data-testid="calendar-milestone"
    >
      <DiamondIcon completed={milestone.isCompleted} />
      <span className={styles.title}>{milestone.title}</span>
    </div>
  );
}
