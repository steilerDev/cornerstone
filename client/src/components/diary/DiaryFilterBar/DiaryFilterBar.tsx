import { useState } from 'react';
import type { DiaryEntryType } from '@cornerstone/shared';
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
}

const ALL_ENTRY_TYPES: DiaryEntryType[] = [
  'daily_log',
  'site_visit',
  'delivery',
  'issue',
  'general_note',
  'work_item_status',
  'invoice_status',
  'milestone_delay',
  'budget_breach',
  'auto_reschedule',
  'subsidy_status',
];

const TYPE_LABELS: Record<DiaryEntryType, string> = {
  daily_log: 'Daily Log',
  site_visit: 'Site Visit',
  delivery: 'Delivery',
  issue: 'Issue',
  general_note: 'Note',
  work_item_status: 'Work Item',
  invoice_status: 'Invoice',
  milestone_delay: 'Milestone',
  budget_breach: 'Budget',
  auto_reschedule: 'Schedule',
  subsidy_status: 'Subsidy',
};

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
  isCollapsed = false,
}: DiaryFilterBarProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

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
    activeTypes.length < ALL_ENTRY_TYPES.length && activeTypes.length > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const mobileToggleClass = [styles.mobileToggle, isMobileOpen && styles.mobileToggleOpen]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.filterBar} data-testid="diary-filter-bar">
      {/* Mobile toggle button */}
      <button
        type="button"
        className={mobileToggleClass}
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        aria-label="Toggle filters"
        aria-expanded={isMobileOpen}
      >
        🔍 Filters {filterCount > 0 && <span className={styles.badge}>{filterCount}</span>}
      </button>

      {/* Filter content */}
      <div className={`${styles.filters} ${isMobileOpen ? styles.filtersOpen : ''}`}>
        {/* Search input */}
        <div className={styles.filterGroup}>
          <label htmlFor="diary-search" className={styles.label}>
            Search
          </label>
          <input
            id="diary-search"
            type="text"
            className={shared.input}
            placeholder="Search entries..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && searchQuery) {
                onSearchChange('');
              }
            }}
            aria-label="Search diary entries"
            data-testid="diary-search-input"
          />
        </div>

        {/* Date range */}
        <div className={styles.filterGroup}>
          <label htmlFor="diary-date-from" className={styles.label}>
            From
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
            To
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
          <label className={styles.label}>Entry Types</label>
          <div className={styles.typeChips} role="group" aria-label="Filter by entry type">
            {ALL_ENTRY_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className={`${styles.typeChip} ${activeTypes.includes(type) ? styles.typeChipActive : ''}`}
                onClick={() => handleTypeToggle(type)}
                aria-pressed={activeTypes.includes(type)}
                data-testid={`type-filter-${type}`}
              >
                {TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        {/* Clear all button */}
        {filterCount > 0 && (
          <button
            type="button"
            className={styles.clearButton}
            onClick={onClearAll}
            data-testid="clear-filters-button"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
