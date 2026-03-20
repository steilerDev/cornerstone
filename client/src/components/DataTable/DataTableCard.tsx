import type { ReactNode } from 'react';
import type { ColumnDef } from './DataTable.js';
import styles from './DataTable.module.css';

interface DataTableCardProps<T> {
  item: T;
  columns: ColumnDef<T>[];
  onClick?: () => void;
  renderActions?: (item: T) => ReactNode;
  getTitle?: (item: T) => string;
}

export function DataTableCard<T>({
  item,
  columns,
  onClick,
  renderActions,
  getTitle,
}: DataTableCardProps<T>) {
  // Use first column as title if getTitle not provided
  const titleColumn = columns[0];
  const title = getTitle ? getTitle(item) : undefined;
  const bodyColumns = getTitle ? columns : columns.slice(1);

  return (
    <div
      className={`${styles.card} ${onClick ? styles.cardClickable : ''}`}
      onClick={onClick}
    >
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>
          {title ?? (titleColumn ? titleColumn.render(item) : '')}
        </h3>
        {renderActions && (
          <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
            {renderActions(item)}
          </div>
        )}
      </div>
      <div className={styles.cardBody}>
        {bodyColumns.map((column) => (
          <div key={column.key} className={styles.cardRow}>
            <span className={styles.cardLabel}>{column.label}</span>
            <span className={styles.cardValue}>
              {column.renderCard ? column.renderCard(item) : column.render(item)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DataTableCard;
