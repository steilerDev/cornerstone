import { useState, useRef, useEffect } from 'react';
import type { BaseBudgetLine } from '@cornerstone/shared';
import { formatCurrency } from '../../lib/formatters.js';
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

  return (
    <div className={styles.group}>
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
            <span className={styles.invoiceNumber}>
              {invoiceNumber ? `#${invoiceNumber}` : 'Invoice'}
            </span>
            <span className={statusBadgeClass}>{invoiceStatus}</span>
          </div>
          <div className={styles.amounts}>
            <div className={styles.amountGroup}>
              <span className={styles.amountValue}>{formatCurrency(itemizedTotal)}</span>
              <span className={styles.amountLabel}>Itemized</span>
            </div>
            <div className={styles.amountGroup}>
              <span className={styles.amountValue}>{formatCurrency(plannedTotal)}</span>
              <span className={styles.amountLabel}>Planned</span>
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
              >
                {/* Unlink button below the card */}
                {line.invoiceLink && (
                  <div className={styles.unlinkSection}>
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
                  </div>
                )}
              </BudgetLineCard>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
