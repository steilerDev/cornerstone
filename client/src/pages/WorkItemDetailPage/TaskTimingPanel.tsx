import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TimelineResponse } from '@cornerstone/shared';
import { FormError } from '../../components/FormError/FormError.js';
import { ReschedulePanel } from '../../components/ReschedulePanel/ReschedulePanel.js';
import { SectionCardScope } from '../../components/SectionCard/SectionCardScope.js';
import type { SectionCardController } from '../../components/SectionCard/SectionCard.js';
import { Spinner } from '../../components/Spinner/Spinner.js';
import { fetchFailureMessage, toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import { barDates } from '../../lib/scheduleDates.js';
import { getTimeline } from '../../lib/timelineApi.js';
import type { TaskTimingIntent } from './taskAnchors.js';
import { TaskDateCards } from './TaskDateCards.js';
import { TaskDependencyLists } from './TaskDependencyLists.js';
import { TaskMilestoneList } from './TaskMilestoneList.js';
import { TaskPurchasesList } from './TaskPurchasesList.js';
import type { TaskPanelProps } from './taskPageTypes.js';
import { useTaskTimingRelations } from './useTaskTimingRelations.js';
import styles from './TaskTimingPanel.module.css';

export interface TaskTimingPanelProps extends TaskPanelProps {
  /** A deep link's intent (`#reschedule`, `#constraints`); consumed once on mount. */
  readonly intent: TaskTimingIntent | null;
  readonly onIntentConsumed: () => void;
  /** Titles of the dependencies the New task form could not add, or null. */
  readonly depError: string | null;
  readonly onDepErrorDismiss: () => void;
}

/** The schedule data the "what moves" list needs, loaded when the Reschedule section opens. */
function useOpenTimeline() {
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [failure, setFailure] = useState<FetchFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getTimeline().then(
      (response) => {
        if (!cancelled) setTimeline(response);
      },
      (err: unknown) => {
        if (!cancelled) setFailure(toFetchFailure(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setFailure(null);
    setAttempt((count) => count + 1);
  }, []);
  return { timeline, failure, retry };
}

interface RescheduleSectionProps {
  readonly task: TaskPanelProps['task'];
  readonly onSaved: () => void;
  readonly onUndone: () => void;
  readonly onCancel: () => void;
}

/** The inline Reschedule section: the shared panel, once the timeline is loaded. */
function RescheduleSection({ task, onSaved, onUndone, onCancel }: RescheduleSectionProps) {
  const { t } = useTranslation('workItems');
  const { t: tSchedule } = useTranslation('schedule');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { timeline, failure, retry } = useOpenTimeline();

  // Focus moves into the section when it opens, so it is not lost while the timeline loads.
  useEffect(() => {
    headingRef.current!.focus();
  }, []);

  return (
    <section
      className={styles.reschedule}
      aria-labelledby={headingId}
      data-testid="task-reschedule-section"
    >
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.rescheduleHeading}>
        {tSchedule('reschedule.title', { title: task.title })}
      </h2>
      {failure !== null ? (
        <div className={styles.rescheduleError}>
          <FormError
            message={fetchFailureMessage(failure, tErrors, t('taskPage.timing.loadError'))}
          />
          <button
            type="button"
            className={styles.retry}
            onClick={retry}
            data-testid="task-reschedule-retry"
          >
            {tCommon('button.retry')}
          </button>
        </div>
      ) : timeline === null ? (
        <div className={styles.rescheduleLoading}>
          <Spinner label={tCommon('loading')} />
        </div>
      ) : (
        <ReschedulePanel
          task={task}
          timeline={timeline}
          onPreviewChange={() => undefined}
          onSaved={onSaved}
          onUndone={onUndone}
          onCancel={onCancel}
        />
      )}
    </section>
  );
}

/**
 * The Timing tab of the task page: Dates, Constraints, Reschedule (when open), what the task
 * waits for and what waits for it, milestones, and the purchases that wait on it (decision D9).
 */
export function TaskTimingPanel({
  task,
  revision,
  refresh,
  originState,
  headingRef,
  intent,
  onIntentConsumed,
  depError,
  onDepErrorDismiss,
}: TaskTimingPanelProps) {
  const { t } = useTranslation('workItems');
  const { t: tCommon } = useTranslation('common');
  const canReschedule = task.status !== 'completed' && barDates(task).start !== null;
  // A `#reschedule` deep link opens the section from the first render.
  const [rescheduling, setRescheduling] = useState(intent === 'reschedule' && canReschedule);
  const constraintsRef = useRef<SectionCardController>(null);
  const rescheduleButtonRef = useRef<HTMLButtonElement>(null);
  const focusButtonRef = useRef(false);
  const relations = useTaskTimingRelations(task.id, revision);

  const open = rescheduling && canReschedule;

  // After the section closes, focus returns to "Reschedule…" (it is mounted again by then).
  useEffect(() => {
    if (open || !focusButtonRef.current) return;
    focusButtonRef.current = false;
    // close() only runs while the section is open, i.e. the task can be rescheduled: the button is back.
    rescheduleButtonRef.current!.focus();
  }, [open]);

  useEffect(() => {
    if (intent === null) return;
    // Reschedule is already open; anything else (or a task that cannot be rescheduled) edits the constraints.
    if (intent !== 'reschedule' || !canReschedule)
      // The Constraints card is mounted with the panel; its handle is set before this effect runs.
      constraintsRef.current!.startEdit();
    onIntentConsumed();
  }, [intent, canReschedule, onIntentConsumed]);

  const close = () => {
    focusButtonRef.current = true;
    setRescheduling(false);
  };

  const rescheduleButton =
    canReschedule && !open ? (
      <button
        ref={rescheduleButtonRef}
        type="button"
        className={styles.rescheduleButton}
        onClick={() => setRescheduling(true)}
        data-testid="task-reschedule"
      >
        {t('taskPage.timing.reschedule')}
      </button>
    ) : null;

  return (
    <SectionCardScope>
      <div className={styles.panel} data-testid="task-timing-panel">
        {depError !== null && (
          <div className={styles.depError}>
            <div className={styles.depErrorMessage}>
              <FormError message={t('taskPage.timing.depError', { titles: depError })} />
            </div>
            <button
              type="button"
              className={styles.dismiss}
              onClick={onDepErrorDismiss}
              data-testid="task-dep-error-dismiss"
            >
              {tCommon('button.close')}
            </button>
          </div>
        )}
        <TaskDateCards
          task={task}
          refresh={refresh}
          constraintsRef={constraintsRef}
          rescheduleButton={rescheduleButton}
        />
        {open && (
          <RescheduleSection
            task={task}
            onSaved={() => {
              close();
              void refresh();
            }}
            onUndone={() => void refresh()}
            onCancel={close}
          />
        )}
        <TaskDependencyLists
          task={task}
          refresh={refresh}
          originState={originState}
          headingRef={headingRef}
        />
        <TaskMilestoneList
          task={task}
          refresh={refresh}
          originState={originState}
          headingRef={headingRef}
          milestones={relations.milestones}
          failure={relations.failure}
          reload={relations.reload}
        />
        <TaskPurchasesList purchases={relations.purchases} originState={originState} />
      </div>
    </SectionCardScope>
  );
}

export default TaskTimingPanel;
