import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
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
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useTrades } from '../../hooks/useTrades.js';
import { VendorContactsSection } from '../../components/VendorContacts/VendorContactsSection.js';
import { TradePicker } from '../../components/TradePicker/TradePicker.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './VendorDetailPage.module.css';
import { INVOICE_STATUSES, routeUrl } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';

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
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { t: tSettings } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const statusVariants = useStatusBadgeVariants();
  const { formatCurrency, formatDate } = useFormatters();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { trades } = useTrades();

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  useDocumentTitle(vendor?.name ?? null);
  const originState = useOriginState(vendor?.name);
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
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const vendorImpact = useDeleteImpact('vendor', showDeleteConfirm && id ? id : null);
  const invoicesHeadingRef = useRef<HTMLHeadingElement>(null);

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
  const [deleteInvoiceBlocked, setDeleteInvoiceBlocked] = useState(false);
  const invoiceImpact = useDeleteImpact('invoice', deletingInvoice?.id ?? null);

  useEffect(() => {
    if (!id) return;
    void loadVendor();
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- loadVendor is defined in the component body; the effect re-runs only when id changes, which is the intended trigger
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
          setError(translateApiError(err.error.code, tErrors));
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
        setEditError(translateApiError(err.error.code, tErrors));
      } else {
        setEditError(t('vendorDetail.messages.updateError'));
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const openDeleteConfirm = () => {
    setDeleteError('');
    setDeleteBlocked(false);
    setShowDeleteConfirm(true);
  };

  const closeDeleteConfirm = () => {
    if (!isDeleting) {
      setShowDeleteConfirm(false);
      setDeleteError('');
      setDeleteBlocked(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;

    setIsDeleting(true);
    setDeleteError('');

    try {
      await deleteVendor(id);
      navigate(routeUrl('vendors'));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteBlocked(err.statusCode === 409);
        if (err.statusCode === 409) {
          setDeleteError(t('vendors.modal.deleteError'));
        } else {
          setDeleteError(translateApiError(err.error.code, tErrors));
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
        setInvoicesError(translateApiError(err.error.code, tErrors));
      } else {
        setInvoicesError(t('invoices.errorMessage'));
      }
    } finally {
      setInvoicesLoading(false);
    }
  }, [id, t, tErrors]);

  useEffect(() => {
    if (!id) return;
    void loadInvoices();
  }, [id, loadInvoices]);

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
        setCreateError(translateApiError(err.error.code, tErrors));
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
    setDeleteInvoiceBlocked(false);
  };

  const closeDeleteInvoiceConfirm = () => {
    if (!isDeletingInvoice) {
      setDeletingInvoice(null);
      setDeleteInvoiceError('');
      setDeleteInvoiceBlocked(false);
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
        setDeleteInvoiceBlocked(err.statusCode === 409);
        setDeleteInvoiceError(translateApiError(err.error.code, tErrors));
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
        <PageBreadcrumbs />
        <h1 className={sharedStyles.srOnly}>{tc('navigation.companies')}</h1>
        <Skeleton lines={4} loadingLabel={t('vendorDetail.loading')} />
      </div>
    );
  }

  if (error || !vendor) {
    return (
      <div className={styles.container}>
        <PageBreadcrumbs />
        <h1 className={sharedStyles.srOnly}>{tc('navigation.companies')}</h1>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>{t('vendorDetail.error')}</h2>
          <p>{error ?? t('vendorDetail.vendorNotFound')}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => navigate(routeUrl('vendors'))}
            >
              {tc('navigation.backTo', { origin: tc('navigation.companies') })}
            </button>
            <button type="button" className={styles.button} onClick={() => void loadVendor()}>
              {t('vendorDetail.retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // One server figure (ADR-039 Still to pay) drives both the stats card and the invoices header
  const hasStillToPay = vendor.outstandingBalance > 0;

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <PageBreadcrumbs />

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
            <span className={`${styles.statValue} ${hasStillToPay ? styles.statValueDanger : ''}`}>
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
                  id="edit-tradeId"
                  initialTitle={
                    vendor.trade
                      ? getCategoryDisplayName(
                          tSettings,
                          vendor.trade.name,
                          vendor.trade.translationKey,
                        )
                      : undefined
                  }
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
                <dd className={styles.infoValue}>
                  {vendor.trade
                    ? getCategoryDisplayName(
                        tSettings,
                        vendor.trade.name,
                        vendor.trade.translationKey,
                      )
                    : '—'}
                </dd>
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
            <h2 className={styles.cardTitle} ref={invoicesHeadingRef} tabIndex={-1}>
              {t('vendorDetail.invoices')}
            </h2>
            <div className={styles.invoiceHeaderRight}>
              {invoices.length > 0 && (
                <span className={styles.outstandingBalance}>
                  {t('vendorDetail.outstanding')}{' '}
                  <strong className={hasStillToPay ? styles.outstandingAmount : undefined}>
                    {formatCurrency(vendor.outstandingBalance)}
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
                          <Badge
                            variants={statusVariants.invoice}
                            value={invoice.status}
                            testId={`vendor-invoice-status-${invoice.id}`}
                          />
                        </td>
                        <td className={`${styles.tableCell} ${styles.tableCellRight}`}>
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              className={styles.rowActionButton}
                              onClick={() =>
                                navigate(routeUrl('invoice', { id: invoice.id }), {
                                  state: originState,
                                })
                              }
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
              <ul className={styles.invoiceCardList} aria-label={t('vendorDetail.invoices')}>
                {invoices.map((invoice) => (
                  <li key={invoice.id} className={styles.invoiceCard}>
                    <div className={styles.invoiceCardRow}>
                      <span className={styles.invoiceCardNumber}>
                        {invoice.invoiceNumber
                          ? `#${invoice.invoiceNumber}`
                          : t('vendorDetail.invoiceCard.noInvoiceNumber')}
                      </span>
                      <Badge
                        variants={statusVariants.invoice}
                        value={invoice.status}
                        testId={`vendor-invoice-status-mobile-${invoice.id}`}
                      />
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
                        onClick={() =>
                          navigate(routeUrl('invoice', { id: invoice.id }), { state: originState })
                        }
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

      {/* Delete vendor confirmation */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title={tc('confirmDialog.deleteTitle', { name: vendor.name })}
          consequences={vendorImpact}
          irreversible
          confirmLabel={tc('button.delete')}
          busyLabel={tc('confirmDialog.deleting')}
          busy={isDeleting}
          blocked={deleteBlocked}
          error={deleteError || null}
          onConfirm={() => void handleDelete()}
          onCancel={closeDeleteConfirm}
          testIdPrefix="vendor-delete"
        />
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
                    {t('vendorDetail.invoiceForm.amount')}{' '}
                    <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="number"
                    id="create-amount"
                    value={createForm.amount}
                    onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })}
                    className={styles.input}
                    min="0"
                    step="0.01"
                    required
                    disabled={isCreating}
                    onWheel={(e) => e.currentTarget.blur()}
                  />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.fieldGrow}>
                  <label htmlFor="create-date" className={styles.label}>
                    {t('vendorDetail.invoiceForm.invoiceDate')}{' '}
                    <span className={styles.required}>*</span>
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
                  {INVOICE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {statusVariants.invoice[status].label}
                    </option>
                  ))}
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
                  {isCreating
                    ? t('vendorDetail.invoiceForm.adding')
                    : t('vendorDetail.invoiceForm.add')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete invoice confirmation */}
      {deletingInvoice && (
        <ConfirmDialog
          title={tc('confirmDialog.deleteTitle', {
            name: deletingInvoice.invoiceNumber || t('vendorDetail.deleteInvoiceModal.noNumber'),
          })}
          consequences={invoiceImpact}
          irreversible
          confirmLabel={tc('button.delete')}
          busyLabel={tc('confirmDialog.deleting')}
          busy={isDeletingInvoice}
          blocked={deleteInvoiceBlocked}
          error={deleteInvoiceError || null}
          onConfirm={() => void handleDeleteInvoice()}
          onCancel={closeDeleteInvoiceConfirm}
          returnFocusRef={invoicesHeadingRef}
          testIdPrefix="vendor-invoice-delete"
        />
      )}
    </div>
  );
}

export default VendorDetailPage;
