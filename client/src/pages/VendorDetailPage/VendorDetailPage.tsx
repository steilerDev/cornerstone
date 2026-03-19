import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  VendorDetail,
  UpdateVendorRequest,
  Invoice,
  InvoiceStatus,
} from '@cornerstone/shared';
import { fetchVendor, updateVendor, deleteVendor } from '../../lib/vendorsApi.js';
import { fetchInvoices, createInvoice, deleteInvoice } from '../../lib/invoicesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useFormatters } from '../../lib/formatters.js';
import { useTrades } from '../../hooks/useTrades.js';
import { VendorContactsSection } from '../../components/VendorContacts/VendorContactsSection.js';
import { TradePicker } from '../../components/TradePicker/TradePicker.js';
import styles from './VendorDetailPage.module.css';

// INVOICE_STATUS_LABELS will be dynamically generated from i18n

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
  status: 'quotation',
  notes: '',
};

export function VendorDetailPage() {
  const { t } = useTranslation('budget');
  const { formatCurrency, formatDate } = useFormatters();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { trades } = useTrades();

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
          setError(t('vendorDetail.vendorNotFound'));
        } else {
          setError(err.error.message);
        }
      } else {
        setError(t('vendorDetail.vendorNotFound'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const startEdit = () => {
    if (!vendor) return;
    setEditForm({
      name: vendor.name,
      phone: vendor.phone ?? '',
      email: vendor.email ?? '',
      address: vendor.address ?? '',
      notes: vendor.notes ?? '',
      tradeId: vendor.trade?.id ?? null,
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
      setEditError(t('vendors.validation.nameRequired'));
      return;
    }
    if (trimmedName.length > 200) {
      setEditError(t('vendors.validation.nameTooLong'));
      return;
    }

    setIsUpdating(true);
    setEditError('');

    try {
      const updated = await updateVendor(id, {
        name: trimmedName,
        phone: (editForm.phone as string)?.trim() || null,
        email: (editForm.email as string)?.trim() || null,
        address: (editForm.address as string)?.trim() || null,
        notes: (editForm.notes as string)?.trim() || null,
        tradeId: editForm.tradeId || null,
      });
      setVendor(updated);
      setIsEditing(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setEditError(err.error.message);
      } else {
        setEditError(t('vendorDetail.messages.updateError'));
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
          setDeleteError(t('vendors.modal.deleteError'));
        } else {
          setDeleteError(err.error.message);
        }
      } else {
        setDeleteError(t('vendorDetail.messages.deleteError'));
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
        setInvoicesError(t('invoices.errorMessage'));
      }
    } finally {
      setInvoicesLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    if (!id) return;
    void loadInvoices();
  }, [id, loadInvoices]);

  /** Computes outstanding balance from client-side invoice list (pending + claimed). */
  const computedOutstandingBalance = invoices
    .filter((inv) => inv.status === 'pending' || inv.status === 'claimed')
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
      setCreateError(t('invoices.validation.amountRequired'));
      return;
    }
    if (!createForm.date) {
      setCreateError(t('invoices.validation.dateRequired'));
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
        setCreateError(t('vendorDetail.messages.invoiceCreateError'));
      }
    } finally {
      setIsCreating(false);
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
        setDeleteInvoiceError(t('vendorDetail.messages.invoiceDeleteError'));
      }
    } finally {
      setIsDeletingInvoice(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t('vendorDetail.loading')}</div>
      </div>
    );
  }

  if (error || !vendor) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>{t('vendorDetail.error')}</h2>
          <p>{error ?? t('vendorDetail.vendorNotFound')}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => navigate('/budget/vendors')}
            >
              {t('vendorDetail.backToVendors')}
            </button>
            <button type="button" className={styles.button} onClick={() => void loadVendor()}>
              {t('vendorDetail.retry')}
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
            onClick={() => navigate('/budget/vendors')}
          >
            ← {t('vendorDetail.backToVendors')}
          </button>
        </div>

        {/* Page heading */}
        <div className={styles.headerRow}>
          <div className={styles.pageHeading}>
            <h1 className={styles.pageTitle}>{vendor.name}</h1>
          </div>
          <div className={styles.pageActions}>
            {!isEditing && (
              <>
                <button type="button" className={styles.editButton} onClick={startEdit}>
                  {t('vendorDetail.buttons.edit')}
                </button>
                <button type="button" className={styles.deleteButton} onClick={openDeleteConfirm}>
                  {t('vendorDetail.buttons.delete')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stats cards */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>{t('vendorDetail.totalInvoices')}</span>
            <span className={styles.statValue}>{vendor.invoiceCount}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>{t('vendorDetail.outstandingBalance')}</span>
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
            <h2 className={styles.cardTitle}>{t('vendorDetail.vendorInformation')}</h2>
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
                  {t('vendorDetail.form.name')}{' '}
                  <span className={styles.required}>{t('vendorDetail.form.required')}</span>
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

              <div className={styles.formRow}>
                <div className={styles.fieldGrow}>
                  <label htmlFor="edit-phone" className={styles.label}>
                    {t('vendorDetail.form.phone')}
                  </label>
                  <input
                    type="tel"
                    id="edit-phone"
                    value={(editForm.phone as string) ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className={styles.input}
                    placeholder={t('vendorDetail.form.placeholders.phone')}
                    maxLength={50}
                    disabled={isUpdating}
                  />
                </div>
                <div className={styles.fieldGrow}>
                  <label htmlFor="edit-email" className={styles.label}>
                    {t('vendorDetail.form.email')}
                  </label>
                  <input
                    type="email"
                    id="edit-email"
                    value={(editForm.email as string) ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className={styles.input}
                    placeholder={t('vendorDetail.form.placeholders.email')}
                    maxLength={255}
                    disabled={isUpdating}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="edit-address" className={styles.label}>
                  {t('vendorDetail.form.address')}
                </label>
                <input
                  type="text"
                  id="edit-address"
                  value={(editForm.address as string) ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className={styles.input}
                  placeholder={t('vendorDetail.form.placeholders.address')}
                  maxLength={500}
                  disabled={isUpdating}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="edit-notes" className={styles.label}>
                  {t('vendorDetail.form.notes')}
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

              <div className={styles.field}>
                <label htmlFor="edit-tradeId" className={styles.label}>
                  {t('vendorDetail.form.trade')}
                </label>
                <TradePicker
                  trades={trades}
                  value={(editForm.tradeId as string) ?? ''}
                  onChange={(tradeId) => setEditForm({ ...editForm, tradeId })}
                  disabled={isUpdating}
                  placeholder={t('vendorDetail.form.tradePlaceholder')}
                />
              </div>

              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={styles.saveButton}
                  disabled={isUpdating || !(editForm.name as string)?.trim()}
                >
                  {isUpdating ? t('vendorDetail.buttons.saving') : t('vendorDetail.buttons.save')}
                </button>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={cancelEdit}
                  disabled={isUpdating}
                >
                  {t('vendorDetail.buttons.cancel')}
                </button>
              </div>
            </form>
          ) : (
            <dl className={styles.infoList}>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>{t('vendorDetail.detailFields.name')}</dt>
                <dd className={styles.infoValue}>{vendor.name}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>{t('vendorDetail.detailFields.phone')}</dt>
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
                <dt className={styles.infoLabel}>{t('vendorDetail.detailFields.email')}</dt>
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
                <dt className={styles.infoLabel}>{t('vendorDetail.detailFields.address')}</dt>
                <dd className={styles.infoValue}>{vendor.address || '—'}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>{t('vendorDetail.detailFields.notes')}</dt>
                <dd className={`${styles.infoValue} ${vendor.notes ? styles.infoValueNotes : ''}`}>
                  {vendor.notes || '—'}
                </dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>{t('vendorDetail.detailFields.trade')}</dt>
                <dd className={styles.infoValue}>{vendor.trade?.name ?? '—'}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>{t('vendorDetail.detailFields.createdBy')}</dt>
                <dd className={styles.infoValue}>{vendor.createdBy?.displayName ?? '—'}</dd>
              </div>
            </dl>
          )}
        </section>

        {/* Invoices section */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>{t('vendorDetail.invoices')}</h2>
            <div className={styles.invoiceHeaderRight}>
              {invoices.length > 0 && (
                <span className={styles.outstandingBalance}>
                  {t('vendorDetail.outstanding')}{' '}
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
                {t('vendorDetail.addInvoice')}
              </button>
            </div>
          </div>

          {invoicesLoading && (
            <p className={styles.invoicesLoading}>{t('vendorDetail.invoicesLoading')}</p>
          )}

          {invoicesError && !invoicesLoading && (
            <div className={styles.invoicesError} role="alert">
              <p>{invoicesError}</p>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void loadInvoices()}
              >
                {t('vendorDetail.buttons.retry')}
              </button>
            </div>
          )}

          {!invoicesLoading && !invoicesError && invoices.length === 0 && (
            <div className={styles.invoicesEmpty}>
              <p className={styles.invoicesEmptyText}>{t('vendorDetail.noInvoicesYet')}</p>
              <p className={styles.invoicesEmptyHint}>{t('vendorDetail.noInvoicesHint')}</p>
            </div>
          )}

          {!invoicesLoading && !invoicesError && invoices.length > 0 && (
            <>
              {/* Desktop table */}
              <div className={styles.tableWrapper}>
                <table className={styles.invoiceTable}>
                  <thead>
                    <tr>
                      <th className={styles.tableHeader}>
                        {t('vendorDetail.invoiceTable.invoiceNumber')}
                      </th>
                      <th className={`${styles.tableHeader} ${styles.tableHeaderRight}`}>
                        {t('vendorDetail.invoiceTable.amount')}
                      </th>
                      <th className={styles.tableHeader}>{t('vendorDetail.invoiceTable.date')}</th>
                      <th className={styles.tableHeader}>
                        {t('vendorDetail.invoiceTable.dueDate')}
                      </th>
                      <th className={styles.tableHeader}>
                        {t('vendorDetail.invoiceTable.status')}
                      </th>
                      <th className={`${styles.tableHeader} ${styles.tableHeaderRight}`}>
                        {t('vendorDetail.invoiceTable.actions')}
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
                            {t(`invoices.statusLabels.${invoice.status}`)}
                          </span>
                        </td>
                        <td className={`${styles.tableCell} ${styles.tableCellRight}`}>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className={styles.rowActionButton}
                              onClick={() => navigate(`/budget/invoices/${invoice.id}`)}
                              aria-label={`Edit invoice ${invoice.invoiceNumber ?? invoice.id}`}
                            >
                              {t('vendorDetail.buttons.editRow')}
                            </button>
                            <button
                              type="button"
                              className={`${styles.rowActionButton} ${styles.rowActionButtonDanger}`}
                              onClick={() => openDeleteInvoiceConfirm(invoice)}
                              aria-label={`Delete invoice ${invoice.invoiceNumber ?? invoice.id}`}
                            >
                              {t('vendorDetail.buttons.deleteRow')}
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
                        {t(`invoices.statusLabels.${invoice.status}`)}
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
                        onClick={() => navigate(`/budget/invoices/${invoice.id}`)}
                        aria-label={`Edit invoice ${invoice.invoiceNumber ?? invoice.id}`}
                      >
                        {t('vendorDetail.buttons.editRow')}
                      </button>
                      <button
                        type="button"
                        className={`${styles.rowActionButton} ${styles.rowActionButtonDanger}`}
                        onClick={() => openDeleteInvoiceConfirm(invoice)}
                        aria-label={`Delete invoice ${invoice.invoiceNumber ?? invoice.id}`}
                      >
                        {t('vendorDetail.buttons.deleteRow')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* Vendor Contacts Section */}
        {vendor && id && <VendorContactsSection vendorId={id} />}
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
              {t('vendorDetail.deleteModal.title')}
            </h2>
            <p className={styles.modalText}>
              {t('vendorDetail.deleteModal.confirm', { name: vendor.name })}
            </p>

            {deleteError ? (
              <div className={styles.errorBanner} role="alert">
                {deleteError}
              </div>
            ) : (
              <p className={styles.modalWarning}>{t('vendorDetail.deleteModal.warning')}</p>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeDeleteConfirm}
                disabled={isDeleting}
              >
                {t('vendorDetail.buttons.cancel')}
              </button>
              {!deleteError && (
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                >
                  {isDeleting ? t('vendorDetail.deleteModal.deleting') : t('vendorDetail.deleteModal.delete')}
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
              {t('vendorDetail.invoiceForm.title')}
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
                    {t('vendorDetail.invoiceForm.invoiceNumber')}
                  </label>
                  <input
                    type="text"
                    id="create-invoice-number"
                    value={createForm.invoiceNumber}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, invoiceNumber: e.target.value })
                    }
                    className={styles.input}
                    placeholder={t('vendorDetail.invoiceForm.invoiceNumberPlaceholder')}
                    maxLength={100}
                    disabled={isCreating}
                  />
                </div>
                <div className={styles.fieldGrow}>
                  <label htmlFor="create-amount" className={styles.label}>
                    {t('vendorDetail.invoiceForm.amount')} <span className={styles.required}>*</span>
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
                    {t('vendorDetail.invoiceForm.invoiceDate')} <span className={styles.required}>*</span>
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
                    {t('vendorDetail.invoiceForm.dueDate')}
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
                  {t('vendorDetail.invoiceForm.status')}
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
                  <option value="quotation">{t('vendorDetail.invoiceForm.statusQuotation')}</option>
                  <option value="pending">{t('vendorDetail.invoiceForm.statusPending')}</option>
                  <option value="paid">{t('vendorDetail.invoiceForm.statusPaid')}</option>
                  <option value="claimed">{t('vendorDetail.invoiceForm.statusClaimed')}</option>
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="create-notes" className={styles.label}>
                  {t('vendorDetail.invoiceForm.notes')}
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
                  {t('vendorDetail.buttons.cancel')}
                </button>
                <button
                  type="submit"
                  className={styles.saveButton}
                  disabled={isCreating || !createForm.amount || !createForm.date}
                >
                  {isCreating ? t('vendorDetail.invoiceForm.adding') : t('vendorDetail.invoiceForm.add')}
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
              {t('vendorDetail.deleteInvoiceModal.title')}
            </h2>
            <p className={styles.modalText}>
              {t('vendorDetail.deleteInvoiceModal.confirm', {
                number: deletingInvoice.invoiceNumber || t('vendorDetail.deleteInvoiceModal.noNumber'),
                amount: formatCurrency(deletingInvoice.amount),
              })}
            </p>

            {deleteInvoiceError ? (
              <div className={styles.errorBanner} role="alert">
                {deleteInvoiceError}
              </div>
            ) : (
              <p className={styles.modalWarning}>{t('vendorDetail.deleteInvoiceModal.warning')}</p>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeDeleteInvoiceConfirm}
                disabled={isDeletingInvoice}
              >
                {t('vendorDetail.buttons.cancel')}
              </button>
              {!deleteInvoiceError && (
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={() => void handleDeleteInvoice()}
                  disabled={isDeletingInvoice}
                >
                  {isDeletingInvoice ? t('vendorDetail.deleteInvoiceModal.deleting') : t('vendorDetail.deleteInvoiceModal.delete')}
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
