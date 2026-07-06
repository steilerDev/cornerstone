import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import type { BadgeVariantMap } from '../Badge/Badge.js';
import type { BudgetSource, Vendor, BudgetCategory } from '@cornerstone/shared';
import { AutoItemizeLineCard } from './AutoItemizeLineCard.js';
import { MergingLineCard } from './MergingLineCard.js';
import { Badge } from '../Badge/Badge.js';
import badgeStyles from '../Badge/Badge.module.css';
import { SelectionActionBar } from '../SelectionActionBar/SelectionActionBar.js';
import type { LineWithInclude } from './types.js';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import sharedStyles from '../../styles/shared.module.css';
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
  // Merge selection props
  selectedRowIds?: Set<string>;
  onToggleSelect?: (rowId: string) => void;
  onClearSelection?: () => void;
  onMergeSelected?: () => void;
  onRetryMerge?: (rowId: string) => void;
  onUndoMerge?: (rowId: string) => void;
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
  selectedRowIds = new Set(),
  onToggleSelect,
  onClearSelection,
  onMergeSelected,
  onRetryMerge,
  onUndoMerge,
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
        <>
          <ul
            role="list"
            className={styles.lineList}
            aria-label={t('autoItemize.lineItemsListLabel')}
          >
            {lines.map((line) => {
              if (line.mergeStatus === 'pending') {
                return (
                  <MergingLineCard
                    key={line.rowId}
                    caption={t('autoItemize.mergingCaption', {
                      count: line.mergeSourceLines?.length ?? 0,
                    })}
                  />
                );
              }

              if (line.mergeStatus === 'error') {
                const mergeErrorVariants: BadgeVariantMap = {
                  error: {
                    label: t('autoItemize.mergeErrorBadge'),
                    className: badgeStyles.error,
                  },
                };

                return (
                  <li
                    key={line.rowId}
                    className={`${styles.lineCard} ${styles.lineCardMergeError}`}
                    role="alert"
                  >
                    <Badge variants={mergeErrorVariants} value="error" testId="merge-error-badge" />
                    <p className={styles.mergeErrorMessage}>{t('autoItemize.mergeErrorMessage')}</p>
                    <div className={styles.mergeErrorActions}>
                      <button
                        type="button"
                        className={sharedStyles.btnSecondaryCompact}
                        onClick={() => onUndoMerge?.(line.rowId)}
                      >
                        {t('autoItemize.mergeUndoButton')}
                      </button>
                      <button
                        type="button"
                        id={`merge-retry-${line.rowId}`}
                        className={sharedStyles.btnPrimaryCompact}
                        onClick={() => onRetryMerge?.(line.rowId)}
                      >
                        {t('autoItemize.mergeRetryButton')}
                      </button>
                    </div>
                  </li>
                );
              }

              // Normal line card
              const selectable = !line.assignedBudgetLineId && !line.inlineCreatedBudgetLineDraft;
              return (
                <AutoItemizeLineCard
                  key={line.rowId}
                  line={line}
                  selected={selectedRowIds.has(line.rowId)}
                  selectable={selectable}
                  onToggleSelect={selectable ? onToggleSelect : undefined}
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
              );
            })}
          </ul>

          {/* Selection action bar */}
          {selectedRowIds.size > 0 && (
            <SelectionActionBar
              countLabel={t('autoItemize.mergeSelectedCount', { count: selectedRowIds.size })}
              onClear={onClearSelection ?? (() => {})}
              clearLabel={t('autoItemize.clearSelection')}
            >
              <button
                type="button"
                className={sharedStyles.btnPrimaryCompact}
                disabled={selectedRowIds.size < 2}
                aria-disabled={selectedRowIds.size < 2}
                aria-label={t('autoItemize.mergeButtonAriaLabel', { count: selectedRowIds.size })}
                onClick={onMergeSelected ?? (() => {})}
              >
                {t('autoItemize.mergeButton')}
              </button>
              {selectedRowIds.size === 1 && (
                <span className={sharedStyles.srOnly}>{t('autoItemize.mergeDisabledHint')}</span>
              )}
            </SelectionActionBar>
          )}
        </>
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
