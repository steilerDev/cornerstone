import { routeUrl } from '@cornerstone/shared';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { FormError } from '../FormError/FormError.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import { DiaryEntryFeedRow } from './DiaryEntryFeedRow.js';
import { FeedGroup } from './FeedGroup.js';
import { useTranslation } from 'react-i18next';
import type { UseObjectDiaryResult } from '../../hooks/useObjectDiary.js';
import { fetchFailureMessage } from '../../lib/fetchFailure.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import type { OriginState } from '../../navigation/origin.js';
import { useCreateEntryLink } from '../../navigation/useOpenCreate.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './ObjectDiaryPanel.module.css';

export interface ObjectDiaryLabels {
  readonly title: string;
  readonly log: string;
  /** Already interpolated with the company name. */
  readonly forCompany: string;
  readonly forSubject: string;
  readonly otherEntries: string;
  readonly fromPhotoTags: string;
  readonly empty: string;
  readonly loadError: string;
  readonly showAll: string;
  readonly retry: string;
  readonly loading: string;
  readonly srCount: (count: number) => string;
}

export interface ObjectDiaryPanelProps {
  readonly diary: UseObjectDiaryResult;
  readonly companyId: string | null;
  readonly areaId: string | null;
  readonly dates: { readonly dateFrom: string; readonly dateTo: string } | null;
  readonly originState: OriginState;
  /** Prefix of the rendered test ids: `<prefix>`, `-log`, `-show-all`, `-other`, `-other-feed`. */
  readonly testIdPrefix: string;
  readonly labels: ObjectDiaryLabels;
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
 * The Site diary tab of an object page: the saved entries that name its company within its shown
 * dates, then (collapsed) the photo-tagged entries of its area in those dates.
 */
export function ObjectDiaryPanel({
  diary,
  companyId,
  areaId,
  dates,
  originState,
  testIdPrefix,
  labels,
}: ObjectDiaryPanelProps) {
  const { t: tErrors } = useTranslation('errors');
  const log = useCreateEntryLink('diaryEntry');
  const { primary, other, failure } = diary;

  const showAllQuery: Record<string, string> = {};
  if (primary.scope === 'company' && companyId !== null) {
    showAllQuery.companyId = companyId;
  } else if (areaId !== null) {
    showAllQuery.areaId = areaId;
  }
  if (dates !== null) {
    showAllQuery.dateFrom = dates.dateFrom;
    showAllQuery.dateTo = dates.dateTo;
  }

  const header = (
    <div className={styles.header}>
      <h2 className={styles.heading}>{labels.title}</h2>
      <NavAnchor
        to={log.to}
        state={log.state}
        className={styles.logButton}
        data-testid={`${testIdPrefix}-log`}
      >
        {labels.log}
      </NavAnchor>
    </div>
  );

  if (failure !== null) {
    return (
      <div className={styles.panel}>
        {header}
        <div className={styles.panelError}>
          <FormError message={fetchFailureMessage(failure, tErrors, labels.loadError)} />
          <button type="button" className={sharedStyles.btnText} onClick={diary.reload}>
            {labels.retry}
          </button>
        </div>
      </div>
    );
  }
  if (primary.items === null) {
    return (
      <div className={styles.panel}>
        {header}
        <Skeleton lines={3} loadingLabel={labels.loading} />
      </div>
    );
  }

  const otherItems = other?.items ?? null;

  return (
    <div className={styles.panel}>
      {header}
      {primary.items.length === 0 ? (
        <EmptyState
          message={labels.empty}
          action={{ label: labels.log, href: log.to, state: log.state }}
        />
      ) : (
        <div className={styles.block}>
          <FeedGroup
            heading={primary.scope === 'company' ? labels.forCompany : labels.forSubject}
            headingLevel={3}
            srSuffix={labels.srCount(primary.items.length)}
            testId={testIdPrefix}
          >
            <EntryRows entries={primary.items} />
          </FeedGroup>
          {primary.totalItems !== null && primary.totalItems > primary.items.length ? (
            <NavAnchor
              to={routeUrl('diary', undefined, showAllQuery)}
              state={originState}
              className={styles.showAll}
              data-testid={`${testIdPrefix}-show-all`}
            >
              {labels.showAll}
            </NavAnchor>
          ) : null}
        </div>
      )}
      {otherItems === null || otherItems.length === 0 ? null : (
        <details className={styles.other} data-testid={`${testIdPrefix}-other`}>
          <summary className={styles.otherSummary}>
            <span className={styles.chevron} aria-hidden="true">
              ▸
            </span>
            <span>{labels.otherEntries}</span>
            <span className={styles.otherHint}>{labels.fromPhotoTags}</span>
            <span className={styles.otherHint}>{`(${otherItems.length})`}</span>
          </summary>
          <div className={styles.otherBody}>
            <FeedGroup
              heading={labels.otherEntries}
              headingLevel={3}
              srSuffix={labels.srCount(otherItems.length)}
              testId={`${testIdPrefix}-other-feed`}
            >
              <EntryRows entries={otherItems} />
            </FeedGroup>
          </div>
        </details>
      )}
    </div>
  );
}

export default ObjectDiaryPanel;
