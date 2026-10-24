import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useParams, useNavigate, Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Invoice, InvoiceStatus } from '@cornerstone/shared';
import { fetchInvoiceById, updateInvoice, deleteInvoice } from '../../lib/invoicesApi.js';
import { searchCompanies } from '../../lib/vendorsApi.js';
import { useCompanyCreateAction } from '../../objectForms/useCompanyCreateAction.js';
import type { CompanyOption } from '../../objectForms/companyForm.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useFormatters } from '../../lib/formatters.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { DocumentsPanelButton } from '../../components/DocumentsPanel/index.js';
import { SearchPicker } from '../../components/SearchPicker/SearchPicker.js';
import { FormError } from '../../components/FormError/FormError.js';
import { CostLinesSection } from '../../components/CostLineTable/index.js';
import { InvoiceDepositsSection } from './InvoiceDepositsSection.js';
import { InvoiceDepositFormModal } from './InvoiceDepositFormModal.js';
import { Modal } from '../../components/Modal/Modal.js';
import { ConvertQuotationModal } from './ConvertQuotationModal.js';
import { useConvertQuotation } from './useConvertQuotation.js';
import { InvoicePaperlessPickerModal } from '../../components/invoices/InvoicePaperlessPickerModal.js';
import styles from './InvoiceDetailPage.module.css';
import depositStyles from './InvoiceDepositsSection.module.css';
import shared from '../../styles/shared.module.css';
import { useQueryTargetHighlight } from '../../hooks/useQueryTargetHighlight.js';
import { INVOICE_STATUSES, routeUrl } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu.js';
import { invoiceTransitions } from '../../components/StatusMenu/statusVocabularies.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useUndoableStatusChange } from '../../hooks/useUndoableStatusChange.js';
import { changeInvoiceStatus, invoiceStatusBody } from '../../lib/statusChangeApi.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useInvoiceDisplayTitle } from '../../hooks/useInvoiceDisplayTitle.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';

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

/** Reads the route id once; the view below always has an invoice id. */
export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to={routeUrl('invoices')} replace />;
  return <InvoiceDetailView id={id} />;
}

function InvoiceDetailView({ id }: { id: string }) {
  const {
    formatCurrency,
    formatDate,
    formatTime: _formatTime,
    formatDateTime: _formatDateTime,
  } = useFormatters();
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { t: tc } = useTranslation('common');
  const statusVariants = useStatusBadgeVariants();
  const { run: runStatusChange } = useUndoableStatusChange();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [paymentStatus, setPaymentStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const invoiceTitle = useInvoiceDisplayTitle(invoice);
  // The title of the loaded invoice, or the plain noun while it is not (or cannot be) shown.
  const invoiceName = invoiceTitle ?? tc('navigation.invoice');
  const h1Text =
    isLoading || !invoice
      ? notFound && !isLoading
        ? tc('navigation.invoiceNotFound')
        : tc('navigation.invoice')
      : invoiceName;
  useDocumentTitle(h1Text);
  const originState = useOriginState(invoice ? invoiceTitle : null);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<InvoiceFormState>({
    invoiceNumber: '',
    amount: '',
    date: '',
    dueDate: '',
    status: 'pending',
    notes: '',
    vendorId: '',
    vendorName: '',
  });
  const [isUpdating, setIsUpdating] = useState(false);
  // The New company form stacks over the edit modal; the lower dialog stays put meanwhile.
  const { createAction: companyCreateAction, isCreating: isCreatingCompany } =
    useCompanyCreateAction();
  const [editError, setEditError] = useState('');
  const [vendorError, setVendorError] = useState('');

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const deleteConsequences = useDeleteImpact('invoice', showDeleteModal ? id : null);

  // Story #2107: quotation-to-final-invoice conversion
  const [sectionsKey, setSectionsKey] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeadingAfterConvertRef = useRef(false);

  /** Silent re-fetch: does not toggle the page loading state. */
  const refreshInvoice = async (): Promise<Invoice> => {
    const fresh = await fetchInvoiceById(id);
    setInvoice(fresh);
    return fresh;
  };

  const convert = useConvertQuotation({
    invoice,
    refreshInvoice,
    onConverted: (converted) => {
      setInvoice(converted);
      setSectionsKey((k) => k + 1);
      focusHeadingAfterConvertRef.current = true;
    },
  });

  // The Convert button unmounts once the status changes, so move focus to the page heading.
  useEffect(() => {
    if (focusHeadingAfterConvertRef.current) {
      focusHeadingAfterConvertRef.current = false;
      headingRef.current!.focus();
    }
  }, [invoice]);

  useEffect(() => {
    void loadInvoice();
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- loadInvoice is defined in component body; effect re-runs on intended trigger only
  }, [id]);

  const loadInvoice = async () => {
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await fetchInvoiceById(id);
      setInvoice(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 404) {
          setNotFound(true);
          setError(t('invoiceDetail.invoiceNotFound'));
        } else {
          setError(translateApiError(err.error.code, tErrors));
        }
      } else {
        setError(t('invoiceDetail.invoiceNotFound'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  useQueryTargetHighlight({
    param: 'payment',
    ready: invoice !== null,
    selector: (paymentId) => `[data-payment-id="${CSS.escape(paymentId)}"]`,
    highlightClassName: depositStyles.paymentTarget!,
    onMissing: () => setPaymentStatus(t('invoiceDetail.deposits.paymentGone')),
  });

  if (isLoading) {
    return (
      <div className={styles.container}>
        <PageBreadcrumbs />
        <h1 className={styles.pageTitle}>{h1Text}</h1>
        <Skeleton lines={4} loadingLabel={t('invoiceDetail.loading')} />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className={styles.container}>
        <PageBreadcrumbs />
        {!notFound && <h1 className={styles.pageTitle}>{h1Text}</h1>}
        <div className={styles.errorCard} role="alert">
          {notFound ? (
            <h1 className={styles.errorTitle}>{h1Text}</h1>
          ) : (
            <h2 className={styles.errorTitle}>{t('invoiceDetail.error')}</h2>
          )}
          <p>{error}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => navigate(routeUrl('invoices'))}
            >
              {tc('navigation.backTo', { origin: tc('navigation.invoices') })}
            </button>
            <button type="button" className={styles.button} onClick={() => void loadInvoice()}>
              {t('invoiceDetail.retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const openEditModal = () => {
    setEditForm({
      invoiceNumber: invoice.invoiceNumber ?? '',
      amount: invoice.amount.toString(),
      date: invoice.date.slice(0, 10),
      dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : '',
      status: invoice.status,
      notes: invoice.notes ?? '',
      vendorId: invoice.vendorId,
      vendorName: invoice.vendorName,
    });
    setEditError('');
    setVendorError('');
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    if (!isUpdating && !isCreatingCompany) {
      setShowEditModal(false);
      setEditError('');
      setVendorError('');
    }
  };

  const handleUpdate = async (event: FormEvent) => {
    event.preventDefault();
    const amount = parseFloat(editForm.amount);
    if (isNaN(amount) || amount <= 0) {
      setEditError(t('invoiceDetail.validation.amountRequired'));
      return;
    }
    if (!editForm.date) {
      setEditError(t('invoiceDetail.validation.dateRequired'));
      return;
    }
    if (!editForm.vendorId) {
      setVendorError(t('invoiceDetail.validation.vendorRequired'));
      return;
    }
    setIsUpdating(true);
    setEditError('');
    setVendorError('');
    try {
      const updated = await updateInvoice(invoice.vendorId, invoice.id, {
        invoiceNumber: editForm.invoiceNumber.trim() || null,
        amount,
        date: editForm.date,
        dueDate: editForm.dueDate || null,
        status: editForm.status,
        notes: editForm.notes.trim() || null,
        vendorId: editForm.vendorId,
      });
      setInvoice(updated);
      setShowEditModal(false);
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

  const openDeleteModal = () => {
    setDeleteError('');
    setDeleteBlocked(false);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteError('');
    setDeleteBlocked(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteInvoice(invoice.vendorId, invoice.id);
      navigate(routeUrl('invoices'), { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteBlocked(err.statusCode === 409);
        setDeleteError(translateApiError(err.error.code, tErrors));
      } else {
        setDeleteError(t('invoiceDetail.messages.deleteError'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <PageBreadcrumbs />

        {/* Page heading */}
        <div className={styles.headerRow}>
          <div className={styles.pageHeading}>
            <h1 className={styles.pageTitle} ref={headingRef} tabIndex={-1}>
              {h1Text}
            </h1>
            <StatusMenu
              transitions={invoiceTransitions(tc, invoice)}
              badge={{ variants: statusVariants.invoice, value: invoice.status }}
              currentLabel={statusVariants.invoice[invoice.status].label}
              focusFallbackRef={headingRef}
              testId="invoice-status-badge"
              onApply={(to) =>
                runStatusChange({
                  request: () =>
                    changeInvoiceStatus(invoice.vendorId, invoice.id, invoiceStatusBody(to)),
                  recordName: invoiceName,
                  statusLabel: statusVariants.invoice[to].label,
                  dedupeKey: `invoice:${invoice.id}`,
                  onChanged: () => void refreshInvoice(),
                  onUndone: async () => {
                    await refreshInvoice();
                  },
                })
              }
            />
          </div>
          <div className={styles.pageActions}>
            {invoice.status === 'quotation' && (
              <button
                type="button"
                className={styles.convertButton}
                data-testid="convert-quotation-button"
                onClick={convert.open}
              >
                {t('invoiceDetail.buttons.convertToFinal')}
              </button>
            )}
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
              <dt className={styles.infoLabel}>{t('invoiceDetail.detailFields.invoiceNumber')}</dt>
              <dd className={styles.infoValue}>{invoice.invoiceNumber ?? '\u2014'}</dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>{t('invoiceDetail.detailFields.vendor')}</dt>
              <dd className={styles.infoValue}>
                <Link
                  to={routeUrl('company', { id: invoice.vendorId })}
                  state={originState}
                  className={styles.infoLink}
                >
                  {invoice.vendorName}
                </Link>
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>{t('invoiceDetail.detailFields.amount')}</dt>
              <dd className={`${styles.infoValue} ${styles.infoValueAmount}`}>
                {formatCurrency(invoice.amount)}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>{t('invoiceDetail.detailFields.date')}</dt>
              <dd className={styles.infoValue}>{formatDate(invoice.date)}</dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>{t('invoiceDetail.detailFields.dueDate')}</dt>
              <dd className={styles.infoValue}>
                {invoice.dueDate ? formatDate(invoice.dueDate) : '\u2014'}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>{t('invoiceDetail.detailFields.status')}</dt>
              <dd className={styles.infoValue}>
                <Badge
                  variants={statusVariants.invoice}
                  value={invoice.status}
                  className={styles.statusBadge}
                  testId="invoice-detail-status-badge"
                />
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>{t('invoiceDetail.detailFields.notes')}</dt>
              <dd className={`${styles.infoValue} ${invoice.notes ? styles.infoValueNotes : ''}`}>
                {invoice.notes ?? '\u2014'}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>{t('invoiceDetail.detailFields.createdBy')}</dt>
              <dd className={styles.infoValue}>{invoice.createdBy?.displayName ?? '\u2014'}</dd>
            </div>
          </dl>
        </section>

        <div role="status" aria-atomic="true" data-testid="invoice-payment-status">
          {paymentStatus && (
            <div className={`${shared.bannerInfo} ${shared.bannerRow}`}>
              <span>{paymentStatus}</span>
              <button
                type="button"
                className={styles.noticeDismiss}
                onClick={() => setPaymentStatus('')}
              >
                {tc('button.close')}
              </button>
            </div>
          )}
        </div>

        <InvoiceDepositsSection
          invoiceId={id}
          invoiceStatus={invoice.status}
          invoiceAmount={invoice.amount}
          deposits={invoice.deposits}
          finalPaymentAmount={invoice.finalPaymentAmount}
          onDepositMutated={() => void refreshInvoice().catch(() => loadInvoice())}
        />

        <div className={styles.card}>
          <CostLinesSection
            key={`lines-${sectionsKey}`}
            host={{
              kind: 'invoice',
              id: invoice.id,
              label: invoiceName,
              status: invoice.status,
              amount: invoice.amount,
              vendorId: invoice.vendorId,
            }}
            onChanged={async () => {
              await refreshInvoice().catch(() => undefined);
            }}
            linkState={originState}
          />
        </div>

        <DocumentsPanelButton key={`docs-${sectionsKey}`} entityType="invoice" entityId={id} />
      </div>

      {/* Quotation conversion flow: one modal at a time, never stacked */}
      {convert.view === 'form' && <ConvertQuotationModal convert={convert} />}
      {convert.view === 'paperless' && (
        <InvoicePaperlessPickerModal
          onDocumentSelected={convert.onDocumentSelected}
          onManualEntry={convert.onPickerClosed}
          onClose={convert.onPickerClosed}
          paperlessUrl={convert.paperless.paperlessUrl}
        />
      )}
      {convert.view === 'refund' && (
        <InvoiceDepositFormModal
          invoiceId={invoice.id}
          mode="add"
          lockEntryType
          initialValues={{ entryType: 'refund', status: 'pending', ...convert.refundPreset }}
          budgetSources={convert.budgetSources}
          onSaved={() => void convert.onRefundSaved()}
          onClose={convert.onRefundClosed}
        />
      )}

      {/* Edit invoice modal */}
      {showEditModal && (
        <Modal
          title={t('invoiceDetail.modal.editTitle')}
          onClose={closeEditModal}
          className={styles.modalContentWide}
          dismissible={!isUpdating && !isCreatingCompany}
        >
          <div>
            <form onSubmit={handleUpdate} className={styles.form} noValidate>
              {editError && (
                <div className={styles.errorBanner} role="alert">
                  {editError}
                </div>
              )}

              <div className={styles.formRow}>
                <div className={styles.fieldGrow}>
                  <label htmlFor="edit-invoice-number" className={styles.label}>
                    {t('invoiceDetail.form.invoiceNumber')}
                  </label>
                  <input
                    type="text"
                    id="edit-invoice-number"
                    value={editForm.invoiceNumber}
                    onChange={(e) => setEditForm({ ...editForm, invoiceNumber: e.target.value })}
                    className={styles.input}
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
                    value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                    className={styles.input}
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
                <SearchPicker<CompanyOption>
                  id="edit-vendor"
                  value={editForm.vendorId}
                  onChange={(id) => setEditForm({ ...editForm, vendorId: id })}
                  excludeIds={[]}
                  disabled={isUpdating}
                  placeholder={t('invoiceDetail.form.placeholders.vendor')}
                  searchFn={(query, _excluded, signal) => searchCompanies(query, signal)}
                  renderItem={(vendor) => ({ id: vendor.id, label: vendor.name })}
                  showItemsOnFocus
                  initialTitle={editForm.vendorName}
                  noResultsMessage={t('invoiceDetail.form.noVendorsFound')}
                  createAction={companyCreateAction}
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
                    value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                    className={styles.input}
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
                    value={editForm.dueDate}
                    onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                    className={styles.input}
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
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm({ ...editForm, status: e.target.value as InvoiceStatus })
                  }
                  className={styles.select}
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
                  {t('invoiceDetail.buttons.cancel')}
                </button>
                <button
                  type="submit"
                  className={styles.saveButton}
                  disabled={isUpdating || !editForm.amount || !editForm.date}
                >
                  {isUpdating ? t('invoiceDetail.buttons.saving') : t('invoiceDetail.buttons.save')}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Delete confirmation */}
      {showDeleteModal && (
        <ConfirmDialog
          title={tc('confirmDialog.deleteTitle', { name: invoiceName })}
          consequences={deleteConsequences}
          irreversible
          confirmLabel={tc('button.delete')}
          busyLabel={tc('confirmDialog.deleting')}
          busy={isDeleting}
          blocked={deleteBlocked}
          error={deleteError || null}
          onConfirm={() => void handleDelete()}
          onCancel={closeDeleteModal}
          testIdPrefix="invoice-delete"
        />
      )}
    </div>
  );
}

export default InvoiceDetailPage;
