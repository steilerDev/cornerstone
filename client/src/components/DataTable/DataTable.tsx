import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import type { FilterMeta } from '@cornerstone/shared';
import type { SearchPickerProps } from '../SearchPicker/SearchPicker.js';
import { DataTableHeader } from './DataTableHeader.js';
import { DataTableRow } from './DataTableRow.js';
import { DataTableCard } from './DataTableCard.js';
import { DataTablePagination } from './DataTablePagination.js';
import { DataTableColumnSettings } from './DataTableColumnSettings.js';
import { useColumnPreferences } from '../../hooks/useColumnPreferences.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import { EmptyState } from '../EmptyState/EmptyState.js';
import styles from './DataTable.module.css';

/**
 * Filter type enumeration for DataTable column filters
 */
export type FilterType = 'string' | 'number' | 'date' | 'enum' | 'boolean' | 'entity';

/**
 * Option for enum filters
 */
export interface EnumOption {
  value: string;
  label: string;
}

/**
 * Hierarchy item for enum filter (parent-child relationships)
 */
export interface EnumHierarchyItem {
  id: string;
  parentId: string | null;
}

/**
 * Column definition for DataTable
 */
export interface ColumnDef<T> {
  key: string;
  label: string;
  sortable?: boolean;
  sortKey?: string;
  filterable?: boolean;
  filterType?: FilterType;
  filterParamKey?: string;
  enumOptions?: EnumOption[];
  enumHierarchy?: EnumHierarchyItem[];
  enumIncludeNone?: boolean;
  /** Already-translated label shown in the "none" sentinel row */
  enumNoneLabel?: string;
  /** Used as aria-label on the sentinel checkbox (already translated) */
  enumNoneDescription?: string;
  entitySearchFn?: SearchPickerProps<unknown>['searchFn'];
  entityRenderItem?: SearchPickerProps<unknown>['renderItem'];
  entityPlaceholder?: string;
  numberMin?: number;
  numberMax?: number;
  numberStep?: number;
  defaultVisible?: boolean;
  /** Raw numeric value for client-side number filtering (when no filterParamKey) */
  getValue?: (item: T) => number;
  render: (item: T) => ReactNode;
  renderCard?: (item: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  /**
   * When true the column is always rendered regardless of stored column
   * preferences, and is excluded from the column-settings popover.
   * Use for columns whose presence is driven by page mode, not user choice.
   */
  alwaysVisible?: boolean;
  /** Optional title attribute for the column header (e.g. explaining what the figure includes). */
  headerTitle?: string;
}

/**
 * Active filter representation
 */
export interface ActiveFilter {
  value: string;
}

/**
 * Table state holding pagination, search, sorting, and filters
 */
export interface TableState {
  search: string;
  filters: Map<string, ActiveFilter>;
  sortBy: string | null;
  sortDir: 'asc' | 'desc' | null;
  page: number;
  pageSize: number;
}

/**
 * API parameters derived from TableState
 */
export interface TableApiParams {
  q?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page: number;
  pageSize: number;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Configuration enabling expandable parent/child rows on a DataTable.
 *
 * @typeParam T - Parent row item type
 * @typeParam C - Child row item type
 */
export interface ExpandableRowsConfig<T, C> {
  /** [] ⇒ no expand control at all for this row. */
  getChildren: (item: T) => C[];
  getChildKey: (child: C, parent: T) => string;
  /**
   * Desktop: must return exactly one <td> per key in `visibleColumnKeys`, in order.
   * The 44px leading cell is rendered by DataTable — do not emit it here.
   */
  renderChildCells: (child: C, parent: T, visibleColumnKeys: string[]) => ReactNode;
  /** Mobile: content rendered inside the parent card's children container. */
  renderChildCard: (child: C, parent: T) => ReactNode;
  /** Default: false. */
  isDefaultExpanded?: (item: T) => boolean;
  /** Already-translated aria-label for the toggle; must include the child count. */
  getExpandLabel: (item: T, expanded: boolean, childCount: number) => string;
}

/**
 * Props for DataTable component
 */
export interface DataTableProps<T, C = unknown> {
  pageKey: string;
  columns: ColumnDef<T>[];
  items: T[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  isLoading: boolean;
  error?: string | null;
  getRowKey: (item: T) => string;
  onRowClick?: (item: T) => void;
  renderActions?: (item: T) => ReactNode;
  tableState: TableState;
  onStateChange: (state: TableState) => void;
  headerContent?: ReactNode;
  customFilters?: ReactNode;
  emptyState?: {
    message: string;
    description?: string;
    action?: { label: string; onClick: () => void };
  };
  filterMeta?: FilterMeta;
  className?: string;
  /** Column key → already-translated reason a column's filter trigger is disabled. */
  disabledFilterKeys?: ReadonlyMap<string, string>;
  /** Enables parent/child expandable rows. */
  expandableRows?: ExpandableRowsConfig<T, C>;
}

/**
 * DataTable component with integrated state management
 *
 * Provides:
 * - Search with debouncing
 * - Column sorting (3-state cycling)
 * - Per-column filtering
 * - Pagination with configurable page sizes
 * - Column visibility preferences (desktop-only toggle)
 * - Responsive layout (table on desktop, cards on mobile)
 * - Loading, error, and empty states
 *
 * @param props Component props
 * @returns Rendered DataTable
 */
export function DataTable<T, C = unknown>({
  pageKey,
  columns,
  items,
  totalItems,
  totalPages,
  currentPage,
  isLoading,
  error,
  getRowKey,
  onRowClick,
  renderActions,
  tableState,
  onStateChange,
  headerContent,
  customFilters,
  emptyState,
  filterMeta,
  className,
  disabledFilterKeys,
  expandableRows,
}: DataTableProps<T, C>) {
  const { t } = useTranslation('common');

  // Client-side filter state for columns without server-side support
  const [clientFilters, setClientFilters] = useState<Map<string, { value: string }>>(
    () => new Map(),
  );

  // Expansion state for parent/child rows — component-local, never persisted to
  // TableState/URL. No effect resets it on `items` change: a real page reload
  // remounts the component and restores defaults.
  const [expandOverrides, setExpandOverrides] = useState<Map<string, boolean>>(() => new Map());
  const isRowExpanded = (item: T, key: string): boolean =>
    expandOverrides.get(key) ?? expandableRows?.isDefaultExpanded?.(item) ?? false;
  const toggleExpanded = (key: string, next: boolean) => {
    setExpandOverrides((prev) => {
      const updated = new Map(prev);
      updated.set(key, next);
      return updated;
    });
  };

  // Load column visibility and ordering preferences
  const { visibleColumns, columnOrder, toggleColumn, moveColumn, resetToDefaults } =
    useColumnPreferences(pageKey, columns);

  // Sort columns by stored order
  const sortedColumns = useMemo(() => {
    const columnMap = new Map(columns.map((col) => [col.key, col]));
    const ordered: typeof columns = [];

    for (const key of columnOrder) {
      const col = columnMap.get(key);
      if (col) {
        ordered.push(col);
      }
    }

    // Add any columns not in the stored order (new columns added to page)
    for (const col of columns) {
      if (!columnOrder.includes(col.key)) {
        ordered.push(col);
      }
    }

    return ordered;
  }, [columns, columnOrder]);

  // Columns that must always render regardless of stored preferences (page-mode driven,
  // not user choice), merged into the stored visibility set.
  const effectiveVisibleColumns = useMemo(() => {
    const next = new Set(visibleColumns);
    for (const col of columns) {
      if (col.alwaysVisible) next.add(col.key);
    }
    return next;
  }, [visibleColumns, columns]);

  // Always-visible columns are excluded from the column-settings popover — the user
  // can never unset them, so offering the toggle would be misleading.
  const settingsColumns = useMemo(
    () => sortedColumns.filter((c) => !c.alwaysVisible),
    [sortedColumns],
  );

  // DataTableColumnSettings emits indices into the columns array it was handed
  // (settingsColumns, which excludes alwaysVisible columns), whereas
  // useColumnPreferences.moveColumn splices columnOrder, which may still contain
  // them (and may contain stale keys from a previous mode). Remap by key.
  const handleMoveSettingsColumn = useCallback(
    (from: number, to: number) => {
      const fromKey = settingsColumns[from]?.key;
      const toKey = settingsColumns[to]?.key;
      if (!fromKey || !toKey) return;
      const fromIndex = columnOrder.indexOf(fromKey);
      const toIndex = columnOrder.indexOf(toKey);
      if (fromIndex === -1 || toIndex === -1) return;
      moveColumn(fromIndex, toIndex);
    },
    [settingsColumns, columnOrder, moveColumn],
  );

  const visibleColumnKeys = useMemo(
    () => sortedColumns.filter((c) => effectiveVisibleColumns.has(c.key)).map((c) => c.key),
    [sortedColumns, effectiveVisibleColumns],
  );

  // Identify columns that filter client-side only (no filterParamKey)
  const clientOnlyFilterKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const col of sortedColumns) {
      if (col.filterable && col.filterType === 'number' && !col.filterParamKey && col.getValue) {
        keys.add(col.key);
      }
    }
    return keys;
  }, [sortedColumns]);

  // Apply client-side filters to the items list
  const filteredItems = useMemo(() => {
    let result = items;
    for (const col of sortedColumns) {
      if (!clientOnlyFilterKeys.has(col.key) || !col.getValue) continue;
      const filterVal = clientFilters.get(col.key)?.value;
      if (!filterVal) continue;
      const minMatch = filterVal.match(/min:([\d.]+)/);
      const maxMatch = filterVal.match(/max:([\d.]+)/);
      // minMatch is guaranteed to have [1] if it matched
      const filterMin = minMatch ? parseFloat(minMatch[1]!) : undefined;
      // maxMatch is guaranteed to have [1] if it matched
      const filterMax = maxMatch ? parseFloat(maxMatch[1]!) : undefined;
      result = result.filter((item) => {
        const val = col.getValue!(item);
        if (filterMin !== undefined && val < filterMin) return false;
        if (filterMax !== undefined && val > filterMax) return false;
        return true;
      });
    }
    return result;
  }, [items, sortedColumns, clientOnlyFilterKeys, clientFilters]);

  // Compute client-side filterMeta bounds for columns without server support
  const clientFilterMeta = useMemo(() => {
    const meta: Record<string, { min: number; max: number }> = {};
    for (const col of sortedColumns) {
      if (clientOnlyFilterKeys.has(col.key) && col.getValue) {
        let min = Infinity,
          max = -Infinity;
        for (const item of items) {
          const v = col.getValue(item);
          if (v < min) min = v;
          if (v > max) max = v;
        }
        meta[col.key] = { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
      }
    }
    return meta;
  }, [items, sortedColumns, clientOnlyFilterKeys]);

  // Merge API filterMeta with client-side computed meta
  const mergedFilterMeta = useMemo(
    () => ({
      ...filterMeta,
      ...clientFilterMeta,
    }),
    [filterMeta, clientFilterMeta],
  );

  // Combine server-side and client-side filters for header display
  const allFilters = useMemo(() => {
    const merged = new Map(tableState.filters);
    for (const [key, val] of clientFilters) {
      merged.set(key, val);
    }
    return merged;
  }, [tableState.filters, clientFilters]);

  const handleSearch = (query: string) => {
    const newState = { ...tableState, search: query, page: 1 };
    onStateChange(newState);
  };

  const handleSort = (columnKey: string, columnSortKey?: string) => {
    const sortKey = columnSortKey || columnKey;
    let newSortDir: 'asc' | 'desc' | null = 'asc';

    if (tableState.sortBy === sortKey && tableState.sortDir === 'asc') {
      newSortDir = 'desc';
    } else if (tableState.sortBy === sortKey && tableState.sortDir === 'desc') {
      newSortDir = null;
    }

    const newState = {
      ...tableState,
      sortBy: newSortDir ? sortKey : null,
      sortDir: newSortDir,
      page: 1,
    };
    onStateChange(newState);
  };

  const handleFilter = (paramKey: string, value: string | null) => {
    // Route client-side filters to internal state
    if (clientOnlyFilterKeys.has(paramKey)) {
      setClientFilters((prev) => {
        const next = new Map(prev);
        if (value === null || value === '') next.delete(paramKey);
        else next.set(paramKey, { value });
        return next;
      });
      return; // Don't propagate to parent for client-side filters
    }

    // Server-side filters: propagate to parent
    const newFilters = new Map(tableState.filters);
    if (value === null || value === '') {
      newFilters.delete(paramKey);
    } else {
      newFilters.set(paramKey, { value });
    }
    const newState = { ...tableState, filters: newFilters, page: 1 };
    onStateChange(newState);
  };

  const handlePage = (page: number) => {
    const newState = { ...tableState, page };
    onStateChange(newState);
  };

  const handlePageSize = (size: number) => {
    const newState = { ...tableState, pageSize: size, page: 1 };
    onStateChange(newState);
  };

  const handleResetFilters = () => {
    setClientFilters(new Map());
    const newState = {
      ...tableState,
      search: '',
      filters: new Map(),
      page: 1,
    };
    onStateChange(newState);
  };

  const hasActiveFilters = useMemo(
    () => tableState.search !== '' || tableState.filters.size > 0 || clientFilters.size > 0,
    [tableState.search, tableState.filters, clientFilters],
  );

  if (isLoading && items.length === 0) {
    return (
      <div className={`${styles.dataTableContainer} ${className || ''}`}>
        <Skeleton lines={5} loadingLabel={t('dataTable.loading')} />
      </div>
    );
  }

  return (
    <div className={`${styles.dataTableContainer} ${className || ''}`}>
      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      {/* Header content slot */}
      {headerContent}

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarRow}>
          <div className={styles.searchBox}>
            <input
              type="search"
              placeholder={t('dataTable.search.placeholder')}
              value={tableState.search}
              onChange={(e) => handleSearch(e.target.value)}
              className={styles.searchInput}
              aria-label={t('dataTable.search.ariaLabel')}
            />
          </div>
          <div className={styles.toolbarButtons}>
            {hasActiveFilters && (
              <button type="button" className={styles.resetButton} onClick={handleResetFilters}>
                {t('button.clearFilters')}
              </button>
            )}
            <DataTableColumnSettings<T>
              columns={settingsColumns}
              visibleColumns={effectiveVisibleColumns}
              onToggleColumn={toggleColumn}
              onMoveColumn={handleMoveSettingsColumn}
              onResetToDefaults={resetToDefaults}
            />
          </div>
        </div>

        {/* Custom filters slot */}
        {customFilters && <div className={styles.toolbarRow}>{customFilters}</div>}
      </div>

      {/* Desktop Table — always show header */}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <DataTableHeader<T>
            columns={sortedColumns}
            visibleColumns={effectiveVisibleColumns}
            tableState={{ ...tableState, filters: allFilters }}
            filterMeta={mergedFilterMeta}
            onSort={handleSort}
            onFilter={handleFilter}
            hasActions={!!renderActions}
            disabledFilterKeys={disabledFilterKeys}
            hasLeadingCell={!!expandableRows}
          />
          {expandableRows ? (
            filteredItems.map((item) => {
              const rowKey = getRowKey(item);
              const children = expandableRows.getChildren(item);
              const expanded = children.length > 0 && isRowExpanded(item, rowKey);
              return (
                <tbody key={rowKey} id={`row-group-${rowKey}`}>
                  <DataTableRow<T>
                    item={item}
                    columns={sortedColumns}
                    visibleColumns={effectiveVisibleColumns}
                    onClick={() => onRowClick?.(item)}
                    renderActions={renderActions ? () => renderActions(item) : undefined}
                    leadingCell={
                      children.length > 0 ? (
                        <button
                          type="button"
                          className={styles.expandButton}
                          aria-expanded={expanded}
                          aria-controls={`row-group-${rowKey}`}
                          aria-label={expandableRows.getExpandLabel(
                            item,
                            expanded,
                            children.length,
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpanded(rowKey, !expanded);
                          }}
                        >
                          <span
                            className={`${styles.expandIcon} ${expanded ? styles.expandIconOpen : ''}`}
                            aria-hidden="true"
                          >
                            ▼
                          </span>
                        </button>
                      ) : null
                    }
                  />
                  {children.map((child) => (
                    <tr
                      key={expandableRows.getChildKey(child, item)}
                      className={styles.childRow}
                      hidden={!expanded}
                    >
                      <td className={styles.expandCell} aria-hidden="true" />
                      {expandableRows.renderChildCells(child, item, visibleColumnKeys)}
                      {renderActions && <td className={styles.tableActionsCell} />}
                    </tr>
                  ))}
                </tbody>
              );
            })
          ) : (
            <tbody>
              {filteredItems.map((item) => (
                <DataTableRow<T>
                  key={getRowKey(item)}
                  item={item}
                  columns={sortedColumns}
                  visibleColumns={effectiveVisibleColumns}
                  onClick={() => onRowClick?.(item)}
                  renderActions={renderActions ? () => renderActions(item) : undefined}
                />
              ))}
            </tbody>
          )}
        </table>
      </div>

      {/* Empty state or mobile cards */}
      {filteredItems.length === 0 ? (
        <EmptyState
          message={
            hasActiveFilters
              ? t('dataTable.empty.filteredMessage')
              : emptyState?.message || t('dataTable.empty.defaultMessage')
          }
          description={!hasActiveFilters ? emptyState?.description : undefined}
          action={
            hasActiveFilters
              ? { label: t('button.clearFilters')!, onClick: handleResetFilters }
              : emptyState?.action
          }
        />
      ) : (
        <div className={styles.cardsContainer}>
          {filteredItems.map((item) => {
            const rowKey = getRowKey(item);
            if (!expandableRows) {
              return (
                <DataTableCard<T>
                  key={rowKey}
                  item={item}
                  columns={sortedColumns}
                  visibleColumns={effectiveVisibleColumns}
                  onClick={() => onRowClick?.(item)}
                  renderActions={renderActions ? () => renderActions(item) : undefined}
                />
              );
            }

            const children = expandableRows.getChildren(item);
            const expanded = children.length > 0 && isRowExpanded(item, rowKey);
            const childrenId = `card-children-${rowKey}`;

            return (
              <DataTableCard<T>
                key={rowKey}
                item={item}
                columns={sortedColumns}
                visibleColumns={effectiveVisibleColumns}
                onClick={() => onRowClick?.(item)}
                renderActions={renderActions ? () => renderActions(item) : undefined}
                expandButton={
                  children.length > 0 ? (
                    <button
                      type="button"
                      className={styles.expandButton}
                      aria-expanded={expanded}
                      aria-controls={childrenId}
                      aria-label={expandableRows.getExpandLabel(item, expanded, children.length)}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(rowKey, !expanded);
                      }}
                    >
                      <span
                        className={`${styles.expandIcon} ${expanded ? styles.expandIconOpen : ''}`}
                        aria-hidden="true"
                      >
                        ▼
                      </span>
                    </button>
                  ) : undefined
                }
                childrenId={children.length > 0 ? childrenId : undefined}
                childrenExpanded={expanded}
                childrenContent={
                  children.length > 0 ? (
                    <>
                      {children.map((child) => (
                        <div
                          key={expandableRows.getChildKey(child, item)}
                          className={styles.cardChildRow}
                        >
                          {expandableRows.renderChildCard(child, item)}
                        </div>
                      ))}
                    </>
                  ) : undefined
                }
              />
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={tableState.pageSize}
          onPageChange={handlePage}
          onPageSizeChange={handlePageSize}
        />
      )}
    </div>
  );
}

export default DataTable;
