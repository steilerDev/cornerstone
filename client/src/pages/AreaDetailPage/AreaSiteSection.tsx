import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { AreaPageCounts } from '@cornerstone/shared';
import { DiaryEntryFeedRow } from '../../components/FeedRow/DiaryEntryFeedRow.js';
import { SystemEventFeedRow } from '../../components/FeedRow/SystemEventFeedRow.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { FormError } from '../../components/FormError/FormError.js';
import { SectionCardFrame } from '../../components/SectionCard/SectionCardFrame.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { useLoadOnce } from '../../hooks/useLoadOnce.js';
import { listDiaryEntries } from '../../lib/diaryApi.js';
import { useFormatters } from '../../lib/formatters.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import type { OriginState } from '../../navigation/origin.js';
import styles from './AreaDetailPage.module.css';

/** Latest from the site shows this many entries; the Diary list holds the rest. */
const LATEST_ENTRY_COUNT = 3;

export interface AreaSiteSectionProps {
  readonly areaId: string;
  readonly areaName: string;
  readonly photos: AreaPageCounts['photos'];
  readonly originState: OriginState;
}

/** Latest from the site: the newest saved diary entries with a photo tagged here or below. */
export function AreaSiteSection({ areaId, areaName, photos, originState }: AreaSiteSectionProps) {
  const { t } = useTranslation('areas');
  const { formatDate } = useFormatters();
  const load = useMemo(
    () => () => listDiaryEntries({ areaId, status: 'saved', pageSize: LATEST_ENTRY_COUNT }),
    [areaId],
  );
  const site = useLoadOnce(load);
  const entries = site.data?.items ?? [];

  let body;
  if (site.status === 'loading') {
    body = <Skeleton lines={3} />;
  } else if (site.status === 'error') {
    body = (
      <div className={styles.loadError}>
        <FormError message={t('detail.site.loadError')} />
        <button type="button" className={styles.retry} onClick={site.reload}>
          {t('index.retry')}
        </button>
      </div>
    );
  } else if (entries.length === 0) {
    body = <EmptyState message={t('detail.site.empty', { area: areaName })} />;
  } else {
    body = (
      <ul className={styles.feedList}>
        {entries.map((entry) =>
          entry.isAutomatic ? (
            <SystemEventFeedRow key={entry.id} entry={entry} as="li" />
          ) : (
            <DiaryEntryFeedRow key={entry.id} entry={entry} as="li" hideAreas />
          ),
        )}
      </ul>
    );
  }

  return (
    <SectionCardFrame id="area-site" title={t('detail.sections.site')}>
      {body}
      {entries.length > 0 || photos.total > 0 ? (
        <div className={styles.moreRow}>
          {entries.length > 0 ? (
            <NavAnchor
              to={routeUrl('diary', undefined, { areaId })}
              state={originState}
              className={styles.moreLink}
              data-testid="area-site-all-entries"
            >
              {t('detail.site.allEntries')}
              <span aria-hidden="true"> →</span>
            </NavAnchor>
          ) : null}
          {photos.total > 0 ? (
            <span>
              <NavAnchor
                to={routeUrl('photos', undefined, { areaId })}
                state={originState}
                className={styles.moreLink}
                data-testid="area-site-photos"
              >
                {t('detail.site.photosOf', { area: areaName })}
                <span aria-hidden="true"> →</span>
              </NavAnchor>{' '}
              <span className={styles.muted}>
                {t('detail.site.photoSummary', {
                  count: photos.total,
                  date: formatDate(photos.latestDate),
                })}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}
    </SectionCardFrame>
  );
}
