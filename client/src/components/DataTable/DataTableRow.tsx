import type { ReactNode } from 'react';
import type { ColumnDef } from './DataTable.js';
import styles from './DataTable.module.css';

export interface DataTableRowProps<T> {
  item: T;
  columns: ColumnDef<T>[];
  visibleColumns: Set<string>;
  isSelected?: boolean;
  onClick?: () => void;
  renderActions?: (item: T) => React.ReactNode;
  /**
   * Optional leading cell (e.g. an expand/collapse toggle). When passed at all
   * (including `null`), a 44px leading <td> is rendered so rows with and without
   * children keep identical column alignment. Omit entirely for plain rows.
   */
  leadingCell?: ReactNode;
}

/**
 * Single table row renderer
 * Renders null values as em-dash
 */
export function DataTableRow<T>({
  item,
  columns,
  visibleColumns,
  isSelected = false,
  onClick,
  renderActions,
  leadingCell,
}: DataTableRowProps<T>) {
  const visibleCols = columns.filter((col) => visibleColumns.has(col.key));

  return (
    <tr
      className={`${styles.tableRow} ${isSelected ? styles.tableRowSelected : ''}`}
      onClick={onClick}
      tabIndex={onClick ? 0 : -1}
    >
      {leadingCell !== undefined && <td className={styles.expandCell}>{leadingCell}</td>}
      {visibleCols.map((col) => (
        <td key={col.key} className={`${styles.tableCell} ${col.className || ''}`}>
          {col.render(item) ?? '—'}
        </td>
      ))}
      {renderActions && (
        <td className={styles.tableActionsCell} onClick={(e) => e.stopPropagation()}>
          {renderActions(item)}
        </td>
      )}
    </tr>
  );
}
