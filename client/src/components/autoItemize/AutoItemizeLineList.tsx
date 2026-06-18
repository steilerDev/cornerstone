import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import type { BadgeVariantMap } from '../Badge/Badge.js';
import type { BudgetSource, Vendor, BudgetCategory } from '@cornerstone/shared';
import { AutoItemizeLineCard } from './AutoItemizeLineCard.js';
import type { LineWithInclude } from './types.js';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import styles from './AutoItemizeLineList.module.css';

interface AutoItemizeLineListProps {
  lines: LineWithInclude[];
  onToggleInclude: (rowId: string) => void;
  onFieldChange: (rowId: string, field: keyof LineWithInclude, value: unknown) => void;
  onAssign: (rowId: string) => void;
  onClearAssign: (rowId: string) => void;
  categories: Array<{ id: string; name: string; translationKey?: string | null }>;
  budgetSources: BudgetSource[];
  discretionarySourceId: string | undefined;
  computedTotal: number;
  variance: number;
  variancePercent: number;
  createdFromExtractionVariants: BadgeVariantMap;
  formatCurrency: (amount: number) => string;
  t: TFunction;
  tSettings: TFunction;
  // New optional props for inline form rendering
  onQueueNewBudgetLine?: (rowId: string) => void;
  onInlineDraftChange?: (rowId: string, updates: Partial<BudgetLineFormState>) => void;
  confidenceLabels?: Record<string, string>;
  vendors?: Vendor[];
  budgetCategories?: BudgetCategory[];
}

export function AutoItemizeLineList({
  lines,
  onToggleInclude,
  onFieldChange,
  onAssign,
  onClearAssign,
  categories,
  budgetSources,
  discretionarySourceId,
  computedTotal,
  variance,
  variancePercent,
  createdFromExtractionVariants,
  formatCurrency,
  t,
  tSettings,
  onQueueNewBudgetLine,
  onInlineDraftChange,
  confidenceLabels,
  vendors,
  budgetCategories,
}: AutoItemizeLineListProps) {
  const hasDiscretionaryLines = useMemo(
    () =>
      discretionarySourceId !== undefined &&
      lines.some((l) => l.budgetSourceId === discretionarySourceId),
    [discretionarySourceId, lines],
  );

  const renderVarianceIndicator = () => {
    if (variancePercent <= 0.01) {
      return (
        <span className={styles.varianceMatch}>
          <span aria-hidden="true">✓</span> {t('autoItemize.varianceMatch')}
        </span>
      );
    }
    if (variancePercent <= 0.05) {
      return (
        <span className={styles.varianceWarning}>
          <span aria-hidden="true">⚠</span>{' '}
          {t('autoItemize.varianceWarning', { amount: formatCurrency(Math.abs(variance)) })}
        </span>
      );
    }
    return (
      <span className={styles.varianceDanger}>
        <span aria-hidden="true">✕</span>{' '}
        {t('autoItemize.varianceDanger', { amount: formatCurrency(Math.abs(variance)) })}
      </span>
    );
  };

  return (
    <>
      {hasDiscretionaryLines && (
        <p
          role="note"
          className={styles.discretionaryNote}
          aria-label={t('autoItemize.discretionaryFundingNote')}
        >
          <svg
            className={styles.discretionaryNoteIcon}
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6.5" />
            <line x1="8" y1="5.5" x2="8" y2="5.5" strokeLinecap="round" strokeWidth="2" />
            <line x1="8" y1="7.5" x2="8" y2="11" strokeLinecap="round" />
          </svg>
          <span>{t('autoItemize.discretionaryFundingNote')}</span>
        </p>
      )}
      {lines.length === 0 ? (
        <p className={styles.emptyMessage}>{t('autoItemize.noLineItems')}</p>
      ) : (
        <ul
          role="list"
          className={styles.lineList}
          aria-label={t('autoItemize.lineItemsListLabel')}
        >
          {lines.map((line) => (
            <AutoItemizeLineCard
              key={line.rowId}
              line={line}
              onToggleInclude={onToggleInclude}
              onFieldChange={onFieldChange}
              onAssign={onAssign}
              onClearAssign={onClearAssign}
              categories={categories}
              budgetSources={budgetSources}
              createdFromExtractionVariants={createdFromExtractionVariants}
              t={t}
              tSettings={tSettings}
              onQueueNewBudgetLine={onQueueNewBudgetLine}
              onInlineDraftChange={onInlineDraftChange}
              confidenceLabels={confidenceLabels}
              vendors={vendors}
              budgetCategories={budgetCategories}
            />
          ))}
        </ul>
      )}

      {/* Totals card */}
      <div className={styles.totalsCard}>
        <span>{t('autoItemize.total')}</span>
        <span className={styles.totalsAmount}>{formatCurrency(computedTotal)}</span>
        {renderVarianceIndicator()}
      </div>
    </>
  );
}
