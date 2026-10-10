import { routeUrl } from '@cornerstone/shared';
import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../lib/formatters.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import type { TimelineHouseholdItem } from '@cornerstone/shared';
import styles from './CalendarHouseholdItem.module.css';

export interface CalendarHouseholdItemProps {
  item: TimelineHouseholdItem;
  onMouseEnter?: (itemId: string, mouseX: number, mouseY: number) => void;
  onMouseLeave?: () => void;
  onMouseMove?: (mouseX: number, mouseY: number) => void;
  compact?: boolean;
  /** Phone week view: 44px hit area (visible chip unchanged). */
  touchSized?: boolean;
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
  touchSized = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  activeTouchId = null,
  onTouchTap,
}: CalendarHouseholdItemProps) {
  const { t } = useTranslation('schedule');
  const { purchase } = useStatusBadgeVariants();
  const { formatDate } = useFormatters();
  const navigate = useNavigate();
  const originState = useOriginState();

  function handleNavigate() {
    navigate(routeUrl('householdItem', { id: item.id }), { state: originState });
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

  const statusLabel = purchase[item.status].label;
  // The date the chip is drawn on (see getHouseholdItemsForDay).
  const chipDate = item.actualDeliveryDate ?? item.targetDeliveryDate;

  function handleFocus(e: ReactFocusEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    onMouseEnter?.(item.id, r.left + r.width / 2, r.top + r.height / 2);
  }

  const ariaLabel = chipDate
    ? t(
        item.area ? 'calendar.householdItem.ariaLabelWithArea' : 'calendar.householdItem.ariaLabel',
        {
          name: item.name,
          status: statusLabel,
          area: item.area?.name ?? '',
          date: formatDate(chipDate),
        },
      )
    : t('calendar.householdItem.ariaLabelUnscheduled', {
        name: item.name,
        status: statusLabel,
        date: '',
      });

  return (
    <div
      role="button"
      tabIndex={0}
      className={`${styles.hiItem} ${purchase[item.status].className} ${touchSized ? styles.touchSized : ''}`}
      data-status={item.status}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={(e: ReactMouseEvent<HTMLDivElement>) =>
        onMouseEnter?.(item.id, e.clientX, e.clientY)
      }
      onMouseLeave={() => onMouseLeave?.()}
      onMouseMove={(e: ReactMouseEvent<HTMLDivElement>) => onMouseMove?.(e.clientX, e.clientY)}
      onFocus={handleFocus}
      onBlur={() => onMouseLeave?.()}
      aria-label={ariaLabel}
      aria-describedby="calendar-view-tooltip"
      data-testid="calendar-hi-item"
    >
      <CircleIcon />
      <span className={styles.name}>{item.name}</span>
    </div>
  );
}
