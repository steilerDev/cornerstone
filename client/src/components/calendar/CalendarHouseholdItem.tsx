import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TimelineHouseholdItem } from '@cornerstone/shared';
import styles from './CalendarHouseholdItem.module.css';

export interface CalendarHouseholdItemProps {
  item: TimelineHouseholdItem;
  onMouseEnter?: (itemId: string, mouseX: number, mouseY: number) => void;
  onMouseLeave?: () => void;
  onMouseMove?: (mouseX: number, mouseY: number) => void;
  compact?: boolean;
  isTouchDevice?: boolean;
  activeTouchId?: string | null;
  onTouchTap?: (itemId: string, onNavigate: () => void) => void;
}

function CircleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 8 8"
      width="8"
      height="8"
      aria-hidden="true"
    >
      <circle cx="4" cy="4" r="3.5" fill="currentColor" />
    </svg>
  );
}

export function CalendarHouseholdItem({
  item,
  onMouseEnter,
  onMouseLeave,
  onMouseMove,
  isTouchDevice = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  activeTouchId = null,
  onTouchTap,
}: CalendarHouseholdItemProps) {
  const navigate = useNavigate();

  function handleNavigate() {
    navigate(`/household-items/${item.id}`);
  }

  function handleClick() {
    if (isTouchDevice && onTouchTap) {
      onTouchTap(item.id, handleNavigate);
    } else {
      handleNavigate();
    }
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }

  const isArrived = item.status === 'arrived';
  const statusLabel = item.status.replace(/_/g, ' ');

  return (
    <div
      role="button"
      tabIndex={0}
      className={`${styles.hiItem} ${isArrived ? styles.arrived : styles.default}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={(e: ReactMouseEvent<HTMLDivElement>) =>
        onMouseEnter?.(item.id, e.clientX, e.clientY)
      }
      onMouseLeave={() => onMouseLeave?.()}
      onMouseMove={(e: ReactMouseEvent<HTMLDivElement>) => onMouseMove?.(e.clientX, e.clientY)}
      aria-label={`Household item: ${item.name}, ${statusLabel}, delivery ${item.earliestDeliveryDate ?? 'unscheduled'}`}
      aria-describedby="calendar-view-tooltip"
      data-testid="calendar-hi-item"
    >
      <CircleIcon />
      <span className={styles.name}>{item.name}</span>
    </div>
  );
}
