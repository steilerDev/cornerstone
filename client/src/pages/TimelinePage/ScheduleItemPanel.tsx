import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type {
  HouseholdItemStatus,
  MilestoneCompletionState,
  TimelineResponse,
  TimelineWorkItem,
  WorkItemStatus,
} from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { scheduleSignalBadgeProps } from '../../components/Badge/statusBadgeVariants.js';
import type { GanttPreviewGhost } from '../../components/GanttChart/GanttChart.js';
import { CallButton } from '../../components/CallButton/CallButton.js';
import { SidePanel } from '../../components/Modal/SidePanel.js';
import { ReschedulePanel } from '../../components/ReschedulePanel/ReschedulePanel.js';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu.js';
import {
  milestoneTransitions,
  purchaseTransitions,
  taskTransitions,
} from '../../components/StatusMenu/statusVocabularies.js';
import { useLocale } from '../../contexts/LocaleContext.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUndoableStatusChange } from '../../hooks/useUndoableStatusChange.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { toBcp47Locale, useFormatters } from '../../lib/formatters.js';
import { todayLocalIsoDate } from '../../lib/localDate.js';
import { milestoneBadgeProps } from '../../lib/milestoneStatusLabel.js';
import {
  barDates,
  plannedRangeText,
  scheduleSignalOf,
  showsPlannedRow,
} from '../../lib/scheduleDates.js';
import { purchaseLateDays } from '../../lib/scheduleDates.js';
import type { ScheduleSignalState } from '../../lib/scheduleDates.js';
import type { ScheduleRowKey } from '../../lib/scheduleView.js';
import {
  changeHouseholdItemStatus,
  changeMilestoneStatus,
  changeWorkItemStatus,
  householdItemStatusBody,
  milestoneStatusBody,
  workItemStatusBody,
} from '../../lib/statusChangeApi.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import type { OriginState } from '../../navigation/origin.js';
import sharedStyles from '../../styles/shared.module.css';
import {
  buildPreviewGhosts,
  buildScheduleRelations,
  resolveScheduleSubject,
  scheduleSubjectTitle,
} from './scheduleRelations.js';
import type { RelationLabel, ScheduleRelationRow, ScheduleSubject } from './scheduleRelations.js';
import styles from './ScheduleItemPanel.module.css';

const PANEL_TEST_ID = 'schedule-panel';

export interface ScheduleItemPanelProps {
  /** The row the panel shows; null closes it. */
  readonly subject: ScheduleRowKey | null;
  /** The unfiltered timeline. */
  readonly data: TimelineResponse;
  readonly onClose: () => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  /** Something was saved: the page reloads the timeline. */
  readonly onChanged: () => void;
  readonly onPreviewChange: (ghosts: readonly GanttPreviewGhost[]) => void;
}

function subjectUrl(subject: ScheduleSubject): string {
  if (subject.kind === 'task') return routeUrl('workItem', { id: subject.item.id });
  if (subject.kind === 'milestone') return routeUrl('milestone', { id: subject.item.id });
  return routeUrl('householdItem', { id: subject.item.id });
}

// ── Status ─────────────────────────────────────────────────────────────────────────────────

interface SubjectStatusProps {
  readonly subject: ScheduleSubject;
  readonly onChanged: () => void;
  readonly focusFallbackRef: RefObject<HTMLElement | null>;
}

/** The status control of the row: the same StatusMenu and Undo as every other surface. */
function SubjectStatus({ subject, onChanged, focusFallbackRef }: SubjectStatusProps) {
  const { t } = useTranslation('common');
  const variants = useStatusBadgeVariants();
  const { run } = useUndoableStatusChange();

  if (subject.kind === 'task') {
    const item = subject.item;
    return (
      <StatusMenu<WorkItemStatus>
        transitions={taskTransitions(t, item)}
        badge={{ variants: variants.task, value: item.status }}
        currentLabel={variants.task[item.status].label}
        focusFallbackRef={focusFallbackRef}
        onApply={(to, date) =>
          run({
            request: () => changeWorkItemStatus(item.id, workItemStatusBody(to, date)),
            recordName: item.title,
            statusLabel: variants.task[to].label,
            dedupeKey: `task:${item.id}`,
            onChanged,
            onUndone: onChanged,
          })
        }
        testId="schedule-panel-status"
      />
    );
  }

  if (subject.kind === 'purchase') {
    const item = subject.item;
    return (
      <StatusMenu<HouseholdItemStatus>
        transitions={purchaseTransitions(t, item)}
        badge={{ variants: variants.purchase, value: item.status }}
        currentLabel={variants.purchase[item.status].label}
        focusFallbackRef={focusFallbackRef}
        onApply={(to, date) =>
          run({
            request: () => changeHouseholdItemStatus(item.id, householdItemStatusBody(to, date)),
            recordName: item.name,
            statusLabel: variants.purchase[to].label,
            dedupeKey: `purchase:${item.id}`,
            onChanged,
            onUndone: onChanged,
          })
        }
        testId="schedule-panel-status"
      />
    );
  }

  const item = subject.item;
  const badge = milestoneBadgeProps(variants.milestone, t, item);
  return (
    <StatusMenu<MilestoneCompletionState>
      transitions={milestoneTransitions(t, item)}
      badge={badge}
      currentLabel={badge.variants[badge.value]!.label}
      focusFallbackRef={focusFallbackRef}
      onApply={(to, date) =>
        run({
          request: () => changeMilestoneStatus(item.id, milestoneStatusBody(to, date)),
          recordName: item.title,
          statusLabel: variants.milestone[to === 'reached' ? 'reached' : 'upcoming'].label,
          dedupeKey: `milestone:${item.id}`,
          onChanged,
          onUndone: onChanged,
        })
      }
      testId="schedule-panel-status"
    />
  );
}

/** The plain status chip of a related row (no menu). */
function RelationStatusBadge({ subject }: { readonly subject: ScheduleSubject }) {
  const { t } = useTranslation('common');
  const variants = useStatusBadgeVariants();
  if (subject.kind === 'task') {
    return <Badge variants={variants.task} value={subject.item.status} />;
  }
  if (subject.kind === 'purchase') {
    return <Badge variants={variants.purchase} value={subject.item.status} />;
  }
  const badge = milestoneBadgeProps(variants.milestone, t, subject.item);
  return <Badge variants={badge.variants} value={badge.value} />;
}

/** Late / Held up chip (decision D7) and the Critical chip of the open row. */
function SignalBadges({
  subject,
  data,
}: {
  readonly subject: ScheduleSubject;
  readonly data: TimelineResponse;
}) {
  const { scheduleSignal, criticalSignal } = useStatusBadgeVariants();
  let signal: ScheduleSignalState | null = null;
  let critical = false;
  if (subject.kind === 'task') {
    signal = subject.item.status === 'completed' ? null : scheduleSignalOf(subject.item);
    critical = data.criticalPath.includes(subject.item.id);
  } else if (subject.kind === 'purchase') {
    const days = purchaseLateDays(subject.item, todayLocalIsoDate());
    signal = days > 0 ? ({ signal: 'late', days } as const) : null;
  } else {
    critical = subject.item.isCritical;
  }
  const props = signal ? scheduleSignalBadgeProps(signal, scheduleSignal) : null;
  return (
    <>
      {props ? (
        <Badge variants={props.variants} value={props.value} testId="schedule-panel-signal" />
      ) : null}
      {critical ? (
        <Badge variants={criticalSignal} value="critical" testId="schedule-panel-critical" />
      ) : null}
    </>
  );
}

// ── Sections ───────────────────────────────────────────────────────────────────────────────

function Section({
  testId,
  heading,
  children,
}: {
  readonly testId: string;
  readonly heading: string;
  readonly children: ReactNode;
}) {
  return (
    <section className={styles.section} data-testid={testId}>
      <h3 className={styles.sectionHeading}>{heading}</h3>
      {children}
    </section>
  );
}

function WhenSection({ subject }: { readonly subject: ScheduleSubject }) {
  const { t } = useTranslation('schedule');
  const { formatDate, formatDayRange } = useFormatters();
  const { resolvedLocale } = useLocale();
  const lines: string[] = [];

  if (subject.kind === 'task') {
    const item = subject.item;
    const bar = barDates(item);
    if (bar.start && bar.end) lines.push(formatDayRange(bar.start, bar.end));
    else if (bar.start ?? bar.end) lines.push(formatDate(bar.start ?? bar.end));
    if (item.durationDays !== null) {
      lines.push(t('view.panel.durationDays', { count: item.durationDays }));
    }
    const late = item.status !== 'completed' && scheduleSignalOf(item) !== null;
    if (
      late &&
      bar.end !== null &&
      showsPlannedRow({
        startDate: bar.start,
        endDate: bar.end,
        plannedStartDate: item.startDate,
        plannedEndDate: item.endDate,
      })
    ) {
      // A shown planned row means at least one planned date exists.
      const planned = plannedRangeText(
        item.startDate,
        item.endDate,
        toBcp47Locale(resolvedLocale),
        formatDate,
      )!;
      lines.push(t('view.panel.plannedNowEnds', { planned, end: formatDate(bar.end) }));
    }
  } else if (subject.kind === 'purchase') {
    const item = subject.item;
    if (item.actualDeliveryDate) {
      lines.push(t('view.panel.delivered', { date: formatDate(item.actualDeliveryDate) }));
    } else if (
      item.earliestDeliveryDate &&
      item.latestDeliveryDate &&
      item.earliestDeliveryDate !== item.latestDeliveryDate
    ) {
      lines.push(
        t('view.panel.deliveryWindow', {
          start: formatDate(item.earliestDeliveryDate),
          end: formatDate(item.latestDeliveryDate),
        }),
      );
    } else if (item.latestDeliveryDate ?? item.earliestDeliveryDate) {
      lines.push(
        t('view.panel.delivery', {
          date: formatDate(item.latestDeliveryDate ?? item.earliestDeliveryDate),
        }),
      );
    }
    if (item.targetDeliveryDate) {
      lines.push(t('view.panel.target', { date: formatDate(item.targetDeliveryDate) }));
    }
  } else {
    const item = subject.item;
    lines.push(t('view.panel.target', { date: formatDate(item.targetDate) }));
    if (item.isCompleted && item.completedAt) {
      lines.push(t('view.panel.reached', { date: formatDate(item.completedAt.slice(0, 10)) }));
    } else if (item.projectedDate) {
      lines.push(t('view.panel.projected', { date: formatDate(item.projectedDate) }));
    }
  }

  return (
    <Section testId="schedule-panel-when" heading={t('view.panel.when')}>
      {lines.length > 0 ? (
        lines.map((line) => (
          <p key={line} className={styles.line}>
            {line}
          </p>
        ))
      ) : (
        <p className={styles.muted}>{t('view.panel.noDates')}</p>
      )}
    </Section>
  );
}

function WhoSection({
  task,
  originState,
}: {
  readonly task: TimelineWorkItem;
  readonly originState: OriginState;
}) {
  const { t } = useTranslation('schedule');
  const { t: tSettings } = useTranslation('settings');
  const vendor = task.assignedVendor;
  return (
    <Section testId="schedule-panel-who" heading={t('view.panel.who')}>
      {vendor ? (
        <>
          <p className={styles.line}>
            <NavAnchor
              to={routeUrl('company', { id: vendor.id })}
              state={originState}
              className={styles.link}
              data-testid="schedule-panel-company"
            >
              {vendor.name}
            </NavAnchor>
            {vendor.trade ? (
              <span className={styles.muted}>
                {' · '}
                {getCategoryDisplayName(tSettings, vendor.trade.name, vendor.trade.translationKey)}
              </span>
            ) : null}
          </p>
          {vendor.phone ? (
            <CallButton phone={vendor.phone} name={vendor.name} testId="schedule-panel-call" />
          ) : null}
        </>
      ) : (
        <p className={styles.muted}>{t('view.panel.noCompany')}</p>
      )}
      {task.assignedUser ? <p className={styles.line}>{task.assignedUser.displayName}</p> : null}
    </Section>
  );
}

function RelationRow({
  row,
  glyph,
  originState,
}: {
  readonly glyph: string;
  readonly row: ScheduleRelationRow;
  readonly originState: OriginState;
}) {
  const { t } = useTranslation('schedule');
  const relationText = (label: RelationLabel): string => {
    switch (label.kind) {
      case 'dependency': {
        const set =
          label.direction === 'waitsFor'
            ? I18N_UNION_KEYS.scheduleWaitsForRelation
            : I18N_UNION_KEYS.scheduleHoldsUpRelation;
        return t(set.key(label.dependencyType));
      }
      case 'milestoneGate':
        return t('view.panel.relationMilestoneGate');
      case 'countsToward':
        return t('view.panel.relationCountsToward');
      case 'waitingForMilestone':
        return t('view.panel.relationWaitingForMilestone');
      case 'delivery':
        return t('view.panel.relationDelivery');
      case 'beforeDelivery':
        return t('view.panel.relationBeforeDelivery');
    }
  };
  return (
    <li className={styles.relation} data-testid={`schedule-panel-relation-${row.rowKey}`}>
      <span className={styles.arrow} aria-hidden="true">
        {glyph}
      </span>
      <div className={styles.relationBody}>
        <NavAnchor to={subjectUrl(row.subject)} state={originState} className={styles.link}>
          {scheduleSubjectTitle(row.subject)}
        </NavAnchor>
        <span className={styles.muted}>{relationText(row.label)}</span>
      </div>
      <RelationStatusBadge subject={row.subject} />
    </li>
  );
}

function RelationSection({
  testId,
  heading,
  emptyText,
  rows,
  glyph,
  originState,
  children,
}: {
  readonly testId: string;
  readonly heading: string;
  readonly emptyText: string;
  readonly rows: readonly ScheduleRelationRow[];
  readonly glyph: string;
  readonly originState: OriginState;
  readonly children?: ReactNode;
}) {
  return (
    <Section testId={testId} heading={heading}>
      {children}
      {rows.length > 0 ? (
        <ul className={styles.relations}>
          {rows.map((row) => (
            <RelationRow key={row.rowKey} row={row} glyph={glyph} originState={originState} />
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>{emptyText}</p>
      )}
    </Section>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────────────────────

interface InfoViewProps {
  readonly subject: ScheduleSubject;
  readonly data: TimelineResponse;
  readonly onChanged: () => void;
}

function InfoView({ subject, data, onChanged }: InfoViewProps) {
  const { t } = useTranslation('schedule');
  const { t: tCommon } = useTranslation('common');
  const originState = useOriginState();
  const openRef = useRef<HTMLAnchorElement>(null);
  const relations = useMemo(() => buildScheduleRelations(data, subject), [data, subject]);

  const holdsUpCount =
    subject.kind === 'task'
      ? data.holdsUp?.workItems[subject.item.id]?.count
      : subject.kind === 'milestone'
        ? data.holdsUp?.milestones[String(subject.item.id)]?.count
        : undefined;

  return (
    <div className={styles.info}>
      <div className={styles.headerRow}>
        <SubjectStatus subject={subject} onChanged={onChanged} focusFallbackRef={openRef} />
        <SignalBadges subject={subject} data={data} />
        <NavAnchor
          ref={openRef}
          to={subjectUrl(subject)}
          state={originState}
          className={styles.openLink}
          data-testid="schedule-panel-open-link"
        >
          {t(I18N_UNION_KEYS.scheduleOpenSubject.key(subject.kind))}
        </NavAnchor>
      </div>

      <WhenSection subject={subject} />
      {subject.kind === 'task' ? (
        <WhoSection task={subject.item} originState={originState} />
      ) : null}

      <RelationSection
        testId="schedule-panel-waits-for"
        heading={t('view.panel.waitsFor')}
        emptyText={t('view.panel.waitsForNone')}
        rows={relations.waitsFor}
        glyph="←"
        originState={originState}
      />
      {subject.kind === 'purchase' ? null : (
        <RelationSection
          testId="schedule-panel-holds-up"
          heading={t('view.panel.holdsUp')}
          emptyText={t('view.panel.holdsUpNone')}
          rows={relations.holdsUp}
          glyph="→"
          originState={originState}
        >
          {holdsUpCount ? (
            <p className={styles.line}>
              <span data-figure="holds-up" data-testid="schedule-panel-holds-up-figure">
                {tCommon('attention.holdsUp.tasks', { count: holdsUpCount })}
              </span>
            </p>
          ) : null}
        </RelationSection>
      )}
    </div>
  );
}

type PendingFocus = 'button' | 'heading' | null;

/**
 * The Schedule's side panel: what the row is, when, who, and what it waits for and holds up, with
 * status changes and Reschedule (decisions D4, D8 to D9, D20, D23).
 */
export function ScheduleItemPanel({
  subject,
  data,
  onClose,
  returnFocusRef,
  onChanged,
  onPreviewChange,
}: ScheduleItemPanelProps) {
  const { t } = useTranslation('schedule');
  const { t: tCommon } = useTranslation('common');
  const panelId = useId();
  const resolved = useMemo(
    () => (subject === null ? null : resolveScheduleSubject(data, subject)),
    [data, subject],
  );
  const [reschedulingKey, setReschedulingKey] = useState<ScheduleRowKey | null>(null);
  const rescheduleRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef<PendingFocus>(null);
  const previewRef = useRef(onPreviewChange);
  previewRef.current = onPreviewChange;

  const task = resolved?.kind === 'task' ? resolved.item : null;
  const canReschedule =
    task !== null && task.status !== 'completed' && barDates(task).start !== null;
  const reschedulingTask = canReschedule && subject === reschedulingKey ? task : null;
  const rescheduling = reschedulingTask !== null;

  // Ghosts live only while the Reschedule view is open: close, a view change and unmount clear them.
  useEffect(() => {
    if (!rescheduling) return undefined;
    const clear = previewRef.current;
    return () => clear([]);
  }, [rescheduling]);

  useEffect(() => {
    if (rescheduling) return;
    const target = pendingFocusRef.current;
    pendingFocusRef.current = null;
    if (target === 'button') rescheduleRef.current?.focus();
    if (target === 'heading') {
      document.querySelector<HTMLElement>(`[data-testid="${PANEL_TEST_ID}"] h2`)?.focus();
    }
  }, [rescheduling]);

  const leaveReschedule = (focus: Exclude<PendingFocus, null>) => {
    pendingFocusRef.current = focus;
    setReschedulingKey(null);
  };

  const title = resolved ? scheduleSubjectTitle(resolved) : '';

  return (
    <SidePanel
      id={panelId}
      open={resolved !== null}
      onClose={onClose}
      title={rescheduling ? t('reschedule.title', { title }) : title}
      headerStart={
        rescheduling ? (
          <button
            type="button"
            className={styles.back}
            onClick={() => leaveReschedule('button')}
            data-testid="reschedule-back"
          >
            {tCommon('button.back')}
          </button>
        ) : undefined
      }
      footer={
        canReschedule && !rescheduling ? (
          <button
            ref={rescheduleRef}
            type="button"
            className={sharedStyles.btnSecondary}
            onClick={() => setReschedulingKey(subject)}
            data-testid="schedule-panel-reschedule"
          >
            {t('view.panel.reschedule')}
          </button>
        ) : undefined
      }
      returnFocusRef={returnFocusRef}
      focusKey={subject}
      testId={PANEL_TEST_ID}
    >
      {resolved === null ? null : reschedulingTask ? (
        <ReschedulePanel
          key={reschedulingTask.id}
          task={reschedulingTask}
          timeline={data}
          onPreviewChange={(preview) =>
            onPreviewChange(
              preview
                ? buildPreviewGhosts(data, reschedulingTask, preview.newEnd, preview.impact)
                : [],
            )
          }
          onUndone={onChanged}
          onSaved={() => {
            leaveReschedule('heading');
            onChanged();
          }}
          onCancel={() => leaveReschedule('button')}
        />
      ) : (
        <InfoView key={subject} subject={resolved} data={data} onChanged={onChanged} />
      )}
    </SidePanel>
  );
}
