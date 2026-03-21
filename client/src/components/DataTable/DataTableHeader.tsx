import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef, TableState } from './DataTable.js';
import { DataTableFilterPopover } from './DataTableFilterPopover.js';
import styles from './DataTable.module.css';

export interface DataTableHeaderProps<T> {
  columns: ColumnDef<T>[];
  visibleColumns: Set<string>;
  tableState: TableState;
  onSort: (columnKey: string, columnSortKey?: string) => void;
  onFilter: (paramKey: string, value: string | null) => void;
}

/**
 * Table header with sortable columns and per-column filter buttons
 */
export function DataTableHeader<T>({
  columns,
  visibleColumns,
  tableState,
  onSort,
  onFilter,
}: DataTableHeaderProps<T>) {
  const { t } = useTranslation('common');
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null);
  const filterTriggerRefs = useRef<Record<string, HTMLButtonElement>>({});

  const visibleCols = columns.filter((col) => visibleColumns.has(col.key));

  const renderSortIcon = (columnKey: string, columnSortKey?: string) => {
    const sortKey = columnSortKey || columnKey;
    if (tableState.sortBy !== sortKey) return null;
    if (tableState.sortDir === 'asc') return ' ↑';
    if (tableState.sortDir === 'desc') return ' ↓';
    return null;
  };

  const getSortAttribute = (columnKey: string, columnSortKey?: string) => {
    const sortKey = columnSortKey || columnKey;
    if (tableState.sortBy !== sortKey) return 'none';
    if (tableState.sortDir === 'asc') return 'ascending';
    if (tableState.sortDir === 'desc') return 'descending';
    return 'none';
  };

  return (
    <thead>
      <tr>
        {visibleCols.map((col) => (
          <th
            key={col.key}
            className={`${styles.tableHeader} ${
              col.sortable ? styles.tableHeaderSortable : ''
            } ${col.headerClassName || ''}`}
            onClick={() => col.sortable && onSort(col.key, col.sortKey)}
            aria-sort={getSortAttribute(col.key, col.sortKey)}
          >
            <div className={styles.tableHeaderContent}>
              <span className={styles.tableHeaderLabel}>
                {col.label}
                {renderSortIcon(col.key, col.sortKey)}
              </span>
              {col.filterable && col.filterParamKey && col.filterType && (
                <button
                  ref={(el) => {
                    if (el) filterTriggerRefs.current[col.key] = el;
                  }}
                  type="button"
                  className={`${styles.tableHeaderFilterButton} ${
                    tableState.filters.has(col.filterParamKey || '')
                      ? styles.tableHeaderFilterButtonActive
                      : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveFilterColumn(activeFilterColumn === col.key ? null : col.key);
                  }}
                  aria-label={t('dataTable.filter.filterByColumn', { column: col.label })}
                  title={t('dataTable.filter.filterByColumn', { column: col.label })}
                >
                  🔽
                </button>
              )}
            </div>

            {activeFilterColumn === col.key &&
              col.filterable &&
              col.filterParamKey &&
              col.filterType &&
              filterTriggerRefs.current[col.key] && (
                <DataTableFilterPopover
                  column={col}
                  value={tableState.filters.get(col.filterParamKey)?.value || ''}
                  onApply={(value) => {
                    onFilter(col.filterParamKey || '', value || null);
                    setActiveFilterColumn(null);
                  }}
                  triggerRect={filterTriggerRefs.current[col.key].getBoundingClientRect()}
                />
              )}
          </th>
        ))}
      </tr>
    </thead>
  );
}
