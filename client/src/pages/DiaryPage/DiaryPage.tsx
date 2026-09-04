import { useEffect, useRef, useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  DiaryEntryType,
  DiaryEntrySummary,
  DiaryEntryStatus,
  ManualDiaryEntryType,
} from '@cornerstone/shared';
import { listDiaryEntries } from '../../lib/diaryApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useInfiniteScroll, type InfiniteScrollPage } from '../../hooks/useInfiniteScroll.js';
import { DiaryFilterBar } from '../../components/diary/DiaryFilterBar/DiaryFilterBar.js';
import { DiaryDateGroup } from '../../components/diary/DiaryDateGroup/DiaryDateGroup.js';
import { InfiniteScrollFooter } from '../../components/InfiniteScrollFooter/InfiniteScrollFooter.js';
import shared from '../../styles/shared.module.css';
import styles from './DiaryPage.module.css';

type FilterMode = 'all' | 'manual' | 'automatic';

interface GroupedEntries {
  [date: string]: DiaryEntrySummary[];
}

const MANUAL_TYPES = new Set<ManualDiaryEntryType>([
  'daily_log',
  'site_visit',
  'delivery',
  'issue',
  'general_note',
]);

const PAGE_SIZE = 25;

export default function DiaryPage() {
  const { t } = useTranslation('diary');
  const [searchParams, setSearchParams] = useSearchParams();

  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState('');

  // Filter state from URL
  const searchQuery = searchParams.get('q') || '';
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';
  const filterMode = (searchParams.get('filterMode') as FilterMode) || 'manual';
  const typeFilterStr = searchParams.get('types') || '';
  const activeTypes: DiaryEntryType[] = typeFilterStr
    ? (typeFilterStr.split(',') as DiaryEntryType[])
    : [];
  const statusFilter = (searchParams.get('status') as DiaryEntryStatus | null) || null;

  const [searchInput, setSearchInput] = useState(searchQuery);
  const announcementRef = useRef<HTMLDivElement>(null);

  // Debounced search with URL sync
  const debouncedSearchInput = useDebounce(searchInput, 300);
  const isFirstSearchSyncRef = useRef(true);

  useEffect(() => {
    if (isFirstSearchSyncRef.current) {
      isFirstSearchSyncRef.current = false;
      return;
    }
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      if (debouncedSearchInput) {
        newParams.set('q', debouncedSearchInput);
      } else {
        newParams.delete('q');
      }
      newParams.delete('page');
      return newParams;
    });
  }, [debouncedSearchInput, setSearchParams]);

  const fetchDiaryPage = async (
    page: number,
  ): Promise<InfiniteScrollPage<DiaryEntrySummary, { totalItems: number }>> => {
    // Determine which types to query based on filter mode
    let queriableTypes: DiaryEntryType[] = activeTypes;
    if (filterMode === 'manual') {
      queriableTypes =
        activeTypes.length > 0
          ? activeTypes.filter((type) => MANUAL_TYPES.has(type as ManualDiaryEntryType))
          : (Array.from(MANUAL_TYPES) as DiaryEntryType[]);
    } else if (filterMode === 'automatic') {
      queriableTypes =
        activeTypes.length > 0
          ? activeTypes.filter((type) => !MANUAL_TYPES.has(type as ManualDiaryEntryType))
          : ([
              'work_item_status',
              'invoice_status',
              'invoice_created',
              'milestone_delay',
              'budget_breach',
              'auto_reschedule',
              'subsidy_status',
            ] as const as unknown as DiaryEntryType[]);
    }

    const response = await listDiaryEntries({
      page,
      pageSize: PAGE_SIZE,
      q: searchQuery || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      type: queriableTypes.length > 0 ? queriableTypes.join(',') : undefined,
      status: statusFilter || undefined,
    });

    return {
      items: response.items,
      hasMore: page < response.pagination.totalPages,
      meta: { totalItems: response.pagination.totalItems },
    };
  };

  const resetKey = `${searchQuery}|${dateFrom}|${dateTo}|${filterMode}|${typeFilterStr}|${statusFilter}`;

  const {
    items: entries,
    status,
    hasMore,
    lastBatchCount,
    fetchSequence,
    sentinelRef,
    loadMore,
    retry,
  } = useInfiniteScroll<DiaryEntrySummary, { totalItems: number }>({
    fetchPage: fetchDiaryPage,
    resetKey,
    onPageApplied: (meta) => {
      if (meta) setTotalItems(meta.totalItems);
      setError('');
    },
    onPageFailed: (err) => {
      setError(err instanceof ApiClientError ? err.error.message : t('error'));
    },
  });

  const showInitialLoading = status === 'loading' && entries.length === 0;

  useEffect(() => {
    if (fetchSequence === 0 || !announcementRef.current) return;
    if (fetchSequence === 1) {
      announcementRef.current.textContent = t('infiniteScroll.initialLoadAnnouncement', {
        count: lastBatchCount,
      });
    } else if (!hasMore) {
      announcementRef.current.textContent = t('infiniteScroll.batchAppendedAndEndAnnouncement', {
        count: lastBatchCount,
      });
    } else {
      announcementRef.current.textContent = t('infiniteScroll.batchAppendedAnnouncement', {
        count: lastBatchCount,
      });
    }
  }, [fetchSequence, hasMore, lastBatchCount, t]);

  const groupedEntries = useMemo(() => {
    const grouped: GroupedEntries = {};
    entries.forEach((entry) => {
      const date = entry.entryDate;
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(entry);
    });
    return grouped;
  }, [entries]);

  const handleSearchChange = (query: string) => {
    setSearchInput(query);
  };

  const handleDateFromChange = (date: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (date) {
      newParams.set('dateFrom', date);
    } else {
      newParams.delete('dateFrom');
    }
    newParams.delete('page');
    setSearchParams(newParams);
  };

  const handleDateToChange = (date: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (date) {
      newParams.set('dateTo', date);
    } else {
      newParams.delete('dateTo');
    }
    newParams.delete('page');
    setSearchParams(newParams);
  };

  const handleTypesChange = (types: DiaryEntryType[]) => {
    const newParams = new URLSearchParams(searchParams);
    if (types.length > 0) {
      newParams.set('types', types.join(','));
    } else {
      newParams.delete('types');
    }
    newParams.delete('page');
    setSearchParams(newParams);
  };

  const handleFilterModeChange = (mode: FilterMode) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('filterMode', mode);
    newParams.delete('types');
    newParams.delete('page');
    setSearchParams(newParams);
  };

  const draftsVisible = statusFilter !== 'saved';

  const handleDraftsVisibleChange = (visible: boolean) => {
    const newParams = new URLSearchParams(searchParams);
    if (visible) {
      newParams.delete('status');
    } else {
      newParams.set('status', 'saved');
    }
    newParams.delete('page');
    setSearchParams(newParams);
  };

  const handleClearAll = () => {
    setSearchInput('');
    const newParams = new URLSearchParams();
    newParams.set('filterMode', 'manual');
    setSearchParams(newParams);
  };

  const sortedDates = Object.keys(groupedEntries).sort().reverse();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.title}>{t('page.title')}</h1>
            <p className={styles.subtitle}>
              {totalItems}{' '}
              {totalItems === 1 ? t('page.entryCountSingular') : t('page.entryCountPlural')}
            </p>
          </div>
          <Link
            to="/diary/new"
            className={`${shared.btnPrimary} ${styles.createButton}`}
            style={{ textDecoration: 'none' }}
          >
            {t('page.newEntryButton')}
          </Link>
        </div>
      </header>

      {error && entries.length === 0 && <div className={shared.bannerError}>{error}</div>}

      <DiaryFilterBar
        searchQuery={searchInput}
        onSearchChange={handleSearchChange}
        dateFrom={dateFrom}
        onDateFromChange={handleDateFromChange}
        dateTo={dateTo}
        onDateToChange={handleDateToChange}
        activeTypes={activeTypes}
        onTypesChange={handleTypesChange}
        onClearAll={handleClearAll}
        filterMode={filterMode}
        onFilterModeChange={handleFilterModeChange}
        draftsVisible={draftsVisible}
        onDraftsVisibleChange={handleDraftsVisibleChange}
      />

      {showInitialLoading && <div className={shared.loading}>{t('loading')}</div>}

      {!showInitialLoading && entries.length === 0 && status !== 'error' && (
        <div
          className={shared.emptyState}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--spacing-3)',
          }}
        >
          <p>{t('empty.title')}</p>
          <Link to="/diary/new" className={shared.btnPrimary}>
            {t('empty.createButton')}
          </Link>
        </div>
      )}

      {entries.length > 0 && (
        <div
          className={styles.timeline}
          role="feed"
          aria-label={t('page.timelineAriaLabel')}
          aria-busy={status === 'loading'}
        >
          {sortedDates.map((date) => (
            <DiaryDateGroup key={date} date={date} entries={groupedEntries[date]!} />
          ))}
        </div>
      )}

      {/* Live region for announcements */}
      <div
        ref={announcementRef}
        className={styles.liveRegion}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      />

      {entries.length > 0 && (
        <InfiniteScrollFooter
          status={status}
          loadingLabel={t('infiniteScroll.loadingMore')}
          loadingAriaLabel={t('infiniteScroll.loadingMoreAriaLabel')}
          loadMoreLabel={t('infiniteScroll.loadMoreButton')}
          retryLabel={t('infiniteScroll.retryButton')}
          errorMessage={t('infiniteScroll.errorMessage')}
          endOfListMessage={t('infiniteScroll.endOfList')}
          sentinelRef={sentinelRef}
          onLoadMore={loadMore}
          onRetry={retry}
          testIdPrefix="diary"
        />
      )}
    </div>
  );
}
