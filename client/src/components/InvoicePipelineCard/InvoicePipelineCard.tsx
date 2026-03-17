import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Invoice, InvoiceStatusBreakdown } from '@cornerstone/shared';
import { formatCurrency, formatDate } from '../../lib/formatters.js';
import styles from './InvoicePipelineCard.module.css';

interface InvoicePipelineCardProps {
  invoices: Invoice[];
  summary: InvoiceStatusBreakdown;
}

export function InvoicePipelineCard({ invoices, summary }: InvoicePipelineCardProps) {
  const { t } = useTranslation('dashboard');

  // Filter to pending invoices, sort by date ascending (oldest first), take first 5
  const pendingInvoices = invoices
    .filter((inv) => inv.status === 'pending')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  // Helper to check if invoice is overdue
  const isOverdue = (invoice: Invoice): boolean => {
    if (!invoice.dueDate) return false;
    const [year, month, day] = invoice.dueDate.split('-').map(Number);
    const dueDate = new Date(year, month - 1, day);
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return dueDate < todayMidnight;
  };

  // Empty state
  if (pendingInvoices.length === 0) {
    return (
      <p data-testid="invoice-empty" className={styles.emptyState}>
        {t('cards.invoicePipeline.noPendingInvoices')}
      </p>
    );
  }

  return (
    <>
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

      <div className={styles.footer}>
        <div data-testid="pending-total" className={styles.footerTotal}>
          {t('cards.invoicePipeline.pendingTotal')}{' '}
          <strong>{formatCurrency(summary.pending.totalAmount)}</strong>
        </div>
        <Link to="/budget/invoices" className={styles.link}>
          {t('cards.invoicePipeline.viewAllInvoices')}
        </Link>
      </div>
    </>
  );
}
