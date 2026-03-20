import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { BaseBudgetLine, ConfidenceLevel } from '@cornerstone/shared';
import { CONFIDENCE_MARGINS } from '../../lib/budgetConstants.js';
import { useFormatters } from '../../lib/formatters.js';
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
  unlinkAction?: ReactNode;
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
  unlinkAction,
}: BudgetLineCardProps) {
  const { formatCurrency } = useFormatters();
  const { t } = useTranslation('budget');
  const showInvoicedAmount = line.invoiceCount > 0;
  const isQuotation = line.invoiceLink?.invoiceStatus === 'quotation';

  return (
    <div className={styles.card}>
      <div className={styles.main}>
        <div className={styles.topRow}>
          {showInvoicedAmount ? (
            <>
              <span
                className={`${styles.amount} ${
                  isQuotation ? styles.amountQuoted : styles.amountInvoiced
                }`}
              >
                {isQuotation
                  ? `${formatCurrency(line.actualCost * 0.95)} – ${formatCurrency(line.actualCost * 1.05)}`
                  : formatCurrency(line.actualCost)}
              </span>
              <span className={isQuotation ? styles.quotedLabel : styles.invoicedLabel}>
                {isQuotation ? t('vendorDetail.quotedAmount') : 'Invoiced Amount'}
              </span>
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
          {line.budgetSource && <span className={styles.metaItem}>{line.budgetSource.name}</span>}
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
            {unlinkAction}
          </>
        )}
      </div>
    </div>
  );
}
