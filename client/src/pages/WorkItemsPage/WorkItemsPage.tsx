import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { WorkItemSummary, WorkItemStatus, UserResponse } from '@cornerstone/shared';
import { listWorkItems, deleteWorkItem } from '../../lib/workItemsApi.js';
import { listUsers } from '../../lib/usersApi.js';
import { fetchTags } from '../../lib/tagsApi.js';
import type { TagResponse } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { StatusBadge } from '../../components/StatusBadge/StatusBadge.js';
import { TagPill } from '../../components/TagPill/TagPill.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { KeyboardShortcutsHelp } from '../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import styles from './WorkItemsPage.module.css';

const STATUS_OPTIONS: { value: WorkItemStatus; label: string }[] = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'status', label: 'Status' },
  { value: 'start_date', label: 'Start Date' },
  { value: 'end_date', label: 'End Date' },
  { value: 'created_at', label: 'Created' },
  { value: 'updated_at', label: 'Updated' },
];

export function WorkItemsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Data state
  const [workItems, setWorkItems] = useState<WorkItemSummary[]>([]);
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [tags, setTags] = useState<TagResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const pageSize = 25;

  // Filter and search state from URL
  const searchQuery = searchParams.get('q') || '';
  const statusFilter = searchParams.get('status') as WorkItemStatus | null;
  const assignedUserFilter = searchParams.get('assignedUserId') || '';
  const tagFilter = searchParams.get('tagId') || '';
  const sortBy =
    (searchParams.get('sortBy') as
      | 'title'
      | 'status'
      | 'start_date'
      | 'end_date'
      | 'created_at'
      | 'updated_at'
      | null) || 'created_at';
  const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc';
  const urlPage = parseInt(searchParams.get('page') || '1', 10);

  // Search debounce
  const [searchInput, setSearchInput] = useState(searchQuery);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Delete confirmation state
  const [deletingWorkItem, setDeletingWorkItem] = useState<WorkItemSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Action menu state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts state
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load users and tags on mount
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [usersResponse, tagsResponse] = await Promise.all([listUsers(), fetchTags()]);
        setUsers(usersResponse.users.filter((u) => !u.deactivatedAt));
        setTags(tagsResponse.tags);
      } catch (err) {
        console.error('Failed to load filter options:', err);
      }
    };
    loadFilters();
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

  // Load work items when filters/page changes
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError('');

      try {
        const response = await listWorkItems({
          page: currentPage,
          pageSize,
          status: statusFilter || undefined,
          assignedUserId: assignedUserFilter || undefined,
          tagId: tagFilter || undefined,
          q: searchQuery || undefined,
          sortBy,
          sortOrder,
        });

        setWorkItems(response.items);
        setTotalPages(response.pagination.totalPages);
        setTotalItems(response.pagination.totalItems);
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.error.message);
        } else {
          setError('Failed to load work items. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [searchQuery, statusFilter, assignedUserFilter, tagFilter, sortBy, sortOrder, currentPage]);

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
      const response = await listWorkItems({
        page: currentPage,
        pageSize,
        status: statusFilter || undefined,
        assignedUserId: assignedUserFilter || undefined,
        tagId: tagFilter || undefined,
        q: searchQuery || undefined,
        sortBy,
        sortOrder,
      });

      setWorkItems(response.items);
      setTotalPages(response.pagination.totalPages);
      setTotalItems(response.pagination.totalItems);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to load work items. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

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

  const handleStatusFilterChange = (status: string) => {
    updateSearchParams({ status: status || undefined, page: '1' });
  };

  const handleUserFilterChange = (userId: string) => {
    updateSearchParams({ assignedUserId: userId || undefined, page: '1' });
  };

  const handleTagFilterChange = (tagId: string) => {
    updateSearchParams({ tagId: tagId || undefined, page: '1' });
  };

  const handleSortChange = (field: string) => {
    const newSortOrder = sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc';
    updateSearchParams({ sortBy: field, sortOrder: newSortOrder });
  };

  const handlePageChange = (page: number) => {
    updateSearchParams({ page: page.toString() });
  };

  const handleRowClick = (workItemId: string) => {
    navigate(`/work-items/${workItemId}`);
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
        setError('Failed to delete work item. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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
        handler: () => navigate('/work-items/new'),
        description: 'New work item',
      },
      {
        key: '/',
        handler: () => searchInputRef.current?.focus(),
        description: 'Focus search',
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
        description: 'Select next item',
      },
      {
        key: 'ArrowUp',
        handler: () => {
          if (workItems.length > 0) {
            setSelectedIndex((prev) => (prev === -1 ? 0 : Math.max(prev - 1, 0)));
          }
        },
        description: 'Select previous item',
      },
      {
        key: 'Enter',
        handler: () => {
          if (selectedIndex >= 0 && workItems[selectedIndex]) {
            navigate(`/work-items/${workItems[selectedIndex].id}`);
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
          } else if (deletingWorkItem) {
            setDeletingWorkItem(null);
          } else if (activeMenuId) {
            setActiveMenuId(null);
          } else if (selectedIndex >= 0) {
            setSelectedIndex(-1);
          }
        },
        description: 'Close dialog or cancel',
      },
    ],
    [navigate, workItems, selectedIndex, showShortcutsHelp, deletingWorkItem, activeMenuId],
  );

  useKeyboardShortcuts(shortcuts);

  // Reset selected index when work items change
  useEffect(() => {
    if (selectedIndex >= workItems.length) {
      setSelectedIndex(-1);
    }
  }, [workItems.length, selectedIndex]);

  if (isLoading && workItems.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading work items...</div>
      </div>
    );
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>Work Items</h1>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => navigate('/work-items/new')}
        >
          New Work Item
        </button>
      </div>

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
            placeholder="Search work items..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={styles.searchInput}
            aria-label="Search work items"
          />
        </div>

        <div className={styles.filtersRow}>
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
            <label htmlFor="user-filter" className={styles.filterLabel}>
              Assigned to:
            </label>
            <select
              id="user-filter"
              value={assignedUserFilter}
              onChange={(e) => handleUserFilterChange(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="">All Users</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filter}>
            <label htmlFor="tag-filter" className={styles.filterLabel}>
              Tag:
            </label>
            <select
              id="tag-filter"
              value={tagFilter}
              onChange={(e) => handleTagFilterChange(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="">All Tags</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
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

      {/* Work items list */}
      {workItems.length === 0 ? (
        <div className={styles.emptyState}>
          {searchQuery || statusFilter || assignedUserFilter || tagFilter ? (
            <>
              <h2>No work items match your filters</h2>
              <p>Try adjusting your search or filter criteria.</p>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setSearchInput('');
                  setSearchParams(new URLSearchParams());
                }}
              >
                Clear All Filters
              </button>
            </>
          ) : (
            <>
              <h2>No work items yet</h2>
              <p>Get started by creating your first work item to track construction tasks.</p>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => navigate('/work-items/new')}
              >
                Create First Work Item
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
                  <th className={styles.sortableHeader} onClick={() => handleSortChange('title')}>
                    Title{renderSortIcon('title')}
                  </th>
                  <th className={styles.sortableHeader} onClick={() => handleSortChange('status')}>
                    Status{renderSortIcon('status')}
                  </th>
                  <th>Assigned To</th>
                  <th
                    className={styles.sortableHeader}
                    onClick={() => handleSortChange('start_date')}
                  >
                    Start Date{renderSortIcon('start_date')}
                  </th>
                  <th
                    className={styles.sortableHeader}
                    onClick={() => handleSortChange('end_date')}
                  >
                    End Date{renderSortIcon('end_date')}
                  </th>
                  <th>Tags</th>
                  <th className={styles.actionsColumn}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workItems.map((item, index) => (
                  <tr
                    key={item.id}
                    className={`${styles.tableRow} ${index === selectedIndex ? styles.tableRowSelected : ''}`}
                    onClick={() => handleRowClick(item.id)}
                  >
                    <td className={styles.titleCell}>{item.title}</td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>{item.assignedUser?.displayName || '—'}</td>
                    <td>{formatDate(item.startDate)}</td>
                    <td>{formatDate(item.endDate)}</td>
                    <td>
                      <div className={styles.tagsCell}>
                        {item.tags.length > 0
                          ? item.tags.map((tag) => (
                              <TagPill key={tag.id} name={tag.name} color={tag.color} />
                            ))
                          : '—'}
                      </div>
                    </td>
                    <td className={styles.actionsCell} onClick={(e) => e.stopPropagation()}>
                      <div className={styles.actionsMenu}>
                        <button
                          type="button"
                          className={styles.menuButton}
                          onClick={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)}
                          aria-label="Actions menu"
                        >
                          ⋮
                        </button>
                        {activeMenuId === item.id && (
                          <div className={styles.menuDropdown}>
                            <button
                              type="button"
                              className={styles.menuItem}
                              onClick={() => navigate(`/work-items/${item.id}/edit`)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className={`${styles.menuItem} ${styles.menuItemDanger}`}
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
            {workItems.map((item) => (
              <div key={item.id} className={styles.card} onClick={() => handleRowClick(item.id)}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>{item.title}</h3>
                  <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.actionsMenu}>
                      <button
                        type="button"
                        className={styles.menuButton}
                        onClick={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)}
                        aria-label="Actions menu"
                      >
                        ⋮
                      </button>
                      {activeMenuId === item.id && (
                        <div className={styles.menuDropdown}>
                          <button
                            type="button"
                            className={styles.menuItem}
                            onClick={() => navigate(`/work-items/${item.id}/edit`)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={`${styles.menuItem} ${styles.menuItemDanger}`}
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
                    <span className={styles.cardLabel}>Status:</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Assigned:</span>
                    <span>{item.assignedUser?.displayName || '—'}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Start:</span>
                    <span>{formatDate(item.startDate)}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>End:</span>
                    <span>{formatDate(item.endDate)}</span>
                  </div>
                  {item.tags.length > 0 && (
                    <div className={styles.cardRow}>
                      <span className={styles.cardLabel}>Tags:</span>
                      <div className={styles.tagsCell}>
                        {item.tags.map((tag) => (
                          <TagPill key={tag.id} name={tag.name} color={tag.color} />
                        ))}
                      </div>
                    </div>
                  )}
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
      {deletingWorkItem && (
        <div className={styles.modal} role="dialog" aria-modal="true">
          <div
            className={styles.modalBackdrop}
            onClick={() => !isDeleting && setDeletingWorkItem(null)}
          />
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>Delete Work Item</h2>
            <p className={styles.modalText}>
              Are you sure you want to delete &quot;<strong>{deletingWorkItem.title}</strong>
              &quot;?
            </p>
            <p className={styles.modalWarning}>
              This will also delete all associated subtasks, dependencies, and comments. This action
              cannot be undone.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setDeletingWorkItem(null)}
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
                {isDeleting ? 'Deleting...' : 'Delete Work Item'}
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
