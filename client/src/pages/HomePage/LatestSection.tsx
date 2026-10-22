import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { DiaryEntryFeedRow } from '../../components/FeedRow/DiaryEntryFeedRow.js';
import { FeedGroup } from '../../components/FeedRow/FeedGroup.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { useLoadOnce } from '../../hooks/useLoadOnce.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { listDiaryEntries } from '../../lib/diaryApi.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { useCreateEntryLink } from '../../navigation/useOpenCreate.js';
import { SectionError } from './SectionError.js';
import styles from './HomePage.module.css';

const LATEST_COUNT = 3;

function loadLatest() {
  return listDiaryEntries({ status: 'saved', automatic: false, pageSize: LATEST_COUNT });
}

/** Latest from the site: the last three people-written, saved diary entries. */
export function LatestSection() {
  const { t } = useTranslation('home');
  const latest = useLoadOnce(loadLatest);
  const diaryLink = useCreateEntryLink('diaryEntry');
  const loading = latest.status === 'loading';
  const entries = latest.data?.items ?? [];

  return (
    <FeedGroup
      heading={t(I18N_UNION_KEYS.homeSection.key('latest-from-site'))}
      list={false}
      busy={loading}
      testId="home-latest"
    >
      {loading ? <Skeleton lines={3} /> : null}
      {latest.status === 'error' ? (
        <SectionError
          section="latest-from-site"
          onRetry={latest.reload}
          testId="home-latest-error"
        />
      ) : null}
      {latest.status === 'ready' && entries.length === 0 ? (
        <EmptyState
          message={t('latest.empty')}
          action={{ label: t('latest.log'), href: diaryLink.to, state: diaryLink.state }}
        />
      ) : null}
      {entries.length > 0 ? (
        <>
          <ul className={styles.plainList}>
            {entries.map((entry) => (
              <DiaryEntryFeedRow key={entry.id} entry={entry} as="li" />
            ))}
          </ul>
          <div className={styles.moreRow}>
            <NavAnchor
              to={routeUrl('diary')}
              className={styles.moreLink}
              data-testid="home-latest-more"
            >
              {t('latest.more')}
              <span aria-hidden="true"> ›</span>
            </NavAnchor>
          </div>
        </>
      ) : null}
    </FeedGroup>
  );
}
