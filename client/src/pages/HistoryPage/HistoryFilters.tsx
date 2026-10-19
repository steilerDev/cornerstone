import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HISTORY_EVENT_TYPES } from '@cornerstone/shared';
import type { HistoryEventType } from '@cornerstone/shared';
import { FilterChipGroup } from '../../components/FilterChipGroup/FilterChipGroup.js';
import { SearchEverywhereRow } from '../../components/CommandSearch/SearchEverywhereRow.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { HistoryObjectFilter } from './HistoryObjectFilter.js';
import { hasActiveFilters } from './historyQuery.js';
import type { HistoryFilters as HistoryFilterState } from './historyQuery.js';
import shared from '../../styles/shared.module.css';
import styles from './HistoryFilters.module.css';

export interface HistoryFiltersProps {
  filters: HistoryFilterState;
  /** The search field's draft text (debounced into the URL by the page). */
  searchInput: string;
  onSearchInput: (value: string) => void;
  onChange: (patch: Partial<HistoryFilterState>) => void;
  onClear: () => void;
  /** Live name of the filtered object, as echoed by the API. */
  objectName: string | null;
  objectExists: boolean | null;
}

const PANEL_ID = 'history-filter-panel';

/** Type chips, then the Search / Object / From / To / Include controls (behind "Filters" on phones). */
export function HistoryFilters({
  filters,
  searchInput,
  onSearchInput,
  onChange,
  onClear,
  objectName,
  objectExists,
}: HistoryFiltersProps) {
  const { t } = useTranslation('history');
  const isWide = useMediaQuery('(min-width: 768px)');
  const hasNonTypeFilter = Boolean(
    filters.object || filters.q || filters.dateFrom || filters.dateTo || filters.includeDiary,
  );
  const [panelOpen, setPanelOpen] = useState(hasNonTypeFilter);
  // Local drafts: the URL update lands in a transition, so the controls must not read it directly.
  // Re-synced from the URL value while rendering ("remember previous prop"): Clear and Back.
  const [includeDraft, setIncludeDraft] = useState(filters.includeDiary);
  const [prevInclude, setPrevInclude] = useState(filters.includeDiary);
  if (filters.includeDiary !== prevInclude) {
    setPrevInclude(filters.includeDiary);
    setIncludeDraft(filters.includeDiary);
  }
  const [fromDraft, setFromDraft] = useState(filters.dateFrom);
  const [prevFrom, setPrevFrom] = useState(filters.dateFrom);
  if (filters.dateFrom !== prevFrom) {
    setPrevFrom(filters.dateFrom);
    setFromDraft(filters.dateFrom);
  }
  const [toDraft, setToDraft] = useState(filters.dateTo);
  const [prevTo, setPrevTo] = useState(filters.dateTo);
  if (filters.dateTo !== prevTo) {
    setPrevTo(filters.dateTo);
    setToDraft(filters.dateTo);
  }
  const chipsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pendingClearFocusRef = useRef(false);

  const activeCount = [
    filters.object,
    filters.q,
    filters.dateFrom,
    filters.dateTo,
    filters.includeDiary,
  ].filter(Boolean).length;
  const showClear = hasActiveFilters(filters) || filters.includeDiary;

  // The Clear button unmounts once nothing is set: hand focus to the first type chip instead of
  // letting it fall back to <body>.
  useLayoutEffect(() => {
    if (!showClear && pendingClearFocusRef.current) {
      pendingClearFocusRef.current = false;
      chipsRef.current?.querySelector<HTMLElement>('button')?.focus();
    }
  }, [showClear]);

  const typeOptions = HISTORY_EVENT_TYPES.map((type) => ({
    value: type,
    label: t(I18N_UNION_KEYS.historyEventType.key(type)),
  }));

  const toggleClassName = [shared.filtersToggle, panelOpen && shared.filtersToggleOpen]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.root} data-testid="history-filters">
      <FilterChipGroup
        options={typeOptions}
        value={filters.type ?? ''}
        onChange={(value) => onChange({ type: (value || null) as HistoryEventType | null })}
        ariaLabel={t('filters.typeGroup')}
        layout={isWide ? 'wrap' : 'scroll'}
        deselectable
        groupRef={chipsRef}
        testIdPrefix="history-type"
      />

      <button
        type="button"
        className={toggleClassName}
        aria-expanded={panelOpen}
        aria-controls={PANEL_ID}
        onClick={() => setPanelOpen((open) => !open)}
        data-testid="history-filters-toggle"
      >
        {t('filters.toggle')}
        {activeCount > 0 ? <span className={shared.filtersToggleCount}>{activeCount}</span> : null}
      </button>

      <div id={PANEL_ID} className={styles.panel} hidden={!isWide && !panelOpen}>
        <div className={styles.field}>
          <label htmlFor="history-search" className={styles.label}>
            {t('filters.search')}
          </label>
          <input
            ref={searchInputRef}
            id="history-search"
            type="search"
            data-page-search=""
            className={shared.input}
            placeholder={t('filters.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => {
              e.stopPropagation();
              onSearchInput(e.target.value);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape' && searchInput) {
                e.preventDefault();
                onSearchInput('');
              }
            }}
            data-testid="history-search-input"
          />
          <SearchEverywhereRow query={searchInput} returnFocusRef={searchInputRef} />
        </div>

        <div className={styles.field}>
          <HistoryObjectFilter
            object={filters.object}
            objectName={objectName}
            objectExists={objectExists}
            onChange={(object) => onChange({ object })}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="history-date-from" className={styles.label}>
            {t('filters.from')}
          </label>
          <input
            id="history-date-from"
            type="date"
            className={shared.input}
            value={fromDraft}
            max={toDraft || undefined}
            onChange={(e) => {
              setFromDraft(e.target.value);
              onChange({ dateFrom: e.target.value });
            }}
            data-testid="history-date-from"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="history-date-to" className={styles.label}>
            {t('filters.to')}
          </label>
          <input
            id="history-date-to"
            type="date"
            className={shared.input}
            value={toDraft}
            min={fromDraft || undefined}
            onChange={(e) => {
              setToDraft(e.target.value);
              onChange({ dateTo: e.target.value });
            }}
            data-testid="history-date-to"
          />
        </div>

        <div className={styles.footerRow}>
          <div className={styles.include}>
            <label className={styles.includeLabel} htmlFor="history-include-diary">
              <input
                id="history-include-diary"
                type="checkbox"
                checked={includeDraft}
                aria-describedby="history-include-diary-hint"
                onChange={(e) => {
                  setIncludeDraft(e.target.checked);
                  onChange({ includeDiary: e.target.checked });
                }}
                data-testid="history-include-diary"
              />
              {t('filters.includeDiary')}
            </label>
            <p id="history-include-diary-hint" className={styles.hint}>
              {t('filters.includeDiaryHint')}
            </p>
          </div>
          {showClear ? (
            <button
              type="button"
              className={shared.btnSecondaryCompact}
              onClick={() => {
                pendingClearFocusRef.current = true;
                onClear();
              }}
              data-testid="history-clear-filters"
            >
              {t('filters.clear')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
