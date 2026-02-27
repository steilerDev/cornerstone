import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type {
  Invoice,
  InvoiceStatus,
  WorkItemSummary,
  WorkItemBudgetLine,
} from '@cornerstone/shared';
import { fetchInvoiceById, updateInvoice, deleteInvoice } from '../../lib/invoicesApi.js';
import { fetchWorkItemBudgets } from '../../lib/workItemBudgetsApi.js';
import { listWorkItems } from '../../lib/workItemsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { formatDate } from '../../lib/formatters.js';
import styles from './InvoiceDetailPage.module.css';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  claimed: 'Claimed',
};

interface InvoiceFormState {
  invoiceNumber: string;
  amount: string;
  date: string;
  dueDate: string;
  status: InvoiceStatus;
  notes: string;
  selectedWorkItemId: string;
  workItemBudgetId: string;
}

export function InvoiceDetailPage() {
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
    selectedWorkItemId: '',
    workItemBudgetId: '',
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState('');
  const [budgetLinkTouched, setBudgetLinkTouched] = useState(false);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Work items + budget lines for link dropdowns
  const [workItems, setWorkItems] = useState<WorkItemSummary[]>([]);
  const [budgetLines, setBudgetLines] = useState<WorkItemBudgetLine[]>([]);
  const [budgetLinesLoading, setBudgetLinesLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    void loadInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void listWorkItems({ pageSize: 100 }).then((res) => setWorkItems(res.items));
  }, []);

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
          setError('Invoice not found. It may have been deleted.');
        } else {
          setError(err.error.message);
        }
      } else {
        setError('Failed to load invoice. Please try again.');
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
      selectedWorkItemId: '',
      workItemBudgetId: invoice.workItemBudgetId ?? '',
    });
    setBudgetLines([]);
    setBudgetLinkTouched(false);
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
      setEditError('Amount must be a positive number.');
      return;
    }
    if (!editForm.date) {
      setEditError('Invoice date is required.');
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
        ...(budgetLinkTouched ? { workItemBudgetId: editForm.workItemBudgetId || null } : {}),
      });
      setInvoice(updated);
      setShowEditModal(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setEditError(err.error.message);
      } else {
        setEditError('Failed to update invoice. Please try again.');
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
        setDeleteError('Failed to delete invoice. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading invoice...</div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>Error</h2>
          <p>{error ?? 'Invoice not found.'}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => navigate('/budget/invoices')}
            >
              Back to Invoices
            </button>
            <button type="button" className={styles.button} onClick={() => void loadInvoice()}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <Link to="/budget/invoices" className={styles.backLink}>
            Invoices
          </Link>
          <span className={styles.breadcrumbSeparator} aria-hidden="true">
            /
          </span>
          <span className={styles.breadcrumbCurrent}>{invoice.invoiceNumber ?? 'Invoice'}</span>
        </div>

        {/* Page heading */}
        <div className={styles.pageHeader}>
          <div className={styles.pageHeading}>
            <h1 className={styles.pageTitle}>
              {invoice.invoiceNumber ? `#${invoice.invoiceNumber}` : 'Invoice'}
            </h1>
            <span className={`${styles.statusBadge} ${styles[`status_${invoice.status}`]}`}>
              {STATUS_LABELS[invoice.status]}
            </span>
          </div>
          <div className={styles.pageActions}>
            <button type="button" className={styles.editButton} onClick={openEditModal}>
              Edit
            </button>
            <button type="button" className={styles.deleteButton} onClick={openDeleteModal}>
              Delete
            </button>
          </div>
        </div>

        {/* Detail card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Invoice Details</h2>
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
                  {STATUS_LABELS[invoice.status]}
                </span>
              </dd>
            </div>
            {invoice.workItemBudget && (
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Work Item</dt>
                <dd className={styles.infoValue}>
                  <Link
                    to={`/work-items/${invoice.workItemBudget.workItemId}`}
                    className={styles.infoLink}
                  >
                    {invoice.workItemBudget.workItemTitle}
                  </Link>
                </dd>
              </div>
            )}
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
                <label htmlFor="edit-work-item" className={styles.label}>
                  Link to Work Item
                </label>
                {invoice.workItemBudgetId && !budgetLinkTouched && (
                  <p className={styles.budgetLinkNote}>
                    Currently linked to a budget line. Select a work item to update the link.
                  </p>
                )}
                <select
                  id="edit-work-item"
                  value={editForm.selectedWorkItemId}
                  onChange={(e) => {
                    const workItemId = e.target.value;
                    setBudgetLinkTouched(true);
                    setEditForm({
                      ...editForm,
                      selectedWorkItemId: workItemId,
                      workItemBudgetId: '',
                    });
                    if (workItemId) {
                      setBudgetLinesLoading(true);
                      void fetchWorkItemBudgets(workItemId)
                        .then((lines) => {
                          setBudgetLines(lines);
                        })
                        .catch(() => {
                          setBudgetLines([]);
                        })
                        .finally(() => {
                          setBudgetLinesLoading(false);
                        });
                    } else {
                      setBudgetLines([]);
                    }
                  }}
                  className={styles.select}
                  disabled={isUpdating}
                >
                  <option value="">None</option>
                  {workItems.map((wi) => (
                    <option key={wi.id} value={wi.id}>
                      {wi.title}
                    </option>
                  ))}
                </select>
              </div>

              {editForm.selectedWorkItemId && (
                <div className={styles.field}>
                  <label htmlFor="edit-budget-line" className={styles.label}>
                    Budget Line
                  </label>
                  <select
                    id="edit-budget-line"
                    value={editForm.workItemBudgetId}
                    onChange={(e) => setEditForm({ ...editForm, workItemBudgetId: e.target.value })}
                    className={styles.select}
                    disabled={isUpdating || budgetLinesLoading}
                  >
                    <option value="">None</option>
                    {budgetLines.map((bl) => (
                      <option key={bl.id} value={bl.id}>
                        {bl.description ||
                          `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(bl.plannedAmount)} (${bl.confidence})`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
