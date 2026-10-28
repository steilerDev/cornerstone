import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { DiaryEntrySummary, WorkItemPageDetail } from '@cornerstone/shared';
import { DiaryEntryFeedRow } from '../../components/FeedRow/DiaryEntryFeedRow.js';
import { FeedGroup } from '../../components/FeedRow/FeedGroup.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { FormError } from '../../components/FormError/FormError.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { fetchFailureMessage } from '../../lib/fetchFailure.js';
import { barDates } from '../../lib/scheduleDates.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import type { OriginState } from '../../navigation/origin.js';
import { useCreateEntryLink } from '../../navigation/useOpenCreate.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './TaskDiaryPanel.module.css';
import type { UseTaskDiaryResult } from './useTaskDiary.js';

export interface TaskDiaryPanelProps {
  readonly task: WorkItemPageDetail;
  readonly diary: UseTaskDiaryResult;
  readonly originState: OriginState;
}

interface EntryListProps {
  readonly entries: readonly DiaryEntrySummary[];
}

function EntryRows({ entries }: EntryListProps) {
  return (
    <>
      {entries.map((entry) => (
        <DiaryEntryFeedRow key={entry.id} entry={entry} />
      ))}
    </>
  );
}

/**
 * The Site diary tab of a task: the saved entries that name the task's company within its shown
 * dates, then (collapsed) the photo-tagged entries of its area in those dates.
 */
export function TaskDiaryPanel({ task, diary, originState }: TaskDiaryPanelProps) {
  const { t } = useTranslation('workItems');
  const { t: tErrors } = useTranslation('errors');
  const log = useCreateEntryLink('diaryEntry');
  const { primary, other, failure } = diary;
  const { start, end } = barDates(task);

  const showAllQuery: Record<string, string> = {};
  if (primary.scope === 'company' && task.assignedVendor) {
    showAllQuery.companyId = task.assignedVendor.id;
  } else if (task.area) {
    showAllQuery.areaId = task.area.id;
  }
  if (start !== null && end !== null) {
    showAllQuery.dateFrom = start;
    showAllQuery.dateTo = end;
  }

  const header = (
    <div className={styles.header}>
      <h2 className={styles.heading}>{t('taskPage.diary.title')}</h2>
      <NavAnchor
        to={log.to}
        state={log.state}
        className={styles.logButton}
        data-testid="task-diary-log"
      >
        {t('taskPage.diary.logForTask')}
      </NavAnchor>
    </div>
  );

  if (failure !== null) {
    return (
      <div className={styles.panel}>
        {header}
        <div className={styles.panelError}>
          <FormError
            message={fetchFailureMessage(failure, tErrors, t('taskPage.diary.loadError'))}
          />
          <button type="button" className={sharedStyles.btnText} onClick={diary.reload}>
            {t('taskPage.retry')}
          </button>
        </div>
      </div>
    );
  }
  if (primary.items === null) {
    return (
      <div className={styles.panel}>
        {header}
        <Skeleton lines={3} loadingLabel={t('taskPage.loading')} />
      </div>
    );
  }

  const otherItems = other?.items ?? null;
  const company = task.assignedVendor?.name ?? '';

  return (
    <div className={styles.panel}>
      {header}
      {primary.items.length === 0 ? (
        <EmptyState
          message={t('taskPage.diary.empty')}
          action={{ label: t('taskPage.diary.logForTask'), href: log.to, state: log.state }}
        />
      ) : (
        <div className={styles.block}>
          <FeedGroup
            heading={
              primary.scope === 'company'
                ? t('taskPage.diary.forCompany', { company })
                : t('taskPage.diary.forTask')
            }
            headingLevel={3}
            srSuffix={t('taskPage.diary.srCount', { count: primary.items.length })}
            testId="task-diary"
          >
            <EntryRows entries={primary.items} />
          </FeedGroup>
          {primary.totalItems !== null && primary.totalItems > primary.items.length ? (
            <NavAnchor
              to={routeUrl('diary', undefined, showAllQuery)}
              state={originState}
              className={styles.showAll}
              data-testid="task-diary-show-all"
            >
              {t('taskPage.diary.showAll')}
            </NavAnchor>
          ) : null}
        </div>
      )}
      {otherItems === null || otherItems.length === 0 ? null : (
        <details className={styles.other} data-testid="task-diary-other">
          <summary className={styles.otherSummary}>
            <span className={styles.chevron} aria-hidden="true">
              ▸
            </span>
            <span>{t('taskPage.diary.otherEntries')}</span>
            <span className={styles.otherHint}>{t('taskPage.diary.fromPhotoTags')}</span>
            <span className={styles.otherHint}>{`(${otherItems.length})`}</span>
          </summary>
          <div className={styles.otherBody}>
            <FeedGroup
              heading={t('taskPage.diary.otherEntries')}
              headingLevel={3}
              srSuffix={t('taskPage.diary.srCount', { count: otherItems.length })}
              testId="task-diary-other-feed"
            >
              <EntryRows entries={otherItems} />
            </FeedGroup>
          </div>
        </details>
      )}
    </div>
  );
}

export default TaskDiaryPanel;
