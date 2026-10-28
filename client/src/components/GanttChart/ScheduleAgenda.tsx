import { useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { TimelineResponse } from '@cornerstone/shared';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUserText } from '../../hooks/useUserText.js';
import { useFormatters } from '../../lib/formatters.js';
import { todayLocalIsoDate } from '../../lib/localDate.js';
import { milestoneBadgeProps, milestoneDisplayStatus } from '../../lib/milestoneStatusLabel.js';
import { purchaseLateDays, scheduleSignalOf } from '../../lib/scheduleDates.js';
import type { ScheduleSignalState } from '../../lib/scheduleDates.js';
import { isLateTask } from '../../lib/scheduleView.js';
import type { ScheduleRowKey } from '../../lib/scheduleView.js';
import { Badge, type BadgeVariantMap } from '../Badge/Badge.js';
import { scheduleSignalBadgeProps } from '../Badge/statusBadgeVariants.js';
import { buildAgendaWeeks, weekBar } from './agendaWeeks.js';
import type { AgendaItem } from './agendaWeeks.js';
import styles from './ScheduleAgenda.module.css';

export interface ScheduleAgendaProps {
  /** The filtered timeline. */
  readonly data: TimelineResponse;
  readonly selectedKey: ScheduleRowKey | null;
  readonly onSelect: (key: ScheduleRowKey, opener: HTMLElement) => void;
  readonly controlRef?: RefObject<{ scrollToToday(): void } | null>;
}

type Tone = 'notStarted' | 'inProgress' | 'completed';

interface RowView {
  title: string;
  subtitle: string | null;
  tone: Tone;
  late: boolean;
  statusBadge: { variants: BadgeVariantMap; value: string };
  signal: ScheduleSignalState | null;
}

const TASK_TONE = {
  not_started: 'notStarted',
  in_progress: 'inProgress',
  completed: 'completed',
} as const satisfies Record<string, Tone>;

const PURCHASE_TONE = {
  planned: 'notStarted',
  purchased: 'inProgress',
  scheduled: 'inProgress',
  arrived: 'completed',
} as const satisfies Record<string, Tone>;

export function ScheduleAgenda({ data, selectedKey, onSelect, controlRef }: ScheduleAgendaProps) {
  const { t } = useTranslation('schedule');
  const { t: tCommon } = useTranslation('common');
  const { formatDayRange } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const userText = useUserText();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const todayKey = todayLocalIsoDate();
  const weeks = useMemo(() => buildAgendaWeeks(data, todayKey), [data, todayKey]);

  const weekHeaderRef = useRef(new Map<string, HTMLElement>());
  const positionedRef = useRef(false);

  const scrollToTarget = useCallback(
    (behavior: ScrollBehavior) => {
      const target = weeks.find((week) => week.isTarget);
      if (target)
        weekHeaderRef.current.get(target.monday)!.scrollIntoView({ block: 'start', behavior });
    },
    [weeks],
  );

  // First positioning runs once per mount; a refetch never moves the list.
  useEffect(() => {
    if (positionedRef.current || weeks.length === 0) return;
    positionedRef.current = true;
    scrollToTarget('auto');
  }, [weeks, scrollToTarget]);

  useImperativeHandle(
    controlRef,
    () => ({ scrollToToday: () => scrollToTarget(reducedMotion ? 'auto' : 'smooth') }),
    [scrollToTarget, reducedMotion],
  );

  function describe(entry: AgendaItem): RowView {
    if (entry.kind === 'task') {
      const { item } = entry;
      const late = isLateTask(item);
      return {
        title: item.title,
        subtitle: [item.area?.name, item.assignedVendor?.name].filter(Boolean).join(' · ') || null,
        tone: TASK_TONE[item.status],
        late,
        statusBadge: { variants: statusVariants.task, value: item.status },
        signal: late ? scheduleSignalOf(item) : null,
      };
    }
    if (entry.kind === 'milestone') {
      const { item } = entry;
      const { status } = milestoneDisplayStatus(item);
      return {
        title: item.title,
        subtitle: null,
        tone: item.isCompleted ? 'completed' : 'inProgress',
        late: status === 'late',
        statusBadge: milestoneBadgeProps(statusVariants.milestone, tCommon, item),
        signal: null,
      };
    }
    const { item } = entry;
    const lateDays = purchaseLateDays(item, todayKey);
    return {
      title: item.name,
      subtitle: item.area?.name ?? null,
      tone: PURCHASE_TONE[item.status],
      late: item.isLate,
      statusBadge: { variants: statusVariants.purchase, value: item.status },
      signal: lateDays > 0 ? { signal: 'late', days: lateDays } : null,
    };
  }

  return (
    <section
      className={styles.agenda}
      aria-label={t('view.agenda.ariaLabel')}
      data-testid="schedule-agenda"
    >
      {weeks.map((week) => (
        <div key={week.monday} className={styles.week}>
          <h2
            ref={(node) => {
              if (node) weekHeaderRef.current.set(week.monday, node);
              else weekHeaderRef.current.delete(week.monday);
            }}
            className={styles.weekHeader}
            aria-current={week.isCurrent ? 'date' : undefined}
            data-testid={`schedule-agenda-week-${week.monday}`}
          >
            {t('view.agenda.week', {
              number: week.number,
              range: formatDayRange(week.monday, week.sunday),
            })}
          </h2>
          <ul className={styles.list}>
            {week.items.map((entry) => {
              const row = describe(entry);
              const bar = weekBar(entry, week.monday);
              const fillStyle: CSSProperties = {
                left: `${bar.leftPct}%`,
                width: `${bar.widthPct}%`,
              };
              const diamondStyle: CSSProperties = { left: `${bar.centrePct}%` };
              return (
                <li key={entry.key} className={styles.item}>
                  <button
                    type="button"
                    className={styles.row}
                    aria-current={selectedKey === entry.key ? 'true' : undefined}
                    data-selected={selectedKey === entry.key ? 'true' : undefined}
                    data-testid={`schedule-agenda-row-${entry.key}-${week.monday}`}
                    onClick={(event) => onSelect(entry.key, event.currentTarget)}
                  >
                    <span {...userText(styles.title)}>{row.title}</span>
                    {row.subtitle && <span {...userText(styles.subtitle)}>{row.subtitle}</span>}
                    <span className={styles.badges}>
                      <Badge {...row.statusBadge} />
                      {row.signal && (
                        <Badge
                          {...scheduleSignalBadgeProps(row.signal, statusVariants.scheduleSignal)}
                        />
                      )}
                    </span>
                    <span className={styles.track} aria-hidden="true">
                      {entry.kind === 'milestone' ? (
                        <span
                          className={`${styles.diamond} ${styles[row.tone]} ${row.late ? styles.lateDiamond : ''}`}
                          style={diamondStyle}
                        />
                      ) : (
                        <span
                          className={`${styles.fill} ${styles[row.tone]} ${row.late ? styles.late : ''}`}
                          style={fillStyle}
                        />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
