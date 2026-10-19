import { useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useReorder } from '../ReferenceList/useReorder.js';
import type { ReorderAnnouncementKind } from '../ReferenceList/useReorder.js';
import type {
  TreeTableColumn,
  TreeTableLabels,
  TreeTableProps,
  TreeTableRow,
} from './TreeTable.js';
import styles from './TreeTable.module.css';

/** What every group of one TreeTable shares. */
export interface TreeTableShared extends Pick<
  TreeTableProps,
  | 'isExpanded'
  | 'onToggle'
  | 'reorderDisabled'
  | 'onReorder'
  | 'onAnnounce'
  | 'renderActions'
  | 'testIdPrefix'
> {
  readonly columns: readonly TreeTableColumn[];
  readonly labels: TreeTableLabels;
  readonly childrenOf: ReadonlyMap<string | null, readonly TreeTableRow[]>;
  readonly byId: ReadonlyMap<string, TreeTableRow>;
  readonly baseId: string;
  readonly wide: boolean;
  readonly instructionsId: string;
  readonly hintId: string;
}

export interface TreeTableGroupProps {
  readonly parentId: string | null;
  /** Depth of this group's rows (0 = top level). */
  readonly depth: number;
  readonly shared: TreeTableShared;
  readonly ariaLabel: string;
  /** DOM id (nested groups; target of the parent's toggle `aria-controls`). */
  readonly id?: string;
  readonly hidden?: boolean;
}

const ANNOUNCED_KINDS: readonly ReorderAnnouncementKind[] = ['position', 'dropped'];

/** One sibling `<ul>`: its quiet row first, then the reorderable rows, each with its own group. */
export function TreeTableGroup({
  parentId,
  depth,
  shared,
  ariaLabel,
  id,
  hidden,
}: TreeTableGroupProps) {
  const {
    byId,
    childrenOf,
    labels,
    columns,
    wide,
    testIdPrefix,
    baseId,
    isExpanded,
    onToggle,
    reorderDisabled,
    renderActions,
  } = shared;
  const listRef = useRef<HTMLUListElement>(null);

  const children = childrenOf.get(parentId) ?? [];
  const quietRows = children.filter((row) => row.quiet);
  const rows = children.filter((row) => !row.quiet);
  const ids = rows.map((row) => row.id);
  const parentLabel = parentId === null ? null : (byId.get(parentId)?.label ?? null);

  const reorder = useReorder({
    ids,
    disabled: reorderDisabled,
    listRef,
    onCommit: (nextIds, movedId, source) => shared.onReorder(parentId, nextIds, movedId, source),
    onAnnounce: shared.onAnnounce,
    labelOf: (rowId) => byId.get(rowId)?.label ?? '',
    formatAnnouncement: (kind, values) =>
      ANNOUNCED_KINDS.includes(kind) ? labels.position({ ...values, parentLabel }) : undefined,
  });

  const renderCells = (row: TreeTableRow): ReactNode => (
    <div className={styles.cells}>
      {columns.map((column, index) => {
        const cell = row.cells[index];
        if (!cell) return null;
        return (
          <div
            key={column.id}
            className={styles.cell}
            data-muted={cell.muted ? 'true' : undefined}
            data-testid={`${testIdPrefix}-cell-${column.id}-${row.id}`}
          >
            <span className={wide ? styles.cellLabelHidden : styles.cellLabel}>
              {column.label}{' '}
            </span>
            {wide ? (
              <>
                <span className={styles.cellContent}>{cell.content}</span>
                {cell.detail !== undefined && (
                  <span className={styles.cellDetail}>{cell.detail}</span>
                )}
              </>
            ) : (
              <span className={styles.cellContent}>{cell.phoneContent ?? cell.content}</span>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderQuiet = (row: TreeTableRow) => (
    <li key={row.id} className={styles.item} data-reorder-skip="true">
      <div
        className={styles.row}
        data-quiet="true"
        data-testid={`${testIdPrefix}-quiet-${parentId ?? 'root'}`}
        style={{ '--depth': depth } as CSSProperties}
      >
        <div className={styles.main}>
          <span className={styles.toggleSpacer} aria-hidden="true" />
          <span className={styles.dotSpacer} aria-hidden="true" />
          <span className={styles.name}>{row.name ?? row.label}</span>
        </div>
        {renderCells(row)}
      </div>
    </li>
  );

  const renderRow = (row: TreeTableRow, position: number) => {
    const { drag } = reorder;
    const dropping = drag && drag.overIndex !== drag.fromIndex && drag.overIndex === position;
    const drop = dropping ? (drag.overIndex > drag.fromIndex ? 'after' : 'before') : undefined;
    const lifted = reorder.pickedId === row.id || drag?.id === row.id;
    const hasChildren = (childrenOf.get(row.id)?.length ?? 0) > 0;
    const expanded = isExpanded(row.id);
    const groupId = `${baseId}-group-${row.id}`;
    const describedBy = reorderDisabled
      ? `${shared.instructionsId} ${shared.hintId}`
      : shared.instructionsId;

    return (
      <li key={row.id} className={styles.item} data-drop={drop}>
        <div
          className={styles.row}
          data-testid={`${testIdPrefix}-row-${row.id}`}
          data-dragging={lifted ? 'true' : undefined}
          data-muted={row.muted ? 'true' : undefined}
          style={{ '--depth': depth } as CSSProperties}
        >
          {wide && (
            <button
              type="button"
              className={styles.handle}
              aria-label={labels.reorder(row.label)}
              aria-describedby={describedBy}
              data-reorder-handle="true"
              data-testid={`${testIdPrefix}-handle-${row.id}`}
              {...reorder.handleProps(row.id)}
            >
              <span aria-hidden="true">⠿</span>
            </button>
          )}
          <div className={styles.main}>
            {hasChildren ? (
              <button
                type="button"
                className={styles.toggle}
                aria-expanded={expanded}
                aria-controls={groupId}
                aria-label={labels.toggle(row.label)}
                onClick={() => onToggle(row.id)}
                data-testid={`${testIdPrefix}-toggle-${row.id}`}
              >
                <span className={styles.chevron} aria-hidden="true" data-expanded={expanded}>
                  ›
                </span>
              </button>
            ) : (
              <span className={styles.toggleSpacer} aria-hidden="true" />
            )}
            <span
              className={styles.dot}
              aria-hidden="true"
              data-color={row.color ? 'set' : undefined}
              style={row.color ? ({ '--tree-color': row.color } as CSSProperties) : undefined}
            />
            <span className={styles.name} title={row.label} data-depth={depth}>
              {row.name ?? row.label}
            </span>
          </div>
          {renderCells(row)}
          <div className={styles.actions}>{renderActions(row)}</div>
        </div>
        {hasChildren && (
          <TreeTableGroup
            parentId={row.id}
            depth={depth + 1}
            shared={shared}
            ariaLabel={labels.group(row.label)}
            id={groupId}
            hidden={!expanded}
          />
        )}
      </li>
    );
  };

  return (
    <ul
      ref={listRef}
      id={id}
      hidden={hidden}
      className={parentId === null ? styles.rootGroup : styles.group}
      aria-label={ariaLabel}
      data-reordering={reorder.drag ? 'true' : undefined}
    >
      {quietRows.map(renderQuiet)}
      {reorder.orderedIds.map((rowId) => {
        const row = byId.get(rowId);
        return row ? renderRow(row, ids.indexOf(rowId)) : null;
      })}
    </ul>
  );
}
