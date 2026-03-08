import React, { useMemo } from 'react';
import { useInvoices } from '../hooks/useInvoices';
import { Invoice } from '../types/invoice';

// Summary card data shape
interface SummaryCard {
  label: string;
  count: number;
  amount: number;
}

/**
 * Formats a numeric amount as a currency string.
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * InvoicesPage
 *
 * Displays summary cards for Pending, Paid, and Claimed invoices.
 *
 * FIX (Issue #568): The "Paid" card now includes BOTH 'paid' AND 'claimed'
 * invoices in its count and total amount. Claimed invoices represent amounts
 * the user has already paid out-of-pocket and submitted for reimbursement —
 * they are conceptually "paid" from the user's perspective.
 *
 * The "Claimed" card remains unchanged and continues to show only the
 * 'claimed' subset for reference.
 */
export function InvoicesPage() {
  const { invoices, isLoading, error } = useInvoices();

  // Derive summary card values from the invoices list.
  // Each card aggregates count and total amount for its relevant status(es).
  const summary = useMemo(() => {
    if (!invoices || invoices.length === 0) {
      return {
        pending: { label: 'Pending', count: 0, amount: 0 },
        paid: { label: 'Paid', count: 0, amount: 0 },
        claimed: { label: 'Claimed', count: 0, amount: 0 },
      };
    }

    return invoices.reduce(
      (acc, invoice: Invoice) => {
        // Guard against invoices with missing or null amounts.
        const amount = invoice.amount ?? 0;

        if (invoice.status === 'pending') {
          // Pending card: only 'pending' invoices (unchanged).
          acc.pending.count += 1;
          acc.pending.amount += amount;
        }

        if (invoice.status === 'paid' || invoice.status === 'claimed') {
          // FIX (Issue #568): Paid card includes BOTH 'paid' AND 'claimed'
          // statuses. Claimed invoices have already been paid by the user
          // (they are awaiting reimbursement), so they belong in the Paid
          // total. This satisfies acceptance criteria 1 and 2.
          acc.paid.count += 1;
          acc.paid.amount += amount;
        }

        if (invoice.status === 'claimed') {
          // Claimed card: only 'claimed' invoices, shown as a subset.
          // This satisfies acceptance criterion 3 — the Claimed card is
          // preserved independently and is NOT removed.
          acc.claimed.count += 1;
          acc.claimed.amount += amount;
        }

        return acc;
      },
      {
        pending: { label: 'Pending', count: 0, amount: 0 },
        // FIX: Paid card intentionally aggregates paid + claimed (see above).
        paid: { label: 'Paid', count: 0, amount: 0 },
        claimed: { label: 'Claimed', count: 0, amount: 0 },
      }
    );
  }, [invoices]);

  if (isLoading) {
    return (
      <div data-testid="invoices-loading" className="flex items-center justify-center p-8">
        <span>Loading invoices...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="invoices-error" className="p-8 text-red-600">
        <p>Failed to load invoices. Please try again.</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  const cards: SummaryCard[] = [
    summary.pending,
    // Paid card now reflects paid + claimed combined total (Issue #568).
    summary.paid,
    summary.claimed,
  ];

  return (
    <div className="invoices-page p-6">
      <h1 className="text-2xl font-bold mb-6">Invoices</h1>

      {/* Summary Cards */}
      <div
        className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8"
        data-testid="invoice-summary-cards"
      >
        {cards.map((card) => (
          <div
            key={card.label}
            className="summary-card rounded-lg border p-4 shadow-sm"
            data-testid={`summary-card-${card.label.toLowerCase()}`}
          >
            <p className="text-sm text-gray-500 font-medium uppercase tracking-wide">
              {card.label}
            </p>
            <p
              className="text-3xl font-bold mt-1"
              data-testid={`summary-card-${card.label.toLowerCase()}-count`}
            >
              {card.count}
            </p>
            <p
              className="text-lg text-gray-700 mt-1"
              data-testid={`summary-card-${card.label.toLowerCase()}-amount`}
            >
              {formatCurrency(card.amount)}
            </p>
          </div>
        ))}
      </div>

      {/* Invoice List (placeholder for full list implementation) */}
      <div data-testid="invoice-list">
        {invoices && invoices.length === 0 ? (
          <p className="text-gray-500" data-testid="invoices-empty">
            No invoices found.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">Invoice #</th>
                <th className="text-left py-2 px-3">Description</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="text-right py-2 px-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoices?.map((invoice: Invoice) => (
                <tr
                  key={invoice.id}
                  className="border-b hover:bg-gray-50"
                  data-testid={`invoice-row-${invoice.id}`}
                >
                  <td className="py-2 px-3">{invoice.invoiceNumber}</td>
                  <td className="py-2 px-3">{invoice.description}</td>
                  <td className="py-2 px-3 capitalize">{invoice.status}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(invoice.amount ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default InvoicesPage;
