import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import { DiaryEntryFeedRow } from '../../components/FeedRow/DiaryEntryFeedRow.js';
import { FeedGroup } from '../../components/FeedRow/FeedGroup.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { FormError } from '../../components/FormError/FormError.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { fetchFailureMessage } from '../../lib/fetchFailure.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import type { OriginState } from '../../navigation/origin.js';
import sharedStyles from '../../styles/shared.module.css';
import type { UseCompanyDiaryResult } from './useCompanyDiary.js';
import styles from './VendorDetailPage.module.css';

export interface CompanyDiaryPanelProps {
  readonly vendorId: string;
  readonly diary: UseCompanyDiaryResult;
  readonly originState: OriginState;
}

/** The Site diary tab: the saved entries that name the company, with a link to all of them. */
export function CompanyDiaryPanel({ vendorId, diary, originState }: CompanyDiaryPanelProps) {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { items, totalItems, failure } = diary;

  if (items === null && failure !== null) {
    return (
      <div className={styles.panelError}>
        <FormError
          message={fetchFailureMessage(failure, tErrors, t('companyPage.diary.loadError'))}
        />
        <button type="button" className={sharedStyles.btnText} onClick={diary.reload}>
          {t('companyPage.retry')}
        </button>
      </div>
    );
  }
  if (items === null) {
    return <Skeleton lines={3} loadingLabel={t('companyPage.loading')} />;
  }
  if (items.length === 0) {
    return <EmptyState message={t('companyPage.diary.empty')} />;
  }

  return (
    <div className={styles.diary}>
      <FeedGroup
        heading={t('companyPage.diary.title')}
        srSuffix={t('companyPage.diary.srCount', { count: items.length })}
        testId="company-diary"
      >
        {items.map((entry) => (
          <DiaryEntryFeedRow key={entry.id} entry={entry} />
        ))}
      </FeedGroup>
      {totalItems !== null && totalItems > items.length ? (
        <NavAnchor
          to={routeUrl('diary', undefined, { companyId: vendorId })}
          state={originState}
          className={styles.showAll}
          data-testid="company-diary-show-all"
        >
          {t('companyPage.diary.showAll')}
        </NavAnchor>
      ) : null}
    </div>
  );
}

export default CompanyDiaryPanel;
