import type { ReactNode } from 'react';
import type { ColumnDef } from './DataTable.js';
import styles from './DataTable.module.css';

export interface DataTableCardProps<T> {
  item: T;
  columns: ColumnDef<T>[];
  visibleColumns: Set<string>;
  onClick?: () => void;
  renderActions?: (item: T) => React.ReactNode;
  /** Optional expand/collapse toggle rendered alongside the card content. */
  expandButton?: ReactNode;
  /** Content rendered inside the card's children container (child rows for mobile). */
  childrenContent?: ReactNode;
  /** `id` for the children container, referenced by `expandButton`'s `aria-controls`. */
  childrenId?: string;
  /** Whether the children container is currently expanded (controls its `hidden` state). */
  childrenExpanded?: boolean;
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
  expandButton,
  childrenContent,
  childrenId,
  childrenExpanded,
}: DataTableCardProps<T>) {
  const visibleCols = columns.filter((col) => visibleColumns.has(col.key));

  const cardContent = (
    <div className={styles.cardContent}>
      {visibleCols.map((col) => {
        // Use renderCard if available, otherwise use render
        const content = col.renderCard ? col.renderCard(item) : col.render(item);
        if (content === null) return null;

        return (
          <div key={col.key} className={styles.cardRow}>
            <span className={styles.cardLabel}>{col.label}</span>
            <span className={styles.cardValue}>{content ?? '—'}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className={styles.card} onClick={onClick} tabIndex={onClick ? 0 : -1}>
      <div className={styles.cardHeader}>
        {expandButton ? (
          <div className={styles.cardHeaderRow}>
            {expandButton}
            {cardContent}
          </div>
        ) : (
          cardContent
        )}
        {renderActions && (
          <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
            {renderActions(item)}
          </div>
        )}
      </div>
      {childrenContent && (
        <div id={childrenId} className={styles.cardChildren} hidden={!childrenExpanded}>
          {childrenContent}
        </div>
      )}
    </div>
  );
}
