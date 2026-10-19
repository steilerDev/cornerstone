import { routeUrl } from '@cornerstone/shared';
import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { Navigate, useSearchParams, useLocation } from 'react-router-dom';
import { readFocusHeading } from '../../navigation/focusHeading.js';
import { useTranslation } from 'react-i18next';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { useOpenCreate } from '../../navigation/useOpenCreate.js';
import { originStateFor } from '../../navigation/origin.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { diaryHistoryRedirectTarget } from '../../navigation/diaryHistoryRedirect.js';
import { MANUAL_DIARY_ENTRY_TYPES } from '@cornerstone/shared';
import type { DiaryEntryType, DiaryEntrySummary, DiaryEntryStatus } from '@cornerstone/shared';
import { listDiaryEntries } from '../../lib/diaryApi.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useInfiniteScroll, type InfiniteScrollPage } from '../../hooks/useInfiniteScroll.js';
import { useInfiniteScrollAnnouncements } from '../../hooks/useInfiniteScrollAnnouncements.js';
import { DiaryFilterBar } from '../../components/diary/DiaryFilterBar/DiaryFilterBar.js';
import { DiaryDateGroup } from '../../components/diary/DiaryDateGroup/DiaryDateGroup.js';
import { InfiniteScrollFooter } from '../../components/InfiniteScrollFooter/InfiniteScrollFooter.js';
import shared from '../../styles/shared.module.css';
import styles from './DiaryPage.module.css';

interface GroupedEntries {
  [date: string]: DiaryEntrySummary[];
}

const PAGE_SIZE = 25;

/** The Site diary lists people's entries; the old ?filterMode links go to History first. */
export default function DiaryPage() {
  const [searchParams] = useSearchParams();
  const target = diaryHistoryRedirectTarget(searchParams);
  if (target !== null) return <Navigate to={target} replace />;
  return <DiaryListPage />;
}

function DiaryListPage() {
  const { t } = useTranslation('diary');
  const { t: tc } = useTranslation('common');
  const pageTitle = tc('navigation.siteDiary');
  useDocumentTitle(pageTitle);
  const openCreate = useOpenCreate();
  const listShortcuts = useMemo(
    () => [
      {
        key: 'n',
        handler: () => openCreate('diaryEntry'),
        description: tc('listShortcuts.newDiaryEntry'),
      },
    ],
    [openCreate, tc],
  );
  useKeyboardShortcuts(listShortcuts);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  // "Log today" is today by definition: no date or area from the page's create context.
  const logTodayState = originStateFor(location);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusedKeyRef = useRef<string | null>(null);

  // Arriving after Discard: the heading takes focus once per navigation.
  useEffect(() => {
    if (!readFocusHeading(location.state) || focusedKeyRef.current === location.key) return;
    if (!headingRef.current) return;
    focusedKeyRef.current = location.key;
    headingRef.current.focus();
  }, [location.key, location.state]);

  const [totalItems, setTotalItems] = useState(0);
  const [firstBatchFailed, setFirstBatchFailed] = useState(false);
  const focusEmptyStateAfterRetryRef = useRef(false);
  const emptyStateCtaRef = useRef<HTMLAnchorElement>(null);

  // Filter state from URL
  const searchQuery = searchParams.get('q') || '';
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';
  const typeFilterStr = searchParams.get('types') || '';
  const activeTypes: DiaryEntryType[] = typeFilterStr
    ? (typeFilterStr
        .split(',')
        .filter((type) =>
          (MANUAL_DIARY_ENTRY_TYPES as readonly string[]).includes(type),
        ) as DiaryEntryType[])
    : [];
  const statusFilter = (searchParams.get('status') as DiaryEntryStatus | null) || null;

  const [searchInput, setSearchInput] = useState(searchQuery);

  // Debounced search with URL sync
  const debouncedSearchInput = useDebounce(searchInput, 300);
  // Re-sync from the URL (sidebar to the bare route, Back), not from our own debounced write.
  const [prevUrlQ, setPrevUrlQ] = useState(searchQuery);
  if (searchQuery !== prevUrlQ) {
    setPrevUrlQ(searchQuery);
    if (searchQuery !== debouncedSearchInput) setSearchInput(searchQuery);
  }
  const isFirstSearchSyncRef = useRef(true);

  useEffect(() => {
    if (isFirstSearchSyncRef.current) {
      isFirstSearchSyncRef.current = false;
      return;
    }
    setSearchParams(
      (prev) => {
        const newParams = new URLSearchParams(prev);
        if (debouncedSearchInput) {
          newParams.set('q', debouncedSearchInput);
        } else {
          newParams.delete('q');
        }
        newParams.delete('page');
        return newParams;
      },
      { replace: true },
    );
  }, [debouncedSearchInput, setSearchParams]);

  const fetchDiaryPage = async (
    page: number,
  ): Promise<InfiniteScrollPage<DiaryEntrySummary, { totalItems: number }>> => {
    const response = await listDiaryEntries({
      page,
      pageSize: PAGE_SIZE,
      q: searchQuery || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      automatic: false,
      type: activeTypes.length > 0 ? activeTypes.join(',') : undefined,
      status: statusFilter || undefined,
    });

    return {
      items: response.items,
      hasMore: page < response.pagination.totalPages,
      meta: {
        totalItems: response.pagination.totalItems,
      },
    };
  };

  const resetKey = `${searchQuery}|${dateFrom}|${dateTo}|${typeFilterStr}|${statusFilter}`;

  const {
    items: entries,
    status,
    hasMore,
    fetchSequence,
    sentinelRef,
    loadMore,
    retry,
  } = useInfiniteScroll<DiaryEntrySummary, { totalItems: number }>({
    fetchPage: fetchDiaryPage,
    resetKey,
    onPageApplied: (meta) => {
      if (meta) {
        setTotalItems(meta.totalItems);
      }
      setFirstBatchFailed(false);
    },
    onPageFailed: (_err, page) => {
      if (page === 1) setFirstBatchFailed(true);
    },
  });

  const announcementRef = useInfiniteScrollAnnouncements({
    fetchSequence,
    status,
    hasMore,
    items: entries,
    getKey: (e) => e.id,
    labels: {
      initialLoad: (count) => t('infiniteScroll.initialLoadAnnouncement', { count }),
      batchAppended: (count) => t('infiniteScroll.batchAppendedAnnouncement', { count }),
      batchAppendedAndEnd: (count) =>
        t('infiniteScroll.batchAppendedAndEndAnnouncement', { count }),
    },
  });

  const showInitialLoading = status === 'loading' && entries.length === 0 && !firstBatchFailed;

  // First-batch recovery state belongs to the current query: a filter change starts fresh.
  useEffect(() => {
    /* eslint-disable @eslint-react/set-state-in-effect -- reset per-query state when the query changes */
    setFirstBatchFailed(false);
    /* eslint-enable @eslint-react/set-state-in-effect */
    focusEmptyStateAfterRetryRef.current = false;
  }, [resetKey]);

  const handleRetry = () => {
    if (entries.length === 0) focusEmptyStateAfterRetryRef.current = true;
    retry();
  };

  useLayoutEffect(() => {
    if (status === 'loading') return;
    if (focusEmptyStateAfterRetryRef.current && status === 'done' && entries.length === 0) {
      emptyStateCtaRef.current?.focus();
    }
    focusEmptyStateAfterRetryRef.current = false;
  }, [status, entries.length]);

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
    setSearchParams(newParams, { replace: true });
  };

  const handleDateToChange = (date: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (date) {
      newParams.set('dateTo', date);
    } else {
      newParams.delete('dateTo');
    }
    newParams.delete('page');
    setSearchParams(newParams, { replace: true });
  };

  const handleTypesChange = (types: DiaryEntryType[]) => {
    const newParams = new URLSearchParams(searchParams);
    if (types.length > 0) {
      newParams.set('types', types.join(','));
    } else {
      newParams.delete('types');
    }
    newParams.delete('page');
    setSearchParams(newParams, { replace: true });
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
    setSearchParams(newParams, { replace: true });
  };

  const handleClearAll = () => {
    setSearchInput('');
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const sortedDates = Object.keys(groupedEntries).sort().reverse();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
              {pageTitle}
            </h1>
            <p className={styles.subtitle}>
              {totalItems}{' '}
              {totalItems === 1 ? t('page.entryCountSingular') : t('page.entryCountPlural')}
            </p>
          </div>
          <NavAnchor
            to={routeUrl('diaryEntryNew')}
            state={logTodayState}
            className={`${shared.btnPrimary} ${styles.createButton}`}
            data-testid="diary-log-today"
          >
            {t('page.logToday')}
          </NavAnchor>
        </div>
      </header>

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
        draftsVisible={draftsVisible}
        onDraftsVisibleChange={handleDraftsVisibleChange}
      />

      {showInitialLoading && <div className={shared.loading}>{t('loading')}</div>}

      {!showInitialLoading && entries.length === 0 && !firstBatchFailed && status !== 'error' && (
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
          <NavAnchor
            to={routeUrl('diaryEntryNew')}
            state={logTodayState}
            className={shared.btnPrimary}
            ref={emptyStateCtaRef}
          >
            {t('empty.createButton')}
          </NavAnchor>
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
      <div ref={announcementRef} className={styles.liveRegion} role="status" aria-atomic="true" />

      {(entries.length > 0 || firstBatchFailed) && (
        <InfiniteScrollFooter
          status={status}
          loadingLabel={t('infiniteScroll.loadingMore')}
          loadingAriaLabel={t('infiniteScroll.loadingMoreAriaLabel')}
          loadMoreLabel={t('infiniteScroll.loadMoreButton')}
          retryLabel={t('infiniteScroll.retryButton')}
          errorMessage={entries.length === 0 ? t('error') : t('infiniteScroll.errorMessage')}
          endOfListMessage={t('infiniteScroll.endOfList')}
          sentinelRef={sentinelRef}
          onLoadMore={loadMore}
          onRetry={handleRetry}
          testIdPrefix="diary"
        />
      )}
    </div>
  );
}
