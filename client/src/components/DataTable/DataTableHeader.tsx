import { useTranslation } from 'react-i18next';
import type { ColumnDef } from './DataTable.js';
import type { SortState } from '../../hooks/useTableState.js';
import styles from './DataTable.module.css';

interface DataTableHeaderProps<T> {
  columns: ColumnDef<T>[];
  sortState: SortState;
  onSortChange: (field: string) => void;
  hasActions: boolean;
}

export function DataTableHeader<T>({
  columns,
  sortState,
  onSortChange,
  hasActions,
}: DataTableHeaderProps<T>) {
  const { t } = useTranslation('common');

  const renderSortIcon = (column: ColumnDef<T>) => {
    const sortKey = column.sortKey || column.key;
    if (sortState.sortBy !== sortKey) return null;
    return sortState.sortOrder === 'asc' ? ' \u2191' : ' \u2193';
  };

  return (
    <thead>
      <tr>
        {columns.map((column) => {
          const sortKey = column.sortKey || column.key;
          const isSortable = column.sortable;
          const isSorted = sortState.sortBy === sortKey;

          return (
            <th
              key={column.key}
              className={`${isSortable ? styles.sortableHeader : ''} ${column.headerClassName || ''}`}
              onClick={isSortable ? () => onSortChange(sortKey) : undefined}
              aria-sort={
                isSorted
                  ? sortState.sortOrder === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : undefined
              }
            >
              {column.label}
              {isSortable && renderSortIcon(column)}
            </th>
          );
        })}
        {hasActions && (
          <th className={styles.actionsColumn}>{t('button.edit')}</th>
        )}
      </tr>
    </thead>
  );
}

export default DataTableHeader;
