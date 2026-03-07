import { type ReactNode } from 'react';
import type { BaseBudgetLine, ConfidenceLevel } from '@cornerstone/shared';
import { CONFIDENCE_MARGINS } from '../../lib/budgetConstants.js';
import { formatCurrency } from '../../lib/formatters.js';
import styles from './BudgetLineCard.module.css';

export interface BudgetLineCardProps {
  line: BaseBudgetLine;
  confidenceLabels: Record<ConfidenceLevel, string>;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  children?: ReactNode;
}

export function BudgetLineCard({
  line,
  confidenceLabels,
  onEdit,
  onDelete,
  isDeleting,
  onConfirmDelete,
  onCancelDelete,
  children,
}: BudgetLineCardProps) {
  const showInvoicedAmount = line.invoiceCount > 0;

  return (
    <div className={styles.card}>
      <div className={styles.main}>
        <div className={styles.topRow}>
          {showInvoicedAmount ? (
            <>
              <span className={`${styles.amount} ${styles.amountInvoiced}`}>
                {formatCurrency(line.actualCost)}
              </span>
              <span className={styles.invoicedLabel}>Invoiced Amount</span>
              <span className={styles.plannedSecondary}>
                (planned: {formatCurrency(line.plannedAmount)})
              </span>
            </>
          ) : (
            <>
              <span className={styles.amount}>{formatCurrency(line.plannedAmount)}</span>
              <span className={styles.confidence}>
                {confidenceLabels[line.confidence]}
                {CONFIDENCE_MARGINS[line.confidence] > 0 && (
                  <span className={styles.margin}>
                    {' '}
                    (+{Math.round(CONFIDENCE_MARGINS[line.confidence] * 100)}%)
                  </span>
                )}
              </span>
            </>
          )}
        </div>

        {line.description && <div className={styles.description}>{line.description}</div>}

        <div className={styles.meta}>
          {line.budgetCategory && (
            <span className={styles.metaItem}>{line.budgetCategory.name}</span>
          )}
          {line.budgetSource && (
            <span className={styles.metaItem}>{line.budgetSource.name}</span>
          )}
          {line.vendor && <span className={styles.metaItem}>{line.vendor.name}</span>}
        </div>

        {children}
      </div>

      <div className={styles.actions}>
        {isDeleting ? (
          <>
            <button
              type="button"
              className={styles.deleteConfirmButton}
              onClick={onConfirmDelete}
              title="Confirm delete"
            >
              Confirm
            </button>
            <button
              type="button"
              className={styles.cancelDeleteButton}
              onClick={onCancelDelete}
              title="Cancel delete"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={styles.editButton}
              onClick={onEdit}
              aria-label={`Edit budget line${line.description ? ': ' + line.description : ''}`}
            >
              Edit
            </button>
            <button
              type="button"
              className={styles.deleteButton}
              onClick={onDelete}
              aria-label={`Delete budget line${line.description ? ': ' + line.description : ''}`}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
