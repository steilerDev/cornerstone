import { routeUrl } from '@cornerstone/shared';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { KeyboardEvent, Ref } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { BudgetSourceBudgetLinesResponse, BudgetSourceBudgetLine } from '@cornerstone/shared';
import type { AreaAncestor } from '@cornerstone/shared';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { useFormatters } from '../../lib/formatters.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { isEscapeHandled, markEscapeHandled } from '../Modal/useFocusTrap.js';
import { SelectionActionBar } from '../SelectionActionBar/SelectionActionBar.js';
import { TriStateCheckbox } from '../TriStateCheckbox/TriStateCheckbox.js';
import sharedStyles from '../../styles/shared.module.css';
import { useOriginState } from '../../navigation/useOriginState.js';
import styles from './SourceBudgetLinePanel.module.css';

/** What the host can do with the panel (the "Move lines…" action lands on the first checkbox). */
export interface SourceBudgetLinePanelHandle {
  focusFirstCheckbox: () => void;
}

interface SourceBudgetLinePanelProps {
  sourceId: string;
  sourceName: string;
  data: BudgetSourceBudgetLinesResponse | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  selectedLineIds: Set<string>;
  onSelectionChange: (newSet: Set<string>) => void;
  /** Opens the host's "Move to another source" dialog for the selected lines. */
  onMoveLines: () => void;
  ref?: Ref<SourceBudgetLinePanelHandle>;
}

type ItemKind = 'work-item' | 'household-item';

/** A budget line tagged with the kind of item (task or purchase) it belongs to. */
type TaggedLine = BudgetSourceBudgetLine & { kind: ItemKind };

interface ParentGroup {
  parentId: string;
  parentName: string;
  kind: ItemKind;
  lines: TaggedLine[];
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

// Group lines by parent within an area
function buildParentGroups(lines: TaggedLine[]): ParentGroup[] {
  const parentMap = new Map<
    string,
    { id: string; name: string; kind: ItemKind; lines: TaggedLine[] }
  >();

  for (const line of lines) {
    const parentKey = `${line.kind}:${line.parentId}`;
    if (!parentMap.has(parentKey)) {
      parentMap.set(parentKey, {
        id: line.parentId,
        name: line.parentName,
        kind: line.kind,
        lines: [],
      });
    }
    parentMap.get(parentKey)!.lines.push(line);
  }

  // Sort each parent's lines by createdAt ascending
  for (const pg of parentMap.values()) {
    pg.lines.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  // Return sorted by parent name
  return Array.from(parentMap.values())
    .map((data) => ({
      parentId: data.id,
      parentName: data.name,
      kind: data.kind,
      lines: data.lines,
    }))
    .sort((a, b) => a.parentName.localeCompare(b.parentName));
}

// Build a hierarchical area tree from lines
function buildAreaTree(lines: TaggedLine[]): AreaNode[] {
  const areaMap = new Map<
    string | null,
    {
      name: string;
      color: string | null;
      ancestors: AreaAncestor[];
      lines: TaggedLine[];
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
          // idx is guaranteed to be valid by the if condition
          areaMap.set(areaId, {
            name: chain[idx]!.name,
            color: chain[idx]!.color,
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
    // data.ancestors.length > 0 guard ensures array access is valid
    const parentId =
      data.ancestors.length > 0 ? data.ancestors[data.ancestors.length - 1]!.id : null;
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

    // areaId === null is the unassigned bucket; parentMap.get(null) would return all named
    // root areas (their parent key is null), so guard explicitly to avoid duplicating them.
    const childAreaIds = areaId !== null ? (parentMap.get(areaId) ?? []) : [];
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

// Helper to get the localized invoice status label
function getInvoiceStatusLabel(
  line: BudgetSourceBudgetLine,
  t: (key: string, options?: { ns: string }) => string,
): string {
  if (line.invoiceLink === null) {
    return t('sources.lines.invoiceStatus.none');
  }
  const set = I18N_UNION_KEYS.statusVocabularyInvoice;
  return t(set.key(line.invoiceLink.invoiceStatus), { ns: set.ns });
}

// Helper to get the confidence label
function getConfidenceLabel(line: BudgetSourceBudgetLine, t: (key: string) => string): string {
  return t(I18N_UNION_KEYS.confidenceLevel.key(line.confidence));
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
  ref,
}: SourceBudgetLinePanelProps) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const { formatCurrency } = useFormatters();
  const originState = useOriginState();
  const rootRef = useRef<HTMLDivElement>(null);

  // The first checkbox of the panel is the first area's; rAF waits for the page to settle. While
  // the lines are still loading (no checkbox yet) the region takes focus and the first checkbox
  // follows as soon as it exists.
  const pendingFocusRef = useRef(false);
  const firstCheckbox = () =>
    rootRef.current?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null;
  const focusFirstCheckbox = useCallback(() => {
    requestAnimationFrame(() => {
      const checkbox = rootRef.current?.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (checkbox) {
        checkbox.focus();
      } else {
        pendingFocusRef.current = true;
        rootRef.current?.focus();
      }
    });
  }, []);
  useImperativeHandle(ref, () => ({ focusFirstCheckbox }), [focusFirstCheckbox]);
  useEffect(() => {
    if (!pendingFocusRef.current || isLoading) return;
    pendingFocusRef.current = false;
    // Only while focus is still where "Move lines…" left it (the region or nowhere): a person who
    // moved on in the meantime is not pulled back.
    const active = document.activeElement;
    if (active === document.body || rootRef.current?.contains(active)) firstCheckbox()?.focus();
  });

  // One tree for tasks and purchases: area > item > line. The item heading carries the kind word.
  const lines = useMemo<TaggedLine[]>(
    () => [
      ...(data?.workItemLines ?? []).map((line) => ({ ...line, kind: 'work-item' as const })),
      ...(data?.householdItemLines ?? []).map((line) => ({
        ...line,
        kind: 'household-item' as const,
      })),
    ],
    [data],
  );
  const isEmpty = lines.length === 0;
  const areaTree = useMemo(() => buildAreaTree(lines), [lines]);

  // Compute area group selection states (including cascading for descendants)
  const areaGroupSelectionStates = useMemo(() => {
    const states = new Map<string, { allSelected: boolean; someSelected: boolean }>();

    const traverse = (node: AreaNode) => {
      // For this area, collect all lines in its subtree (including children)
      const subtreeLineIds = getAreaSubtreeLineIds(areaTree, node.areaId);
      const selectedInSubtree = Array.from(subtreeLineIds).filter((id) => selectedLineIds.has(id));
      states.set(node.areaId ?? 'unassigned', {
        allSelected: selectedInSubtree.length === subtreeLineIds.size && subtreeLineIds.size > 0,
        someSelected: selectedInSubtree.length > 0,
      });
      for (const child of node.children) traverse(child);
    };
    for (const node of areaTree) traverse(node);

    return states;
  }, [areaTree, selectedLineIds]);

  // Handle area group checkbox change (with cascading to descendants)
  const handleAreaGroupCheckboxChange = useCallback(
    (areaId: string | null, checked: boolean) => {
      const subtreeLineIds = getAreaSubtreeLineIds(areaTree, areaId);
      const newSelection = new Set(selectedLineIds);
      if (checked) {
        subtreeLineIds.forEach((id) => newSelection.add(id));
      } else {
        subtreeLineIds.forEach((id) => newSelection.delete(id));
      }
      onSelectionChange(newSelection);
    },
    [selectedLineIds, onSelectionChange, areaTree],
  );

  // Handle individual line checkbox change
  const handleLineCheckboxChange = useCallback(
    (lineId: string, checked: boolean) => {
      const newSelection = new Set(selectedLineIds);
      if (checked) {
        newSelection.add(lineId);
      } else {
        newSelection.delete(lineId);
      }
      onSelectionChange(newSelection);
    },
    [selectedLineIds, onSelectionChange],
  );

  // Handle item (task / purchase) block toggle
  const handleParentGroupToggle = useCallback(
    (lineIds: string[], allSelected: boolean) => {
      const newSelection = new Set(selectedLineIds);
      if (allSelected) {
        lineIds.forEach((id) => newSelection.delete(id));
      } else {
        lineIds.forEach((id) => newSelection.add(id));
      }
      onSelectionChange(newSelection);
    },
    [selectedLineIds, onSelectionChange],
  );

  // Escape inside the panel clears the selection (a dialog or picker that handled it first wins).
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || selectedLineIds.size === 0) return;
    if (event.defaultPrevented || isEscapeHandled(event.nativeEvent)) return;
    markEscapeHandled(event.nativeEvent);
    onSelectionChange(new Set());
  };

  // Render an area hierarchy recursively
  const renderAreaNode = (node: AreaNode) => {
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
            <TriStateCheckbox
              checked={selectionState?.allSelected ?? false}
              indeterminate={
                !selectionState?.allSelected && (selectionState?.someSelected ?? false)
              }
              onChange={(checked) => handleAreaGroupCheckboxChange(node.areaId, checked)}
              label={t('sources.budgetLines.move.selectGroupLabel', { name: areaName })}
              hideLabel
            />
            <h2 className={styles.areaHeading}>{areaName}</h2>
            <span className={styles.areaLineCount}>
              {t('sources.lines.areaLineCount', { count: node.totalLines })}
            </span>
          </div>
        </header>

        {node.parentGroups.map((parentGroup) => {
          const lineIdsInParent = parentGroup.lines.map((l) => l.id);
          const parentSelectedCount = lineIdsInParent.filter((id) =>
            selectedLineIds.has(id),
          ).length;
          const parentAllSelected =
            parentSelectedCount === lineIdsInParent.length && lineIdsInParent.length > 0;
          const parentSomeSelected = parentSelectedCount > 0 && !parentAllSelected;
          const kindWord = tc(
            parentGroup.kind === 'work-item'
              ? 'entityPicker.taskOrPurchase.kindTask'
              : 'entityPicker.taskOrPurchase.kindPurchase',
          );

          return (
            <div
              key={`${parentGroup.kind}:${parentGroup.parentId}`}
              className={`${styles.parentItemBlock} ${
                parentAllSelected
                  ? styles.parentItemBlockChecked
                  : parentSomeSelected
                    ? styles.parentItemBlockMixed
                    : ''
              }`}
              onClick={(event) => {
                // A mouse convenience: clicking the block's own space toggles the item.
                if ((event.target as HTMLElement).closest('input, a, button, label')) return;
                handleParentGroupToggle(lineIdsInParent, parentAllSelected);
              }}
            >
              <div className={styles.parentItemHeader}>
                <TriStateCheckbox
                  checked={parentAllSelected}
                  indeterminate={parentSomeSelected}
                  onChange={(checked) => handleParentGroupToggle(lineIdsInParent, !checked)}
                  label={t('sources.budgetLines.move.selectItemLabel', {
                    name: parentGroup.parentName,
                  })}
                  hideLabel
                />
                <h3 className={styles.parentItemHeading}>
                  <span className={styles.parentItemKind}>{kindWord}</span>
                  <span className={styles.parentItemName}>{parentGroup.parentName}</span>
                </h3>
                <Link
                  to={
                    parentGroup.kind === 'work-item'
                      ? routeUrl('workItem', { id: parentGroup.parentId })
                      : routeUrl('householdItem', { id: parentGroup.parentId })
                  }
                  state={originState}
                  className={styles.parentItemNavLink}
                  aria-label={t('sources.budgetLines.move.navigateToItem', {
                    name: parentGroup.parentName,
                  })}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </Link>
              </div>

              <ul role="list" className={styles.lineListSelectable}>
                {parentGroup.lines.map((line) => {
                  const isSelected = selectedLineIds.has(line.id);
                  return (
                    <li
                      key={line.id}
                      role="listitem"
                      className={`${styles.lineRow} ${isSelected ? styles.lineRowSelected : ''}`}
                    >
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={isSelected}
                        onChange={(e) => handleLineCheckboxChange(line.id, e.target.checked)}
                        aria-label={t('sources.budgetLines.move.checkboxLabel', {
                          description: line.description ?? '—',
                        })}
                      />

                      <span className={styles.lineDescription}>{line.description ?? '—'}</span>

                      <span className={styles.lineType}>{getConfidenceLabel(line, t)}</span>

                      <span className={styles.lineStatus}>{getInvoiceStatusLabel(line, t)}</span>

                      <span className={styles.linePlannedAmount}>
                        {formatCurrency(
                          line.invoiceCount > 0 ? line.actualCost : line.plannedAmount,
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        {/* Render child areas */}
        {node.children.map((childNode) => renderAreaNode(childNode))}
      </div>
    );
  };

  // Render states
  if (isLoading) {
    return (
      <div
        ref={rootRef}
        tabIndex={-1}
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
        ref={rootRef}
        tabIndex={-1}
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
        ref={rootRef}
        tabIndex={-1}
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
      ref={rootRef}
      tabIndex={-1}
      id={`source-lines-${sourceId}`}
      role="region"
      aria-label={t('sources.lines.panelAriaLabel', { name: sourceName })}
      className={styles.linesPanel}
      onKeyDown={handleKeyDown}
    >
      {areaTree.map((node) => renderAreaNode(node))}
      {selectedLineIds.size > 0 && (
        <SelectionActionBar
          countLabel={t('sources.budgetLines.move.selectedCount', { count: selectedLineIds.size })}
          clearLabel={tc('aria.clearSelection')}
          onClear={() => {
            onSelectionChange(new Set());
            // The bar unmounts with the selection: focus moves to the panel's first checkbox.
            focusFirstCheckbox();
          }}
          testId={`source-lines-${sourceId}-selection-bar`}
        >
          <button
            type="button"
            className={sharedStyles.btnSecondaryCompact}
            onClick={onMoveLines}
            data-testid={`source-lines-${sourceId}-move`}
          >
            {t('financing.moveToAnotherSource')}
          </button>
        </SelectionActionBar>
      )}
    </div>
  );
}
