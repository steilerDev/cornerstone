import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { DiaryEntrySummary, HistoryObjectRef } from '@cornerstone/shared';
import { DiaryEntryFeedRow } from '../../components/FeedRow/DiaryEntryFeedRow.js';
import { FeedGroup } from '../../components/FeedRow/FeedGroup.js';
import { SystemEventFeedRow } from '../../components/FeedRow/SystemEventFeedRow.js';
import { previousIsoDate } from '../../components/DateChips/DateChips.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { FormError } from '../../components/FormError/FormError.js';
import { InfiniteScrollFooter } from '../../components/InfiniteScrollFooter/InfiniteScrollFooter.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll.js';
import type { InfiniteScrollPage } from '../../hooks/useInfiniteScroll.js';
import { useInfiniteScrollAnnouncements } from '../../hooks/useInfiniteScrollAnnouncements.js';
import { useFormatters } from '../../lib/formatters.js';
import { listHistory } from '../../lib/historyApi.js';
import { todayLocalIsoDate } from '../../lib/localDate.js';
import shared from '../../styles/shared.module.css';
import { HistoryFilters } from './HistoryFilters.js';
import {
  dayKeyOf,
  hasActiveFilters,
  readHistoryFilters,
  toHistoryQuery,
  writeHistoryFilters,
} from './historyQuery.js';
import type { HistoryFilters as HistoryFilterState } from './historyQuery.js';
import styles from './HistoryPage.module.css';

const PAGE_SIZE = 25;

interface HistoryPageMeta {
  totalItems: number;
  hiddenCount: number;
  object: HistoryObjectRef | null;
}

const CLEARED: Partial<HistoryFilterState> = {
  type: null,
  object: null,
  q: '',
  dateFrom: '',
  dateTo: '',
  includeDiary: false,
};

/** History › History: every system event of the project, newest first, grouped by day. */
export default function HistoryPage() {
  const { t } = useTranslation('history');
  const { t: tc } = useTranslation('common');
  const { t: td } = useTranslation('diary');
  const { formatDate } = useFormatters();
  const pageTitle = tc('navigation.history');
  useDocumentTitle(pageTitle);

  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readHistoryFilters(searchParams), [searchParams]);

  const [showHidden, setShowHidden] = useState(false);
  const [hiddenStatus, setHiddenStatus] = useState('');
  const [hiddenCount, setHiddenCount] = useState(0);
  const [objectRef, setObjectRef] = useState<HistoryObjectRef | null>(null);
  const [firstBatchFailed, setFirstBatchFailed] = useState(false);
  const totalItemsRef = useRef(0);
  const focusEmptyStateAfterRetryRef = useRef(false);
  const emptyMessageRef = useRef<HTMLHeadingElement | HTMLParagraphElement>(null);
  const filtersRootRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const pendingChipFocusRef = useRef(false);

  // ── Search draft: local text, debounced into the URL with a replace write ──────────────────
  const [searchInput, setSearchInput] = useState(filters.q);
  const debouncedSearchInput = useDebounce(searchInput, 300);
  // Re-sync from the URL (sidebar to the bare route, Back), not from our own debounced write.
  const [prevUrlQ, setPrevUrlQ] = useState(filters.q);
  if (filters.q !== prevUrlQ) {
    setPrevUrlQ(filters.q);
    if (filters.q !== debouncedSearchInput) setSearchInput(filters.q);
  }
  const isFirstSearchSyncRef = useRef(true);
  useEffect(() => {
    if (isFirstSearchSyncRef.current) {
      isFirstSearchSyncRef.current = false;
      return;
    }
    setSearchParams((prev) => writeHistoryFilters(prev, { q: debouncedSearchInput }), {
      replace: true,
    });
  }, [debouncedSearchInput, setSearchParams]);

  const applyFilters = (patch: Partial<HistoryFilterState>) => {
    setSearchParams((prev) => writeHistoryFilters(prev, patch), { replace: true });
  };

  const clearFilters = () => {
    setSearchInput('');
    applyFilters(CLEARED);
  };

  const fetchHistoryPage = async (
    page: number,
  ): Promise<InfiniteScrollPage<DiaryEntrySummary, HistoryPageMeta>> => {
    const response = await listHistory(toHistoryQuery(filters, page, PAGE_SIZE, showHidden));
    return {
      items: response.items,
      hasMore: page < response.pagination.totalPages,
      meta: {
        totalItems: response.pagination.totalItems,
        hiddenCount: response.hiddenCount,
        object: response.object,
      },
    };
  };

  const resetKey = [
    filters.type ?? '',
    filters.object ? `${filters.object.entityType}:${filters.object.entityId}` : '',
    filters.q,
    filters.dateFrom,
    filters.dateTo,
    filters.includeDiary,
    showHidden,
  ].join('|');

  const {
    items: entries,
    status,
    hasMore,
    fetchSequence,
    sentinelRef,
    loadMore,
    retry,
  } = useInfiniteScroll<DiaryEntrySummary, HistoryPageMeta>({
    fetchPage: fetchHistoryPage,
    resetKey,
    onPageApplied: (meta) => {
      if (meta) {
        totalItemsRef.current = meta.totalItems;
        setHiddenCount(meta.hiddenCount);
        setObjectRef(meta.object);
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
      initialLoad: () => t('resultCount', { count: totalItemsRef.current }),
      batchAppended: (count) => t('infiniteScroll.batchAppended', { count }),
      batchAppendedAndEnd: (count) => t('infiniteScroll.batchAppendedAndEnd', { count }),
    },
  });

  const showInitialLoading = status === 'loading' && entries.length === 0 && !firstBatchFailed;

  // The one status region is written by the announcements hook; the first load names itself here.
  useEffect(() => {
    if (showInitialLoading && announcementRef.current) {
      announcementRef.current.textContent = t('loading');
    }
  }, [showInitialLoading, announcementRef, t]);

  // First-batch recovery state belongs to the current query: a filter change starts fresh.
  useEffect(() => {
    /* eslint-disable @eslint-react/set-state-in-effect -- reset per-query state when the query changes */
    setFirstBatchFailed(false);
    /* eslint-enable @eslint-react/set-state-in-effect */
    focusEmptyStateAfterRetryRef.current = false;
  }, [resetKey]);

  // A filter change returns to the top of the feed when its top has scrolled out of view.
  const isFirstResetRef = useRef(true);
  useEffect(() => {
    if (isFirstResetRef.current) {
      isFirstResetRef.current = false;
      return;
    }
    const top = feedRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0 && typeof window.scrollTo === 'function') window.scrollTo({ top: 0 });
  }, [resetKey]);

  const handleRetry = () => {
    if (entries.length === 0) focusEmptyStateAfterRetryRef.current = true;
    retry();
  };

  useLayoutEffect(() => {
    if (status === 'loading') return;
    if (focusEmptyStateAfterRetryRef.current && status === 'done' && entries.length === 0) {
      emptyMessageRef.current?.focus();
    }
    focusEmptyStateAfterRetryRef.current = false;
  }, [status, entries.length]);

  // The empty state's "Clear filters" unmounts with the filters: focus the first type chip.
  const anythingSet = hasActiveFilters(filters) || filters.includeDiary;
  useLayoutEffect(() => {
    if (!anythingSet && pendingChipFocusRef.current) {
      pendingChipFocusRef.current = false;
      filtersRootRef.current?.querySelector<HTMLElement>('button')?.focus();
    }
  }, [anythingSet]);

  const groups = useMemo(() => {
    const byDay = new Map<string, DiaryEntrySummary[]>();
    for (const entry of entries) {
      const key = dayKeyOf(entry);
      const list = byDay.get(key);
      if (list) list.push(entry);
      else byDay.set(key, [entry]);
    }
    return [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [entries]);

  const today = todayLocalIsoDate();
  const yesterday = previousIsoDate(today);

  const matchedObject =
    filters.object &&
    objectRef &&
    objectRef.entityType === filters.object.entityType &&
    objectRef.entityId === filters.object.entityId
      ? objectRef
      : null;

  return (
    <PageLayout title={pageTitle}>
      <div className={styles.column}>
        <p className={styles.description}>{t('description')}</p>

        <div ref={filtersRootRef}>
          <HistoryFilters
            filters={filters}
            searchInput={searchInput}
            onSearchInput={setSearchInput}
            onChange={applyFilters}
            onClear={clearFilters}
            objectName={matchedObject ? matchedObject.title : null}
            objectExists={matchedObject ? matchedObject.exists : null}
          />
        </div>

        {(hiddenCount > 0 || showHidden) && (
          <div className={styles.hiddenNote} data-testid="history-hidden-note">
            <span>
              {showHidden
                ? td('event.hiddenShowing', { count: hiddenCount })
                : td('event.hiddenNote', { count: hiddenCount })}
            </span>
            <button
              type="button"
              className={styles.hiddenToggle}
              aria-pressed={showHidden}
              data-testid="history-show-hidden"
              onClick={() => {
                setHiddenStatus(
                  showHidden
                    ? td('event.hiddenHiddenAgain')
                    : td('event.hiddenShown', { count: hiddenCount }),
                );
                setShowHidden(!showHidden);
              }}
            >
              {showHidden ? td('event.hideHidden') : td('event.showHidden')}
            </button>
          </div>
        )}
        <div className={shared.srOnly} role="status" data-testid="history-hidden-status">
          {hiddenStatus}
        </div>

        <div
          ref={announcementRef}
          className={shared.srOnly}
          role="status"
          data-testid="history-result-status"
        />

        <div ref={feedRef} data-testid="history-feed">
          {showInitialLoading && (
            <div aria-hidden="true" className={styles.skeletonGroups}>
              {[0, 1, 2].map((group) => (
                <div key={group} className={styles.skeletonGroup}>
                  <div className={styles.skeletonHeading} />
                  <Skeleton lines={3} />
                </div>
              ))}
            </div>
          )}

          {firstBatchFailed && entries.length === 0 && (
            <div className={styles.errorBlock}>
              <FormError message={t('loadError')} />
              <button
                type="button"
                className={shared.btnSecondaryCompact}
                onClick={handleRetry}
                data-testid="history-try-again"
              >
                {t('tryAgain')}
              </button>
            </div>
          )}

          {!showInitialLoading &&
            entries.length === 0 &&
            !firstBatchFailed &&
            status !== 'error' &&
            (anythingSet ? (
              <EmptyState
                icon="🔍"
                message={t('filteredEmpty.title')}
                description={t('filteredEmpty.text')}
                messageRef={emptyMessageRef}
                action={{
                  label: t('filters.clear'),
                  onClick: () => {
                    pendingChipFocusRef.current = true;
                    clearFilters();
                  },
                }}
              />
            ) : (
              <EmptyState
                icon="🕘"
                message={t('empty.title')}
                description={t('empty.text')}
                messageRef={emptyMessageRef}
              />
            ))}

          {entries.length > 0 &&
            groups.map(([key, dayEntries]) => (
              <FeedGroup
                key={key}
                testId={`date-group-${key}`}
                heading={
                  key === today
                    ? t('day.today')
                    : key === yesterday
                      ? t('day.yesterday')
                      : formatDate(key)
                }
                headingDetail={key === today || key === yesterday ? formatDate(key) : undefined}
              >
                {[...dayEntries]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map((entry) =>
                    entry.isAutomatic ? (
                      // P4.11 wires "Revert submission" here for rows with `batch`; nothing renders today.
                      <SystemEventFeedRow key={entry.id} entry={entry} actions={undefined} />
                    ) : (
                      <DiaryEntryFeedRow key={entry.id} entry={entry} />
                    ),
                  )}
              </FeedGroup>
            ))}
        </div>

        {entries.length > 0 && (
          <InfiniteScrollFooter
            status={status}
            loadingLabel={t('infiniteScroll.loadingMore')}
            loadingAriaLabel={t('infiniteScroll.loadingMore')}
            loadMoreLabel={t('infiniteScroll.loadMore')}
            retryLabel={t('infiniteScroll.retry')}
            errorMessage={t('infiniteScroll.loadMoreError')}
            endOfListMessage={t('infiniteScroll.endOfList')}
            sentinelRef={sentinelRef}
            onLoadMore={loadMore}
            onRetry={handleRetry}
            testIdPrefix="history"
          />
        )}
      </div>
    </PageLayout>
  );
}
