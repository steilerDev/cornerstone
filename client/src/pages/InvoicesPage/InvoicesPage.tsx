import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  Invoice,
  InvoiceStatusBreakdown,
  InvoiceStatus,
  CreateInvoiceRequest,
} from '@cornerstone/shared';
import { fetchAllInvoices, createInvoice } from '../../lib/invoicesApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useFormatters } from '../../lib/formatters.js';
import { BudgetSubNav } from '../../components/BudgetSubNav/BudgetSubNav.js';
import { DataTable } from '../../components/DataTable/DataTable.js';
import type { ColumnDef } from '../../components/DataTable/DataTable.js';
import { useTableState } from '../../hooks/useTableState.js';
import { useColumnPreferences } from '../../hooks/useColumnPreferences.js';
import styles from './InvoicesPage.module.css';

// STATUS_LABELS will be dynamically generated from i18n to ensure proper translation

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

export function InvoicesPage() {
  const { t } = useTranslation('budget');
  const { formatCurrency, formatDate } = useFormatters();
  const navigate = useNavigate();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<InvoiceStatusBreakdown>({
    pending: { count: 0, totalAmount: 0 },
    paid: { count: 0, totalAmount: 0 },
    claimed: { count: 0, totalAmount: 0 },
    quotation: { count: 0, totalAmount: 0 },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const pageSize = 25;

  // Table state
  const {
    tableState,
    searchInput,
    setSearchInput,
    setFilter,
    setSort,
    setPage,
    clearFilters,
    hasActiveFilters,
    toApiParams,
  } = useTableState({
    defaultSort: { sortBy: 'date', sortOrder: 'desc' },
    filterKeys: ['status', 'vendorId'],
  });

  // Vendor list for filter dropdown + create modal
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<InvoiceFormState>(EMPTY_FORM);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    void fetchVendors({ pageSize: 100 }).then((res) =>
      setVendors(res.vendors.map((v) => ({ id: v.id, name: v.name }))),
    );
  }, []);

  // Load invoices when table state changes
  useEffect(() => {
    const loadInvoices = async () => {
      setIsLoading(true);
      setError('');

      try {
        const params = toApiParams();
        const response = await fetchAllInvoices({
          page: params.page as number,
          pageSize,
          q: (params.q as string) || undefined,
          status: (params.status as InvoiceStatus) || undefined,
          vendorId: (params.vendorId as string) || undefined,
          sortBy: params.sortBy as string,
          sortOrder: params.sortOrder as 'asc' | 'desc',
        });

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

    void loadInvoices();
  }, [tableState, toApiParams, t]);

  // Column definitions
  const columns: ColumnDef<Invoice>[] = useMemo(
    () => [
      {
        key: 'date',
        label: t('invoices.tableHeaders.date'),
        type: 'date',
        sortable: true,
        sortKey: 'date',
        defaultVisible: true,
        render: (item) => formatDate(item.date),
      },
      {
        key: 'invoiceNumber',
        label: t('invoices.tableHeaders.invoiceNumber'),
        type: 'string',
        defaultVisible: true,
        render: (item) =>
          item.invoiceNumber ? (
            <Link to={`/budget/invoices/${item.id}`} className={styles.invoiceLink}>
              {item.invoiceNumber}
            </Link>
          ) : (
            <Link
              to={`/budget/invoices/${item.id}`}
              className={`${styles.invoiceLink} ${styles.invoiceLinkNoNumber}`}
            >
              &mdash;
            </Link>
          ),
      },
      {
        key: 'vendorName',
        label: t('invoices.tableHeaders.vendor'),
        type: 'string',
        defaultVisible: true,
        render: (item) => (
          <Link to={`/budget/vendors/${item.vendorId}`} className={styles.vendorLink}>
            {item.vendorName}
          </Link>
        ),
      },
      {
        key: 'amount',
        label: t('invoices.tableHeaders.amount'),
        type: 'currency',
        sortable: true,
        sortKey: 'amount',
        defaultVisible: true,
        cellClassName: styles.amountCell,
        render: (item) => formatCurrency(item.amount),
      },
      {
        key: 'allocated',
        label: t('invoices.tableHeaders.allocated'),
        type: 'string',
        defaultVisible: true,
        render: (item) => getAttributionLabel(item, t),
      },
      {
        key: 'dueDate',
        label: t('invoices.tableHeaders.dueDate'),
        type: 'date',
        sortable: true,
        sortKey: 'due_date',
        defaultVisible: true,
        render: (item) => (item.dueDate ? formatDate(item.dueDate) : '\u2014'),
      },
      {
        key: 'status',
        label: t('invoices.tableHeaders.status'),
        type: 'enum',
        sortable: true,
        sortKey: 'status',
        defaultVisible: true,
        render: (item) => (
          <span className={`${styles.statusBadge} ${styles[`status_${item.status}`]}`}>
            {t(`invoices.statusLabels.${item.status}`)}
          </span>
        ),
      },
    ],
    [t, formatDate, formatCurrency],
  );

  const { visibleColumns, toggleColumn } = useColumnPreferences('invoices', columns);

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
    setCreateError('');
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

  // Filter bar as headerContent for DataTable
  const filterBar = (
    <div className={styles.filterCard}>
      <div className={styles.searchRow}>
        <input
          type="search"
          placeholder={t('invoices.searchPlaceholder')}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className={styles.searchInput}
          aria-label={t('invoices.searchAriaLabel')}
        />
      </div>

      {/* Summary cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('invoices.summaryPending')}</span>
          <span className={styles.summaryCount}>{summary.pending.count}</span>
          <span className={styles.summaryAmount}>
            {formatCurrency(summary.pending.totalAmount)}
          </span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>{t('invoices.summaryPaid')}</span>
          <span className={styles.summaryCount}>
            {summary.paid.count + summary.claimed.count}
          </span>
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

      <div className={styles.filterRow}>
        <select
          value={tableState.filters.status || ''}
          onChange={(e) => setFilter('status', e.target.value || undefined)}
          className={styles.filterSelect}
          aria-label={t('invoices.filterStatusAriaLabel')}
        >
          <option value="">{t('invoices.allStatuses')}</option>
          <option value="pending">{t('invoices.statusLabels.pending')}</option>
          <option value="paid">{t('invoices.statusLabels.paid')}</option>
          <option value="claimed">{t('invoices.statusLabels.claimed')}</option>
          <option value="quotation">{t('invoices.statusLabels.quotation')}</option>
        </select>
        <select
          value={tableState.filters.vendorId || ''}
          onChange={(e) => setFilter('vendorId', e.target.value || undefined)}
          className={styles.filterSelect}
          aria-label={t('invoices.filterVendorAriaLabel')}
        >
          <option value="">{t('invoices.allVendors')}</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <div className={styles.sortControls}>
          <label htmlFor="sort-select" className={styles.sortLabel}>
            {t('invoices.sortLabel')}
          </label>
          <select
            id="sort-select"
            value={tableState.sort.sortBy}
            onChange={(e) => setSort(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="date">{t('invoices.sortDate')}</option>
            <option value="amount">{t('invoices.sortAmount')}</option>
            <option value="status">{t('invoices.sortStatus')}</option>
            <option value="vendor_name">{t('invoices.sortVendor')}</option>
            <option value="due_date">{t('invoices.sortDueDate')}</option>
          </select>
          <button
            type="button"
            className={styles.sortOrderButton}
            onClick={() => setSort(tableState.sort.sortBy)}
            aria-label={t('invoices.sortOrderAriaLabel')}
          >
            {tableState.sort.sortOrder === 'asc' ? t('invoices.sortAsc') : t('invoices.sortDesc')}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{t('invoices.title')}</h1>
        </div>
        <BudgetSubNav />

        {/* Section header */}
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('invoices.sectionTitle')}</h2>
          <button type="button" className={styles.button} onClick={openCreateModal}>
            {t('invoices.addInvoice')}
          </button>
        </div>

        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
          </div>
        )}

        <DataTable<Invoice>
          pageKey="invoices"
          columns={columns}
          items={invoices}
          totalItems={totalItems}
          totalPages={totalPages}
          currentPage={tableState.page}
          pageSize={pageSize}
          isLoading={isLoading}
          getRowKey={(item) => item.id}
          onRowClick={(item) => navigate(`/budget/invoices/${item.id}`)}
          tableState={tableState}
          onSortChange={setSort}
          onPageChange={setPage}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
          headerContent={filterBar}
          hasActiveFilters={hasActiveFilters}
          getCardTitle={(item) =>
            item.invoiceNumber ? `#${item.invoiceNumber}` : t('invoices.noNumber')
          }
          emptyState={{
            noData: {
              title: t('invoices.noInvoicesTitle'),
              description: t('invoices.noInvoicesDescription'),
              action: (
                <button type="button" className={styles.button} onClick={openCreateModal}>
                  {t('invoices.addFirstInvoice')}
                </button>
              ),
            },
            noResults: {
              title: t('invoices.noFilterResults'),
              description: t('invoices.tryDifferentFilters'),
              action: (
                <button type="button" className={styles.secondaryButton} onClick={clearFilters}>
                  {t('invoices.clearFilters')}
                </button>
              ),
            },
          }}
        />
      </div>

      {/* Create invoice modal */}
      {showCreateModal && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeCreateModal} />
          <div className={`${styles.modalContent} ${styles.modalContentWide}`}>
            <h2 id="create-modal-title" className={styles.modalTitle}>
              {t('invoices.modal.title')}
            </h2>
            {createError && (
              <div className={styles.errorBanner} role="alert">
                {createError}
              </div>
            )}
            <form onSubmit={handleCreateInvoice} className={styles.form} noValidate>
              <div className={styles.field}>
                <label htmlFor="create-vendor" className={styles.label}>
                  {t('invoices.form.vendor')}{' '}
                  <span className={styles.required}>{t('invoices.form.required')}</span>
                </label>
                <select
                  id="create-vendor"
                  value={createForm.vendorId}
                  onChange={(e) => setCreateForm({ ...createForm, vendorId: e.target.value })}
                  className={styles.select}
                  disabled={isCreating}
                  required
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
                  <label htmlFor="create-invoice-number" className={styles.label}>
                    {t('invoices.form.invoiceNumber')}
                  </label>
                  <input
                    type="text"
                    id="create-invoice-number"
                    value={createForm.invoiceNumber}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, invoiceNumber: e.target.value })
                    }
                    className={styles.input}
                    placeholder={t('invoices.form.placeholders.invoiceNumber')}
                    maxLength={100}
                    disabled={isCreating}
                  />
                </div>
                <div className={styles.fieldGrow}>
                  <label htmlFor="create-amount" className={styles.label}>
                    {t('invoices.form.amount')}{' '}
                    <span className={styles.required}>{t('invoices.form.required')}</span>
                  </label>
                  <input
                    type="number"
                    id="create-amount"
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
                  <label htmlFor="create-date" className={styles.label}>
                    {t('invoices.form.invoiceDate')}{' '}
                    <span className={styles.required}>{t('invoices.form.required')}</span>
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
                    {t('invoices.form.dueDate')}
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
                  {t('invoices.form.status')}
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
                  <option value="pending">{t('invoices.statusLabels.pending')}</option>
                  <option value="paid">{t('invoices.statusLabels.paid')}</option>
                  <option value="claimed">{t('invoices.statusLabels.claimed')}</option>
                  <option value="quotation">{t('invoices.statusLabels.quotation')}</option>
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="create-notes" className={styles.label}>
                  {t('invoices.form.notes')}
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
                  {t('invoices.buttons.cancel')}
                </button>
                <button
                  type="submit"
                  className={styles.button}
                  disabled={
                    isCreating || !createForm.vendorId || !createForm.amount || !createForm.date
                  }
                >
                  {isCreating ? t('invoices.buttons.creating') : t('invoices.buttons.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default InvoicesPage;
