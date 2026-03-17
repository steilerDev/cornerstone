import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Invoice, InvoiceStatus } from '@cornerstone/shared';
import { fetchInvoiceById, updateInvoice, deleteInvoice } from '../../lib/invoicesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { formatDate, formatCurrency } from '../../lib/formatters.js';
import { LinkedDocumentsSection } from '../../components/documents/LinkedDocumentsSection.js';
import { InvoiceBudgetLinesSection } from './InvoiceBudgetLinesSection.js';
import styles from './InvoiceDetailPage.module.css';

// STATUS_LABELS will be dynamically generated from i18n

interface InvoiceFormState {
  invoiceNumber: string;
  amount: string;
  date: string;
  dueDate: string;
  status: InvoiceStatus;
  notes: string;
}

export function InvoiceDetailPage() {
  const { t } = useTranslation('budget');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<InvoiceFormState>({
    invoiceNumber: '',
    amount: '',
    date: '',
    dueDate: '',
    status: 'pending',
    notes: '',
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (!id) return;
    void loadInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadInvoice = async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchInvoiceById(id);
      setInvoice(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 404) {
          setError(t('invoiceDetail.invoiceNotFound'));
        } else {
          setError(err.error.message);
        }
      } else {
        setError(t('invoiceDetail.invoiceNotFound'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const openEditModal = () => {
    if (!invoice) return;
    setEditForm({
      invoiceNumber: invoice.invoiceNumber ?? '',
      amount: invoice.amount.toString(),
      date: invoice.date.slice(0, 10),
      dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : '',
      status: invoice.status,
      notes: invoice.notes ?? '',
    });
    setEditError('');
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    if (!isUpdating) {
      setShowEditModal(false);
      setEditError('');
    }
  };

  const handleUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!invoice) return;
    const amount = parseFloat(editForm.amount);
    if (isNaN(amount) || amount <= 0) {
      setEditError(t('invoiceDetail.validation.amountRequired'));
      return;
    }
    if (!editForm.date) {
      setEditError(t('invoiceDetail.validation.dateRequired'));
      return;
    }
    setIsUpdating(true);
    setEditError('');
    try {
      const updated = await updateInvoice(invoice.vendorId, invoice.id, {
        invoiceNumber: editForm.invoiceNumber.trim() || null,
        amount,
        date: editForm.date,
        dueDate: editForm.dueDate || null,
        status: editForm.status,
        notes: editForm.notes.trim() || null,
      });
      setInvoice(updated);
      setShowEditModal(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setEditError(err.error.message);
      } else {
        setEditError(t('invoiceDetail.messages.updateError'));
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const openDeleteModal = () => {
    setDeleteError('');
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    if (!isDeleting) {
      setShowDeleteModal(false);
      setDeleteError('');
    }
  };

  const handleDelete = async () => {
    if (!invoice) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteInvoice(invoice.vendorId, invoice.id);
      navigate('/budget/invoices');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteError(err.error.message);
      } else {
        setDeleteError(t('invoiceDetail.messages.deleteError'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t('invoiceDetail.loading')}</div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>{t('invoiceDetail.error')}</h2>
          <p>{error ?? t('invoiceDetail.invoiceNotFound')}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => navigate('/budget/invoices')}
            >
              {t('invoiceDetail.backToInvoices')}
            </button>
            <button type="button" className={styles.button} onClick={() => void loadInvoice()}>
              {t('invoiceDetail.retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Navigation buttons */}
        <div className={styles.navButtons}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/budget/invoices')}
          >
            ← {t('invoiceDetail.backToInvoices')}
          </button>
        </div>

        {/* Page heading */}
        <div className={styles.headerRow}>
          <div className={styles.pageHeading}>
            <h1 className={styles.pageTitle}>
              {invoice.invoiceNumber
                ? `#${invoice.invoiceNumber}`
                : t('invoiceDetail.invoiceDetails')}
            </h1>
            <span className={`${styles.statusBadge} ${styles[`status_${invoice.status}`]}`}>
              {t(`invoiceDetail.statusLabels.${invoice.status}`)}
            </span>
          </div>
          <div className={styles.pageActions}>
            <button type="button" className={styles.editButton} onClick={openEditModal}>
              {t('invoiceDetail.buttons.edit')}
            </button>
            <button type="button" className={styles.deleteButton} onClick={openDeleteModal}>
              {t('invoiceDetail.buttons.delete')}
            </button>
          </div>
        </div>

        {/* Detail card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>{t('invoiceDetail.invoiceDetails')}</h2>
          </div>
          <dl className={styles.infoList}>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Invoice #</dt>
              <dd className={styles.infoValue}>{invoice.invoiceNumber ?? '\u2014'}</dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Vendor</dt>
              <dd className={styles.infoValue}>
                <Link to={`/budget/vendors/${invoice.vendorId}`} className={styles.infoLink}>
                  {invoice.vendorName}
                </Link>
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Amount</dt>
              <dd className={`${styles.infoValue} ${styles.infoValueAmount}`}>
                {formatCurrency(invoice.amount)}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Date</dt>
              <dd className={styles.infoValue}>{formatDate(invoice.date)}</dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Due Date</dt>
              <dd className={styles.infoValue}>
                {invoice.dueDate ? formatDate(invoice.dueDate) : '\u2014'}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Status</dt>
              <dd className={styles.infoValue}>
                <span className={`${styles.statusBadge} ${styles[`status_${invoice.status}`]}`}>
                  {t(`invoiceDetail.statusLabels.${invoice.status}`)}
                </span>
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Notes</dt>
              <dd className={`${styles.infoValue} ${invoice.notes ? styles.infoValueNotes : ''}`}>
                {invoice.notes ?? '\u2014'}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Created by</dt>
              <dd className={styles.infoValue}>{invoice.createdBy?.displayName ?? '\u2014'}</dd>
            </div>
          </dl>
        </section>

        <InvoiceBudgetLinesSection invoiceId={id!} invoiceTotal={invoice.amount} />

        <LinkedDocumentsSection entityType="invoice" entityId={id!} />
      </div>

      {/* Edit invoice modal */}
      {showEditModal && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeEditModal} />
          <div className={`${styles.modalContent} ${styles.modalContentWide}`}>
            <h2 id="edit-modal-title" className={styles.modalTitle}>
              Edit Invoice
            </h2>
            <form onSubmit={handleUpdate} className={styles.form} noValidate>
              {editError && (
                <div className={styles.errorBanner} role="alert">
                  {editError}
                </div>
              )}

              <div className={styles.formRow}>
                <div className={styles.fieldGrow}>
                  <label htmlFor="edit-invoice-number" className={styles.label}>
                    Invoice #
                  </label>
                  <input
                    type="text"
                    id="edit-invoice-number"
                    value={editForm.invoiceNumber}
                    onChange={(e) => setEditForm({ ...editForm, invoiceNumber: e.target.value })}
                    className={styles.input}
                    placeholder="e.g., INV-001"
                    maxLength={100}
                    disabled={isUpdating}
                  />
                </div>
                <div className={styles.fieldGrow}>
                  <label htmlFor="edit-amount" className={styles.label}>
                    Amount <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="number"
                    id="edit-amount"
                    value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                    className={styles.input}
                    placeholder="0.00"
                    min="0.01"
                    step="0.01"
                    required
                    disabled={isUpdating}
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.fieldGrow}>
                  <label htmlFor="edit-date" className={styles.label}>
                    Invoice Date <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="date"
                    id="edit-date"
                    value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                    className={styles.input}
                    required
                    disabled={isUpdating}
                  />
                </div>
                <div className={styles.fieldGrow}>
                  <label htmlFor="edit-due-date" className={styles.label}>
                    Due Date
                  </label>
                  <input
                    type="date"
                    id="edit-due-date"
                    value={editForm.dueDate}
                    onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                    className={styles.input}
                    disabled={isUpdating}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="edit-status" className={styles.label}>
                  Status
                </label>
                <select
                  id="edit-status"
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm({ ...editForm, status: e.target.value as InvoiceStatus })
                  }
                  className={styles.select}
                  disabled={isUpdating}
                >
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="claimed">Claimed</option>
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="edit-notes" className={styles.label}>
                  Notes
                </label>
                <textarea
                  id="edit-notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className={styles.textarea}
                  rows={3}
                  disabled={isUpdating}
                />
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={closeEditModal}
                  disabled={isUpdating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.saveButton}
                  disabled={isUpdating || !editForm.amount || !editForm.date}
                >
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeDeleteModal} />
          <div className={styles.modalContent}>
            <h2 id="delete-modal-title" className={styles.modalTitle}>
              Delete Invoice
            </h2>
            <p className={styles.modalText}>
              Are you sure you want to delete invoice{' '}
              {invoice.invoiceNumber ? <strong>#{invoice.invoiceNumber}</strong> : 'this invoice'}{' '}
              for <strong>{formatCurrency(invoice.amount)}</strong>?
            </p>
            {deleteError ? (
              <div className={styles.errorBanner} role="alert">
                {deleteError}
              </div>
            ) : (
              <p className={styles.modalWarning}>This action cannot be undone.</p>
            )}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeDeleteModal}
                disabled={isDeleting}
              >
                Cancel
              </button>
              {!deleteError && (
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete Invoice'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InvoiceDetailPage;
