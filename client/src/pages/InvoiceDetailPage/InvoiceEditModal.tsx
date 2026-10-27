import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { INVOICE_STATUSES } from '@cornerstone/shared';
import type { InvoiceDetail, InvoiceStatus } from '@cornerstone/shared';
import { EntityPicker } from '../../components/EntityPicker/EntityPicker.js';
import { FormError } from '../../components/FormError/FormError.js';
import { Modal } from '../../components/Modal/Modal.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { updateInvoice } from '../../lib/invoicesApi.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './InvoiceEditModal.module.css';

interface InvoiceFormState {
  invoiceNumber: string;
  amount: string;
  date: string;
  dueDate: string;
  status: InvoiceStatus;
  notes: string;
  vendorId: string;
  vendorName: string;
}

function formFor(invoice: InvoiceDetail): InvoiceFormState {
  return {
    invoiceNumber: invoice.invoiceNumber ?? '',
    amount: invoice.amount.toString(),
    date: invoice.date.slice(0, 10),
    dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : '',
    status: invoice.status,
    notes: invoice.notes ?? '',
    vendorId: invoice.vendorId,
    vendorName: invoice.vendorName,
  };
}

export interface InvoiceEditModalProps {
  readonly invoice: InvoiceDetail;
  /** After a successful save: the page refresh (the PATCH response lacks the money figures). */
  readonly onSaved: () => Promise<unknown>;
  readonly onClose: () => void;
}

/** Edit details of an offer or invoice: the same fields as the create dialog. */
export function InvoiceEditModal({ invoice, onSaved, onClose }: InvoiceEditModalProps) {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { formatCurrency } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const [form, setForm] = useState<InvoiceFormState>(() => formFor(invoice));
  const [isUpdating, setIsUpdating] = useState(false);
  // The New company form stacks over this dialog; the lower dialog stays put meanwhile.
  const [isCreatingCompany, setIsCreatingCompany] = useState(false);
  const [editError, setEditError] = useState('');
  const [vendorError, setVendorError] = useState('');

  const saveBlocked = isUpdating || !form.amount || !form.date;

  const close = () => {
    if (!isUpdating && !isCreatingCompany) onClose();
  };

  const handleUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (saveBlocked) return;
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      setEditError(t('invoiceDetail.validation.amountRequired'));
      return;
    }
    if (!form.vendorId) {
      setVendorError(t('invoiceDetail.validation.vendorRequired'));
      return;
    }
    setIsUpdating(true);
    setEditError('');
    setVendorError('');
    try {
      await updateInvoice(invoice.vendorId, invoice.id, {
        invoiceNumber: form.invoiceNumber.trim() || null,
        amount,
        date: form.date,
        dueDate: form.dueDate || null,
        status: form.status,
        notes: form.notes.trim() || null,
        vendorId: form.vendorId,
      });
      await onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 404 && err.error.code === 'NOT_FOUND') {
          setEditError(t('invoiceDetail.messages.vendorNotFound'));
        } else if (err.error.code === 'ITEMIZED_SUM_EXCEEDS_INVOICE') {
          const itemizedTotal =
            (err.error.details as { itemizedTotal?: number } | undefined)?.itemizedTotal ?? 0;
          setEditError(
            t('invoiceDetail.messages.amountBelowItemized', {
              itemizedTotal: formatCurrency(itemizedTotal),
            }),
          );
        } else {
          setEditError(translateApiError(err.error.code, tErrors));
        }
      } else {
        setEditError(t('invoiceDetail.messages.updateError'));
      }
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Modal
      title={t('invoiceDetail.modal.editTitle')}
      onClose={close}
      className={styles.modalContentWide}
      dismissible={!isUpdating && !isCreatingCompany}
    >
      <div>
        <form onSubmit={(event) => void handleUpdate(event)} className={styles.form} noValidate>
          <FormError message={editError} />

          <div className={styles.formRow}>
            <div className={styles.fieldGrow}>
              <label htmlFor="edit-invoice-number" className={styles.label}>
                {t('invoiceDetail.form.invoiceNumber')}
              </label>
              <input
                type="text"
                id="edit-invoice-number"
                value={form.invoiceNumber}
                onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                className={sharedStyles.input}
                placeholder={t('invoiceDetail.form.placeholders.invoiceNumber')}
                maxLength={100}
                disabled={isUpdating}
              />
            </div>
            <div className={styles.fieldGrow}>
              <label htmlFor="edit-amount" className={styles.label}>
                {t('invoiceDetail.form.amount')}{' '}
                <span className={styles.required}>{t('invoiceDetail.form.required')}</span>
              </label>
              <input
                type="number"
                id="edit-amount"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className={sharedStyles.input}
                min="0.01"
                step="0.01"
                required
                disabled={isUpdating}
                onWheel={(e) => e.currentTarget.blur()}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="edit-vendor" className={styles.label}>
              {t('invoiceDetail.form.vendor')}{' '}
              <span className={styles.required}>{t('invoiceDetail.form.required')}</span>
            </label>
            <EntityPicker
              kind="company"
              id="edit-vendor"
              value={form.vendorId}
              onChange={(vendorId) => setForm({ ...form, vendorId })}
              selectedLabel={form.vendorName}
              onCreatingChange={setIsCreatingCompany}
              disabled={isUpdating}
              placeholder={t('invoiceDetail.form.placeholders.vendor')}
            />
            <FormError message={vendorError} variant="field" />
          </div>

          <div className={styles.formRow}>
            <div className={styles.fieldGrow}>
              <label htmlFor="edit-date" className={styles.label}>
                {t('invoiceDetail.form.invoiceDate')}{' '}
                <span className={styles.required}>{t('invoiceDetail.form.required')}</span>
              </label>
              <input
                type="date"
                id="edit-date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={sharedStyles.input}
                required
                disabled={isUpdating}
              />
            </div>
            <div className={styles.fieldGrow}>
              <label htmlFor="edit-due-date" className={styles.label}>
                {t('invoiceDetail.form.dueDate')}
              </label>
              <input
                type="date"
                id="edit-due-date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className={sharedStyles.input}
                disabled={isUpdating}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="edit-status" className={styles.label}>
              {t('invoiceDetail.form.status')}
            </label>
            <select
              id="edit-status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as InvoiceStatus })}
              className={sharedStyles.select}
              disabled={isUpdating}
            >
              {INVOICE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusVariants.invoice[status].label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="edit-notes" className={styles.label}>
              {t('invoiceDetail.form.notes')}
            </label>
            <textarea
              id="edit-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={sharedStyles.textarea}
              rows={3}
              disabled={isUpdating}
            />
          </div>

          <div className={styles.modalActions}>
            <button
              type="button"
              className={sharedStyles.btnSecondary}
              onClick={close}
              disabled={isUpdating}
            >
              {t('invoiceDetail.buttons.cancel')}
            </button>
            <button
              type="submit"
              className={`${sharedStyles.btnPrimary} ${styles.saveButton}`}
              aria-disabled={saveBlocked ? 'true' : undefined}
              aria-busy={isUpdating ? 'true' : undefined}
            >
              {isUpdating ? t('invoiceDetail.buttons.saving') : t('invoiceDetail.buttons.save')}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
