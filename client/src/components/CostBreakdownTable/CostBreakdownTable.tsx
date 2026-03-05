import { useState, useMemo } from 'react';
import type {
  BudgetBreakdown,
  BudgetOverview,
  BreakdownWorkItemCategory,
  BreakdownWorkItem,
  BreakdownBudgetLine,
  BreakdownHouseholdItemCategory,
  BreakdownHouseholdItem,
  ConfidenceLevel,
  HouseholdItemCategory,
} from '@cornerstone/shared';
import { CONFIDENCE_MARGINS } from '@cornerstone/shared';
import { formatCurrency } from '../../lib/formatters.js';
import styles from './CostBreakdownTable.module.css';

interface CostBreakdownTableProps {
  breakdown: BudgetBreakdown;
  overview: BudgetOverview;
  selectedCategories: Set<string | null>;
}

/**
 * Human-readable label for household item category.
 */
const HI_CATEGORY_LABELS: Record<HouseholdItemCategory, string> = {
  furniture: 'Furniture',
  appliances: 'Appliances',
  fixtures: 'Fixtures',
  decor: 'Decor',
  electronics: 'Electronics',
  outdoor: 'Outdoor',
  storage: 'Storage',
  other: 'Other',
};

/**
 * Renders a confidence badge (e.g., "own_estimate") for a budget line.
 */
function ConfidenceBadge({ confidence }: { confidence: ConfidenceLevel }) {
  const label = confidence.replace(/_/g, ' ').toLowerCase();
  return <span className={styles.confidenceBadge}>{label}</span>;
}

/**
 * Renders a cost value based on costDisplay mode.
 * Note: For 'projected' mode, uses neutral color (not valuePositive) per accessibility requirements.
 */
function CostDisplay({
  costDisplay,
  projectedMin,
  projectedMax,
  actualCost,
}: {
  costDisplay: 'actual' | 'projected' | 'mixed';
  projectedMin: number;
  projectedMax: number;
  actualCost: number;
}) {
  const isPositive = actualCost >= 0 && projectedMax >= 0;

  if (costDisplay === 'actual') {
    return (
      <span className={isPositive ? styles.valuePositive : styles.valueNegative}>
        Actual: {formatCurrency(actualCost)}
      </span>
    );
  }

  if (costDisplay === 'projected') {
    return (
      <span>
        {formatCurrency(projectedMin)} – {formatCurrency(projectedMax)}
      </span>
    );
  }

  // mixed
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-0-5)' }}>
      <span className={styles.valuePositive}>Actual: {formatCurrency(actualCost)}</span>
      <span>
        Projected: {formatCurrency(projectedMin)} – {formatCurrency(projectedMax)}
      </span>
    </div>
  );
}

/**
 * Renders a single budget line row (Level 3).
 */
function BudgetLineRow({ line }: { line: BreakdownBudgetLine }) {
  const key = `line-${line.id}`;
  const margin = CONFIDENCE_MARGINS[line.confidence];
  const costMin = line.plannedAmount * (1 - margin);
  const costMax = line.plannedAmount * (1 + margin);

  return (
    <tr className={styles.rowLevel3} key={key}>
      <td className={styles.colName}>
        <div className={styles.nameContent}>
          <span>{line.description || 'Untitled'}</span>
          <ConfidenceBadge confidence={line.confidence} />
        </div>
      </td>
      <td className={styles.colBudget}>
        {line.hasInvoice ? (
          <span>Actual: {formatCurrency(line.actualCost)}</span>
        ) : (
          <span>
            {formatCurrency(costMin)} – {formatCurrency(costMax)}
          </span>
        )}
      </td>
      <td className={styles.colPayback}>—</td>
      <td className={styles.colRemaining} />
    </tr>
  );
}

/**
 * Renders a single work item row (Level 2) with optional expansion for budget lines.
 */
function WorkItemRow({
  item,
  expanded: itemExpanded,
  onToggle,
}: {
  item: BreakdownWorkItem;
  expanded: boolean;
  onToggle: (key: string) => void;
}) {
  const key = `wi-item-${item.workItemId}`;

  return (
    <>
      <tr className={styles.rowLevel2} key={key}>
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
            <span>{item.title}</span>
          </div>
        </td>
        <td className={styles.colBudget}>
          <CostDisplay
            costDisplay={item.costDisplay}
            projectedMin={item.projectedMin}
            projectedMax={item.projectedMax}
            actualCost={item.actualCost}
          />
        </td>
        <td className={styles.colPayback}>
          {item.subsidyPayback === 0 ? '—' : formatCurrency(item.subsidyPayback)}
        </td>
        <td className={styles.colRemaining} />
      </tr>

      {itemExpanded && (
        <>
          {item.budgetLines.map((line) => (
            <BudgetLineRow key={line.id} line={line} />
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
}: {
  category: BreakdownWorkItemCategory;
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
}) {
  const key = `wi-cat-${category.categoryId ?? 'null'}`;
  const isExpanded = expandedKeys.has(key);

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
        <td className={styles.colBudget}>
          {formatCurrency(category.projectedMin)} – {formatCurrency(category.projectedMax)}
        </td>
        <td className={styles.colPayback}>
          {category.subsidyPayback === 0 ? '—' : formatCurrency(category.subsidyPayback)}
        </td>
        <td className={styles.colRemaining} />
      </tr>

      {isExpanded && (
        <>
          {category.items.map((item) => (
            <WorkItemRow
              key={item.workItemId}
              item={item}
              expanded={expandedKeys.has(`wi-item-${item.workItemId}`)}
              onToggle={onToggle}
            />
          ))}

          {/* Sum row for this category */}
          <tr className={styles.rowSum} key={`${key}-sum`}>
            <td className={`${styles.colName} ${styles.cellSumName}`}>
              <div className={styles.nameContent}>
                <span>Total {category.categoryName}</span>
              </div>
            </td>
            <td className={styles.colBudget}>
              {formatCurrency(category.projectedMin)} – {formatCurrency(category.projectedMax)}
            </td>
            <td className={styles.colPayback}>
              {category.subsidyPayback === 0 ? '—' : formatCurrency(category.subsidyPayback)}
            </td>
            <td className={styles.colRemaining} />
          </tr>
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
  expanded: itemExpanded,
  onToggle,
}: {
  item: BreakdownHouseholdItem;
  expanded: boolean;
  onToggle: (key: string) => void;
}) {
  const key = `hi-item-${item.householdItemId}`;

  return (
    <>
      <tr className={styles.rowLevel2} key={key}>
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
            <span>{item.name}</span>
          </div>
        </td>
        <td className={styles.colBudget}>
          <CostDisplay
            costDisplay={item.costDisplay}
            projectedMin={item.projectedMin}
            projectedMax={item.projectedMax}
            actualCost={item.actualCost}
          />
        </td>
        <td className={styles.colPayback}>
          {item.subsidyPayback === 0 ? '—' : formatCurrency(item.subsidyPayback)}
        </td>
        <td className={styles.colRemaining} />
      </tr>

      {itemExpanded && (
        <>
          {item.budgetLines.map((line) => (
            <BudgetLineRow key={line.id} line={line} />
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
}: {
  category: BreakdownHouseholdItemCategory;
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
}) {
  const key = `hi-cat-${category.hiCategory}`;
  const isExpanded = expandedKeys.has(key);
  const categoryLabel = HI_CATEGORY_LABELS[category.hiCategory];

  return (
    <>
      <tr className={styles.rowLevel1} key={key}>
        <td className={`${styles.colName} ${styles.cellLevel1Name}`}>
          <div className={styles.nameContent}>
            <button
              type="button"
              className={styles.expandBtn}
              aria-expanded={isExpanded}
              aria-label={`Expand ${categoryLabel}`}
              onClick={() => onToggle(key)}
            >
              <ChevronSvg className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`} />
            </button>
            <span>{categoryLabel}</span>
          </div>
        </td>
        <td className={styles.colBudget}>
          {formatCurrency(category.projectedMin)} – {formatCurrency(category.projectedMax)}
        </td>
        <td className={styles.colPayback}>
          {category.subsidyPayback === 0 ? '—' : formatCurrency(category.subsidyPayback)}
        </td>
        <td className={styles.colRemaining} />
      </tr>

      {isExpanded && (
        <>
          {category.items.map((item) => (
            <HouseholdItemRow
              key={item.householdItemId}
              item={item}
              expanded={expandedKeys.has(`hi-item-${item.householdItemId}`)}
              onToggle={onToggle}
            />
          ))}

          {/* Sum row for this category */}
          <tr className={styles.rowSum} key={`${key}-sum`}>
            <td className={`${styles.colName} ${styles.cellSumName}`}>
              <div className={styles.nameContent}>
                <span>Total {categoryLabel}</span>
              </div>
            </td>
            <td className={styles.colBudget}>
              {formatCurrency(category.projectedMin)} – {formatCurrency(category.projectedMax)}
            </td>
            <td className={styles.colPayback}>
              {category.subsidyPayback === 0 ? '—' : formatCurrency(category.subsidyPayback)}
            </td>
            <td className={styles.colRemaining} />
          </tr>
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
}: CostBreakdownTableProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

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
    let actualCost = 0;
    let subsidyPayback = 0;

    visibleWICategories.forEach((cat) => {
      projectedMin += cat.projectedMin;
      projectedMax += cat.projectedMax;
      actualCost += cat.actualCost;
      subsidyPayback += cat.subsidyPayback;
    });

    return { projectedMin, projectedMax, actualCost, subsidyPayback };
  }, [visibleWICategories]);

  const hiTotals = breakdown.householdItems.totals;

  /**
   * Remaining = availableFunds - (WI projectedMax + HI projectedMax).
   * Use pessimistic view (max) as per the spec.
   */
  const remaining = overview.availableFunds - (wiTotals.projectedMax + hiTotals.projectedMax);

  // Empty state
  const hasData = visibleWICategories.length > 0 || breakdown.householdItems.categories.length > 0;

  if (!hasData) {
    return (
      <section className={styles.breakdownCard} aria-labelledby="breakdown-heading">
        <h2 id="breakdown-heading" className={styles.breakdownTitle}>
          Cost Breakdown
        </h2>
        <div className={styles.emptyState}>No budget data to display</div>
      </section>
    );
  }

  const wiSectionKey = 'wi-section';
  const hiSectionKey = 'hi-section';
  const wiSectionExpanded = expandedKeys.has(wiSectionKey);
  const hiSectionExpanded = expandedKeys.has(hiSectionKey);

  return (
    <section className={styles.breakdownCard} aria-labelledby="breakdown-heading">
      <h2 id="breakdown-heading" className={styles.breakdownTitle}>
        Cost Breakdown
      </h2>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>Budget cost breakdown by category and item</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.colName}>
                Name
              </th>
              <th scope="col" className={styles.colBudget}>
                Budget
              </th>
              <th scope="col" className={styles.colPayback}>
                Payback
              </th>
              <th scope="col" className={styles.colRemaining}>
                Remaining
              </th>
            </tr>
          </thead>

          <tbody>
            {/* Sources row (not expandable) */}
            <tr className={styles.rowLevel0}>
              <td className={styles.colName}>
                <div className={styles.nameContent}>
                  <span>Available Funds</span>
                </div>
              </td>
              <td className={styles.colBudget}>{formatCurrency(overview.availableFunds)}</td>
              <td className={styles.colPayback}>—</td>
              <td className={styles.colRemaining}>—</td>
            </tr>

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
                      <span>Work Item Budget</span>
                    </div>
                  </td>
                  <td className={styles.colBudget}>
                    {formatCurrency(wiTotals.projectedMin)} –{' '}
                    {formatCurrency(wiTotals.projectedMax)}
                  </td>
                  <td className={styles.colPayback}>{formatCurrency(wiTotals.subsidyPayback)}</td>
                  <td className={styles.colRemaining}>—</td>
                </tr>

                {wiSectionExpanded && (
                  <>
                    {visibleWICategories.map((category) => (
                      <WorkItemCategorySection
                        key={category.categoryId ?? '__uncategorized__'}
                        category={category}
                        expandedKeys={expandedKeys}
                        onToggle={toggle}
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
                      <span>Household Item Budget</span>
                    </div>
                  </td>
                  <td className={styles.colBudget}>
                    {formatCurrency(hiTotals.projectedMin)} –{' '}
                    {formatCurrency(hiTotals.projectedMax)}
                  </td>
                  <td className={styles.colPayback}>{formatCurrency(hiTotals.subsidyPayback)}</td>
                  <td className={styles.colRemaining}>—</td>
                </tr>

                {hiSectionExpanded && (
                  <>
                    {breakdown.householdItems.categories.map((category) => (
                      <HouseholdItemCategorySection
                        key={category.hiCategory}
                        category={category}
                        expandedKeys={expandedKeys}
                        onToggle={toggle}
                      />
                    ))}
                  </>
                )}
              </>
            )}

            {/* Remaining row (not expandable, colored) */}
            <tr className={styles.rowLevel0}>
              <td className={styles.colName}>
                <div className={styles.nameContent}>
                  <span>Remaining</span>
                </div>
              </td>
              <td className={styles.colBudget}>
                <span className={remaining >= 0 ? styles.valuePositive : styles.valueNegative}>
                  {formatCurrency(remaining)}
                </span>
              </td>
              <td className={styles.colPayback}>—</td>
              <td className={styles.colRemaining}>—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default CostBreakdownTable;
