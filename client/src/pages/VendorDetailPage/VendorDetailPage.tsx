import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type {
  VendorDetail,
  UpdateVendorRequest,
  Invoice,
  InvoiceStatus,
} from '@cornerstone/shared';
import { fetchVendor, updateVendor, deleteVendor } from '../../lib/vendorsApi.js';
import {
  fetchInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice,
} from '../../lib/invoicesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import styles from './VendorDetailPage.module.css';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  // dateStr is an ISO date string (YYYY-MM-DD or ISO timestamp)
  // Display as localized date without timezone conversion issues
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  overdue: 'Overdue',
};

/** Invoice form state used for both create and edit. */
interface InvoiceFormState {
  invoiceNumber: string;
  amount: string;
  date: string;
  dueDate: string;
  status: InvoiceStatus;
  notes: string;
}

const EMPTY_INVOICE_FORM: InvoiceFormState = {
  invoiceNumber: '',
  amount: '',
  date: '',
  dueDate: '',
  status: 'pending',
  notes: '',
};

export function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<UpdateVendorRequest>({});
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState<string>('');

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');

  // Invoice list state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);

  // Create invoice modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<InvoiceFormState>(EMPTY_INVOICE_FORM);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>('');

  // Edit invoice modal state
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editInvoiceForm, setEditInvoiceForm] = useState<InvoiceFormState>(EMPTY_INVOICE_FORM);
  const [isUpdatingInvoice, setIsUpdatingInvoice] = useState(false);
  const [editInvoiceError, setEditInvoiceError] = useState<string>('');

  // Delete invoice confirmation state
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null);
  const [isDeletingInvoice, setIsDeletingInvoice] = useState(false);
  const [deleteInvoiceError, setDeleteInvoiceError] = useState<string>('');

  useEffect(() => {
    if (!id) return;
    void loadVendor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadVendor = async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchVendor(id);
      setVendor(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 404) {
          setError('Vendor not found. It may have been deleted.');
        } else {
          setError(err.error.message);
        }
      } else {
        setError('Failed to load vendor. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const startEdit = () => {
    if (!vendor) return;
    setEditForm({
      name: vendor.name,
      specialty: vendor.specialty ?? '',
      phone: vendor.phone ?? '',
      email: vendor.email ?? '',
      address: vendor.address ?? '',
      notes: vendor.notes ?? '',
    });
    setEditError('');
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditError('');
  };

  const handleUpdate = async (event: FormEvent) => {
    event.preventDefault();
    if (!vendor || !id) return;

    const trimmedName = (editForm.name ?? '').trim();
    if (!trimmedName) {
      setEditError('Vendor name is required.');
      return;
    }
    if (trimmedName.length > 200) {
      setEditError('Vendor name must be 200 characters or less.');
      return;
    }

    setIsUpdating(true);
    setEditError('');

    try {
      const updated = await updateVendor(id, {
        name: trimmedName,
        specialty: (editForm.specialty as string)?.trim() || null,
        phone: (editForm.phone as string)?.trim() || null,
        email: (editForm.email as string)?.trim() || null,
        address: (editForm.address as string)?.trim() || null,
        notes: (editForm.notes as string)?.trim() || null,
      });
      setVendor(updated);
      setIsEditing(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setEditError(err.error.message);
      } else {
        setEditError('Failed to update vendor. Please try again.');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const openDeleteConfirm = () => {
    setDeleteError('');
    setShowDeleteConfirm(true);
  };

  const closeDeleteConfirm = () => {
    if (!isDeleting) {
      setShowDeleteConfirm(false);
      setDeleteError('');
    }
  };

  const handleDelete = async () => {
    if (!id) return;

    setIsDeleting(true);
    setDeleteError('');

    try {
      await deleteVendor(id);
      navigate('/budget/vendors');
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setDeleteError(
            'This vendor cannot be deleted because they are referenced by one or more invoices.',
          );
        } else {
          setDeleteError(err.error.message);
        }
      } else {
        setDeleteError('Failed to delete vendor. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // ─── Invoice handlers ──────────────────────────────────────────────────────

  const loadInvoices = useCallback(async () => {
    if (!id) return;
    setInvoicesLoading(true);
    setInvoicesError(null);

    try {
      const data = await fetchInvoices(id);
      setInvoices(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setInvoicesError(err.error.message);
      } else {
        setInvoicesError('Failed to load invoices. Please try again.');
      }
    } finally {
      setInvoicesLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void loadInvoices();
  }, [id, loadInvoices]);

  /** Computes outstanding balance from client-side invoice list (pending + overdue). */
  const computedOutstandingBalance = invoices
    .filter((inv) => inv.status === 'pending' || inv.status === 'overdue')
    .reduce((sum, inv) => sum + inv.amount, 0);

  const openCreateModal = () => {
    setCreateForm(EMPTY_INVOICE_FORM);
    setCreateError('');
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    if (!isCreating) {
      setShowCreateModal(false);
      setCreateError('');
    }
  };

  const handleCreateInvoice = async (event: FormEvent) => {
    event.preventDefault();
    if (!id) return;

    const amount = parseFloat(createForm.amount);
    if (isNaN(amount) || amount < 0) {
      setCreateError('Amount must be a valid non-negative number.');
      return;
    }
    if (!createForm.date) {
      setCreateError('Invoice date is required.');
      return;
    }

    setIsCreating(true);
    setCreateError('');

    try {
      const newInvoice = await createInvoice(id, {
        invoiceNumber: createForm.invoiceNumber.trim() || null,
        amount,
        date: createForm.date,
        dueDate: createForm.dueDate || null,
        status: createForm.status,
        notes: createForm.notes.trim() || null,
      });
      setInvoices((prev) => [newInvoice, ...prev]);
      setShowCreateModal(false);
      // Re-fetch vendor to update stats cards
      void loadVendor();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.error.message);
      } else {
        setCreateError('Failed to create invoice. Please try again.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const openEditInvoiceModal = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setEditInvoiceForm({
      invoiceNumber: invoice.invoiceNumber ?? '',
      amount: invoice.amount.toString(),
      date: invoice.date.slice(0, 10),
      dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : '',
      status: invoice.status,
      notes: invoice.notes ?? '',
    });
    setEditInvoiceError('');
  };

  const closeEditInvoiceModal = () => {
    if (!isUpdatingInvoice) {
      setEditingInvoice(null);
      setEditInvoiceError('');
    }
  };

  const handleUpdateInvoice = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !editingInvoice) return;

    const amount = parseFloat(editInvoiceForm.amount);
    if (isNaN(amount) || amount < 0) {
      setEditInvoiceError('Amount must be a valid non-negative number.');
      return;
    }
    if (!editInvoiceForm.date) {
      setEditInvoiceError('Invoice date is required.');
      return;
    }

    setIsUpdatingInvoice(true);
    setEditInvoiceError('');

    try {
      const updated = await updateInvoice(id, editingInvoice.id, {
        invoiceNumber: editInvoiceForm.invoiceNumber.trim() || null,
        amount,
        date: editInvoiceForm.date,
        dueDate: editInvoiceForm.dueDate || null,
        status: editInvoiceForm.status,
        notes: editInvoiceForm.notes.trim() || null,
      });
      setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)));
      setEditingInvoice(null);
      // Re-fetch vendor to update stats cards
      void loadVendor();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setEditInvoiceError(err.error.message);
      } else {
        setEditInvoiceError('Failed to update invoice. Please try again.');
      }
    } finally {
      setIsUpdatingInvoice(false);
    }
  };

  const openDeleteInvoiceConfirm = (invoice: Invoice) => {
    setDeletingInvoice(invoice);
    setDeleteInvoiceError('');
  };

  const closeDeleteInvoiceConfirm = () => {
    if (!isDeletingInvoice) {
      setDeletingInvoice(null);
      setDeleteInvoiceError('');
    }
  };

  const handleDeleteInvoice = async () => {
    if (!id || !deletingInvoice) return;

    setIsDeletingInvoice(true);
    setDeleteInvoiceError('');

    try {
      await deleteInvoice(id, deletingInvoice.id);
      setInvoices((prev) => prev.filter((inv) => inv.id !== deletingInvoice.id));
      setDeletingInvoice(null);
      // Re-fetch vendor to update stats cards
      void loadVendor();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteInvoiceError(err.error.message);
      } else {
        setDeleteInvoiceError('Failed to delete invoice. Please try again.');
      }
    } finally {
      setIsDeletingInvoice(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading vendor...</div>
      </div>
    );
  }

  if (error || !vendor) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>Error</h2>
          <p>{error ?? 'Vendor not found.'}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => navigate('/budget/vendors')}
            >
              Back to Vendors
            </button>
            <button type="button" className={styles.button} onClick={() => void loadVendor()}>
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
        {/* Back navigation */}
        <div className={styles.breadcrumb}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => navigate('/budget/vendors')}
          >
            Vendors
          </button>
          <span className={styles.breadcrumbSeparator} aria-hidden="true">
            /
          </span>
          <span className={styles.breadcrumbCurrent}>{vendor.name}</span>
        </div>

        {/* Page heading */}
        <div className={styles.pageHeader}>
          <div className={styles.pageHeading}>
            <h1 className={styles.pageTitle}>{vendor.name}</h1>
            {vendor.specialty && <span className={styles.pageSubtitle}>{vendor.specialty}</span>}
          </div>
          <div className={styles.pageActions}>
            {!isEditing && (
              <>
                <button type="button" className={styles.editButton} onClick={startEdit}>
                  Edit
                </button>
                <button type="button" className={styles.deleteButton} onClick={openDeleteConfirm}>
                  Delete
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stats cards */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Total Invoices</span>
            <span className={styles.statValue}>{vendor.invoiceCount}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Outstanding Balance</span>
            <span
              className={`${styles.statValue} ${vendor.outstandingBalance > 0 ? styles.statValueDanger : ''}`}
            >
              {formatCurrency(vendor.outstandingBalance)}
            </span>
          </div>
        </div>

        {/* Info card — view or edit */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Vendor Information</h2>
          </div>

          {isEditing ? (
            <form onSubmit={handleUpdate} className={styles.form} noValidate>
              {editError && (
                <div className={styles.errorBanner} role="alert">
                  {editError}
                </div>
              )}

              <div className={styles.field}>
                <label htmlFor="edit-name" className={styles.label}>
                  Name <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  id="edit-name"
                  value={(editForm.name as string) ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className={styles.input}
                  maxLength={200}
                  disabled={isUpdating}
                  autoFocus
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="edit-specialty" className={styles.label}>
                  Specialty
                </label>
                <input
                  type="text"
                  id="edit-specialty"
                  value={(editForm.specialty as string) ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, specialty: e.target.value })}
                  className={styles.input}
                  placeholder="e.g., Plumbing, Electrical, Roofing"
                  maxLength={100}
                  disabled={isUpdating}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.fieldGrow}>
                  <label htmlFor="edit-phone" className={styles.label}>
                    Phone
                  </label>
                  <input
                    type="tel"
                    id="edit-phone"
                    value={(editForm.phone as string) ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className={styles.input}
                    placeholder="e.g., +1 555-123-4567"
                    maxLength={50}
                    disabled={isUpdating}
                  />
                </div>
                <div className={styles.fieldGrow}>
                  <label htmlFor="edit-email" className={styles.label}>
                    Email
                  </label>
                  <input
                    type="email"
                    id="edit-email"
                    value={(editForm.email as string) ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className={styles.input}
                    placeholder="e.g., contact@vendor.com"
                    maxLength={255}
                    disabled={isUpdating}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="edit-address" className={styles.label}>
                  Address
                </label>
                <input
                  type="text"
                  id="edit-address"
                  value={(editForm.address as string) ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className={styles.input}
                  placeholder="e.g., 123 Main St, Springfield, IL 62701"
                  maxLength={500}
                  disabled={isUpdating}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="edit-notes" className={styles.label}>
                  Notes
                </label>
                <textarea
                  id="edit-notes"
                  value={(editForm.notes as string) ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className={styles.textarea}
                  rows={4}
                  disabled={isUpdating}
                />
              </div>

              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={styles.saveButton}
                  disabled={isUpdating || !(editForm.name as string)?.trim()}
                >
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={cancelEdit}
                  disabled={isUpdating}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <dl className={styles.infoList}>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Name</dt>
                <dd className={styles.infoValue}>{vendor.name}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Specialty</dt>
                <dd className={styles.infoValue}>{vendor.specialty || '—'}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Phone</dt>
                <dd className={styles.infoValue}>
                  {vendor.phone ? (
                    <a href={`tel:${vendor.phone}`} className={styles.infoLink}>
                      {vendor.phone}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Email</dt>
                <dd className={styles.infoValue}>
                  {vendor.email ? (
                    <a href={`mailto:${vendor.email}`} className={styles.infoLink}>
                      {vendor.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Address</dt>
                <dd className={styles.infoValue}>{vendor.address || '—'}</dd>
              </div>
              {vendor.notes && (
                <div className={styles.infoRow}>
                  <dt className={styles.infoLabel}>Notes</dt>
                  <dd className={`${styles.infoValue} ${styles.infoValueNotes}`}>{vendor.notes}</dd>
                </div>
              )}
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Created by</dt>
                <dd className={styles.infoValue}>{vendor.createdBy?.displayName ?? '—'}</dd>
              </div>
            </dl>
          )}
        </section>

        {/* Invoices section */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Invoices</h2>
            <div className={styles.invoiceHeaderRight}>
              {invoices.length > 0 && (
                <span className={styles.outstandingBalance}>
                  Outstanding:{' '}
                  <strong
                    className={
                      computedOutstandingBalance > 0 ? styles.outstandingAmount : undefined
                    }
                  >
                    {formatCurrency(computedOutstandingBalance)}
                  </strong>
                </span>
              )}
              <button type="button" className={styles.button} onClick={openCreateModal}>
                Add Invoice
              </button>
            </div>
          </div>

          {invoicesLoading && <p className={styles.invoicesLoading}>Loading invoices...</p>}

          {invoicesError && !invoicesLoading && (
            <div className={styles.invoicesError} role="alert">
              <p>{invoicesError}</p>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void loadInvoices()}
              >
                Retry
              </button>
            </div>
          )}

          {!invoicesLoading && !invoicesError && invoices.length === 0 && (
            <div className={styles.invoicesEmpty}>
              <p className={styles.invoicesEmptyText}>No invoices yet.</p>
              <p className={styles.invoicesEmptyHint}>
                Click &ldquo;Add Invoice&rdquo; to record the first invoice for this vendor.
              </p>
            </div>
          )}

          {!invoicesLoading && !invoicesError && invoices.length > 0 && (
            <>
              {/* Desktop table */}
              <div className={styles.tableWrapper}>
                <table className={styles.invoiceTable}>
                  <thead>
                    <tr>
                      <th className={styles.tableHeader}>Invoice #</th>
                      <th className={`${styles.tableHeader} ${styles.tableHeaderRight}`}>Amount</th>
                      <th className={styles.tableHeader}>Date</th>
                      <th className={styles.tableHeader}>Due Date</th>
                      <th className={styles.tableHeader}>Status</th>
                      <th className={`${styles.tableHeader} ${styles.tableHeaderRight}`}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.id} className={styles.tableRow}>
                        <td className={styles.tableCell}>
                          {invoice.invoiceNumber ? (
                            <span className={styles.invoiceNumber}>{invoice.invoiceNumber}</span>
                          ) : (
                            <span className={styles.invoiceNumberNone}>—</span>
                          )}
                        </td>
                        <td
                          className={`${styles.tableCell} ${styles.tableCellRight} ${styles.amountCell}`}
                        >
                          {formatCurrency(invoice.amount)}
                        </td>
                        <td className={styles.tableCell}>{formatDate(invoice.date)}</td>
                        <td className={styles.tableCell}>
                          {invoice.dueDate ? formatDate(invoice.dueDate) : '—'}
                        </td>
                        <td className={styles.tableCell}>
                          <span
                            className={`${styles.invoiceStatusBadge} ${styles[`status_${invoice.status}`]}`}
                          >
                            {INVOICE_STATUS_LABELS[invoice.status]}
                          </span>
                        </td>
                        <td className={`${styles.tableCell} ${styles.tableCellRight}`}>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className={styles.rowActionButton}
                              onClick={() => openEditInvoiceModal(invoice)}
                              aria-label={`Edit invoice ${invoice.invoiceNumber ?? invoice.id}`}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className={`${styles.rowActionButton} ${styles.rowActionButtonDanger}`}
                              onClick={() => openDeleteInvoiceConfirm(invoice)}
                              aria-label={`Delete invoice ${invoice.invoiceNumber ?? invoice.id}`}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <ul className={styles.invoiceCardList} aria-label="Invoices">
                {invoices.map((invoice) => (
                  <li key={invoice.id} className={styles.invoiceCard}>
                    <div className={styles.invoiceCardRow}>
                      <span className={styles.invoiceCardNumber}>
                        {invoice.invoiceNumber ? `#${invoice.invoiceNumber}` : 'No Invoice #'}
                      </span>
                      <span
                        className={`${styles.invoiceStatusBadge} ${styles[`status_${invoice.status}`]}`}
                      >
                        {INVOICE_STATUS_LABELS[invoice.status]}
                      </span>
                    </div>
                    <div className={styles.invoiceCardRow}>
                      <span className={styles.invoiceCardAmount}>
                        {formatCurrency(invoice.amount)}
                      </span>
                      <span className={styles.invoiceCardDate}>{formatDate(invoice.date)}</span>
                    </div>
                    {invoice.dueDate && (
                      <div className={styles.invoiceCardMeta}>
                        Due: {formatDate(invoice.dueDate)}
                      </div>
                    )}
                    {invoice.notes && <div className={styles.invoiceCardMeta}>{invoice.notes}</div>}
                    <div className={styles.invoiceCardActions}>
                      <button
                        type="button"
                        className={styles.rowActionButton}
                        onClick={() => openEditInvoiceModal(invoice)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={`${styles.rowActionButton} ${styles.rowActionButtonDanger}`}
                        onClick={() => openDeleteInvoiceConfirm(invoice)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* Delete vendor confirmation modal */}
      {showDeleteConfirm && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeDeleteConfirm} />
          <div className={styles.modalContent}>
            <h2 id="delete-modal-title" className={styles.modalTitle}>
              Delete Vendor
            </h2>
            <p className={styles.modalText}>
              Are you sure you want to delete &quot;<strong>{vendor.name}</strong>&quot;?
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
                onClick={closeDeleteConfirm}
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
                  {isDeleting ? 'Deleting...' : 'Delete Vendor'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create invoice modal */}
      {showCreateModal && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-invoice-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeCreateModal} />
          <div className={`${styles.modalContent} ${styles.modalContentWide}`}>
            <h2 id="create-invoice-modal-title" className={styles.modalTitle}>
              Add Invoice
            </h2>

            <form onSubmit={handleCreateInvoice} className={styles.form} noValidate>
              {createError && (
                <div className={styles.errorBanner} role="alert">
                  {createError}
                </div>
              )}

              <div className={styles.formRow}>
                <div className={styles.fieldGrow}>
                  <label htmlFor="create-invoice-number" className={styles.label}>
                    Invoice #
                  </label>
                  <input
                    type="text"
                    id="create-invoice-number"
                    value={createForm.invoiceNumber}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, invoiceNumber: e.target.value })
                    }
                    className={styles.input}
                    placeholder="e.g., INV-001"
                    maxLength={100}
                    disabled={isCreating}
                  />
                </div>
                <div className={styles.fieldGrow}>
                  <label htmlFor="create-amount" className={styles.label}>
                    Amount <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="number"
                    id="create-amount"
                    value={createForm.amount}
                    onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })}
                    className={styles.input}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    required
                    disabled={isCreating}
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.fieldGrow}>
                  <label htmlFor="create-date" className={styles.label}>
                    Invoice Date <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="date"
                    id="create-date"
                    value={createForm.date}
                    onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })}
                    className={styles.input}
                    required
                    disabled={isCreating}
                  />
                </div>
                <div className={styles.fieldGrow}>
                  <label htmlFor="create-due-date" className={styles.label}>
                    Due Date
                  </label>
                  <input
                    type="date"
                    id="create-due-date"
                    value={createForm.dueDate}
                    onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })}
                    className={styles.input}
                    disabled={isCreating}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="create-status" className={styles.label}>
                  Status
                </label>
                <select
                  id="create-status"
                  value={createForm.status}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, status: e.target.value as InvoiceStatus })
                  }
                  className={styles.select}
                  disabled={isCreating}
                >
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="create-notes" className={styles.label}>
                  Notes
                </label>
                <textarea
                  id="create-notes"
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  className={styles.textarea}
                  rows={3}
                  disabled={isCreating}
                />
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={closeCreateModal}
                  disabled={isCreating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.saveButton}
                  disabled={isCreating || !createForm.amount || !createForm.date}
                >
                  {isCreating ? 'Adding...' : 'Add Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit invoice modal */}
      {editingInvoice && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-invoice-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeEditInvoiceModal} />
          <div className={`${styles.modalContent} ${styles.modalContentWide}`}>
            <h2 id="edit-invoice-modal-title" className={styles.modalTitle}>
              Edit Invoice
            </h2>

            <form onSubmit={handleUpdateInvoice} className={styles.form} noValidate>
              {editInvoiceError && (
                <div className={styles.errorBanner} role="alert">
                  {editInvoiceError}
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
                    value={editInvoiceForm.invoiceNumber}
                    onChange={(e) =>
                      setEditInvoiceForm({ ...editInvoiceForm, invoiceNumber: e.target.value })
                    }
                    className={styles.input}
                    placeholder="e.g., INV-001"
                    maxLength={100}
                    disabled={isUpdatingInvoice}
                  />
                </div>
                <div className={styles.fieldGrow}>
                  <label htmlFor="edit-amount" className={styles.label}>
                    Amount <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="number"
                    id="edit-amount"
                    value={editInvoiceForm.amount}
                    onChange={(e) =>
                      setEditInvoiceForm({ ...editInvoiceForm, amount: e.target.value })
                    }
                    className={styles.input}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    required
                    disabled={isUpdatingInvoice}
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.fieldGrow}>
                  <label htmlFor="edit-invoice-date" className={styles.label}>
                    Invoice Date <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="date"
                    id="edit-invoice-date"
                    value={editInvoiceForm.date}
                    onChange={(e) =>
                      setEditInvoiceForm({ ...editInvoiceForm, date: e.target.value })
                    }
                    className={styles.input}
                    required
                    disabled={isUpdatingInvoice}
                  />
                </div>
                <div className={styles.fieldGrow}>
                  <label htmlFor="edit-due-date" className={styles.label}>
                    Due Date
                  </label>
                  <input
                    type="date"
                    id="edit-due-date"
                    value={editInvoiceForm.dueDate}
                    onChange={(e) =>
                      setEditInvoiceForm({ ...editInvoiceForm, dueDate: e.target.value })
                    }
                    className={styles.input}
                    disabled={isUpdatingInvoice}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="edit-invoice-status" className={styles.label}>
                  Status
                </label>
                <select
                  id="edit-invoice-status"
                  value={editInvoiceForm.status}
                  onChange={(e) =>
                    setEditInvoiceForm({
                      ...editInvoiceForm,
                      status: e.target.value as InvoiceStatus,
                    })
                  }
                  className={styles.select}
                  disabled={isUpdatingInvoice}
                >
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="edit-invoice-notes" className={styles.label}>
                  Notes
                </label>
                <textarea
                  id="edit-invoice-notes"
                  value={editInvoiceForm.notes}
                  onChange={(e) =>
                    setEditInvoiceForm({ ...editInvoiceForm, notes: e.target.value })
                  }
                  className={styles.textarea}
                  rows={3}
                  disabled={isUpdatingInvoice}
                />
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={closeEditInvoiceModal}
                  disabled={isUpdatingInvoice}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.saveButton}
                  disabled={isUpdatingInvoice || !editInvoiceForm.amount || !editInvoiceForm.date}
                >
                  {isUpdatingInvoice ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete invoice confirmation modal */}
      {deletingInvoice && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-invoice-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeDeleteInvoiceConfirm} />
          <div className={styles.modalContent}>
            <h2 id="delete-invoice-modal-title" className={styles.modalTitle}>
              Delete Invoice
            </h2>
            <p className={styles.modalText}>
              Are you sure you want to delete invoice{' '}
              {deletingInvoice.invoiceNumber ? (
                <strong>#{deletingInvoice.invoiceNumber}</strong>
              ) : (
                'this invoice'
              )}{' '}
              for <strong>{formatCurrency(deletingInvoice.amount)}</strong>?
            </p>

            {deleteInvoiceError ? (
              <div className={styles.errorBanner} role="alert">
                {deleteInvoiceError}
              </div>
            ) : (
              <p className={styles.modalWarning}>This action cannot be undone.</p>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeDeleteInvoiceConfirm}
                disabled={isDeletingInvoice}
              >
                Cancel
              </button>
              {!deleteInvoiceError && (
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={() => void handleDeleteInvoice()}
                  disabled={isDeletingInvoice}
                >
                  {isDeletingInvoice ? 'Deleting...' : 'Delete Invoice'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VendorDetailPage;
