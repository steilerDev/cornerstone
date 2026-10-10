import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Vendor, VendorListItem, VendorListQuery } from '@cornerstone/shared';
import type { ColumnDef, TableState } from '../../components/DataTable/DataTable.js';
import { DataTable } from '../../components/DataTable/DataTable.js';
import { dataTableTestId } from '../../components/DataTable/dataTableTestId.js';
import type { DataTableSurface } from '../../components/DataTable/dataTableTestId.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { VendorCreateModal } from '../../components/VendorCreateModal/VendorCreateModal.js';
import { useTrades } from '../../hooks/useTrades.js';
import { useTableState } from '../../hooks/useTableState.js';
import { useFormatters } from '../../lib/formatters.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { fetchVendors, deleteVendor } from '../../lib/vendorsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import sharedStyles from '../../styles/shared.module.css';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import styles from './VendorsPage.module.css';
import { routeUrl } from '@cornerstone/shared';

export function VendorsPage() {
  const { t } = useTranslation('budget');
  const { t: tCommon } = useTranslation('common');
  useDocumentTitle(tCommon('navigation.companies'));
  const { t: tErrors } = useTranslation('errors');
  const { t: tSettings } = useTranslation('settings');
  const navigate = useNavigate();
  const { trades } = useTrades();
  const { formatDate } = useFormatters();

  // Data state
  const [vendors, setVendors] = useState<VendorListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Table state management with URL sync
  const {
    tableState,
    searchInput: _searchInput,
    setSearch: _setSearch,
    toApiParams,
    setFilter: _setFilter,
  } = useTableState({
    defaultPageSize: 25,
  });
  const [searchParams, setSearchParams] = useSearchParams();

  // Create vendor modal state
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Delete confirmation state
  const [deletingVendor, setDeletingVendor] = useState<Vendor | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const deleteImpact = useDeleteImpact('vendor', deletingVendor?.id ?? null);

  // Action menu state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Load vendors when table state changes
  useEffect(() => {
    void loadVendors();
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- loadVendors is defined in the component body; the effect responds to tableState changes which is the intended trigger
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
        setError(translateApiError(err.error.code, tErrors));
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

  const openCreateModal = () => setShowCreateModal(true);

  const openDeleteConfirm = (vendor: Vendor) => {
    setDeletingVendor(vendor);
    setDeleteError('');
    setDeleteBlocked(false);
  };

  const closeDeleteConfirm = () => {
    if (!isDeleting) {
      setDeletingVendor(null);
      setDeleteError('');
      setDeleteBlocked(false);
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
        setDeleteBlocked(err.statusCode === 409);
        if (err.statusCode === 409) {
          setDeleteError(t('vendors.modal.deleteError'));
        } else {
          setDeleteError(translateApiError(err.error.code, tErrors));
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
    (): ColumnDef<VendorListItem>[] => [
      {
        key: 'name',
        label: t('vendors.tableHeaders.name')!,
        sortable: true,
        sortKey: 'name',
        defaultVisible: true,
        render: (v) => (
          <Link to={routeUrl('vendor', { id: v.id })} className={styles.vendorLink}>
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
          const phone = v.phone?.trim() ? v.phone : (v.firstContactPhone ?? null);
          if (phone) {
            parts.push(
              <a key="phone" href={`tel:${phone}`} className={styles.contactLink}>
                {phone}
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
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- tSettings (likely intended as t/tSettings) is a stable i18n function; adding it would re-run on locale-function identity changes
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
  const renderActions = (vendor: Vendor, surface: DataTableSurface) => (
    <div className={styles.actionsMenu}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={() => setActiveMenuId(activeMenuId === vendor.id ? null : vendor.id)}
        aria-label={t('common:actions')}
        data-testid={dataTableTestId('vendor-menu-button', vendor.id, surface)}
      >
        ⋮
      </button>
      {activeMenuId === vendor.id && (
        <div className={styles.menuDropdown}>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => navigate(routeUrl('vendor', { id: vendor.id }))}
            data-testid={dataTableTestId('vendor-view', vendor.id, surface)}
          >
            {t('vendors.buttons.view')}
          </button>
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={() => openDeleteConfirm(vendor)}
            data-testid={dataTableTestId('vendor-delete', vendor.id, surface)}
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
    >
      <DataTable<VendorListItem>
        pageKey="vendors"
        columns={columns}
        items={vendors}
        totalItems={totalItems}
        totalPages={totalPages}
        currentPage={tableState.page}
        isLoading={isLoading}
        error={error}
        getRowKey={(v) => v.id}
        onRowClick={(v) => navigate(routeUrl('vendor', { id: v.id }))}
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
        <VendorCreateModal
          onCreated={() => {
            setShowCreateModal(false);
            void loadVendors();
          }}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Delete confirmation */}
      {deletingVendor && (
        <ConfirmDialog
          title={tCommon('confirmDialog.deleteTitle', { name: deletingVendor.name })}
          consequences={deleteImpact}
          irreversible
          confirmLabel={tCommon('button.delete')}
          busyLabel={tCommon('confirmDialog.deleting')}
          busy={isDeleting}
          blocked={deleteBlocked}
          error={deleteError || null}
          onConfirm={() => void confirmDelete()}
          onCancel={closeDeleteConfirm}
          testIdPrefix="vendor-list-delete"
        />
      )}
    </PageLayout>
  );
}

export default VendorsPage;
