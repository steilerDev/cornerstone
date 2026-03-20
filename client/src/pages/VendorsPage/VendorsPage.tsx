import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Vendor, CreateVendorRequest, VendorListQuery } from '@cornerstone/shared';
import { fetchVendors, createVendor, deleteVendor } from '../../lib/vendorsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { BudgetSubNav } from '../../components/BudgetSubNav/BudgetSubNav.js';
import { TradePicker } from '../../components/TradePicker/TradePicker.js';
import { useTrades } from '../../hooks/useTrades.js';
import { DataTable } from '../../components/DataTable/DataTable.js';
import type { ColumnDef } from '../../components/DataTable/DataTable.js';
import { useTableState } from '../../hooks/useTableState.js';
import { useColumnPreferences } from '../../hooks/useColumnPreferences.js';
import styles from './VendorsPage.module.css';

export function VendorsPage() {
  const { t } = useTranslation('budget');
  const navigate = useNavigate();
  const { trades } = useTrades();

  // Data state
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Pagination
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const pageSize = 25;

  // Table state
  const {
    tableState,
    searchInput,
    setSearchInput,
    setSort,
    setPage,
    clearFilters,
    hasActiveFilters,
    toApiParams,
  } = useTableState({
    defaultSort: { sortBy: 'name', sortOrder: 'asc' },
    filterKeys: [],
  });

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

  // Load vendors when table state changes
  useEffect(() => {
    const loadVendors = async () => {
      setIsLoading(true);
      setError('');

      try {
        const params = toApiParams();
        const response = await fetchVendors({
          page: params.page as number,
          pageSize,
          q: (params.q as string) || undefined,
          sortBy: params.sortBy as VendorListQuery['sortBy'],
          sortOrder: params.sortOrder as 'asc' | 'desc',
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

    void loadVendors();
  }, [tableState, toApiParams, t]);

  // Column definitions
  const columns: ColumnDef<Vendor>[] = useMemo(
    () => [
      {
        key: 'name',
        label: t('common:name'),
        type: 'string',
        sortable: true,
        sortKey: 'name',
        defaultVisible: true,
        render: (item) => (
          <Link to={`/budget/vendors/${item.id}`} className={styles.vendorLink}>
            {item.name}
          </Link>
        ),
      },
      {
        key: 'phone',
        label: t('vendors.form.phone'),
        type: 'string',
        defaultVisible: true,
        render: (item) =>
          item.phone ? (
            <a href={`tel:${item.phone}`} className={styles.contactLink}>
              {item.phone}
            </a>
          ) : (
            '—'
          ),
      },
      {
        key: 'email',
        label: t('vendors.form.email'),
        type: 'string',
        defaultVisible: true,
        render: (item) =>
          item.email ? (
            <a href={`mailto:${item.email}`} className={styles.contactLink}>
              {item.email}
            </a>
          ) : (
            '—'
          ),
      },
    ],
    [t],
  );

  const { visibleColumns, toggleColumn } = useColumnPreferences('vendors', columns);

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

  const reloadVendors = async () => {
    setIsLoading(true);
    setError('');

    try {
      const params = toApiParams();
      const response = await fetchVendors({
        page: params.page as number,
        pageSize,
        q: (params.q as string) || undefined,
        sortBy: params.sortBy as VendorListQuery['sortBy'],
        sortOrder: params.sortOrder as 'asc' | 'desc',
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

  const confirmDelete = async () => {
    if (!deletingVendor) return;

    setIsDeleting(true);
    setDeleteError('');

    try {
      await deleteVendor(deletingVendor.id);
      setDeletingVendor(null);
      await reloadVendors();
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

  // Render actions for each row
  const renderActions = (item: Vendor) => (
    <div className={styles.actionButtons}>
      <button
        type="button"
        className={styles.viewButton}
        onClick={() => navigate(`/budget/vendors/${item.id}`)}
        aria-label={`View ${item.name}`}
      >
        {t('vendors.buttons.view')}
      </button>
      <button
        type="button"
        className={styles.deleteButton}
        onClick={() => openDeleteConfirm(item)}
        aria-label={`Delete ${item.name}`}
      >
        {t('vendors.buttons.delete')}
      </button>
    </div>
  );

  // Filter bar as headerContent for DataTable
  const filterBar = (
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
          value={tableState.sort.sortBy || 'name'}
          onChange={(e) => setSort(e.target.value)}
          className={styles.sortSelect}
        >
          <option value="name">{t('common:name')}</option>
          <option value="created_at">{t('vendors.dateAdded')}</option>
          <option value="updated_at">{t('vendors.lastUpdated')}</option>
        </select>
        <button
          type="button"
          className={styles.sortOrderButton}
          onClick={() => setSort(tableState.sort.sortBy || 'name')}
          aria-label="Toggle sort order"
        >
          {tableState.sort.sortOrder === 'asc' ? t('vendors.sortAsc') : t('vendors.sortDesc')}
        </button>
      </div>
    </div>
  );

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
          </div>
        )}

        <DataTable<Vendor>
          pageKey="vendors"
          columns={columns}
          items={vendors}
          totalItems={totalItems}
          totalPages={totalPages}
          currentPage={tableState.page}
          pageSize={pageSize}
          isLoading={isLoading}
          getRowKey={(item) => item.id}
          onRowClick={(item) => navigate(`/budget/vendors/${item.id}`)}
          renderActions={renderActions}
          tableState={tableState}
          onSortChange={setSort}
          onPageChange={setPage}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
          headerContent={filterBar}
          hasActiveFilters={hasActiveFilters}
          getCardTitle={(item) => item.name}
          emptyState={{
            noData: {
              title: t('vendors.noVendorsTitle'),
              description: t('vendors.noVendorsDescription'),
              action: (
                <button type="button" className={styles.button} onClick={openCreateModal}>
                  {t('vendors.addFirstVendor')}
                </button>
              ),
            },
            noResults: {
              title: t('vendors.noSearchResults'),
              description: t('vendors.tryDifferentSearch'),
              action: (
                <button type="button" className={styles.secondaryButton} onClick={clearFilters}>
                  {t('vendors.clearSearch')}
                </button>
              ),
            },
          }}
        />
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
