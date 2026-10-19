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
import type { DiaryEntrySummary, DiaryFilterOptions } from '@cornerstone/shared';
import { fetchDiaryFilterOptions, listDiaryEntries } from '../../lib/diaryApi.js';
import { groupByWeek, weekEnd, weekKind } from '../../lib/feedWeeks.js';
import { useFormatters } from '../../lib/formatters.js';
import { todayLocalIsoDate } from '../../lib/localDate.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useInfiniteScroll, type InfiniteScrollPage } from '../../hooks/useInfiniteScroll.js';
import { useInfiniteScrollAnnouncements } from '../../hooks/useInfiniteScrollAnnouncements.js';
import { SearchEverywhereRow } from '../../components/CommandSearch/SearchEverywhereRow.js';
import { DiaryEntryFeedRow } from '../../components/FeedRow/DiaryEntryFeedRow.js';
import { FeedGroup } from '../../components/FeedRow/FeedGroup.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { FormError } from '../../components/FormError/FormError.js';
import { InfiniteScrollFooter } from '../../components/InfiniteScrollFooter/InfiniteScrollFooter.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import shared from '../../styles/shared.module.css';
import { DiaryActiveFilters, DiaryFilters } from './DiaryFilters.js';
import { DiaryUnfinished } from './DiaryUnfinished.js';
import {
  EMPTY_DIARY_FILTERS,
  hasAnyFilter,
  readDiaryFilters,
  writeDiaryFilters,
} from './diaryQuery.js';
import type { DiaryFilterState } from './diaryQuery.js';
import styles from './DiaryPage.module.css';

const PAGE_SIZE = 25;
const SKELETON_ROWS = 3;
const SKELETON_THUMBS = 6;

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
  const { formatDayMonth, formatDayRange } = useFormatters();
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
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
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
  const focusAfterRetryRef = useRef(false);
  const emptyMessageRef = useRef<HTMLHeadingElement | HTMLParagraphElement>(null);

  // What the Filters surface offers: loaded once; a failure leaves Area and Company hidden.
  const [filterOptions, setFilterOptions] = useState<DiaryFilterOptions | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchDiaryFilterOptions()
      .then((options) => {
        if (!cancelled) setFilterOptions(options);
      })
      .catch(() => {
        if (!cancelled) setFilterOptions(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Filter state from URL
  const filters = useMemo(() => readDiaryFilters(searchParams), [searchParams]);
  const searchQuery = filters.q;

  const applyFilters = (patch: Partial<DiaryFilterState>) => {
    setSearchParams((prev) => writeDiaryFilters(prev, patch), { replace: true });
  };

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
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isFirstSearchSyncRef.current) {
      isFirstSearchSyncRef.current = false;
      return;
    }
    setSearchParams((prev) => writeDiaryFilters(prev, { q: debouncedSearchInput }), {
      replace: true,
    });
  }, [debouncedSearchInput, setSearchParams]);

  const fetchDiaryPage = async (
    page: number,
  ): Promise<InfiniteScrollPage<DiaryEntrySummary, { totalItems: number }>> => {
    const response = await listDiaryEntries({
      page,
      pageSize: PAGE_SIZE,
      q: filters.q || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      automatic: false,
      type: filters.types.length > 0 ? filters.types.join(',') : undefined,
      // Drafts leave the feed; "Show all" lists drafts only.
      status: filters.drafts ? 'draft' : 'saved',
      areaId: filters.areaId || undefined,
      vendorId: filters.companyId || undefined,
    });

    return {
      items: response.items,
      hasMore: page < response.pagination.totalPages,
      meta: {
        totalItems: response.pagination.totalItems,
      },
    };
  };

  const resetKey = [
    filters.q,
    filters.dateFrom,
    filters.dateTo,
    filters.types.join(','),
    filters.areaId,
    filters.companyId,
    filters.drafts,
  ].join('|');

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
    focusAfterRetryRef.current = false;
  }, [resetKey]);

  const handleRetry = () => {
    focusAfterRetryRef.current = true;
    retry();
  };

  // After a retry the Retry button is gone: focus the empty message, or the heading when rows came.
  useLayoutEffect(() => {
    if (status === 'loading') return;
    if (focusAfterRetryRef.current && status !== 'error') {
      (entries.length === 0 ? emptyMessageRef.current : headingRef.current)?.focus();
    }
    focusAfterRetryRef.current = false;
  }, [status, entries.length]);

  const today = todayLocalIsoDate();
  const weeks = useMemo(() => groupByWeek(entries), [entries]);

  const handleClearAll = () => {
    setSearchInput('');
    setSearchParams((prev) => writeDiaryFilters(prev, EMPTY_DIARY_FILTERS), { replace: true });
  };

  const anythingSet = hasAnyFilter(filters);
  const showEmpty =
    !showInitialLoading && entries.length === 0 && !firstBatchFailed && status !== 'error';

  const weekHeading = (monday: string): string => {
    const kind = weekKind(monday, today);
    if (kind === 'thisWeek') return t('week.thisWeek');
    if (kind === 'lastWeek') return t('week.lastWeek');
    return t('week.weekOf', { date: formatDayMonth(monday) });
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
              {pageTitle}
            </h1>
            <p className={styles.subtitle} data-testid="diary-entry-count">
              {t('page.entryCount', { count: totalItems })}
              <NavAnchor
                to={routeUrl('history')}
                className={styles.historyLink}
                aria-label={t('page.historyLinkAriaLabel')}
                data-testid="diary-history-link"
              >
                {tc('navigation.history')}
                <span aria-hidden="true"> ›</span>
              </NavAnchor>
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

      {!filters.drafts ? (
        <DiaryUnfinished onShowAll={() => applyFilters({ drafts: true })} headingRef={headingRef} />
      ) : null}

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <label htmlFor="diary-search" className={shared.srOnly}>
            {t('filters.searchLabel')}
          </label>
          <input
            ref={searchInputRef}
            data-page-search=""
            id="diary-search"
            type="text"
            className={shared.input}
            placeholder={t('filters.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => {
              e.stopPropagation();
              setSearchInput(e.target.value);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape' && searchInput) {
                setSearchInput('');
              }
            }}
            aria-label={t('filters.searchAriaLabel')}
            data-testid="diary-search-input"
          />
          <SearchEverywhereRow query={searchInput} returnFocusRef={searchInputRef} />
        </div>
        <DiaryFilters
          state={filters}
          onChange={applyFilters}
          onClearAll={handleClearAll}
          options={filterOptions}
          buttonRef={filtersButtonRef}
        />
      </div>

      <DiaryActiveFilters
        state={filters}
        options={filterOptions}
        onChange={applyFilters}
        onClearAll={handleClearAll}
        buttonRef={filtersButtonRef}
      />

      {showInitialLoading && (
        <div className={styles.skeletonList} aria-busy="true" data-testid="diary-loading">
          {Array.from({ length: SKELETON_ROWS }, (_, row) => (
            <div key={row} className={styles.skeletonRow}>
              <div className={styles.skeletonStrip} aria-hidden="true">
                {Array.from({ length: SKELETON_THUMBS }, (_, cell) => (
                  <span key={cell} className={styles.skeletonCell} />
                ))}
              </div>
              <Skeleton lines={3} loadingLabel={t('loading')} />
            </div>
          ))}
        </div>
      )}

      {firstBatchFailed && entries.length === 0 && (
        <div className={styles.errorBlock}>
          <FormError message={t('error')} />
          <button
            type="button"
            className={shared.btnSecondaryCompact}
            onClick={handleRetry}
            data-testid="diary-retry"
          >
            {t('infiniteScroll.retryButton')}
          </button>
        </div>
      )}

      {showEmpty &&
        (anythingSet ? (
          <div data-testid="diary-filtered-empty">
            <EmptyState
              icon="🔍"
              message={t('emptyFiltered.title')}
              messageRef={emptyMessageRef}
              action={{
                label: t('emptyFiltered.clear'),
                onClick: () => {
                  handleClearAll();
                  filtersButtonRef.current?.focus();
                },
              }}
            />
          </div>
        ) : (
          <div data-testid="diary-empty">
            <EmptyState
              icon="📷"
              message={t('empty.title')}
              description={t('empty.hint')}
              messageRef={emptyMessageRef}
              action={{
                label: t('page.logToday'),
                href: routeUrl('diaryEntryNew'),
                state: logTodayState,
              }}
            />
          </div>
        ))}

      {entries.length > 0 && (
        <div
          className={styles.timeline}
          role="feed"
          aria-label={t('page.timelineAriaLabel')}
          aria-busy={status === 'loading'}
        >
          {weeks.map(([monday, rows]) => (
            <FeedGroup
              key={monday}
              testId={`diary-week-${monday}`}
              heading={weekHeading(monday)}
              headingDetail={formatDayRange(monday, weekEnd(monday))}
              srSuffix={t('week.srCount', { count: rows.length })}
            >
              {rows.map((entry) => (
                <DiaryEntryFeedRow key={entry.id} entry={entry} />
              ))}
            </FeedGroup>
          ))}
        </div>
      )}

      {/* Live region for announcements */}
      <div ref={announcementRef} className={styles.liveRegion} role="status" aria-atomic="true" />

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
