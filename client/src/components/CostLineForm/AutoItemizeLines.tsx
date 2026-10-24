import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AUTO_ITEMIZE_GRID_OPTIONS,
  AUTO_ITEMIZE_GRID_PREFIX,
} from '../../hooks/useAutoItemizeLines.js';
import type { UseAutoItemizeLinesReturn } from '../../hooks/useAutoItemizeLines.js';
import { isNewBudgetLineRow } from '../../lib/autoItemizeDraftUtils.js';
import { useFormatters } from '../../lib/formatters.js';
import sharedStyles from '../../styles/shared.module.css';
import { CostLineGrid } from './CostLineGrid.js';
import { isBlankRow } from './costLineGridModel.js';
import type { CostLineGridRow } from './types.js';
import { SelectionActionBar } from '../SelectionActionBar/SelectionActionBar.js';
import styles from './AutoItemizeLines.module.css';

export interface AutoItemizeLinesProps {
  /** The page's `useAutoItemizeLines()` result. */
  readonly state: UseAutoItemizeLinesReturn;
  /** Gross total of the included rows. */
  readonly computedTotal: number;
  /** Total minus the invoice amount. */
  readonly variance: number;
  /** |variance| as a fraction of the invoice amount. */
  readonly variancePercent: number;
  /** The page's one live region. */
  readonly onAnnounce: (message: string) => void;
}

/**
 * The lines of both Split with AI pages: the shared cost line grid (Include toggles, merge
 * selection, category, funding source, Belongs to), the Merge bar under it and the total with its
 * variance against the invoice amount.
 */
export function AutoItemizeLines({
  state,
  computedTotal,
  variance,
  variancePercent,
  onAnnounce,
}: AutoItemizeLinesProps) {
  const { t } = useTranslation('budget');
  const { formatCurrency } = useFormatters();
  const hintId = useId();
  const { rows, selectedRowIds, options } = state;

  const discretionaryId = options.discretionarySourceId;
  const hasDiscretionaryLines =
    discretionaryId !== null &&
    rows.some((row) => isNewBudgetLineRow(row) && row.budgetSourceId === discretionaryId);
  const hasLines = rows.some((row) => !isBlankRow(row));
  const canMerge = selectedRowIds.size >= 2;

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

  const renderRowExtra = (row: CostLineGridRow) =>
    row.aiCertainty === undefined ? null : (
      <span className={styles.certainty}>
        {t('autoItemize.aiCertainty', { percent: Math.round(row.aiCertainty * 100) })}
      </span>
    );

  return (
    <>
      {hasDiscretionaryLines && (
        <p role="note" className={styles.discretionaryNote}>
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
      {!hasLines && <p className={styles.emptyMessage}>{t('autoItemize.noLineItems')}</p>}
      <CostLineGrid
        rows={rows}
        onRowsChange={state.onRowsChange}
        options={AUTO_ITEMIZE_GRID_OPTIONS}
        assignAll={state.assignAll}
        onAssignAllChange={state.setAssignAll}
        categoryOptions={options.categoryOptions}
        sourceOptions={options.sourceOptions}
        showAllErrors={state.showAllErrors}
        onAnnounce={onAnnounce}
        selectedRowIds={selectedRowIds}
        onToggleSelect={state.onToggleSelect}
        selectLinkedReason={t('autoItemize.selectLinkedReason')}
        onNoticeAction={state.onNoticeAction}
        renderRowExtra={renderRowExtra}
        testIdPrefix={AUTO_ITEMIZE_GRID_PREFIX}
      />

      {selectedRowIds.size > 0 && (
        <SelectionActionBar
          countLabel={t('autoItemize.mergeSelectedCount', { count: selectedRowIds.size })}
          onClear={state.onClearSelection}
          clearLabel={t('autoItemize.clearSelection')}
        >
          <button
            type="button"
            className={sharedStyles.btnSecondaryCompact}
            aria-disabled={!canMerge || undefined}
            aria-describedby={canMerge ? undefined : hintId}
            aria-label={t('autoItemize.mergeButtonAriaLabel', { count: selectedRowIds.size })}
            onClick={() => {
              if (canMerge) state.onMergeSelected();
            }}
            data-testid="auto-itemize-merge"
          >
            {t('autoItemize.mergeButton')}
          </button>
          <span id={hintId} className={sharedStyles.srOnly}>
            {t('autoItemize.mergeDisabledHint')}
          </span>
        </SelectionActionBar>
      )}

      <div className={styles.totalsCard}>
        <span>{t('autoItemize.total')}</span>
        <span className={styles.totalsAmount}>{formatCurrency(computedTotal)}</span>
        {renderVarianceIndicator()}
      </div>
    </>
  );
}
