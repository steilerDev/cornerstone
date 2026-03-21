import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { WorkItemSummary, WorkItemListQuery } from '@cornerstone/shared';
import type { ColumnDef, TableState } from '../../components/DataTable/DataTable.js';
import { DataTable } from '../../components/DataTable/DataTable.js';
import { Modal } from '../../components/Modal/Modal.js';
import { Badge, type BadgeVariantMap } from '../../components/Badge/Badge.js';
import { ProjectSubNav } from '../../components/ProjectSubNav/ProjectSubNav.js';
import { useTableState } from '../../hooks/useTableState.js';
import { useFormatters } from '../../lib/formatters.js';
import { listWorkItems, deleteWorkItem } from '../../lib/workItemsApi.js';
import { listUsers } from '../../lib/usersApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { useAreas } from '../../hooks/useAreas.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { KeyboardShortcutsHelp } from '../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import { ApiClientError } from '../../lib/apiClient.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './WorkItemsPage.module.css';

export function WorkItemsPage() {
  const { t } = useTranslation('workItems');
  const navigate = useNavigate();
  const { formatDate } = useFormatters();
  const { areas } = useAreas();

  // Data state
  const [workItems, setWorkItems] = useState<WorkItemSummary[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; displayName: string }>>([]);
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Table state management with URL sync
  const { tableState, toApiParams, setFilter } = useTableState({
    defaultPageSize: 25,
  });
  const [searchParams, setSearchParams] = useSearchParams();

  // Delete confirmation state
  const [deletingItem, setDeletingItem] = useState<WorkItemSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');

  // Actions menu state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Keyboard shortcuts state
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Load users, vendors, and areas on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [usersResponse, vendorsResponse] = await Promise.all([
          listUsers(),
          fetchVendors({ pageSize: 100 }),
        ]);
        setUsers(
          usersResponse.users
            .filter((u) => !u.deactivatedAt)
            .map((u) => ({
              id: u.id,
              displayName: u.displayName,
            })),
        );
        setVendors(vendorsResponse.vendors.map((v) => ({ id: v.id, name: v.name })));
      } catch (err) {
        console.error('Failed to load vendors or users:', err);
      }
    };
    loadData();
  }, []);

  // Load work items when table state changes
  useEffect(() => {
    void loadWorkItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tableState.search,
    tableState.sortBy,
    tableState.sortDir,
    tableState.page,
    tableState.pageSize,
    tableState.filters,
  ]);

  const loadWorkItems = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await listWorkItems(toApiParams() as WorkItemListQuery);
      setWorkItems(response.items);
      setTotalPages(response.pagination.totalPages);
      setTotalItems(response.pagination.totalItems);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('list.errors.loadFailed'));
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
    const knownFilterKeys = ['status', 'assignedUserId', 'assignedVendorId', 'areaId', 'noBudget', 'startDate', 'endDate'];
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

  const openDeleteConfirm = (item: WorkItemSummary) => {
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
      await deleteWorkItem(deletingItem.id);
      setDeletingItem(null);
      await loadWorkItems();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteError(err.error.message);
      } else {
        setDeleteError(t('list.deleteModal.title'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Work item status badge variants
  const wiStatusVariants = useMemo((): BadgeVariantMap => {
    const variants: BadgeVariantMap = {};
    const statuses: Array<'not_started' | 'in_progress' | 'completed'> = [
      'not_started',
      'in_progress',
      'completed',
    ];
    for (const status of statuses) {
      variants[status] = {
        label: t(
          `create.fields.statusOptions.${status === 'not_started' ? 'notStarted' : status === 'in_progress' ? 'inProgress' : 'completed'}`,
        ),
        className: `badge-${status}`,
      };
    }
    return variants;
  }, [t]);

  // Column definitions
  const columns = useMemo(
    (): ColumnDef<WorkItemSummary>[] => [
      {
        key: 'title',
        label: t('list.table.title'),
        sortable: true,
        sortKey: 'title',
        defaultVisible: true,
        render: (item) => (
          <Link to={`/project/work-items/${item.id}`} className={styles.itemLink}>
            {item.title}
          </Link>
        ),
      },
      {
        key: 'status',
        label: t('list.table.status'),
        sortable: true,
        sortKey: 'status',
        defaultVisible: true,
        filterable: true,
        filterType: 'enum',
        filterParamKey: 'status',
        enumOptions: [
          { value: 'not_started', label: t('create.fields.statusOptions.notStarted') },
          { value: 'in_progress', label: t('create.fields.statusOptions.inProgress') },
          { value: 'completed', label: t('create.fields.statusOptions.completed') },
        ],
        render: (item) => <Badge variants={wiStatusVariants} value={item.status} />,
      },
      {
        key: 'assignedTo',
        label: t('list.table.assignedTo'),
        sortable: false,
        defaultVisible: true,
        filterable: true,
        filterType: 'enum',
        filterParamKey: 'assignedUserId',
        enumOptions: users.map((u) => ({ value: u.id, label: u.displayName })),
        render: (item) => item.assignedUser?.displayName || '—',
      },
      {
        key: 'vendor',
        label: t('list.table.vendor'),
        sortable: false,
        defaultVisible: false,
        filterable: true,
        filterType: 'enum',
        filterParamKey: 'assignedVendorId',
        enumOptions: vendors.map((v) => ({ value: v.id, label: v.name })),
        render: (item) => item.assignedVendor?.name || '—',
      },
      {
        key: 'area',
        label: t('list.table.area'),
        sortable: false,
        defaultVisible: false,
        filterable: true,
        filterType: 'enum',
        filterParamKey: 'areaId',
        enumOptions: areas.map((a) => ({ value: a.id, label: a.name })),
        enumHierarchy: areas.map((a) => ({ id: a.id, parentId: a.parentId ?? null })),
        render: (item) => item.area?.name || '—',
      },
      {
        key: 'startDate',
        label: t('list.table.startDate'),
        sortable: true,
        sortKey: 'start_date',
        defaultVisible: true,
        filterable: true,
        filterType: 'date',
        filterParamKey: 'startDate',
        render: (item) => formatDate(item.startDate),
      },
      {
        key: 'endDate',
        label: t('list.table.endDate'),
        sortable: true,
        sortKey: 'end_date',
        defaultVisible: true,
        filterable: true,
        filterType: 'date',
        filterParamKey: 'endDate',
        render: (item) => formatDate(item.endDate),
      },
      {
        key: 'budgetLines',
        label: t('list.table.budgetLines'),
        sortable: false,
        defaultVisible: true,
        render: (item) => item.budgetLineCount,
      },
    ],
    [t, formatDate, wiStatusVariants, users, vendors, areas],
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
  const renderActions = (item: WorkItemSummary) => (
    <div className={styles.actionsMenu}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)}
        aria-label={t('list.actions.actionsMenu')}
        data-testid={`wi-menu-button-${item.id}`}
      >
        ⋮
      </button>
      {activeMenuId === item.id && (
        <div className={styles.menuDropdown}>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              navigate(`/project/work-items/${item.id}`);
              setActiveMenuId(null);
            }}
            data-testid={`wi-view-${item.id}`}
          >
            {t('list.actions.edit')}
          </button>
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={() => {
              openDeleteConfirm(item);
              setActiveMenuId(null);
            }}
            data-testid={`wi-delete-${item.id}`}
          >
            {t('list.actions.delete')}
          </button>
        </div>
      )}
    </div>
  );

  // Custom filters: noBudget (vendor, assignedTo, and area now use column-level enum filters)
  const customFilters = (
    <div className={styles.customFiltersRow}>
      <button
        type="button"
        className={`${styles.noBudgetToggle} ${
          tableState.filters.get('noBudget')?.value ? styles.noBudgetToggleActive : ''
        }`}
        onClick={() =>
          setFilter('noBudget', tableState.filters.get('noBudget')?.value ? null : 'true')
        }
        aria-pressed={!!tableState.filters.get('noBudget')?.value}
        aria-label={t('list.filters.noBudgetAriaLabel')}
      >
        {t('list.filters.noBudget')}
      </button>
    </div>
  );

  // Keyboard shortcuts (n, /, ?, Escape)
  const shortcuts = useMemo(
    () => [
      {
        key: 'n',
        handler: () => navigate('/project/work-items/new'),
        description: t('list.shortcuts.newWorkItem'),
      },
      {
        key: '/',
        handler: () => {
          const searchInput = document.querySelector<HTMLInputElement>('input[type="search"]');
          searchInput?.focus();
        },
        description: t('list.shortcuts.focusSearch'),
      },
      {
        key: '?',
        handler: () => setShowShortcutsHelp(true),
        description: t('list.shortcuts.showShortcuts'),
      },
      {
        key: 'Escape',
        handler: () => {
          if (showShortcutsHelp) {
            setShowShortcutsHelp(false);
          } else if (deletingItem) {
            closeDeleteConfirm();
          } else if (activeMenuId) {
            setActiveMenuId(null);
          }
        },
        description: t('list.shortcuts.closeOrCancel'),
      },
    ],
    [navigate, showShortcutsHelp, deletingItem, activeMenuId, t],
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>{t('list.pageTitle')}</h1>
        <button
          type="button"
          className={sharedStyles.btnPrimary}
          onClick={() => navigate('/project/work-items/new')}
          data-testid="new-work-item-button"
        >
          {t('list.newWorkItem')}
        </button>
      </div>

      <ProjectSubNav />

      <DataTable<WorkItemSummary>
        pageKey="workItems"
        columns={columns}
        items={workItems}
        totalItems={totalItems}
        totalPages={totalPages}
        currentPage={tableState.page}
        isLoading={isLoading}
        error={error}
        getRowKey={(item) => item.id}
        onRowClick={(item) => navigate(`/project/work-items/${item.id}`)}
        renderActions={renderActions}
        tableState={tableState}
        onStateChange={handleStateChange}
        customFilters={customFilters}
        emptyState={{
          message: t('list.empty.noItemsTitle'),
          description: t('list.empty.noItemsText'),
          action: {
            label: t('list.empty.createFirst'),
            onClick: () => navigate('/project/work-items/new'),
          },
        }}
      />

      {/* Delete confirmation modal */}
      {deletingItem && (
        <Modal
          title={t('list.deleteModal.title')}
          onClose={closeDeleteConfirm}
          footer={
            <>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={closeDeleteConfirm}
                disabled={isDeleting}
              >
                {t('list.deleteModal.cancel')}
              </button>
              {!deleteError && (
                <button
                  type="button"
                  className={sharedStyles.btnConfirmDelete}
                  onClick={() => void confirmDelete()}
                  disabled={isDeleting}
                >
                  {isDeleting
                    ? t('list.deleteModal.deletingLabel')
                    : t('list.deleteModal.deleteLabel')}
                </button>
              )}
            </>
          }
        >
          <p>{t('list.deleteModal.confirmation', { title: deletingItem.title })}</p>
          {deleteError ? (
            <div className={styles.errorBanner} role="alert">
              {deleteError}
            </div>
          ) : (
            <p className={styles.modalWarning}>{t('list.deleteModal.warning')}</p>
          )}
        </Modal>
      )}

      {/* Keyboard shortcuts help */}
      {showShortcutsHelp && (
        <KeyboardShortcutsHelp shortcuts={shortcuts} onClose={() => setShowShortcutsHelp(false)} />
      )}
    </div>
  );
}

export default WorkItemsPage;
