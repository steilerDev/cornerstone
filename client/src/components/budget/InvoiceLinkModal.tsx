import { useState, useEffect, useRef } from 'react';
import type { Invoice } from '@cornerstone/shared';
import { fetchAllInvoices } from '../../lib/invoicesApi.js';
import { createInvoiceBudgetLine } from '../../lib/invoiceBudgetLinesApi.js';
import { formatCurrency } from '../../lib/formatters.js';
import { useToast } from '../Toast/ToastContext.js';
import styles from './InvoiceLinkModal.module.css';

export interface InvoiceLinkModalProps {
  budgetLineId: string;
  budgetLineType: 'work_item' | 'household_item';
  vendorId?: string;
  defaultAmount: number;
  onSuccess: () => void;
  onClose: () => void;
}

type InvoiceLinkError = {
  field?: string;
  message: string;
};

export function InvoiceLinkModal({
  budgetLineId,
  budgetLineType,
  vendorId,
  defaultAmount,
  onSuccess,
  onClose,
}: InvoiceLinkModalProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [itemizedAmount, setItemizedAmount] = useState<string>(defaultAmount.toString());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<InvoiceLinkError | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  // Load invoices on mount
  useEffect(() => {
    const loadInvoices = async () => {
      try {
        setIsLoading(true);
        const response = await fetchAllInvoices({
          pageSize: 1000,
          ...(vendorId && { vendorId }),
        });
        setInvoices(response.invoices);
        if (response.invoices.length > 0) {
          setSelectedInvoiceId(response.invoices[0].id);
        }
      } catch (err) {
        setError({
          message: 'Failed to load invoices. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadInvoices();
  }, [vendorId]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle keyboard events (Escape to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Focus management
  useEffect(() => {
    if (modalRef.current) {
      const firstInput = modalRef.current.querySelector(
        'select, input[type="number"]',
      ) as HTMLElement;
      firstInput?.focus();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedInvoiceId) {
      setError({ field: 'invoice', message: 'Please select an invoice' });
      return;
    }

    const amount = parseFloat(itemizedAmount);
    if (isNaN(amount) || amount <= 0) {
      setError({ field: 'amount', message: 'Please enter a valid amount' });
      return;
    }

    try {
      setIsSaving(true);

      const requestBody = {
        invoiceId: selectedInvoiceId,
        ...(budgetLineType === 'work_item' && { workItemBudgetId: budgetLineId }),
        ...(budgetLineType === 'household_item' && { householdItemBudgetId: budgetLineId }),
        itemizedAmount: amount,
      };

      await createInvoiceBudgetLine(selectedInvoiceId, requestBody);

      showToast('success', 'Budget line linked to invoice successfully');

      onSuccess();
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('BUDGET_LINE_ALREADY_LINKED')) {
          setError({
            field: 'invoice',
            message: 'This budget line is already linked to an invoice',
          });
        } else if (err.message.includes('ITEMIZED_SUM_EXCEEDS_INVOICE')) {
          setError({
            field: 'amount',
            message: 'The itemized amount exceeds the invoice total',
          });
        } else {
          setError({ message: err.message || 'Failed to link budget line' });
        }
      } else {
        setError({ message: 'An unexpected error occurred' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className={styles.modal}
      role="dialog"
      aria-modal="true"
      aria-labelledby="link-modal-title"
    >
      <div className={styles.backdrop} onClick={handleBackdropClick} />
      <div className={styles.content} ref={modalRef}>
        <div className={styles.header}>
          <h2 id="link-modal-title" className={styles.title}>
            Link to Invoice
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        {error && error.message && !error.field && (
          <div className={styles.errorBanner} role="alert">
            {error.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Invoice Select */}
          <div className={styles.formGroup}>
            <label htmlFor="invoice-select" className={styles.label}>
              Invoice
            </label>
            {isLoading ? (
              <div className={styles.loading}>Loading invoices...</div>
            ) : invoices.length === 0 ? (
              <div className={styles.emptyState}>No invoices available</div>
            ) : (
              <>
                <select
                  id="invoice-select"
                  value={selectedInvoiceId}
                  onChange={(e) => {
                    setSelectedInvoiceId(e.target.value);
                    if (error?.field === 'invoice') {
                      setError(null);
                    }
                  }}
                  className={styles.select}
                  disabled={isSaving}
                >
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber
                        ? `#${inv.invoiceNumber}`
                        : `Invoice ${inv.id.slice(0, 8)}`}{' '}
                      — {formatCurrency(inv.amount)}
                    </option>
                  ))}
                </select>
                {error?.field === 'invoice' && (
                  <div className={styles.fieldError}>{error.message}</div>
                )}
              </>
            )}
          </div>

          {/* Amount Input */}
          <div className={styles.formGroup}>
            <label htmlFor="amount-input" className={styles.label}>
              Itemized Amount
            </label>
            <input
              id="amount-input"
              type="number"
              value={itemizedAmount}
              onChange={(e) => {
                setItemizedAmount(e.target.value);
                if (error?.field === 'amount') {
                  setError(null);
                }
              }}
              step="0.01"
              min="0"
              className={`${styles.input} ${error?.field === 'amount' ? styles.inputError : ''}`}
              disabled={isSaving}
              required
            />
            {error?.field === 'amount' && <div className={styles.fieldError}>{error.message}</div>}
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={isSaving || invoices.length === 0}
            >
              {isSaving ? 'Linking...' : 'Link to Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
