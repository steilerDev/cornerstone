import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { HouseholdItemSummary, HouseholdItemListQuery, FilterMeta } from '@cornerstone/shared';
import type { ColumnDef, TableState } from '../../components/DataTable/DataTable.js';
import { DataTable } from '../../components/DataTable/DataTable.js';
import { Modal } from '../../components/Modal/Modal.js';
import { Badge, type BadgeVariantMap } from '../../components/Badge/Badge.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { SubNav, type SubNavTab } from '../../components/SubNav/SubNav.js';
import { useTableState } from '../../hooks/useTableState.js';
import { useFormatters } from '../../lib/formatters.js';
import { listHouseholdItems, deleteHouseholdItem } from '../../lib/householdItemsApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { fetchHouseholdItemCategories } from '../../lib/householdItemCategoriesApi.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { useAreas } from '../../hooks/useAreas.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { AreaBreadcrumb } from '../../components/AreaBreadcrumb/index.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './HouseholdItemsPage.module.css';

const PROJECT_TABS: SubNavTab[] = [
  { labelKey: 'subnav.project.overview', to: '/project/overview' },
  { labelKey: 'subnav.project.workItems', to: '/project/work-items' },
  { labelKey: 'subnav.project.householdItems', to: '/project/household-items' },
  { labelKey: 'subnav.project.milestones', to: '/project/milestones' },
];

export function HouseholdItemsPage() {
  const { t } = useTranslation('householdItems');
  const { t: tSettings } = useTranslation('settings');
  const navigate = useNavigate();
  const { formatCurrency, formatDate } = useFormatters();
  const { areas } = useAreas();

  // Data state
  const [householdItems, setHouseholdItems] = useState<HouseholdItemSummary[]>([]);
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string; translationKey: string | null }>
  >([]);
  const [filterMeta, setFilterMeta] = useState<FilterMeta>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Table state management with URL sync
  const { tableState, toApiParams } = useTableState({
    defaultPageSize: 25,
  });
  const [searchParams, setSearchParams] = useSearchParams();

  // Delete confirmation state
  const [deletingItem, setDeletingItem] = useState<HouseholdItemSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');

  // Actions menu state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Load vendors, categories, and areas on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [vendorsResponse, categoriesResponse] = await Promise.all([
          fetchVendors({ pageSize: 100 }),
          fetchHouseholdItemCategories(),
        ]);
        setVendors(vendorsResponse.vendors.map((v) => ({ id: v.id, name: v.name })));
        setCategories(
          categoriesResponse.categories.map((c) => ({
            id: c.id,
            name: c.name,
            translationKey: c.translationKey,
          })),
        );
      } catch (err) {
        console.error('Failed to load vendors or categories:', err);
      }
    };
    loadData();
  }, []);

  // Load household items when table state changes
  useEffect(() => {
    void loadHouseholdItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tableState.search,
    tableState.sortBy,
    tableState.sortDir,
    tableState.page,
    tableState.pageSize,
    tableState.filters,
  ]);

  const loadHouseholdItems = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await listHouseholdItems(toApiParams() as HouseholdItemListQuery);
      setHouseholdItems(response.items);
      setFilterMeta(response.filterMeta ?? {});
      setTotalPages(response.pagination.totalPages);
      setTotalItems(response.pagination.totalItems);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('error'));
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
    const knownFilterKeys = [
      'category',
      'status',
      'vendorId',
      'areaId',
      'targetDelivery',
      'actualDelivery',
      'plannedCost',
      'actualCost',
      'budgetLines',
    ];
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

  const openDeleteConfirm = (item: HouseholdItemSummary) => {
    setDeletingItem(item);
    setDeleteError('');
  };

  const closeDeleteConfirm = () => {
    if (!isDeleting) {
      setDeletingItem(null);
      setDeleteError('');
    }
  };

  const confirmDelete = async () => {
    if (!deletingItem) return;

    setIsDeleting(true);
    setDeleteError('');

    try {
      await deleteHouseholdItem(deletingItem.id);
      setDeletingItem(null);
      await loadHouseholdItems();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteError(err.error.message);
      } else {
        setDeleteError(t('deleteError'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Household item status badge variants
  const hiStatusVariants = useMemo((): BadgeVariantMap => {
    const variants: BadgeVariantMap = {};
    const statuses: Array<'planned' | 'purchased' | 'scheduled' | 'arrived'> = [
      'planned',
      'purchased',
      'scheduled',
      'arrived',
    ];
    for (const status of statuses) {
      variants[status] = {
        label: t(`status.${status}`),
        className: `badge-${status}`,
      };
    }
    return variants;
  }, [t]);

  // Column definitions
  const columns = useMemo(
    (): ColumnDef<HouseholdItemSummary>[] => [
      {
        key: 'name',
        label: t('table.headers.name'),
        sortable: true,
        sortKey: 'name',
        defaultVisible: true,
        render: (item) => (
          <div className={styles.titleCell}>
            <Link to={`/project/household-items/${item.id}`} className={styles.itemLink}>
              {item.name}
            </Link>
            <AreaBreadcrumb area={item.area ?? null} variant="compact" />
          </div>
        ),
      },
      {
        key: 'category',
        label: t('table.headers.category'),
        sortable: true,
        sortKey: 'category',
        defaultVisible: true,
        filterable: true,
        filterType: 'enum',
        filterParamKey: 'category',
        enumOptions: categories.map((c) => ({
          value: c.id,
          label: getCategoryDisplayName(tSettings, c.name, c.translationKey),
        })),
        render: (item) => {
          const cat = categories.find((c) => c.id === item.category);
          return cat
            ? getCategoryDisplayName(tSettings, cat.name, cat.translationKey)
            : item.category;
        },
      },
      {
        key: 'status',
        label: t('table.headers.status'),
        sortable: true,
        sortKey: 'status',
        defaultVisible: true,
        filterable: true,
        filterType: 'enum',
        filterParamKey: 'status',
        enumOptions: [
          { value: 'planned', label: t('status.planned') },
          { value: 'purchased', label: t('status.purchased') },
          { value: 'scheduled', label: t('status.scheduled') },
          { value: 'arrived', label: t('status.arrived') },
        ],
        render: (item) => <Badge variants={hiStatusVariants} value={item.status} />,
      },
      {
        key: 'area',
        label: t('table.headers.area'),
        sortable: false,
        defaultVisible: true,
        filterable: true,
        filterType: 'enum',
        filterParamKey: 'areaId',
        enumOptions: areas.map((a) => ({ value: a.id, label: a.name })),
        enumHierarchy: areas.map((a) => ({ id: a.id, parentId: a.parentId ?? null })),
        render: (item) => item.area?.name || '—',
      },
      {
        key: 'vendor',
        label: t('table.headers.vendor'),
        sortable: false,
        defaultVisible: true,
        filterable: true,
        filterType: 'enum',
        filterParamKey: 'vendorId',
        enumOptions: vendors.map((v) => ({ value: v.id, label: v.name })),
        render: (item) => item.vendor?.name || '—',
      },
      {
        key: 'plannedCost',
        label: t('table.headers.plannedCost'),
        sortable: false,
        defaultVisible: true,
        filterable: true,
        filterType: 'number' as const,
        filterParamKey: 'plannedCost',
        numberMin: 0,
        numberStep: 0.01,
        render: (item) => formatCurrency(item.totalPlannedAmount),
      },
      {
        key: 'targetDelivery',
        label: t('table.headers.targetDelivery'),
        sortable: true,
        sortKey: 'target_delivery_date',
        defaultVisible: true,
        filterable: true,
        filterType: 'date',
        filterParamKey: 'targetDelivery',
        render: (item) => formatDate(item.targetDeliveryDate),
      },
      {
        key: 'actualDelivery',
        label: t('table.headers.actualDelivery'),
        sortable: true,
        sortKey: 'actual_delivery_date',
        defaultVisible: false,
        filterable: true,
        filterType: 'date',
        filterParamKey: 'actualDelivery',
        render: (item) => (item.actualDeliveryDate ? formatDate(item.actualDeliveryDate) : '—'),
      },
      {
        key: 'actualCost',
        label: t('table.headers.actualCost'),
        sortable: false,
        defaultVisible: false,
        filterable: true,
        filterType: 'number' as const,
        filterParamKey: 'actualCost',
        numberMin: 0,
        numberStep: 0.01,
        render: (item) => formatCurrency(item.budgetSummary?.totalActual ?? 0),
      },
      {
        key: 'subsidyReduction',
        label: t('table.headers.subsidyReduction'),
        sortable: false,
        defaultVisible: false,
        filterable: true,
        filterType: 'number' as const,
        getValue: (item) => item.budgetSummary?.subsidyReduction ?? 0,
        numberMin: 0,
        numberStep: 0.01,
        render: (item) => formatCurrency(item.budgetSummary?.subsidyReduction ?? 0),
      },
      {
        key: 'netCost',
        label: t('table.headers.netCost'),
        sortable: false,
        defaultVisible: false,
        filterable: true,
        filterType: 'number' as const,
        getValue: (item) => item.budgetSummary?.netCost ?? 0,
        numberMin: 0,
        numberStep: 0.01,
        render: (item) => formatCurrency(item.budgetSummary?.netCost ?? 0),
      },
      {
        key: 'orderDate',
        label: t('table.headers.orderDate'),
        sortable: true,
        sortKey: 'order_date',
        defaultVisible: false,
        render: (item) => (item.orderDate ? formatDate(item.orderDate) : '—'),
      },
      {
        key: 'budgetLines',
        label: t('table.headers.budgetLines'),
        sortable: false,
        defaultVisible: false,
        filterable: true,
        filterType: 'number' as const,
        filterParamKey: 'budgetLines',
        numberMin: 0,
        numberStep: 1,
        render: (item) => item.budgetLineCount,
      },
    ],
    [t, categories, formatCurrency, formatDate, hiStatusVariants, vendors, areas],
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
  const renderActions = (item: HouseholdItemSummary) => (
    <div className={styles.actionsMenu}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)}
        aria-label={t('menu.actions', { name: item.name })}
        data-testid={`hi-menu-button-${item.id}`}
      >
        ⋮
      </button>
      {activeMenuId === item.id && (
        <div className={styles.menuDropdown}>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              navigate(`/project/household-items/${item.id}`);
              setActiveMenuId(null);
            }}
            data-testid={`hi-view-${item.id}`}
          >
            {t('menu.edit')}
          </button>
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={() => {
              openDeleteConfirm(item);
              setActiveMenuId(null);
            }}
            data-testid={`hi-delete-${item.id}`}
          >
            {t('menu.delete')}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <PageLayout
      title={t('page.title')}
      action={
        <button
          type="button"
          className={sharedStyles.btnPrimary}
          onClick={() => navigate('/project/household-items/new')}
          data-testid="new-household-item-button"
        >
          {t('newButton')}
        </button>
      }
      subNav={<SubNav tabs={PROJECT_TABS} ariaLabel="Project section navigation" />}
    >
      <DataTable<HouseholdItemSummary>
        pageKey="householdItems"
        columns={columns}
        items={householdItems}
        totalItems={totalItems}
        totalPages={totalPages}
        currentPage={tableState.page}
        isLoading={isLoading}
        error={error}
        getRowKey={(item) => item.id}
        onRowClick={(item) => navigate(`/project/household-items/${item.id}`)}
        renderActions={renderActions}
        tableState={tableState}
        onStateChange={handleStateChange}
        filterMeta={filterMeta}
        emptyState={{
          message: t('empty.noItems'),
          description: t('empty.noItemsMessage'),
          action: {
            label: t('empty.createFirstItem'),
            onClick: () => navigate('/project/household-items/new'),
          },
        }}
      />

      {/* Delete confirmation modal */}
      {deletingItem && (
        <Modal
          title={t('delete.confirm')}
          onClose={closeDeleteConfirm}
          footer={
            <>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={closeDeleteConfirm}
                disabled={isDeleting}
              >
                {t('delete.cancel')}
              </button>
              {!deleteError && (
                <button
                  type="button"
                  className={sharedStyles.btnConfirmDelete}
                  onClick={() => void confirmDelete()}
                  disabled={isDeleting}
                >
                  {isDeleting ? t('delete.deleting') : t('delete.delete')}
                </button>
              )}
            </>
          }
        >
          <p>
            {t('delete.message')} &quot;<strong>{deletingItem.name}</strong>&quot;?
          </p>
          {deleteError ? (
            <div className={styles.errorBanner} role="alert">
              {deleteError}
            </div>
          ) : (
            <p className={styles.modalWarning}>{t('delete.warning')}</p>
          )}
        </Modal>
      )}
    </PageLayout>
  );
}

export default HouseholdItemsPage;
