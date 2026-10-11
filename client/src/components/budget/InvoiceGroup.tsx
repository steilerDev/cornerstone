import { routeUrl } from '@cornerstone/shared';
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { BaseBudgetLine, InvoiceStatus } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import { Badge } from '../Badge/Badge.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useInvoiceDisplayTitle } from '../../hooks/useInvoiceDisplayTitle.js';
import type { OriginState } from '../../navigation/origin.js';
import { BudgetLineCard } from './BudgetLineCard.js';
import styles from './InvoiceGroup.module.css';

export interface InvoiceGroupProps<T extends BaseBudgetLine> {
  invoiceId: string;
  invoiceNumber: string | null;
  invoiceStatus: InvoiceStatus;
  itemizedTotal: number;
  plannedTotal: number;
  lines: T[];
  onEdit: (line: T) => void;
  onDelete: (lineId: string) => void;
  onUnlink: (lineId: string, invoiceBudgetLineId: string) => void;
  isUnlinking: Record<string, boolean>;
  confidenceLabels: Record<string, string>;
  vendorName: string | null;
  /** Router state (origin) passed to the invoice link. */
  linkState?: OriginState;
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
  onUnlink,
  isUnlinking,
  confidenceLabels,
  vendorName,
  linkState,
}: InvoiceGroupProps<T>) {
  const { formatCurrency } = useFormatters();
  const { t } = useTranslation('budget');
  const { t: tCommon } = useTranslation('common');
  const statusVariants = useStatusBadgeVariants();
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

  const amountLabel =
    invoiceStatus === 'quotation'
      ? t('vendorDetail.quotedAmount')
      : t('vendorDetail.invoicedAmount');
  const invoiceTitle = useInvoiceDisplayTitle({
    vendorName,
    invoiceNumber,
    status: invoiceStatus,
  });
  const ariaLabel = t('invoiceGroup.ariaLabel', {
    invoice: invoiceTitle,
    count: lines.length,
    amount: formatCurrency(itemizedTotal),
    amountLabel,
  });

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
            <div className={styles.invoiceIdentity}>
              <Link
                to={routeUrl('invoice', { id: invoiceId })}
                state={linkState}
                className={styles.invoiceLink}
                onClick={(e) => e.stopPropagation()}
              >
                {invoiceNumber ? `#${invoiceNumber}` : tCommon('navigation.invoice')}
              </Link>
              {vendorName && <span className={styles.vendorName}>{vendorName}</span>}
            </div>
            <Badge variants={statusVariants.invoice} value={invoiceStatus} />
          </div>
          <div className={styles.amounts}>
            <div className={styles.amountGroup}>
              <span
                className={`${styles.amountValue}${invoiceStatus === 'quotation' ? ` ${styles.amountValueQuoted}` : ''}`}
              >
                {formatCurrency(itemizedTotal)}
              </span>
              <span className={styles.amountLabel}>{amountLabel}</span>
            </div>
            <div className={styles.amountGroup}>
              <span className={styles.amountValueMuted}>{formatCurrency(plannedTotal)}</span>
              <span className={`${styles.amountLabel} ${styles.amountLabelMuted}`}>
                {t('invoiceGroup.planned')}
              </span>
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
                unlinkAction={
                  line.invoiceLink ? (
                    <button
                      type="button"
                      className={styles.unlinkBtn}
                      onClick={() => onUnlink(line.id, line.invoiceLink!.invoiceBudgetLineId)}
                      disabled={isUnlinking[line.invoiceLink.invoiceBudgetLineId] || false}
                      aria-label={t('vendorDetail.unlinkFromInvoice')}
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
