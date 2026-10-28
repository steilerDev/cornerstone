import { useCallback, useId, useState } from 'react';
import type { ReactNode, Ref, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { UpdateWorkItemRequest } from '@cornerstone/shared';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import type { SectionCardController } from '../../components/SectionCard/SectionCard.js';
import { DetailRow, FieldShell } from '../../components/SectionCard/SectionCardFields.js';
import { useLocale } from '../../contexts/LocaleContext.js';
import { fetchFailureMessage, toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import { toBcp47Locale, useFormatters } from '../../lib/formatters.js';
import { barDates, plannedRangeText, showsPlannedRow } from '../../lib/scheduleDates.js';
import { updateWorkItem } from '../../lib/workItemsApi.js';
import type { TaskPanelProps } from './taskPageTypes.js';
import styles from './TaskTimingPanel.module.css';

export interface TaskDateCardsProps extends Pick<TaskPanelProps, 'task' | 'refresh'> {
  /** Lets the page's `#constraints` intent open the Constraints card. */
  readonly constraintsRef: Ref<SectionCardController>;
  /** The "Reschedule…" button, or null while it cannot be used. */
  readonly rescheduleButton: ReactNode;
}

const WHOLE_NUMBER = /^\d+$/;

/** A card's PATCH: saves, then refreshes the page. A failure is kept as data. */
function useTaskPatch(taskId: string, refresh: () => Promise<void>) {
  const [failure, setFailure] = useState<FetchFailure | null>(null);
  const save = useCallback(
    async (body: UpdateWorkItemRequest): Promise<boolean> => {
      try {
        await updateWorkItem(taskId, body);
      } catch (err) {
        setFailure(toFetchFailure(err));
        return false;
      }
      setFailure(null);
      await refresh();
      return true;
    },
    [taskId, refresh],
  );
  const clear = useCallback(() => setFailure(null), []);
  return { failure, save, clear };
}

interface DateFieldProps {
  readonly id: string;
  readonly label: string;
  readonly type: 'date' | 'number';
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string;
  readonly inputRef?: RefObject<HTMLInputElement | null>;
  readonly testId: string;
}

function DateField({ id, label, type, value, onChange, error, inputRef, testId }: DateFieldProps) {
  const numeric = type === 'number';
  return (
    <FieldShell id={id} label={label} error={error}>
      {({ invalid, describedBy }) => (
        <input
          ref={inputRef}
          id={id}
          type={type}
          className={styles.input}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          min={numeric ? 0 : undefined}
          step={numeric ? 1 : undefined}
          inputMode={numeric ? 'numeric' : undefined}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          data-testid={testId}
        />
      )}
    </FieldShell>
  );
}

interface DatesDraft {
  readonly duration: string;
  readonly started: string;
  readonly finished: string;
}

function datesSeed(task: TaskDateCardsProps['task']): DatesDraft {
  return {
    duration: task.durationDays === null ? '' : String(task.durationDays),
    started: task.actualStartDate ?? '',
    finished: task.actualEndDate ?? '',
  };
}

interface ConstraintsDraft {
  readonly notBefore: string;
  readonly startBy: string;
}

function constraintsSeed(task: TaskDateCardsProps['task']): ConstraintsDraft {
  return { notBefore: task.startAfter ?? '', startBy: task.startBefore ?? '' };
}

/** The Dates and Constraints cards of the Timing tab (decision D9). */
export function TaskDateCards({
  task,
  refresh,
  constraintsRef,
  rescheduleButton,
}: TaskDateCardsProps) {
  const { t } = useTranslation('workItems');
  const { t: tErrors } = useTranslation('errors');
  const { resolvedLocale } = useLocale();
  const { formatDate } = useFormatters();
  const baseId = useId();

  const datesPatch = useTaskPatch(task.id, refresh);
  const constraintsPatch = useTaskPatch(task.id, refresh);

  const [dates, setDates] = useState<DatesDraft>(() => datesSeed(task));
  const [durationInvalid, setDurationInvalid] = useState(false);
  const [finishedInvalid, setFinishedInvalid] = useState(false);
  const [constraints, setConstraints] = useState<ConstraintsDraft>(() => constraintsSeed(task));
  const [constraintsInvalid, setConstraintsInvalid] = useState(false);

  const shown = barDates(task);
  const datesBase = datesSeed(task);
  const constraintsBase = constraintsSeed(task);
  const showDate = (date: string | null) => (date ? formatDate(date) : null);

  const resetDates = () => {
    setDates(datesSeed(task));
    setDurationInvalid(false);
    setFinishedInvalid(false);
    datesPatch.clear();
  };

  const resetConstraints = () => {
    setConstraints(constraintsSeed(task));
    setConstraintsInvalid(false);
    constraintsPatch.clear();
  };

  const saveDates = async (): Promise<boolean> => {
    const badDuration = dates.duration !== '' && !WHOLE_NUMBER.test(dates.duration);
    const badFinished =
      dates.started !== '' && dates.finished !== '' && dates.finished < dates.started;
    setDurationInvalid(badDuration);
    setFinishedInvalid(badFinished);
    if (badDuration || badFinished) return false;
    const body: UpdateWorkItemRequest = {};
    if (dates.duration !== datesBase.duration) {
      body.durationDays = dates.duration === '' ? null : Number(dates.duration);
    }
    if (dates.started !== datesBase.started) body.actualStartDate = dates.started || null;
    if (dates.finished !== datesBase.finished) body.actualEndDate = dates.finished || null;
    return datesPatch.save(body);
  };

  const saveConstraints = async (): Promise<boolean> => {
    const bad =
      constraints.notBefore !== '' &&
      constraints.startBy !== '' &&
      constraints.startBy < constraints.notBefore;
    setConstraintsInvalid(bad);
    if (bad) return false;
    const body: UpdateWorkItemRequest = {};
    if (constraints.notBefore !== constraintsBase.notBefore) {
      body.startAfter = constraints.notBefore || null;
    }
    if (constraints.startBy !== constraintsBase.startBy) {
      body.startBefore = constraints.startBy || null;
    }
    return constraintsPatch.save(body);
  };

  const failureMessage = (failure: FetchFailure | null) =>
    failure === null ? null : fetchFailureMessage(failure, tErrors, t('taskPage.timing.saveError'));

  const planned = showsPlannedRow({
    startDate: shown.start,
    endDate: shown.end,
    plannedStartDate: task.startDate,
    plannedEndDate: task.endDate,
  });

  return (
    <>
      <SectionCard
        id="task-dates"
        title={t('taskPage.timing.dates')}
        testId="task-dates"
        edit={{
          dirty:
            dates.duration !== datesBase.duration ||
            dates.started !== datesBase.started ||
            dates.finished !== datesBase.finished,
          onStart: resetDates,
          onSave: saveDates,
          onDiscard: resetDates,
          error: failureMessage(datesPatch.failure),
          renderFields: ({ firstFieldRef }) => (
            <div className={styles.fields}>
              <DateField
                id={`${baseId}-duration`}
                label={t('taskPage.timing.durationLabel')}
                type="number"
                value={dates.duration}
                onChange={(duration) => setDates({ ...dates, duration })}
                error={durationInvalid ? t('taskPage.timing.durationError') : undefined}
                inputRef={firstFieldRef as RefObject<HTMLInputElement | null>}
                testId="task-duration-input"
              />
              <DateField
                id={`${baseId}-started`}
                label={t('taskPage.timing.started')}
                type="date"
                value={dates.started}
                onChange={(started) => setDates({ ...dates, started })}
                testId="task-started-input"
              />
              <DateField
                id={`${baseId}-finished`}
                label={t('taskPage.timing.finished')}
                type="date"
                value={dates.finished}
                onChange={(finished) => setDates({ ...dates, finished })}
                error={finishedInvalid ? t('taskPage.timing.finishedBeforeStarted') : undefined}
                testId="task-finished-input"
              />
            </div>
          ),
        }}
      >
        <dl className={styles.facts}>
          <DetailRow label={t('taskPage.timing.start')} testId="task-start">
            {shown.start ? formatDate(shown.start) : t('taskPage.timing.notScheduled')}
          </DetailRow>
          <DetailRow label={t('taskPage.timing.end')} testId="task-end">
            {shown.end ? formatDate(shown.end) : t('taskPage.timing.notScheduled')}
          </DetailRow>
          <DetailRow label={t('taskPage.timing.started')} testId="task-started">
            {showDate(task.actualStartDate)}
          </DetailRow>
          <DetailRow label={t('taskPage.timing.finished')} testId="task-finished">
            {showDate(task.actualEndDate)}
          </DetailRow>
          <DetailRow label={t('taskPage.timing.duration')} testId="task-duration">
            {task.durationDays === null
              ? null
              : t('taskPage.timing.durationDays', { count: task.durationDays })}
          </DetailRow>
        </dl>
        {planned && (
          <p className={styles.planned} data-testid="work-item-planned-dates">
            {t('taskPage.timing.planned', {
              range: plannedRangeText(
                task.startDate,
                task.endDate,
                toBcp47Locale(resolvedLocale),
                formatDate,
              ),
            })}
          </p>
        )}
        {rescheduleButton && <div className={styles.cardActions}>{rescheduleButton}</div>}
      </SectionCard>
      <SectionCard
        id="task-constraints"
        title={t('taskPage.timing.constraints')}
        testId="task-constraints"
        controllerRef={constraintsRef}
        edit={{
          dirty:
            constraints.notBefore !== constraintsBase.notBefore ||
            constraints.startBy !== constraintsBase.startBy,
          onStart: resetConstraints,
          onSave: saveConstraints,
          onDiscard: resetConstraints,
          error: failureMessage(constraintsPatch.failure),
          renderFields: ({ firstFieldRef }) => (
            <div className={styles.fields}>
              <DateField
                id={`${baseId}-not-before`}
                label={t('taskPage.timing.notBefore')}
                type="date"
                value={constraints.notBefore}
                onChange={(notBefore) => setConstraints({ ...constraints, notBefore })}
                inputRef={firstFieldRef as RefObject<HTMLInputElement | null>}
                testId="task-not-before-input"
              />
              <DateField
                id={`${baseId}-start-by`}
                label={t('taskPage.timing.startBy')}
                type="date"
                value={constraints.startBy}
                onChange={(startBy) => setConstraints({ ...constraints, startBy })}
                error={constraintsInvalid ? t('taskPage.timing.constraintsError') : undefined}
                testId="task-start-by-input"
              />
            </div>
          ),
        }}
      >
        <dl className={styles.facts}>
          <DetailRow label={t('taskPage.timing.notBefore')} testId="task-not-before">
            {showDate(task.startAfter)}
          </DetailRow>
          <DetailRow label={t('taskPage.timing.startBy')} testId="task-start-by">
            {showDate(task.startBefore)}
          </DetailRow>
        </dl>
      </SectionCard>
    </>
  );
}

export default TaskDateCards;
