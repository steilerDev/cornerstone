import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  BudgetSourceBudgetLinesResponse,
  BudgetSourceBudgetLine,
  ConfidenceLevel,
} from '@cornerstone/shared';
import type { AreaAncestor } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import { Badge } from '../Badge/Badge.js';
import type { BadgeVariantMap } from '../Badge/Badge.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { TriStateCheckbox } from '../TriStateCheckbox/TriStateCheckbox.js';
import styles from './SourceBudgetLinePanel.module.css';

interface SourceBudgetLinePanelProps {
  sourceId: string;
  sourceName: string;
  data: BudgetSourceBudgetLinesResponse | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  selectedLineIds?: Set<string>;
  onSelectionChange?: (newSet: Set<string>) => void;
  onMoveLines?: () => void;
}

interface ParentGroup {
  parentId: string;
  parentName: string;
  lines: BudgetSourceBudgetLine[];
}

interface AreaNode {
  areaId: string | null;
  areaName: string;
  areaColor: string | null;
  depth: number;
  ancestors: AreaAncestor[];
  parentGroups: ParentGroup[];
  totalLines: number;
  children: AreaNode[];
}

interface AreaGroup {
  areaId: string | null;
  areaName: string;
  areaColor: string | null;
  depth: number;
  ancestors: AreaAncestor[];
  parentGroups: ParentGroup[];
  totalLines: number;
}

// Group lines by parent within an area
function buildParentGroups(lines: BudgetSourceBudgetLine[]): ParentGroup[] {
  const parentMap = new Map<string, { name: string; lines: BudgetSourceBudgetLine[] }>();

  for (const line of lines) {
    const parentKey = line.parentId;
    if (!parentMap.has(parentKey)) {
      parentMap.set(parentKey, { name: line.parentName, lines: [] });
    }
    parentMap.get(parentKey)!.lines.push(line);
  }

  // Sort each parent's lines by createdAt ascending
  for (const pg of parentMap.values()) {
    pg.lines.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  // Return sorted by parent name
  return Array.from(parentMap.entries())
    .map(([id, data]) => ({
      parentId: id,
      parentName: data.name,
      lines: data.lines,
    }))
    .sort((a, b) => a.parentName.localeCompare(b.parentName));
}

// Build a hierarchical area tree from lines
function buildAreaTree(lines: BudgetSourceBudgetLine[]): AreaNode[] {
  const areaMap = new Map<
    string | null,
    {
      name: string;
      color: string | null;
      ancestors: AreaAncestor[];
      lines: BudgetSourceBudgetLine[];
    }
  >();

  // Collect all unique areas (including ancestors)
  const allAreaIds = new Set<string>();
  for (const line of lines) {
    if (line.area?.id) {
      allAreaIds.add(line.area.id);
      for (const ancestor of line.area.ancestors ?? []) {
        allAreaIds.add(ancestor.id);
      }
    }
  }

  // Initialize area map with all areas
  for (const line of lines) {
    const areaKey = line.area?.id ?? null;
    if (!areaMap.has(areaKey)) {
      if (areaKey === null) {
        // Unassigned bucket
        areaMap.set(null, {
          name: '',
          color: null,
          ancestors: [],
          lines: [],
        });
      } else {
        // Named area
        areaMap.set(areaKey, {
          name: line.area!.name,
          color: line.area!.color,
          ancestors: line.area!.ancestors ?? [],
          lines: [],
        });
      }
    }
  }

  // Add ancestor-only areas (areas without lines but that are parents of areas with lines)
  for (const areaId of allAreaIds) {
    if (!areaMap.has(areaId)) {
      // Find any line that has this area as an ancestor
      for (const line of lines) {
        const chain = line.area?.ancestors ?? [];
        const idx = chain.findIndex((a) => a.id === areaId);
        if (idx >= 0) {
          areaMap.set(areaId, {
            name: chain[idx].name,
            color: chain[idx].color,
            ancestors: chain.slice(0, idx),
            lines: [],
          });
          break;
        }
      }
    }
  }

  // Assign lines to their areas
  for (const line of lines) {
    const areaKey = line.area?.id ?? null;
    if (areaMap.has(areaKey)) {
      areaMap.get(areaKey)!.lines.push(line);
    }
  }

  // Build parent→children map
  const parentMap = new Map<string | null, string[]>();
  for (const [areaId, data] of areaMap.entries()) {
    if (areaId === null) continue;
    const parentId =
      data.ancestors.length > 0 ? data.ancestors[data.ancestors.length - 1].id : null;
    if (!parentMap.has(parentId)) {
      parentMap.set(parentId, []);
    }
    parentMap.get(parentId)!.push(areaId);
  }

  // Build tree recursively
  const buildNode = (areaId: string | null, depth: number): AreaNode => {
    const data = areaMap.get(areaId);
    if (!data) {
      return {
        areaId,
        areaName: '',
        areaColor: null,
        depth,
        ancestors: [],
        parentGroups: [],
        totalLines: 0,
        children: [],
      };
    }

    const childAreaIds = parentMap.get(areaId) ?? [];
    const children = childAreaIds
      .sort((a, b) => areaMap.get(a)!.name.localeCompare(areaMap.get(b)!.name))
      .map((childId) => buildNode(childId, depth + 1));

    return {
      areaId,
      areaName: data.name,
      areaColor: data.color,
      depth,
      ancestors: data.ancestors,
      parentGroups: buildParentGroups(data.lines),
      totalLines: data.lines.length,
      children,
    };
  };

  // Get root areas (those with no parent) — exclude unassigned for now
  const namedRootAreaIds = Array.from(areaMap.entries())
    .filter(([areaId]) => areaId !== null && areaMap.get(areaId)!.ancestors.length === 0)
    .map(([areaId]) => areaId)
    .sort((a, b) => areaMap.get(a)!.name.localeCompare(areaMap.get(b)!.name));

  // Build tree for named areas
  const namedTree = namedRootAreaIds.map((areaId) => buildNode(areaId, 0));

  // Add unassigned bucket last
  const tree: AreaNode[] = [
    ...namedTree,
    ...(areaMap.get(null) && areaMap.get(null)!.lines.length > 0 ? [buildNode(null, 0)] : []),
  ];

  return tree;
}

// Flatten area tree to AreaGroup[] for rendering
function flattenAreaTree(nodes: AreaNode[]): AreaGroup[] {
  const result: AreaGroup[] = [];

  const traverse = (node: AreaNode) => {
    result.push({
      areaId: node.areaId,
      areaName: node.areaName,
      areaColor: node.areaColor,
      depth: node.depth,
      ancestors: node.ancestors,
      parentGroups: node.parentGroups,
      totalLines: node.totalLines,
    });
    for (const child of node.children) {
      traverse(child);
    }
  };

  for (const node of nodes) {
    traverse(node);
  }

  return result;
}

// Helper to get the localized invoice status label
function getInvoiceStatusLabel(line: BudgetSourceBudgetLine, t: (key: string) => string): string {
  if (line.invoiceLink === null) {
    return t('sources.lines.invoiceStatus.none');
  }
  const status = line.invoiceLink.invoiceStatus;
  const statusKey = `sources.lines.invoiceStatus.${status}`;
  const translated = t(statusKey);
  // If translation key not found, t() returns the key itself; fallback to the status
  return translated.startsWith('sources.lines.invoiceStatus') ? status : translated;
}

// Helper to get the confidence label
function getConfidenceLabel(line: BudgetSourceBudgetLine, t: (key: string) => string): string {
  const confidenceKey = `sources.lines.confidence.${line.confidence}`;
  return t(confidenceKey);
}

// Helper to collect all descendant line IDs from an area and its children (recursive)
function getAreaSubtreeLineIds(areaTree: AreaNode[], targetAreaId: string | null): Set<string> {
  const lineIds = new Set<string>();

  const traverse = (node: AreaNode) => {
    if (node.areaId === targetAreaId) {
      // Found the target; collect all lines in this subtree
      const collect = (n: AreaNode) => {
        for (const pg of n.parentGroups) {
          for (const line of pg.lines) {
            lineIds.add(line.id);
          }
        }
        for (const child of n.children) {
          collect(child);
        }
      };
      collect(node);
    } else {
      // Keep traversing
      for (const child of node.children) {
        traverse(child);
      }
    }
  };

  for (const node of areaTree) {
    traverse(node);
  }

  return lineIds;
}

export function SourceBudgetLinePanel({
  sourceId,
  sourceName,
  data,
  isLoading,
  error,
  onRetry,
  selectedLineIds,
  onSelectionChange,
  onMoveLines,
}: SourceBudgetLinePanelProps) {
  const { t } = useTranslation('budget');
  const { formatCurrency } = useFormatters();
  const isSelectable = selectedLineIds !== undefined && onSelectionChange !== undefined;

  const workItemLines = data?.workItemLines ?? [];

  const householdItemLines = data?.householdItemLines ?? [];

  const isEmpty = workItemLines.length === 0 && householdItemLines.length === 0;

  // Build area trees for both work item and household item lines
  const workItemAreaTree = useMemo(() => buildAreaTree(workItemLines), [workItemLines]);
  const householdItemAreaTree = useMemo(
    () => buildAreaTree(householdItemLines),
    [householdItemLines],
  );

  // Compute area group selection states (including cascading for descendants)
  const areaGroupSelectionStates = useMemo(() => {
    if (!isSelectable) return new Map<string, { allSelected: boolean; someSelected: boolean }>();

    const states = new Map<string, { allSelected: boolean; someSelected: boolean }>();

    const computeForTree = (tree: AreaNode[]) => {
      const traverse = (node: AreaNode) => {
        // For this area, collect all lines in its subtree (including children)
        const subtreeLineIds = getAreaSubtreeLineIds(tree, node.areaId);
        const selectedInSubtree = Array.from(subtreeLineIds).filter((id) =>
          selectedLineIds!.has(id),
        );
        const allSelected =
          selectedInSubtree.length === subtreeLineIds.size && subtreeLineIds.size > 0;
        const someSelected = selectedInSubtree.length > 0;

        const key = node.areaId ?? 'unassigned';
        states.set(key, { allSelected, someSelected });

        for (const child of node.children) {
          traverse(child);
        }
      };

      for (const node of tree) {
        traverse(node);
      }
    };

    computeForTree(workItemAreaTree);
    computeForTree(householdItemAreaTree);

    return states;
  }, [workItemAreaTree, householdItemAreaTree, selectedLineIds, isSelectable]);

  // Handle area group checkbox change (with cascading to descendants)
  const handleAreaGroupCheckboxChange = useCallback(
    (areaGroup: AreaGroup, checked: boolean, sectionType: 'work-item' | 'household-item') => {
      if (!isSelectable || !onSelectionChange) return;

      // Get the appropriate tree for this section
      const tree = sectionType === 'work-item' ? workItemAreaTree : householdItemAreaTree;

      // Collect all line IDs in the area subtree
      const subtreeLineIds = getAreaSubtreeLineIds(tree, areaGroup.areaId);

      const newSelection = new Set(selectedLineIds);

      if (checked) {
        subtreeLineIds.forEach((id) => newSelection.add(id));
      } else {
        subtreeLineIds.forEach((id) => newSelection.delete(id));
      }

      onSelectionChange(newSelection);
    },
    [isSelectable, selectedLineIds, onSelectionChange, workItemAreaTree, householdItemAreaTree],
  );

  // Handle individual line checkbox change
  const handleLineCheckboxChange = useCallback(
    (lineId: string, checked: boolean) => {
      if (!isSelectable || !onSelectionChange) return;

      const newSelection = new Set(selectedLineIds);
      if (checked) {
        newSelection.add(lineId);
      } else {
        newSelection.delete(lineId);
      }

      onSelectionChange(newSelection);
    },
    [isSelectable, selectedLineIds, onSelectionChange],
  );

  // Render an area hierarchy recursively
  const renderAreaNode = (node: AreaNode, parentType: 'work-item' | 'household-item') => {
    const groupKey = node.areaId ?? 'unassigned';
    const selectionState = areaGroupSelectionStates.get(groupKey);
    const areaName = node.areaId === null ? t('sources.lines.unassignedArea') : node.areaName;

    return (
      <div
        key={groupKey}
        className={styles.areaGroup}
        style={{ '--area-depth': node.depth } as React.CSSProperties}
      >
        <header className={styles.areaGroupHeader}>
          <div className={styles.areaTitleRow}>
            {node.areaColor && (
              <span
                className={styles.areaColorDot}
                style={{ backgroundColor: node.areaColor }}
                aria-hidden="true"
              />
            )}
            {!node.areaColor && node.areaId === null && (
              <span
                className={styles.areaColorDot}
                style={{ backgroundColor: 'var(--color-text-disabled)' }}
                aria-hidden="true"
              />
            )}
            <span className={styles.areaName}>{areaName}</span>
            {!isSelectable && (
              <span className={styles.areaLineCount}>
                {t('sources.lines.areaLineCount', { count: node.totalLines })}
              </span>
            )}
          </div>
          {isSelectable && selectionState && (
            <label className={styles.areaSelectAllRow}>
              <TriStateCheckbox
                id={`area-${groupKey}-checkbox`}
                checked={selectionState.allSelected}
                indeterminate={!selectionState.allSelected && selectionState.someSelected}
                onChange={(checked) =>
                  handleAreaGroupCheckboxChange(
                    {
                      areaId: node.areaId,
                      areaName: node.areaName,
                      areaColor: node.areaColor,
                      depth: node.depth,
                      ancestors: node.ancestors,
                      parentGroups: node.parentGroups,
                      totalLines: node.totalLines,
                    },
                    checked,
                    parentType,
                  )
                }
                className={styles.areaGroupCheckbox}
              />
              <span className={styles.areaSelectAllLabel}>
                {t('sources.budgetLines.move.selectGroupLabel', {
                  name: areaName,
                })}
              </span>
              <span className={styles.areaLineCount}>
                {t('sources.lines.areaLineCount', { count: node.totalLines })}
              </span>
            </label>
          )}
        </header>

        {node.parentGroups.map((parentGroup) => (
          <div key={parentGroup.parentId} className={styles.parentItemBlock}>
            <Link
              to={`/project/${parentType === 'work-item' ? 'work-items' : 'household-items'}/${parentGroup.parentId}`}
              className={styles.parentItemHeader}
            >
              {parentGroup.parentName}
            </Link>

            <ul role="list" className={isSelectable ? styles.lineListSelectable : styles.lineList}>
              {parentGroup.lines.map((line) => {
                const isSelected = selectedLineIds?.has(line.id) ?? false;
                const confidenceLabel = getConfidenceLabel(line, t);
                const invoiceStatusLabel = getInvoiceStatusLabel(line, t);

                return (
                  <li
                    key={line.id}
                    role="listitem"
                    className={`${styles.lineRow} ${isSelectable && isSelected ? styles.lineRowSelected : ''}`}
                  >
                    {isSelectable && (
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={isSelected}
                        onChange={(e) => handleLineCheckboxChange(line.id, e.target.checked)}
                        aria-label={t('sources.budgetLines.move.checkboxLabel', {
                          description: line.description ?? '—',
                        })}
                      />
                    )}

                    <span className={styles.lineDescription}>{line.description ?? '—'}</span>

                    <span className={styles.lineType}>{confidenceLabel}</span>

                    <span className={styles.lineStatus}>{invoiceStatusLabel}</span>

                    <span className={styles.linePlannedAmount}>
                      {formatCurrency(line.plannedAmount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* Render child areas */}
        {node.children.map((childNode) => renderAreaNode(childNode, parentType))}
      </div>
    );
  };

  // Render a section (work items or household items)
  const renderSection = (
    lines: BudgetSourceBudgetLine[],
    titleKey: 'workItemSection' | 'householdItemSection',
    parentType: 'work-item' | 'household-item',
  ) => {
    if (lines.length === 0) return null;

    const tree = parentType === 'work-item' ? workItemAreaTree : householdItemAreaTree;

    return (
      <div key={titleKey} className={styles.section}>
        <h4 className={styles.sectionHeader}>{t(`sources.lines.${titleKey}`)}</h4>

        {tree.map((node) => renderAreaNode(node, parentType))}
      </div>
    );
  };

  // Render states
  if (isLoading) {
    return (
      <div
        id={`source-lines-${sourceId}`}
        role="region"
        aria-label={t('sources.lines.loadingLabel')}
        className={styles.linesPanel}
      >
        <Skeleton
          lines={6}
          widths={['70%', '45%', '90%', '70%', '90%', '70%']}
          loadingLabel={t('sources.lines.loadingLabel')}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        id={`source-lines-${sourceId}`}
        role="region"
        aria-label={t('sources.lines.panelAriaLabel', { name: sourceName })}
        className={styles.linesPanel}
      >
        <div className={styles.errorBanner} role="alert">
          <p>{error}</p>
          <button type="button" className={styles.retryButton} onClick={onRetry}>
            {t('sources.lines.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div
        id={`source-lines-${sourceId}`}
        role="region"
        aria-label={t('sources.lines.panelAriaLabel', { name: sourceName })}
        className={styles.linesPanel}
      >
        <EmptyState
          message={t('sources.lines.empty')}
          description={t('sources.lines.emptyDescription')}
        />
      </div>
    );
  }

  return (
    <div
      id={`source-lines-${sourceId}`}
      role="region"
      aria-label={t('sources.lines.panelAriaLabel', { name: sourceName })}
      className={styles.linesPanel}
    >
      {renderSection(workItemLines, 'workItemSection', 'work-item')}
      {renderSection(householdItemLines, 'householdItemSection', 'household-item')}
      {isSelectable && selectedLineIds.size > 0 && (
        <div className={styles.actionBar}>
          <span className={styles.actionBarCount} role="status" aria-atomic="true">
            {t('sources.budgetLines.move.selectedCount', { count: selectedLineIds.size })}
          </span>
          <button type="button" className={styles.actionBarButton} onClick={onMoveLines}>
            {t('sources.budgetLines.move.openModalButton')}
          </button>
        </div>
      )}
    </div>
  );
}
