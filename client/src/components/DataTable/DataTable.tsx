import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TableState, SortState } from '../../hooks/useTableState.js';
import { DataTableHeader } from './DataTableHeader.js';
import { DataTableRow } from './DataTableRow.js';
import { DataTableCard } from './DataTableCard.js';
import { DataTablePagination } from './DataTablePagination.js';
import { DataTableColumnSettings } from './DataTableColumnSettings.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import styles from './DataTable.module.css';

export interface ColumnDef<T> {
  /** Unique key for this column */
  key: string;
  /** i18n key for column header label */
  label: string;
  /** Column data type — determines filter UI */
  type?: 'string' | 'number' | 'currency' | 'date' | 'enum' | 'boolean' | 'entity';
  /** Whether this column is sortable */
  sortable?: boolean;
  /** API-level sort key (defaults to key) */
  sortKey?: string;
  /** Whether this column is filterable */
  filterable?: boolean;
  /** Map to API query param for filtering */
  filterParamKey?: string;
  /** Enum options for enum type columns */
  enumOptions?: { value: string; labelKey: string }[];
  /** Shown by default before preferences load */
  defaultVisible?: boolean;
  /** Custom cell renderer */
  render: (item: T) => ReactNode;
  /** Optional mobile card renderer (defaults to render) */
  renderCard?: (item: T) => ReactNode;
  /** Optional header CSS class */
  headerClassName?: string;
  /** Optional cell CSS class */
  cellClassName?: string;
}

export interface DataTableProps<T> {
  /** Preference storage key (e.g., 'workItems') */
  pageKey: string;
  /** Column definitions */
  columns: ColumnDef<T>[];
  /** Data items */
  items: T[];
  /** Total items across all pages */
  totalItems: number;
  /** Total number of pages */
  totalPages: number;
  /** Current page number */
  currentPage: number;
  /** Page size */
  pageSize?: number;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error?: string;
  /** Get unique key for each row */
  getRowKey: (item: T) => string;
  /** Row click handler */
  onRowClick?: (item: T) => void;
  /** Row actions renderer (three-dot menu, buttons, etc.) */
  renderActions?: (item: T) => ReactNode;
  /** Current table state (from useTableState) */
  tableState: TableState;
  /** Sort change handler */
  onSortChange: (field: string) => void;
  /** Page change handler */
  onPageChange: (page: number) => void;
  /** Column visibility state */
  visibleColumns: string[];
  /** Column visibility toggle */
  onToggleColumn: (key: string) => void;
  /** Optional header content above table (summary cards, etc.) */
  headerContent?: ReactNode;
  /** Empty state config */
  emptyState?: {
    noData: { title: string; description?: string; action?: ReactNode };
    noResults: { title: string; description?: string; action?: ReactNode };
  };
  /** Whether data has active filters/search */
  hasActiveFilters?: boolean;
  /** Selected row index for keyboard navigation */
  selectedIndex?: number;
  /** Get title field for mobile card header */
  getCardTitle?: (item: T) => string;
  /** Additional CSS class for the wrapper */
  className?: string;
}

export function DataTable<T>({
  pageKey,
  columns,
  items,
  totalItems,
  totalPages,
  currentPage,
  pageSize = 25,
  isLoading,
  error,
  getRowKey,
  onRowClick,
  renderActions,
  tableState,
  onSortChange,
  onPageChange,
  visibleColumns,
  onToggleColumn,
  headerContent,
  emptyState,
  hasActiveFilters,
  selectedIndex,
  getCardTitle,
  className,
}: DataTableProps<T>) {
  const { t } = useTranslation('common');

  // Filter columns by visibility
  const activeColumns = columns.filter((col) => visibleColumns.includes(col.key));

  // Initial loading state
  if (isLoading && items.length === 0) {
    return (
      <div className={`${styles.wrapper} ${className || ''}`}>
        {headerContent}
        <div className={styles.skeletonContainer}>
          <Skeleton lines={5} />
        </div>
      </div>
    );
  }

  // Empty state
  if (!isLoading && items.length === 0 && emptyState) {
    const state = hasActiveFilters ? emptyState.noResults : emptyState.noData;
    return (
      <div className={`${styles.wrapper} ${className || ''}`}>
        {headerContent}
        <div className={styles.emptyState}>
          <h2 className={styles.emptyStateTitle}>{state.title}</h2>
          {state.description && (
            <p className={styles.emptyStateDescription}>{state.description}</p>
          )}
          {state.action}
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.wrapper} ${className || ''}`}>
      {headerContent}

      {/* Column settings */}
      <div className={styles.tableToolbar}>
        <DataTableColumnSettings
          columns={columns}
          visibleColumns={visibleColumns}
          onToggleColumn={onToggleColumn}
        />
      </div>

      {/* Desktop table view */}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <DataTableHeader
            columns={activeColumns}
            sortState={tableState.sort}
            onSortChange={onSortChange}
            hasActions={!!renderActions}
          />
          <tbody>
            {items.map((item, index) => (
              <DataTableRow
                key={getRowKey(item)}
                item={item}
                columns={activeColumns}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                renderActions={renderActions}
                isSelected={selectedIndex === index}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className={styles.cardsContainer}>
        {items.map((item) => (
          <DataTableCard
            key={getRowKey(item)}
            item={item}
            columns={activeColumns}
            onClick={onRowClick ? () => onRowClick(item) : undefined}
            renderActions={renderActions}
            getTitle={getCardTitle}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}

export default DataTable;
