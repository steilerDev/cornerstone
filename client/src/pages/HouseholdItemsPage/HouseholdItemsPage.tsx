import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  HouseholdItemSummary,
  HouseholdItemStatus,
  Vendor,
  HouseholdItemCategoryEntity,
} from '@cornerstone/shared';
import { listHouseholdItems, deleteHouseholdItem } from '../../lib/householdItemsApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { fetchHouseholdItemCategories } from '../../lib/householdItemCategoriesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { Badge } from '../../components/Badge/Badge.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { KeyboardShortcutsHelp } from '../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import { useFormatters } from '../../lib/formatters.js';
import { ProjectSubNav } from '../../components/ProjectSubNav/ProjectSubNav.js';
import { useAreas } from '../../hooks/useAreas.js';
import { AreaPicker } from '../../components/AreaPicker/AreaPicker.js';
import { DataTable } from '../../components/DataTable/DataTable.js';
import type { ColumnDef } from '../../components/DataTable/DataTable.js';
import { useTableState } from '../../hooks/useTableState.js';
import { useColumnPreferences } from '../../hooks/useColumnPreferences.js';
import styles from './HouseholdItemsPage.module.css';

export function HouseholdItemsPage() {
  const { formatCurrency, formatDate } = useFormatters();
  const { t } = useTranslation('householdItems');
  const navigate = useNavigate();
  const { areas } = useAreas();

  const STATUS_OPTIONS: { value: HouseholdItemStatus; label: string }[] = useMemo(
    () => [
      { value: 'planned', label: t('status.planned') },
      { value: 'purchased', label: t('status.purchased') },
      { value: 'scheduled', label: t('status.scheduled') },
      { value: 'arrived', label: t('status.arrived') },
    ],
    [t],
  );

  const HI_STATUS_VARIANTS = useMemo(
    () => ({
      planned: { label: t('status.planned'), className: badgeStyles.planned },
      purchased: { label: t('status.purchased'), className: badgeStyles.purchased },
      scheduled: { label: t('status.scheduled'), className: badgeStyles.scheduled },
      arrived: { label: t('status.arrived'), className: badgeStyles.arrived },
    }),
    [t],
  );

  const SORT_OPTIONS: { value: string; label: string }[] = useMemo(
    () => [
      { value: 'name', label: t('sort.options.name') },
      { value: 'category', label: t('sort.options.category') },
      { value: 'status', label: t('sort.options.status') },
      { value: 'order_date', label: t('sort.options.order_date') },
      { value: 'target_delivery_date', label: t('sort.options.target_delivery_date') },
      { value: 'created_at', label: t('sort.options.created_at') },
      { value: 'updated_at', label: t('sort.options.updated_at') },
    ],
    [t],
  );

  // Data state
  const [householdItems, setHouseholdItems] = useState<HouseholdItemSummary[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<HouseholdItemCategoryEntity[]>([]);
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
    filterKeys: ['category', 'areaId', 'status', 'vendorId', 'noBudget'],
  });

  // Delete confirmation state
  const [deletingItem, setDeletingItem] = useState<HouseholdItemSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Action menu state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts state
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Screen reader announcement for filter toggle
  const [srMessage, setSrMessage] = useState('');

  // Delete confirmation and modal state
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Category name lookup map
  const categoryNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [categories]);

  // Column definitions
  const columns: ColumnDef<HouseholdItemSummary>[] = useMemo(
    () => [
      {
        key: 'name',
        label: t('table.headers.name'),
        type: 'string',
        sortable: true,
        defaultVisible: true,
        render: (item) => <span className={styles.titleCell}>{item.name}</span>,
      },
      {
        key: 'category',
        label: t('table.headers.category'),
        type: 'enum',
        sortable: true,
        defaultVisible: true,
        render: (item) => categoryNameMap.get(item.category) ?? item.category,
      },
      {
        key: 'status',
        label: t('table.headers.status'),
        type: 'enum',
        sortable: true,
        defaultVisible: true,
        render: (item) => <Badge variants={HI_STATUS_VARIANTS} value={item.status} />,
      },
      {
        key: 'area',
        label: t('table.headers.room'),
        type: 'string',
        defaultVisible: true,
        render: (item) => item.area?.name || '\u2014',
      },
      {
        key: 'vendor',
        label: t('table.headers.vendor'),
        type: 'string',
        defaultVisible: true,
        render: (item) => item.vendor?.name || '\u2014',
      },
      {
        key: 'plannedCost',
        label: t('table.headers.plannedCost'),
        type: 'currency',
        defaultVisible: true,
        render: (item) => formatCurrency(item.totalPlannedAmount),
      },
      {
        key: 'targetDeliveryDate',
        label: t('table.headers.targetDelivery'),
        type: 'date',
        sortable: true,
        sortKey: 'target_delivery_date',
        defaultVisible: true,
        render: (item) => formatDate(item.targetDeliveryDate),
      },
      {
        key: 'orderDate',
        label: t('sort.options.order_date'),
        type: 'date',
        sortable: true,
        sortKey: 'order_date',
        defaultVisible: false,
        render: (item) => formatDate(item.orderDate),
      },
    ],
    [t, formatCurrency, formatDate, categoryNameMap, HI_STATUS_VARIANTS],
  );

  const { visibleColumns, toggleColumn } = useColumnPreferences('householdItems', columns);

  // Load vendors and categories on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [vendorsResponse, categoriesResponse] = await Promise.all([
          fetchVendors(),
          fetchHouseholdItemCategories(),
        ]);
        setVendors(vendorsResponse.vendors);
        setCategories(categoriesResponse.categories);
      } catch (err) {
        console.error('Failed to load vendors or categories:', err);
      }
    };
    loadData();
  }, []);

  // Load household items when filters/page changes
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError('');

      try {
        const params = toApiParams();
        const response = await listHouseholdItems({
          page: params.page as number,
          pageSize,
          category: (params.category as string) || undefined,
          areaId: (params.areaId as string) || undefined,
          status: (params.status as string) || undefined,
          vendorId: (params.vendorId as string) || undefined,
          q: (params.q as string) || undefined,
          sortBy: params.sortBy as string,
          sortOrder: params.sortOrder as 'asc' | 'desc',
          noBudget: params.noBudget as boolean | undefined,
        });

        setHouseholdItems(response.items);
        setTotalPages(response.pagination.totalPages);
        setTotalItems(response.pagination.totalItems);
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.error.message);
        } else {
          setError('Failed to load household items. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [tableState, toApiParams]);

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

  // Modal focus trap for delete confirmation
  useEffect(() => {
    if (!deletingItem) return;
    modalRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (!isDeleting) {
          setDeletingItem(null);
          deleteTriggerRef.current?.focus();
        }
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const focusableArray = Array.from(focusable);
        if (focusableArray.length === 0) return;
        const firstEl = focusableArray[0];
        const lastEl = focusableArray[focusableArray.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [deletingItem, isDeleting]);

  const handleNoBudgetFilterChange = (checked: boolean) => {
    setFilter('noBudget', checked ? 'true' : undefined);
    setSrMessage(checked ? t('filters.noBudgetActive') : t('filters.noBudgetInactive'));
  };

  const handleDeleteClick = (item: HouseholdItemSummary, event: React.MouseEvent) => {
    event.stopPropagation();
    deleteTriggerRef.current = event.currentTarget as HTMLButtonElement;
    setDeletingItem(item);
  };

  const confirmDelete = async () => {
    if (!deletingItem) return;

    setIsDeleting(true);
    setError('');

    try {
      await deleteHouseholdItem(deletingItem.id);
      setDeletingItem(null);
      setHouseholdItems(householdItems.filter((item) => item.id !== deletingItem.id));
      if (householdItems.length === 1 && tableState.page > 1) {
        setPage(tableState.page - 1);
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to delete household item. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Render actions for each row
  const renderActions = (item: HouseholdItemSummary) => (
    <div className={styles.actionsMenu}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)}
        aria-label={t('menu.actions', { name: item.name })}
      >
        &#x22EE;
      </button>
      {activeMenuId === item.id && (
        <div
          className={styles.menuDropdown}
          role="menu"
          onKeyDown={(e) => {
            const items = (e.currentTarget as HTMLDivElement).querySelectorAll<HTMLElement>(
              '[role="menuitem"]',
            );
            const arr = Array.from(items);
            const currentIndex = arr.indexOf(document.activeElement as HTMLElement);
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              const nextIndex = (currentIndex + 1) % arr.length;
              arr[nextIndex]?.focus();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              const prevIndex = (currentIndex - 1 + arr.length) % arr.length;
              arr[prevIndex]?.focus();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setActiveMenuId(null);
            }
          }}
        >
          <button
            type="button"
            className={styles.menuItem}
            role="menuitem"
            onClick={() => navigate(`/project/household-items/${item.id}`)}
          >
            {t('menu.edit')}
          </button>
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            role="menuitem"
            onClick={(e) => handleDeleteClick(item, e)}
          >
            {t('menu.delete')}
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
        handler: () => navigate('/project/household-items/new'),
        description: t('keyboard.newItem'),
      },
      {
        key: '/',
        handler: () => searchInputRef.current?.focus(),
        description: t('keyboard.focusSearch'),
      },
      {
        key: 'ArrowDown',
        handler: () => {
          if (householdItems.length > 0) {
            setSelectedIndex((prev) =>
              prev === -1 ? 0 : Math.min(prev + 1, householdItems.length - 1),
            );
          }
        },
        description: t('keyboard.selectNext'),
      },
      {
        key: 'ArrowUp',
        handler: () => {
          if (householdItems.length > 0) {
            setSelectedIndex((prev) => (prev === -1 ? 0 : Math.max(prev - 1, 0)));
          }
        },
        description: t('keyboard.selectPrevious'),
      },
      {
        key: 'Enter',
        handler: () => {
          if (selectedIndex >= 0 && householdItems[selectedIndex]) {
            navigate(`/project/household-items/${householdItems[selectedIndex].id}`);
          }
        },
        description: t('keyboard.openSelected'),
      },
      {
        key: '?',
        handler: () => setShowShortcutsHelp(true),
        description: t('keyboard.showShortcuts'),
      },
      {
        key: 'Escape',
        handler: () => {
          if (showShortcutsHelp) {
            setShowShortcutsHelp(false);
          } else if (deletingItem) {
            setDeletingItem(null);
          } else if (activeMenuId) {
            setActiveMenuId(null);
          } else if (selectedIndex >= 0) {
            setSelectedIndex(-1);
          }
        },
        description: t('keyboard.closeDialog'),
      },
    ],
    [navigate, householdItems, selectedIndex, showShortcutsHelp, deletingItem, activeMenuId, t, searchInputRef],
  );

  useKeyboardShortcuts(shortcuts);

  // Reset selected index when items change
  useEffect(() => {
    if (selectedIndex >= householdItems.length) {
      setSelectedIndex(-1);
    }
  }, [householdItems.length, selectedIndex]);

  const noBudgetFilter = tableState.filters.noBudget === 'true';

  // Filter bar as headerContent for DataTable
  const filterBar = (
    <div className={styles.filtersCard}>
      <div className={styles.searchRow}>
        <input
          ref={searchInputRef}
          type="search"
          placeholder={t('search.placeholder')}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className={styles.searchInput}
          aria-label={t('search.ariaLabel')}
        />
      </div>

      <div
        id="hi-filter-panel"
        role="search"
        aria-label={t('filters.ariaLabel')}
        className={styles.filterPanel}
      >
        <div className={styles.filtersRow}>
          <div className={styles.filter}>
            <label htmlFor="category-filter" className={styles.filterLabel}>
              {t('filters.category')}
            </label>
            <select
              id="category-filter"
              value={tableState.filters.category || ''}
              onChange={(e) => setFilter('category', e.target.value || undefined)}
              className={styles.filterSelect}
            >
              <option value="">{t('filters.allCategories')}</option>
              {categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filter}>
            <label htmlFor="area-filter" className={styles.filterLabel}>
              {t('filters.area')}
            </label>
            <AreaPicker
              id="area-filter"
              areas={areas}
              value={tableState.filters.areaId || ''}
              onChange={(areaId: string) => setFilter('areaId', areaId || undefined)}
              specialOptions={[{ id: '', label: t('filters.allAreas') }]}
            />
          </div>

          <div className={styles.filter}>
            <label htmlFor="status-filter" className={styles.filterLabel}>
              {t('filters.status')}
            </label>
            <select
              id="status-filter"
              value={tableState.filters.status || ''}
              onChange={(e) => setFilter('status', e.target.value || undefined)}
              className={styles.filterSelect}
            >
              <option value="">{t('filters.allStatuses')}</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filter}>
            <label htmlFor="vendor-filter" className={styles.filterLabel}>
              {t('filters.vendor')}
            </label>
            <select
              id="vendor-filter"
              value={tableState.filters.vendorId || ''}
              onChange={(e) => setFilter('vendorId', e.target.value || undefined)}
              className={styles.filterSelect}
            >
              <option value="">{t('filters.allVendors')}</option>
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
            aria-label={t('filters.noBudgetAriaLabel')}
            onClick={() => handleNoBudgetFilterChange(!noBudgetFilter)}
          >
            {t('filters.noBudget')}
          </button>
          <span className={styles.srAnnouncement} role="status" aria-atomic="true">
            {srMessage}
          </span>

          <div className={styles.filter}>
            <label htmlFor="sort-filter" className={styles.filterLabel}>
              {t('filters.sortBy')}
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
            aria-label={t('filters.toggleSort')}
          >
            {tableState.sort.sortOrder === 'asc' ? t('sort.asc') : t('sort.desc')}
          </button>
        </div>
      </div>

      <p className={styles.srAnnouncement} aria-live="polite" aria-atomic="true">
        {!isLoading &&
          `${totalItems} ${totalItems !== 1 ? t('results.itemsFound') : t('results.itemFound')}`}
      </p>
    </div>
  );

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>{t('page.title')}</h1>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => navigate('/project/household-items/new')}
        >
          {t('newButton')}
        </button>
      </div>
      <ProjectSubNav />

      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      <DataTable<HouseholdItemSummary>
        pageKey="householdItems"
        columns={columns}
        items={householdItems}
        totalItems={totalItems}
        totalPages={totalPages}
        currentPage={tableState.page}
        pageSize={pageSize}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        onRowClick={(item) => navigate(`/project/household-items/${item.id}`)}
        renderActions={renderActions}
        tableState={tableState}
        onSortChange={setSort}
        onPageChange={setPage}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        headerContent={filterBar}
        hasActiveFilters={hasActiveFilters}
        selectedIndex={selectedIndex}
        getCardTitle={(item) => item.name}
        emptyState={{
          noData: {
            title: t('empty.noItems'),
            description: t('empty.noItemsMessage'),
            action: (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => navigate('/project/household-items/new')}
              >
                {t('empty.createFirstItem')}
              </button>
            ),
          },
          noResults: {
            title: t('empty.noResults'),
            description: t('empty.noResultsMessage'),
            action: (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={clearFilters}
              >
                {t('empty.clearAllFilters')}
              </button>
            ),
          },
        }}
      />

      {/* Delete confirmation modal */}
      {deletingItem && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="hi-delete-modal-title"
        >
          <div
            className={styles.modalBackdrop}
            onClick={() => !isDeleting && setDeletingItem(null)}
          />
          <div className={styles.modalContent} ref={modalRef} tabIndex={-1}>
            <h2 id="hi-delete-modal-title" className={styles.modalTitle}>
              {t('delete.confirm')}
            </h2>
            <p className={styles.modalText}>
              {t('delete.message')} &quot;<strong>{deletingItem.name}</strong>&quot;?
            </p>
            <p className={styles.modalWarning}>{t('delete.warning')}</p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setDeletingItem(null)}
                disabled={isDeleting}
              >
                {t('delete.cancel')}
              </button>
              <button
                type="button"
                className={styles.confirmDeleteButton}
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? t('delete.deleting') : t('delete.delete')}
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

export default HouseholdItemsPage;
