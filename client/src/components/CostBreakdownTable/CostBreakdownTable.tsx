import { useState, useRef, createContext, use, useMemo } from 'react';
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
  CostDisplay,
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
import styles from './CostBreakdownTable.module.css';

// Context to pass formatCurrency down to sub-components that aren't React components (can't use hooks)
const FormatterContext = createContext<((amount: number) => string) | null>(null);

function useFormatterContext() {
  const formatter = use(FormatterContext);
  if (!formatter) {
    throw new Error('useFormatterContext must be used within CostBreakdownTable');
  }
  return formatter;
}

// Context for source filter state
interface BreakdownContextValue {
  budgetSources: BudgetSourceSummaryBreakdown[];
}

const BreakdownContext = createContext<BreakdownContextValue | null>(null);

function useBreakdownContext() {
  const context = use(BreakdownContext);
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
  paymentStatus: 'all' | 'paid' | 'outstanding';
  onPaymentStatusChange: (v: 'all' | 'paid' | 'outstanding') => void;
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
 * Resolves the display cost for a single budget line based on paymentStatus.
 */
function resolveBudgetLineCost(
  line: BreakdownBudgetLine,
  perspective: CostPerspective,
  paymentStatus: 'all' | 'paid' | 'outstanding',
): number {
  const margin = CONFIDENCE_MARGINS[line.confidence as keyof typeof CONFIDENCE_MARGINS] ?? 0;
  const costMin = line.plannedAmount * (1 - margin);
  const costMax = line.plannedAmount * (1 + margin);
  const perspectiveValue = resolveProjected(costMin, costMax, perspective);
  const quotedMin = line.actualCost * 0.95;
  const quotedMax = line.actualCost * 1.05;
  const quotedPerspectiveValue = resolveProjected(quotedMin, quotedMax, perspective);

  if (paymentStatus === 'paid') {
    return line.actualCostPaid;
  }
  if (paymentStatus === 'outstanding') {
    if (!line.hasInvoice) return perspectiveValue;
    if (line.isQuotation) return quotedPerspectiveValue;
    return line.actualCostPending;
  }
  // 'all' — current behavior
  if (line.isQuotation) return quotedPerspectiveValue;
  if (line.hasInvoice) return line.actualCost;
  return perspectiveValue;
}

/**
 * Resolves the display cost for an item, area, or totals aggregate based on paymentStatus.
 */
function resolveAggregateCost(
  rawProjectedMin: number,
  rawProjectedMax: number,
  actualCost: number,
  actualCostPaid: number,
  actualCostPending: number,
  costDisplay: CostDisplay | null,
  perspective: CostPerspective,
  paymentStatus: 'all' | 'paid' | 'outstanding',
): number {
  if (paymentStatus === 'paid') {
    return actualCostPaid;
  }
  if (paymentStatus === 'outstanding') {
    // pending invoiced + uninvoiced projected
    const projectedPortion = Math.max(
      0,
      resolveProjected(rawProjectedMin, rawProjectedMax, perspective) - actualCost,
    );
    return actualCostPending + projectedPortion;
  }
  // 'all' — current behavior
  if (costDisplay === 'actual') return actualCost;
  return resolveProjected(rawProjectedMin, rawProjectedMax, perspective);
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
 * React components (inside FormatterContext) and from the root
 * CostBreakdownTable render (outside the context).
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
  const { t } = useTranslation('budget');
  const options: { value: CostPerspective; label: string }[] = [
    { value: 'min', label: t('overview.costBreakdown.perspective.min') },
    { value: 'avg', label: t('overview.costBreakdown.perspective.avg') },
    { value: 'max', label: t('overview.costBreakdown.perspective.max') },
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
      aria-label={t('overview.costBreakdown.perspectiveAriaLabel')}
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
 * Dropdown for cost basis selection (all/paid/outstanding).
 */
function CostBasisSelect({
  value,
  onChange,
}: {
  value: 'all' | 'paid' | 'outstanding';
  onChange: (v: 'all' | 'paid' | 'outstanding') => void;
}) {
  const { t } = useTranslation('budget');
  const selectId = 'cost-basis-select';
  return (
    <div className={styles.costBasisField}>
      <label htmlFor={selectId} className={styles.costBasisLabel}>
        {t('overview.costBreakdown.costBasis.label')}
      </label>
      <select
        id={selectId}
        className={`${styles.costBasisSelect}${value !== 'all' ? ` ${styles.costBasisSelectActive}` : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value as 'all' | 'paid' | 'outstanding')}
      >
        <option value="all">{t('overview.costBreakdown.costBasis.all')}</option>
        <option value="paid">{t('overview.costBreakdown.costBasis.paid')}</option>
        <option value="outstanding">{t('overview.costBreakdown.costBasis.outstanding')}</option>
      </select>
    </div>
  );
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
  paymentStatus,
}: {
  line: BreakdownBudgetLine;
  perspective: CostPerspective;
  depth: number;
  paymentStatus: 'all' | 'paid' | 'outstanding';
}) {
  const { t } = useTranslation('budget');
  const formatCurrencyFn = useFormatterContext();
  const { budgetSources } = useBreakdownContext();

  const key = `line-${line.id}`;
  const rowClassName = styles.rowLevel3;
  const resolvedRawCost = resolveBudgetLineCost(line, perspective, paymentStatus);

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
        <span>-{formatCurrencyFn(resolvedRawCost)}</span>
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
  paymentStatus,
}: {
  item: BreakdownWorkItem;
  expandKey: string;
  expanded: boolean;
  onToggle: (key: string) => void;
  perspective: CostPerspective;
  depth: number;
  paymentStatus: 'all' | 'paid' | 'outstanding';
}) {
  const { t } = useTranslation('budget');
  const formatCurrencyFn = useFormatterContext();
  const key = expandKey;
  const rowClassName = styles.rowLevel2;

  const resolvedRawCost = resolveAggregateCost(
    item.rawProjectedMin,
    item.rawProjectedMax,
    item.actualCost,
    item.actualCostPaid,
    item.actualCostPending,
    item.costDisplay,
    perspective,
    paymentStatus,
  );
  const resolvedPayback = resolveProjected(
    item.minSubsidyPayback,
    item.subsidyPayback,
    perspective,
  );

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
          <span>-{formatCurrencyFn(resolvedRawCost)}</span>
        </td>
        <td className={styles.colPayback}>
          {item.subsidyPayback > 0 ? formatCurrencyFn(resolvedPayback) : '—'}
        </td>
        <td className={styles.colRemaining}>
          {renderNet(resolvedRawCost, resolvedPayback, styles, formatCurrencyFn)}
        </td>
      </tr>

      {itemExpanded && (
        <>
          {item.budgetLines.map((line: BreakdownBudgetLine) => (
            <BudgetLineRow
              key={line.id}
              line={line}
              perspective={perspective}
              depth={depth}
              paymentStatus={paymentStatus}
            />
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
  paymentStatus,
}: {
  area: BreakdownArea<BreakdownWorkItem>;
  depth: number;
  sectionKey: 'wi' | 'hi';
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  perspective: CostPerspective;
  formatCurrencyFn: (value: number) => string;
  paymentStatus: 'all' | 'paid' | 'outstanding';
}) {
  const { t } = useTranslation('budget');
  const areaKey = `${sectionKey}-area-${area.areaId ?? 'unassigned'}`;
  const isExpanded = expandedKeys.has(areaKey);

  const resolvedRawCost = resolveAggregateCost(
    area.rawProjectedMin,
    area.rawProjectedMax,
    area.actualCost,
    area.actualCostPaid,
    area.actualCostPending,
    null,
    perspective,
    paymentStatus,
  );
  const resolvedPayback = resolveProjected(
    area.minSubsidyPayback,
    area.subsidyPayback,
    perspective,
  );
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
          {area.subsidyPayback > 0 ? formatCurrencyFn(resolvedPayback) : '—'}
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
                paymentStatus={paymentStatus}
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
              paymentStatus={paymentStatus}
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
  paymentStatus,
}: {
  item: BreakdownHouseholdItem;
  expandKey: string;
  expanded: boolean;
  onToggle: (key: string) => void;
  perspective: CostPerspective;
  depth: number;
  paymentStatus: 'all' | 'paid' | 'outstanding';
}) {
  const { t } = useTranslation('budget');
  const formatCurrencyFn = useFormatterContext();
  const key = expandKey;
  const rowClassName = styles.rowLevel2;

  const resolvedRawCost = resolveAggregateCost(
    item.rawProjectedMin,
    item.rawProjectedMax,
    item.actualCost,
    item.actualCostPaid,
    item.actualCostPending,
    item.costDisplay,
    perspective,
    paymentStatus,
  );
  const resolvedPayback = resolveProjected(
    item.minSubsidyPayback,
    item.subsidyPayback,
    perspective,
  );

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
          <span>-{formatCurrencyFn(resolvedRawCost)}</span>
        </td>
        <td className={styles.colPayback}>
          {item.subsidyPayback > 0 ? formatCurrencyFn(resolvedPayback) : '—'}
        </td>
        <td className={styles.colRemaining}>
          {renderNet(resolvedRawCost, resolvedPayback, styles, formatCurrencyFn)}
        </td>
      </tr>

      {itemExpanded && (
        <>
          {item.budgetLines.map((line: BreakdownBudgetLine) => (
            <BudgetLineRow
              key={line.id}
              line={line}
              perspective={perspective}
              depth={depth}
              paymentStatus={paymentStatus}
            />
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
  paymentStatus,
}: {
  area: BreakdownArea<BreakdownHouseholdItem>;
  depth: number;
  sectionKey: 'wi' | 'hi';
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  perspective: CostPerspective;
  formatCurrencyFn: (value: number) => string;
  paymentStatus: 'all' | 'paid' | 'outstanding';
}) {
  const { t } = useTranslation('budget');
  const areaKey = `${sectionKey}-area-${area.areaId ?? 'unassigned'}`;
  const isExpanded = expandedKeys.has(areaKey);

  const resolvedRawCost = resolveAggregateCost(
    area.rawProjectedMin,
    area.rawProjectedMax,
    area.actualCost,
    area.actualCostPaid,
    area.actualCostPending,
    null,
    perspective,
    paymentStatus,
  );
  const resolvedPayback = resolveProjected(
    area.minSubsidyPayback,
    area.subsidyPayback,
    perspective,
  );
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
          {area.subsidyPayback > 0 ? formatCurrencyFn(resolvedPayback) : '—'}
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
                paymentStatus={paymentStatus}
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
              paymentStatus={paymentStatus}
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
  overview: _overview,
  deselectedSourceIds,
  onSourceToggle,
  onSelectAllSources,
  paymentStatus,
  onPaymentStatusChange,
}: CostBreakdownTableProps) {
  const { t } = useTranslation('budget');
  const { formatCurrency } = useFormatters();
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
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
   * Total raw projected cost (perspective-dependent, payment-aware).
   */
  const totalRawProjected = resolveAggregateCost(
    wiTotals.rawProjectedMin + hiTotals.rawProjectedMin,
    wiTotals.rawProjectedMax + hiTotals.rawProjectedMax,
    wiTotals.actualCost + hiTotals.actualCost,
    wiTotals.actualCostPaid + hiTotals.actualCostPaid,
    wiTotals.actualCostPending + hiTotals.actualCostPending,
    null,
    perspective,
    paymentStatus,
  );

  /**
   * Compute filtered available funds: sum of totalAmount for sources that are not deselected.
   */
  const filteredAvailableFunds = budgetSources
    .filter((s) => !deselectedSourceIds.has(s.id))
    .reduce((sum: number, s) => sum + s.totalAmount, 0);

  // Empty state: only show early-return empty state if there are NO sources configured AND no items.
  // If sources are configured (even if all deselected, which prunes items), render the full table
  // so users can re-enable sources.
  const hasData = wiAreas.length > 0 || hiAreas.length > 0;
  const hasSources = budgetSources.length > 0;

  if (!hasData && !hasSources) {
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

  // Subsidy adjustments section state (extracted from JSX)
  const adjSectionKey = 'adj-section';
  const adjSectionExpanded = expandedKeys.has(adjSectionKey);

  // Source detail rows for expanded available-funds section
  const sourceDetailRows: React.ReactNode[] = availFundsExpanded
    ? budgetSources.map((source: BudgetSourceSummaryBreakdown) => {
        const colorIndex = getSourceColorIndex(source.id);
        const isSelected = !deselectedSourceIds.has(source.id);
        const allocatedCost = resolveAggregateCost(
          source.projectedMin,
          source.projectedMax,
          source.actualCost,
          source.actualCostPaid,
          source.actualCostPending,
          null,
          perspective,
          paymentStatus,
        );
        const payback = resolveProjected(
          source.subsidyPaybackMin,
          source.subsidyPaybackMax,
          perspective,
        );
        const net = source.totalAmount + payback - allocatedCost;
        const rowStyle = {
          '--chip-dot': `var(--color-source-${colorIndex}-dot)`,
        } as React.CSSProperties;
        const displayName =
          source.id === 'unassigned'
            ? t('overview.costBreakdown.sourceFilter.unassigned')
            : source.name;
        return (
          <tr
            key={source.id}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            aria-label={
              isSelected
                ? t('overview.costBreakdown.sourceRow.selectedAriaLabel', { name: displayName })
                : t('overview.costBreakdown.sourceRow.deselectedAriaLabel', { name: displayName })
            }
            className={`${styles.rowSourceDetail} ${styles.rowSourceDetailToggle}`}
            style={rowStyle}
            onClick={() => onSourceToggle(source.id === 'unassigned' ? null : source.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSourceToggle(source.id === 'unassigned' ? null : source.id);
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
                <span>{displayName}</span>
              </div>
            </td>
            <td className={styles.colBudget}>
              <span className={styles.valueNegative}>
                {formatCost(allocatedCost, formatCurrency)}
              </span>
            </td>
            <td className={styles.colPayback}>
              <span className={styles.valuePositive}>{formatCurrency(payback)}</span>
            </td>
            <td className={styles.colRemaining}>
              <span className={net >= 0 ? styles.valuePositive : styles.valueNegative}>
                {formatCurrency(net)}
              </span>
            </td>
          </tr>
        );
      })
    : [];

  return (
    <FormatterContext value={formatCurrency}>
      <BreakdownContext
        value={{
          budgetSources,
        }}
      >
        <section className={styles.breakdownCard} aria-labelledby="breakdown-heading">
          <h2 id="breakdown-heading" className={styles.breakdownTitle}>
            {t('overview.costBreakdown.title')}
          </h2>

          <div className={styles.controlBar}>
            <PerspectiveToggle value={perspective} onChange={setPerspective} />
            <CostBasisSelect value={paymentStatus} onChange={onPaymentStatusChange} />
          </div>

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
                          resolveAggregateCost(
                            wiTotals.rawProjectedMin,
                            wiTotals.rawProjectedMax,
                            wiTotals.actualCost,
                            wiTotals.actualCostPaid,
                            wiTotals.actualCostPending,
                            null,
                            perspective,
                            paymentStatus,
                          ),
                          formatCurrency,
                        )}
                      </td>
                      <td className={styles.colPayback}>
                        {wiTotals.subsidyPayback > 0
                          ? formatCurrency(
                              resolveProjected(
                                wiTotals.minSubsidyPayback,
                                wiTotals.subsidyPayback,
                                perspective,
                              ),
                            )
                          : '—'}
                      </td>
                      <td className={styles.colRemaining}>
                        {renderNet(
                          resolveAggregateCost(
                            wiTotals.rawProjectedMin,
                            wiTotals.rawProjectedMax,
                            wiTotals.actualCost,
                            wiTotals.actualCostPaid,
                            wiTotals.actualCostPending,
                            null,
                            perspective,
                            paymentStatus,
                          ),
                          resolveProjected(
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
                            paymentStatus={paymentStatus}
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
                          resolveAggregateCost(
                            hiTotals.rawProjectedMin,
                            hiTotals.rawProjectedMax,
                            hiTotals.actualCost,
                            hiTotals.actualCostPaid,
                            hiTotals.actualCostPending,
                            null,
                            perspective,
                            paymentStatus,
                          ),
                          formatCurrency,
                        )}
                      </td>
                      <td className={styles.colPayback}>
                        {hiTotals.subsidyPayback > 0
                          ? formatCurrency(
                              resolveProjected(
                                hiTotals.minSubsidyPayback,
                                hiTotals.subsidyPayback,
                                perspective,
                              ),
                            )
                          : '—'}
                      </td>
                      <td className={styles.colRemaining}>
                        {renderNet(
                          resolveAggregateCost(
                            hiTotals.rawProjectedMin,
                            hiTotals.rawProjectedMax,
                            hiTotals.actualCost,
                            hiTotals.actualCostPaid,
                            hiTotals.actualCostPending,
                            null,
                            perspective,
                            paymentStatus,
                          ),
                          resolveProjected(
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
                            paymentStatus={paymentStatus}
                          />
                        ))}
                      </>
                    )}
                  </>
                )}
              </tbody>

              {/* ===== SUBSIDY ADJUSTMENTS SECTION ===== */}
              {subsidyAdjustments.length > 0 && (
                <tbody>
                  <tr className={styles.rowLevel0}>
                    <td className={styles.colName}>
                      <div className={styles.nameContent}>
                        <button
                          type="button"
                          className={styles.expandBtn}
                          aria-expanded={adjSectionExpanded}
                          aria-label={t('overview.costBreakdown.expandSubsidyAdjustments')}
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
                      const adjExcess = resolveProjected(adj.minExcess, adj.maxExcess, perspective);
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
              )}

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
                      {formatCost(totalRawProjected, formatCurrency)}
                    </span>
                  </td>
                  <td className={styles.colPayback}>
                    {maxTotalPayback > 0 ? (
                      <span className={styles.valuePositive}>
                        {formatCurrency(adjustedTotalPayback)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={styles.colRemaining}>
                    {renderNet(totalRawProjected, adjustedTotalPayback, styles, formatCurrency)}
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
                          aria-label={t('overview.costBreakdown.expandAvailableFunds')}
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
                    {deselectedSourceIds.size > 0 && (
                      <span className={styles.availableFundsFilterCaption}>
                        {t('overview.costBreakdown.availableFundsFilter.activeFilterCaption', {
                          selected: String(
                            budgetSources.filter((s) => !deselectedSourceIds.has(s.id)).length,
                          ),
                          total: String(budgetSources.length),
                        })}
                      </span>
                    )}
                  </td>
                </tr>

                {/* Source detail rows as toggle buttons */}
                {availFundsExpanded && sourceDetailRows}

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
                        filteredAvailableFunds - totalRawProjected >= 0
                          ? styles.valuePositive
                          : styles.valueNegative
                      }
                    >
                      {formatCurrency(filteredAvailableFunds - totalRawProjected)}
                    </span>
                  </td>
                  <td className={styles.colPayback} />
                  <td className={styles.colRemaining}>
                    <span
                      className={
                        filteredAvailableFunds - totalRawProjected + adjustedTotalPayback >= 0
                          ? styles.valuePositive
                          : styles.valueNegative
                      }
                    >
                      {formatCurrency(
                        filteredAvailableFunds - totalRawProjected + adjustedTotalPayback,
                      )}
                    </span>
                  </td>
                </tr>
              </tbody>

              {/* Empty state when all sources deselected */}
              {deselectedSourceIds.size > 0 &&
                breakdown.workItems.areas.length === 0 &&
                breakdown.householdItems.areas.length === 0 && (
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
            {deselectedSourceIds.size > 0
              ? t('overview.costBreakdown.sourceFilter.statusAnnouncement', {
                  selected: String(
                    budgetSources.filter((s) => !deselectedSourceIds.has(s.id)).length,
                  ),
                  total: String(budgetSources.length),
                })
              : t('overview.costBreakdown.sourceFilter.allSourcesAnnouncement')}
          </div>
        </section>
      </BreakdownContext>
    </FormatterContext>
  );
}

export default CostBreakdownTable;
