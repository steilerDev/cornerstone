import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import type {
  Invoice,
  InvoiceSummary,
  InvoiceStatus,
  CreateInvoiceRequest,
} from '@cornerstone/shared';
import { fetchAllInvoices, createInvoice } from '../../lib/invoicesApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { fetchWorkItemBudgets } from '../../lib/workItemBudgetsApi.js';
import { listWorkItems } from '../../lib/workItemsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { BudgetSubNav } from '../../components/BudgetSubNav/BudgetSubNav.js';
import type { WorkItemSummary, WorkItemBudgetLine } from '@cornerstone/shared';
import styles from './InvoicesPage.module.css';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  claimed: 'Claimed',
};

interface InvoiceFormState {
  vendorId: string;
  invoiceNumber: string;
  amount: string;
  date: string;
  dueDate: string;
  status: InvoiceStatus;
  notes: string;
  selectedWorkItemId: string;
  workItemBudgetId: string;
}

const EMPTY_FORM: InvoiceFormState = {
  vendorId: '',
  invoiceNumber: '',
  amount: '',
  date: '',
  dueDate: '',
  status: 'pending',
  notes: '',
  selectedWorkItemId: '',
  workItemBudgetId: '',
};

export function InvoicesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<InvoiceSummary>({
    pending: { count: 0, totalAmount: 0 },
    paid: { count: 0, totalAmount: 0 },
    claimed: { count: 0, totalAmount: 0 },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const pageSize = 25;

  // Filter/sort state from URL
  const searchQuery = searchParams.get('q') || '';
  const statusFilter = (searchParams.get('status') as InvoiceStatus | '') || '';
  const vendorFilter = searchParams.get('vendorId') || '';
  const sortBy = searchParams.get('sortBy') || 'date';
  const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc';
  const urlPage = parseInt(searchParams.get('page') || '1', 10);

  const [searchInput, setSearchInput] = useState(searchQuery);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Vendor list for filter dropdown + create modal
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<InvoiceFormState>(EMPTY_FORM);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [workItems, setWorkItems] = useState<WorkItemSummary[]>([]);
  const [budgetLines, setBudgetLines] = useState<WorkItemBudgetLine[]>([]);
  const [budgetLinesLoading, setBudgetLinesLoading] = useState(false);

  useEffect(() => {
    if (urlPage !== currentPage) setCurrentPage(urlPage);
  }, [urlPage, currentPage]);

  useEffect(() => {
    void fetchVendors({ pageSize: 100 }).then((res) =>
      setVendors(res.vendors.map((v) => ({ id: v.id, name: v.name }))),
    );
    void listWorkItems({ pageSize: 100 }).then((res) => setWorkItems(res.items));
  }, []);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      const newParams = new URLSearchParams(searchParams);
      if (searchInput) {
        newParams.set('q', searchInput);
      } else {
        newParams.delete('q');
      }
      newParams.set('page', '1');
      setSearchParams(newParams);
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchInput, searchParams, setSearchParams]);

  useEffect(() => {
    void loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, statusFilter, vendorFilter, sortBy, sortOrder, currentPage]);

  const loadInvoices = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetchAllInvoices({
        page: currentPage,
        pageSize,
        q: searchQuery || undefined,
        status: (statusFilter as InvoiceStatus) || undefined,
        vendorId: vendorFilter || undefined,
        sortBy: sortBy || undefined,
        sortOrder: sortOrder || undefined,
      });
      setInvoices(response.invoices);
      setSummary(response.summary);
      setTotalPages(response.pagination.totalPages);
      setTotalItems(response.pagination.totalItems);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to load invoices. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = (page: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', page.toString());
    setSearchParams(newParams);
  };

  const handleSortChange = (field: string) => {
    const newOrder = sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc';
    const newParams = new URLSearchParams(searchParams);
    newParams.set('sortBy', field);
    newParams.set('sortOrder', newOrder);
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const renderSortIcon = (field: string) => {
    if (sortBy !== field) return null;
    return sortOrder === 'asc' ? ' ↑' : ' ↓';
  };

  const openCreateModal = () => {
    setCreateForm(EMPTY_FORM);
    setCreateError('');
    setBudgetLines([]);
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
      setCreateError('Please select a vendor.');
      return;
    }
    const amount = parseFloat(createForm.amount);
    if (isNaN(amount) || amount <= 0) {
      setCreateError('Amount must be a positive number.');
      return;
    }
    if (!createForm.date) {
      setCreateError('Invoice date is required.');
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
        workItemBudgetId: createForm.workItemBudgetId || null,
      };
      await createInvoice(createForm.vendorId, data);
      setShowCreateModal(false);
      await loadInvoices();
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

  const isFiltered = !!(searchQuery || statusFilter || vendorFilter);

  if (isLoading && invoices.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Budget</h1>
          </div>
          <BudgetSubNav />
          <div className={styles.loading}>Loading invoices...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Budget</h1>
        </div>

        <BudgetSubNav />

        {/* Summary cards */}
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Pending</span>
            <span className={styles.summaryCount}>{summary.pending.count}</span>
            <span className={styles.summaryAmount}>{formatCurrency(summary.pending.totalAmount)}</span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Paid</span>
            <span className={styles.summaryCount}>{summary.paid.count}</span>
            <span className={`${styles.summaryAmount} ${styles.summaryAmountPaid}`}>
              {formatCurrency(summary.paid.totalAmount)}
            </span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Claimed</span>
            <span className={styles.summaryCount}>{summary.claimed.count}</span>
            <span className={styles.summaryAmount}>{formatCurrency(summary.claimed.totalAmount)}</span>
          </div>
        </div>

        {/* Section header */}
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Invoices</h2>
          <button type="button" className={styles.button} onClick={openCreateModal}>
            Add Invoice
          </button>
        </div>

        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => void loadInvoices()}
            >
              Retry
            </button>
          </div>
        )}

        {/* Filter bar */}
        <div className={styles.filterCard}>
          <input
            type="search"
            placeholder="Search by invoice number..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={styles.searchInput}
            aria-label="Search invoices"
          />
          <div className={styles.filterRow}>
            <select
              value={statusFilter}
              onChange={(e) => {
                const newParams = new URLSearchParams(searchParams);
                if (e.target.value) {
                  newParams.set('status', e.target.value);
                } else {
                  newParams.delete('status');
                }
                newParams.set('page', '1');
                setSearchParams(newParams);
              }}
              className={styles.filterSelect}
              aria-label="Filter by status"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="claimed">Claimed</option>
            </select>
            <select
              value={vendorFilter}
              onChange={(e) => {
                const newParams = new URLSearchParams(searchParams);
                if (e.target.value) {
                  newParams.set('vendorId', e.target.value);
                } else {
                  newParams.delete('vendorId');
                }
                newParams.set('page', '1');
                setSearchParams(newParams);
              }}
              className={styles.filterSelect}
              aria-label="Filter by vendor"
            >
              <option value="">All Vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <div className={styles.sortControls}>
              <label htmlFor="sort-select" className={styles.sortLabel}>
                Sort:
              </label>
              <select
                id="sort-select"
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value)}
                className={styles.filterSelect}
              >
                <option value="date">Date</option>
                <option value="amount">Amount</option>
                <option value="status">Status</option>
                <option value="vendor_name">Vendor</option>
                <option value="due_date">Due Date</option>
              </select>
              <button
                type="button"
                className={styles.sortOrderButton}
                onClick={() => handleSortChange(sortBy)}
                aria-label="Toggle sort order"
              >
                {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
              </button>
            </div>
          </div>
        </div>

        {/* List or empty state */}
        {invoices.length === 0 ? (
          <div className={styles.emptyState}>
            {isFiltered ? (
              <>
                <h2 className={styles.emptyTitle}>No invoices match your filters</h2>
                <p className={styles.emptyText}>
                  Try different filters or clear them to see all invoices.
                </p>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setSearchInput('');
                    setSearchParams(new URLSearchParams());
                  }}
                >
                  Clear Filters
                </button>
              </>
            ) : (
              <>
                <h2 className={styles.emptyTitle}>No invoices yet</h2>
                <p className={styles.emptyText}>
                  Add your first invoice to start tracking vendor payments.
                </p>
                <button type="button" className={styles.button} onClick={openCreateModal}>
                  Add First Invoice
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th
                      className={styles.sortableHeader}
                      onClick={() => handleSortChange('date')}
                      aria-sort={
                        sortBy === 'date'
                          ? sortOrder === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      Date{renderSortIcon('date')}
                    </th>
                    <th>Invoice #</th>
                    <th
                      className={styles.sortableHeader}
                      onClick={() => handleSortChange('vendor_name')}
                      aria-sort={
                        sortBy === 'vendor_name'
                          ? sortOrder === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      Vendor{renderSortIcon('vendor_name')}
                    </th>
                    <th
                      className={`${styles.sortableHeader} ${styles.amountHeader}`}
                      onClick={() => handleSortChange('amount')}
                      aria-sort={
                        sortBy === 'amount'
                          ? sortOrder === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      Amount{renderSortIcon('amount')}
                    </th>
                    <th
                      className={styles.sortableHeader}
                      onClick={() => handleSortChange('due_date')}
                      aria-sort={
                        sortBy === 'due_date'
                          ? sortOrder === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      Due Date{renderSortIcon('due_date')}
                    </th>
                    <th
                      className={styles.sortableHeader}
                      onClick={() => handleSortChange('status')}
                      aria-sort={
                        sortBy === 'status'
                          ? sortOrder === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      Status{renderSortIcon('status')}
                    </th>
                    <th className={styles.actionsColumn}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className={styles.tableRow}>
                      <td>{formatDate(invoice.date)}</td>
                      <td className={styles.invoiceNumberCell}>
                        {invoice.invoiceNumber ? (
                          <Link
                            to={`/budget/invoices/${invoice.id}`}
                            className={styles.invoiceLink}
                          >
                            {invoice.invoiceNumber}
                          </Link>
                        ) : (
                          <Link
                            to={`/budget/invoices/${invoice.id}`}
                            className={`${styles.invoiceLink} ${styles.invoiceLinkNoNumber}`}
                          >
                            &mdash;
                          </Link>
                        )}
                      </td>
                      <td>
                        <Link
                          to={`/budget/vendors/${invoice.vendorId}`}
                          className={styles.vendorLink}
                        >
                          {invoice.vendorName}
                        </Link>
                      </td>
                      <td className={styles.amountCell}>{formatCurrency(invoice.amount)}</td>
                      <td>{invoice.dueDate ? formatDate(invoice.dueDate) : '\u2014'}</td>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${styles[`status_${invoice.status}`]}`}
                        >
                          {STATUS_LABELS[invoice.status]}
                        </span>
                      </td>
                      <td className={styles.actionsCell}>
                        <Link
                          to={`/budget/invoices/${invoice.id}`}
                          className={styles.viewButton}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className={styles.cardsContainer}>
              {invoices.map((invoice) => (
                <div key={invoice.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div className={styles.cardLeft}>
                      <Link
                        to={`/budget/invoices/${invoice.id}`}
                        className={styles.cardInvoiceNumber}
                      >
                        {invoice.invoiceNumber ? `#${invoice.invoiceNumber}` : 'No Number'}
                      </Link>
                      <Link
                        to={`/budget/vendors/${invoice.vendorId}`}
                        className={styles.cardVendorName}
                      >
                        {invoice.vendorName}
                      </Link>
                    </div>
                    <span
                      className={`${styles.statusBadge} ${styles[`status_${invoice.status}`]}`}
                    >
                      {STATUS_LABELS[invoice.status]}
                    </span>
                  </div>
                  <div className={styles.cardMeta}>
                    <span className={styles.cardAmount}>{formatCurrency(invoice.amount)}</span>
                    <span className={styles.cardDate}>{formatDate(invoice.date)}</span>
                    {invoice.dueDate && (
                      <span className={styles.cardDue}>Due: {formatDate(invoice.dueDate)}</span>
                    )}
                  </div>
                  <div className={styles.cardActions}>
                    <Link
                      to={`/budget/invoices/${invoice.id}`}
                      className={styles.viewButton}
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <div className={styles.paginationInfo}>
                  Showing {(currentPage - 1) * pageSize + 1} to{' '}
                  {Math.min(currentPage * pageSize, totalItems)} of {totalItems} invoices
                </div>
                <div className={styles.paginationControls}>
                  <button
                    type="button"
                    className={styles.paginationButton}
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                  >
                    Previous
                  </button>
                  <div className={styles.paginationPages}>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) pageNum = i + 1;
                      else if (currentPage <= 3) pageNum = i + 1;
                      else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                      else pageNum = currentPage - 2 + i;
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          className={`${styles.paginationButton} ${currentPage === pageNum ? styles.paginationButtonActive : ''}`}
                          onClick={() => handlePageChange(pageNum)}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className={styles.paginationButton}
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    aria-label="Next page"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
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
              Add Invoice
            </h2>
            {createError && (
              <div className={styles.errorBanner} role="alert">
                {createError}
              </div>
            )}
            <form onSubmit={handleCreateInvoice} className={styles.form} noValidate>
              <div className={styles.field}>
                <label htmlFor="create-vendor" className={styles.label}>
                  Vendor <span className={styles.required}>*</span>
                </label>
                <select
                  id="create-vendor"
                  value={createForm.vendorId}
                  onChange={(e) => setCreateForm({ ...createForm, vendorId: e.target.value })}
                  className={styles.select}
                  disabled={isCreating}
                  required
                >
                  <option value="">Select a vendor...</option>
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
                  <option value="claimed">Claimed</option>
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="create-work-item" className={styles.label}>
                  Link to Work Item
                </label>
                <select
                  id="create-work-item"
                  value={createForm.selectedWorkItemId}
                  onChange={(e) => {
                    const workItemId = e.target.value;
                    setCreateForm({ ...createForm, selectedWorkItemId: workItemId, workItemBudgetId: '' });
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
                  disabled={isCreating}
                >
                  <option value="">None</option>
                  {workItems.map((wi) => (
                    <option key={wi.id} value={wi.id}>
                      {wi.title}
                    </option>
                  ))}
                </select>
              </div>

              {createForm.selectedWorkItemId && (
                <div className={styles.field}>
                  <label htmlFor="create-budget-line" className={styles.label}>
                    Budget Line
                  </label>
                  <select
                    id="create-budget-line"
                    value={createForm.workItemBudgetId}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, workItemBudgetId: e.target.value })
                    }
                    className={styles.select}
                    disabled={isCreating || budgetLinesLoading}
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
                  className={styles.button}
                  disabled={isCreating || !createForm.vendorId || !createForm.amount || !createForm.date}
                >
                  {isCreating ? 'Adding...' : 'Add Invoice'}
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
