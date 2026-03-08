import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type {
  Invoice,
  InvoiceStatus,
  WorkItemBudgetLine,
  HouseholdItemBudgetLine,
} from '@cornerstone/shared';
import { fetchInvoiceById, updateInvoice, deleteInvoice } from '../../lib/invoicesApi.js';
import { fetchWorkItemBudgets } from '../../lib/workItemBudgetsApi.js';
import { fetchHouseholdItemBudgets } from '../../lib/householdItemBudgetsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { formatDate, formatCurrency } from '../../lib/formatters.js';
import { WorkItemPicker } from '../../components/WorkItemPicker/WorkItemPicker.js';
import { HouseholdItemPicker } from '../../components/HouseholdItemPicker/HouseholdItemPicker.js';
import { LinkedDocumentsSection } from '../../components/documents/LinkedDocumentsSection.js';
import { BudgetSubNav } from '../../components/BudgetSubNav/BudgetSubNav.js';
import styles from './InvoiceDetailPage.module.css';

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
  selectedHouseholdItemId: string;
  householdItemBudgetId: string;
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
    selectedHouseholdItemId: '',
    householdItemBudgetId: '',
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState('');
  const [budgetLinkTouched, setBudgetLinkTouched] = useState(false);
  const [householdItemBudgetLinkTouched, setHouseholdItemBudgetLinkTouched] = useState(false);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Budget lines for the selected work item
  const [budgetLines, setBudgetLines] = useState<WorkItemBudgetLine[]>([]);
  const [budgetLinesLoading, setBudgetLinesLoading] = useState(false);
  const [householdItemBudgetLines, setHouseholdItemBudgetLines] = useState<
    HouseholdItemBudgetLine[]
  >([]);
  const [householdItemBudgetLinesLoading, setHouseholdItemBudgetLinesLoading] = useState(false);

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
    const preSelectedWorkItemId = invoice.workItemBudget?.workItemId ?? '';
    const preSelectedHouseholdItemId = invoice.householdItemBudget?.householdItemId ?? '';
    setEditForm({
      invoiceNumber: invoice.invoiceNumber ?? '',
      amount: invoice.amount.toString(),
      date: invoice.date.slice(0, 10),
      dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : '',
      status: invoice.status,
      notes: invoice.notes ?? '',
      selectedWorkItemId: preSelectedWorkItemId,
      workItemBudgetId: invoice.workItemBudgetId ?? '',
      selectedHouseholdItemId: preSelectedHouseholdItemId,
      householdItemBudgetId: invoice.householdItemBudgetId ?? '',
    });
    // Pre-fetch budget lines for the already-linked work item
    if (preSelectedWorkItemId) {
      setBudgetLinesLoading(true);
      void fetchWorkItemBudgets(preSelectedWorkItemId)
        .then((lines) => setBudgetLines(lines))
        .catch(() => setBudgetLines([]))
        .finally(() => setBudgetLinesLoading(false));
    } else {
      setBudgetLines([]);
    }
    // Pre-fetch budget lines for the already-linked household item
    if (preSelectedHouseholdItemId) {
      setHouseholdItemBudgetLinesLoading(true);
      void fetchHouseholdItemBudgets(preSelectedHouseholdItemId)
        .then((lines) => setHouseholdItemBudgetLines(lines))
        .catch(() => setHouseholdItemBudgetLines([]))
        .finally(() => setHouseholdItemBudgetLinesLoading(false));
    } else {
      setHouseholdItemBudgetLines([]);
    }
    setBudgetLinkTouched(false);
    setHouseholdItemBudgetLinkTouched(false);
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
        ...(householdItemBudgetLinkTouched
          ? { householdItemBudgetId: editForm.householdItemBudgetId || null }
          : {}),
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
        <BudgetSubNav />

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
                    to={`/project/work-items/${invoice.workItemBudget.workItemId}`}
                    className={styles.infoLink}
                  >
                    {invoice.workItemBudget.workItemTitle}
                  </Link>
                </dd>
              </div>
            )}
            {invoice.householdItemBudget && (
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Household Item</dt>
                <dd className={styles.infoValue}>
                  <Link
                    to={`/project/household-items/${invoice.householdItemBudget.householdItemId}`}
                    className={styles.infoLink}
                  >
                    {invoice.householdItemBudget.householdItemName}
                  </Link>
                  {invoice.householdItemBudget.description && (
                    <span className={styles.budgetLineDescription}>
                      {' '}
                      — {invoice.householdItemBudget.description}
                    </span>
                  )}
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
                <span className={styles.label}>Link to Work Item</span>
                <WorkItemPicker
                  value={editForm.selectedWorkItemId}
                  onChange={(workItemId) => {
                    setBudgetLinkTouched(true);
                    setHouseholdItemBudgetLinkTouched(true);
                    setEditForm({
                      ...editForm,
                      selectedWorkItemId: workItemId,
                      workItemBudgetId: '',
                      selectedHouseholdItemId: '',
                      householdItemBudgetId: '',
                    });
                    if (workItemId) {
                      setBudgetLinesLoading(true);
                      void fetchWorkItemBudgets(workItemId)
                        .then((lines) => setBudgetLines(lines))
                        .catch(() => setBudgetLines([]))
                        .finally(() => setBudgetLinesLoading(false));
                    } else {
                      setBudgetLines([]);
                    }
                  }}
                  excludeIds={[]}
                  disabled={isUpdating}
                  placeholder="Search work items..."
                  showItemsOnFocus
                  initialTitle={invoice.workItemBudget?.workItemTitle ?? undefined}
                />
              </div>

              {editForm.selectedWorkItemId && (
                <div className={styles.field}>
                  <label htmlFor="edit-budget-line" className={styles.label}>
                    Budget Line
                  </label>
                  <select
                    id="edit-budget-line"
                    value={editForm.workItemBudgetId}
                    onChange={(e) => {
                      setBudgetLinkTouched(true);
                      setEditForm({ ...editForm, workItemBudgetId: e.target.value });
                    }}
                    className={styles.select}
                    disabled={isUpdating || budgetLinesLoading}
                  >
                    <option value="">None</option>
                    {budgetLines.map((bl) => (
                      <option key={bl.id} value={bl.id}>
                        {bl.description || `${formatCurrency(bl.plannedAmount)} (${bl.confidence})`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={styles.separator}>— or —</div>

              <div className={styles.field}>
                <span className={styles.label}>Link to Household Item</span>
                <HouseholdItemPicker
                  value={editForm.selectedHouseholdItemId}
                  onChange={(householdItemId) => {
                    setHouseholdItemBudgetLinkTouched(true);
                    setBudgetLinkTouched(true);
                    setEditForm({
                      ...editForm,
                      selectedHouseholdItemId: householdItemId,
                      householdItemBudgetId: '',
                      selectedWorkItemId: '',
                      workItemBudgetId: '',
                    });
                    if (householdItemId) {
                      setHouseholdItemBudgetLinesLoading(true);
                      void fetchHouseholdItemBudgets(householdItemId)
                        .then((lines) => setHouseholdItemBudgetLines(lines))
                        .catch(() => setHouseholdItemBudgetLines([]))
                        .finally(() => setHouseholdItemBudgetLinesLoading(false));
                    } else {
                      setHouseholdItemBudgetLines([]);
                    }
                  }}
                  excludeIds={[]}
                  disabled={isUpdating}
                  placeholder="Search household items..."
                  showItemsOnFocus
                  initialTitle={invoice.householdItemBudget?.householdItemName ?? undefined}
                />
              </div>

              {editForm.selectedHouseholdItemId && (
                <div className={styles.field}>
                  <label htmlFor="edit-household-budget-line" className={styles.label}>
                    Budget Line
                  </label>
                  <select
                    id="edit-household-budget-line"
                    value={editForm.householdItemBudgetId}
                    onChange={(e) => {
                      setHouseholdItemBudgetLinkTouched(true);
                      setEditForm({ ...editForm, householdItemBudgetId: e.target.value });
                    }}
                    className={styles.select}
                    disabled={isUpdating || householdItemBudgetLinesLoading}
                  >
                    <option value="">None</option>
                    {householdItemBudgetLines.map((bl) => (
                      <option key={bl.id} value={bl.id}>
                        {bl.description || `${formatCurrency(bl.plannedAmount)} (${bl.confidence})`}
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
