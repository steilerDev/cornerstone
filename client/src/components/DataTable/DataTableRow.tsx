import type { ReactNode } from 'react';
import type { ColumnDef } from './DataTable.js';
import styles from './DataTable.module.css';

interface DataTableRowProps<T> {
  item: T;
  columns: ColumnDef<T>[];
  onClick?: () => void;
  renderActions?: (item: T) => ReactNode;
  isSelected?: boolean;
}

export function DataTableRow<T>({
  item,
  columns,
  onClick,
  renderActions,
  isSelected,
}: DataTableRowProps<T>) {
  return (
    <tr
      className={`${onClick ? styles.tableRow : ''} ${isSelected ? styles.tableRowSelected : ''}`}
      onClick={onClick}
    >
      {columns.map((column) => (
        <td key={column.key} className={column.cellClassName || ''}>
          {column.render(item)}
        </td>
      ))}
      {renderActions && (
        <td className={styles.actionsCell} onClick={(e) => e.stopPropagation()}>
          {renderActions(item)}
        </td>
      )}
    </tr>
  );
}

export default DataTableRow;
