import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { WorkItemSummary, WorkItemStatus, UserResponse } from '@cornerstone/shared';
import { listWorkItems, deleteWorkItem } from '../../lib/workItemsApi.js';
import { listUsers } from '../../lib/usersApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { useAreas } from '../../hooks/useAreas.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { Badge } from '../../components/Badge/Badge.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { KeyboardShortcutsHelp } from '../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import { useFormatters } from '../../lib/formatters.js';
import { ProjectSubNav } from '../../components/ProjectSubNav/ProjectSubNav.js';
import { AreaPicker } from '../../components/AreaPicker/AreaPicker.js';
import { DataTable } from '../../components/DataTable/DataTable.js';
import type { ColumnDef } from '../../components/DataTable/DataTable.js';
import { useTableState } from '../../hooks/useTableState.js';
import { useColumnPreferences } from '../../hooks/useColumnPreferences.js';
import styles from './WorkItemsPage.module.css';

export function WorkItemsPage() {
  const { formatDate } = useFormatters();
  const navigate = useNavigate();
  const { t } = useTranslation('workItems');
  const { areas } = useAreas();

  // Data state
  const [workItems, setWorkItems] = useState<WorkItemSummary[]>([]);
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Auto-scroll to top when error appears
  useEffect(() => {
    if (error) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [error]);

  // Pagination state
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const pageSize = 25;

  // Table state
  const {
    tableState,
    searchInput,
    setSearchInput,
    searchInputRef,
    setFilter,
    setSort,
    setPage,
    clearFilters,
    hasActiveFilters,
    toApiParams,
  } = useTableState({
    defaultSort: { sortBy: 'created_at', sortOrder: 'desc' },
    filterKeys: ['status', 'assignedUserId', 'areaId', 'assignedVendorId', 'noBudget'],
  });

  // Delete confirmation state
  const [deletingWorkItem, setDeletingWorkItem] = useState<WorkItemSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Action menu state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts state
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Screen reader announcement for filter toggle
  const [srMessage, setSrMessage] = useState('');

  // Column definitions
  const WORK_ITEM_STATUS_VARIANTS = useMemo(
    () => ({
      not_started: {
        label: t('create.fields.statusOptions.notStarted'),
        className: badgeStyles.not_started,
      },
      in_progress: {
        label: t('create.fields.statusOptions.inProgress'),
        className: badgeStyles.in_progress,
      },
      completed: {
        label: t('create.fields.statusOptions.completed'),
        className: badgeStyles.completed,
      },
    }),
    [t],
  );

  const columns: ColumnDef<WorkItemSummary>[] = useMemo(
    () => [
      {
        key: 'title',
        label: t('list.table.title'),
        type: 'string',
        sortable: true,
        defaultVisible: true,
        render: (item) => <span className={styles.titleCell}>{item.title}</span>,
      },
      {
        key: 'status',
        label: t('list.table.status'),
        type: 'enum',
        sortable: true,
        defaultVisible: true,
        render: (item) => <Badge variants={WORK_ITEM_STATUS_VARIANTS} value={item.status} />,
      },
      {
        key: 'assignedUser',
        label: t('list.table.assignedTo'),
        type: 'string',
        defaultVisible: true,
        render: (item) => item.assignedUser?.displayName || '\u2014',
      },
      {
        key: 'startDate',
        label: t('list.table.startDate'),
        type: 'date',
        sortable: true,
        sortKey: 'start_date',
        defaultVisible: true,
        render: (item) => formatDate(item.startDate),
      },
      {
        key: 'endDate',
        label: t('list.table.endDate'),
        type: 'date',
        sortable: true,
        sortKey: 'end_date',
        defaultVisible: true,
        render: (item) => formatDate(item.endDate),
      },
      {
        key: 'budgetLines',
        label: t('list.table.budgetLines'),
        type: 'number',
        defaultVisible: true,
        headerClassName: styles.budgetLinesColumn,
        cellClassName: styles.budgetLinesCell,
        render: (item) => (
          <span
            className={
              item.budgetLineCount > 0
                ? styles.budgetLineCountPositive
                : styles.budgetLineCountZero
            }
            aria-label={t('list.table.budgetLinesAriaLabel', {
              count: item.budgetLineCount,
            })}
          >
            {item.budgetLineCount}
          </span>
        ),
      },
      {
        key: 'createdAt',
        label: t('list.sortOptions.createdAt'),
        type: 'date',
        sortable: true,
        sortKey: 'created_at',
        defaultVisible: false,
        render: (item) => formatDate(item.createdAt),
      },
      {
        key: 'updatedAt',
        label: t('list.sortOptions.updatedAt'),
        type: 'date',
        sortable: true,
        sortKey: 'updated_at',
        defaultVisible: false,
        render: (item) => formatDate(item.updatedAt),
      },
    ],
    [t, formatDate, WORK_ITEM_STATUS_VARIANTS],
  );

  const { visibleColumns, toggleColumn } = useColumnPreferences('workItems', columns);

  // Load users and vendors on mount
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [usersResponse, vendorsResponse] = await Promise.all([
          listUsers(),
          fetchVendors({ pageSize: 100 }),
        ]);
        setUsers(usersResponse.users.filter((u) => !u.deactivatedAt));
        setVendors(vendorsResponse.vendors);
      } catch (err) {
        console.error('Failed to load filter options:', err);
      }
    };
    loadFilters();
  }, []);

  // Load work items when filters/page changes
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError('');

      try {
        const params = toApiParams();
        const response = await listWorkItems({
          page: params.page as number,
          pageSize,
          status: (params.status as string) || undefined,
          assignedUserId: (params.assignedUserId as string) || undefined,
          areaId: (params.areaId as string) || undefined,
          assignedVendorId: (params.assignedVendorId as string) || undefined,
          q: (params.q as string) || undefined,
          sortBy: params.sortBy as string,
          sortOrder: params.sortOrder as 'asc' | 'desc',
          noBudget: params.noBudget as boolean | undefined,
        });

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

    fetchData();
  }, [tableState, toApiParams, t]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setActiveMenuId(null);
      }
    }

    if (activeMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeMenuId]);

  const loadWorkItems = async () => {
    setIsLoading(true);
    setError('');

    try {
      const params = toApiParams();
      const response = await listWorkItems({
        page: params.page as number,
        pageSize,
        status: (params.status as string) || undefined,
        assignedUserId: (params.assignedUserId as string) || undefined,
        areaId: (params.areaId as string) || undefined,
        assignedVendorId: (params.assignedVendorId as string) || undefined,
        q: (params.q as string) || undefined,
        sortBy: params.sortBy as string,
        sortOrder: params.sortOrder as 'asc' | 'desc',
        noBudget: params.noBudget as boolean | undefined,
      });

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

  const handleNoBudgetFilterChange = (checked: boolean) => {
    setFilter('noBudget', checked ? 'true' : undefined);
    setSrMessage(checked ? t('list.filters.noBudgetActive') : t('list.filters.noBudgetInactive'));
  };

  const handleDeleteClick = (workItem: WorkItemSummary, event: React.MouseEvent) => {
    event.stopPropagation();
    setDeletingWorkItem(workItem);
  };

  const confirmDelete = async () => {
    if (!deletingWorkItem) return;

    setIsDeleting(true);
    setError('');

    try {
      await deleteWorkItem(deletingWorkItem.id);
      setDeletingWorkItem(null);
      loadWorkItems();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('list.errors.deleteFailed'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Build status options
  const STATUS_OPTIONS: { value: WorkItemStatus; label: string }[] = useMemo(
    () => [
      { value: 'not_started', label: t('create.fields.statusOptions.notStarted') },
      { value: 'in_progress', label: t('create.fields.statusOptions.inProgress') },
      { value: 'completed', label: t('create.fields.statusOptions.completed') },
    ],
    [t],
  );

  const SORT_OPTIONS: { value: string; label: string }[] = useMemo(
    () => [
      { value: 'title', label: t('list.sortOptions.title') },
      { value: 'status', label: t('list.sortOptions.status') },
      { value: 'start_date', label: t('list.sortOptions.startDate') },
      { value: 'end_date', label: t('list.sortOptions.endDate') },
      { value: 'created_at', label: t('list.sortOptions.createdAt') },
      { value: 'updated_at', label: t('list.sortOptions.updatedAt') },
    ],
    [t],
  );

  // Render actions for each row
  const renderActions = (item: WorkItemSummary) => (
    <div className={styles.actionsMenu}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)}
        aria-label={t('list.actions.actionsMenu')}
      >
        &#x22EE;
      </button>
      {activeMenuId === item.id && (
        <div className={styles.menuDropdown}>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => navigate(`/project/work-items/${item.id}`)}
          >
            {t('list.actions.edit')}
          </button>
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={(e) => handleDeleteClick(item, e)}
          >
            {t('list.actions.delete')}
          </button>
        </div>
      )}
    </div>
  );

  // Keyboard shortcuts
  const shortcuts = useMemo(
    () => [
      {
        key: 'n',
        handler: () => navigate('/project/work-items/new'),
        description: t('list.shortcuts.newWorkItem'),
      },
      {
        key: '/',
        handler: () => searchInputRef.current?.focus(),
        description: t('list.shortcuts.focusSearch'),
      },
      {
        key: 'ArrowDown',
        handler: () => {
          if (workItems.length > 0) {
            setSelectedIndex((prev) =>
              prev === -1 ? 0 : Math.min(prev + 1, workItems.length - 1),
            );
          }
        },
        description: t('list.shortcuts.selectNext'),
      },
      {
        key: 'ArrowUp',
        handler: () => {
          if (workItems.length > 0) {
            setSelectedIndex((prev) => (prev === -1 ? 0 : Math.max(prev - 1, 0)));
          }
        },
        description: t('list.shortcuts.selectPrevious'),
      },
      {
        key: 'Enter',
        handler: () => {
          if (selectedIndex >= 0 && workItems[selectedIndex]) {
            navigate(`/project/work-items/${workItems[selectedIndex].id}`);
          }
        },
        description: t('list.shortcuts.openSelected'),
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
          } else if (deletingWorkItem) {
            setDeletingWorkItem(null);
          } else if (activeMenuId) {
            setActiveMenuId(null);
          } else if (selectedIndex >= 0) {
            setSelectedIndex(-1);
          }
        },
        description: t('list.shortcuts.closeOrCancel'),
      },
    ],
    [navigate, workItems, selectedIndex, showShortcutsHelp, deletingWorkItem, activeMenuId, t, searchInputRef],
  );

  useKeyboardShortcuts(shortcuts);

  // Reset selected index when work items change
  useEffect(() => {
    if (selectedIndex >= workItems.length) {
      setSelectedIndex(-1);
    }
  }, [workItems.length, selectedIndex]);

  const noBudgetFilter = tableState.filters.noBudget === 'true';

  // Filter bar as headerContent for DataTable
  const filterBar = (
    <div className={styles.filtersCard}>
      <div className={styles.searchRow}>
        <input
          ref={searchInputRef}
          type="search"
          placeholder={t('list.search.placeholder')}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className={styles.searchInput}
          aria-label={t('list.search.ariaLabel')}
        />
      </div>

      <div className={styles.filtersRow}>
        <div className={styles.filter}>
          <label htmlFor="status-filter" className={styles.filterLabel}>
            {t('list.filters.status')}
          </label>
          <select
            id="status-filter"
            value={tableState.filters.status || ''}
            onChange={(e) => setFilter('status', e.target.value || undefined)}
            className={styles.filterSelect}
          >
            <option value="">{t('list.filters.allStatuses')}</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filter}>
          <label htmlFor="user-filter" className={styles.filterLabel}>
            {t('list.filters.assignedTo')}
          </label>
          <select
            id="user-filter"
            value={tableState.filters.assignedUserId || ''}
            onChange={(e) => setFilter('assignedUserId', e.target.value || undefined)}
            className={styles.filterSelect}
          >
            <option value="">{t('list.filters.allUsers')}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filter}>
          <label className={styles.filterLabel}>{t('list.filters.area')}</label>
          <AreaPicker
            areas={areas}
            value={tableState.filters.areaId || ''}
            onChange={(areaId: string) => setFilter('areaId', areaId || undefined)}
            nullable={true}
            specialOptions={[{ id: '', label: t('list.filters.allAreas') }]}
          />
        </div>

        <div className={styles.filter}>
          <label htmlFor="vendor-filter" className={styles.filterLabel}>
            {t('list.filters.assignedVendor')}
          </label>
          <select
            id="vendor-filter"
            value={tableState.filters.assignedVendorId || ''}
            onChange={(e) => setFilter('assignedVendorId', e.target.value || undefined)}
            className={styles.filterSelect}
          >
            <option value="">{t('list.filters.allVendors')}</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className={styles.noBudgetToggle}
          aria-pressed={noBudgetFilter}
          aria-label={t('list.filters.noBudgetAriaLabel')}
          onClick={() => handleNoBudgetFilterChange(!noBudgetFilter)}
        >
          {t('list.filters.noBudget')}
        </button>
        <span className={styles.srOnly} role="status" aria-atomic="true">
          {srMessage}
        </span>

        <div className={styles.filter}>
          <label htmlFor="sort-filter" className={styles.filterLabel}>
            {t('list.filters.sortBy')}
          </label>
          <select
            id="sort-filter"
            value={tableState.sort.sortBy}
            onChange={(e) => setSort(e.target.value)}
            className={styles.filterSelect}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => setSort(tableState.sort.sortBy)}
          aria-label={t('list.filters.toggleSortOrder')}
        >
          {tableState.sort.sortOrder === 'asc'
            ? t('list.filters.sortAscending')
            : t('list.filters.sortDescending')}
        </button>
      </div>
    </div>
  );

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>{t('list.pageTitle')}</h1>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => navigate('/project/work-items/new')}
        >
          {t('list.newWorkItem')}
        </button>
      </div>
      <ProjectSubNav />

      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      <DataTable<WorkItemSummary>
        pageKey="workItems"
        columns={columns}
        items={workItems}
        totalItems={totalItems}
        totalPages={totalPages}
        currentPage={tableState.page}
        pageSize={pageSize}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        onRowClick={(item) => navigate(`/project/work-items/${item.id}`)}
        renderActions={renderActions}
        tableState={tableState}
        onSortChange={setSort}
        onPageChange={setPage}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        headerContent={filterBar}
        hasActiveFilters={hasActiveFilters}
        selectedIndex={selectedIndex}
        getCardTitle={(item) => item.title}
        emptyState={{
          noData: {
            title: t('list.empty.noItemsTitle'),
            description: t('list.empty.noItemsText'),
            action: (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => navigate('/project/work-items/new')}
              >
                {t('list.empty.createFirst')}
              </button>
            ),
          },
          noResults: {
            title: t('list.empty.noMatchTitle'),
            description: t('list.empty.noMatchText'),
            action: (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={clearFilters}
              >
                {t('list.empty.clearFilters')}
              </button>
            ),
          },
        }}
      />

      {/* Delete confirmation modal */}
      {deletingWorkItem && (
        <div className={styles.modal} role="dialog" aria-modal="true">
          <div
            className={styles.modalBackdrop}
            onClick={() => !isDeleting && setDeletingWorkItem(null)}
          />
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>{t('list.deleteModal.title')}</h2>
            <p className={styles.modalText}>
              {t('list.deleteModal.confirmation', { title: deletingWorkItem.title })}
            </p>
            <p className={styles.modalWarning}>{t('list.deleteModal.warning')}</p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setDeletingWorkItem(null)}
                disabled={isDeleting}
              >
                {t('list.deleteModal.cancel')}
              </button>
              <button
                type="button"
                className={styles.confirmDeleteButton}
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting
                  ? t('list.deleteModal.deletingLabel')
                  : t('list.deleteModal.deleteLabel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts help */}
      {showShortcutsHelp && (
        <KeyboardShortcutsHelp shortcuts={shortcuts} onClose={() => setShowShortcutsHelp(false)} />
      )}
    </div>
  );
}

export default WorkItemsPage;
