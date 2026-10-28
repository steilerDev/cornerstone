import { useId } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { WORK_ITEM_STATUSES } from '@cornerstone/shared';
import type { WorkItemStatus } from '@cornerstone/shared';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { Sheet } from '../Modal/Sheet.js';
import styles from './GanttLegend.module.css';

export interface GanttLegendProps {
  readonly open: boolean;
  /** The element id the Legend button controls (the strip, or the sheet on a phone). */
  readonly id: string;
  /** Rows the Done toggle removed. */
  readonly doneHidden: number;
  /** The Done toggle is on: nothing is hidden by it. */
  readonly showDone: boolean;
  /** Closes the phone sheet. */
  readonly onClose: () => void;
  /** The Legend button: focus returns here when the phone sheet closes. */
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}

const STATUS_CLASS: Record<WorkItemStatus, string> = {
  not_started: styles.statusNotStarted!,
  in_progress: styles.statusInProgress!,
  completed: styles.statusCompleted!,
};

interface LegendEntry {
  readonly key: string;
  readonly swatch: ReactNode;
  readonly label: string;
}

/** A 20x12 swatch; the child draws in a 20x12 box. */
function Swatch({ children }: { children: ReactNode }) {
  return (
    <svg
      className={styles.swatch}
      width="20"
      height="12"
      viewBox="0 0 20 12"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/**
 * The chart's legend (D7, D12): task statuses, late, planned, critical, milestone, delivery and
 * today, drawn from the chart's tokens. An inline strip; below 768 px a bottom sheet.
 */
export function GanttLegend({
  open,
  id,
  doneHidden,
  showDone,
  onClose,
  returnFocusRef,
}: GanttLegendProps) {
  const { t } = useTranslation('schedule');
  const { t: tc } = useTranslation('common');
  const phone = useMediaQuery('(max-width: 767px)');
  const patternId = useId();

  const entries: LegendEntry[] = [
    ...WORK_ITEM_STATUSES.map((status) => ({
      key: status,
      swatch: (
        <Swatch>
          <rect x="0" y="1" width="20" height="10" rx="2" className={STATUS_CLASS[status]} />
        </Swatch>
      ),
      label: tc(I18N_UNION_KEYS.statusVocabularyTask.key(status)),
    })),
    {
      key: 'late',
      swatch: (
        <Swatch>
          <defs>
            <pattern
              id={patternId}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="6" className={styles.hatchLine} />
            </pattern>
          </defs>
          <rect x="0" y="1" width="20" height="10" rx="2" className={styles.statusNotStarted} />
          <rect
            x="1"
            y="2"
            width="18"
            height="8"
            rx="1"
            fill={`url(#${patternId})`}
            className={styles.lateOutline}
          />
        </Swatch>
      ),
      label: t('view.legend.late'),
    },
    {
      key: 'planned',
      swatch: (
        <Swatch>
          <rect x="1" y="2" width="18" height="8" rx="2" className={styles.planned} />
        </Swatch>
      ),
      label: t('view.legend.planned'),
    },
    {
      key: 'critical',
      swatch: (
        <Swatch>
          <rect
            x="1"
            y="2"
            width="18"
            height="8"
            rx="2"
            className={`${styles.statusInProgress} ${styles.critical}`}
          />
        </Swatch>
      ),
      label: t('view.legend.critical'),
    },
    {
      key: 'milestone',
      swatch: (
        <Swatch>
          <polygon points="10,0 16,6 10,12 4,6" className={styles.milestone} />
        </Swatch>
      ),
      label: t('view.legend.milestone'),
    },
    {
      key: 'delivery',
      swatch: (
        <Swatch>
          <circle cx="10" cy="6" r="4.5" className={styles.delivery} />
        </Swatch>
      ),
      label: t('view.legend.delivery'),
    },
    {
      key: 'today',
      swatch: (
        <Swatch>
          <line x1="10" y1="0" x2="10" y2="12" className={styles.todayLine} />
        </Swatch>
      ),
      label: t('view.legend.today'),
    },
  ];

  const doneHiddenNote = !showDone && doneHidden > 0;

  const list = (
    <ul className={styles.list}>
      {entries.map((entry) => (
        <li key={entry.key} className={styles.entry}>
          {entry.swatch}
          <span>{entry.label}</span>
        </li>
      ))}
      {doneHiddenNote && (
        <li className={styles.doneHidden} data-testid="schedule-legend-done-hidden">
          {t('view.legend.doneHidden', { count: doneHidden })}
        </li>
      )}
    </ul>
  );

  if (phone) {
    return (
      <Sheet
        id={id}
        open={open}
        onClose={onClose}
        returnFocusRef={returnFocusRef}
        title={t('view.legend.title')}
        variant="bottom"
        testId="schedule-legend"
      >
        {list}
      </Sheet>
    );
  }

  if (!open) return null;

  return (
    <div id={id} className={styles.strip} data-testid="schedule-legend">
      {list}
    </div>
  );
}
