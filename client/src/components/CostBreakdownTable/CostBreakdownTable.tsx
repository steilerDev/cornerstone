import { useState, useMemo, useRef, createContext, useContext } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  BudgetBreakdown,
  BudgetOverview,
  BreakdownWorkItemCategory,
  BreakdownWorkItem,
  BreakdownBudgetLine,
  BreakdownHouseholdItemCategory,
  BreakdownHouseholdItem,
  ConfidenceLevel,
  BudgetSource,
} from '@cornerstone/shared';
import { CONFIDENCE_MARGINS } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
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

type CostPerspective = 'min' | 'max' | 'avg';

interface CostBreakdownTableProps {
  breakdown: BudgetBreakdown;
  overview: BudgetOverview;
  selectedCategories: Set<string | null>;
  budgetSources: BudgetSource[];
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
      const next = options[(idx + 1) % options.length];
      onChange(next.value);
      const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      buttons?.[(idx + 1) % options.length]?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = options[(idx - 1 + options.length) % options.length];
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
}: {
  line: BreakdownBudgetLine;
  perspective: CostPerspective;
}) {
  const { t } = useTranslation('budget');
  const formatCurrencyFn = useFormatterContext();
  const key = `line-${line.id}`;
  const margin = CONFIDENCE_MARGINS[line.confidence];
  const costMin = line.plannedAmount * (1 - margin);
  const costMax = line.plannedAmount * (1 + margin);
  const perspectiveValue = resolveProjected(costMin, costMax, perspective);
  const rowClassName = styles.rowLevel3;

  const resolvedRawCost = line.hasInvoice ? line.actualCost : perspectiveValue;

  // Calculate quoted range (±5%)
  const quotedMin = line.actualCost * 0.95;
  const quotedMax = line.actualCost * 1.05;

  return (
    <tr className={rowClassName} key={key}>
      <td className={styles.colName}>
        <div className={styles.nameContent}>
          <span>{line.description || 'Untitled'}</span>
          {line.isQuotation ? (
            <span className={styles.quotedBadge}>{t('overview.costBreakdown.quoted')}</span>
          ) : line.hasInvoice ? (
            <span className={styles.invoicedBadge}>invoiced</span>
          ) : (
            <ConfidenceBadge confidence={line.confidence} />
          )}
        </div>
      </td>
      <td className={styles.colBudget}>
        {line.isQuotation ? (
          <span>{formatCurrencyFn(quotedMin)} – {formatCurrencyFn(quotedMax)}</span>
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
}: {
  item: BreakdownWorkItem;
  expandKey: string;
  expanded: boolean;
  onToggle: (key: string) => void;
  perspective: CostPerspective;
}) {
  const { t } = useTranslation('budget');
  const formatCurrencyFn = useFormatterContext();
  const key = expandKey;
  const rowClassName = styles.rowLevel2;

  const resolvedRawCost =
    item.costDisplay === 'actual'
      ? item.actualCost
      : resolveProjected(item.rawProjectedMin, item.rawProjectedMax, perspective);
  const resolvedPayback = resolveProjected(
    item.minSubsidyPayback,
    item.subsidyPayback,
    perspective,
  );

  return (
    <>
      <tr className={rowClassName} key={key}>
        <td className={styles.colName}>
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
          {item.costDisplay === 'actual' ? (
            <span>-{formatCurrencyFn(item.actualCost)}</span>
          ) : (
            <span>-{formatCurrencyFn(resolvedRawCost)}</span>
          )}
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
            <BudgetLineRow key={line.id} line={line} perspective={perspective} />
          ))}
        </>
      )}
    </>
  );
}

/**
 * Renders a work item category (Level 1) with optional expansion for items.
 */
function WorkItemCategorySection({
  category,
  expandedKeys,
  onToggle,
  perspective,
}: {
  category: BreakdownWorkItemCategory;
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  perspective: CostPerspective;
}) {
  const formatCurrencyFn = useFormatterContext();
  const key = `wi-cat-${category.categoryId ?? 'null'}`;
  const isExpanded = expandedKeys.has(key);
  const resolvedRawCost = resolveProjected(
    category.rawProjectedMin,
    category.rawProjectedMax,
    perspective,
  );
  const resolvedPayback = resolveProjected(
    category.minSubsidyPayback,
    category.subsidyPayback,
    perspective,
  );

  return (
    <>
      <tr className={styles.rowLevel1} key={key}>
        <td className={`${styles.colName} ${styles.cellLevel1Name}`}>
          <div className={styles.nameContent}>
            <button
              type="button"
              className={styles.expandBtn}
              aria-expanded={isExpanded}
              aria-label={`Expand ${category.categoryName}`}
              onClick={() => onToggle(key)}
            >
              <ChevronSvg className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`} />
            </button>
            <span>{category.categoryName}</span>
          </div>
        </td>
        <td className={styles.colBudget}>-{formatCurrencyFn(resolvedRawCost)}</td>
        <td className={styles.colPayback}>
          {category.subsidyPayback > 0 ? formatCurrencyFn(resolvedPayback) : '—'}
        </td>
        <td className={styles.colRemaining}>
          {renderNet(resolvedRawCost, resolvedPayback, styles, formatCurrencyFn)}
        </td>
      </tr>

      {isExpanded && (
        <>
          {category.items.map((item: BreakdownWorkItem) => {
            const itemKey = `wi-cat-${category.categoryId ?? 'null'}-item-${item.workItemId}`;
            return (
              <WorkItemRow
                key={item.workItemId}
                item={item}
                expandKey={itemKey}
                expanded={expandedKeys.has(itemKey)}
                onToggle={onToggle}
                perspective={perspective}
              />
            );
          })}
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
}: {
  item: BreakdownHouseholdItem;
  expandKey: string;
  expanded: boolean;
  onToggle: (key: string) => void;
  perspective: CostPerspective;
}) {
  const { t } = useTranslation('budget');
  const formatCurrencyFn = useFormatterContext();
  const key = expandKey;
  const rowClassName = styles.rowLevel2;

  const resolvedRawCost =
    item.costDisplay === 'actual'
      ? item.actualCost
      : resolveProjected(item.rawProjectedMin, item.rawProjectedMax, perspective);
  const resolvedPayback = resolveProjected(
    item.minSubsidyPayback,
    item.subsidyPayback,
    perspective,
  );

  return (
    <>
      <tr className={rowClassName} key={key}>
        <td className={styles.colName}>
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
          {item.costDisplay === 'actual' ? (
            <span>-{formatCurrencyFn(item.actualCost)}</span>
          ) : (
            <span>-{formatCurrencyFn(resolvedRawCost)}</span>
          )}
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
            <BudgetLineRow key={line.id} line={line} perspective={perspective} />
          ))}
        </>
      )}
    </>
  );
}

/**
 * Renders a household item category (Level 1) with optional expansion for items.
 */
function HouseholdItemCategorySection({
  category,
  expandedKeys,
  onToggle,
  perspective,
}: {
  category: BreakdownHouseholdItemCategory;
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  perspective: CostPerspective;
}) {
  const formatCurrencyFn = useFormatterContext();
  const key = `hi-cat-${category.hiCategory}`;
  const isExpanded = expandedKeys.has(key);
  const resolvedRawCost = resolveProjected(
    category.rawProjectedMin,
    category.rawProjectedMax,
    perspective,
  );
  const resolvedPayback = resolveProjected(
    category.minSubsidyPayback,
    category.subsidyPayback,
    perspective,
  );

  return (
    <>
      <tr className={styles.rowLevel1} key={key}>
        <td className={`${styles.colName} ${styles.cellLevel1Name}`}>
          <div className={styles.nameContent}>
            <button
              type="button"
              className={styles.expandBtn}
              aria-expanded={isExpanded}
              aria-label={`Expand ${category.hiCategory}`}
              onClick={() => onToggle(key)}
            >
              <ChevronSvg className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`} />
            </button>
            <span>{category.hiCategory}</span>
          </div>
        </td>
        <td className={styles.colBudget}>-{formatCurrencyFn(resolvedRawCost)}</td>
        <td className={styles.colPayback}>
          {category.subsidyPayback > 0 ? formatCurrencyFn(resolvedPayback) : '—'}
        </td>
        <td className={styles.colRemaining}>
          {renderNet(resolvedRawCost, resolvedPayback, styles, formatCurrencyFn)}
        </td>
      </tr>

      {isExpanded && (
        <>
          {category.items.map((item: BreakdownHouseholdItem) => {
            const itemKey = `hi-cat-${category.hiCategory}-item-${item.householdItemId}`;
            return (
              <HouseholdItemRow
                key={item.householdItemId}
                item={item}
                expandKey={itemKey}
                expanded={expandedKeys.has(itemKey)}
                onToggle={onToggle}
                perspective={perspective}
              />
            );
          })}
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
  selectedCategories,
  budgetSources,
}: CostBreakdownTableProps) {
  const { t } = useTranslation('budget');
  const { formatCurrency } = useFormatters();
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [perspective, setPerspective] = useState<CostPerspective>('avg');

  const toggle = (key: string) => {
    const next = new Set(expandedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setExpandedKeys(next);
  };

  /**
   * Filter work item categories based on selectedCategories filter.
   * HI categories are NOT filtered.
   */
  const visibleWICategories = useMemo(() => {
    if (selectedCategories.size === 0) {
      return breakdown.workItems.categories;
    }
    return breakdown.workItems.categories.filter((cat) => selectedCategories.has(cat.categoryId));
  }, [breakdown.workItems.categories, selectedCategories]);

  /**
   * Recalculate WI totals from visible categories only.
   */
  const wiTotals = useMemo(() => {
    let projectedMin = 0;
    let projectedMax = 0;
    let rawProjectedMin = 0;
    let rawProjectedMax = 0;
    let actualCost = 0;
    let subsidyPayback = 0;
    let minSubsidyPayback = 0;

    visibleWICategories.forEach((cat: BreakdownWorkItemCategory) => {
      projectedMin += cat.projectedMin;
      projectedMax += cat.projectedMax;
      rawProjectedMin += cat.rawProjectedMin;
      rawProjectedMax += cat.rawProjectedMax;
      actualCost += cat.actualCost;
      subsidyPayback += cat.subsidyPayback;
      minSubsidyPayback += cat.minSubsidyPayback;
    });

    return {
      projectedMin,
      projectedMax,
      rawProjectedMin,
      rawProjectedMax,
      actualCost,
      subsidyPayback,
      minSubsidyPayback,
    };
  }, [visibleWICategories]);

  const hiTotals = breakdown.householdItems.totals;

  /**
   * Total payback from all sources (min and max).
   */
  const maxTotalPayback = wiTotals.subsidyPayback + hiTotals.subsidyPayback;
  const minTotalPayback = wiTotals.minSubsidyPayback + hiTotals.minSubsidyPayback;
  const resolvedTotalPayback = resolveProjected(minTotalPayback, maxTotalPayback, perspective);

  /**
   * Total raw projected cost (perspective-dependent).
   */
  const totalRawProjected = resolveProjected(
    wiTotals.rawProjectedMin + hiTotals.rawProjectedMin,
    wiTotals.rawProjectedMax + hiTotals.rawProjectedMax,
    perspective,
  );

  /**
   * Sum = availableFunds - totalRawProjected + resolvedTotalPayback.
   */
  const sum = overview.availableFunds - totalRawProjected + resolvedTotalPayback;

  // Empty state
  const hasData = visibleWICategories.length > 0 || breakdown.householdItems.categories.length > 0;

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
      <section className={styles.breakdownCard} aria-labelledby="breakdown-heading">
        <h2 id="breakdown-heading" className={styles.breakdownTitle}>
          {t('overview.costBreakdown.title')}
        </h2>

        <PerspectiveToggle value={perspective} onChange={setPerspective} />

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>Budget cost breakdown by category and item</caption>
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
            <tbody className={styles.costSection}>
              {/* Work Item Budget row (expandable) */}
              {visibleWICategories.length > 0 && (
                <>
                  <tr className={styles.rowLevel0} key={wiSectionKey}>
                    <td className={styles.colName}>
                      <div className={styles.nameContent}>
                        <button
                          type="button"
                          className={styles.expandBtn}
                          aria-expanded={wiSectionExpanded}
                          aria-label="Expand work item budget categories"
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
                        resolveProjected(
                          wiTotals.rawProjectedMin,
                          wiTotals.rawProjectedMax,
                          perspective,
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
                        resolveProjected(
                          wiTotals.rawProjectedMin,
                          wiTotals.rawProjectedMax,
                          perspective,
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
                      {visibleWICategories.map((category: BreakdownWorkItemCategory) => (
                        <WorkItemCategorySection
                          key={category.categoryId ?? '__uncategorized__'}
                          category={category}
                          expandedKeys={expandedKeys}
                          onToggle={toggle}
                          perspective={perspective}
                        />
                      ))}
                    </>
                  )}
                </>
              )}

              {/* Household Item Budget row (expandable) */}
              {breakdown.householdItems.categories.length > 0 && (
                <>
                  <tr className={styles.rowLevel0} key={hiSectionKey}>
                    <td className={styles.colName}>
                      <div className={styles.nameContent}>
                        <button
                          type="button"
                          className={styles.expandBtn}
                          aria-expanded={hiSectionExpanded}
                          aria-label="Expand household item budget categories"
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
                        resolveProjected(
                          hiTotals.rawProjectedMin,
                          hiTotals.rawProjectedMax,
                          perspective,
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
                        resolveProjected(
                          hiTotals.rawProjectedMin,
                          hiTotals.rawProjectedMax,
                          perspective,
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
                      {breakdown.householdItems.categories.map(
                        (category: BreakdownHouseholdItemCategory) => (
                          <HouseholdItemCategorySection
                            key={category.hiCategory}
                            category={category}
                            expandedKeys={expandedKeys}
                            onToggle={toggle}
                            perspective={perspective}
                          />
                        ),
                      )}
                    </>
                  )}
                </>
              )}
            </tbody>

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
                      {formatCurrency(resolvedTotalPayback)}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={styles.colRemaining}>
                  {renderNet(totalRawProjected, resolvedTotalPayback, styles, formatCurrency)}
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
                  {formatCurrency(overview.availableFunds)}
                </td>
              </tr>

              {/* Budget source sub-rows */}
              {availFundsExpanded &&
                budgetSources.map((source: BudgetSource) => (
                  <tr key={source.id} className={styles.rowSourceDetail}>
                    <td className={styles.colName}>
                      <div className={`${styles.nameContent} ${styles.nameIndented}`}>
                        <span>{source.name}</span>
                      </div>
                    </td>
                    <td className={styles.colBudget} colSpan={3}>
                      {formatCurrency(source.totalAmount)}
                    </td>
                  </tr>
                ))}

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
                      overview.availableFunds - totalRawProjected >= 0
                        ? styles.valuePositive
                        : styles.valueNegative
                    }
                  >
                    {formatCurrency(overview.availableFunds - totalRawProjected)}
                  </span>
                </td>
                <td className={styles.colPayback} />
                <td className={styles.colRemaining}>
                  <span className={sum >= 0 ? styles.valuePositive : styles.valueNegative}>
                    {formatCurrency(sum)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </FormatterContext.Provider>
  );
}

export default CostBreakdownTable;
