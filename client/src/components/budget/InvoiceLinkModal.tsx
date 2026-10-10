import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Invoice } from '@cornerstone/shared';
import { fetchAllInvoices } from '../../lib/invoicesApi.js';
import { createInvoiceBudgetLine } from '../../lib/invoiceBudgetLinesApi.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { roundMoney } from '../../lib/money.js';
import { useToast } from '../Toast/ToastContext.js';
import { Modal } from '../Modal/index.js';
import { FormError } from '../FormError/index.js';
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
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { t: tCommon } = useTranslation('common');
  const { formatCurrency, formatDate: _formatDate } = useFormatters();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>([]);
  const [searchInput, setSearchInput] = useState<string>('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [itemizedAmount, setItemizedAmount] = useState<string>(defaultAmount.toString());
  const [remainingAmount, setRemainingAmount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<InvoiceLinkError | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  // Load invoices on mount
  useEffect(() => {
    const loadInvoices = async () => {
      try {
        setIsLoading(true);
        const response = await fetchAllInvoices({
          pageSize: 100,
          ...(vendorId && { vendorId }),
        });
        setInvoices(response.invoices);
        setFilteredInvoices(response.invoices);
        if (response.invoices.length > 0) {
          // Prefer an invoice that still has room, so the modal never opens on a dead end
          const initial =
            response.invoices.find((i) => roundMoney(i.remainingAmount) > 0) ??
            response.invoices[0]!; // guarded by length check
          setSelectedInvoiceId(initial.id);
          setSelectedInvoice(initial);
          setRemainingAmount(roundMoney(initial.remainingAmount));
        }
      } catch {
        setError({
          message: t('invoiceLinkModal.errors.loadFailed'),
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadInvoices();
  }, [vendorId, t]);

  // Handle invoice search input
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    // Strip leading '#' so users can paste/type "#INV-001" and still match "INV-001"
    const normalizedValue = value.replace(/^#/, '');
    const filtered = invoices.filter((inv) => {
      const invoiceNumber = inv.invoiceNumber || `Invoice ${inv.id.slice(0, 8)}`;
      const searchLower = normalizedValue.toLowerCase();
      return (
        invoiceNumber.toLowerCase().includes(searchLower) ||
        (inv.notes && inv.notes.toLowerCase().includes(searchLower)) ||
        (inv.vendorName && inv.vendorName.toLowerCase().includes(searchLower))
      );
    });
    setFilteredInvoices(filtered);
    setShowDropdown(true);
  };

  // Handle invoice selection from dropdown
  const handleSelectInvoice = (invoice: Invoice) => {
    setSelectedInvoiceId(invoice.id);
    setSelectedInvoice(invoice);
    setSearchInput('');
    setShowDropdown(false);
    if (error?.field === 'invoice') {
      setError(null);
    }
    setRemainingAmount(roundMoney(invoice.remainingAmount));
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        searchInputRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedInvoiceId) {
      setError({ field: 'invoice', message: t('invoiceLinkModal.errors.selectInvoice') });
      return;
    }

    const amount = parseFloat(itemizedAmount);
    if (isNaN(amount) || amount <= 0) {
      setError({ field: 'amount', message: t('invoiceLinkModal.errors.invalidAmount') });
      return;
    }

    if (amount > remainingAmount) {
      setError({
        field: 'amount',
        message: t('invoiceLinkModal.errors.exceedsBalance', {
          amount: formatCurrency(remainingAmount),
        }),
      });
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

      showToast('success', t('invoiceLinkModal.successToast'));

      onSuccess();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.error.code === 'BUDGET_LINE_ALREADY_LINKED') {
          setError({
            field: 'invoice',
            message: t('invoiceLinkModal.errors.alreadyLinked'),
          });
        } else if (err.error.code === 'ITEMIZED_SUM_EXCEEDS_INVOICE') {
          setError({
            field: 'amount',
            message: t('invoiceLinkModal.errors.exceedsInvoiceTotal'),
          });
        } else {
          setError({ message: translateApiError(err.error.code, tErrors) });
        }
      } else if (err instanceof NetworkError) {
        setError({ message: tCommon('requestErrors.network') });
      } else {
        setError({ message: t('invoiceLinkModal.errors.unexpected') });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const parsedAmount = parseFloat(itemizedAmount);
  const amountAvailable = remainingAmount - parsedAmount;
  const fullyAllocated = remainingAmount === 0;
  const overAllocated = remainingAmount < 0;
  const exceedsRemaining = !isNaN(parsedAmount) && parsedAmount > remainingAmount;
  // Every disabled cause has a visible reason: the allocation note or the red indicator
  const linkDisabled =
    isSaving || invoices.length === 0 || remainingAmount <= 0 || exceedsRemaining;
  const amountIndicator =
    selectedInvoice && remainingAmount > 0 && !isNaN(parsedAmount) ? (
      <div
        className={`${styles.amountIndicator} ${amountAvailable < 0 ? styles.amountIndicatorWarning : ''}`}
      >
        {amountAvailable < 0
          ? t('invoiceLinkModal.overAvailable', {
              amount: formatCurrency(Math.abs(amountAvailable)),
            })
          : t('invoiceLinkModal.willRemain', { amount: formatCurrency(amountAvailable) })}
      </div>
    ) : null;

  return (
    <Modal
      title={t('invoiceLinkModal.title')}
      onClose={onClose}
      footer={
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
            disabled={isSaving}
          >
            {t('invoiceLinkModal.cancel')}
          </button>
          <button
            type="submit"
            form="invoice-link-form"
            className={styles.submitButton}
            disabled={linkDisabled}
          >
            {isSaving ? t('invoiceLinkModal.linking') : t('invoiceLinkModal.linkButton')}
          </button>
        </div>
      }
    >
      {error && error.message && !error.field && (
        <FormError message={error.message} variant="banner" />
      )}

      <form id="invoice-link-form" onSubmit={handleSubmit} className={styles.form}>
        {/* Invoice Search & Select */}
        <div className={styles.formGroup}>
          <label htmlFor="invoice-search" className={styles.label}>
            {t('invoiceLinkModal.invoiceLabel')}
          </label>
          {isLoading ? (
            <div className={styles.loading}>{t('invoiceLinkModal.loading')}</div>
          ) : invoices.length === 0 ? (
            <div className={styles.emptyState}>{t('invoiceLinkModal.emptyState')}</div>
          ) : (
            <>
              <div className={styles.searchWrapper} ref={dropdownRef}>
                <input
                  id="invoice-search"
                  ref={searchInputRef}
                  type="text"
                  placeholder={t('invoiceLinkModal.searchPlaceholder')}
                  value={
                    selectedInvoice && !searchInput
                      ? `#${selectedInvoice.invoiceNumber || selectedInvoice.id.slice(0, 8)}${selectedInvoice.vendorName ? ` — ${selectedInvoice.vendorName}` : ''}`
                      : searchInput
                  }
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  className={`${styles.searchInput} ${error?.field === 'invoice' ? styles.inputError : ''}`}
                  disabled={isSaving}
                />
                {showDropdown && filteredInvoices.length > 0 && (
                  <div className={styles.dropdownList}>
                    {filteredInvoices.map((inv) => (
                      <button
                        key={inv.id}
                        type="button"
                        className={`${styles.dropdownItem} ${selectedInvoiceId === inv.id ? styles.dropdownItemActive : ''} ${roundMoney(inv.remainingAmount) <= 0 ? styles.dropdownItemDone : ''}`}
                        title={inv.notes ?? undefined}
                        data-testid={`invoice-link-option-${inv.id}`}
                        onClick={() => handleSelectInvoice(inv)}
                      >
                        <span className={styles.dropdownItemMain}>
                          <span className={styles.dropdownItemNumber}>
                            {inv.invoiceNumber
                              ? `#${inv.invoiceNumber}`
                              : t('invoiceLinkModal.invoiceFallbackLabel', {
                                  id: inv.id.slice(0, 8),
                                })}
                          </span>
                          {inv.vendorName && (
                            <span className={styles.dropdownItemVendor}>{inv.vendorName}</span>
                          )}
                        </span>
                        <span className={styles.dropdownItemAmount}>
                          {roundMoney(inv.remainingAmount) > 0
                            ? formatCurrency(roundMoney(inv.remainingAmount))
                            : t('invoiceLinkModal.nothingLeftToLink')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {showDropdown && searchInput && filteredInvoices.length === 0 && (
                  <div className={styles.dropdownEmpty}>{t('invoiceLinkModal.noMatches')}</div>
                )}
              </div>
              {error?.field === 'invoice' && <FormError message={error.message} variant="field" />}
              {selectedInvoice && (
                <div
                  className={`${styles.remainingAmountInfo} ${overAllocated ? styles.remainingAmountWarning : ''}`}
                >
                  {overAllocated
                    ? t('invoiceLinkModal.overAllocated', {
                        amount: formatCurrency(Math.abs(remainingAmount)),
                      })
                    : fullyAllocated
                      ? t('invoiceLinkModal.fullyAllocated')
                      : t('invoiceLinkModal.availableOnInvoice', {
                          amount: formatCurrency(remainingAmount),
                        })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Amount Input */}
        <div className={styles.formGroup}>
          <label htmlFor="amount-input" className={styles.label}>
            {t('invoiceLinkModal.amountLabel')}
          </label>
          {selectedInvoice && (
            <div className={styles.amountInputWrapper}>
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
                onWheel={(e) => e.currentTarget.blur()}
              />
              {amountIndicator}
            </div>
          )}
          {!selectedInvoice && (
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
              onWheel={(e) => e.currentTarget.blur()}
            />
          )}
          {error?.field === 'amount' && <FormError message={error.message} variant="field" />}
        </div>
      </form>
    </Modal>
  );
}
