import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MANUAL_DIARY_ENTRY_TYPES, foldSearchText } from '@cornerstone/shared';
import type { AreaSummary, DiaryFilterOptions, ManualDiaryEntryType } from '@cornerstone/shared';
import { FilterChipGroup } from '../../components/FilterChipGroup/FilterChipGroup.js';
import { FormError } from '../../components/FormError/FormError.js';
import { AnchoredPanel } from '../../components/Modal/AnchoredPanel.js';
import { Sheet } from '../../components/Modal/Sheet.js';
import { getFocusableElements } from '../../components/Modal/useFocusTrap.js';
import { SearchPicker } from '../../components/SearchPicker/SearchPicker.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { diaryEntryTypeLabelKey } from '../../lib/diaryEntryTypeLabel.js';
import { useFormatters } from '../../lib/formatters.js';
import shared from '../../styles/shared.module.css';
import { activeFilterCount } from './diaryQuery.js';
import type { DiaryFilterState } from './diaryQuery.js';
import styles from './DiaryFilters.module.css';

const PANEL_ID = 'diary-filters-panel';
const SHEET_ID = 'diary-filters-sheet';

export interface DiaryFiltersProps {
  state: DiaryFilterState;
  onChange: (patch: Partial<DiaryFilterState>) => void;
  onClearAll: () => void;
  /** Null until loaded, or when loading failed (Area and Company are then hidden). */
  options: DiaryFilterOptions | null;
  buttonRef: RefObject<HTMLButtonElement | null>;
}

function areaPath(area: AreaSummary): string {
  return [...area.ancestors.map((a) => a.name), area.name].join(' › ');
}

/** The Filters button and the surface it opens: a bottom Sheet below 768px, an anchored panel above. */
export function DiaryFilters({
  state,
  onChange,
  onClearAll,
  options,
  buttonRef,
}: DiaryFiltersProps) {
  const { t } = useTranslation('diary');
  const location = useLocation();
  const isWide = useMediaQuery('(min-width: 768px)');
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(state);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const content = (
    <DiaryFiltersContent
      state={state}
      onChange={onChange}
      options={options}
      autoFocus={isWide && open}
    />
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${shared.btnSecondary} ${styles.button}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={isWide ? PANEL_ID : SHEET_ID}
        aria-label={count > 0 ? t('filters.buttonActive', { count }) : undefined}
        onClick={() => setOpen((prev) => !prev)}
        data-testid="diary-filters-button"
      >
        {t('filters.button')}
        {count > 0 ? <span className={shared.filtersToggleCount}>{count}</span> : null}
      </button>

      {isWide ? (
        <AnchoredPanel
          open={open}
          anchorRef={buttonRef}
          role="dialog"
          id={PANEL_ID}
          ariaLabel={t('filters.button')}
          trapFocus
          closeSignal={location.pathname}
          onDismiss={(reason) => {
            if (reason === 'route') setOpen(false);
            else close();
          }}
          testId="diary-filters-panel"
        >
          <div className={styles.panel}>{content}</div>
        </AnchoredPanel>
      ) : (
        <Sheet
          id={SHEET_ID}
          open={open}
          onClose={close}
          title={t('filters.button')}
          returnFocusRef={buttonRef}
          testId="diary-filters-sheet"
          footer={
            <div className={styles.sheetFooter}>
              <button
                type="button"
                className={shared.btnSecondary}
                onClick={onClearAll}
                data-testid="diary-filters-sheet-clear"
              >
                {t('filters.clearAll')}
              </button>
              <button
                type="button"
                className={shared.btnPrimary}
                onClick={close}
                data-testid="diary-filters-done"
              >
                {t('filters.done')}
              </button>
            </div>
          }
        >
          {content}
        </Sheet>
      )}
    </>
  );
}

interface DiaryFiltersContentProps {
  state: DiaryFilterState;
  onChange: (patch: Partial<DiaryFilterState>) => void;
  options: DiaryFilterOptions | null;
  /** Move focus to the first control on mount (the anchored panel; the Sheet does it itself). */
  autoFocus: boolean;
}

function DiaryFiltersContent({ state, onChange, options, autoFocus }: DiaryFiltersContentProps) {
  const { t } = useTranslation('diary');
  const rootRef = useRef<HTMLDivElement>(null);
  const rangeErrorId = useId();

  useLayoutEffect(() => {
    if (!autoFocus || !rootRef.current) return;
    getFocusableElements(rootRef.current)[0]?.focus();
  }, [autoFocus]);

  // Types in use, plus any type still active in the URL so it can be removed.
  const typeValues = (MANUAL_DIARY_ENTRY_TYPES as readonly ManualDiaryEntryType[]).filter(
    (type) => (options ? options.types.includes(type) : true) || state.types.includes(type),
  );
  const showTypes = typeValues.length > 1 || state.types.length > 0;
  const typeOptions = typeValues.map((type) => {
    const { ns, key } = diaryEntryTypeLabelKey(type);
    return { value: type, label: t(key, { ns }) };
  });

  const areas = useMemo(() => options?.areas ?? [], [options]);
  const companies = useMemo(() => options?.companies ?? [], [options]);
  const showAreas = areas.length > 0 || state.areaId !== '';
  const showCompanies = companies.length > 0 || state.companyId !== '';
  const selectedArea = areas.find((a) => a.id === state.areaId);
  const selectedCompany = companies.find((c) => c.id === state.companyId);

  const searchAreas = useCallback(
    (query: string) => {
      const needle = foldSearchText(query.trim());
      return Promise.resolve(
        areas.filter((area) => !needle || foldSearchText(areaPath(area)).includes(needle)),
      );
    },
    [areas],
  );
  const searchCompanies = useCallback(
    (query: string) => {
      const needle = foldSearchText(query.trim());
      return Promise.resolve(
        companies.filter((company) => !needle || foldSearchText(company.name).includes(needle)),
      );
    },
    [companies],
  );

  // Local drafts: the URL only receives a valid range; a rejected side stays on screen.
  const [fromDraft, setFromDraft] = useState(state.dateFrom);
  const [prevFrom, setPrevFrom] = useState(state.dateFrom);
  if (state.dateFrom !== prevFrom) {
    setPrevFrom(state.dateFrom);
    setFromDraft(state.dateFrom);
  }
  const [toDraft, setToDraft] = useState(state.dateTo);
  const [prevTo, setPrevTo] = useState(state.dateTo);
  if (state.dateTo !== prevTo) {
    setPrevTo(state.dateTo);
    setToDraft(state.dateTo);
  }
  const rangeInvalid = fromDraft !== '' && toDraft !== '' && fromDraft > toDraft;

  const toggleType = (value: string) => {
    const type = value as ManualDiaryEntryType;
    onChange({
      types: state.types.includes(type)
        ? state.types.filter((existing) => existing !== type)
        : [...state.types, type],
    });
  };

  return (
    <div ref={rootRef} className={styles.content} data-testid="diary-filters-content">
      {showTypes ? (
        <div className={styles.field}>
          <span id="diary-filter-type-label" className={styles.label}>
            {t('filters.type')}
          </span>
          <FilterChipGroup
            options={typeOptions}
            value=""
            selectedValues={state.types}
            onChange={toggleType}
            labelledBy="diary-filter-type-label"
            layout="wrap"
            testIdPrefix="type-filter"
          />
        </div>
      ) : null}

      {showAreas ? (
        <div className={styles.field} data-testid="diary-filter-area">
          <label htmlFor="diary-filter-area-input" className={styles.label}>
            {t('filters.area')}
          </label>
          <SearchPicker<AreaSummary>
            id="diary-filter-area-input"
            value={state.areaId}
            onChange={(id) => onChange({ areaId: id })}
            excludeIds={[]}
            placeholder={t('filters.areaPlaceholder')}
            searchFn={searchAreas}
            showItemsOnFocus
            initialTitle={selectedArea?.name}
            renderItem={(area) => ({ id: area.id, label: area.name })}
            renderSecondary={(area) => (area.ancestors.length > 0 ? areaPath(area) : null)}
            getOptionTestId={(area) => `diary-filter-area-option-${area.id}`}
          />
        </div>
      ) : null}

      {showCompanies ? (
        <div className={styles.field} data-testid="diary-filter-company">
          <label htmlFor="diary-filter-company-input" className={styles.label}>
            {t('filters.company')}
          </label>
          <SearchPicker<{ id: string; name: string }>
            id="diary-filter-company-input"
            value={state.companyId}
            onChange={(id) => onChange({ companyId: id })}
            excludeIds={[]}
            placeholder={t('filters.companyPlaceholder')}
            searchFn={searchCompanies}
            showItemsOnFocus
            initialTitle={selectedCompany?.name}
            renderItem={(company) => ({ id: company.id, label: company.name })}
            getOptionTestId={(company) => `diary-filter-company-option-${company.id}`}
          />
        </div>
      ) : null}

      <fieldset className={styles.dates}>
        <legend className={styles.label}>{t('filters.dates')}</legend>
        <div className={styles.dateRow}>
          <div className={styles.field}>
            <label htmlFor="diary-date-from" className={styles.label}>
              {t('filters.from')}
            </label>
            <input
              id="diary-date-from"
              type="date"
              className={shared.input}
              value={fromDraft}
              aria-invalid={rangeInvalid || undefined}
              aria-describedby={rangeInvalid ? rangeErrorId : undefined}
              onChange={(e) => {
                const value = e.target.value;
                setFromDraft(value);
                if (!value || !toDraft || value <= toDraft) {
                  onChange({ dateFrom: value, dateTo: toDraft });
                }
              }}
              data-testid="diary-date-from"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="diary-date-to" className={styles.label}>
              {t('filters.to')}
            </label>
            <input
              id="diary-date-to"
              type="date"
              className={shared.input}
              value={toDraft}
              aria-invalid={rangeInvalid || undefined}
              aria-describedby={rangeInvalid ? rangeErrorId : undefined}
              onChange={(e) => {
                const value = e.target.value;
                setToDraft(value);
                if (!value || !fromDraft || fromDraft <= value) {
                  onChange({ dateFrom: fromDraft, dateTo: value });
                }
              }}
              data-testid="diary-date-to"
            />
          </div>
        </div>
        {rangeInvalid ? (
          <FormError variant="field" id={rangeErrorId} message={t('filters.rangeError')} />
        ) : null}
      </fieldset>
    </div>
  );
}

export interface DiaryActiveFiltersProps {
  state: DiaryFilterState;
  options: DiaryFilterOptions | null;
  onChange: (patch: Partial<DiaryFilterState>) => void;
  onClearAll: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}

interface ActiveChip {
  key: string;
  label: string;
  remove: Partial<DiaryFilterState>;
}

/** The filters in force as removable chips, plus "Clear all"; visible with the panel closed. */
export function DiaryActiveFilters({
  state,
  options,
  onChange,
  onClearAll,
  buttonRef,
}: DiaryActiveFiltersProps) {
  const { t } = useTranslation('diary');
  const { formatDate } = useFormatters();
  const listRef = useRef<HTMLUListElement>(null);

  const chips: ActiveChip[] = [];
  for (const type of state.types) {
    const { ns, key } = diaryEntryTypeLabelKey(type);
    chips.push({
      key: `type-${type}`,
      label: t(key, { ns }),
      remove: { types: state.types.filter((existing) => existing !== type) },
    });
  }
  if (state.areaId) {
    const area = options?.areas.find((a) => a.id === state.areaId);
    chips.push({
      key: 'area',
      label: area?.name ?? t('filters.area'),
      remove: { areaId: '' },
    });
  }
  if (state.companyId) {
    const company = options?.companies.find((c) => c.id === state.companyId);
    chips.push({
      key: 'company',
      label: company?.name ?? t('filters.company'),
      remove: { companyId: '' },
    });
  }
  if (state.dateFrom) {
    chips.push({
      key: 'from',
      label: t('filters.fromChip', { date: formatDate(state.dateFrom) }),
      remove: { dateFrom: '' },
    });
  }
  if (state.dateTo) {
    chips.push({
      key: 'to',
      label: t('filters.toChip', { date: formatDate(state.dateTo) }),
      remove: { dateTo: '' },
    });
  }
  if (state.drafts) {
    chips.push({ key: 'drafts', label: t('unfinished.heading'), remove: { drafts: false } });
  }

  if (chips.length === 0) return null;

  const removeChip = (index: number, chip: ActiveChip) => {
    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[data-chip-remove]') ?? [],
    );
    const target = buttons[index + 1] ?? buttons[index - 1] ?? buttonRef.current;
    target?.focus();
    onChange(chip.remove);
  };

  return (
    <div className={styles.activeRow} data-testid="diary-active-filters">
      <ul ref={listRef} className={styles.chips} aria-label={t('filters.activeLabel')}>
        {chips.map((chip, index) => (
          <li key={chip.key} className={styles.chip}>
            <span>{chip.label}</span>
            <button
              type="button"
              className={styles.chipRemove}
              data-chip-remove=""
              aria-label={t('filters.removeChip', { label: chip.label })}
              onClick={() => removeChip(index, chip)}
              data-testid={`diary-active-filter-${chip.key}-remove`}
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={styles.clearAll}
        onClick={() => {
          buttonRef.current?.focus();
          onClearAll();
        }}
        data-testid="clear-filters-button"
      >
        {t('filters.clearAll')}
      </button>
    </div>
  );
}
