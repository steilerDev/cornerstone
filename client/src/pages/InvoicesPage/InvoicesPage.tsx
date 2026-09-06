import { useState, useEffect, useMemo, useRef, type FormEvent, type ReactNode } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  Invoice,
  InvoiceDeposit,
  CreateInvoiceRequest,
  InvoiceStatus,
  FilterMeta,
  InvoiceStatusBreakdown,
  PaperlessDocumentSearchResult,
  PaperlessStatusResponse,
} from '@cornerstone/shared';
import type {
  ColumnDef,
  TableState,
  ExpandableRowsConfig,
} from '../../components/DataTable/DataTable.js';
import { DataTable } from '../../components/DataTable/DataTable.js';
import { Modal } from '../../components/Modal/Modal.js';
import { Badge, type BadgeVariantMap } from '../../components/Badge/Badge.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { SubNav } from '../../components/SubNav/SubNav.js';
import { useTableState } from '../../hooks/useTableState.js';
import { useFormatters } from '../../lib/formatters.js';
import { fetchAllInvoices, createInvoice } from '../../lib/invoicesApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { getPaperlessStatus } from '../../lib/paperlessApi.js';
import { fetchConfig } from '../../lib/configApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { Spinner } from '../../components/Spinner/Spinner.js';
import { InvoicePaperlessPickerModal } from '../../components/invoices/InvoicePaperlessPickerModal.js';
import { BUDGET_TABS } from '../shared/budgetTabs.js';
import {
  todayIso,
  isOverdue,
  getOpenDeposits,
  isContainerOnly,
  isInvoiceOverdue,
  hasOverdueOpenDeposit,
  getDepositOrdinal,
} from './openItemsUtils.js';
import sharedStyles from '../../styles/shared.module.css';
import badgeStyles from '../../components/Badge/Badge.module.css';
import dtStyles from '../../components/DataTable/DataTable.module.css';
import styles from './InvoicesPage.module.css';

// URL params owned by this page's "open items" mode, not by useTableState's column filters.
const OPEN_ONLY_RESERVED = ['openOnly'];

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
  const [summary, setSummary] = useState<InvoiceStatusBreakdown>({
    pending: { count: 0, totalAmount: 0 },
    paid: { count: 0, totalAmount: 0 },
    claimed: { count: 0, totalAmount: 0 },
    quotation: { count: 0, totalAmount: 0 },
    overdue: { count: 0, totalAmount: 0 },
    claimable: { count: 0, totalAmount: 0 },
    quotationCoveredByDeposits: 0,
    openPayable: { count: 0, totalAmount: 0 },
    refundsDue: { count: 0, totalAmount: 0 },
  });
  const [filterMeta, setFilterMeta] = useState<FilterMeta>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasOverdue, setHasOverdue] = useState(false);

  // Table state management with URL sync
  const { tableState, toApiParams } = useTableState({
    defaultPageSize: 25,
    reservedParams: OPEN_ONLY_RESERVED,
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const openOnly = searchParams.get('openOnly') === 'true';
  const today = useMemo(() => todayIso(), []);

  // Vendor list for filter dropdown + create modal
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);

  // Create invoice modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<InvoiceFormState>(EMPTY_FORM);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>('');

  // Paperless picker modal state
  const [showPaperlessPickerModal, setShowPaperlessPickerModal] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<{
    paperless: PaperlessStatusResponse | null;
    autoItemizeEnabled: boolean | null;
  }>({ paperless: null, autoItemizeEnabled: null });

  // Form ref for submit button in modal
  const formRef = useRef<HTMLFormElement>(null);

  // Actions menu state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Close action menu on outside click and Escape key
  useEffect(() => {
    if (!activeMenuId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.actionsMenu}`)) {
        setActiveMenuId(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveMenuId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [activeMenuId]);

  // Load invoices when table state changes
  useEffect(() => {
    void loadInvoices();
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- loadInvoices is defined in component body; effect re-runs on intended trigger only
  }, [
    tableState.search,
    tableState.sortBy,
    tableState.sortDir,
    tableState.page,
    tableState.pageSize,
    tableState.filters,
    openOnly,
  ]);

  // Load vendors on mount
  useEffect(() => {
    void fetchVendors({ pageSize: 100 }).then((res) =>
      setVendors(res.vendors.map((v) => ({ id: v.id, name: v.name }))),
    );
  }, []);

  // Load Paperless and config status on mount
  useEffect(() => {
    let cancelled = false;

    async function loadIntegrationStatus() {
      try {
        const [paperlessStatus, config] = await Promise.all([getPaperlessStatus(), fetchConfig()]);
        if (!cancelled) {
          setIntegrationStatus({
            paperless: paperlessStatus,
            autoItemizeEnabled: config.autoItemizeEnabled,
          });
        }
      } catch {
        if (!cancelled) {
          setIntegrationStatus({
            paperless: null,
            autoItemizeEnabled: false,
          });
        }
      }
    }

    void loadIntegrationStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadInvoices = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetchAllInvoices({
        ...(toApiParams() as NonNullable<Parameters<typeof fetchAllInvoices>[0]>),
        openOnly,
      });
      setInvoices(response.invoices);
      setSummary(response.summary);
      setFilterMeta(response.filterMeta ?? {});
      setTotalPages(response.pagination.totalPages);
      setTotalItems(response.pagination.totalItems);
      setHasOverdue(response.summary.overdue.count > 0);
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
    const knownFilterKeys = ['status', 'vendorId', 'amount', 'date', 'dueDate', 'remainingAmount'];
    for (const key of knownFilterKeys) {
      params.delete(key);
    }

    // Sync filters
    for (const [paramKey, filter] of newState.filters.entries()) {
      if (filter.value) {
        params.set(paramKey, filter.value);
      }
    }

    // Mutual exclusivity: choosing a status filter turns "open items" mode off.
    if (newState.filters.has('status')) {
      params.delete('openOnly');
    }

    setSearchParams(params);
  };

  const setOpenOnly = (next: boolean) => {
    const params = new URLSearchParams(searchParams);
    if (next) {
      params.set('openOnly', 'true');
      params.delete('status'); // mutual exclusivity: clear any active status filter
    } else {
      params.delete('openOnly');
    }
    params.set('page', '1');
    setSearchParams(params);
  };

  const openCreateModal = () => {
    // If Paperless and auto-itemize are both configured, open the picker modal
    if (
      integrationStatus.paperless?.configured &&
      integrationStatus.paperless?.reachable &&
      integrationStatus.autoItemizeEnabled
    ) {
      setShowPaperlessPickerModal(true);
    } else {
      // Otherwise open the manual create modal
      setCreateForm(EMPTY_FORM);
      setCreateError('');
      setShowCreateModal(true);
    }
  };

  const handlePaperlessDocumentSelected = (doc: PaperlessDocumentSearchResult) => {
    setShowPaperlessPickerModal(false);
    navigate('/budget/invoices/new/paperless', {
      state: { documentId: doc.id, documentTitle: doc.title },
    });
  };

  const handlePaperlessManualEntry = () => {
    setShowPaperlessPickerModal(false);
    setCreateForm(EMPTY_FORM);
    setCreateError('');
    setShowCreateModal(true);
  };

  // Consume ?create=1 from the Dashboard "Add Invoice" shortcut.
  // Only fires once integrationStatus has fully resolved (both fields non-null)
  // to match the readiness gate used by the page's own "Add Invoice" button.
  useEffect(() => {
    if (integrationStatus.paperless === null || integrationStatus.autoItemizeEnabled === null) {
      return;
    }
    if (searchParams.get('create') === '1') {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('create');
          return next;
        },
        { replace: true },
      );
      openCreateModal();
    }
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- openCreateModal is a stable plain function; intentionally omitted
  }, [integrationStatus, searchParams, setSearchParams]);

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
        // Fix (Issue #2046): these classes live in Badge.module.css, not InvoicesPage.module.css —
        // `styles[status]` resolved to undefined, so the invoice status badges rendered with no colour.
        className: badgeStyles[status]!,
      };
    }
    return variants;
  }, [t]);

  // Open-items badge variants (Story #2046)
  const flagVariants = useMemo(
    (): BadgeVariantMap => ({
      overdue: { label: t('invoices.openItems.overdueLabel')!, className: badgeStyles.overdue! },
      depositOverdue: {
        label: t('invoices.openItems.depositOverdueLabel')!,
        className: badgeStyles.overdue!,
      },
      containerOnly: {
        label: t('invoices.openItems.containerLabel')!,
        className: badgeStyles.containerOnly!,
      },
    }),
    [t],
  );

  const depositStatusVariants = useMemo(
    (): BadgeVariantMap => ({
      pending: { label: t('invoiceDetail.statusLabels.pending')!, className: badgeStyles.pending! },
      paid: { label: t('invoiceDetail.statusLabels.paid')!, className: badgeStyles.paid! },
      claimed: { label: t('invoiceDetail.statusLabels.claimed')!, className: badgeStyles.claimed! },
    }),
    [t],
  );

  const entryTypeVariants = useMemo(
    (): BadgeVariantMap => ({
      refund: {
        label: t('invoiceDetail.deposits.entryTypeLabels.refund')!,
        className: badgeStyles.error!,
      },
    }),
    [t],
  );

  // Disable the Status filter trigger while "open items" mode is on (mutually exclusive).
  const disabledFilterKeys = useMemo(
    () =>
      openOnly ? new Map([['status', t('invoices.openItems.toggleDisabledHint')!]]) : undefined,
    [openOnly, t],
  );

  // Column definitions
  const columns = useMemo(
    (): ColumnDef<Invoice>[] => [
      {
        key: 'invoiceNumber',
        label: t('invoices.tableHeaders.invoiceNumber')!,
        sortable: false,
        defaultVisible: true,
        render: (inv) => (
          <span className={styles.invoiceNumberCell}>
            {inv.invoiceNumber ? (
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
            )}
            {openOnly && (isInvoiceOverdue(inv, today) || hasOverdueOpenDeposit(inv, today)) && (
              <Badge
                variants={flagVariants}
                value={isInvoiceOverdue(inv, today) ? 'overdue' : 'depositOverdue'}
                testId={`invoice-overdue-${inv.id}`}
              />
            )}
            {openOnly && isContainerOnly(inv) && (
              <Badge
                variants={flagVariants}
                value="containerOnly"
                testId={`invoice-container-${inv.id}`}
              />
            )}
          </span>
        ),
      },
      {
        key: 'vendor',
        label: t('invoices.tableHeaders.vendor')!,
        sortable: true,
        sortKey: 'vendor_name',
        defaultVisible: true,
        filterable: true,
        filterType: 'enum',
        filterParamKey: 'vendorId',
        enumOptions: vendors.map((v) => ({ value: v.id, label: v.name })),
        render: (inv) => (
          <Link to={`/settings/vendors/${inv.vendorId}`} className={styles.vendorLink}>
            {inv.vendorName}
          </Link>
        ),
      },
      {
        key: 'date',
        label: t('invoices.tableHeaders.date')!,
        sortable: true,
        sortKey: 'date',
        defaultVisible: true,
        filterable: true,
        filterType: 'date' as const,
        filterParamKey: 'date',
        render: (inv) => formatDate(inv.date),
      },
      {
        key: 'amount',
        label: t('invoices.tableHeaders.amount')!,
        sortable: true,
        sortKey: 'amount',
        defaultVisible: true,
        filterable: true,
        filterType: 'number',
        filterParamKey: 'amount',
        numberMin: 0,
        numberStep: 0.01,
        render: (inv) => formatCurrency(inv.amount),
        className: styles.amountCell!,
      },
      ...(openOnly
        ? [
            {
              key: 'stillDue',
              label: t('invoices.tableHeaders.stillDue')!,
              sortable: false,
              defaultVisible: true,
              alwaysVisible: true,
              className: styles.amountCell!,
              headerClassName: styles.amountCell!,
              headerTitle: t('invoices.tableHeaders.stillDueHint')!,
              render: (inv: Invoice) =>
                isContainerOnly(inv) ? (
                  <span title={t('invoices.tableHeaders.stillDueHint')!}>—</span>
                ) : (
                  formatCurrency(inv.openAmount ?? 0)
                ),
            } satisfies ColumnDef<Invoice>,
          ]
        : []),
      {
        key: 'allocated',
        label: t('invoices.tableHeaders.allocated')!,
        sortable: false,
        defaultVisible: true,
        render: (inv) => getAttributionLabel(inv, t),
      },
      {
        key: 'dueDate',
        label: t('invoices.tableHeaders.dueDate')!,
        sortable: true,
        sortKey: 'due_date',
        defaultVisible: true,
        filterable: true,
        filterType: 'date' as const,
        filterParamKey: 'dueDate',
        render: (inv) => (inv.dueDate ? formatDate(inv.dueDate) : '—'),
      },
      {
        key: 'status',
        label: t('invoices.tableHeaders.status')!,
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
        label: t('invoices.tableHeaders.notes')!,
        sortable: false,
        defaultVisible: false,
        render: (inv) => {
          if (!inv.notes) return '—';
          return inv.notes.length > 60 ? `${inv.notes.substring(0, 60)}...` : inv.notes;
        },
      },
      {
        key: 'remainingAmount',
        label: t('invoices.tableHeaders.remainingAmount')!,
        sortable: false,
        defaultVisible: false,
        filterable: true,
        filterType: 'number' as const,
        getValue: (inv) => calculateRemaining(inv),
        numberMin: 0,
        numberStep: 0.01,
        render: (inv) => formatCurrency(calculateRemaining(inv)),
      },
      {
        key: 'effectiveAmount',
        label: t('invoices.tableHeaders.effectiveAmount')!,
        sortable: false,
        defaultVisible: false,
        render: (inv) => formatCurrency(inv.finalPaymentAmount),
      },
    ],
    [t, formatDate, formatCurrency, invoiceStatusVariants, flagVariants, vendors, openOnly, today],
  );

  // Expandable child rows: open (pending) deposits nested under each invoice (Story #2046)
  const expandableRows = useMemo<ExpandableRowsConfig<Invoice, InvoiceDeposit> | undefined>(() => {
    if (!openOnly) return undefined;

    const renderDepositCell = (
      key: string,
      deposit: InvoiceDeposit,
      invoice: Invoice,
    ): ReactNode => {
      switch (key) {
        case 'invoiceNumber': {
          const ordinal = getDepositOrdinal(invoice, deposit);
          return (
            <td key={key} className={`${dtStyles.tableCell} ${dtStyles.childRowCellIndent}`}>
              <span className={sharedStyles.srOnly}>
                {t('invoices.openItems.childOf', {
                  invoiceNumber: invoice.invoiceNumber ?? t('invoices.noNumber'),
                })}
              </span>
              {deposit.entryType === 'refund' ? (
                <Badge variants={entryTypeVariants} value="refund" />
              ) : (
                ordinal &&
                t('invoices.openItems.depositOrdinal', {
                  index: ordinal.index,
                  total: ordinal.total,
                })
              )}
            </td>
          );
        }
        case 'dueDate':
          return (
            <td key={key} className={dtStyles.tableCell}>
              {formatDate(deposit.dueDate)}
              {isOverdue(deposit.dueDate, today) && (
                <Badge
                  variants={flagVariants}
                  value="overdue"
                  testId={`deposit-overdue-${deposit.id}`}
                />
              )}
            </td>
          );
        case 'amount':
          return (
            <td key={key} className={dtStyles.tableCell}>
              <span
                className={`${styles.childAmount} ${
                  deposit.entryType === 'refund' ? styles.childAmountNegative : ''
                }`}
              >
                {formatCurrency(deposit.entryType === 'refund' ? -deposit.amount : deposit.amount)}
              </span>
              <span className={styles.childCaption}>
                {t(
                  deposit.entryType === 'refund'
                    ? 'invoices.openItems.childExcludedCaption'
                    : 'invoices.openItems.childIncludedCaption',
                )}
              </span>
            </td>
          );
        case 'status':
          return (
            <td key={key} className={dtStyles.tableCell}>
              <Badge
                variants={depositStatusVariants}
                value={deposit.status}
                testId={`deposit-status-${deposit.id}`}
              />
            </td>
          );
        case 'notes':
          return (
            <td key={key} className={dtStyles.tableCell}>
              {deposit.description ?? '—'}
            </td>
          );
        default:
          return (
            <td key={key} className={`${dtStyles.tableCell} ${styles.childCellMuted}`}>
              —
            </td>
          );
      }
    };

    const renderDepositCard = (deposit: InvoiceDeposit, invoice: Invoice): ReactNode => {
      const ordinal = getDepositOrdinal(invoice, deposit);
      return (
        <>
          {deposit.entryType === 'refund' ? (
            <Badge variants={entryTypeVariants} value="refund" />
          ) : (
            ordinal &&
            t('invoices.openItems.depositOrdinal', { index: ordinal.index, total: ordinal.total })
          )}
          <span>{formatDate(deposit.dueDate)}</span>
          {isOverdue(deposit.dueDate, today) && (
            <Badge
              variants={flagVariants}
              value="overdue"
              testId={`deposit-overdue-mobile-${deposit.id}`}
            />
          )}
          <span
            className={`${styles.childAmount} ${
              deposit.entryType === 'refund' ? styles.childAmountNegative : ''
            }`}
          >
            {formatCurrency(deposit.entryType === 'refund' ? -deposit.amount : deposit.amount)}
          </span>
          <span className={styles.childCaption}>
            {t(
              deposit.entryType === 'refund'
                ? 'invoices.openItems.childExcludedCaption'
                : 'invoices.openItems.childIncludedCaption',
            )}
          </span>
          <Badge
            variants={depositStatusVariants}
            value={deposit.status}
            testId={`deposit-status-mobile-${deposit.id}`}
          />
        </>
      );
    };

    return {
      getChildren: (inv) => getOpenDeposits(inv),
      getChildKey: (d) => d.id,
      isDefaultExpanded: () => true,
      getExpandLabel: (inv, expanded, count) =>
        t(expanded ? 'invoices.openItems.collapseLabel' : 'invoices.openItems.expandLabel', {
          invoiceNumber: inv.invoiceNumber ?? t('invoices.noNumber'),
          count,
        })!,
      renderChildCells: (d, inv, keys) => keys.map((key) => renderDepositCell(key, d, inv)),
      renderChildCard: (d, inv) => renderDepositCard(d, inv),
    };
  }, [
    openOnly,
    t,
    today,
    formatCurrency,
    formatDate,
    entryTypeVariants,
    flagVariants,
    depositStatusVariants,
  ]);

  // Render actions menu
  const renderActions = (invoice: Invoice) => (
    <div className={styles.actionsMenu}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={() => setActiveMenuId(activeMenuId === invoice.id ? null : invoice.id)}
        aria-label={t('invoices.actions.menuAriaLabel', {
          number: invoice.invoiceNumber || 'Invoice',
        })}
        data-testid={`invoice-menu-button-${invoice.id}`}
      >
        ⋮
      </button>
      {activeMenuId === invoice.id && (
        <div className={styles.menuDropdown}>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              navigate(`/budget/invoices/${invoice.id}`);
              setActiveMenuId(null);
            }}
            data-testid={`invoice-view-${invoice.id}`}
          >
            {t('invoices.buttons.view')}
          </button>
        </div>
      )}
    </div>
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
        <span className={styles.summaryLabel}>{t('invoices.summaryClaimable')}</span>
        <span className={styles.summaryCount}>{summary.claimable.count}</span>
        <span className={`${styles.summaryAmount} ${styles.summaryAmountPaid}`}>
          {formatCurrency(summary.claimable.totalAmount)}
        </span>
        <span className={styles.summaryHint}>{t('invoices.summaryClaimableHint')}</span>
      </div>
      <div className={styles.summaryCard}>
        <span className={styles.summaryLabel}>{t('invoices.summaryClaimed')}</span>
        <span className={styles.summaryCount}>{summary.claimed.count}</span>
        <span className={`${styles.summaryAmount} ${styles.summaryAmountPaid}`}>
          {formatCurrency(summary.claimed.totalAmount)}
        </span>
      </div>
      <div className={styles.summaryCard}>
        <span className={styles.summaryLabel}>{t('invoices.summaryQuotation')}</span>
        <span className={styles.summaryCount}>{summary.quotation.count}</span>
        <span className={styles.summaryAmount}>
          {formatCurrency(summary.quotation.totalAmount)}
        </span>
        {summary.quotationCoveredByDeposits > 0 && (
          <span className={styles.summaryHint}>
            {t('invoices.summaryQuotationCovered', {
              amount: formatCurrency(summary.quotationCoveredByDeposits),
            })}
          </span>
        )}
      </div>
      <div className={styles.summaryCard} data-testid="summary-card-open-payable">
        <span className={styles.summaryLabel}>{t('invoices.openItems.summaryOpenPayable')}</span>
        <span className={styles.summaryCount}>{summary.openPayable.count}</span>
        <span className={`${styles.summaryAmount} ${styles.summaryAmountOpen}`}>
          {formatCurrency(summary.openPayable.totalAmount)}
        </span>
      </div>
      {summary.refundsDue.count > 0 && (
        <div className={styles.summaryCard} data-testid="summary-card-refunds-due">
          <span className={styles.summaryLabel}>{t('invoices.openItems.summaryRefundsDue')}</span>
          <span className={styles.summaryCount}>{summary.refundsDue.count}</span>
          <span className={`${styles.summaryAmount} ${styles.summaryAmountOpen}`}>
            {formatCurrency(summary.refundsDue.totalAmount)}
          </span>
          <span className={styles.summaryHint}>
            {t('invoices.openItems.summaryRefundsDueHint')}
          </span>
        </div>
      )}
      {hasOverdue && (
        <div
          className={`${styles.summaryCard} ${styles.summaryCardOverdue}`}
          data-testid="summary-card-overdue"
        >
          <span className={`${styles.summaryLabel} ${styles.summaryLabelOverdue}`}>
            {t('invoices.summaryOverdue')}
          </span>
          <span className={`${styles.summaryCount} ${styles.summaryCountOverdue}`}>
            {summary.overdue.count}
          </span>
          <span className={`${styles.summaryAmount} ${styles.summaryCountOverdue}`}>
            {t('invoices.summaryOverdueWarning', { count: summary.overdue.count })}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <PageLayout
      title={t('invoices.title')}
      action={
        <button
          type="button"
          className={sharedStyles.btnPrimary}
          onClick={openCreateModal}
          data-testid="new-invoice-button"
          aria-disabled={
            integrationStatus.paperless === null || integrationStatus.autoItemizeEnabled === null
          }
          disabled={
            integrationStatus.paperless === null || integrationStatus.autoItemizeEnabled === null
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {(integrationStatus.paperless === null ||
            integrationStatus.autoItemizeEnabled === null) && <Spinner size="sm" />}
          {t('invoices.addInvoice')}
        </button>
      }
      subNav={<SubNav tabs={BUDGET_TABS} ariaLabel="Budget section navigation" />}
    >
      {headerContent}
      <DataTable<Invoice, InvoiceDeposit>
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
        renderActions={renderActions}
        tableState={tableState}
        onStateChange={handleStateChange}
        filterMeta={filterMeta}
        disabledFilterKeys={disabledFilterKeys}
        expandableRows={expandableRows}
        customFilters={
          <div className={styles.openItemsToggleRow}>
            <label className={styles.openItemsToggle}>
              <input
                type="checkbox"
                className={styles.openItemsCheckbox}
                checked={openOnly}
                onChange={(e) => setOpenOnly(e.target.checked)}
                data-testid="open-items-toggle"
              />
              <span className={styles.openItemsLabel}>{t('invoices.openItems.toggleLabel')}</span>
            </label>
            {openOnly && !tableState.sortBy && (
              <span className={styles.defaultSortHint}>
                {t('invoices.openItems.defaultSortHint')}
              </span>
            )}
          </div>
        }
        emptyState={
          openOnly
            ? {
                message: t('invoices.openItems.empty.message')!,
                description: t('invoices.openItems.empty.description')!,
              }
            : {
                message: t('invoices.noInvoicesTitle')!,
                description: t('invoices.noInvoicesDescription')!,
                action: {
                  label: t('invoices.addFirstInvoice')!,
                  onClick: openCreateModal,
                },
              }
        }
      />

      {/* Paperless picker modal */}
      {showPaperlessPickerModal && (
        <InvoicePaperlessPickerModal
          onDocumentSelected={handlePaperlessDocumentSelected}
          onManualEntry={handlePaperlessManualEntry}
          onClose={() => setShowPaperlessPickerModal(false)}
          paperlessUrl={integrationStatus.paperless?.paperlessUrl ?? null}
        />
      )}

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
                  onWheel={(e) => e.currentTarget.blur()}
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
    </PageLayout>
  );
}

export default InvoicesPage;
