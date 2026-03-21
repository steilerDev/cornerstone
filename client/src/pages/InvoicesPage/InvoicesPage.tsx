import { useState, useEffect, useMemo, useRef, type FormEvent } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Invoice, CreateInvoiceRequest, InvoiceStatus } from '@cornerstone/shared';
import type { ColumnDef, TableState } from '../../components/DataTable/DataTable.js';
import { DataTable } from '../../components/DataTable/DataTable.js';
import { Modal } from '../../components/Modal/Modal.js';
import { Badge, type BadgeVariantMap } from '../../components/Badge/Badge.js';
import { BudgetSubNav } from '../../components/BudgetSubNav/BudgetSubNav.js';
import { useTableState } from '../../hooks/useTableState.js';
import { useFormatters } from '../../lib/formatters.js';
import { fetchAllInvoices, createInvoice } from '../../lib/invoicesApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './InvoicesPage.module.css';

interface InvoiceFormState {
  vendorId: string;
  invoiceNumber: string;
  amount: string;
  date: string;
  dueDate: string;
  status: InvoiceStatus;
  notes: string;
}

const EMPTY_FORM: InvoiceFormState = {
  vendorId: '',
  invoiceNumber: '',
  amount: '',
  date: '',
  dueDate: '',
  status: 'quotation',
  notes: '',
};

function getAttributionLabel(invoice: Invoice, t: ReturnType<typeof useTranslation>['t']): string {
  if (invoice.budgetLines.length === 0) return t('invoices.attribution.none');
  const totalItemized = invoice.budgetLines.reduce((sum, bl) => sum + bl.itemizedAmount, 0);
  if (invoice.amount === 0)
    return t('invoices.attribution.lines', { count: invoice.budgetLines.length });
  const pct = Math.round((totalItemized / invoice.amount) * 100);
  return t('invoices.attribution.allocated', { pct });
}

function calculateRemaining(invoice: Invoice): number {
  const totalItemized = invoice.budgetLines.reduce((sum, bl) => sum + bl.itemizedAmount, 0);
  return invoice.amount - totalItemized;
}

export function InvoicesPage() {
  const { t } = useTranslation('budget');
  const navigate = useNavigate();
  const { formatCurrency, formatDate } = useFormatters();

  // Data state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState({
    pending: { count: 0, totalAmount: 0 },
    paid: { count: 0, totalAmount: 0 },
    claimed: { count: 0, totalAmount: 0 },
    quotation: { count: 0, totalAmount: 0 },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Table state management with URL sync
  const { tableState, toApiParams } = useTableState({
    defaultPageSize: 25,
  });
  const [searchParams, setSearchParams] = useSearchParams();

  // Vendor list for filter dropdown + create modal
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);

  // Create invoice modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<InvoiceFormState>(EMPTY_FORM);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>('');

  // Form ref for submit button in modal
  const formRef = useRef<HTMLFormElement>(null);

  // Load invoices when table state changes
  useEffect(() => {
    void loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tableState.search,
    tableState.sortBy,
    tableState.sortDir,
    tableState.page,
    tableState.pageSize,
    tableState.filters,
  ]);

  // Load vendors on mount
  useEffect(() => {
    void fetchVendors({ pageSize: 100 }).then((res) =>
      setVendors(res.vendors.map((v) => ({ id: v.id, name: v.name }))),
    );
  }, []);

  const loadInvoices = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetchAllInvoices(
        toApiParams() as Parameters<typeof fetchAllInvoices>[0],
      );
      setInvoices(response.invoices);
      setSummary(response.summary);
      setTotalPages(response.pagination.totalPages);
      setTotalItems(response.pagination.totalItems);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('invoices.errorMessage'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStateChange = (newState: TableState) => {
    const params = new URLSearchParams(searchParams);
    if (newState.search) {
      params.set('q', newState.search);
    } else {
      params.delete('q');
    }
    if (newState.sortBy) {
      params.set('sortBy', newState.sortBy);
      params.set('sortOrder', newState.sortDir ?? 'asc');
    } else {
      params.delete('sortBy');
      params.delete('sortOrder');
    }
    params.set('page', String(newState.page));
    params.set('pageSize', String(newState.pageSize));

    // Delete all known filter param keys first
    const knownFilterKeys = ['status'];
    for (const key of knownFilterKeys) {
      params.delete(key);
    }

    // Sync filters
    for (const [paramKey, filter] of newState.filters.entries()) {
      if (filter.value) {
        params.set(paramKey, filter.value);
      }
    }

    setSearchParams(params);
  };

  const openCreateModal = () => {
    setCreateForm(EMPTY_FORM);
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
    setCreateError('');

    if (!createForm.vendorId) {
      setCreateError(t('invoices.validation.vendorRequired'));
      return;
    }
    const amount = parseFloat(createForm.amount);
    if (isNaN(amount) || amount <= 0) {
      setCreateError(t('invoices.validation.amountRequired'));
      return;
    }
    if (!createForm.date) {
      setCreateError(t('invoices.validation.dateRequired'));
      return;
    }

    setIsCreating(true);

    try {
      const data: CreateInvoiceRequest = {
        invoiceNumber: createForm.invoiceNumber.trim() || null,
        amount,
        date: createForm.date,
        dueDate: createForm.dueDate || null,
        status: createForm.status,
        notes: createForm.notes.trim() || null,
      };
      await createInvoice(createForm.vendorId, data);
      setShowCreateModal(false);
      await loadInvoices();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.error.message);
      } else {
        setCreateError(t('invoices.messages.createError'));
      }
    } finally {
      setIsCreating(false);
    }
  };

  // Invoice status badge variants
  const invoiceStatusVariants = useMemo((): BadgeVariantMap => {
    const variants: BadgeVariantMap = {};
    const statuses: InvoiceStatus[] = ['pending', 'paid', 'claimed', 'quotation'];
    for (const status of statuses) {
      variants[status] = {
        label: t(`invoices.statusLabels.${status}`),
        className: styles[status],
      };
    }
    return variants;
  }, [t]);

  // Column definitions
  const columns = useMemo(
    (): ColumnDef<Invoice>[] => [
      {
        key: 'date',
        label: t('invoices.tableHeaders.date'),
        sortable: true,
        sortKey: 'date',
        defaultVisible: true,
        render: (inv) => formatDate(inv.date),
      },
      {
        key: 'invoiceNumber',
        label: t('invoices.tableHeaders.invoiceNumber'),
        sortable: false,
        defaultVisible: true,
        render: (inv) =>
          inv.invoiceNumber ? (
            <Link to={`/budget/invoices/${inv.id}`} className={styles.invoiceLink}>
              {inv.invoiceNumber}
            </Link>
          ) : (
            <Link
              to={`/budget/invoices/${inv.id}`}
              className={`${styles.invoiceLink} ${styles.invoiceLinkNoNumber}`}
            >
              —
            </Link>
          ),
      },
      {
        key: 'vendor',
        label: t('invoices.tableHeaders.vendor'),
        sortable: true,
        sortKey: 'vendor_name',
        defaultVisible: true,
        render: (inv) => (
          <Link to={`/budget/vendors/${inv.vendorId}`} className={styles.vendorLink}>
            {inv.vendorName}
          </Link>
        ),
      },
      {
        key: 'amount',
        label: t('invoices.tableHeaders.amount'),
        sortable: true,
        sortKey: 'amount',
        defaultVisible: true,
        render: (inv) => formatCurrency(inv.amount),
        className: styles.amountCell,
      },
      {
        key: 'allocated',
        label: t('invoices.tableHeaders.allocated'),
        sortable: false,
        defaultVisible: true,
        render: (inv) => getAttributionLabel(inv, t),
      },
      {
        key: 'dueDate',
        label: t('invoices.tableHeaders.dueDate'),
        sortable: true,
        sortKey: 'due_date',
        defaultVisible: true,
        render: (inv) => (inv.dueDate ? formatDate(inv.dueDate) : '—'),
      },
      {
        key: 'status',
        label: t('invoices.tableHeaders.status'),
        sortable: true,
        sortKey: 'status',
        defaultVisible: true,
        filterable: true,
        filterType: 'enum',
        filterParamKey: 'status',
        enumOptions: [
          { value: 'pending', label: t('invoices.statusLabels.pending') },
          { value: 'paid', label: t('invoices.statusLabels.paid') },
          { value: 'claimed', label: t('invoices.statusLabels.claimed') },
          { value: 'quotation', label: t('invoices.statusLabels.quotation') },
        ],
        render: (inv) => (
          <Badge
            variants={invoiceStatusVariants}
            value={inv.status}
            testId={`invoice-status-${inv.id}`}
          />
        ),
      },
      {
        key: 'notes',
        label: t('invoices.tableHeaders.notes'),
        sortable: false,
        defaultVisible: false,
        render: (inv) => {
          if (!inv.notes) return '—';
          return inv.notes.length > 60 ? `${inv.notes.substring(0, 60)}...` : inv.notes;
        },
      },
      {
        key: 'remainingAmount',
        label: t('invoices.tableHeaders.remainingAmount'),
        sortable: false,
        defaultVisible: false,
        render: (inv) => formatCurrency(calculateRemaining(inv)),
      },
    ],
    [t, formatDate, formatCurrency, invoiceStatusVariants],
  );

  // Summary cards as headerContent
  const headerContent = (
    <div className={styles.summaryGrid}>
      <div className={styles.summaryCard}>
        <span className={styles.summaryLabel}>{t('invoices.summaryPending')}</span>
        <span className={styles.summaryCount}>{summary.pending.count}</span>
        <span className={styles.summaryAmount}>{formatCurrency(summary.pending.totalAmount)}</span>
      </div>
      <div className={styles.summaryCard}>
        <span className={styles.summaryLabel}>{t('invoices.summaryPaid')}</span>
        <span className={styles.summaryCount}>{summary.paid.count + summary.claimed.count}</span>
        <span className={`${styles.summaryAmount} ${styles.summaryAmountPaid}`}>
          {formatCurrency(summary.paid.totalAmount + summary.claimed.totalAmount)}
        </span>
      </div>
      <div className={styles.summaryCard}>
        <span className={styles.summaryLabel}>{t('invoices.summaryQuotation')}</span>
        <span className={styles.summaryCount}>{summary.quotation.count}</span>
        <span className={styles.summaryAmount}>
          {formatCurrency(summary.quotation.totalAmount)}
        </span>
      </div>
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>{t('invoices.title')}</h1>
        <button
          type="button"
          className={sharedStyles.btnPrimary}
          onClick={openCreateModal}
          data-testid="new-invoice-button"
        >
          {t('invoices.addInvoice')}
        </button>
      </div>

      <BudgetSubNav />

      <h2 className={styles.sectionTitle}>{t('invoices.sectionTitle')}</h2>

      <DataTable<Invoice>
        pageKey="invoices"
        columns={columns}
        items={invoices}
        totalItems={totalItems}
        totalPages={totalPages}
        currentPage={tableState.page}
        isLoading={isLoading}
        error={error}
        getRowKey={(inv) => inv.id}
        onRowClick={(inv) => navigate(`/budget/invoices/${inv.id}`)}
        tableState={tableState}
        onStateChange={handleStateChange}
        headerContent={headerContent}
        emptyState={{
          message: t('invoices.noInvoicesTitle'),
          description: t('invoices.noInvoicesDescription'),
          action: {
            label: t('invoices.addFirstInvoice'),
            onClick: openCreateModal,
          },
        }}
      />

      {/* Create invoice modal */}
      {showCreateModal && (
        <Modal
          title={t('invoices.modal.title')}
          onClose={closeCreateModal}
          footer={
            <>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={closeCreateModal}
                disabled={isCreating}
              >
                {t('invoices.buttons.cancel')}
              </button>
              <button
                type="button"
                className={sharedStyles.btnPrimary}
                onClick={() => formRef.current?.requestSubmit()}
                disabled={
                  isCreating || !createForm.vendorId || !createForm.amount || !createForm.date
                }
              >
                {isCreating ? t('invoices.buttons.creating') : t('invoices.buttons.create')}
              </button>
            </>
          }
        >
          <p>{t('invoices.modal.description') || t('invoices.form.vendor')}</p>

          {createError && (
            <div className={styles.errorBanner} role="alert">
              {createError}
            </div>
          )}

          <form onSubmit={handleCreateInvoice} className={styles.form} noValidate ref={formRef}>
            <div className={styles.field}>
              <label htmlFor="invoice-vendor" className={styles.label}>
                {t('invoices.form.vendor')}{' '}
                <span className={styles.required}>{t('invoices.form.required')}</span>
              </label>
              <select
                id="invoice-vendor"
                value={createForm.vendorId}
                onChange={(e) => setCreateForm({ ...createForm, vendorId: e.target.value })}
                className={styles.select}
                disabled={isCreating}
                required
                autoFocus
              >
                <option value="">{t('invoices.form.placeholders.vendor')}</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formRow}>
              <div className={styles.fieldGrow}>
                <label htmlFor="invoice-number" className={styles.label}>
                  {t('invoices.form.invoiceNumber')}
                </label>
                <input
                  type="text"
                  id="invoice-number"
                  value={createForm.invoiceNumber}
                  onChange={(e) => setCreateForm({ ...createForm, invoiceNumber: e.target.value })}
                  className={styles.input}
                  placeholder={t('invoices.form.placeholders.invoiceNumber')}
                  maxLength={100}
                  disabled={isCreating}
                />
              </div>
              <div className={styles.fieldGrow}>
                <label htmlFor="invoice-amount" className={styles.label}>
                  {t('invoices.form.amount')}{' '}
                  <span className={styles.required}>{t('invoices.form.required')}</span>
                </label>
                <input
                  type="number"
                  id="invoice-amount"
                  value={createForm.amount}
                  onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })}
                  className={styles.input}
                  placeholder={t('invoices.form.placeholders.amount')}
                  min="0.01"
                  step="0.01"
                  required
                  disabled={isCreating}
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.fieldGrow}>
                <label htmlFor="invoice-date" className={styles.label}>
                  {t('invoices.form.invoiceDate')}{' '}
                  <span className={styles.required}>{t('invoices.form.required')}</span>
                </label>
                <input
                  type="date"
                  id="invoice-date"
                  value={createForm.date}
                  onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })}
                  className={styles.input}
                  required
                  disabled={isCreating}
                />
              </div>
              <div className={styles.fieldGrow}>
                <label htmlFor="invoice-due-date" className={styles.label}>
                  {t('invoices.form.dueDate')}
                </label>
                <input
                  type="date"
                  id="invoice-due-date"
                  value={createForm.dueDate}
                  onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })}
                  className={styles.input}
                  disabled={isCreating}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="invoice-status" className={styles.label}>
                {t('invoices.form.status')}
              </label>
              <select
                id="invoice-status"
                value={createForm.status}
                onChange={(e) =>
                  setCreateForm({ ...createForm, status: e.target.value as InvoiceStatus })
                }
                className={styles.select}
                disabled={isCreating}
              >
                <option value="pending">{t('invoices.statusLabels.pending')}</option>
                <option value="paid">{t('invoices.statusLabels.paid')}</option>
                <option value="claimed">{t('invoices.statusLabels.claimed')}</option>
                <option value="quotation">{t('invoices.statusLabels.quotation')}</option>
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="invoice-notes" className={styles.label}>
                {t('invoices.form.notes')}
              </label>
              <textarea
                id="invoice-notes"
                value={createForm.notes}
                onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                className={styles.textarea}
                placeholder={t('invoices.form.placeholders.notes') || ''}
                rows={3}
                disabled={isCreating}
              />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default InvoicesPage;
