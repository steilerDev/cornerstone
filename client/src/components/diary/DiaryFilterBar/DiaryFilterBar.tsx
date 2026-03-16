import { useState } from 'react';
import type { DiaryEntryType } from '@cornerstone/shared';
import shared from '../../../styles/shared.module.css';
import styles from './DiaryFilterBar.module.css';

type FilterMode = 'all' | 'manual' | 'automatic';

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
  filterMode?: FilterMode;
  onFilterModeChange?: (mode: FilterMode) => void;
  isCollapsed?: boolean;
}

const MANUAL_ENTRY_TYPES: DiaryEntryType[] = [
  'daily_log',
  'site_visit',
  'delivery',
  'issue',
  'general_note',
];

const AUTOMATIC_ENTRY_TYPES: DiaryEntryType[] = [
  'work_item_status',
  'invoice_status',
  'invoice_created',
  'milestone_delay',
  'budget_breach',
  'auto_reschedule',
  'subsidy_status',
];

const ALL_ENTRY_TYPES: DiaryEntryType[] = [...MANUAL_ENTRY_TYPES, ...AUTOMATIC_ENTRY_TYPES];

const TYPE_LABELS: Record<DiaryEntryType, string> = {
  daily_log: 'Daily Log',
  site_visit: 'Site Visit',
  delivery: 'Delivery',
  issue: 'Issue',
  general_note: 'Note',
  work_item_status: 'Work Item',
  invoice_status: 'Invoice',
  invoice_created: 'Invoice Created',
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
  filterMode = 'all',
  onFilterModeChange,
  isCollapsed = false,
}: DiaryFilterBarProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const handleModeChange = (mode: FilterMode) => {
    onFilterModeChange?.(mode);
  };

  const handleTypeToggle = (type: DiaryEntryType) => {
    if (activeTypes.includes(type)) {
      onTypesChange(activeTypes.filter((t) => t !== type));
    } else {
      onTypesChange([...activeTypes, type]);
    }
  };

  // Determine which types to display based on filter mode
  const displayedTypes =
    filterMode === 'manual' ? MANUAL_ENTRY_TYPES : filterMode === 'automatic' ? AUTOMATIC_ENTRY_TYPES : ALL_ENTRY_TYPES;

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
        {/* Filter mode chips */}
        <div className={styles.filterGroup}>
          <label className={styles.label}>Filter Mode</label>
          <div className={styles.modeChips} role="group" aria-label="Filter by entry mode">
            <button
              type="button"
              className={`${styles.modeChip} ${filterMode === 'all' ? styles.modeChipActive : ''}`}
              onClick={() => handleModeChange('all')}
              aria-pressed={filterMode === 'all'}
              data-testid="mode-filter-all"
            >
              All
            </button>
            <button
              type="button"
              className={`${styles.modeChip} ${filterMode === 'manual' ? styles.modeChipActive : ''}`}
              onClick={() => handleModeChange('manual')}
              aria-pressed={filterMode === 'manual'}
              data-testid="mode-filter-manual"
            >
              Manual
            </button>
            <button
              type="button"
              className={`${styles.modeChip} ${filterMode === 'automatic' ? styles.modeChipActive : ''}`}
              onClick={() => handleModeChange('automatic')}
              aria-pressed={filterMode === 'automatic'}
              data-testid="mode-filter-automatic"
            >
              Automatic
            </button>
          </div>
        </div>

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
            {displayedTypes.map((type) => (
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
