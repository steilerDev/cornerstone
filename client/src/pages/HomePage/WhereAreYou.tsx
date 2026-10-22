import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { FilterChipGroup } from '../../components/FilterChipGroup/FilterChipGroup.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { useDiaryEntryTitle } from '../../hooks/useDiaryEntryTitle.js';
import { useLoadOnce } from '../../hooks/useLoadOnce.js';
import { listDiaryEntries } from '../../lib/diaryApi.js';
import { useFormatters } from '../../lib/formatters.js';
import { areaPathLabel, recentAreas } from '../../lib/home/recentAreas.js';
import { quickLogHref } from '../../navigation/createEntries.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import styles from './HomePage.module.css';

const RECENT_ENTRY_COUNT = 10;

function loadRecentEntries() {
  return listDiaryEntries({ automatic: false, pageSize: RECENT_ENTRY_COUNT });
}

/**
 * Phone and tablet only (the page mounts it below 1024 px): one tap to log a photo in a recently
 * photographed area, and the last log. Not essential, so a failed load shows nothing.
 */
export function WhereAreYou() {
  const { t } = useTranslation('home');
  const headingId = useId();
  const originState = useOriginState();
  const recent = useLoadOnce(loadRecentEntries);
  const entries = useMemo(() => recent.data?.items ?? [], [recent.data]);
  const areas = useMemo(() => recentAreas(entries), [entries]);

  if (recent.status === 'error') return null;
  if (recent.status === 'loading') {
    return (
      <div data-testid="home-where-loading">
        <Skeleton lines={1} />
      </div>
    );
  }
  if (areas.length === 0 && entries.length === 0) return null;

  const options = [
    ...areas.map((area) => ({
      value: area.id,
      label: areaPathLabel(area),
      title: areaPathLabel(area),
      to: quickLogHref('photo', { areaId: area.id }),
      state: originState,
    })),
    {
      value: 'other',
      label: t('where.other'),
      to: quickLogHref('photo', {}),
      state: originState,
    },
  ];

  const lastLog = <LastLog entry={entries[0]!} />;
  if (areas.length === 0) return <div data-testid="home-where">{lastLog}</div>;

  return (
    <section aria-labelledby={headingId} className={styles.where} data-testid="home-where">
      <h2 id={headingId} className={styles.whereTitle}>
        {t('where.title')}
      </h2>
      <FilterChipGroup
        variant="navigate"
        layout="scroll"
        labelledBy={headingId}
        testIdPrefix="where-chip"
        options={options}
      />
      {lastLog}
    </section>
  );
}

function LastLog({ entry }: { entry: DiaryEntrySummary }) {
  const { t } = useTranslation('home');
  const { formatDayMonth } = useFormatters();
  const originState = useOriginState();
  const title = useDiaryEntryTitle(entry)!;
  const to =
    entry.status === 'draft'
      ? routeUrl('diaryEntryEdit', { id: entry.id })
      : routeUrl('diaryEntry', { id: entry.id });
  return (
    <p className={styles.lastLog}>
      <NavAnchor
        to={to}
        state={originState}
        className={styles.lastLogLink}
        data-testid="home-last-log"
      >
        {t('where.last', { date: formatDayMonth(entry.entryDate), title })}
        {entry.photoCount > 0 ? ` · ${t('where.lastPhotos', { count: entry.photoCount })}` : ''}
      </NavAnchor>
    </p>
  );
}
