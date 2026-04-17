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
import styles from './SourceBudgetLinePanel.module.css';

interface SourceBudgetLinePanelProps {
  sourceId: string;
  sourceName: string;
  data: BudgetSourceBudgetLinesResponse | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
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
}: SourceBudgetLinePanelProps) {
  const { t } = useTranslation('budget');
  const { formatCurrency } = useFormatters();

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

  // Render a section (work items or household items)
  const renderSection = (
    lines: BudgetSourceBudgetLine[],
    titleKey: 'workItemSection' | 'householdItemSection',
  ) => {
    if (lines.length === 0) return null;

    const groupedByArea = groupLines(lines);

    return (
      <div key={titleKey} className={styles.section}>
        <h4 className={styles.sectionHeader}>{t(`sources.lines.${titleKey}`)}</h4>

        {groupedByArea.map((areaGroup) => (
          <div key={areaGroup.areaId ?? 'unassigned'} className={styles.areaGroup}>
            <div className={styles.areaGroupHeader}>
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
              <span className={styles.areaName}>
                {areaGroup.areaId === null ? t('sources.lines.unassignedArea') : areaGroup.areaName}
              </span>
              <span className={styles.areaLineCount}>
                {t('sources.lines.areaLineCount', { count: areaGroup.totalLines })}
              </span>
            </div>

            {areaGroup.parentGroups.map((parentGroup) => (
              <div key={parentGroup.parentId}>
                <p className={styles.parentItemHeader}>{parentGroup.parentName}</p>

                <ul role="list" className={styles.lineList}>
                  {parentGroup.lines.map((line) => {
                    const categoryName = line.budgetCategory?.name ?? null;
                    const vendorName = line.vendor?.name ?? null;
                    const showSubtext = categoryName || vendorName;

                    return (
                      <li key={line.id} role="listitem" className={styles.lineRow}>
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
        ))}
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
      {renderSection(workItemLines, 'workItemSection')}
      {renderSection(householdItemLines, 'householdItemSection')}
    </div>
  );
}
