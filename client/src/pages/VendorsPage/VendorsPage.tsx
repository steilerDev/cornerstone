import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Vendor, CreateVendorRequest, VendorListQuery } from '@cornerstone/shared';
import { fetchVendors, createVendor, deleteVendor } from '../../lib/vendorsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { BudgetSubNav } from '../../components/BudgetSubNav/BudgetSubNav.js';
import { TradePicker } from '../../components/TradePicker/TradePicker.js';
import { useTrades } from '../../hooks/useTrades.js';
import styles from './VendorsPage.module.css';

export function VendorsPage() {
  const { t } = useTranslation('budget');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { trades } = useTrades();

  // Data state
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const pageSize = 25;

  // Search and sort from URL
  const searchQuery = searchParams.get('q') || '';
  const sortBy = (searchParams.get('sortBy') as VendorListQuery['sortBy']) || 'name';
  const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'asc';
  const urlPage = parseInt(searchParams.get('page') || '1', 10);

  // Search debounce
  const [searchInput, setSearchInput] = useState(searchQuery);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Create vendor modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateVendorRequest>({
    name: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    tradeId: null,
  });
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>('');

  // Delete confirmation state
  const [deletingVendor, setDeletingVendor] = useState<Vendor | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');

  // Sync current page with URL
  useEffect(() => {
    if (urlPage !== currentPage) {
      setCurrentPage(urlPage);
    }
  }, [urlPage, currentPage]);

  // Debounced search
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

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
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchInput, searchParams, setSearchParams]);

  // Load vendors when search/sort/page changes
  useEffect(() => {
    void loadVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, sortBy, sortOrder, currentPage]);

  const loadVendors = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetchVendors({
        page: currentPage,
        pageSize,
        q: searchQuery || undefined,
        sortBy: sortBy || undefined,
        sortOrder: sortOrder || undefined,
      });

      setVendors(response.vendors);
      setTotalPages(response.pagination.totalPages);
      setTotalItems(response.pagination.totalItems);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('vendors.errorMessage'));
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
    setCreateForm({ name: '', phone: '', email: '', address: '', notes: '', tradeId: null });
    setCreateError('');
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    if (!isCreating) {
      setShowCreateModal(false);
      setCreateError('');
    }
  };

  const handleCreateVendor = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError('');

    const trimmedName = createForm.name.trim();
    if (!trimmedName) {
      setCreateError(t('vendors.validation.nameRequired'));
      return;
    }
    if (trimmedName.length > 200) {
      setCreateError(t('vendors.validation.nameTooLong'));
      return;
    }

    setIsCreating(true);

    try {
      await createVendor({
        name: trimmedName,
        phone: createForm.phone?.trim() || null,
        email: createForm.email?.trim() || null,
        address: createForm.address?.trim() || null,
        notes: createForm.notes?.trim() || null,
        tradeId: createForm.tradeId || null,
      });
      setShowCreateModal(false);
      await loadVendors();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.error.message);
      } else {
        setCreateError(t('vendors.messages.createError'));
      }
    } finally {
      setIsCreating(false);
    }
  };

  const openDeleteConfirm = (vendor: Vendor) => {
    setDeletingVendor(vendor);
    setDeleteError('');
  };

  const closeDeleteConfirm = () => {
    if (!isDeleting) {
      setDeletingVendor(null);
      setDeleteError('');
    }
  };

  const confirmDelete = async () => {
    if (!deletingVendor) return;

    setIsDeleting(true);
    setDeleteError('');

    try {
      await deleteVendor(deletingVendor.id);
      setDeletingVendor(null);
      await loadVendors();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setDeleteError(t('vendors.modal.deleteError'));
        } else {
          setDeleteError(err.error.message);
        }
      } else {
        setDeleteError(t('vendors.messages.deleteError'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading && vendors.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>{t('vendors.title')}</h1>
          </div>
          <BudgetSubNav />
          <div className={styles.loading}>{t('vendors.loading')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{t('vendors.title')}</h1>
        </div>

        {/* Budget sub-navigation */}
        <BudgetSubNav />

        {/* Section header */}
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('vendors.sectionTitle')}</h2>
          <button type="button" className={styles.button} onClick={openCreateModal}>
            {t('vendors.addVendor')}
          </button>
        </div>

        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
            <button type="button" className={styles.retryButton} onClick={() => void loadVendors()}>
              {t('vendors.buttons.retry')}
            </button>
          </div>
        )}

        {/* Search and sort bar */}
        <div className={styles.searchCard}>
          <input
            type="search"
            placeholder={t('vendors.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={styles.searchInput}
            aria-label={t('vendors.searchAriaLabel')}
          />
          <div className={styles.sortRow}>
            <label htmlFor="sort-select" className={styles.sortLabel}>
              {t('vendors.sortBy')}
            </label>
            <select
              id="sort-select"
              value={sortBy || 'name'}
              onChange={(e) => handleSortChange(e.target.value)}
              className={styles.sortSelect}
            >
              <option value="name">{t('common:name')}</option>
              <option value="created_at">{t('vendors.dateAdded')}</option>
              <option value="updated_at">{t('vendors.lastUpdated')}</option>
            </select>
            <button
              type="button"
              className={styles.sortOrderButton}
              onClick={() => handleSortChange(sortBy || 'name')}
              aria-label="Toggle sort order"
            >
              {sortOrder === 'asc' ? t('vendors.sortAsc') : t('vendors.sortDesc')}
            </button>
          </div>
        </div>

        {/* Vendor list */}
        {vendors.length === 0 ? (
          <div className={styles.emptyState}>
            {searchQuery ? (
              <>
                <h2 className={styles.emptyTitle}>{t('vendors.noSearchResults')}</h2>
                <p className={styles.emptyText}>{t('vendors.tryDifferentSearch')}</p>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    setSearchInput('');
                    setSearchParams(new URLSearchParams());
                  }}
                >
                  {t('vendors.clearSearch')}
                </button>
              </>
            ) : (
              <>
                <h2 className={styles.emptyTitle}>{t('vendors.noVendorsTitle')}</h2>
                <p className={styles.emptyText}>{t('vendors.noVendorsDescription')}</p>
                <button type="button" className={styles.button} onClick={openCreateModal}>
                  {t('vendors.addFirstVendor')}
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
                      onClick={() => handleSortChange('name')}
                      aria-sort={
                        sortBy === 'name'
                          ? sortOrder === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      {t('common:name')}
                      {renderSortIcon('name')}
                    </th>
                    <th>{t('vendors.form.phone')}</th>
                    <th>{t('vendors.form.email')}</th>
                    <th className={styles.actionsColumn}>{t('vendors.tableHeaders.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((vendor) => (
                    <tr key={vendor.id} className={styles.tableRow}>
                      <td className={styles.nameCell}>
                        <Link to={`/budget/vendors/${vendor.id}`} className={styles.vendorLink}>
                          {vendor.name}
                        </Link>
                      </td>
                      <td>
                        {vendor.phone ? (
                          <a href={`tel:${vendor.phone}`} className={styles.contactLink}>
                            {vendor.phone}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {vendor.email ? (
                          <a href={`mailto:${vendor.email}`} className={styles.contactLink}>
                            {vendor.email}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={styles.actionsCell}>
                        <div className={styles.actionButtons}>
                          <button
                            type="button"
                            className={styles.viewButton}
                            onClick={() => navigate(`/budget/vendors/${vendor.id}`)}
                            aria-label={`View ${vendor.name}`}
                          >
                            {t('vendors.buttons.view')}
                          </button>
                          <button
                            type="button"
                            className={styles.deleteButton}
                            onClick={() => openDeleteConfirm(vendor)}
                            aria-label={`Delete ${vendor.name}`}
                          >
                            {t('vendors.buttons.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className={styles.cardsContainer}>
              {vendors.map((vendor) => (
                <div key={vendor.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <Link to={`/budget/vendors/${vendor.id}`} className={styles.cardName}>
                      {vendor.name}
                    </Link>
                  </div>
                  <div className={styles.cardBody}>
                    {vendor.phone && (
                      <div className={styles.cardRow}>
                        <span className={styles.cardLabel}>{t('vendors.form.phone')}:</span>
                        <a href={`tel:${vendor.phone}`} className={styles.contactLink}>
                          {vendor.phone}
                        </a>
                      </div>
                    )}
                    {vendor.email && (
                      <div className={styles.cardRow}>
                        <span className={styles.cardLabel}>{t('vendors.form.email')}:</span>
                        <a href={`mailto:${vendor.email}`} className={styles.contactLink}>
                          {vendor.email}
                        </a>
                      </div>
                    )}
                  </div>
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.viewButton}
                      onClick={() => navigate(`/budget/vendors/${vendor.id}`)}
                    >
                      {t('vendors.buttons.viewDetails')}
                    </button>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => openDeleteConfirm(vendor)}
                      aria-label={`Delete ${vendor.name}`}
                    >
                      {t('vendors.buttons.delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <div className={styles.paginationInfo}>
                  {t('vendors.pagination', {
                    from: (currentPage - 1) * pageSize + 1,
                    to: Math.min(currentPage * pageSize, totalItems),
                    total: totalItems,
                  })}
                </div>
                <div className={styles.paginationControls}>
                  <button
                    type="button"
                    className={styles.paginationButton}
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                  >
                    {t('vendors.previous')}
                  </button>
                  <div className={styles.paginationPages}>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          className={`${styles.paginationButton} ${
                            currentPage === pageNum ? styles.paginationButtonActive : ''
                          }`}
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
                    {t('vendors.next')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create vendor modal */}
      {showCreateModal && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeCreateModal} />
          <div className={styles.modalContent}>
            <h2 id="create-modal-title" className={styles.modalTitle}>
              {t('vendors.modal.title')}
            </h2>
            <p className={styles.modalDescription}>{t('vendors.modal.description')}</p>

            {createError && (
              <div className={styles.errorBanner} role="alert">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateVendor} className={styles.form} noValidate>
              <div className={styles.field}>
                <label htmlFor="vendor-name" className={styles.label}>
                  {t('vendors.form.name')}{' '}
                  <span className={styles.required}>{t('vendors.form.required')}</span>
                </label>
                <input
                  type="text"
                  id="vendor-name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className={styles.input}
                  placeholder={t('vendors.form.placeholders.name')}
                  maxLength={200}
                  disabled={isCreating}
                  autoFocus
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.fieldGrow}>
                  <label htmlFor="vendor-phone" className={styles.label}>
                    {t('vendors.form.phone')}
                  </label>
                  <input
                    type="tel"
                    id="vendor-phone"
                    value={createForm.phone ?? ''}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    className={styles.input}
                    placeholder={t('vendors.form.placeholders.phone')}
                    maxLength={50}
                    disabled={isCreating}
                  />
                </div>
                <div className={styles.fieldGrow}>
                  <label htmlFor="vendor-email" className={styles.label}>
                    {t('vendors.form.email')}
                  </label>
                  <input
                    type="email"
                    id="vendor-email"
                    value={createForm.email ?? ''}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    className={styles.input}
                    placeholder={t('vendors.form.placeholders.email')}
                    maxLength={255}
                    disabled={isCreating}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="vendor-address" className={styles.label}>
                  {t('vendors.form.address')}
                </label>
                <input
                  type="text"
                  id="vendor-address"
                  value={createForm.address ?? ''}
                  onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                  className={styles.input}
                  placeholder={t('vendors.form.placeholders.address')}
                  maxLength={500}
                  disabled={isCreating}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="vendor-notes" className={styles.label}>
                  {t('vendors.form.notes')}
                </label>
                <textarea
                  id="vendor-notes"
                  value={createForm.notes ?? ''}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  className={styles.textarea}
                  placeholder={t('vendors.form.placeholders.notes')}
                  rows={3}
                  disabled={isCreating}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="vendor-trade" className={styles.label}>
                  {t('vendors.form.trade')}
                </label>
                <TradePicker
                  trades={trades}
                  value={createForm.tradeId ?? ''}
                  onChange={(tradeId) => setCreateForm({ ...createForm, tradeId })}
                  disabled={isCreating}
                  placeholder={t('vendors.form.placeholders.trade')}
                />
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={closeCreateModal}
                  disabled={isCreating}
                >
                  {t('vendors.buttons.cancel')}
                </button>
                <button
                  type="submit"
                  className={styles.button}
                  disabled={isCreating || !createForm.name.trim()}
                >
                  {isCreating ? t('vendors.buttons.creating') : t('vendors.buttons.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deletingVendor && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeDeleteConfirm} />
          <div className={styles.modalContent}>
            <h2 id="delete-modal-title" className={styles.modalTitle}>
              {t('vendors.modal.deleteTitle')}
            </h2>
            <p className={styles.modalText}>
              {t('vendors.modal.deleteConfirm', { name: deletingVendor.name })}
            </p>

            {deleteError ? (
              <div className={styles.errorBanner} role="alert">
                {deleteError}
              </div>
            ) : (
              <p className={styles.modalWarning}>{t('vendors.modal.deleteWarning')}</p>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeDeleteConfirm}
                disabled={isDeleting}
              >
                {t('vendors.buttons.cancel')}
              </button>
              {!deleteError && (
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={() => void confirmDelete()}
                  disabled={isDeleting}
                >
                  {isDeleting ? t('vendors.buttons.deleting') : t('vendors.buttons.delete')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VendorsPage;
