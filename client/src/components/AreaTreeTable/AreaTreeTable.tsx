import { useState, useRef, useEffect, useCallback, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaBudgetSummary } from '@cornerstone/shared';
import { EmptyState } from '../EmptyState/EmptyState.js';
import styles from './AreaTreeTable.module.css';

export interface AreaTreeTableProps {
  areas: AreaBudgetSummary[];
  unassigned: { planned: number; actual: number; variance: number } | null;
  formatCurrency: (value: number) => string;
}

interface TreeNode {
  area: AreaBudgetSummary;
  depth: number;
  children: TreeNode[];
  parentId: string | null;
}

/**
 * Build a tree of areas from a flat array, maintaining original order.
 */
function buildTree(areas: AreaBudgetSummary[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();

  // First pass: create all nodes
  areas.forEach((area) => {
    const node: TreeNode = {
      area,
      depth: 0,
      children: [],
      parentId: area.parentId,
    };
    nodeMap.set(area.areaId, node);
  });

  // Second pass: build hierarchy and calculate depths
  const queue: { node: TreeNode; depth: number }[] = [];

  areas.forEach((area) => {
    const node = nodeMap.get(area.areaId)!;
    if (area.parentId === null) {
      roots.push(node);
      queue.push({ node, depth: 0 });
    }
  });

  // BFS to set depths and attach children
  while (queue.length > 0) {
    const { node, depth } = queue.shift()!;
    node.depth = depth;

    // Find all direct children
    areas.forEach((area) => {
      if (area.parentId === node.area.areaId) {
        const childNode = nodeMap.get(area.areaId)!;
        node.children.push(childNode);
        queue.push({ node: childNode, depth: depth + 1 });
      }
    });
  }

  return roots;
}

/**
 * Count total non-leaf nodes (nodes with children).
 */
function countNonLeafNodes(roots: TreeNode[]): number {
  let count = 0;
  const walk = (node: TreeNode) => {
    if (node.children.length > 0) {
      count++;
      node.children.forEach(walk);
    }
  };
  roots.forEach(walk);
  return count;
}

/**
 * Get all non-leaf node IDs (for expand all / collapse all).
 */
function getNonLeafIds(roots: TreeNode[]): string[] {
  const ids: string[] = [];
  const walk = (node: TreeNode) => {
    if (node.children.length > 0) {
      ids.push(node.area.areaId);
      node.children.forEach(walk);
    }
  };
  roots.forEach(walk);
  return ids;
}

/**
 * Inline SVG chevron (16×16).
 */
function ChevronSvg({ className }: { className: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Render a single row (area or unassigned).
 */
interface AreaRowProps {
  nodeId: string | null;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>, id: string) => void;
  formatCurrency: (value: number) => string;
  depth: number;
  hasChildren: boolean;
  isUnassigned?: boolean;
  planned: number;
  actual: number;
  variance: number;
  name: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
  rowClassName: string;
  siblings: number;
  index: number;
  expandLabel: string;
  collapseLabel: string;
}

function AreaRow({
  nodeId,
  isExpanded,
  onToggle,
  onKeyDown,
  formatCurrency,
  depth,
  hasChildren,
  isUnassigned,
  planned,
  actual,
  variance,
  name,
  buttonRef,
  rowClassName,
  siblings,
  index,
  expandLabel,
  collapseLabel,
}: AreaRowProps) {
  return (
    <tr
      role="row"
      className={rowClassName}
      aria-level={depth + 1}
      aria-setsize={siblings}
      aria-posinset={index + 1}
    >
      <td role="gridcell" className={styles.colName}>
        <div className={styles.nameContent}>
          <span
            className={styles.indent}
            style={{ width: `calc(var(--spacing-6) * ${depth})` }}
            aria-hidden="true"
          />
          {hasChildren && nodeId ? (
            <button
              ref={buttonRef}
              type="button"
              className={styles.expandBtn}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? collapseLabel : expandLabel}
              aria-controls={`area-children-${nodeId}`}
              onClick={() => onToggle(nodeId)}
              onKeyDown={(e) => onKeyDown(e, nodeId)}
            >
              <ChevronSvg className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`} />
            </button>
          ) : (
            <span className={styles.expandBtnPlaceholder} aria-hidden="true" />
          )}
          <span className={isUnassigned ? styles.unassignedName : styles.areaName}>{name}</span>
        </div>
      </td>
      <td role="gridcell" className={styles.colPlanned}>
        {formatCurrency(planned)}
      </td>
      <td role="gridcell" className={styles.colActual}>
        {formatCurrency(actual)}
      </td>
      <td
        role="gridcell"
        className={`${styles.colVariance} ${variance >= 0 ? styles.variancePositive : styles.varianceNegative}`}
      >
        {formatCurrency(variance)}
      </td>
    </tr>
  );
}

/**
 * Recursively render all visible rows.
 */
function renderVisibleRows(
  nodes: TreeNode[],
  expandedIds: Set<string>,
  onToggle: (id: string) => void,
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>, id: string) => void,
  formatCurrency: (value: number) => string,
  buttonRefs: Map<string, HTMLButtonElement | null>,
  rowClassMap: Map<string, string>,
  t: (key: string, vars?: Record<string, string>) => string,
): React.ReactNode[] {
  const rows: React.ReactNode[] = [];

  const walk = (node: TreeNode, siblings: number, index: number) => {
    const rowClass = rowClassMap.get(node.area.areaId) || styles.rowRoot;
    const isExpanded = expandedIds.has(node.area.areaId);
    const expandLabel = t('overview.areaBreakdown.expandArea', { name: node.area.name });
    const collapseLabel = t('overview.areaBreakdown.collapseArea', { name: node.area.name });

    rows.push(
      <AreaRow
        key={node.area.areaId}
        nodeId={node.area.areaId}
        isExpanded={isExpanded}
        onToggle={onToggle}
        onKeyDown={onKeyDown}
        formatCurrency={formatCurrency}
        depth={node.depth}
        hasChildren={node.children.length > 0}
        planned={node.area.planned}
        actual={node.area.actual}
        variance={node.area.variance}
        name={node.area.name}
        buttonRef={(el) => {
          if (el) buttonRefs.set(node.area.areaId, el);
        }}
        rowClassName={rowClass}
        siblings={siblings}
        index={index}
        expandLabel={expandLabel}
        collapseLabel={collapseLabel}
      />,
    );

    // Render children if expanded
    if (isExpanded) {
      node.children.forEach((child, childIdx) => {
        walk(child, node.children.length, childIdx);
      });
    }
  };

  nodes.forEach((node, idx) => {
    walk(node, nodes.length, idx);
  });

  return rows;
}

/**
 * Main AreaTreeTable Component
 */
export function AreaTreeTable({ areas, unassigned, formatCurrency }: AreaTreeTableProps) {
  const { t } = useTranslation('budget');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState('');
  const buttonRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  // Build tree
  const roots = buildTree(areas);
  const nonLeafCount = countNonLeafNodes(roots);
  const allNonLeafIds = getNonLeafIds(roots);
  const showExpandAll = nonLeafCount > 1;

  // Determine row classes
  const rowClassMap = new Map<string, string>();
  const walk = (node: TreeNode) => {
    rowClassMap.set(node.area.areaId, node.depth === 0 ? styles.rowRoot : styles.rowChild);
    node.children.forEach(walk);
  };
  roots.forEach(walk);

  // Create area ID to node map for parent lookups
  const nodeIdMap = new Map<string, TreeNode>();
  const mapWalk = (node: TreeNode) => {
    nodeIdMap.set(node.area.areaId, node);
    node.children.forEach(mapWalk);
  };
  roots.forEach(mapWalk);

  // Toggle expand/collapse
  const toggle = (id: string) => {
    const next = new Set(expandedIds);
    const wasExpanded = next.has(id);
    if (wasExpanded) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedIds(next);

    // Set announcement for screen reader
    const area = areas.find((a) => a.areaId === id);
    if (area) {
      if (wasExpanded) {
        setAnnouncement(t('overview.areaBreakdown.collapsed', { name: area.name }));
      } else {
        setAnnouncement(t('overview.areaBreakdown.expanded', { name: area.name }));
      }
      // Reset announcement after a delay
      setTimeout(() => setAnnouncement(''), 300);
    }
  };

  // Expand all / collapse all
  const handleExpandAll = () => {
    if (expandedIds.size === allNonLeafIds.length) {
      // All expanded, collapse all
      setExpandedIds(new Set());
    } else {
      // Expand all
      setExpandedIds(new Set(allNonLeafIds));
    }
  };

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, nodeId: string) => {
      const allButtons = Array.from(buttonRefs.current.entries())
        .filter(([, btn]) => btn !== null)
        .map(([id]) => id);

      if (allButtons.length === 0) return;

      const currentIdx = allButtons.indexOf(nodeId);
      if (currentIdx === -1) return;

      const node = nodeIdMap.get(nodeId);
      if (!node) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (currentIdx < allButtons.length - 1) {
            buttonRefs.current.get(allButtons[currentIdx + 1])?.focus();
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (currentIdx > 0) {
            buttonRefs.current.get(allButtons[currentIdx - 1])?.focus();
          }
          break;
        case 'Home':
          e.preventDefault();
          buttonRefs.current.get(allButtons[0])?.focus();
          break;
        case 'End':
          e.preventDefault();
          buttonRefs.current.get(allButtons[allButtons.length - 1])?.focus();
          break;
        case 'ArrowRight': {
          e.preventDefault();
          const isExpanded = expandedIds.has(nodeId);
          if (!isExpanded && node.children.length > 0) {
            // Collapsed with children — expand
            toggle(nodeId);
          } else if (isExpanded && node.children.length > 0) {
            // Expanded — focus first child if it has a button
            const firstChildId = node.children[0]?.area.areaId;
            if (firstChildId) {
              const childButton = buttonRefs.current.get(firstChildId);
              if (childButton) {
                childButton.focus();
              }
            }
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          const isExpanded = expandedIds.has(nodeId);
          if (isExpanded) {
            // Expanded — collapse
            toggle(nodeId);
          } else if (node.parentId) {
            // Collapsed and has parent — focus parent
            const parentBtn = buttonRefs.current.get(node.parentId);
            if (parentBtn) {
              parentBtn.focus();
            }
          }
          break;
        }
      }
    },
    [expandedIds, areas, nodeIdMap],
  );

  // Empty state
  if (areas.length === 0 && !unassigned) {
    return (
      <section className={styles.treeCard} aria-labelledby="area-breakdown-heading">
        <h2 id="area-breakdown-heading" className={styles.treeTitle}>
          {t('overview.areaBreakdown.title')}
        </h2>
        <EmptyState icon="📁" message={t('overview.areaBreakdown.emptyMessage')} />
      </section>
    );
  }

  return (
    <section className={styles.treeCard} aria-labelledby="area-breakdown-heading">
      {/* Header with title and expand/collapse all */}
      <div className={styles.treeHeader}>
        <h2 id="area-breakdown-heading" className={styles.treeTitle}>
          {t('overview.areaBreakdown.title')}
        </h2>
        {showExpandAll && (
          <button
            type="button"
            className={styles.expandAllBtn}
            onClick={handleExpandAll}
            aria-label={
              expandedIds.size === allNonLeafIds.length
                ? t('overview.areaBreakdown.collapseAll')
                : t('overview.areaBreakdown.expandAll')
            }
          >
            {expandedIds.size === allNonLeafIds.length
              ? t('overview.areaBreakdown.collapseAll')
              : t('overview.areaBreakdown.expandAll')}
          </button>
        )}
      </div>

      {/* Screen reader live region */}
      <span role="status" aria-atomic="true" className={styles.srOnly}>
        {announcement}
      </span>

      {/* Table */}
      <div className={styles.tableWrapper}>
        <table className={styles.table} role="treegrid">
          <caption className={styles.srOnly}>{t('overview.areaBreakdown.tableCaption')}</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.colName} role="columnheader">
                {t('overview.areaBreakdown.colName')}
              </th>
              <th scope="col" className={styles.colPlanned} role="columnheader">
                {t('overview.areaBreakdown.colPlanned')}
              </th>
              <th scope="col" className={styles.colActual} role="columnheader">
                {t('overview.areaBreakdown.colActual')}
              </th>
              <th scope="col" className={styles.colVariance} role="columnheader">
                {t('overview.areaBreakdown.colVariance')}
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Render all visible area rows */}
            {renderVisibleRows(
              roots,
              expandedIds,
              toggle,
              handleKeyDown,
              formatCurrency,
              buttonRefs.current,
              rowClassMap,
              t,
            ).map((row, idx) => (
              <Fragment key={idx}>{row}</Fragment>
            ))}

            {/* Unassigned row */}
            {unassigned && (
              <tr
                role="row"
                className={styles.rowUnassigned}
                aria-level={1}
                aria-setsize={1}
                aria-posinset={1}
              >
                <td role="gridcell" className={styles.colName}>
                  <div className={styles.nameContent}>
                    <span
                      className={styles.indent}
                      style={{ width: 'calc(var(--spacing-6) * 0)' }}
                      aria-hidden="true"
                    />
                    <span className={styles.expandBtnPlaceholder} aria-hidden="true" />
                    <span className={styles.unassignedName}>
                      {t('overview.areaBreakdown.unassignedBucket')}
                    </span>
                  </div>
                </td>
                <td role="gridcell" className={styles.colPlanned}>
                  {formatCurrency(unassigned.planned)}
                </td>
                <td role="gridcell" className={styles.colActual}>
                  {formatCurrency(unassigned.actual)}
                </td>
                <td
                  role="gridcell"
                  className={`${styles.colVariance} ${
                    unassigned.variance >= 0 ? styles.variancePositive : styles.varianceNegative
                  }`}
                >
                  {formatCurrency(unassigned.variance)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default AreaTreeTable;
