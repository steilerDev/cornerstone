import { useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import type { SourceReportResponse, InvoiceStatus } from '@cornerstone/shared';
import type { BadgeVariantMap } from '../Badge/Badge.js';
import { Badge } from '../Badge/Badge.js';
import { TriStateCheckbox } from '../TriStateCheckbox/TriStateCheckbox.js';
import { SelectionActionBar } from '../SelectionActionBar/SelectionActionBar.js';
import { Tooltip } from '../Tooltip/Tooltip.js';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { useFormatters } from '../../lib/formatters.js';
import BadgeStyles from '../Badge/Badge.module.css';
import styles from './ReportInvoiceList.module.css';

interface ReportInvoiceListProps {
  report: SourceReportResponse;
  excludedInvoiceIds: Set<string>;
  onToggle: (invoiceId: string, excluded: boolean) => void;
  onToggleAll: (excludeAll: boolean) => void;
  t: TFunction;
}

export function ReportInvoiceList({
  report,
  excludedInvoiceIds,
  onToggle,
  onToggleAll,
  t,
}: ReportInvoiceListProps) {
  const { formatCurrency } = useFormatters();
  const [unallocatedExpanded, setUnallocatedExpanded] = useState(false);

  // Invoice status badge variants
  const invoiceStatusVariants = useMemo((): BadgeVariantMap => {
    const variants: BadgeVariantMap = {};
    const statuses: InvoiceStatus[] = ['pending', 'paid', 'claimed', 'quotation'];
    for (const status of statuses) {
      variants[status] = {
        label: t(`sources.lines.invoiceStatus.${status}`),
        className: styles[status]!,
      };
    }
    return variants;
  }, [t]);

  const allocatedInvoices = useMemo(
    () =>
      report.invoices.filter(
        (inv) => inv.allocatedAmount > 0 || inv.lineKind === 'refund-adjustment',
      ),
    [report.invoices],
  );

  const unallocatedInvoices = useMemo(
    () => report.unallocatedInvoices || [],
    [report.unallocatedInvoices],
  );

  const selectedCount = useMemo(
    () => allocatedInvoices.filter((inv) => !excludedInvoiceIds.has(inv.invoiceId)).length,
    [allocatedInvoices, excludedInvoiceIds],
  );

  const runningTotal = useMemo(
    () =>
      allocatedInvoices
        .filter((inv) => !excludedInvoiceIds.has(inv.invoiceId))
        .reduce((sum, inv) => sum + inv.allocatedAmount, 0),
    [allocatedInvoices, excludedInvoiceIds],
  );

  const handleSelectAll = () => {
    onToggleAll(selectedCount === allocatedInvoices.length);
  };

  if (allocatedInvoices.length === 0 && unallocatedInvoices.length === 0) {
    return (
      <EmptyState
        message={t('sourceReports.emptyInvoices')}
        description={t('sourceReports.emptyInvoicesDescription')}
      />
    );
  }

  return (
    <div className={styles.invoiceListContainer}>
      {/* Header with select-all */}
      <div className={styles.listHeader}>
        <div className={styles.headerCheckbox}>
          <TriStateCheckbox
            checked={selectedCount === allocatedInvoices.length && allocatedInvoices.length > 0}
            indeterminate={selectedCount > 0 && selectedCount < allocatedInvoices.length}
            onChange={handleSelectAll}
            label={t('sourceReports.selectAllInvoices')}
          />
        </div>
        <div className={styles.headerTitle}>{t('sourceReports.invoicesHeading')}</div>
      </div>

      {/* Allocated invoices list */}
      {allocatedInvoices.map((invoice) => {
        const isExcluded = excludedInvoiceIds.has(invoice.invoiceId);
        const hasDocuments = (invoice.documents && invoice.documents.length > 0) || false;

        return (
          <div key={invoice.invoiceId} className={styles.invoiceRow}>
            <label className={styles.checkboxWithContent}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={!isExcluded}
                onChange={(e) => onToggle(invoice.invoiceId, !e.target.checked)}
                aria-label={t('sourceReports.toggleInvoice', {
                  vendor: invoice.vendorName,
                  number: invoice.invoiceNumber,
                })}
              />

              <div className={styles.vendorInfo}>
                <div className={styles.vendorName}>{invoice.vendorName}</div>
                <div className={styles.invoiceDate}>
                  {t('sourceReports.table.invoiceNumber')}: {invoice.invoiceNumber}
                </div>
              </div>
            </label>

            <Badge variants={invoiceStatusVariants} value={invoice.status} />

            <div className={styles.amountColumn}>
              {invoice.lineKind === 'refund-adjustment' ? (
                <div>
                  <Badge
                    variants={{
                      refund: { label: t('sourceReports.refund'), className: styles.refund },
                    }}
                    value="refund"
                  />
                  <div className={`${styles.amount} ${styles.amountNegative}`}>
                    {formatCurrency(invoice.allocatedAmount)}
                  </div>
                </div>
              ) : (
                <div className={styles.amount}>{formatCurrency(invoice.allocatedAmount)}</div>
              )}
            </div>

            <div className={styles.attachmentColumn}>
              {invoice.isSplit && (
                <Tooltip content={t('sourceReports.splitTooltip')}>
                  <Badge
                    variants={{
                      split: {
                        label: t('sourceReports.splitBadge', {
                          allocated: formatCurrency(invoice.allocatedAmount),
                          total: formatCurrency(invoice.invoiceAmount),
                        }),
                        className: BadgeStyles.info,
                      },
                    }}
                    value="split"
                  />
                </Tooltip>
              )}
              {hasDocuments ? (
                <div className={styles.paperclip}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 2.2" />
                  </svg>
                  <span className={styles.srOnly}>{t('sourceReports.hasAttachment')}</span>
                </div>
              ) : (
                <div className={styles.noDocument}>{t('sourceReports.noDocument')}</div>
              )}
            </div>
          </div>
        );
      })}

      {/* Unallocated group */}
      {unallocatedInvoices.length > 0 && (
        <div className={styles.unallocatedSection}>
          <button
            type="button"
            className={styles.unallocatedHeader}
            onClick={() => setUnallocatedExpanded(!unallocatedExpanded)}
            aria-expanded={unallocatedExpanded}
          >
            <svg
              className={`${styles.chevron} ${unallocatedExpanded ? styles.chevronOpen : ''}`}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <Badge
              variants={{
                unallocated: {
                  label: t('sourceReports.unallocatedGroupTitle', {
                    count: unallocatedInvoices.length,
                  }),
                  className: BadgeStyles.warning,
                },
              }}
              value="unallocated"
            />
          </button>

          {unallocatedExpanded && (
            <div className={styles.unallocatedList}>
              {unallocatedInvoices.map((invoice) => (
                <div key={invoice.invoiceId} className={styles.unallocatedRow}>
                  <Tooltip content={t('sourceReports.unallocatedExplained')}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                  </Tooltip>
                  <div className={styles.vendorName}>{invoice.vendorName}</div>
                  <div className={styles.amount}>{formatCurrency(invoice.invoiceAmount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selection action bar */}
      <SelectionActionBar
        countLabel={t('sourceReports.selectedCount', {
          count: selectedCount,
          totalCount: allocatedInvoices.length,
          totalAmount: formatCurrency(runningTotal),
        })}
        clearLabel={t('sourceReports.resetSelection')}
        onClear={() => onToggleAll(false)}
      >
        {null}
      </SelectionActionBar>
    </div>
  );
}
