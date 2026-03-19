import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { WorkItemSummary, WorkItemStatus, UserResponse } from '@cornerstone/shared';
import { listWorkItems, deleteWorkItem } from '../../lib/workItemsApi.js';
import { listUsers } from '../../lib/usersApi.js';
import { fetchTags } from '../../lib/tagsApi.js';
import type { TagResponse } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { Badge } from '../../components/Badge/Badge.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import { TagPill } from '../../components/TagPill/TagPill.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { KeyboardShortcutsHelp } from '../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import { useFormatters } from '../../lib/formatters.js';
import { ProjectSubNav } from '../../components/ProjectSubNav/ProjectSubNav.js';
import styles from './WorkItemsPage.module.css';

export function WorkItemsPage() {
  const { formatCurrency, formatDate, formatTime, formatDateTime } = useFormatters();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation('workItems');

  // Data state
  const [workItems, setWorkItems] = useState<WorkItemSummary[]>([]);
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [tags, setTags] = useState<TagResponse[]>([]);
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
  const statusFilter = searchParams.get('status') as WorkItemStatus | null;
  const assignedUserFilter = searchParams.get('assignedUserId') || '';
  const tagFilter = searchParams.get('tagId') || '';
  const noBudgetFilter = searchParams.get('noBudget') === 'true';
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
          noBudget: noBudgetFilter || undefined,
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
  }, [searchQuery, statusFilter, assignedUserFilter, tagFilter, noBudgetFilter, sortBy, sortOrder, currentPage]);

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
        noBudget: noBudgetFilter || undefined,
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

  const handleNoBudgetFilterChange = (checked: boolean) => {
    updateSearchParams({ noBudget: checked ? 'true' : undefined, page: '1' });
  };

  const handleSortChange = (field: string) => {
    const newSortOrder = sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc';
    updateSearchParams({ sortBy: field, sortOrder: newSortOrder });
  };

  const handlePageChange = (page: number) => {
    updateSearchParams({ page: page.toString() });
  };

  const handleRowClick = (workItemId: string) => {
    navigate(`/project/work-items/${workItemId}`);
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

  const renderSortIcon = (field: string) => {
    if (sortBy !== field) return null;
    return sortOrder === 'asc' ? ' ↑' : ' ↓';
  };

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
    [navigate, workItems, selectedIndex, showShortcutsHelp, deletingWorkItem, activeMenuId, t],
  );

  useKeyboardShortcuts(shortcuts);

  // Reset selected index when work items change
  useEffect(() => {
    if (selectedIndex >= workItems.length) {
      setSelectedIndex(-1);
    }
  }, [workItems.length, selectedIndex]);

  // Build status options inside component
  const STATUS_OPTIONS: { value: WorkItemStatus; label: string }[] = useMemo(
    () => [
      { value: 'not_started', label: t('list.sortOptions.status') },
      { value: 'in_progress', label: t('create.fields.statusOptions.inProgress') },
      { value: 'completed', label: t('create.fields.statusOptions.completed') },
    ],
    [t],
  );

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

  if (isLoading && workItems.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t('list.loading')}</div>
      </div>
    );
  }

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

      {/* Search and filters */}
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
              value={statusFilter || ''}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
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
              value={assignedUserFilter}
              onChange={(e) => handleUserFilterChange(e.target.value)}
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
            <label htmlFor="tag-filter" className={styles.filterLabel}>
              {t('list.filters.tag')}
            </label>
            <select
              id="tag-filter"
              value={tagFilter}
              onChange={(e) => handleTagFilterChange(e.target.value)}
              className={styles.filterSelect}
            >
              <option value="">{t('list.filters.allTags')}</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.filter}>
            <label className={styles.filterLabel}>
              <input
                type="checkbox"
                checked={noBudgetFilter}
                onChange={(e) => handleNoBudgetFilterChange(e.target.checked)}
                aria-label={t('list.filters.noBudgetAriaLabel')}
              />
              {' '}
              {t('list.filters.noBudget')}
            </label>
          </div>

          <div className={styles.filter}>
            <label htmlFor="sort-filter" className={styles.filterLabel}>
              {t('list.filters.sortBy')}
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
            aria-label={t('list.filters.toggleSortOrder')}
          >
            {sortOrder === 'asc'
              ? t('list.filters.sortAscending')
              : t('list.filters.sortDescending')}
          </button>
        </div>
      </div>

      {/* Work items list */}
      {workItems.length === 0 ? (
        <div className={styles.emptyState}>
          {searchQuery || statusFilter || assignedUserFilter || tagFilter || noBudgetFilter ? (
            <>
              <h2>{t('list.empty.noMatchTitle')}</h2>
              <p>{t('list.empty.noMatchText')}</p>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setSearchInput('');
                  setSearchParams(new URLSearchParams());
                }}
              >
                {t('list.empty.clearFilters')}
              </button>
            </>
          ) : (
            <>
              <h2>{t('list.empty.noItemsTitle')}</h2>
              <p>{t('list.empty.noItemsText')}</p>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => navigate('/project/work-items/new')}
              >
                {t('list.empty.createFirst')}
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
                    {t('list.table.title')}
                    {renderSortIcon('title')}
                  </th>
                  <th className={styles.sortableHeader} onClick={() => handleSortChange('status')}>
                    {t('list.table.status')}
                    {renderSortIcon('status')}
                  </th>
                  <th>{t('list.table.assignedTo')}</th>
                  <th
                    className={styles.sortableHeader}
                    onClick={() => handleSortChange('start_date')}
                  >
                    {t('list.table.startDate')}
                    {renderSortIcon('start_date')}
                  </th>
                  <th
                    className={styles.sortableHeader}
                    onClick={() => handleSortChange('end_date')}
                  >
                    {t('list.table.endDate')}
                    {renderSortIcon('end_date')}
                  </th>
                  <th>{t('list.table.tags')}</th>
                  <th>{t('list.table.budgetLines')}</th>
                  <th className={styles.actionsColumn}>{t('list.table.actions')}</th>
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
                      <Badge variants={WORK_ITEM_STATUS_VARIANTS} value={item.status} />
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
                    <td>{item.budgetLineCount > 0 ? item.budgetLineCount : '—'}</td>
                    <td className={styles.actionsCell} onClick={(e) => e.stopPropagation()}>
                      <div className={styles.actionsMenu}>
                        <button
                          type="button"
                          className={styles.menuButton}
                          onClick={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)}
                          aria-label={t('list.actions.actionsMenu')}
                        >
                          ⋮
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
                        aria-label={t('list.actions.actionsMenu')}
                      >
                        ⋮
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
                  </div>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>{t('list.card.status')}</span>
                    <Badge variants={WORK_ITEM_STATUS_VARIANTS} value={item.status} />
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>{t('list.card.assigned')}</span>
                    <span>{item.assignedUser?.displayName || '—'}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>{t('list.card.start')}</span>
                    <span>{formatDate(item.startDate)}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>{t('list.card.end')}</span>
                    <span>{formatDate(item.endDate)}</span>
                  </div>
                  {item.tags.length > 0 && (
                    <div className={styles.cardRow}>
                      <span className={styles.cardLabel}>{t('list.card.tags')}</span>
                      <div className={styles.tagsCell}>
                        {item.tags.map((tag) => (
                          <TagPill key={tag.id} name={tag.name} color={tag.color} />
                        ))}
                      </div>
                    </div>
                  )}
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>{t('list.card.budgetLines')}</span>
                    <span>{item.budgetLineCount > 0 ? item.budgetLineCount : '—'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <div className={styles.paginationInfo}>
                {t('list.pagination.showing', {
                  from: (currentPage - 1) * pageSize + 1,
                  to: Math.min(currentPage * pageSize, totalItems),
                  total: totalItems,
                })}
              </div>
              <div className={styles.paginationControls}>
                <button
                  type="button"
                  className={styles.paginationButton}
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label={t('list.pagination.previousAriaLabel')}
                >
                  {t('list.pagination.previous')}
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
                  aria-label={t('list.pagination.nextAriaLabel')}
                >
                  {t('list.pagination.next')}
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
