import { useState, useEffect, useRef, useMemo } from 'react';
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
import { DiaryFilterBar } from '../../components/diary/DiaryFilterBar/DiaryFilterBar.js';
import { DiaryDateGroup } from '../../components/diary/DiaryDateGroup/DiaryDateGroup.js';
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

export default function DiaryPage() {
  const { t } = useTranslation('diary');
  const [searchParams, setSearchParams] = useSearchParams();

  const [entries, setEntries] = useState<DiaryEntrySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const pageSize = 25;

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
  const urlPage = parseInt(searchParams.get('page') || '1', 10);

  const [searchInput, setSearchInput] = useState(searchQuery);
  const announcementRef = useRef<HTMLDivElement>(null);

  /* eslint-disable @eslint-react/set-state-in-effect -- synchronously sync URL page to component state on page param change */
  useEffect(() => {
    if (urlPage !== currentPage) setCurrentPage(urlPage);
  }, [urlPage, currentPage]);
  /* eslint-enable @eslint-react/set-state-in-effect */

  // Debounced search with URL sync
  const debouncedSearchInput = useDebounce(searchInput, 300);
  const isFirstSearchSyncRef = useRef(true);

  useEffect(() => {
    if (isFirstSearchSyncRef.current) {
      isFirstSearchSyncRef.current = false;
      return;
    }
    const newParams = new URLSearchParams(searchParams);
    if (debouncedSearchInput) {
      newParams.set('q', debouncedSearchInput);
    } else {
      newParams.delete('q');
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  }, [debouncedSearchInput, searchParams, setSearchParams]);

  useEffect(() => {
    void loadEntries();
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- loadEntries is defined in the component body; the filter primitives are the intended deps
  }, [searchQuery, dateFrom, dateTo, filterMode, typeFilterStr, statusFilter, currentPage]);

  const loadEntries = async () => {
    setIsLoading(true);
    setError('');
    try {
      // Determine which types to query based on filter mode
      let queriableTypes: DiaryEntryType[] = activeTypes;
      if (filterMode === 'manual') {
        queriableTypes =
          activeTypes.length > 0
            ? activeTypes.filter((t) => MANUAL_TYPES.has(t as ManualDiaryEntryType))
            : (Array.from(MANUAL_TYPES) as DiaryEntryType[]);
      } else if (filterMode === 'automatic') {
        queriableTypes =
          activeTypes.length > 0
            ? activeTypes.filter((t) => !MANUAL_TYPES.has(t as ManualDiaryEntryType))
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
        page: currentPage,
        pageSize,
        q: searchQuery || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        type: queriableTypes.length > 0 ? queriableTypes.join(',') : undefined,
        status: statusFilter || undefined,
      });

      setEntries(response.items);
      setTotalPages(response.pagination.totalPages);
      setTotalItems(response.pagination.totalItems);

      // Announce update
      if (announcementRef.current) {
        announcementRef.current.textContent = `Loaded ${response.items.length} entries`;
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('error'));
      }
    } finally {
      setIsLoading(false);
    }
  };

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
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handleDateToChange = (date: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (date) {
      newParams.set('dateTo', date);
    } else {
      newParams.delete('dateTo');
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handleTypesChange = (types: DiaryEntryType[]) => {
    const newParams = new URLSearchParams(searchParams);
    if (types.length > 0) {
      newParams.set('types', types.join(','));
    } else {
      newParams.delete('types');
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handleFilterModeChange = (mode: FilterMode) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('filterMode', mode);
    newParams.delete('types');
    newParams.set('page', '1');
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
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handleClearAll = () => {
    setSearchInput('');
    const newParams = new URLSearchParams();
    newParams.set('filterMode', 'manual');
    setSearchParams(newParams);
  };

  const handlePageChange = (page: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', page.toString());
    setSearchParams(newParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

      {error && <div className={shared.bannerError}>{error}</div>}

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

      {isLoading && <div className={shared.loading}>{t('loading')}</div>}

      {!isLoading && entries.length === 0 && (
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

      {!isLoading && entries.length > 0 && (
        <div className={styles.timeline} role="feed" aria-label={t('page.timelineAriaLabel')}>
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

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            type="button"
            className={shared.btnSecondary}
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            data-testid="prev-page-button"
          >
            {t('pagination.previous')}
          </button>
          <span className={styles.pageInfo}>
            {t('pagination.pageInfo', { currentPage, totalPages })}
          </span>
          <button
            type="button"
            className={shared.btnSecondary}
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            data-testid="next-page-button"
          >
            {t('pagination.next')}
          </button>
        </div>
      )}
    </div>
  );
}
