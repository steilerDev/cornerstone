import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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
import { HouseholdItemStatusBadge } from '../../components/HouseholdItemStatusBadge/HouseholdItemStatusBadge.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { KeyboardShortcutsHelp } from '../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import { formatDate, formatCurrency } from '../../lib/formatters.js';
import { ProjectSubNav } from '../../components/ProjectSubNav/ProjectSubNav.js';
import styles from './HouseholdItemsPage.module.css';

const STATUS_OPTIONS: { value: HouseholdItemStatus; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'purchased', label: 'Purchased' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'arrived', label: 'Arrived' },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'category', label: 'Category' },
  { value: 'status', label: 'Status' },
  { value: 'room', label: 'Room' },
  { value: 'order_date', label: 'Order Date' },
  { value: 'target_delivery_date', label: 'Target Delivery' },
  { value: 'created_at', label: 'Created' },
  { value: 'updated_at', label: 'Updated' },
];

export function HouseholdItemsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

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
        description: 'New household item',
      },
      {
        key: '/',
        handler: () => searchInputRef.current?.focus(),
        description: 'Focus search',
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
        description: 'Select next item',
      },
      {
        key: 'ArrowUp',
        handler: () => {
          if (householdItems.length > 0) {
            setSelectedIndex((prev) => (prev === -1 ? 0 : Math.max(prev - 1, 0)));
          }
        },
        description: 'Select previous item',
      },
      {
        key: 'Enter',
        handler: () => {
          if (selectedIndex >= 0 && householdItems[selectedIndex]) {
            navigate(`/project/household-items/${householdItems[selectedIndex].id}`);
          }
        },
        description: 'Open selected item',
      },
      {
        key: '?',
        handler: () => setShowShortcutsHelp(true),
        description: 'Show keyboard shortcuts',
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
        description: 'Close dialog or cancel',
      },
    ],
    [navigate, householdItems, selectedIndex, showShortcutsHelp, deletingItem, activeMenuId],
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
        <div className={styles.loading}>Loading household items...</div>
      </div>
    );
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>Household Items</h1>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => navigate('/project/household-items/new')}
        >
          New Item
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
            placeholder="Search household items..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={styles.searchInput}
            aria-label="Search household items"
          />
        </div>

        <div
          id="hi-filter-panel"
          role="search"
          aria-label="Household item filters"
          className={styles.filterPanel}
        >
          <div className={styles.filtersRow}>
            <div className={styles.filter}>
              <label htmlFor="category-filter" className={styles.filterLabel}>
                Category:
              </label>
              <select
                id="category-filter"
                value={categoryFilter || ''}
                onChange={(e) => handleCategoryFilterChange(e.target.value)}
                className={styles.filterSelect}
              >
                <option value="">All Categories</option>
                {categories.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filter}>
              <label htmlFor="status-filter" className={styles.filterLabel}>
                Status:
              </label>
              <select
                id="status-filter"
                value={statusFilter || ''}
                onChange={(e) => handleStatusFilterChange(e.target.value)}
                className={styles.filterSelect}
              >
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filter}>
              <label htmlFor="room-input" className={styles.filterLabel}>
                Room:
              </label>
              <input
                id="room-input"
                type="text"
                placeholder="Filter by room..."
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                className={styles.filterSelect}
                aria-label="Filter by room"
              />
            </div>

            <div className={styles.filter}>
              <label htmlFor="vendor-filter" className={styles.filterLabel}>
                Vendor:
              </label>
              <select
                id="vendor-filter"
                value={vendorFilter}
                onChange={(e) => handleVendorFilterChange(e.target.value)}
                className={styles.filterSelect}
              >
                <option value="">All Vendors</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.filter}>
              <label htmlFor="sort-filter" className={styles.filterLabel}>
                Sort by:
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
              aria-label="Toggle sort order"
            >
              {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>
          </div>
        </div>

        <p className={styles.srAnnouncement} aria-live="polite" aria-atomic="true">
          {!isLoading && `${totalItems} household item${totalItems !== 1 ? 's' : ''} found`}
        </p>
      </div>

      {/* Household items list */}
      {householdItems.length === 0 ? (
        <div className={styles.emptyState}>
          {searchQuery || categoryFilter || statusFilter || roomFilter || vendorFilter ? (
            <>
              <h2>No household items match your filters</h2>
              <p>Try adjusting your search or filter criteria.</p>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setSearchInput('');
                  setRoomInput('');
                  setSearchParams(new URLSearchParams());
                }}
              >
                Clear All Filters
              </button>
            </>
          ) : (
            <>
              <h2>No household items yet</h2>
              <p>Get started by creating your first household item to track.</p>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => navigate('/project/household-items/new')}
              >
                Create First Item
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
                    Name{renderSortIcon('name')}
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
                    Category{renderSortIcon('category')}
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
                    Status{renderSortIcon('status')}
                  </th>
                  <th>Room</th>
                  <th>Vendor</th>
                  <th>Planned Cost</th>
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
                    Target Delivery{renderSortIcon('target_delivery_date')}
                  </th>
                  <th className={styles.actionsColumn}>Actions</th>
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
                      <HouseholdItemStatusBadge status={item.status} />
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
                          aria-label={`Actions for ${item.name}`}
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
                              Edit
                            </button>
                            <button
                              type="button"
                              className={`${styles.menuItem} ${styles.menuItemDanger}`}
                              role="menuitem"
                              onClick={(e) => handleDeleteClick(item, e)}
                            >
                              Delete
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
                        aria-label={`Actions for ${item.name}`}
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
                            Edit
                          </button>
                          <button
                            type="button"
                            className={`${styles.menuItem} ${styles.menuItemDanger}`}
                            role="menuitem"
                            onClick={(e) => handleDeleteClick(item, e)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Category:</span>
                    <span>{categoryNameMap.get(item.category) ?? item.category}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Status:</span>
                    <HouseholdItemStatusBadge status={item.status} />
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Room:</span>
                    <span>{item.room || '—'}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Vendor:</span>
                    <span>{item.vendor?.name || '—'}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Planned Cost:</span>
                    <span>{formatCurrency(item.totalPlannedAmount)}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Target Delivery:</span>
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
                Showing {(currentPage - 1) * pageSize + 1} to{' '}
                {Math.min(currentPage * pageSize, totalItems)} of {totalItems} items
              </div>
              <div className={styles.paginationControls}>
                <button
                  type="button"
                  className={styles.paginationButton}
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                >
                  ← Previous
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
                  Next →
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
              Delete Household Item
            </h2>
            <p className={styles.modalText}>
              Are you sure you want to delete &quot;<strong>{deletingItem.name}</strong>&quot;?
            </p>
            <p className={styles.modalWarning}>This action cannot be undone.</p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setDeletingItem(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmDeleteButton}
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete Item'}
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
