import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../lib/formatters.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
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
  const { t } = useTranslation('schedule');
  const { t: tCommon } = useTranslation('common');
  const { formatDate } = useFormatters();
  const navigate = useNavigate();

  function handleNavigate() {
    navigate(`/project/household-items/${item.id}`);
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
  const statusLabel = tCommon(I18N_UNION_KEYS.statusVocabularyPurchase.key(item.status));

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
      aria-label={t(
        item.earliestDeliveryDate
          ? 'calendar.householdItem.ariaLabel'
          : 'calendar.householdItem.ariaLabelUnscheduled',
        {
          name: item.name,
          status: statusLabel,
          date: item.earliestDeliveryDate ? formatDate(item.earliestDeliveryDate) : '',
        },
      )}
      aria-describedby="calendar-view-tooltip"
      data-testid="calendar-hi-item"
    >
      <CircleIcon />
      <span className={styles.name}>{item.name}</span>
    </div>
  );
}
