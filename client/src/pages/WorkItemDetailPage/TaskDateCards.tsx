import { useCallback, useId, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { UpdateWorkItemRequest } from '@cornerstone/shared';
import { ObjectFormFields } from '../../components/ObjectForm/ObjectFormFields.js';
import { pickErrors } from '../../components/ObjectForm/objectFormState.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import type { SectionCardController } from '../../components/SectionCard/SectionCard.js';
import { DetailRow } from '../../components/SectionCard/SectionCardFields.js';
import { useLocale } from '../../contexts/LocaleContext.js';
import { fetchFailureMessage, toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import { toBcp47Locale, useFormatters } from '../../lib/formatters.js';
import { barDates, plannedRangeText, showsPlannedRow } from '../../lib/scheduleDates.js';
import { updateWorkItem } from '../../lib/workItemsApi.js';
import {
  useTaskFormSchema,
  useTaskValueMessages,
  validateTaskValues,
} from '../../objectForms/taskForm.js';
import type { TaskPanelProps } from './taskPageTypes.js';
import styles from './TaskTimingPanel.module.css';

export interface TaskDateCardsProps extends Pick<TaskPanelProps, 'task' | 'refresh'> {
  /** Lets the page's `#constraints` intent open the Constraints card. */
  readonly constraintsRef: Ref<SectionCardController>;
  /** The "Reschedule…" button, or null while it cannot be used. */
  readonly rescheduleButton: ReactNode;
}

const DATES_NAMES = ['durationDays', 'actualStartDate', 'actualEndDate'] as const;
const CONSTRAINT_NAMES = ['startAfter', 'startBefore'] as const;
type DatesName = (typeof DATES_NAMES)[number];
type ConstraintName = (typeof CONSTRAINT_NAMES)[number];
type DatesDraft = Readonly<Record<DatesName, string>>;
type ConstraintsDraft = Readonly<Record<ConstraintName, string>>;

const DATES_TEST_IDS = {
  durationDays: 'task-duration-input',
  actualStartDate: 'task-started-input',
  actualEndDate: 'task-finished-input',
};
const CONSTRAINT_TEST_IDS = {
  startAfter: 'task-not-before-input',
  startBefore: 'task-start-by-input',
};

interface CardFieldsProps {
  readonly names: readonly string[];
  readonly values: Readonly<Record<string, string>>;
  readonly errors: Readonly<Record<string, string | undefined>>;
  readonly onChange: (name: string, value: unknown) => void;
  readonly idPrefix: string;
  readonly testIds: Readonly<Record<string, string>>;
}

/** Mounted in edit mode only: the task schema (same fields as the New task dialog). */
function CardFields(props: CardFieldsProps) {
  const schema = useTaskFormSchema({ scope: 'edit' });
  return <ObjectFormFields fields={schema.fields} {...props} />;
}

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

function datesSeed(task: TaskDateCardsProps['task']): DatesDraft {
  return {
    durationDays: task.durationDays === null ? '' : String(task.durationDays),
    actualStartDate: task.actualStartDate ?? '',
    actualEndDate: task.actualEndDate ?? '',
  };
}

function constraintsSeed(task: TaskDateCardsProps['task']): ConstraintsDraft {
  return { startAfter: task.startAfter ?? '', startBefore: task.startBefore ?? '' };
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
  const messages = useTaskValueMessages();

  const datesPatch = useTaskPatch(task.id, refresh);
  const constraintsPatch = useTaskPatch(task.id, refresh);

  const [dates, setDates] = useState<DatesDraft>(() => datesSeed(task));
  const [datesErrors, setDatesErrors] = useState<Partial<Record<DatesName, string>>>({});
  const [constraints, setConstraints] = useState<ConstraintsDraft>(() => constraintsSeed(task));
  const [constraintsErrors, setConstraintsErrors] = useState<
    Partial<Record<ConstraintName, string>>
  >({});

  const shown = barDates(task);
  const datesBase = datesSeed(task);
  const constraintsBase = constraintsSeed(task);
  const showDate = (date: string | null) => (date ? formatDate(date) : null);

  const resetDates = () => {
    setDates(datesSeed(task));
    setDatesErrors({});
    datesPatch.clear();
  };

  const resetConstraints = () => {
    setConstraints(constraintsSeed(task));
    setConstraintsErrors({});
    constraintsPatch.clear();
  };

  const saveDates = async (): Promise<boolean> => {
    const found = pickErrors(validateTaskValues(dates, messages), DATES_NAMES);
    setDatesErrors(found);
    if (Object.keys(found).length > 0) return false;
    const body: UpdateWorkItemRequest = {};
    if (dates.durationDays !== datesBase.durationDays) {
      body.durationDays = dates.durationDays === '' ? null : Number(dates.durationDays);
    }
    if (dates.actualStartDate !== datesBase.actualStartDate) {
      body.actualStartDate = dates.actualStartDate || null;
    }
    if (dates.actualEndDate !== datesBase.actualEndDate) {
      body.actualEndDate = dates.actualEndDate || null;
    }
    return datesPatch.save(body);
  };

  const saveConstraints = async (): Promise<boolean> => {
    const found = pickErrors(validateTaskValues(constraints, messages), CONSTRAINT_NAMES);
    setConstraintsErrors(found);
    if (Object.keys(found).length > 0) return false;
    const body: UpdateWorkItemRequest = {};
    if (constraints.startAfter !== constraintsBase.startAfter) {
      body.startAfter = constraints.startAfter || null;
    }
    if (constraints.startBefore !== constraintsBase.startBefore) {
      body.startBefore = constraints.startBefore || null;
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
          dirty: DATES_NAMES.some((name) => dates[name] !== datesBase[name]),
          onStart: resetDates,
          onSave: saveDates,
          onDiscard: resetDates,
          error: failureMessage(datesPatch.failure),
          renderFields: () => (
            <CardFields
              names={DATES_NAMES}
              values={dates}
              errors={datesErrors}
              onChange={(name, value) => setDates({ ...dates, [name]: String(value ?? '') })}
              idPrefix={`${baseId}-dates-`}
              testIds={DATES_TEST_IDS}
            />
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
          dirty: CONSTRAINT_NAMES.some((name) => constraints[name] !== constraintsBase[name]),
          onStart: resetConstraints,
          onSave: saveConstraints,
          onDiscard: resetConstraints,
          error: failureMessage(constraintsPatch.failure),
          renderFields: () => (
            <CardFields
              names={CONSTRAINT_NAMES}
              values={constraints}
              errors={constraintsErrors}
              onChange={(name, value) =>
                setConstraints({ ...constraints, [name]: String(value ?? '') })
              }
              idPrefix={`${baseId}-constraints-`}
              testIds={CONSTRAINT_TEST_IDS}
            />
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
