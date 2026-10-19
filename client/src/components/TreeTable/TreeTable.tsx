import { useId, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import type { ReorderSource } from '../ReferenceList/useReorder.js';
import styles from './TreeTable.module.css';
import { TreeTableGroup } from './TreeTableGroup.js';
import type { TreeTableShared } from './TreeTableGroup.js';

export interface TreeTableColumn {
  readonly id: string;
  /** Already translated: the column header and the label of each cell. */
  readonly label: string;
}

export interface TreeTableCell {
  /** Line 1 of the cell (from 768 px). */
  readonly content: ReactNode;
  /** Line 2 of the cell (from 768 px). */
  readonly detail?: ReactNode;
  /** Replaces `content` + `detail` below 768 px. */
  readonly phoneContent?: ReactNode;
  readonly muted?: boolean;
}

export interface TreeTableRow {
  readonly id: string;
  readonly parentId: string | null;
  /** Plain text for aria labels and announcements. */
  readonly label: string;
  /** Name cell content (e.g. with highlighting); defaults to `label`. */
  readonly name?: ReactNode;
  /** Dot fill; `null` or absent renders an empty dot. */
  readonly color?: string | null;
  readonly cells: readonly TreeTableCell[];
  /** Rendered first among its parent's children, with no toggle, handle or actions. */
  readonly quiet?: boolean;
  /** An ancestor shown only as context. */
  readonly muted?: boolean;
}

export interface TreeTableLabels {
  /** aria-label of the root list. */
  readonly tree: string;
  readonly nameHeader: string;
  /** aria-label of a nested list. */
  readonly group: (parent: string) => string;
  /** aria-label of a row's expand/collapse button. */
  readonly toggle: (label: string) => string;
  /** aria-label of a row's reorder handle. */
  readonly reorder: (label: string) => string;
  readonly reorderInstructions: string;
  readonly reorderDisabledHint: string;
  /** Spoken after each keyboard step or drop. */
  readonly position: (values: {
    name: string;
    position: number;
    total: number;
    parentLabel: string | null;
  }) => string;
}

export interface TreeTableProps {
  /** Rows in display order: siblings keep the order in which they appear. */
  readonly rows: readonly TreeTableRow[];
  readonly columns: readonly TreeTableColumn[];
  readonly labels: TreeTableLabels;
  readonly isExpanded: (id: string) => boolean;
  readonly onToggle: (id: string) => void;
  readonly reorderDisabled: boolean;
  /** A finished move among the children of `parentId`: their full id list in the new order. */
  readonly onReorder: (
    parentId: string | null,
    ids: string[],
    movedId: string,
    source: ReorderSource,
  ) => void;
  /** Page-level polite announcement. */
  readonly onAnnounce: (message: string) => void;
  /** Content of the actions cell of a (non-quiet) row. */
  readonly renderActions: (row: TreeTableRow) => ReactNode;
  readonly testIdPrefix: string;
}

/**
 * A tree of rows in nested lists: per row a toggle, colour dot, name and one cell per column.
 * Siblings reorder by pointer drag or keyboard (never across parents). From 768 px the cells form
 * columns under a header; below, they wrap into a line under the name and the handle is hidden.
 * All text comes from props.
 */
export function TreeTable({
  rows,
  columns,
  labels,
  isExpanded,
  onToggle,
  reorderDisabled,
  onReorder,
  onAnnounce,
  renderActions,
  testIdPrefix,
}: TreeTableProps) {
  const baseId = useId();
  const wide = useMediaQuery('(min-width: 768px)');

  const { childrenOf, byId } = useMemo(() => {
    const children = new Map<string | null, TreeTableRow[]>();
    const index = new Map<string, TreeTableRow>();
    for (const row of rows) {
      index.set(row.id, row);
      const list = children.get(row.parentId);
      if (list) list.push(row);
      else children.set(row.parentId, [row]);
    }
    return { childrenOf: children, byId: index };
  }, [rows]);

  const shared: TreeTableShared = {
    columns,
    labels,
    isExpanded,
    onToggle,
    reorderDisabled,
    onReorder,
    onAnnounce,
    renderActions,
    testIdPrefix,
    childrenOf,
    byId,
    baseId,
    wide,
    instructionsId: `${baseId}-instructions`,
    hintId: `${baseId}-hint`,
  };

  return (
    <div className={styles.table}>
      <span hidden id={shared.instructionsId}>
        {labels.reorderInstructions}
      </span>
      <span hidden id={shared.hintId}>
        {labels.reorderDisabledHint}
      </span>
      {wide && (
        <div className={styles.header} aria-hidden="true" data-testid={`${testIdPrefix}-header`}>
          <span className={styles.headerSpacer} />
          <span className={styles.headerName}>{labels.nameHeader}</span>
          <span className={styles.cells}>
            {columns.map((column) => (
              <span key={column.id} className={styles.headerCell}>
                {column.label}
              </span>
            ))}
          </span>
          <span className={styles.headerSpacer} />
        </div>
      )}
      <TreeTableGroup parentId={null} depth={0} shared={shared} ariaLabel={labels.tree} />
    </div>
  );
}

export default TreeTable;
