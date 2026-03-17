import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  HouseholdItemSummary,
  HouseholdItemCategory,
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
import { formatDate, formatCurrency } from '../../lib/formatters.js';
import { ProjectSubNav } from '../../components/ProjectSubNav/ProjectSubNav.js';
import styles from './HouseholdItemsPage.module.css';

export function HouseholdItemsPage() {
  const { t } = useTranslation('householdItems');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const STATUS_OPTIONS: { value: HouseholdItemStatus; label: string }[] = [
    { value: 'planned', label: t('status.planned') },
    { value: 'purchased', label: t('status.purchased') },
    { value: 'scheduled', label: t('status.scheduled') },
    { value: 'arrived', label: t('status.arrived') },
  ];

  const HI_STATUS_VARIANTS = {
    planned: { label: t('status.planned'), className: badgeStyles.planned },
    purchased: { label: t('status.purchased'), className: badgeStyles.purchased },
    scheduled: { label: t('status.scheduled'), className: badgeStyles.scheduled },
    arrived: { label: t('status.arrived'), className: badgeStyles.arrived },
  };

  const SORT_OPTIONS: { value: string; label: string }[] = [
    { value: 'name', label: t('sort.options.name') },
    { value: 'category', label: t('sort.options.category') },
    { value: 'status', label: t('sort.options.status') },
    { value: 'room', label: t('sort.options.room') },
    { value: 'order_date', label: t('sort.options.order_date') },
    { value: 'target_delivery_date', label: t('sort.options.target_delivery_date') },
    { value: 'created_at', label: t('sort.options.created_at') },
    { value: 'updated_at', label: t('sort.options.updated_at') },
  ];

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
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const pageSize = 25;

  // Filter and search state from URL
  const searchQuery = searchParams.get('q') || '';
  const categoryFilter = searchParams.get('category') as HouseholdItemCategory | null;
  const statusFilter = searchParams.get('status') as HouseholdItemStatus | null;
  const roomFilter = searchParams.get('room') || '';
  const vendorFilter = searchParams.get('vendorId') || '';
  const sortBy =
    (searchParams.get('sortBy') as
      | 'name'
      | 'category'
      | 'status'
      | 'room'
      | 'order_date'
      | 'target_delivery_date'
      | 'created_at'
      | 'updated_at'
      | null) || 'created_at';
  const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc';
  const urlPage = parseInt(searchParams.get('page') || '1', 10);

  // Search debounce
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [roomInput, setRoomInput] = useState(roomFilter);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const roomDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Delete confirmation state
  const [deletingItem, setDeletingItem] = useState<HouseholdItemSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Action menu state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts state
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Debounced room filter
  useEffect(() => {
    if (roomDebounceRef.current) {
      clearTimeout(roomDebounceRef.current);
    }

    roomDebounceRef.current = setTimeout(() => {
      const newParams = new URLSearchParams(searchParams);
      if (roomInput) {
        newParams.set('room', roomInput);
      } else {
        newParams.delete('room');
      }
      newParams.set('page', '1');
      setSearchParams(newParams);
    }, 300);

    return () => {
      if (roomDebounceRef.current) {
        clearTimeout(roomDebounceRef.current);
      }
    };
  }, [roomInput, searchParams, setSearchParams]);

  // Load household items when filters/page changes
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError('');

      try {
        const response = await listHouseholdItems({
          page: currentPage,
          pageSize,
          category: categoryFilter || undefined,
          status: statusFilter || undefined,
          room: roomFilter || undefined,
          vendorId: vendorFilter || undefined,
          q: searchQuery || undefined,
          sortBy,
          sortOrder,
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
  }, [
    searchQuery,
    categoryFilter,
    statusFilter,
    roomFilter,
    vendorFilter,
    sortBy,
    sortOrder,
    currentPage,
  ]);

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

  const updateSearchParams = (updates: Record<string, string | undefined>) => {
    const newParams = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === '') {
        newParams.delete(key);
      } else {
        newParams.set(key, value);
      }
    });

    setSearchParams(newParams);
  };

  const handleCategoryFilterChange = (category: string) => {
    updateSearchParams({ category: category || undefined, page: '1' });
  };

  const handleStatusFilterChange = (status: string) => {
    updateSearchParams({ status: status || undefined, page: '1' });
  };

  const handleVendorFilterChange = (vendorId: string) => {
    updateSearchParams({ vendorId: vendorId || undefined, page: '1' });
  };

  const handleSortChange = (field: string) => {
    const newSortOrder = sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc';
    updateSearchParams({ sortBy: field, sortOrder: newSortOrder });
  };

  const handlePageChange = (page: number) => {
    updateSearchParams({ page: page.toString() });
  };

  const handleRowClick = (itemId: string) => {
    navigate(`/project/household-items/${itemId}`);
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
      if (householdItems.length === 1 && currentPage > 1) {
        handlePageChange(currentPage - 1);
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

  const renderSortIcon = (field: string) => {
    if (sortBy !== field) return null;
    return sortOrder === 'asc' ? ' ↑' : ' ↓';
  };

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
    [navigate, householdItems, selectedIndex, showShortcutsHelp, deletingItem, activeMenuId, t],
  );

  useKeyboardShortcuts(shortcuts);

  // Reset selected index when items change
  useEffect(() => {
    if (selectedIndex >= householdItems.length) {
      setSelectedIndex(-1);
    }
  }, [householdItems.length, selectedIndex]);

  if (isLoading && householdItems.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t('loading')}</div>
      </div>
    );
  }

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

      {/* Search and filters */}
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
                value={categoryFilter || ''}
                onChange={(e) => handleCategoryFilterChange(e.target.value)}
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
              <label htmlFor="status-filter" className={styles.filterLabel}>
                {t('filters.status')}
              </label>
              <select
                id="status-filter"
                value={statusFilter || ''}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
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
              <label htmlFor="room-input" className={styles.filterLabel}>
                {t('filters.room')}
              </label>
              <input
                id="room-input"
                type="text"
                placeholder={t('filters.roomPlaceholder')}
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                className={styles.filterSelect}
                aria-label={t('filters.roomAriaLabel')}
              />
            </div>

            <div className={styles.filter}>
              <label htmlFor="vendor-filter" className={styles.filterLabel}>
                {t('filters.vendor')}
              </label>
              <select
                id="vendor-filter"
                value={vendorFilter}
                onChange={(e) => handleVendorFilterChange(e.target.value)}
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

            <div className={styles.filter}>
              <label htmlFor="sort-filter" className={styles.filterLabel}>
                {t('filters.sortBy')}
              </label>
              <select
                id="sort-filter"
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value)}
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
              onClick={() => handleSortChange(sortBy)}
              aria-label={t('filters.toggleSort')}
            >
              {sortOrder === 'asc' ? t('sort.asc') : t('sort.desc')}
            </button>
          </div>
        </div>

        <p className={styles.srAnnouncement} aria-live="polite" aria-atomic="true">
          {!isLoading &&
            `${totalItems} ${totalItems !== 1 ? t('results.itemsFound') : t('results.itemFound')}`}
        </p>
      </div>

      {/* Household items list */}
      {householdItems.length === 0 ? (
        <div className={styles.emptyState}>
          {searchQuery || categoryFilter || statusFilter || roomFilter || vendorFilter ? (
            <>
              <h2>{t('empty.noResults')}</h2>
              <p>{t('empty.noResultsMessage')}</p>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setSearchInput('');
                  setRoomInput('');
                  setSearchParams(new URLSearchParams());
                }}
              >
                {t('empty.clearAllFilters')}
              </button>
            </>
          ) : (
            <>
              <h2>{t('empty.noItems')}</h2>
              <p>{t('empty.noItemsMessage')}</p>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => navigate('/project/household-items/new')}
              >
                {t('empty.createFirstItem')}
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table view */}
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th
                    className={styles.sortableHeader}
                    onClick={() => handleSortChange('name')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSortChange('name');
                      }
                    }}
                    tabIndex={0}
                    role="columnheader"
                    aria-sort={
                      sortBy === 'name'
                        ? sortOrder === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                  >
                    {t('table.headers.name')}
                    {renderSortIcon('name')}
                  </th>
                  <th
                    className={styles.sortableHeader}
                    onClick={() => handleSortChange('category')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSortChange('category');
                      }
                    }}
                    tabIndex={0}
                    role="columnheader"
                    aria-sort={
                      sortBy === 'category'
                        ? sortOrder === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                  >
                    {t('table.headers.category')}
                    {renderSortIcon('category')}
                  </th>
                  <th
                    className={styles.sortableHeader}
                    onClick={() => handleSortChange('status')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSortChange('status');
                      }
                    }}
                    tabIndex={0}
                    role="columnheader"
                    aria-sort={
                      sortBy === 'status'
                        ? sortOrder === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                  >
                    {t('table.headers.status')}
                    {renderSortIcon('status')}
                  </th>
                  <th>{t('table.headers.room')}</th>
                  <th>{t('table.headers.vendor')}</th>
                  <th>{t('table.headers.plannedCost')}</th>
                  <th
                    className={styles.sortableHeader}
                    onClick={() => handleSortChange('target_delivery_date')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSortChange('target_delivery_date');
                      }
                    }}
                    tabIndex={0}
                    role="columnheader"
                    aria-sort={
                      sortBy === 'target_delivery_date'
                        ? sortOrder === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                  >
                    {t('table.headers.targetDelivery')}
                    {renderSortIcon('target_delivery_date')}
                  </th>
                  <th className={styles.actionsColumn}>{t('table.headers.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {householdItems.map((item, index) => (
                  <tr
                    key={item.id}
                    className={`${styles.tableRow} ${index === selectedIndex ? styles.tableRowSelected : ''}`}
                    onClick={() => handleRowClick(item.id)}
                  >
                    <td className={styles.titleCell}>{item.name}</td>
                    <td>{categoryNameMap.get(item.category) ?? item.category}</td>
                    <td>
                      <Badge variants={HI_STATUS_VARIANTS} value={item.status} />
                    </td>
                    <td>{item.room || '—'}</td>
                    <td>{item.vendor?.name || '—'}</td>
                    <td>{formatCurrency(item.totalPlannedAmount)}</td>
                    <td>{formatDate(item.targetDeliveryDate)}</td>
                    <td className={styles.actionsCell} onClick={(e) => e.stopPropagation()}>
                      <div className={styles.actionsMenu}>
                        <button
                          type="button"
                          className={styles.menuButton}
                          onClick={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)}
                          aria-label={t('menu.actions', { name: item.name })}
                        >
                          ⋮
                        </button>
                        {activeMenuId === item.id && (
                          <div
                            className={styles.menuDropdown}
                            role="menu"
                            onKeyDown={(e) => {
                              const items = (
                                e.currentTarget as HTMLDivElement
                              ).querySelectorAll<HTMLElement>('[role="menuitem"]');
                              const arr = Array.from(items);
                              const currentIndex = arr.indexOf(
                                document.activeElement as HTMLElement,
                              );
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card view */}
          <div className={styles.cardsContainer}>
            {householdItems.map((item) => (
              <div key={item.id} className={styles.card} onClick={() => handleRowClick(item.id)}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>{item.name}</h3>
                  <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.actionsMenu}>
                      <button
                        type="button"
                        className={styles.menuButton}
                        onClick={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)}
                        aria-label={t('menu.actions', { name: item.name })}
                      >
                        ⋮
                      </button>
                      {activeMenuId === item.id && (
                        <div
                          className={styles.menuDropdown}
                          role="menu"
                          onKeyDown={(e) => {
                            const items = (
                              e.currentTarget as HTMLDivElement
                            ).querySelectorAll<HTMLElement>('[role="menuitem"]');
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
                  </div>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>{t('card.category')}</span>
                    <span>{categoryNameMap.get(item.category) ?? item.category}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>{t('card.status')}</span>
                    <Badge variants={HI_STATUS_VARIANTS} value={item.status} />
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>{t('card.room')}</span>
                    <span>{item.room || '—'}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>{t('card.vendor')}</span>
                    <span>{item.vendor?.name || '—'}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>{t('card.plannedCost')}</span>
                    <span>{formatCurrency(item.totalPlannedAmount)}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>{t('card.targetDelivery')}</span>
                    <span>{formatDate(item.targetDeliveryDate)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <div className={styles.paginationInfo}>
                {t('pagination.showing')} {(currentPage - 1) * pageSize + 1} {t('pagination.to')}{' '}
                {Math.min(currentPage * pageSize, totalItems)} {t('pagination.of')} {totalItems}{' '}
                {t('pagination.items')}
              </div>
              <div className={styles.paginationControls}>
                <button
                  type="button"
                  className={styles.paginationButton}
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label={t('pagination.previous')}
                >
                  {t('pagination.previous')}
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
                  aria-label={t('pagination.next')}
                >
                  {t('pagination.next')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

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
