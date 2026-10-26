import { Fragment, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterChipGroup } from '../FilterChipGroup/FilterChipGroup.js';
import { SearchEverywhereRow } from '../CommandSearch/SearchEverywhereRow.js';
import { OverflowMenu } from '../OverflowMenu/index.js';
import type { OverflowMenuEntry } from '../OverflowMenu/index.js';
import { TriStateCheckbox } from '../TriStateCheckbox/TriStateCheckbox.js';
import shared from '../../styles/shared.module.css';
import { groupingAvailable } from './grouping.js';
import { NO_GROUP } from './objectListUrl.js';
import { ObjectListFiltersPanel } from './ObjectListFiltersPanel.js';
import type { ObjectListController } from './useObjectList.js';
import type { SearchDraft } from './useSearchDraft.js';
import type { ObjectListConfig, ObjectListFilterDef } from './types.js';
import styles from './ObjectListToolbar.module.css';

export interface ObjectListToolbarSelectAll {
  readonly checked: boolean;
  readonly indeterminate: boolean;
  readonly onChange: (checked: boolean) => void;
}

export interface ObjectListToolbarProps<T, M> {
  readonly list: ObjectListController<T, M>;
  readonly config: ObjectListConfig<T>;
  /** Placeholder and accessible-name base of the search field ("Search tasks"). */
  readonly searchLabel: string;
  /** List width is at least 768px (chips wrap instead of scrolling). */
  readonly wide: boolean;
  readonly search: SearchDraft;
  readonly searchInputRef: RefObject<HTMLInputElement | null>;
  /** The "Searching all · n more in …" text, shown while searching all. */
  readonly searchingAllText: string | null;
  /** The reason the chosen grouping is off, shown in the note row. */
  readonly groupingUnavailableText: string | null;
  /** Select-all of the card surface (the table surface has it in its header cell). */
  readonly selectAll: ObjectListToolbarSelectAll | null;
  /** Host text for the note row (e.g. the active "Show only" filters). */
  readonly note?: ReactNode;
  /** Clear filters: the host also resets the search draft and moves focus to the search field. */
  readonly onClear: () => void;
}

/**
 * The list toolbar: search, status chips, Filters, Group by, Sort and the note row (select-all
 * on the card surface, the searching-all text, the grouping reason, Clear filters). DOM order is
 * the visual and tab order.
 */
export function ObjectListToolbar<T, M>({
  list,
  config,
  searchLabel,
  wide,
  search,
  searchInputRef,
  searchingAllText,
  groupingUnavailableText,
  selectAll,
  note,
  onClear,
}: ObjectListToolbarProps<T, M>) {
  const { t } = useTranslation('common');
  const p = config.testIdPrefix;
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const filters = config.filters ?? [];

  const renderFilterControl = (def: ObjectListFilterDef) => (
    <Fragment key={def.param}>
      {def.render({
        value: list.query.filters[def.param] ?? null,
        onChange: (value) => list.setFilter(def.param, value),
        id: `${p}-filter-${def.param}`,
      })}
    </Fragment>
  );
  // Consecutive defs of one fieldset id render in a single <fieldset>.
  const filterBlocks: {
    fieldset: ObjectListFilterDef['fieldset'];
    defs: [ObjectListFilterDef, ...ObjectListFilterDef[]];
  }[] = [];
  for (const def of filters) {
    const last = filterBlocks[filterBlocks.length - 1];
    if (def.fieldset && last?.fieldset?.id === def.fieldset.id) last.defs.push(def);
    else filterBlocks.push({ fieldset: def.fieldset, defs: [def] });
  }

  const chips = config.chips;
  const chipValue = list.query.searchingAll
    ? ''
    : (list.explicitChip ?? chips?.defaultValue ?? 'all');

  const groupOption = config.groupBy?.options.find((o) => o.value === list.group);
  const groupTriggerText = t('objectList.groupBy.trigger', {
    label: groupOption?.label ?? t('objectList.groupBy.none'),
  });
  const groupItems: OverflowMenuEntry[] = config.groupBy
    ? [
        {
          kind: 'choice',
          id: 'group',
          label: t('objectList.groupBy.label'),
          value: list.group,
          onChange: list.setGroup,
          options: [
            { value: NO_GROUP, label: t('objectList.groupBy.none'), testId: `${p}-group-none` },
            ...config.groupBy.options.map((option) => {
              const available = groupingAvailable(option, list.totalItems);
              return {
                value: option.value,
                label: option.label,
                testId: `${p}-group-${option.value}`,
                ...(available
                  ? {}
                  : { ariaDisabled: true, description: t('objectList.groupBy.unavailable') }),
              };
            }),
          ],
        },
      ]
    : [];

  const sortOption = config.sort.options.find((o) => o.value === list.query.sortBy);
  const sortTriggerText = t('objectList.sort.trigger', {
    label: sortOption?.label ?? config.sort.options[0]?.label ?? '',
  });
  const sortItems: OverflowMenuEntry[] = [
    {
      kind: 'choice',
      id: 'sort',
      label: t('objectList.sort.label'),
      value: list.query.sortBy,
      onChange: (value) => list.setSort(value, list.query.sortOrder),
      options: config.sort.options.map((option) => ({
        value: option.value,
        label: option.label,
        testId: `${p}-sort-${option.value}`,
      })),
    },
    {
      kind: 'choice',
      id: 'direction',
      label: t('objectList.sort.direction'),
      value: list.query.sortOrder,
      onChange: (value) => list.setSort(list.query.sortBy, value === 'desc' ? 'desc' : 'asc'),
      options: [
        { value: 'asc', label: t('objectList.sort.ascending'), testId: `${p}-sort-asc` },
        { value: 'desc', label: t('objectList.sort.descending'), testId: `${p}-sort-desc` },
      ],
    },
  ];

  const hasNote =
    selectAll !== null ||
    searchingAllText !== null ||
    groupingUnavailableText !== null ||
    (note !== undefined && note !== null && note !== false) ||
    list.clearable;

  return (
    <div className={styles.toolbar} role="search" data-testid={`${p}-toolbar`}>
      <div className={styles.searchBox}>
        <input
          ref={searchInputRef}
          data-page-search=""
          type="search"
          className={styles.searchInput}
          placeholder={searchLabel}
          aria-label={t('objectList.searchLabel', { label: searchLabel })}
          autoComplete="off"
          value={search.draft}
          onChange={(e) => search.onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') search.flush();
          }}
          data-testid={`${p}-search`}
        />
        <SearchEverywhereRow query={search.draft} returnFocusRef={searchInputRef} />
      </div>

      {chips ? (
        <FilterChipGroup
          options={[
            ...chips.options,
            {
              value: 'all',
              label: chips.allLabel ?? t('objectList.chips.all'),
              testId: `${p}-chip-all`,
            },
          ]}
          value={chipValue}
          onChange={list.setChip}
          ariaLabel={chips.ariaLabel ?? t('objectList.chips.label')}
          testIdPrefix={`${p}-chip`}
          layout={wide ? 'wrap' : 'scroll'}
        />
      ) : null}

      <div className={styles.buttons}>
        {filters.length > 0 ? (
          <ObjectListFiltersPanel
            idPrefix={`${p}-filters`}
            testIdPrefix={`${p}-filters`}
            activeCount={list.activeFilterCount}
            labels={{
              button: t('objectList.filters.button'),
              buttonActive: (count) => t('objectList.filters.buttonActive', { count }),
              done: t('objectList.filters.done'),
              clear: t('objectList.filters.clear'),
            }}
            onClear={list.clearSheetFilters}
            buttonRef={filtersButtonRef}
          >
            {filterBlocks.map((block) =>
              block.fieldset ? (
                <fieldset key={`fieldset-${block.fieldset.id}`} className={styles.filterField}>
                  <legend className={styles.filterLegend}>{block.fieldset.legend}</legend>
                  <div className={styles.filterGroup}>{block.defs.map(renderFilterControl)}</div>
                </fieldset>
              ) : (
                <fieldset key={block.defs[0].param} className={styles.filterField}>
                  <legend className={styles.filterLegend}>{block.defs[0].label}</legend>
                  {block.defs.map(renderFilterControl)}
                </fieldset>
              ),
            )}
          </ObjectListFiltersPanel>
        ) : null}

        {config.groupBy ? (
          <OverflowMenu
            items={groupItems}
            triggerAriaLabel={groupTriggerText}
            placement="bottom-start"
            data-testid={`${p}-group-menu`}
            renderTrigger={(props) => (
              <button {...props} className={`${shared.btnSecondaryCompact} ${styles.menuButton}`}>
                {groupTriggerText}
              </button>
            )}
          />
        ) : null}

        <OverflowMenu
          items={sortItems}
          triggerAriaLabel={sortTriggerText}
          placement="bottom-start"
          data-testid={`${p}-sort-menu`}
          renderTrigger={(props) => (
            <button {...props} className={`${shared.btnSecondaryCompact} ${styles.menuButton}`}>
              {sortTriggerText}
            </button>
          )}
        />
      </div>

      {hasNote ? (
        <div className={styles.note}>
          {selectAll ? (
            <TriStateCheckbox
              id={`${p}-select-all-mobile`}
              checked={selectAll.checked}
              indeterminate={selectAll.indeterminate}
              onChange={selectAll.onChange}
              label={t('objectList.selection.selectAllShort')}
            />
          ) : null}
          {searchingAllText ? (
            <span data-testid={`${p}-searching-all`}>{searchingAllText}</span>
          ) : null}
          {groupingUnavailableText ? (
            <span data-testid={`${p}-group-unavailable`}>{groupingUnavailableText}</span>
          ) : null}
          {note ? <span data-testid={`${p}-note`}>{note}</span> : null}
          {list.clearable ? (
            <button
              type="button"
              className={shared.btnText}
              onClick={onClear}
              data-testid={`${p}-clear-filters`}
            >
              {t('button.clearFilters')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
