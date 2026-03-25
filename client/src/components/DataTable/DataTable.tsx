import { useMemo, useState } from 'react';
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
 * Props for DataTable component
 */
export interface DataTableProps<T> {
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
export function DataTable<T>({
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
}: DataTableProps<T>) {
  const { t } = useTranslation('common');

  // Client-side filter state for columns without server-side support
  const [clientFilters, setClientFilters] = useState<Map<string, { value: string }>>(new Map());

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
      const filterMin = minMatch ? parseFloat(minMatch[1]) : undefined;
      const filterMax = maxMatch ? parseFloat(maxMatch[1]) : undefined;
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
              columns={sortedColumns}
              visibleColumns={visibleColumns}
              onToggleColumn={toggleColumn}
              onMoveColumn={moveColumn}
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
            visibleColumns={visibleColumns}
            tableState={{ ...tableState, filters: allFilters }}
            filterMeta={mergedFilterMeta}
            onSort={handleSort}
            onFilter={handleFilter}
            hasActions={!!renderActions}
          />
          <tbody>
            {filteredItems.map((item) => (
              <DataTableRow<T>
                key={getRowKey(item)}
                item={item}
                columns={sortedColumns}
                visibleColumns={visibleColumns}
                onClick={() => onRowClick?.(item)}
                renderActions={renderActions ? () => renderActions(item) : undefined}
              />
            ))}
          </tbody>
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
              ? { label: t('button.clearFilters'), onClick: handleResetFilters }
              : emptyState?.action
          }
        />
      ) : (
        <div className={styles.cardsContainer}>
          {filteredItems.map((item) => (
            <DataTableCard<T>
              key={getRowKey(item)}
              item={item}
              columns={sortedColumns}
              visibleColumns={visibleColumns}
              onClick={() => onRowClick?.(item)}
              renderActions={renderActions ? () => renderActions(item) : undefined}
            />
          ))}
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
