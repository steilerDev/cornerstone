import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { BaseBudgetLine } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import { BudgetLineCard } from './BudgetLineCard.js';
import styles from './InvoiceGroup.module.css';

export interface InvoiceGroupProps<T extends BaseBudgetLine> {
  invoiceId: string;
  invoiceNumber: string | null;
  invoiceStatus: string;
  itemizedTotal: number;
  plannedTotal: number;
  lines: T[];
  onEdit: (line: T) => void;
  onDelete: (lineId: string) => void;
  isDeleting: Record<string, boolean>;
  onConfirmDelete: (lineId: string) => void;
  onCancelDelete: (lineId: string) => void;
  onUnlink: (lineId: string, invoiceBudgetLineId: string) => void;
  isUnlinking: Record<string, boolean>;
  confidenceLabels: Record<string, string>;
}

export function InvoiceGroup<T extends BaseBudgetLine>({
  invoiceId,
  invoiceNumber,
  invoiceStatus,
  itemizedTotal,
  plannedTotal,
  lines,
  onEdit,
  onDelete,
  isDeleting,
  onConfirmDelete,
  onCancelDelete,
  onUnlink,
  isUnlinking,
  confidenceLabels,
}: InvoiceGroupProps<T>) {
  const { formatCurrency } = useFormatters();
  const { t } = useTranslation('budget');
  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpanded();
    }
  };

  useEffect(() => {
    if (isExpanded && contentRef.current) {
      contentRef.current.focus();
    }
  }, [isExpanded]);

  const statusBadgeClass = `${styles.statusBadge} ${styles[`status_${invoiceStatus}`] || ''}`;

  const getStatusLabel = (status: string): string => {
    if (status === 'quotation') return t('vendorDetail.quotedLabel');
    return t('vendorDetail.invoiceStatusLabels.paid'); // Default to "Invoiced" equivalent
  };

  const amountLabel = invoiceStatus === 'quotation' ? t('vendorDetail.quotedAmount') : 'Invoiced';
  const ariaLabel = `Invoice ${invoiceNumber || 'unknown'}: ${lines.length} budget lines, ${formatCurrency(itemizedTotal)} ${amountLabel}`;

  return (
    <div className={styles.group} role="group" aria-label={ariaLabel}>
      {/* Header with toggle button */}
      <button
        ref={toggleButtonRef}
        type="button"
        className={styles.toggleBtn}
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
        aria-expanded={isExpanded}
        aria-controls={`invoice-group-${invoiceId}`}
      >
        <div className={styles.headerContent}>
          <div className={styles.invoiceInfo}>
            <Link
              to={`/budget/invoices/${invoiceId}`}
              className={styles.invoiceLink}
              onClick={(e) => e.stopPropagation()}
            >
              {invoiceNumber ? `#${invoiceNumber}` : 'Invoice'}
            </Link>
            <span className={statusBadgeClass}>{invoiceStatus}</span>
          </div>
          <div className={styles.amounts}>
            <div className={styles.amountGroup}>
              <span className={styles.amountValue}>
                {invoiceStatus === 'quotation'
                  ? `${formatCurrency(itemizedTotal * 0.95)} – ${formatCurrency(itemizedTotal * 1.05)}`
                  : formatCurrency(itemizedTotal)}
              </span>
              <span className={styles.amountLabel}>{amountLabel}</span>
            </div>
            <div className={styles.amountGroup}>
              <span className={styles.amountValueMuted}>{formatCurrency(plannedTotal)}</span>
              <span className={`${styles.amountLabel} ${styles.amountLabelMuted}`}>Planned</span>
            </div>
          </div>
        </div>
        <div
          className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`}
          aria-hidden="true"
        >
          ▼
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div
          ref={contentRef}
          id={`invoice-group-${invoiceId}`}
          className={styles.lines}
          tabIndex={-1}
        >
          {lines.map((line) => (
            <div key={line.id} className={styles.lineWrapper}>
              <BudgetLineCard
                line={line}
                confidenceLabels={confidenceLabels}
                onEdit={() => onEdit(line)}
                onDelete={() => onDelete(line.id)}
                isDeleting={isDeleting[line.id] || false}
                onConfirmDelete={() => onConfirmDelete(line.id)}
                onCancelDelete={() => onCancelDelete(line.id)}
                unlinkAction={
                  line.invoiceLink ? (
                    <button
                      type="button"
                      className={styles.unlinkBtn}
                      onClick={() => onUnlink(line.id, line.invoiceLink!.invoiceBudgetLineId)}
                      disabled={isUnlinking[line.invoiceLink.invoiceBudgetLineId] || false}
                      aria-label="Unlink from invoice"
                    >
                      {isUnlinking[line.invoiceLink.invoiceBudgetLineId]
                        ? 'Unlinking...'
                        : 'Unlink'}
                    </button>
                  ) : undefined
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
