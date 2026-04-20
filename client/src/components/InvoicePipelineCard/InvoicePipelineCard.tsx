import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Invoice, InvoiceStatusBreakdown } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import styles from './InvoicePipelineCard.module.css';

interface InvoicePipelineCardProps {
  invoices: Invoice[];
  summary: InvoiceStatusBreakdown;
}

export function InvoicePipelineCard({ invoices, summary }: InvoicePipelineCardProps) {
  const { formatCurrency, formatDate, formatTime, formatDateTime } = useFormatters();
  const { t } = useTranslation('dashboard');

  // Filter to pending invoices, sort by date ascending (oldest first), take first 5
  const pendingInvoices = invoices
    .filter((inv) => inv.status === 'pending')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  // Filter to quotation invoices, sort by date descending (newest first), take first 5
  const quotationInvoices = invoices
    .filter((inv) => inv.status === 'quotation')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  // Helper to check if invoice is overdue
  const isOverdue = (invoice: Invoice): boolean => {
    if (!invoice.dueDate) return false;
    const parts = invoice.dueDate.split('-').map(Number);
    const year = parts[0]!; // split ensures at least 1 part or throws
    const month = parts[1]!; // must be YYYY-MM-DD format
    const day = parts[2]!; // must be YYYY-MM-DD format
    const dueDate = new Date(year, month - 1, day);
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return dueDate < todayMidnight;
  };

  // Empty state
  if (pendingInvoices.length === 0 && quotationInvoices.length === 0) {
    return (
      <p data-testid="invoice-empty" className={styles.emptyState}>
        {t('cards.invoicePipeline.noPendingInvoices')}
      </p>
    );
  }

  return (
    <>
      {pendingInvoices.length > 0 && (
        <ul className={styles.list}>
          {pendingInvoices.map((invoice) => {
            const overdue = isOverdue(invoice);
            const displayInvoiceNumber = invoice.invoiceNumber || `#${invoice.id.slice(0, 8)}`;

            return (
              <li
                key={invoice.id}
                data-testid="invoice-row"
                className={`${styles.item} ${overdue ? styles.itemOverdue : ''}`}
              >
                <Link to={`/budget/invoices/${invoice.id}`} className={styles.itemLink}>
                  <span className={styles.vendorName}>{invoice.vendorName}</span>
                  <span className={styles.invoiceNumber}>{displayInvoiceNumber}</span>
                  <span className={styles.amount}>{formatCurrency(invoice.amount)}</span>
                  <span className={styles.date}>{formatDate(invoice.date)}</span>
                </Link>
                {overdue && (
                  <span data-testid="overdue-badge" className={styles.overdueBadge}>
                    {t('cards.invoicePipeline.overdue')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {quotationInvoices.length > 0 && (
        <>
          <div className={styles.sectionHeader}>{t('cards.invoicePipeline.quotesTitle')}</div>
          <ul className={styles.list}>
            {quotationInvoices.map((invoice) => {
              const displayInvoiceNumber = invoice.invoiceNumber || `#${invoice.id.slice(0, 8)}`;

              return (
                <li key={invoice.id} data-testid="quotation-row" className={styles.item}>
                  <Link to={`/budget/invoices/${invoice.id}`} className={styles.itemLink}>
                    <span className={styles.vendorName}>{invoice.vendorName}</span>
                    <span className={styles.invoiceNumber}>{displayInvoiceNumber}</span>
                    <span className={styles.amount}>{formatCurrency(invoice.amount)}</span>
                    <span className={styles.date}>{formatDate(invoice.date)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className={styles.footer}>
        {pendingInvoices.length > 0 && (
          <div data-testid="pending-total" className={styles.footerTotal}>
            {t('cards.invoicePipeline.pendingTotal')}{' '}
            <strong>{formatCurrency(summary.pending.totalAmount)}</strong>
          </div>
        )}
        {quotationInvoices.length > 0 && (
          <div data-testid="quotation-total" className={styles.footerTotal}>
            {t('cards.invoicePipeline.quotesTotal')}{' '}
            <strong>{formatCurrency(summary.quotation.totalAmount)}</strong>
          </div>
        )}
        <Link to="/budget/invoices" className={styles.link}>
          {t('cards.invoicePipeline.viewAllInvoices')}
        </Link>
      </div>
    </>
  );
}
