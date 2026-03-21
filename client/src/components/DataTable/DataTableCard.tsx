import type { ColumnDef } from './DataTable.js';
import styles from './DataTable.module.css';

export interface DataTableCardProps<T> {
  item: T;
  columns: ColumnDef<T>[];
  visibleColumns: Set<string>;
  onClick?: () => void;
  renderActions?: (item: T) => React.ReactNode;
}

/**
 * Mobile card renderer for a single item
 * Uses renderCard if available, falls back to render
 */
export function DataTableCard<T>({
  item,
  columns,
  visibleColumns,
  onClick,
  renderActions,
}: DataTableCardProps<T>) {
  const visibleCols = columns.filter((col) => visibleColumns.has(col.key));

  return (
    <div className={styles.card} onClick={onClick}>
      <div className={styles.cardHeader}>
        <div className={styles.cardContent}>
          {visibleCols.map((col) => {
            // Use renderCard if available, otherwise use render
            const content =
              col.renderCard && col.renderCard(item) !== null && col.renderCard(item) !== undefined
                ? col.renderCard(item)
                : col.render(item) ?? '—';

            return (
              <div key={col.key} className={styles.cardRow}>
                <span className={styles.cardLabel}>{col.label}</span>
                <span className={styles.cardValue}>{content}</span>
              </div>
            );
          })}
        </div>
        {renderActions && (
          <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
            {renderActions(item)}
          </div>
        )}
      </div>
    </div>
  );
}
