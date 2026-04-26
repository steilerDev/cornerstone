import { useState, useRef, createContext, useContext, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  BudgetBreakdown,
  BudgetOverview,
  BreakdownArea,
  BreakdownWorkItem,
  BreakdownBudgetLine,
  BreakdownHouseholdItem,
  ConfidenceLevel,
  SubsidyAdjustment,
  BudgetSourceSummaryBreakdown,
} from '@cornerstone/shared';
import { CONFIDENCE_MARGINS } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import { usePrintExpansion } from '../../hooks/usePrintExpansion.js';
import { Badge } from '../Badge/Badge.js';
import badgeStyles from '../Badge/Badge.module.css';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { getSourceColorIndex, getSourceBadgeStyleKey } from '../../lib/budgetSourceColors.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './CostBreakdownTable.module.css';

// Context to pass formatCurrency down to sub-components that aren't React components (can't use hooks)
const FormatterContext = createContext<((amount: number) => string) | null>(null);

function useFormatterContext() {
  const formatter = useContext(FormatterContext);
  if (!formatter) {
    throw new Error('useFormatterContext must be used within CostBreakdownTable');
  }
  return formatter;
}

// Context for source filter state
interface BreakdownContextValue {
  budgetSources: BudgetSourceSummaryBreakdown[];
  hasSourceFilter: boolean;
  visibleLineIds: Set<string>;
  filteredAggregates: FilteredAggregates | null;
}

const BreakdownContext = createContext<BreakdownContextValue | null>(null);

function useBreakdownContext() {
  const context = useContext(BreakdownContext);
  if (!context) {
    throw new Error('useBreakdownContext must be used within CostBreakdownTable');
  }
  return context;
}

type CostPerspective = 'min' | 'max' | 'avg';

interface CostBreakdownTableProps {
  breakdown: BudgetBreakdown;
  overview: BudgetOverview;
  deselectedSourceIds: Set<string>;
  onSourceToggle: (sourceId: string | null) => void;
  onSelectAllSources: () => void;
}

/**
 * Resolves projected cost based on perspective.
 */
function resolveProjected(
  projectedMin: number,
  projectedMax: number,
  perspective: CostPerspective,
): number {
  if (perspective === 'min') return projectedMin;
  if (perspective === 'max') return projectedMax;
  return (projectedMin + projectedMax) / 2;
}

/**
 * Resolves the perspective-dependent cost for a single budget line.
 * Mirrors the cost logic in BudgetLineRow (Level 3) and used throughout
 * aggregate computation to ensure a single source of truth.
 */
function resolveLineCost(line: BreakdownBudgetLine, perspective: CostPerspective): number {
  if (line.hasInvoice && !line.isQuotation) return line.actualCost;
  if (line.isQuotation) {
    return resolveProjected(line.actualCost * 0.95, line.actualCost * 1.05, perspective);
  }
  const margin = CONFIDENCE_MARGINS[line.confidence];
  return resolveProjected(
    line.plannedAmount * (1 - margin),
    line.plannedAmount * (1 + margin),
    perspective,
  );
}

/**
 * Computes per-source subsidy payback attribution using entity-level pro-rata weighting.
 *
 * For each entity (work item or household item), the entity's perspective-resolved payback
 * is distributed across its budget lines weighted by each line's max-perspective cost
 * (using computeLineProjected max, i.e. plannedAmount * (1 + margin)).
 * The result is bucketed by budgetSourceId (null → 'unassigned').
 *
 * Edge case: if an entity's totalLineMaxCost === 0 but entityPayback > 0,
 * payback is distributed equally across all lines.
 *
 * AC-11: computed over ALL entities regardless of selection state.
 */
function computePerSourcePayback(
  breakdown: BudgetBreakdown,
  perspective: CostPerspective,
): Map<string, number> {
  const map = new Map<string, number>();

  function processLines(
    budgetLines: BreakdownBudgetLine[],
    subsidyPayback: number,
    minSubsidyPayback: number,
  ) {
    const entityPayback = perspective === 'min' ? minSubsidyPayback : subsidyPayback;
    if (entityPayback === 0) return;

    // Compute max-perspective cost for each line (for weighting)
    const lineCosts = budgetLines.map((line) => resolveLineCost(line, 'max'));

    const totalCost = lineCosts.reduce((s, c) => s + c, 0);
    const n = budgetLines.length;

    budgetLines.forEach((line, i) => {
      const weight = totalCost === 0 ? (n > 0 ? 1 / n : 0) : (lineCosts[i] ?? 0) / totalCost;
      const paybackForLine = entityPayback * weight;
      const key = line.budgetSourceId ?? 'unassigned';
      map.set(key, (map.get(key) ?? 0) + paybackForLine);
    });
  }

  function walkWi(areas: BreakdownArea<BreakdownWorkItem>[]) {
    for (const area of areas) {
      for (const item of area.items) {
        processLines(item.budgetLines, item.subsidyPayback, item.minSubsidyPayback);
      }
      walkWi(area.children);
    }
  }
  function walkHi(areas: BreakdownArea<BreakdownHouseholdItem>[]) {
    for (const area of areas) {
      for (const item of area.items) {
        processLines(item.budgetLines, item.subsidyPayback, item.minSubsidyPayback);
      }
      walkHi(area.children);
    }
  }

  walkWi(breakdown.workItems.areas);
  walkHi(breakdown.householdItems.areas);
  return map;
}

interface FilteredEntityTotals {
  rawProjectedMin: number;
  rawProjectedMax: number;
  subsidyPayback: number;
  minSubsidyPayback: number;
}

interface FilteredAggregates {
  itemTotalsMap: Map<string, FilteredEntityTotals>;
  areaTotalsMap: Map<string, FilteredEntityTotals>;
  wiTotals: FilteredEntityTotals;
  hiTotals: FilteredEntityTotals;
}

function computeFilteredAggregates(
  breakdown: BudgetBreakdown,
  perspective: CostPerspective,
  hasSourceFilter: boolean,
  visibleLineIds: Set<string>,
): FilteredAggregates | null {
  if (!hasSourceFilter) return null;

  const itemTotalsMap = new Map<string, FilteredEntityTotals>();
  const areaTotalsMap = new Map<string, FilteredEntityTotals>();

  function zero(): FilteredEntityTotals {
    return { rawProjectedMin: 0, rawProjectedMax: 0, subsidyPayback: 0, minSubsidyPayback: 0 };
  }

  function addToTotals(t: FilteredEntityTotals, delta: FilteredEntityTotals): void {
    t.rawProjectedMin += delta.rawProjectedMin;
    t.rawProjectedMax += delta.rawProjectedMax;
    t.subsidyPayback += delta.subsidyPayback;
    t.minSubsidyPayback += delta.minSubsidyPayback;
  }

  function processItem(
    itemKey: string,
    budgetLines: BreakdownBudgetLine[],
    subsidyPayback: number,
    minSubsidyPayback: number,
  ): FilteredEntityTotals {
    const totals = zero();

    const visibleLines = budgetLines.filter((l) => visibleLineIds.has(l.id));

    for (const line of visibleLines) {
      totals.rawProjectedMin += resolveLineCost(line, 'min');
      totals.rawProjectedMax += resolveLineCost(line, 'max');
    }

    if (subsidyPayback > 0 || minSubsidyPayback > 0) {
      const allLineCosts = budgetLines.map((l) => resolveLineCost(l, 'max'));
      const totalWeight = allLineCosts.reduce((s, c) => s + c, 0);
      const n = budgetLines.length;

      budgetLines.forEach((line, i) => {
        if (!visibleLineIds.has(line.id)) return;
        const weight =
          totalWeight === 0 ? (n > 0 ? 1 / n : 0) : (allLineCosts[i] ?? 0) / totalWeight;
        totals.subsidyPayback += subsidyPayback * weight;
        totals.minSubsidyPayback += minSubsidyPayback * weight;
      });
    }

    itemTotalsMap.set(itemKey, totals);
    return totals;
  }

  function walkWiAreas(
    areas: BreakdownArea<BreakdownWorkItem>[],
    sectionKey: string,
  ): FilteredEntityTotals {
    const sectionTotals = zero();
    for (const area of areas) {
      const areaKey = `${sectionKey}-area-${area.areaId ?? 'unassigned'}`;
      const areaTotals = zero();

      for (const item of area.items) {
        const itemTotals = processItem(
          item.workItemId,
          item.budgetLines,
          item.subsidyPayback,
          item.minSubsidyPayback,
        );
        addToTotals(areaTotals, itemTotals);
      }

      const childTotals = walkWiAreas(area.children, sectionKey);
      addToTotals(areaTotals, childTotals);

      areaTotalsMap.set(areaKey, areaTotals);
      addToTotals(sectionTotals, areaTotals);
    }
    return sectionTotals;
  }

  function walkHiAreas(
    areas: BreakdownArea<BreakdownHouseholdItem>[],
    sectionKey: string,
  ): FilteredEntityTotals {
    const sectionTotals = zero();
    for (const area of areas) {
      const areaKey = `${sectionKey}-area-${area.areaId ?? 'unassigned'}`;
      const areaTotals = zero();

      for (const item of area.items) {
        const itemTotals = processItem(
          item.householdItemId,
          item.budgetLines,
          item.subsidyPayback,
          item.minSubsidyPayback,
        );
        addToTotals(areaTotals, itemTotals);
      }

      const childTotals = walkHiAreas(area.children, sectionKey);
      addToTotals(areaTotals, childTotals);

      areaTotalsMap.set(areaKey, areaTotals);
      addToTotals(sectionTotals, areaTotals);
    }
    return sectionTotals;
  }

  const wiTotals = walkWiAreas(breakdown.workItems.areas, 'wi');
  const hiTotals = walkHiAreas(breakdown.householdItems.areas, 'hi');

  return { itemTotalsMap, areaTotalsMap, wiTotals, hiTotals };
}

/**
 * Formats cost with explicit minus sign.
 * Must be called with the formatCurrency function from useFormatterContext or useFormatters.
 */
function formatCost(amount: number, fc: (n: number) => string): string {
  return `-${fc(amount)}`;
}

/**
 * Renders net value (payback - cost).
 * At item/category level, uses neutral text color (still an expense).
 * At sum level, uses green/red coloring (surplus vs deficit).
 *
 * Accepts formatCurrency as a parameter so it can be called from both
 * React components (inside FormatterContext.Provider) and from the root
 * CostBreakdownTable render (outside the provider).
 */
function renderNet(
  rawCost: number,
  payback: number,
  cssStyles: typeof styles,
  fc: (n: number) => string,
  colored: boolean = false,
): React.ReactNode {
  const net = payback - rawCost;
  if (colored) {
    return (
      <span className={net >= 0 ? cssStyles.valuePositive : cssStyles.valueNegative}>
        {fc(net)}
      </span>
    );
  }
  return <span>{fc(net)}</span>;
}

/**
 * Segmented control for cost perspective toggle (min/max/avg).
 */
function PerspectiveToggle({
  value,
  onChange,
}: {
  value: CostPerspective;
  onChange: (v: CostPerspective) => void;
}) {
  const options: { value: CostPerspective; label: string }[] = [
    { value: 'min', label: 'Min' },
    { value: 'avg', label: 'Avg' },
    { value: 'max', label: 'Max' },
  ];
  const groupRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(e: React.KeyboardEvent, current: CostPerspective) {
    const idx = options.findIndex((o) => o.value === current);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      // (idx + 1) % options.length is guaranteed to be in bounds
      const next = options[(idx + 1) % options.length]!;
      onChange(next.value);
      const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      buttons?.[(idx + 1) % options.length]?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      // (idx - 1 + options.length) % options.length is guaranteed to be in bounds
      const prev = options[(idx - 1 + options.length) % options.length]!;
      onChange(prev.value);
      const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      buttons?.[(idx - 1 + options.length) % options.length]?.focus();
    }
  }

  return (
    <div
      ref={groupRef}
      className={styles.perspectiveToggle}
      role="radiogroup"
      aria-label="Cost perspective"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          className={`${styles.perspectiveSegment} ${value === opt.value ? styles.perspectiveSegmentActive : ''}`}
          tabIndex={value === opt.value ? 0 : -1}
          onClick={() => onChange(opt.value)}
          onKeyDown={(e) => handleKeyDown(e, opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Helper function to check if an area has visible lines (for cascade hiding).
 */
function areaHasVisibleLines(
  a: BreakdownArea<BreakdownWorkItem | BreakdownHouseholdItem>,
  visibleIds: Set<string>,
): boolean {
  for (const item of a.items) {
    for (const line of item.budgetLines) {
      if (visibleIds.has(line.id)) return true;
    }
  }
  for (const child of a.children) {
    if (areaHasVisibleLines(child, visibleIds)) return true;
  }
  return false;
}

/**
 * Renders a confidence badge (e.g., "own_estimate") for a budget line.
 */
function ConfidenceBadge({ confidence }: { confidence: ConfidenceLevel }) {
  const label = confidence.replace(/_/g, ' ').toLowerCase();
  return <span className={styles.confidenceBadge}>{label}</span>;
}

/**
 * Renders a single budget line row (Level 3).
 */
function BudgetLineRow({
  line,
  perspective,
  depth,
}: {
  line: BreakdownBudgetLine;
  perspective: CostPerspective;
  depth: number;
}) {
  const { t } = useTranslation('budget');
  const formatCurrencyFn = useFormatterContext();
  const { hasSourceFilter, visibleLineIds, budgetSources } = useBreakdownContext();

  // Return null if this line is filtered out
  if (hasSourceFilter && !visibleLineIds.has(line.id)) {
    return null;
  }

  const key = `line-${line.id}`;
  const margin = CONFIDENCE_MARGINS[line.confidence];
  const costMin = line.plannedAmount * (1 - margin);
  const costMax = line.plannedAmount * (1 + margin);
  const perspectiveValue = resolveProjected(costMin, costMax, perspective);
  const rowClassName = `${styles.rowLevel3}${hasSourceFilter && visibleLineIds.has(line.id) ? ` ${styles.rowFiltered}` : ''}`;

  // Calculate quoted range (±5%)
  const quotedMin = line.actualCost * 0.95;
  const quotedMax = line.actualCost * 1.05;
  const quotedPerspectiveValue = resolveProjected(quotedMin, quotedMax, perspective);

  const resolvedRawCost = line.isQuotation
    ? quotedPerspectiveValue
    : line.hasInvoice
      ? line.actualCost
      : perspectiveValue;

  // Get source badge info
  const sourceId = line.budgetSourceId ?? null;
  const sourceName: string =
    budgetSources.find((s) => s.id === sourceId)?.name ??
    t('overview.costBreakdown.sourceFilter.unassigned');
  const styleKey = getSourceBadgeStyleKey(sourceId);
  const isTruncated = sourceName.length > 20;
  const label = isTruncated ? `${sourceName.slice(0, 20)}…` : sourceName;

  return (
    <tr className={rowClassName} key={key}>
      <td
        className={`${styles.colName} ${styles.cellLevel3Name}`}
        style={{ '--item-depth': depth } as React.CSSProperties}
      >
        <div className={styles.nameContent}>
          <span>{line.description || 'Untitled'}</span>
          {line.isQuotation ? (
            <span className={styles.quotedBadge}>{t('overview.costBreakdown.quoted')}</span>
          ) : line.hasInvoice ? (
            <span className={styles.invoicedBadge}>invoiced</span>
          ) : (
            <ConfidenceBadge confidence={line.confidence} />
          )}
          <span
            className={styles.sourceBadgeDot}
            style={{ backgroundColor: `var(--color-source-${getSourceColorIndex(sourceId)}-dot)` }}
            aria-hidden="true"
          />
          <span className={styles.sourceBadgeLabel}>
            <Badge
              variants={{ src: { label, className: badgeStyles[styleKey] ?? '' } }}
              value="src"
              ariaLabel={t('overview.costBreakdown.sourceBadge.ariaLabel', { name: sourceName })}
              title={isTruncated ? sourceName : undefined}
            />
          </span>
        </div>
      </td>
      <td className={styles.colBudget}>
        {line.isQuotation ? (
          <span>-{formatCurrencyFn(quotedPerspectiveValue)}</span>
        ) : line.hasInvoice ? (
          <span>-{formatCurrencyFn(line.actualCost)}</span>
        ) : (
          <span>-{formatCurrencyFn(perspectiveValue)}</span>
        )}
      </td>
      <td className={styles.colPayback}>—</td>
      <td className={styles.colRemaining}>
        <span>{formatCurrencyFn(resolvedRawCost)}</span>
      </td>
    </tr>
  );
}

/**
 * Renders a single work item row (Level 2) with optional expansion for budget lines.
 */
function WorkItemRow({
  item,
  expandKey,
  expanded: itemExpanded,
  onToggle,
  perspective,
  depth,
}: {
  item: BreakdownWorkItem;
  expandKey: string;
  expanded: boolean;
  onToggle: (key: string) => void;
  perspective: CostPerspective;
  depth: number;
}) {
  const { t } = useTranslation('budget');
  const formatCurrencyFn = useFormatterContext();
  const { hasSourceFilter, visibleLineIds, filteredAggregates } = useBreakdownContext();
  const key = expandKey;
  const rowClassName = styles.rowLevel2;

  // Cascade: hide item if filter is active and none of its lines are visible
  if (hasSourceFilter && item.budgetLines.every((line) => !visibleLineIds.has(line.id))) {
    return null;
  }

  const filteredTotals = hasSourceFilter
    ? filteredAggregates?.itemTotalsMap.get(item.workItemId)
    : undefined;

  const resolvedRawCost = filteredTotals
    ? resolveProjected(filteredTotals.rawProjectedMin, filteredTotals.rawProjectedMax, perspective)
    : item.costDisplay === 'actual'
      ? item.actualCost
      : resolveProjected(item.rawProjectedMin, item.rawProjectedMax, perspective);
  const resolvedPayback = filteredTotals
    ? resolveProjected(filteredTotals.minSubsidyPayback, filteredTotals.subsidyPayback, perspective)
    : resolveProjected(item.minSubsidyPayback, item.subsidyPayback, perspective);

  const effectiveMaxPayback = filteredTotals ? filteredTotals.subsidyPayback : item.subsidyPayback;

  return (
    <>
      <tr className={rowClassName} key={key}>
        <td
          className={`${styles.colName} ${styles.cellLevel2Name}`}
          style={{ '--item-depth': depth } as React.CSSProperties}
        >
          <div className={styles.nameContent}>
            <button
              type="button"
              className={styles.expandBtn}
              aria-expanded={itemExpanded}
              aria-label={`Expand ${item.title}`}
              onClick={() => onToggle(key)}
            >
              <ChevronSvg
                className={`${styles.chevron} ${itemExpanded ? styles.chevronOpen : ''}`}
              />
            </button>
            <Link to={`/project/work-items/${item.workItemId}`} className={styles.nameLink}>
              {item.title}
            </Link>
            {item.costDisplay === 'actual' && (
              <span className={styles.invoicedBadge}>invoiced</span>
            )}
            {item.costDisplay === 'quoted' && (
              <span className={styles.quotedBadge}>{t('overview.costBreakdown.quoted')}</span>
            )}
          </div>
        </td>
        <td className={styles.colBudget}>
          {item.costDisplay === 'actual' && !filteredTotals ? (
            <span>-{formatCurrencyFn(item.actualCost)}</span>
          ) : (
            <span>-{formatCurrencyFn(resolvedRawCost)}</span>
          )}
        </td>
        <td className={styles.colPayback}>
          {effectiveMaxPayback > 0 ? formatCurrencyFn(resolvedPayback) : '—'}
        </td>
        <td className={styles.colRemaining}>
          {renderNet(resolvedRawCost, resolvedPayback, styles, formatCurrencyFn)}
        </td>
      </tr>

      {itemExpanded && (
        <>
          {item.budgetLines.map((line: BreakdownBudgetLine) => (
            <BudgetLineRow key={line.id} line={line} perspective={perspective} depth={depth} />
          ))}
        </>
      )}
    </>
  );
}

/**
 * Renders a work item area (hierarchical) with optional expansion for items and child areas.
 */
function WorkItemAreaSection({
  area,
  depth,
  sectionKey,
  expandedKeys,
  onToggle,
  perspective,
  formatCurrencyFn,
  filteredAggregates,
}: {
  area: BreakdownArea<BreakdownWorkItem>;
  depth: number;
  sectionKey: 'wi' | 'hi';
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  perspective: CostPerspective;
  formatCurrencyFn: (value: number) => string;
  filteredAggregates: FilteredAggregates | null;
}) {
  const { t } = useTranslation('budget');
  const { hasSourceFilter, visibleLineIds } = useBreakdownContext();
  const areaKey = `${sectionKey}-area-${area.areaId ?? 'unassigned'}`;
  const isExpanded = expandedKeys.has(areaKey);

  // Cascade: hide area if filter is active and none of its items/children have visible lines
  if (
    hasSourceFilter &&
    !areaHasVisibleLines(
      area as BreakdownArea<BreakdownWorkItem | BreakdownHouseholdItem>,
      visibleLineIds,
    )
  ) {
    return null;
  }

  const filteredTotals = hasSourceFilter
    ? filteredAggregates?.areaTotalsMap.get(areaKey)
    : undefined;

  const resolvedRawCost = filteredTotals
    ? resolveProjected(filteredTotals.rawProjectedMin, filteredTotals.rawProjectedMax, perspective)
    : resolveProjected(area.rawProjectedMin, area.rawProjectedMax, perspective);
  const resolvedPayback = filteredTotals
    ? resolveProjected(filteredTotals.minSubsidyPayback, filteredTotals.subsidyPayback, perspective)
    : resolveProjected(area.minSubsidyPayback, area.subsidyPayback, perspective);
  const effectiveMaxPayback = filteredTotals ? filteredTotals.subsidyPayback : area.subsidyPayback;
  const areaName = area.areaId === null ? t('overview.costBreakdown.area.unassigned') : area.name;

  return (
    <>
      <tr className={styles.rowLevel1} key={areaKey}>
        <td
          className={`${styles.colName} ${styles.cellAreaName}`}
          style={{ '--area-depth': depth } as React.CSSProperties}
        >
          <div className={styles.nameContent}>
            <button
              type="button"
              className={styles.expandBtn}
              aria-expanded={isExpanded}
              aria-label={
                isExpanded
                  ? t('overview.costBreakdown.area.collapseArea', { name: areaName })
                  : t('overview.costBreakdown.area.expandArea', { name: areaName })
              }
              onClick={() => onToggle(areaKey)}
            >
              <ChevronSvg className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`} />
            </button>
            <span>{areaName}</span>
          </div>
        </td>
        <td className={styles.colBudget}>-{formatCurrencyFn(resolvedRawCost)}</td>
        <td className={styles.colPayback}>
          {effectiveMaxPayback > 0 ? formatCurrencyFn(resolvedPayback) : '—'}
        </td>
        <td className={styles.colRemaining}>
          {renderNet(resolvedRawCost, resolvedPayback, styles, formatCurrencyFn)}
        </td>
      </tr>

      {isExpanded && (
        <>
          {area.items.map((item: BreakdownWorkItem) => {
            const itemKey = `${sectionKey}-area-${area.areaId ?? 'unassigned'}-item-${item.workItemId}`;
            return (
              <WorkItemRow
                key={item.workItemId}
                item={item}
                expandKey={itemKey}
                expanded={expandedKeys.has(itemKey)}
                onToggle={onToggle}
                perspective={perspective}
                depth={depth}
              />
            );
          })}
          {area.children.map((childArea) => (
            <WorkItemAreaSection
              key={`${sectionKey}-area-${childArea.areaId ?? 'unassigned'}`}
              area={childArea}
              depth={depth + 1}
              sectionKey={sectionKey}
              expandedKeys={expandedKeys}
              onToggle={onToggle}
              perspective={perspective}
              formatCurrencyFn={formatCurrencyFn}
              filteredAggregates={filteredAggregates}
            />
          ))}
        </>
      )}
    </>
  );
}

/**
 * Renders a household item row (Level 2) with optional expansion for budget lines.
 */
function HouseholdItemRow({
  item,
  expandKey,
  expanded: itemExpanded,
  onToggle,
  perspective,
  depth,
}: {
  item: BreakdownHouseholdItem;
  expandKey: string;
  expanded: boolean;
  onToggle: (key: string) => void;
  perspective: CostPerspective;
  depth: number;
}) {
  const { t } = useTranslation('budget');
  const formatCurrencyFn = useFormatterContext();
  const { hasSourceFilter, visibleLineIds, filteredAggregates } = useBreakdownContext();
  const key = expandKey;
  const rowClassName = styles.rowLevel2;

  // Cascade: hide item if filter is active and none of its lines are visible
  if (hasSourceFilter && item.budgetLines.every((line) => !visibleLineIds.has(line.id))) {
    return null;
  }

  const filteredTotals = hasSourceFilter
    ? filteredAggregates?.itemTotalsMap.get(item.householdItemId)
    : undefined;

  const resolvedRawCost = filteredTotals
    ? resolveProjected(filteredTotals.rawProjectedMin, filteredTotals.rawProjectedMax, perspective)
    : item.costDisplay === 'actual'
      ? item.actualCost
      : resolveProjected(item.rawProjectedMin, item.rawProjectedMax, perspective);
  const resolvedPayback = filteredTotals
    ? resolveProjected(filteredTotals.minSubsidyPayback, filteredTotals.subsidyPayback, perspective)
    : resolveProjected(item.minSubsidyPayback, item.subsidyPayback, perspective);

  const effectiveMaxPayback = filteredTotals ? filteredTotals.subsidyPayback : item.subsidyPayback;

  return (
    <>
      <tr className={rowClassName} key={key}>
        <td
          className={`${styles.colName} ${styles.cellLevel2Name}`}
          style={{ '--item-depth': depth } as React.CSSProperties}
        >
          <div className={styles.nameContent}>
            <button
              type="button"
              className={styles.expandBtn}
              aria-expanded={itemExpanded}
              aria-label={`Expand ${item.name}`}
              onClick={() => onToggle(key)}
            >
              <ChevronSvg
                className={`${styles.chevron} ${itemExpanded ? styles.chevronOpen : ''}`}
              />
            </button>
            <Link
              to={`/project/household-items/${item.householdItemId}`}
              className={styles.nameLink}
            >
              {item.name}
            </Link>
            {item.costDisplay === 'actual' && (
              <span className={styles.invoicedBadge}>invoiced</span>
            )}
            {item.costDisplay === 'quoted' && (
              <span className={styles.quotedBadge}>{t('overview.costBreakdown.quoted')}</span>
            )}
          </div>
        </td>
        <td className={styles.colBudget}>
          {item.costDisplay === 'actual' && !filteredTotals ? (
            <span>-{formatCurrencyFn(item.actualCost)}</span>
          ) : (
            <span>-{formatCurrencyFn(resolvedRawCost)}</span>
          )}
        </td>
        <td className={styles.colPayback}>
          {effectiveMaxPayback > 0 ? formatCurrencyFn(resolvedPayback) : '—'}
        </td>
        <td className={styles.colRemaining}>
          {renderNet(resolvedRawCost, resolvedPayback, styles, formatCurrencyFn)}
        </td>
      </tr>

      {itemExpanded && (
        <>
          {item.budgetLines.map((line: BreakdownBudgetLine) => (
            <BudgetLineRow key={line.id} line={line} perspective={perspective} depth={depth} />
          ))}
        </>
      )}
    </>
  );
}

/**
 * Renders a household item area (hierarchical) with optional expansion for items and child areas.
 */
function HouseholdItemAreaSection({
  area,
  depth,
  sectionKey,
  expandedKeys,
  onToggle,
  perspective,
  formatCurrencyFn,
  filteredAggregates,
}: {
  area: BreakdownArea<BreakdownHouseholdItem>;
  depth: number;
  sectionKey: 'wi' | 'hi';
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  perspective: CostPerspective;
  formatCurrencyFn: (value: number) => string;
  filteredAggregates: FilteredAggregates | null;
}) {
  const { t } = useTranslation('budget');
  const { hasSourceFilter, visibleLineIds } = useBreakdownContext();
  const areaKey = `${sectionKey}-area-${area.areaId ?? 'unassigned'}`;
  const isExpanded = expandedKeys.has(areaKey);

  // Cascade: hide area if filter is active and none of its items/children have visible lines
  if (
    hasSourceFilter &&
    !areaHasVisibleLines(
      area as BreakdownArea<BreakdownWorkItem | BreakdownHouseholdItem>,
      visibleLineIds,
    )
  ) {
    return null;
  }

  const filteredTotals = hasSourceFilter
    ? filteredAggregates?.areaTotalsMap.get(areaKey)
    : undefined;

  const resolvedRawCost = filteredTotals
    ? resolveProjected(filteredTotals.rawProjectedMin, filteredTotals.rawProjectedMax, perspective)
    : resolveProjected(area.rawProjectedMin, area.rawProjectedMax, perspective);
  const resolvedPayback = filteredTotals
    ? resolveProjected(filteredTotals.minSubsidyPayback, filteredTotals.subsidyPayback, perspective)
    : resolveProjected(area.minSubsidyPayback, area.subsidyPayback, perspective);
  const effectiveMaxPayback = filteredTotals ? filteredTotals.subsidyPayback : area.subsidyPayback;
  const areaName = area.areaId === null ? t('overview.costBreakdown.area.unassigned') : area.name;

  return (
    <>
      <tr className={styles.rowLevel1} key={areaKey}>
        <td
          className={`${styles.colName} ${styles.cellAreaName}`}
          style={{ '--area-depth': depth } as React.CSSProperties}
        >
          <div className={styles.nameContent}>
            <button
              type="button"
              className={styles.expandBtn}
              aria-expanded={isExpanded}
              aria-label={
                isExpanded
                  ? t('overview.costBreakdown.area.collapseArea', { name: areaName })
                  : t('overview.costBreakdown.area.expandArea', { name: areaName })
              }
              onClick={() => onToggle(areaKey)}
            >
              <ChevronSvg className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`} />
            </button>
            <span>{areaName}</span>
          </div>
        </td>
        <td className={styles.colBudget}>-{formatCurrencyFn(resolvedRawCost)}</td>
        <td className={styles.colPayback}>
          {effectiveMaxPayback > 0 ? formatCurrencyFn(resolvedPayback) : '—'}
        </td>
        <td className={styles.colRemaining}>
          {renderNet(resolvedRawCost, resolvedPayback, styles, formatCurrencyFn)}
        </td>
      </tr>

      {isExpanded && (
        <>
          {area.items.map((item: BreakdownHouseholdItem) => {
            const itemKey = `${sectionKey}-area-${area.areaId ?? 'unassigned'}-item-${item.householdItemId}`;
            return (
              <HouseholdItemRow
                key={item.householdItemId}
                item={item}
                expandKey={itemKey}
                expanded={expandedKeys.has(itemKey)}
                onToggle={onToggle}
                perspective={perspective}
                depth={depth}
              />
            );
          })}
          {area.children.map((childArea) => (
            <HouseholdItemAreaSection
              key={`${sectionKey}-area-${childArea.areaId ?? 'unassigned'}`}
              area={childArea}
              depth={depth + 1}
              sectionKey={sectionKey}
              expandedKeys={expandedKeys}
              onToggle={onToggle}
              perspective={perspective}
              formatCurrencyFn={formatCurrencyFn}
              filteredAggregates={filteredAggregates}
            />
          ))}
        </>
      )}
    </>
  );
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
 * Main Cost Breakdown Table Component.
 *
 * Displays an expandable table with 4 nesting levels:
 * 1. Summary row (sources, WI budget, HI budget, remaining)
 * 2. Category rows (WI and HI categories)
 * 3. Item rows (individual work items and household items)
 * 4. Budget line rows (individual budget lines with confidence levels)
 */
export function CostBreakdownTable({
  breakdown,
  overview,
  deselectedSourceIds,
  onSourceToggle,
  onSelectAllSources,
}: CostBreakdownTableProps) {
  const { t } = useTranslation('budget');
  const { formatCurrency } = useFormatters();
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [perspective, setPerspective] = useState<CostPerspective>('avg');
  const budgetSources: BudgetSourceSummaryBreakdown[] = breakdown.budgetSources ?? [];

  const toggle = (key: string) => {
    const next = new Set(expandedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setExpandedKeys(next);
  };

  const allExpandableKeys = useMemo<Set<string>>(() => {
    const keys = new Set<string>();

    function collectWiArea(areas: BreakdownArea<BreakdownWorkItem>[]) {
      for (const area of areas) {
        const aKey = `wi-area-${area.areaId ?? 'unassigned'}`;
        keys.add(aKey);
        for (const item of area.items) {
          keys.add(`wi-area-${area.areaId ?? 'unassigned'}-item-${item.workItemId}`);
        }
        collectWiArea(area.children);
      }
    }

    function collectHiArea(areas: BreakdownArea<BreakdownHouseholdItem>[]) {
      for (const area of areas) {
        const aKey = `hi-area-${area.areaId ?? 'unassigned'}`;
        keys.add(aKey);
        for (const item of area.items) {
          keys.add(`hi-area-${area.areaId ?? 'unassigned'}-item-${item.householdItemId}`);
        }
        collectHiArea(area.children);
      }
    }

    if (breakdown.workItems.areas.length > 0) {
      keys.add('wi-section');
      collectWiArea(breakdown.workItems.areas);
    }
    if (breakdown.householdItems.areas.length > 0) {
      keys.add('hi-section');
      collectHiArea(breakdown.householdItems.areas);
    }
    if ((breakdown.subsidyAdjustments ?? []).length > 0) {
      keys.add('adj-section');
    }
    if (breakdown.workItems.areas.length > 0 || breakdown.householdItems.areas.length > 0) {
      keys.add('avail-funds');
    }

    return keys;
  }, [breakdown]);

  usePrintExpansion(expandedKeys, setExpandedKeys, allExpandableKeys);

  const wiAreas = breakdown.workItems.areas;
  const hiAreas = breakdown.householdItems.areas;
  const wiTotals = breakdown.workItems.totals;
  const hiTotals = breakdown.householdItems.totals;

  /**
   * Subsidy adjustments (oversubscribed subsidies).
   */
  const subsidyAdjustments = breakdown.subsidyAdjustments ?? [];
  const totalMinExcess = subsidyAdjustments.reduce(
    (sum: number, adj: SubsidyAdjustment) => sum + adj.minExcess,
    0,
  );
  const totalMaxExcess = subsidyAdjustments.reduce(
    (sum: number, adj: SubsidyAdjustment) => sum + adj.maxExcess,
    0,
  );
  const resolvedTotalExcess = resolveProjected(totalMinExcess, totalMaxExcess, perspective);

  /**
   * Total payback from all sources (min and max), reduced by subsidy cap excess.
   */
  const maxTotalPayback = wiTotals.subsidyPayback + hiTotals.subsidyPayback;
  const minTotalPayback = wiTotals.minSubsidyPayback + hiTotals.minSubsidyPayback;
  const resolvedTotalPayback = resolveProjected(minTotalPayback, maxTotalPayback, perspective);
  const adjustedTotalPayback = resolvedTotalPayback - resolvedTotalExcess;

  /**
   * Total raw projected cost (perspective-dependent).
   */
  const totalRawProjected = resolveProjected(
    wiTotals.rawProjectedMin + hiTotals.rawProjectedMin,
    wiTotals.rawProjectedMax + hiTotals.rawProjectedMax,
    perspective,
  );

  /**
   * Sum = availableFunds - totalRawProjected + adjustedTotalPayback.
   */
  const sum = overview.availableFunds - totalRawProjected + adjustedTotalPayback;

  // Source filter state
  const hasSourceFilter = deselectedSourceIds.size > 0;

  // Derive visible line IDs from filter (a line is visible if its source is NOT deselected)
  const visibleLineIds = useMemo<Set<string>>(() => {
    if (!hasSourceFilter) return new Set(); // empty = all visible (optimization)
    const ids = new Set<string>();
    // Walk all lines across all areas
    function collectWi(areas: BreakdownArea<BreakdownWorkItem>[]) {
      for (const area of areas) {
        for (const item of area.items) {
          for (const line of item.budgetLines) {
            const lineKey = line.budgetSourceId ?? 'unassigned';
            if (!deselectedSourceIds.has(lineKey)) ids.add(line.id);
          }
        }
        collectWi(area.children);
      }
    }
    function collectHi(areas: BreakdownArea<BreakdownHouseholdItem>[]) {
      for (const area of areas) {
        for (const item of area.items) {
          for (const line of item.budgetLines) {
            const lineKey = line.budgetSourceId ?? 'unassigned';
            if (!deselectedSourceIds.has(lineKey)) ids.add(line.id);
          }
        }
        collectHi(area.children);
      }
    }
    collectWi(wiAreas);
    collectHi(hiAreas);
    return ids;
  }, [hasSourceFilter, deselectedSourceIds, wiAreas, hiAreas]);

  // Per-source payback (pro-rata, always full-project, AC-11)
  const perSourcePayback = useMemo(
    () => computePerSourcePayback(breakdown, perspective),
    [breakdown, perspective],
  );

  // Available Funds: sum of selected sources' totalAmount (AC-16)
  const filteredAvailableFunds = useMemo<number>(() => {
    if (!hasSourceFilter) return overview.availableFunds;
    return budgetSources
      .filter((s) => !deselectedSourceIds.has(s.id))
      .reduce((sum, s) => sum + s.totalAmount, 0);
  }, [hasSourceFilter, budgetSources, deselectedSourceIds, overview.availableFunds]);

  // Compute unassigned allocated cost (for source detail rows)
  const unassignedAllocatedCost = useMemo<number>(() => {
    let total = 0;
    function walkWi(areas: BreakdownArea<BreakdownWorkItem>[]) {
      for (const area of areas) {
        for (const item of area.items) {
          for (const line of item.budgetLines) {
            if (line.budgetSourceId !== null) continue;
            total += resolveLineCost(line, perspective);
          }
        }
        walkWi(area.children);
      }
    }
    function walkHi(areas: BreakdownArea<BreakdownHouseholdItem>[]) {
      for (const area of areas) {
        for (const item of area.items) {
          for (const line of item.budgetLines) {
            if (line.budgetSourceId !== null) continue;
            total += resolveLineCost(line, perspective);
          }
        }
        walkHi(area.children);
      }
    }
    walkWi(wiAreas);
    walkHi(hiAreas);
    return total;
  }, [wiAreas, hiAreas, perspective]);

  // Compute filtered grand totals (Sum + Remaining Budget rows only)
  // Individual area/item rows use backend-computed values.
  const filteredRawProjected = useMemo<number>(() => {
    if (!hasSourceFilter) return totalRawProjected;
    // Sum perspective-resolved cost of visible lines only
    let total = 0;
    function walkWi(areas: BreakdownArea<BreakdownWorkItem>[]) {
      for (const area of areas) {
        for (const item of area.items) {
          for (const line of item.budgetLines) {
            if (!visibleLineIds.has(line.id)) continue;
            total += resolveLineCost(line, perspective);
          }
        }
        walkWi(area.children);
      }
    }
    function walkHi(areas: BreakdownArea<BreakdownHouseholdItem>[]) {
      for (const area of areas) {
        for (const item of area.items) {
          for (const line of item.budgetLines) {
            if (!visibleLineIds.has(line.id)) continue;
            total += resolveLineCost(line, perspective);
          }
        }
        walkHi(area.children);
      }
    }
    walkWi(wiAreas);
    walkHi(hiAreas);
    return total;
  }, [hasSourceFilter, visibleLineIds, wiAreas, hiAreas, perspective]);

  const filteredAggregates = useMemo(
    () => computeFilteredAggregates(breakdown, perspective, hasSourceFilter, visibleLineIds),
    [breakdown, perspective, hasSourceFilter, visibleLineIds],
  );

  const filteredAdjustedTotalPayback = useMemo<number>(() => {
    if (!hasSourceFilter) return adjustedTotalPayback;
    let total = 0;
    for (const [key, payback] of perSourcePayback) {
      if (!deselectedSourceIds.has(key)) {
        total += payback;
      }
    }
    return total - resolvedTotalExcess;
  }, [
    hasSourceFilter,
    perSourcePayback,
    deselectedSourceIds,
    adjustedTotalPayback,
    resolvedTotalExcess,
  ]);

  // Check if any lines are unassigned
  const hasUnassignedLines = useMemo<boolean>(() => {
    function check(areas: BreakdownArea<BreakdownWorkItem | BreakdownHouseholdItem>[]): boolean {
      for (const area of areas) {
        for (const item of area.items) {
          for (const line of item.budgetLines) {
            if (line.budgetSourceId === null) return true;
          }
        }
        if (check(area.children)) return true;
      }
      return false;
    }
    return check([
      ...(wiAreas as BreakdownArea<BreakdownWorkItem | BreakdownHouseholdItem>[]),
      ...(hiAreas as BreakdownArea<BreakdownWorkItem | BreakdownHouseholdItem>[]),
    ]);
  }, [wiAreas, hiAreas]);

  // Empty state
  const hasData = wiAreas.length > 0 || hiAreas.length > 0;

  if (!hasData) {
    return (
      <section className={styles.breakdownCard} aria-labelledby="breakdown-heading">
        <h2 id="breakdown-heading" className={styles.breakdownTitle}>
          {t('overview.costBreakdown.title')}
        </h2>
        <div className={styles.emptyState}>{t('overview.costBreakdown.emptyState')}</div>
      </section>
    );
  }

  const wiSectionKey = 'wi-section';
  const hiSectionKey = 'hi-section';
  const availFundsKey = 'avail-funds';
  const wiSectionExpanded = expandedKeys.has(wiSectionKey);
  const hiSectionExpanded = expandedKeys.has(hiSectionKey);
  const availFundsExpanded = expandedKeys.has(availFundsKey);

  return (
    <FormatterContext.Provider value={formatCurrency}>
      <BreakdownContext.Provider
        value={{
          budgetSources,
          hasSourceFilter,
          visibleLineIds,
          filteredAggregates,
        }}
      >
        <section className={styles.breakdownCard} aria-labelledby="breakdown-heading">
          <h2 id="breakdown-heading" className={styles.breakdownTitle}>
            {t('overview.costBreakdown.title')}
          </h2>

          <PerspectiveToggle value={perspective} onChange={setPerspective} />

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>
                {t('overview.costBreakdown.tableCaption')}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.colName}>
                    {t('overview.costBreakdown.tableHeaders.name')}
                  </th>
                  <th scope="col" className={styles.colBudget}>
                    {t('overview.costBreakdown.tableHeaders.cost')}
                  </th>
                  <th scope="col" className={styles.colPayback}>
                    {t('overview.costBreakdown.tableHeaders.payback')}
                  </th>
                  <th scope="col" className={styles.colRemaining}>
                    {t('overview.costBreakdown.tableHeaders.net')}
                  </th>
                </tr>
              </thead>

              {/* ===== COST SECTION (with column tints) ===== */}
              <tbody id="cost-breakdown-table-cost-section" className={styles.costSection}>
                {/* Work Item Budget row (expandable) */}
                {wiAreas.length > 0 && (
                  <>
                    <tr className={styles.rowLevel0} key={wiSectionKey}>
                      <td className={styles.colName}>
                        <div className={styles.nameContent}>
                          <button
                            type="button"
                            className={styles.expandBtn}
                            aria-expanded={wiSectionExpanded}
                            aria-label={t('overview.costBreakdown.area.expandWorkItemsLabel')}
                            onClick={() => toggle(wiSectionKey)}
                          >
                            <ChevronSvg
                              className={`${styles.chevron} ${wiSectionExpanded ? styles.chevronOpen : ''}`}
                            />
                          </button>
                          <span>{t('overview.costBreakdown.workItems')}</span>
                        </div>
                      </td>
                      <td className={styles.colBudget}>
                        {formatCost(
                          filteredAggregates
                            ? resolveProjected(
                                filteredAggregates.wiTotals.rawProjectedMin,
                                filteredAggregates.wiTotals.rawProjectedMax,
                                perspective,
                              )
                            : resolveProjected(
                                wiTotals.rawProjectedMin,
                                wiTotals.rawProjectedMax,
                                perspective,
                              ),
                          formatCurrency,
                        )}
                      </td>
                      <td className={styles.colPayback}>
                        {(filteredAggregates
                          ? filteredAggregates.wiTotals.subsidyPayback
                          : wiTotals.subsidyPayback) > 0
                          ? formatCurrency(
                              filteredAggregates
                                ? resolveProjected(
                                    filteredAggregates.wiTotals.minSubsidyPayback,
                                    filteredAggregates.wiTotals.subsidyPayback,
                                    perspective,
                                  )
                                : resolveProjected(
                                    wiTotals.minSubsidyPayback,
                                    wiTotals.subsidyPayback,
                                    perspective,
                                  ),
                            )
                          : '—'}
                      </td>
                      <td className={styles.colRemaining}>
                        {renderNet(
                          filteredAggregates
                            ? resolveProjected(
                                filteredAggregates.wiTotals.rawProjectedMin,
                                filteredAggregates.wiTotals.rawProjectedMax,
                                perspective,
                              )
                            : resolveProjected(
                                wiTotals.rawProjectedMin,
                                wiTotals.rawProjectedMax,
                                perspective,
                              ),
                          filteredAggregates
                            ? resolveProjected(
                                filteredAggregates.wiTotals.minSubsidyPayback,
                                filteredAggregates.wiTotals.subsidyPayback,
                                perspective,
                              )
                            : resolveProjected(
                                wiTotals.minSubsidyPayback,
                                wiTotals.subsidyPayback,
                                perspective,
                              ),
                          styles,
                          formatCurrency,
                        )}
                      </td>
                    </tr>

                    {wiSectionExpanded && (
                      <>
                        {wiAreas.map((area) => (
                          <WorkItemAreaSection
                            key={`wi-area-${area.areaId ?? 'unassigned'}`}
                            area={area}
                            depth={0}
                            sectionKey="wi"
                            expandedKeys={expandedKeys}
                            onToggle={toggle}
                            perspective={perspective}
                            formatCurrencyFn={formatCurrency}
                            filteredAggregates={filteredAggregates}
                          />
                        ))}
                      </>
                    )}
                  </>
                )}

                {/* Household Item Budget row (expandable) */}
                {hiAreas.length > 0 && (
                  <>
                    <tr className={styles.rowLevel0} key={hiSectionKey}>
                      <td className={styles.colName}>
                        <div className={styles.nameContent}>
                          <button
                            type="button"
                            className={styles.expandBtn}
                            aria-expanded={hiSectionExpanded}
                            aria-label={t('overview.costBreakdown.area.expandHouseholdItemsLabel')}
                            onClick={() => toggle(hiSectionKey)}
                          >
                            <ChevronSvg
                              className={`${styles.chevron} ${hiSectionExpanded ? styles.chevronOpen : ''}`}
                            />
                          </button>
                          <span>{t('overview.costBreakdown.householdItems')}</span>
                        </div>
                      </td>
                      <td className={styles.colBudget}>
                        {formatCost(
                          filteredAggregates
                            ? resolveProjected(
                                filteredAggregates.hiTotals.rawProjectedMin,
                                filteredAggregates.hiTotals.rawProjectedMax,
                                perspective,
                              )
                            : resolveProjected(
                                hiTotals.rawProjectedMin,
                                hiTotals.rawProjectedMax,
                                perspective,
                              ),
                          formatCurrency,
                        )}
                      </td>
                      <td className={styles.colPayback}>
                        {(filteredAggregates
                          ? filteredAggregates.hiTotals.subsidyPayback
                          : hiTotals.subsidyPayback) > 0
                          ? formatCurrency(
                              filteredAggregates
                                ? resolveProjected(
                                    filteredAggregates.hiTotals.minSubsidyPayback,
                                    filteredAggregates.hiTotals.subsidyPayback,
                                    perspective,
                                  )
                                : resolveProjected(
                                    hiTotals.minSubsidyPayback,
                                    hiTotals.subsidyPayback,
                                    perspective,
                                  ),
                            )
                          : '—'}
                      </td>
                      <td className={styles.colRemaining}>
                        {renderNet(
                          filteredAggregates
                            ? resolveProjected(
                                filteredAggregates.hiTotals.rawProjectedMin,
                                filteredAggregates.hiTotals.rawProjectedMax,
                                perspective,
                              )
                            : resolveProjected(
                                hiTotals.rawProjectedMin,
                                hiTotals.rawProjectedMax,
                                perspective,
                              ),
                          filteredAggregates
                            ? resolveProjected(
                                filteredAggregates.hiTotals.minSubsidyPayback,
                                filteredAggregates.hiTotals.subsidyPayback,
                                perspective,
                              )
                            : resolveProjected(
                                hiTotals.minSubsidyPayback,
                                hiTotals.subsidyPayback,
                                perspective,
                              ),
                          styles,
                          formatCurrency,
                        )}
                      </td>
                    </tr>

                    {hiSectionExpanded && (
                      <>
                        {hiAreas.map((area) => (
                          <HouseholdItemAreaSection
                            key={`hi-area-${area.areaId ?? 'unassigned'}`}
                            area={area}
                            depth={0}
                            sectionKey="hi"
                            expandedKeys={expandedKeys}
                            onToggle={toggle}
                            perspective={perspective}
                            formatCurrencyFn={formatCurrency}
                            filteredAggregates={filteredAggregates}
                          />
                        ))}
                      </>
                    )}
                  </>
                )}
              </tbody>

              {/* ===== SUBSIDY ADJUSTMENTS SECTION ===== */}
              {subsidyAdjustments.length > 0 &&
                (() => {
                  const adjSectionKey = 'adj-section';
                  const adjSectionExpanded = expandedKeys.has(adjSectionKey);
                  return (
                    <tbody>
                      <tr className={styles.rowLevel0}>
                        <td className={styles.colName}>
                          <div className={styles.nameContent}>
                            <button
                              type="button"
                              className={styles.expandBtn}
                              aria-expanded={adjSectionExpanded}
                              aria-label="Expand subsidy adjustments"
                              onClick={() => toggle(adjSectionKey)}
                            >
                              <ChevronSvg
                                className={`${styles.chevron} ${adjSectionExpanded ? styles.chevronOpen : ''}`}
                              />
                            </button>
                            <span>{t('overview.costBreakdown.subsidyAdjustments')}</span>
                          </div>
                        </td>
                        <td className={styles.colBudget} />
                        <td className={styles.colPayback} colSpan={2}>
                          <span className={styles.adjustmentValue}>
                            {formatCost(resolvedTotalExcess, formatCurrency)}
                          </span>
                        </td>
                      </tr>
                      {adjSectionExpanded &&
                        subsidyAdjustments.map((adj: SubsidyAdjustment) => {
                          const adjExcess = resolveProjected(
                            adj.minExcess,
                            adj.maxExcess,
                            perspective,
                          );
                          return (
                            <tr key={adj.subsidyProgramId} className={styles.rowLevel1}>
                              <td className={`${styles.colName} ${styles.cellLevel1Name}`}>
                                <div className={styles.adjustmentName}>
                                  <span>{adj.name}</span>
                                  <span className={styles.adjustmentHint}>
                                    {t('overview.costBreakdown.oversubscribed', {
                                      amount: formatCurrency(adj.maximumAmount),
                                    })}
                                  </span>
                                </div>
                              </td>
                              <td className={styles.colBudget} />
                              <td className={styles.colPayback} colSpan={2}>
                                <span className={styles.adjustmentValue}>
                                  {formatCost(adjExcess, formatCurrency)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  );
                })()}

              {/* ===== SUMMARY SECTION (no column tints) ===== */}
              <tbody>
                {/* Sum row */}
                <tr className={`${styles.rowLevel0} ${styles.rowSummary}`}>
                  <td className={styles.colName}>
                    <div className={styles.nameContent}>
                      <span>{t('overview.costBreakdown.sum')}</span>
                    </div>
                  </td>
                  <td className={styles.colBudget}>
                    <span className={styles.valueNegative}>
                      {formatCost(
                        hasSourceFilter ? filteredRawProjected : totalRawProjected,
                        formatCurrency,
                      )}
                    </span>
                  </td>
                  <td className={styles.colPayback}>
                    {(filteredAggregates
                      ? filteredAggregates.wiTotals.subsidyPayback +
                        filteredAggregates.hiTotals.subsidyPayback
                      : maxTotalPayback) > 0 ? (
                      <span className={styles.valuePositive}>
                        {formatCurrency(filteredAdjustedTotalPayback)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={styles.colRemaining}>
                    {renderNet(
                      hasSourceFilter ? filteredRawProjected : totalRawProjected,
                      filteredAdjustedTotalPayback,
                      styles,
                      formatCurrency,
                    )}
                  </td>
                </tr>

                {/* Available Funds row (expandable when sources exist) */}
                <tr className={styles.rowLevel0}>
                  <td className={styles.colName}>
                    <div className={styles.nameContent}>
                      {budgetSources.length > 0 && (
                        <button
                          type="button"
                          className={styles.expandBtn}
                          aria-expanded={availFundsExpanded}
                          aria-label="Expand available funds sources"
                          onClick={() => toggle(availFundsKey)}
                        >
                          <ChevronSvg
                            className={`${styles.chevron} ${availFundsExpanded ? styles.chevronOpen : ''}`}
                          />
                        </button>
                      )}
                      <span>{t('overview.costBreakdown.availableFunds')}</span>
                    </div>
                  </td>
                  <td className={styles.colBudget} colSpan={3}>
                    {formatCurrency(filteredAvailableFunds)}
                    {hasSourceFilter && (
                      <span className={styles.availableFundsFilterCaption}>
                        {t('overview.costBreakdown.availableFundsFilter.activeFilterCaption', {
                          selected: String(
                            budgetSources.filter((s) => !deselectedSourceIds.has(s.id)).length +
                              (hasUnassignedLines && !deselectedSourceIds.has('unassigned')
                                ? 1
                                : 0),
                          ),
                          total: String(budgetSources.length + (hasUnassignedLines ? 1 : 0)),
                        })}
                      </span>
                    )}
                  </td>
                </tr>

                {/* Source detail rows as toggle buttons */}
                {availFundsExpanded &&
                  (() => {
                    const sourceRows: React.ReactNode[] = [];

                    budgetSources.forEach((source: BudgetSourceSummaryBreakdown) => {
                      const colorIndex = getSourceColorIndex(source.id);
                      const isSelected = !deselectedSourceIds.has(source.id);
                      const allocatedCost = resolveProjected(
                        source.projectedMin,
                        source.projectedMax,
                        perspective,
                      );
                      const payback = perSourcePayback.get(source.id) ?? 0;
                      const net = source.totalAmount + payback - allocatedCost;
                      const rowStyle = {
                        '--chip-dot': `var(--color-source-${colorIndex}-dot)`,
                      } as React.CSSProperties;

                      sourceRows.push(
                        <tr
                          key={source.id}
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelected}
                          aria-label={
                            isSelected
                              ? t('overview.costBreakdown.sourceRow.selectedAriaLabel', {
                                  name: source.name,
                                })
                              : t('overview.costBreakdown.sourceRow.deselectedAriaLabel', {
                                  name: source.name,
                                })
                          }
                          className={`${styles.rowSourceDetail} ${styles.rowSourceDetailToggle}`}
                          style={rowStyle}
                          onClick={() => onSourceToggle(source.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSourceToggle(source.id);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              onSelectAllSources();
                            }
                          }}
                        >
                          <td className={styles.colName}>
                            <div className={`${styles.nameContent} ${styles.nameIndented}`}>
                              <span
                                className={styles.sourceDot}
                                style={{ backgroundColor: 'var(--chip-dot)' }}
                                aria-hidden="true"
                              />
                              <span>{source.name}</span>
                            </div>
                          </td>
                          <td className={styles.colBudget}>
                            <span className={styles.valueNegative}>
                              {formatCost(allocatedCost, formatCurrency)}
                            </span>
                          </td>
                          <td className={styles.colPayback}>
                            {payback > 0 ? (
                              <span className={styles.valuePositive}>
                                {formatCurrency(payback)}
                              </span>
                            ) : (
                              <span className={styles.valuePositive}>{formatCurrency(0)}</span>
                            )}
                          </td>
                          <td className={styles.colRemaining}>
                            <span
                              className={net >= 0 ? styles.valuePositive : styles.valueNegative}
                            >
                              {formatCurrency(net)}
                            </span>
                          </td>
                        </tr>,
                      );
                    });

                    // Unassigned pseudo-row (only when unassigned lines exist)
                    if (hasUnassignedLines) {
                      const colorIndex = 0; // unassigned uses index 0
                      const isSelected = !deselectedSourceIds.has('unassigned');
                      const unassignedPayback = perSourcePayback.get('unassigned') ?? 0;
                      const unassignedNet = unassignedPayback - unassignedAllocatedCost;

                      sourceRows.push(
                        <tr
                          key="unassigned"
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelected}
                          aria-label={
                            isSelected
                              ? t('overview.costBreakdown.sourceRow.selectedAriaLabel', {
                                  name: t('overview.costBreakdown.sourceFilter.unassigned'),
                                })
                              : t('overview.costBreakdown.sourceRow.deselectedAriaLabel', {
                                  name: t('overview.costBreakdown.sourceFilter.unassigned'),
                                })
                          }
                          className={`${styles.rowSourceDetail} ${styles.rowSourceDetailToggle}`}
                          style={
                            {
                              '--chip-dot': `var(--color-source-${colorIndex}-dot)`,
                            } as React.CSSProperties
                          }
                          onClick={() => onSourceToggle(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSourceToggle(null);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              onSelectAllSources();
                            }
                          }}
                        >
                          <td className={styles.colName}>
                            <div className={`${styles.nameContent} ${styles.nameIndented}`}>
                              <span
                                className={styles.sourceDot}
                                style={{ backgroundColor: 'var(--chip-dot)' }}
                                aria-hidden="true"
                              />
                              <span>{t('overview.costBreakdown.sourceFilter.unassigned')}</span>
                            </div>
                          </td>
                          <td className={styles.colBudget}>
                            <span className={styles.valueNegative}>
                              {formatCost(unassignedAllocatedCost, formatCurrency)}
                            </span>
                          </td>
                          <td className={styles.colPayback}>
                            <span className={styles.valuePositive}>
                              {formatCurrency(unassignedPayback)}
                            </span>
                          </td>
                          <td className={styles.colRemaining}>
                            <span
                              className={
                                unassignedNet >= 0 ? styles.valuePositive : styles.valueNegative
                              }
                            >
                              {formatCurrency(unassignedNet)}
                            </span>
                          </td>
                        </tr>,
                      );
                    }

                    return sourceRows;
                  })()}

                {/* Remaining Budget row */}
                <tr className={`${styles.rowLevel0} ${styles.rowSummary}`}>
                  <td className={styles.colName}>
                    <div className={styles.nameContent}>
                      <span>{t('overview.costBreakdown.remainingBudget')}</span>
                    </div>
                  </td>
                  <td className={styles.colBudget}>
                    <span
                      className={
                        filteredAvailableFunds -
                          (hasSourceFilter ? filteredRawProjected : totalRawProjected) >=
                        0
                          ? styles.valuePositive
                          : styles.valueNegative
                      }
                    >
                      {formatCurrency(
                        filteredAvailableFunds -
                          (hasSourceFilter ? filteredRawProjected : totalRawProjected),
                      )}
                    </span>
                  </td>
                  <td className={styles.colPayback} />
                  <td className={styles.colRemaining}>
                    <span
                      className={
                        filteredAvailableFunds -
                          (hasSourceFilter ? filteredRawProjected : totalRawProjected) +
                          filteredAdjustedTotalPayback >=
                        0
                          ? styles.valuePositive
                          : styles.valueNegative
                      }
                    >
                      {formatCurrency(
                        filteredAvailableFunds -
                          (hasSourceFilter ? filteredRawProjected : totalRawProjected) +
                          filteredAdjustedTotalPayback,
                      )}
                    </span>
                  </td>
                </tr>
              </tbody>

              {/* Empty state when filter returns no results */}
              {hasSourceFilter && visibleLineIds.size === 0 && (
                <tbody>
                  <tr>
                    <td colSpan={4}>
                      <EmptyState
                        message={t('overview.costBreakdown.sourceFilter.empty')}
                        action={{
                          label: t('overview.costBreakdown.sourceFilter.clear'),
                          onClick: onSelectAllSources,
                        }}
                      />
                    </td>
                  </tr>
                </tbody>
              )}
            </table>
          </div>

          {/* Screen reader live region for filter announcements (outside tableWrapper) */}
          <div role="status" aria-atomic="true" className={styles.srOnly}>
            {hasSourceFilter
              ? t('overview.costBreakdown.sourceFilter.statusAnnouncement', {
                  selected: String(
                    budgetSources.filter((s) => !deselectedSourceIds.has(s.id)).length +
                      (hasUnassignedLines && !deselectedSourceIds.has('unassigned') ? 1 : 0),
                  ),
                  total: String(budgetSources.length + (hasUnassignedLines ? 1 : 0)),
                })
              : t('overview.costBreakdown.sourceFilter.allSourcesAnnouncement')}
          </div>
        </section>
      </BreakdownContext.Provider>
    </FormatterContext.Provider>
  );
}

export default CostBreakdownTable;
