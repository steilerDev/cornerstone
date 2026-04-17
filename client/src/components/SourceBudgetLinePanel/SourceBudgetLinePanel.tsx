import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  BudgetSourceBudgetLinesResponse,
  BudgetSourceBudgetLine,
  ConfidenceLevel,
} from '@cornerstone/shared';
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

interface AreaGroup {
  areaId: string | null;
  areaName: string;
  areaColor: string | null;
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

// Group lines by area, then parent
function groupLines(lines: BudgetSourceBudgetLine[]): AreaGroup[] {
  const areaMap = new Map<
    string | null,
    { name: string; color: string | null; lines: BudgetSourceBudgetLine[] }
  >();

  for (const line of lines) {
    const areaKey = line.area?.id ?? null;
    if (!areaMap.has(areaKey)) {
      areaMap.set(areaKey, {
        name: line.area?.name ?? '',
        color: line.area?.color ?? null,
        lines: [],
      });
    }
    areaMap.get(areaKey)!.lines.push(line);
  }

  // Build area groups: named areas sorted alphabetically, unassigned last
  const namedAreas = Array.from(areaMap.entries())
    .filter(([id]) => id !== null)
    .map(([id, data]) => ({
      areaId: id,
      areaName: data.name,
      areaColor: data.color,
      parentGroups: buildParentGroups(data.lines),
      totalLines: data.lines.length,
    }))
    .sort((a, b) => a.areaName.localeCompare(b.areaName));

  const unassignedData = areaMap.get(null);
  if (unassignedData && unassignedData.lines.length > 0) {
    namedAreas.push({
      areaId: null,
      areaName: '',
      areaColor: null,
      parentGroups: buildParentGroups(unassignedData.lines),
      totalLines: unassignedData.lines.length,
    });
  }

  return namedAreas;
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

  // Build confidence and invoice badge variants
  const confidenceVariants: BadgeVariantMap = {
    own_estimate: {
      label: t('sources.lines.confidence.own_estimate'),
      className: styles.confidenceOwnEstimate,
    },
    professional_estimate: {
      label: t('sources.lines.confidence.professional_estimate'),
      className: styles.confidenceProEstimate,
    },
    quote: {
      label: t('sources.lines.confidence.quote'),
      className: styles.confidenceQuote,
    },
    invoice: {
      label: t('sources.lines.confidence.invoice'),
      className: styles.confidenceInvoice,
    },
  };

  const invoiceVariants: BadgeVariantMap = {
    linked: {
      label: t('sources.lines.invoiceLinked'),
      className: styles.invoiceLinked,
    },
  };

  const workItemLines = data?.workItemLines ?? [];

  const householdItemLines = data?.householdItemLines ?? [];

  const isEmpty = workItemLines.length === 0 && householdItemLines.length === 0;

  // Compute area group selection states
  const areaGroupSelectionStates = useMemo(() => {
    if (!isSelectable) return new Map<string, { allSelected: boolean; someSelected: boolean }>();

    const workItemGroups = groupLines(workItemLines);
    const householdItemGroups = groupLines(householdItemLines);
    const allGroups = [...workItemGroups, ...householdItemGroups];

    const states = new Map<string, { allSelected: boolean; someSelected: boolean }>();

    for (const areaGroup of allGroups) {
      const groupLineIds = areaGroup.parentGroups.flatMap((pg) => pg.lines.map((l) => l.id));
      const selectedInGroup = groupLineIds.filter((id) => selectedLineIds!.has(id));
      const allSelected = selectedInGroup.length === groupLineIds.length && groupLineIds.length > 0;
      const someSelected = selectedInGroup.length > 0;

      const key = areaGroup.areaId ?? 'unassigned';
      states.set(key, { allSelected, someSelected });
    }

    return states;
  }, [workItemLines, householdItemLines, selectedLineIds, isSelectable]);

  // Handle area group checkbox change
  const handleAreaGroupCheckboxChange = useCallback(
    (areaGroup: AreaGroup, checked: boolean) => {
      if (!isSelectable || !onSelectionChange) return;

      const groupLineIds = areaGroup.parentGroups.flatMap((pg) => pg.lines.map((l) => l.id));
      const newSelection = new Set(selectedLineIds);

      if (checked) {
        groupLineIds.forEach((id) => newSelection.add(id));
      } else {
        groupLineIds.forEach((id) => newSelection.delete(id));
      }

      onSelectionChange(newSelection);
    },
    [isSelectable, selectedLineIds, onSelectionChange],
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

  // Render a section (work items or household items)
  const renderSection = (
    lines: BudgetSourceBudgetLine[],
    titleKey: 'workItemSection' | 'householdItemSection',
    parentType: 'work-item' | 'household-item',
  ) => {
    if (lines.length === 0) return null;

    const groupedByArea = groupLines(lines);

    return (
      <div key={titleKey} className={styles.section}>
        <h4 className={styles.sectionHeader}>{t(`sources.lines.${titleKey}`)}</h4>

        {groupedByArea.map((areaGroup) => {
          const groupKey = areaGroup.areaId ?? 'unassigned';
          const selectionState = areaGroupSelectionStates.get(groupKey);

          return (
            <div key={groupKey} className={styles.areaGroup}>
              <div className={styles.areaGroupHeader}>
                {isSelectable && selectionState && (
                  <TriStateCheckbox
                    id={`area-${groupKey}-checkbox`}
                    checked={selectionState.allSelected}
                    indeterminate={!selectionState.allSelected && selectionState.someSelected}
                    onChange={(checked) => handleAreaGroupCheckboxChange(areaGroup, checked)}
                    label={t('sources.budgetLines.move.selectGroupLabel', {
                      name: areaGroup.areaName || t('sources.lines.unassignedArea'),
                    })}
                    className={styles.areaGroupCheckbox}
                  />
                )}
                {!isSelectable && (
                  <>
                    {areaGroup.areaColor && (
                      <span
                        className={styles.areaColorDot}
                        style={{ backgroundColor: areaGroup.areaColor }}
                        aria-hidden="true"
                      />
                    )}
                    {!areaGroup.areaColor && areaGroup.areaId === null && (
                      <span
                        className={styles.areaColorDot}
                        style={{ backgroundColor: 'var(--color-text-disabled)' }}
                        aria-hidden="true"
                      />
                    )}
                  </>
                )}
                {isSelectable && !selectionState && (
                  <>
                    {areaGroup.areaColor && (
                      <span
                        className={styles.areaColorDot}
                        style={{ backgroundColor: areaGroup.areaColor }}
                        aria-hidden="true"
                      />
                    )}
                    {!areaGroup.areaColor && areaGroup.areaId === null && (
                      <span
                        className={styles.areaColorDot}
                        style={{ backgroundColor: 'var(--color-text-disabled)' }}
                        aria-hidden="true"
                      />
                    )}
                  </>
                )}
                <span className={styles.areaName}>
                  {areaGroup.areaId === null
                    ? t('sources.lines.unassignedArea')
                    : areaGroup.areaName}
                </span>
                <span className={styles.areaLineCount}>
                  {t('sources.lines.areaLineCount', { count: areaGroup.totalLines })}
                </span>
              </div>

              {areaGroup.parentGroups.map((parentGroup) => (
                <div key={parentGroup.parentId}>
                  <Link
                    to={`/project/${parentType === 'work-item' ? 'work-items' : 'household-items'}/${parentGroup.parentId}`}
                    className={styles.parentItemHeader}
                  >
                    {parentGroup.parentName}
                  </Link>

                  <ul
                    role="list"
                    className={isSelectable ? styles.lineListSelectable : styles.lineList}
                  >
                    {parentGroup.lines.map((line) => {
                      const categoryName = line.budgetCategory?.name ?? null;
                      const vendorName = line.vendor?.name ?? null;
                      const showSubtext = categoryName || vendorName;
                      const isSelected = selectedLineIds?.has(line.id) ?? false;

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

                          {showSubtext && (
                            <span className={styles.lineSubtext}>
                              {categoryName && vendorName
                                ? `${categoryName} · ${vendorName}`
                                : categoryName || vendorName}
                            </span>
                          )}

                          <div className={styles.lineBadges}>
                            <Badge variants={confidenceVariants} value={line.confidence} />
                            {line.invoiceLink !== null && (
                              <Badge variants={invoiceVariants} value="linked" />
                            )}
                          </div>

                          <span className={styles.linePlannedAmount}>
                            {formatCurrency(line.plannedAmount)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          );
        })}
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
