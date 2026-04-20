import { useState, useEffect, useMemo, useRef, type FormEvent } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Vendor, CreateVendorRequest, VendorListQuery } from '@cornerstone/shared';
import type { ColumnDef, TableState } from '../../components/DataTable/DataTable.js';
import { DataTable } from '../../components/DataTable/DataTable.js';
import { Modal } from '../../components/Modal/Modal.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { SubNav, type SubNavTab } from '../../components/SubNav/SubNav.js';
import { TradePicker } from '../../components/TradePicker/TradePicker.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useTrades } from '../../hooks/useTrades.js';
import { useTableState } from '../../hooks/useTableState.js';
import { useFormatters } from '../../lib/formatters.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { fetchVendors, createVendor, deleteVendor } from '../../lib/vendorsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './VendorsPage.module.css';

export function VendorsPage() {
  const { t } = useTranslation('budget');
  const { t: tSettings } = useTranslation('settings');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { trades } = useTrades();
  const { formatDate } = useFormatters();

  const settingsTabs: SubNavTab[] = [
    { labelKey: 'subnav.settings.profile', to: '/settings/profile', ns: 'common' },
    { labelKey: 'subnav.settings.manage', to: '/settings/manage', ns: 'common' },
    { labelKey: 'subnav.settings.vendors', to: '/settings/vendors', ns: 'common' },
    {
      labelKey: 'subnav.settings.userManagement',
      to: '/settings/users',
      ns: 'common',
      visible: user?.role === 'admin',
    },
    {
      labelKey: 'subnav.settings.backups',
      to: '/settings/backups',
      ns: 'common',
      visible: user?.role === 'admin',
    },
  ];

  // Data state
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Table state management with URL sync
  const { tableState, searchInput, setSearch, toApiParams, setFilter } = useTableState({
    defaultPageSize: 25,
  });
  const [searchParams, setSearchParams] = useSearchParams();

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

  // Action menu state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Form ref for submit button in modal
  const formRef = useRef<HTMLFormElement>(null);

  // Load vendors when table state changes
  useEffect(() => {
    void loadVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tableState.search,
    tableState.sortBy,
    tableState.sortDir,
    tableState.page,
    tableState.pageSize,
    tableState.filters,
  ]);

  const loadVendors = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetchVendors(toApiParams() as VendorListQuery);
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
    const knownFilterKeys = ['tradeId'];
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

  // Column definitions
  const columns = useMemo(
    (): ColumnDef<Vendor>[] => [
      {
        key: 'name',
        label: t('vendors.tableHeaders.name')!,
        sortable: true,
        sortKey: 'name',
        defaultVisible: true,
        render: (v) => (
          <Link to={`/settings/vendors/${v.id}`} className={styles.vendorLink}>
            {v.name}
          </Link>
        ),
      },
      {
        key: 'trade',
        label: t('vendors.tableHeaders.trade')!,
        sortable: true,
        sortKey: 'trade',
        defaultVisible: true,
        filterable: true,
        filterType: 'enum',
        filterParamKey: 'tradeId',
        enumOptions: trades.map((tr) => ({
          value: tr.id,
          label: getCategoryDisplayName(tSettings, tr.name, tr.translationKey),
        })),
        render: (v) =>
          v.trade ? getCategoryDisplayName(tSettings, v.trade.name, v.trade.translationKey) : '—',
      },
      {
        key: 'contactInfo',
        label: t('vendors.tableHeaders.contactInfo')!,
        sortable: false,
        defaultVisible: true,
        render: (v) => {
          const parts = [];
          if (v.phone) {
            parts.push(
              <a key="phone" href={`tel:${v.phone}`} className={styles.contactLink}>
                {v.phone}
              </a>,
            );
          }
          if (v.email) {
            parts.push(
              <a key="email" href={`mailto:${v.email}`} className={styles.contactLink}>
                {v.email}
              </a>,
            );
          }
          return parts.length > 0 ? parts.map((p, i) => [i > 0 && ', ', p]) : '—';
        },
      },
      {
        key: 'address',
        label: t('vendors.tableHeaders.address')!,
        sortable: false,
        defaultVisible: false,
        render: (v) => v.address || '—',
      },
      {
        key: 'notes',
        label: t('vendors.tableHeaders.notes')!,
        sortable: false,
        defaultVisible: false,
        render: (v) => {
          if (!v.notes) return '—';
          return v.notes.length > 60 ? `${v.notes.substring(0, 60)}...` : v.notes;
        },
      },
      {
        key: 'createdAt',
        label: t('vendors.tableHeaders.createdAt')!,
        sortable: true,
        sortKey: 'created_at',
        defaultVisible: false,
        render: (v) => formatDate(v.createdAt),
      },
      {
        key: 'updatedAt',
        label: t('vendors.tableHeaders.updatedAt')!,
        sortable: true,
        sortKey: 'updated_at',
        defaultVisible: false,
        render: (v) => formatDate(v.updatedAt ?? v.createdAt),
      },
    ],
    [t, formatDate, trades],
  );

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

  // Render actions menu
  const renderActions = (vendor: Vendor) => (
    <div className={styles.actionsMenu}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={() => setActiveMenuId(activeMenuId === vendor.id ? null : vendor.id)}
        aria-label={t('common:menu.actions')}
        data-testid={`vendor-menu-button-${vendor.id}`}
      >
        ⋮
      </button>
      {activeMenuId === vendor.id && (
        <div className={styles.menuDropdown}>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => navigate(`/settings/vendors/${vendor.id}`)}
            data-testid={`vendor-view-${vendor.id}`}
          >
            {t('vendors.buttons.view')}
          </button>
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={() => openDeleteConfirm(vendor)}
            data-testid={`vendor-delete-${vendor.id}`}
          >
            {t('vendors.buttons.delete')}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <PageLayout
      title={t('vendors.title')}
      action={
        <button
          type="button"
          className={sharedStyles.btnPrimary}
          onClick={openCreateModal}
          data-testid="new-vendor-button"
        >
          {t('vendors.addVendor')}
        </button>
      }
      subNav={<SubNav tabs={settingsTabs} ariaLabel="Settings section navigation" />}
    >
      <DataTable<Vendor>
        pageKey="vendors"
        columns={columns}
        items={vendors}
        totalItems={totalItems}
        totalPages={totalPages}
        currentPage={tableState.page}
        isLoading={isLoading}
        error={error}
        getRowKey={(v) => v.id}
        onRowClick={(v) => navigate(`/settings/vendors/${v.id}`)}
        renderActions={renderActions}
        tableState={tableState}
        onStateChange={handleStateChange}
        emptyState={{
          message: t('vendors.noVendorsTitle')!,
          description: t('vendors.noVendorsDescription')!,
          action: {
            label: t('vendors.addFirstVendor')!,
            onClick: openCreateModal,
          },
        }}
      />

      {/* Create vendor modal */}
      {showCreateModal && (
        <Modal
          title={t('vendors.modal.title')}
          onClose={closeCreateModal}
          footer={
            <>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={closeCreateModal}
                disabled={isCreating}
              >
                {t('vendors.buttons.cancel')}
              </button>
              <button
                type="button"
                className={sharedStyles.btnPrimary}
                onClick={() => formRef.current?.requestSubmit()}
                disabled={isCreating || !createForm.name.trim()}
              >
                {isCreating ? t('vendors.buttons.creating') : t('vendors.buttons.create')}
              </button>
            </>
          }
        >
          <p>{t('vendors.modal.description')}</p>

          {createError && (
            <div className={styles.errorBanner} role="alert">
              {createError}
            </div>
          )}

          <form onSubmit={handleCreateVendor} className={styles.form} noValidate ref={formRef}>
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
          </form>
        </Modal>
      )}

      {/* Delete confirmation modal */}
      {deletingVendor && (
        <Modal
          title={t('vendors.modal.deleteTitle')}
          onClose={closeDeleteConfirm}
          footer={
            <>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={closeDeleteConfirm}
                disabled={isDeleting}
              >
                {t('vendors.buttons.cancel')}
              </button>
              {!deleteError && (
                <button
                  type="button"
                  className={sharedStyles.btnConfirmDelete}
                  onClick={() => void confirmDelete()}
                  disabled={isDeleting}
                >
                  {isDeleting ? t('vendors.buttons.deleting') : t('vendors.buttons.delete')}
                </button>
              )}
            </>
          }
        >
          <p>{t('vendors.modal.deleteConfirm', { name: deletingVendor.name })}</p>
          {deleteError ? (
            <div className={styles.errorBanner} role="alert">
              {deleteError}
            </div>
          ) : (
            <p className={styles.modalWarning}>{t('vendors.modal.deleteWarning')}</p>
          )}
        </Modal>
      )}
    </PageLayout>
  );
}

export default VendorsPage;
