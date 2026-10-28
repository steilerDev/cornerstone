import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SCHEDULE_DURATION_DAYS_MAX } from '@cornerstone/shared';
import type { ScheduleImpact, TimelineResponse, TimelineWorkItem } from '@cornerstone/shared';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback.js';
import { useReschedulePreview } from '../../hooks/useReschedulePreview.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { addDays } from '../../lib/home/agenda.js';
import { barDates, daysBetweenKeys } from '../../lib/scheduleDates.js';
import { updateWorkItem } from '../../lib/workItemsApi.js';
import sharedStyles from '../../styles/shared.module.css';
import { Badge } from '../Badge/Badge.js';
import { FormError } from '../FormError/FormError.js';
import { Spinner } from '../Spinner/Spinner.js';
import { useToast } from '../Toast/ToastContext.js';
import styles from './ReschedulePanel.module.css';

/** Rows of the "what moves" list shown before "Show all". */
const PREVIEW_ROW_CAP = 5;
/** The other field follows the edited one after this pause. */
const SYNC_DELAY_MS = 300;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ReschedulePanelProps {
  readonly task: Pick<
    TimelineWorkItem,
    | 'id'
    | 'title'
    | 'status'
    | 'startDate'
    | 'endDate'
    | 'actualStartDate'
    | 'actualEndDate'
    | 'durationDays'
    | 'projectedStartDate'
    | 'projectedEndDate'
  >;
  /** Titles for the "what moves" list. */
  readonly timeline: Pick<TimelineResponse, 'workItems' | 'milestones'>;
  /** The impact of the valid change (for chart ghosts), or null when there is none. */
  readonly onPreviewChange: (preview: { impact: ScheduleImpact; newEnd: string } | null) => void;
  readonly onSaved: () => void;
  /** Undo of the save finished: reload without moving focus. */
  readonly onUndone: () => void;
  readonly onCancel: () => void;
  readonly testId?: string;
}

type Edited = 'end' | 'duration';
type ErrorKey = 'endBeforeStart' | 'durationMin' | 'durationMax';

interface ImpactRow {
  readonly testId: string;
  readonly title: string;
  readonly text: string;
  readonly lateDays: number;
}

/** A requested duration in days, or null when the edited field holds no usable number. */
function requestedDuration(edited: Edited, start: string, end: string, durationText: string) {
  if (edited === 'duration') return /^\d+$/.test(durationText) ? Number(durationText) : null;
  return ISO_DATE.test(end) ? daysBetweenKeys(start, end) : null;
}

function errorKeyOf(edited: Edited, requested: number | null): ErrorKey | null {
  if (requested === null) return edited === 'duration' ? 'durationMin' : null;
  if (requested < 0) return 'endBeforeStart';
  if (requested < 1) return 'durationMin';
  return requested > SCHEDULE_DURATION_DAYS_MAX ? 'durationMax' : null;
}

/**
 * Change a task's duration with a live preview of what else moves. Nothing is saved until Save;
 * Save stores the duration and end date and offers Undo (decisions D6, D20).
 */
export function ReschedulePanel({
  task,
  timeline,
  onPreviewChange,
  onSaved,
  onUndone,
  onCancel,
  testId = 'reschedule-panel',
}: ReschedulePanelProps) {
  const { t } = useTranslation('schedule');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { formatDate } = useFormatters();
  const { scheduleSignal } = useStatusBadgeVariants();
  const { showToast, showUndoToast } = useToast();
  const endId = useId();
  const endErrorId = useId();
  const durationId = useId();
  const durationErrorId = useId();

  const bar = barDates(task);
  // The caller only offers Reschedule for a task with a shown start.
  const start = bar.start!;
  const original = Math.max(1, task.durationDays ?? daysBetweenKeys(start, bar.end ?? start));

  const [end, setEnd] = useState(() => addDays(start, original));
  const [durationText, setDurationText] = useState(String(original));
  const [edited, setEdited] = useState<Edited>('duration');
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const endRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current!.focus();
  }, []);

  const follow = useDebouncedCallback((from: Edited, value: string) => {
    if (from === 'end') {
      if (ISO_DATE.test(value)) setDurationText(String(daysBetweenKeys(start, value)));
    } else if (/^\d+$/.test(value)) {
      setEnd(addDays(start, Number(value)));
    }
  }, SYNC_DELAY_MS);

  const requested = requestedDuration(edited, start, end, durationText);
  const errorKey = errorKeyOf(edited, requested);
  const changed = errorKey === null && requested !== null && requested !== original;
  const requestDuration = changed ? requested : null;
  const newEnd = requestDuration === null ? null : addDays(start, requestDuration);

  const preview = useReschedulePreview(task.id, requestDuration);
  const canSave = newEnd !== null && preview.status === 'ready';

  const previewRef = useRef(onPreviewChange);
  previewRef.current = onPreviewChange;
  const impact = preview.impact;
  useEffect(() => {
    previewRef.current(impact ? { impact, newEnd: newEnd! } : null);
  }, [impact, newEnd]);

  const tasksById = useMemo(
    () => new Map(timeline.workItems.map((item) => [item.id, item])),
    [timeline.workItems],
  );
  const milestoneTitles = useMemo(
    () => new Map(timeline.milestones.map((item) => [item.id, item.title])),
    [timeline.milestones],
  );

  const deltaText = (delta: number) =>
    delta < 0
      ? t('reschedule.earlier', { count: -delta })
      : t('reschedule.later', { count: delta });

  const rows: ImpactRow[] = impact
    ? [
        ...impact.movedItems.map((moved) => {
          const moving = tasksById.get(moved.workItemId);
          return {
            testId: `reschedule-preview-item-${moved.workItemId}`,
            title: moving?.title ?? moved.workItemId,
            text: t('reschedule.itemEnds', {
              to: formatDate(moved.newEndDate),
              from: formatDate(moved.previousEndDate),
              delta: deltaText(moved.deltaDays),
            }),
            lateDays: moved.isLate
              ? Math.max(
                  1,
                  daysBetweenKeys(moving?.endDate ?? moved.previousEndDate, moved.newEndDate),
                )
              : 0,
          };
        }),
        ...impact.milestones.map((milestone) => ({
          testId: `reschedule-preview-milestone-${milestone.milestoneId}`,
          title: milestoneTitles.get(milestone.milestoneId) ?? String(milestone.milestoneId),
          text: t('reschedule.milestoneProjected', {
            to: formatDate(milestone.newProjectedDate),
            from: formatDate(milestone.previousProjectedDate),
            delta: deltaText(milestone.deltaDays),
          }),
          lateDays: 0,
        })),
      ]
    : [];
  const visibleRows = showAll ? rows : rows.slice(0, PREVIEW_ROW_CAP);

  function summaryText(current: ScheduleImpact): string {
    const tasks = current.movedItems.length;
    const milestones = current.milestones.length;
    const taskCount = t('reschedule.taskCount', { count: tasks });
    const milestoneCount = t('reschedule.milestoneCount', { count: milestones });
    let moves = t('reschedule.nothingMoves');
    if (tasks > 0 && milestones > 0) {
      moves = t('reschedule.movesBoth', { tasks: taskCount, milestones: milestoneCount });
    } else if (tasks > 0) {
      moves = t('reschedule.movesTasks', { tasks: taskCount });
    } else if (milestones > 0) {
      moves = t('reschedule.movesMilestones', { milestones: milestoneCount });
    }
    const { previousDate, newDate } = current.projectEnd;
    if (newDate === null) return moves;
    const completion =
      previousDate !== null && previousDate !== newDate
        ? t('reschedule.completion', { from: formatDate(previousDate), to: formatDate(newDate) })
        : t('reschedule.completionSame', { date: formatDate(newDate) });
    return `${moves} ${completion}`;
  }

  const moveSummary = impact && summaryText(impact);

  const handleEnd = (value: string) => {
    setEnd(value);
    setEdited('end');
    follow.trigger('end', value);
  };
  const handleDuration = (value: string) => {
    setDurationText(value);
    setEdited('duration');
    follow.trigger('duration', value);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !canSave) return;
    setSaving(true);
    try {
      await updateWorkItem(task.id, { durationDays: requestDuration, endDate: newEnd });
    } catch (err) {
      showToast(
        'error',
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : t('reschedule.saveFailed'),
      );
      setSaving(false);
      return;
    }
    showUndoToast({
      message: t('reschedule.saved', { title: task.title }),
      dedupeKey: `reschedule:${task.id}`,
      onUndo: () =>
        updateWorkItem(task.id, { durationDays: task.durationDays, endDate: task.endDate }).then(
          onUndone,
        ),
    });
    setSaving(false);
    onSaved();
  };

  const errorTexts: Record<ErrorKey, string> = {
    endBeforeStart: t('reschedule.errors.endBeforeStart'),
    durationMin: t('reschedule.errors.durationMin'),
    durationMax: t('reschedule.errors.durationMax', { max: SCHEDULE_DURATION_DAYS_MAX }),
  };
  const errorText = errorKey === null ? null : errorTexts[errorKey];
  const endInvalid = edited === 'end' && errorText !== null;
  const durationInvalid = edited === 'duration' && errorText !== null;

  return (
    <form className={styles.panel} onSubmit={handleSubmit} noValidate data-testid={testId}>
      <div className={styles.fields}>
        <div className={styles.field}>
          <span className={sharedStyles.fieldLabel}>{t('reschedule.start')}</span>
          <span className={styles.startValue} data-testid="reschedule-start">
            {formatDate(start)}
          </span>
        </div>
        <div className={styles.field}>
          <label htmlFor={endId} className={sharedStyles.fieldLabel}>
            {t('reschedule.end')}
          </label>
          <input
            ref={endRef}
            id={endId}
            type="date"
            className={sharedStyles.input}
            value={end}
            onChange={(event) => handleEnd(event.target.value)}
            aria-invalid={endInvalid || undefined}
            aria-describedby={endInvalid ? endErrorId : undefined}
            data-testid="reschedule-end"
          />
          {endInvalid ? <FormError variant="field" id={endErrorId} message={errorText} /> : null}
        </div>
        <div className={styles.field}>
          <label htmlFor={durationId} className={sharedStyles.fieldLabel}>
            {t('reschedule.duration')}
          </label>
          <div className={styles.durationRow}>
            <input
              id={durationId}
              type="number"
              min={1}
              max={SCHEDULE_DURATION_DAYS_MAX}
              step={1}
              inputMode="numeric"
              className={sharedStyles.input}
              value={durationText}
              onChange={(event) => handleDuration(event.target.value)}
              aria-invalid={durationInvalid || undefined}
              aria-describedby={durationInvalid ? durationErrorId : undefined}
              data-testid="reschedule-duration"
            />
            <span className={styles.suffix}>{t('reschedule.days')}</span>
          </div>
          {durationInvalid ? (
            <FormError variant="field" id={durationErrorId} message={errorText} />
          ) : null}
        </div>
      </div>

      <div role="status" className={styles.preview} data-testid="reschedule-preview">
        {preview.status === 'loading' ? (
          <p className={styles.checking}>
            <span aria-hidden="true">
              <Spinner size="sm" label={t('reschedule.checking')} />
            </span>
            <span>{t('reschedule.checking')}</span>
          </p>
        ) : null}
        {impact ? (
          <>
            {impact.holdsUp.count > 0 ? (
              <p className={styles.holdsUp}>
                <span data-figure="holds-up" data-testid="reschedule-preview-holds-up">
                  {tCommon('attention.holdsUp.tasks', { count: impact.holdsUp.count })}
                </span>
                {' · '}
                {impact.holdsUp.startingWithin14Days > 0
                  ? tCommon('attention.holdsUp.soon', {
                      count: impact.holdsUp.startingWithin14Days,
                    })
                  : tCommon('attention.holdsUp.soonNone')}
              </p>
            ) : null}
            <p className={styles.summary} data-testid="reschedule-preview-summary">
              {moveSummary}
            </p>
            {rows.length > 0 ? (
              <ul className={styles.list} aria-label={t('reschedule.listLabel')}>
                {visibleRows.map((row) => (
                  <li key={row.testId} className={styles.listItem} data-testid={row.testId}>
                    <span className={styles.rowTitle}>{row.title}</span>
                    <span className={styles.rowText}>{row.text}</span>
                    {row.lateDays > 0 ? (
                      <Badge variants={scheduleSignal(row.lateDays)} value="late" />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {rows.length > PREVIEW_ROW_CAP && !showAll ? (
              <button
                type="button"
                className={styles.showAll}
                onClick={() => setShowAll(true)}
                data-testid="reschedule-show-all"
              >
                {t('reschedule.showAll', { count: rows.length })}
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {preview.status === 'error' ? (
        <div className={styles.previewError}>
          <FormError message={t('reschedule.errors.previewFailed')} />
          <button
            type="button"
            className={styles.retry}
            onClick={preview.retry}
            data-testid="reschedule-retry"
          >
            {tCommon('button.retry')}
          </button>
        </div>
      ) : null}

      <div className={styles.actions}>
        <button
          type="submit"
          className={sharedStyles.btnPrimary}
          disabled={!saving && !canSave}
          aria-disabled={saving || undefined}
          data-testid="reschedule-save"
        >
          {tCommon('button.save')}
        </button>
        <button
          type="button"
          className={sharedStyles.btnSecondary}
          onClick={onCancel}
          data-testid="reschedule-cancel"
        >
          {tCommon('button.cancel')}
        </button>
      </div>
    </form>
  );
}
