import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useColumnPreferences } from '../../hooks/useColumnPreferences.js';
import { useInfiniteScrollAnnouncements } from '../../hooks/useInfiniteScrollAnnouncements.js';
import { useEntriesLanguage } from '../../contexts/HouseNameContext.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { dataTableTestId } from '../DataTable/dataTableTestId.js';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { FormError } from '../FormError/FormError.js';
import { InfiniteScrollFooter } from '../InfiniteScrollFooter/InfiniteScrollFooter.js';
import { isEscapeHandled, markEscapeHandled } from '../Modal/useFocusTrap.js';
import type { OverflowMenuEntry } from '../OverflowMenu/index.js';
import { PageLayout } from '../PageLayout/PageLayout.js';
import { SelectionActionBar } from '../SelectionActionBar/SelectionActionBar.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import { TriStateCheckbox } from '../TriStateCheckbox/TriStateCheckbox.js';
import shared from '../../styles/shared.module.css';
import { buildGroups, defaultOpen, groupingAvailable } from './grouping.js';
import type { ObjectListGroupData } from './grouping.js';
import { readGroupOpen, writeGroupOpen } from './groupOpenState.js';
import { OBJECT_LIST_PAGE_SIZE } from './objectListUrl.js';
import { ObjectListColumnsDialog } from './ObjectListColumnsDialog.js';
import { ObjectListGroup } from './ObjectListGroup.js';
import { ObjectListHeader } from './ObjectListHeader.js';
import { ObjectListRow } from './ObjectListRow.js';
import { ObjectListToolbar } from './ObjectListToolbar.js';
import { searchingAllNote } from './searchingAllNote.js';
import { useContainerWide } from './useContainerWide.js';
import { useListAnnouncer } from './useListAnnouncer.js';
import type { ObjectListController } from './useObjectList.js';
import { useSearchDraft } from './useSearchDraft.js';
import type {
  ObjectListColumn,
  ObjectListConfig,
  ObjectListExpandable,
  ObjectListFact,
  ObjectListLabels,
  ObjectListSearchingAll,
  ObjectListSurface,
  ObjectListTitle,
} from './types.js';
import styles from './ObjectList.module.css';

export interface ObjectListProps<T, M = undefined, C = never> {
  readonly list: ObjectListController<T, M>;
  readonly config: ObjectListConfig<T>;
  readonly labels: ObjectListLabels;
  readonly breadcrumbs?: ReactNode;
  /** The one primary: "New task" (the host calls useOpenCreate). */
  readonly primary: {
    readonly label: string;
    readonly onClick: () => void;
    readonly testId?: string;
  };
  /** List-specific ⋯ items (Companies: Trades); Columns… and Print are appended. */
  readonly menuItems?: readonly OverflowMenuEntry[];
  readonly title: (item: T) => ObjectListTitle;
  /** Header of the title column ("Task"). */
  readonly titleHeader: string;
  /** Area and company chips under the title; table surface only, on cards put chips in `facts`. */
  readonly renderSecondary?: (item: T) => ReactNode;
  readonly columns?: readonly ObjectListColumn<T>[];
  readonly renderStatus?: (item: T, surface: ObjectListSurface) => ReactNode;
  readonly statusHeader?: string;
  /** Row command, table surface only. */
  readonly renderCommand?: (item: T) => ReactNode;
  /** Row ⋯ entries; on 'card' the host puts the row command first. */
  readonly rowMenu?: (item: T, surface: ObjectListSurface) => readonly OverflowMenuEntry[];
  /** Exactly three facts for the two-line row. */
  readonly facts: (item: T) => readonly [ObjectListFact, ObjectListFact, ObjectListFact];
  readonly expandable?: ObjectListExpandable<T, C>;
  /** Children of SelectionActionBar (at most 3, never primary). Omitted: no checkboxes at all. */
  readonly bulkActions?: (ctx: {
    readonly selected: readonly T[];
    readonly clear: () => void;
  }) => ReactNode;
  /** Invoices only; shown while list.query.searchingAll. */
  readonly searchingAll?: ObjectListSearchingAll | null;
  /** Unfiltered total of the current chip scope: "(n of m)" while filtersActive. */
  readonly scopeTotal?: number | null;
  /** Footer sum row under the list. */
  readonly summary?: ReactNode;
  /** A host summary above the results (Invoices' Offers summary). */
  readonly aboveList?: ReactNode;
  /** Host text in the toolbar's note row (e.g. the active "Show only" filters). */
  readonly note?: ReactNode;
  /** Column keys not shown on this view: not rendered and not listed in Columns…; their preferences are kept. */
  readonly hiddenColumnKeys?: readonly string[];
  /** Host dialogs (ConfirmDialog, sheets). */
  readonly children?: ReactNode;
  readonly headingRef?: RefObject<HTMLHeadingElement | null>;
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}

/**
 * The shared object list: header (h1 + count, one primary, page ⋯), toolbar (search, status
 * chips, Filters, Group by, Sort), grouped or flat rows in a table from 768px list width and
 * cards below, bulk selection, 100-row batches with an infinite-scroll footer. Hosts pair it
 * with `useObjectList` and supply the data, columns and row controls.
 */
export function ObjectList<T, M = undefined, C = never>({
  list,
  config,
  labels,
  breadcrumbs,
  primary,
  menuItems,
  title,
  titleHeader,
  renderSecondary,
  columns = [],
  renderStatus,
  statusHeader,
  renderCommand,
  rowMenu,
  facts,
  expandable,
  bulkActions,
  searchingAll,
  scopeTotal,
  summary,
  aboveList,
  note,
  hiddenColumnKeys,
  children,
  headingRef: headingRefProp,
}: ObjectListProps<T, M, C>) {
  const { t } = useTranslation('common');
  const p = config.testIdPrefix;
  const getKey = list.getKey;
  const items = list.items;
  const rootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const ownHeadingRef = useRef<HTMLHeadingElement>(null);
  const headingRef = headingRefProp ?? ownHeadingRef;
  const wide = useContainerWide(rootRef);
  const surface: ObjectListSurface = wide ? 'table' : 'card';
  const originState = useOriginState();
  const lang = useEntriesLanguage();
  const [columnsOpen, setColumnsOpen] = useState(false);

  // --- Column preferences (the title, status, command and ⋯ are always shown) ---
  const prefs = useColumnPreferences(config.listKey, columns);
  const orderedColumns = useMemo(() => {
    const byKey = new Map(columns.map((column) => [column.key, column]));
    const ordered: ObjectListColumn<T>[] = [];
    for (const key of prefs.columnOrder) {
      const column = byKey.get(key);
      if (column) ordered.push(column);
    }
    for (const column of columns) {
      if (!prefs.columnOrder.includes(column.key)) ordered.push(column);
    }
    return ordered;
  }, [columns, prefs.columnOrder]);
  // Hidden columns are neither rendered nor listed in the dialog, but keep their preferences.
  const dialogColumns = useMemo(
    () =>
      hiddenColumnKeys
        ? orderedColumns.filter((column) => !hiddenColumnKeys.includes(column.key))
        : orderedColumns,
    [orderedColumns, hiddenColumnKeys],
  );
  const visibleColumns = useMemo(
    () => dialogColumns.filter((column) => prefs.visibleColumns.has(column.key)),
    [dialogColumns, prefs.visibleColumns],
  );
  // The dialog emits indexes into the list it was given (dialogColumns); the stored order may
  // hold stale keys and hidden columns, so both indexes are resolved against that same list.
  const moveColumn = (from: number, to: number) => {
    // The dialog only emits indexes of the columns it was given.
    const fromKey = (dialogColumns[from] as ObjectListColumn<T>).key;
    const toKey = (dialogColumns[to] as ObjectListColumn<T>).key;
    const fromIndex = prefs.columnOrder.indexOf(fromKey);
    const toIndex = prefs.columnOrder.indexOf(toKey);
    if (fromIndex === -1 || toIndex === -1) return;
    prefs.moveColumn(fromIndex, toIndex);
  };

  // --- Search ---
  const search = useSearchDraft(list.query.q, list.setSearch);
  const clearFilters = () => {
    search.reset();
    list.clearFilters();
    // The toolbar, and so the search field, is always mounted.
    (searchInputRef.current as HTMLInputElement).focus();
  };

  // --- Announcements: one live region per list ---
  const totalItemsRef = useRef(list.totalItems);
  totalItemsRef.current = list.totalItems;
  const regionRef = useInfiniteScrollAnnouncements({
    fetchSequence: list.fetchSequence,
    status: list.status,
    hasMore: list.hasMore,
    items,
    getKey,
    labels: {
      initialLoad: () => labels.resultCount(totalItemsRef.current as number),
      batchAppended: (count) => t('objectList.footer.appended', { count }),
      batchAppendedAndEnd: (count) => t('objectList.footer.appendedEnd', { count }),
      endOfList: () => t('objectList.footer.end'),
      loading: () => t('objectList.footer.loadingAria'),
    },
  });
  const { announce } = useListAnnouncer(regionRef);

  const searchingAllText =
    list.query.searchingAll && searchingAll ? searchingAllNote(t, searchingAll) : null;
  const announcedNoteRef = useRef<string | null>(null);
  const settled = list.status === 'done' || list.status === 'idle';
  useLayoutEffect(() => {
    if (!searchingAllText) {
      announcedNoteRef.current = null;
      return;
    }
    if (settled && announcedNoteRef.current !== searchingAllText) {
      announcedNoteRef.current = searchingAllText;
      announce(searchingAllText);
    }
  }, [searchingAllText, settled, announce]);

  // --- Selection (keys of loaded rows; pruned whenever the rows change) ---
  const selectable = bulkActions !== undefined;
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set());
  const prunedRef = useRef(false);
  const [prevItems, setPrevItems] = useState(items);
  if (prevItems !== items) {
    setPrevItems(items);
    const present = new Set(items.map(getKey));
    const pruned = new Set([...selection].filter((key) => present.has(key)));
    if (pruned.size !== selection.size) {
      prunedRef.current = true;
      setSelection(pruned);
    }
  }
  // A prune happens during render; its count is announced from this effect, never from render.
  useEffect(() => {
    if (!prunedRef.current) return;
    prunedRef.current = false;
    announce(t('objectList.selection.count', { count: selection.size }));
  }, [selection, announce, t]);
  const applySelection = (next: ReadonlySet<string>) => {
    setSelection(next);
    announce(t('objectList.selection.count', { count: next.size }));
  };
  const setKeysSelected = (keys: readonly string[], on: boolean) => {
    const next = new Set(selection);
    for (const key of keys) {
      if (on) next.add(key);
      else next.delete(key);
    }
    applySelection(next);
  };
  const clearSelection = () => applySelection(new Set());
  const selectedItems = items.filter((item) => selection.has(getKey(item)));
  const allKeys = items.map(getKey);
  const selectState = (keys: readonly string[]) => {
    const count = keys.filter((key) => selection.has(key)).length;
    return {
      checked: keys.length > 0 && count === keys.length,
      indeterminate: count > 0 && count < keys.length,
    };
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      event.key === 'Escape' &&
      selection.size > 0 &&
      !event.defaultPrevented &&
      !isEscapeHandled(event.nativeEvent) &&
      event.currentTarget.contains(event.target as Node)
    ) {
      clearSelection();
      markEscapeHandled(event.nativeEvent);
    }
  };

  // --- Expansion (component-local, never persisted) ---
  const [expandOverrides, setExpandOverrides] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );
  const isExpanded = (item: T, key: string): boolean =>
    expandOverrides.get(key) ?? expandable?.isDefaultExpanded?.(item) ?? false;
  const toggleExpanded = (item: T, key: string) => {
    const next = new Map(expandOverrides);
    next.set(key, !isExpanded(item, key));
    setExpandOverrides(next);
  };

  // --- Grouping ---
  const groupOption = config.groupBy?.options.find((option) => option.value === list.group);
  const groupAvailable = groupOption ? groupingAvailable(groupOption, list.totalItems) : false;
  const groups: ObjectListGroupData<T>[] | null =
    groupOption && groupAvailable ? buildGroups(items, groupOption, list.groupCounts) : null;
  const groupingUnavailableText =
    groupOption && !groupAvailable ? t('objectList.groupBy.unavailable') : null;
  const [openState, setOpenState] = useState(() => ({
    group: list.group,
    map: readGroupOpen(config.listKey, list.group),
  }));
  if (openState.group !== list.group) {
    setOpenState({ group: list.group, map: readGroupOpen(config.listKey, list.group) });
  }
  const openMap = openState.group === list.group ? openState.map : {};
  const toggleGroup = (group: ObjectListGroupData<T>, open: boolean) => {
    const nextMap = { ...openMap, [group.meta.key]: !open };
    setOpenState({ group: list.group, map: nextMap });
    writeGroupOpen(config.listKey, list.group, nextMap);
    announce(
      t(open ? 'objectList.group.collapsed' : 'objectList.group.expanded', {
        group: group.meta.label,
      }),
    );
  };

  // --- Focus after a row leaves the list ---
  const lastFocusedKeyRef = useRef<string | null>(null);
  const prevKeysRef = useRef<string[]>([]);
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;
  useLayoutEffect(() => {
    const keys = items.map(getKey);
    const previous = prevKeysRef.current;
    prevKeysRef.current = keys;
    const lost = lastFocusedKeyRef.current;
    if (lost === null) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    lastFocusedKeyRef.current = null;
    // Focus was lost with the row's element. The row itself comes first when it is still in the
    // list (it moved to another group); otherwise the row now at its index, then the previous one.
    const index = previous.indexOf(lost);
    const candidates = keys.includes(lost)
      ? [lost]
      : [keys[index], keys[index - 1], keys[keys.length - 1]];
    const root = rootRef.current as HTMLDivElement;
    for (const key of candidates) {
      if (key === undefined) continue;
      const link = root.querySelector<HTMLElement>(
        `[data-testid="${cssEscape(dataTableTestId(`${p}-title`, key, surfaceRef.current))}"]`,
      );
      // A row inside a collapsed group cannot take focus.
      if (link && !link.closest('[hidden]')) {
        link.focus();
        return;
      }
    }
    (headingRef.current as HTMLElement).focus();
  }, [items, getKey, p, headingRef]);

  const onRowFocus = useCallback((key: string) => {
    lastFocusedKeyRef.current = key;
  }, []);

  // --- Derived display values ---
  const loadingFirst = list.status === 'loading' && items.length === 0;
  const countKnown = list.totalItems !== null && !loadingFirst;
  const count: ReactNode | null = !countKnown
    ? null
    : list.filtersActive && scopeTotal !== null && scopeTotal !== undefined
      ? t('objectList.countOf', { count: list.totalItems, total: scopeTotal })
      : t('objectList.count', { count: list.totalItems });

  const hasStatus = renderStatus !== undefined;
  const hasCommand = renderCommand !== undefined;
  const hasMenu = rowMenu !== undefined;
  const leadingCount = (selectable ? 1 : 0) + (expandable ? 1 : 0);
  const trailingCount = (hasStatus ? 1 : 0) + (hasCommand ? 1 : 0) + (hasMenu ? 1 : 0);
  const columnCount = leadingCount + 1 + visibleColumns.length + trailingCount;

  const renderRow = (item: T, rowSurface: ObjectListSurface) => {
    const key = getKey(item);
    return (
      <ObjectListRow<T, C>
        key={key}
        surface={rowSurface}
        item={item}
        itemKey={key}
        testIdPrefix={p}
        title={title(item)}
        lang={lang}
        originState={originState}
        renderSecondary={renderSecondary}
        columns={visibleColumns}
        hasStatus={hasStatus}
        hasCommand={hasCommand}
        hasMenu={hasMenu}
        renderStatus={renderStatus}
        renderCommand={renderCommand}
        rowMenu={rowMenu}
        facts={facts}
        expandable={expandable}
        expanded={isExpanded(item, key)}
        onToggleExpanded={() => toggleExpanded(item, key)}
        selection={
          selectable
            ? {
                selected: selection.has(key),
                onChange: (checked) => setKeysSelected([key], checked),
              }
            : null
        }
        onRowFocus={onRowFocus}
      />
    );
  };

  const renderGroups = (rowSurface: ObjectListSurface, data: readonly ObjectListGroupData<T>[]) =>
    data.map((group) => {
      const open = openMap[group.meta.key] ?? defaultOpen(group, data);
      const keys = group.items.map(getKey);
      return (
        <ObjectListGroup
          key={group.meta.key}
          surface={rowSurface}
          groupKey={group.meta.key}
          label={group.meta.label}
          badge={group.meta.badge}
          count={group.count}
          loaded={group.loaded}
          open={open}
          onToggle={() => toggleGroup(group, open)}
          select={
            selectable
              ? { ...selectState(keys), onChange: (checked) => setKeysSelected(keys, checked) }
              : null
          }
          columnCount={columnCount}
          testIdPrefix={p}
        >
          {group.items.map((item) => renderRow(item, rowSurface))}
        </ObjectListGroup>
      );
    });

  const sortCycle = (sortValue: string) => {
    const { sortBy, sortOrder, isDefaultSort } = list.query;
    if (sortBy !== sortValue) list.setSort(sortValue, 'asc');
    else if (sortOrder === 'asc') list.setSort(sortValue, 'desc');
    else if (isDefaultSort) list.setSort(sortValue, 'asc');
    else list.setSort(config.sort.defaultValue, null);
  };
  const ariaSort = (
    column: ObjectListColumn<T>,
  ): 'ascending' | 'descending' | 'none' | undefined => {
    if (!column.sortValue) return undefined;
    if (list.query.sortBy !== column.sortValue) return 'none';
    return list.query.sortOrder === 'asc' ? 'ascending' : 'descending';
  };
  const sortMark = (column: ObjectListColumn<T>): string => {
    const value = ariaSort(column);
    if (value === 'ascending') return ' ↑';
    if (value === 'descending') return ' ↓';
    return '';
  };

  const allState = selectState(allKeys);
  const selectAllLabel = labels.selectAll ?? t('objectList.selection.selectAllShort');
  const showFooter = list.totalItems !== null && list.totalItems > OBJECT_LIST_PAGE_SIZE;
  const selectionCountLabel =
    list.hasMore && list.totalItems !== null
      ? t('objectList.selection.countNotLoaded', {
          count: selection.size,
          rest: Math.max(0, list.totalItems - items.length),
        })
      : t('objectList.selection.count', { count: selection.size });

  const columnClass = (width: ObjectListColumn<T>['width']) =>
    width === 'narrow' ? styles.colNarrow : width === 'wide' ? styles.colWide : styles.colMedium;

  const showEmptyFiltered = list.status === 'done' && items.length === 0 && list.clearable;

  return (
    <PageLayout
      breadcrumbs={breadcrumbs}
      testId={`${p}-page`}
      header={
        <ObjectListHeader
          title={labels.title}
          count={count}
          primary={primary}
          menuItems={menuItems}
          onColumns={wide && dialogColumns.length > 0 ? () => setColumnsOpen(true) : undefined}
          headingRef={headingRef}
          menuTriggerRef={menuTriggerRef}
          testIdPrefix={p}
        />
      }
    >
      <div
        ref={rootRef}
        className={styles.root}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          // A disconnected target lost focus because its row was removed: keep the key for the focus rule.
          if ((event.target as Node).isConnected) lastFocusedKeyRef.current = null;
        }}
        data-testid={`${p}-list`}
      >
        <ObjectListToolbar
          list={list}
          config={config}
          searchLabel={labels.search}
          wide={wide}
          search={search}
          searchInputRef={searchInputRef}
          searchingAllText={searchingAllText}
          groupingUnavailableText={groupingUnavailableText}
          note={note}
          selectAll={
            selectable && !wide
              ? {
                  ...allState,
                  onChange: (checked) => setKeysSelected(allKeys, checked),
                }
              : null
          }
          onClear={clearFilters}
        />

        <div ref={regionRef} role="status" aria-atomic="true" className={shared.srOnly} />

        {aboveList}

        <section
          aria-label={labels.title}
          aria-busy={list.status === 'loading' || undefined}
          className={styles.list}
        >
          {loadingFirst ? (
            <Skeleton lines={5} loadingLabel={t('objectList.loading')} />
          ) : list.status === 'error' && items.length === 0 ? (
            <div className={styles.failure}>
              <FormError message={labels.loadFailed} />
              <button
                type="button"
                className={shared.btnSecondary}
                onClick={() => {
                  (headingRef.current as HTMLElement).focus();
                  list.retry();
                }}
                data-testid={`${p}-retry`}
              >
                {t('button.retry')}
              </button>
            </div>
          ) : list.status === 'done' && items.length === 0 ? (
            showEmptyFiltered ? (
              <EmptyState
                message={labels.noMatch}
                action={{ label: t('button.clearFilters'), onClick: clearFilters }}
              />
            ) : (
              <EmptyState message={labels.empty} description={labels.emptyDescription} />
            )
          ) : (
            <>
              <div className={styles.tableSurface}>
                <table className={styles.table}>
                  <colgroup>
                    {selectable ? <col className={styles.colCheck} /> : null}
                    {expandable ? <col className={styles.colCheck} /> : null}
                    <col className={styles.colTitle} />
                    {visibleColumns.map((column) => (
                      <col key={column.key} className={columnClass(column.width)} />
                    ))}
                    {hasStatus ? <col className={styles.colAuto} /> : null}
                    {hasCommand ? <col className={styles.colAuto} /> : null}
                    {hasMenu ? <col className={styles.colCheck} /> : null}
                  </colgroup>
                  <thead>
                    <tr>
                      {selectable ? (
                        <th scope="col" className={styles.headCheck}>
                          <TriStateCheckbox
                            hideLabel
                            label={selectAllLabel}
                            checked={allState.checked}
                            indeterminate={allState.indeterminate}
                            onChange={(checked) => setKeysSelected(allKeys, checked)}
                          />
                        </th>
                      ) : null}
                      {expandable ? <th aria-hidden="true" className={styles.headCheck} /> : null}
                      <th scope="col" className={styles.head}>
                        {titleHeader}
                      </th>
                      {visibleColumns.map((column) => {
                        const sortValue = column.sortValue;
                        return (
                          <th
                            key={column.key}
                            scope="col"
                            className={column.align === 'end' ? styles.headEnd : styles.head}
                            aria-sort={ariaSort(column)}
                          >
                            {sortValue ? (
                              <button
                                type="button"
                                className={styles.sortButton}
                                onClick={() => sortCycle(sortValue)}
                                data-testid={`${p}-sort-header-${column.key}`}
                              >
                                {column.label}
                                {sortMark(column)}
                              </button>
                            ) : (
                              column.label
                            )}
                          </th>
                        );
                      })}
                      {hasStatus ? (
                        <th scope="col" className={styles.head}>
                          {statusHeader}
                        </th>
                      ) : null}
                      {hasCommand ? (
                        <th scope="col" className={`${styles.head} ${styles.headAction}`}>
                          <span className={shared.srOnly}>{t('objectList.columns.actions')}</span>
                        </th>
                      ) : null}
                      {hasMenu ? (
                        <th scope="col" className={`${styles.head} ${styles.headAction}`}>
                          <span className={shared.srOnly}>{t('objectList.columns.actions')}</span>
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  {groups ? (
                    renderGroups('table', groups)
                  ) : (
                    <tbody>{items.map((item) => renderRow(item, 'table'))}</tbody>
                  )}
                </table>
              </div>

              <div className={styles.cardSurface}>
                {groups ? (
                  renderGroups('card', groups)
                ) : (
                  <ul className={styles.cardList}>
                    {items.map((item) => renderRow(item, 'card'))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>

        {summary}

        {showFooter ? (
          <>
            <p className={styles.showing}>
              {t('objectList.footer.showing', { count: items.length, total: list.totalItems })}
            </p>
            <InfiniteScrollFooter
              status={list.status}
              loadingLabel={t('objectList.footer.loading')}
              loadingAriaLabel={t('objectList.footer.loadingAria')}
              loadMoreLabel={t('objectList.footer.loadMore')}
              retryLabel={t('button.retry')}
              errorMessage={t('objectList.footer.error')}
              endOfListMessage={t('objectList.footer.end')}
              sentinelRef={list.sentinelRef}
              onLoadMore={list.loadMore}
              onRetry={list.retry}
              testIdPrefix={`${p}-footer`}
            />
          </>
        ) : null}

        {bulkActions !== undefined && selection.size > 0 ? (
          <SelectionActionBar
            announce={false}
            testId={`${p}-selection-bar`}
            countLabel={selectionCountLabel}
            clearLabel={t('objectList.selection.clear')}
            onClear={clearSelection}
          >
            {bulkActions({ selected: selectedItems, clear: clearSelection })}
          </SelectionActionBar>
        ) : null}
      </div>

      {columnsOpen ? (
        <ObjectListColumnsDialog
          listKey={config.listKey}
          columns={dialogColumns.map(({ key, label }) => ({ key, label }))}
          visibleColumns={prefs.visibleColumns}
          onToggleColumn={prefs.toggleColumn}
          onMoveColumn={moveColumn}
          onResetToDefaults={prefs.resetToDefaults}
          onClose={() => setColumnsOpen(false)}
          returnFocusRef={menuTriggerRef}
        />
      ) : null}

      {children}
    </PageLayout>
  );
}
