import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MANUAL_DIARY_ENTRY_TYPES, routeUrl } from '@cornerstone/shared';
import type { DiaryEntryType } from '@cornerstone/shared';
import { diaryEntryTypeLabelKey } from '../../../lib/diaryEntryTypeLabel.js';
import { NavAnchor } from '../../../navigation/NavAnchor.js';
import { SearchEverywhereRow } from '../../CommandSearch/SearchEverywhereRow.js';
import shared from '../../../styles/shared.module.css';
import styles from './DiaryFilterBar.module.css';

interface DiaryFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  dateFrom: string;
  onDateFromChange: (date: string) => void;
  dateTo: string;
  onDateToChange: (date: string) => void;
  activeTypes: DiaryEntryType[];
  onTypesChange: (types: DiaryEntryType[]) => void;
  onClearAll: () => void;
  isCollapsed?: boolean;
  draftsVisible?: boolean;
  onDraftsVisibleChange?: (visible: boolean) => void;
}

export function DiaryFilterBar({
  searchQuery,
  onSearchChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  activeTypes,
  onTypesChange,
  onClearAll,
  isCollapsed: _isCollapsed = false,
  draftsVisible = false,
  onDraftsVisibleChange,
}: DiaryFilterBarProps) {
  const { t } = useTranslation('diary');
  const { t: tc } = useTranslation('common');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleTypeToggle = (type: DiaryEntryType) => {
    if (activeTypes.includes(type)) {
      onTypesChange(activeTypes.filter((t) => t !== type));
    } else {
      onTypesChange([...activeTypes, type]);
    }
  };

  const filterCount = [
    searchQuery ? 1 : 0,
    dateFrom ? 1 : 0,
    dateTo ? 1 : 0,
    activeTypes.length < MANUAL_DIARY_ENTRY_TYPES.length && activeTypes.length > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const mobileToggleClass = [shared.filtersToggle, isMobileOpen && shared.filtersToggleOpen]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.filterBar} data-testid="diary-filter-bar">
      {/* Mobile toggle button */}
      <button
        type="button"
        className={mobileToggleClass}
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        aria-label={t('filterBar.toggleFiltersAriaLabel')}
        aria-expanded={isMobileOpen}
      >
        🔍 {t('filterBar.filtersToggle')}{' '}
        {filterCount > 0 && <span className={shared.filtersToggleCount}>{filterCount}</span>}
      </button>

      {/* Filter content */}
      <div className={`${styles.filters} ${isMobileOpen ? styles.filtersOpen : ''}`}>
        {/* Link to the automatic record of changes */}
        <NavAnchor
          to={routeUrl('history')}
          className={styles.historyLink}
          aria-label={t('filterBar.historyLinkAriaLabel')}
          data-testid="diary-history-link"
        >
          {tc('navigation.history')}
          <span aria-hidden="true"> ›</span>
        </NavAnchor>

        {/* Search input */}
        <div className={styles.filterGroup}>
          <label htmlFor="diary-search" className={styles.label}>
            {t('filterBar.searchLabel')}
          </label>
          <input
            ref={searchInputRef}
            data-page-search=""
            id="diary-search"
            type="text"
            className={shared.input}
            placeholder={t('filterBar.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => {
              e.stopPropagation();
              onSearchChange(e.target.value);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape' && searchQuery) {
                onSearchChange('');
              }
            }}
            aria-label={t('filterBar.searchAriaLabel')}
            data-testid="diary-search-input"
          />
          <SearchEverywhereRow query={searchQuery} returnFocusRef={searchInputRef} />
        </div>

        {/* Date range */}
        <div className={styles.filterGroup}>
          <label htmlFor="diary-date-from" className={styles.label}>
            {t('filterBar.fromLabel')}
          </label>
          <input
            id="diary-date-from"
            type="date"
            className={shared.input}
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            data-testid="diary-date-from"
          />
        </div>

        <div className={styles.filterGroup}>
          <label htmlFor="diary-date-to" className={styles.label}>
            {t('filterBar.toLabel')}
          </label>
          <input
            id="diary-date-to"
            type="date"
            className={shared.input}
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            data-testid="diary-date-to"
          />
        </div>

        {/* Entry type filter chips */}
        <div className={styles.filterGroup}>
          <label className={styles.label}>{t('filterBar.entryTypesLabel')}</label>
          <div
            className={styles.typeChips}
            role="group"
            aria-label={t('filterBar.typeGroupAriaLabel')}
          >
            {MANUAL_DIARY_ENTRY_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className={`${styles.typeChip} ${activeTypes.includes(type) ? styles.typeChipActive : ''}`}
                onClick={() => handleTypeToggle(type)}
                aria-pressed={activeTypes.includes(type)}
                data-testid={`type-filter-${type}`}
              >
                {t(diaryEntryTypeLabelKey(type).key, { ns: diaryEntryTypeLabelKey(type).ns })}
              </button>
            ))}
          </div>

          {/* Drafts visibility chip */}
          {onDraftsVisibleChange && (
            <div role="group" aria-label={t('filterBar.draftsChipGroupLabel')}>
              <button
                type="button"
                onClick={() => onDraftsVisibleChange(!draftsVisible)}
                aria-pressed={draftsVisible}
                className={`${styles.modeChip} ${styles.draftsChip} ${draftsVisible ? styles.modeChipActive : ''}`}
                data-testid="status-filter-drafts"
              >
                {t('filterBar.filterModeDrafts')}
              </button>
            </div>
          )}
        </div>

        {/* Clear all button */}
        {filterCount > 0 && (
          <button
            type="button"
            className={styles.clearButton}
            onClick={onClearAll}
            data-testid="clear-filters-button"
          >
            {t('filterBar.clearAllButton')}
          </button>
        )}
      </div>
    </div>
  );
}
