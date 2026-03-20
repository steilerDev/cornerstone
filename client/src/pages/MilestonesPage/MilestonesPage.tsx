import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MilestoneSummary } from '@cornerstone/shared';
import { listMilestones, deleteMilestone } from '../../lib/milestonesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { KeyboardShortcutsHelp } from '../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import { useFormatters } from '../../lib/formatters.js';
import { ProjectSubNav } from '../../components/ProjectSubNav/ProjectSubNav.js';
import { DataTable } from '../../components/DataTable/DataTable.js';
import type { ColumnDef } from '../../components/DataTable/DataTable.js';
import { useTableState } from '../../hooks/useTableState.js';
import { useColumnPreferences } from '../../hooks/useColumnPreferences.js';
import styles from './MilestonesPage.module.css';

export function MilestonesPage() {
  const { formatDate } = useFormatters();
  const { t } = useTranslation('schedule');
  const navigate = useNavigate();

  // Data state
  const [milestones, setMilestones] = useState<MilestoneSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Auto-scroll to top when error appears
  useEffect(() => {
    if (error) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [error]);

  // Delete confirmation state
  const [deletingMilestone, setDeletingMilestone] = useState<MilestoneSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Action menu state
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts state
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Table state (no server-side filtering/sorting for milestones)
  const { tableState, setSort, setPage } = useTableState({
    defaultSort: { sortBy: 'targetDate', sortOrder: 'asc' },
  });

  // Column definitions
  const columns: ColumnDef<MilestoneSummary>[] = useMemo(
    () => [
      {
        key: 'title',
        label: t('milestones.table.headers.title'),
        type: 'string',
        defaultVisible: true,
        render: (item) => <span className={styles.titleCell}>{item.title}</span>,
      },
      {
        key: 'targetDate',
        label: t('milestones.table.headers.targetDate'),
        type: 'date',
        sortable: true,
        defaultVisible: true,
        render: (item) => formatDate(item.targetDate),
      },
      {
        key: 'status',
        label: t('milestones.table.headers.status'),
        type: 'enum',
        defaultVisible: true,
        render: (item) => (
          <span
            className={`${styles.statusBadge} ${
              item.isCompleted ? styles.statusCompleted : styles.statusPending
            }`}
          >
            {item.isCompleted
              ? t('milestones.status.completed')
              : t('milestones.status.pending')}
          </span>
        ),
      },
      {
        key: 'description',
        label: t('milestones.table.headers.description'),
        type: 'string',
        defaultVisible: true,
        render: (item) => (
          <span className={styles.descriptionCell}>
            {item.description
              ? item.description.substring(0, 60) +
                (item.description.length > 60 ? '...' : '')
              : '\u2014'}
          </span>
        ),
      },
      {
        key: 'workItemCount',
        label: t('milestones.table.headers.workItems', { defaultValue: 'Work Items' }),
        type: 'number',
        defaultVisible: false,
        render: (item) => item.workItemCount,
      },
    ],
    [t, formatDate],
  );

  const { visibleColumns, toggleColumn } = useColumnPreferences('milestones', columns);

  // Load milestones on mount
  useEffect(() => {
    const loadMilestones = async () => {
      setIsLoading(true);
      setError('');

      try {
        const data = await listMilestones();
        setMilestones(data);
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.error.message);
        } else {
          setError(t('milestones.error'));
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadMilestones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setActiveMenuId(null);
      }
    }

    if (activeMenuId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeMenuId]);

  const reloadMilestones = async () => {
    setIsLoading(true);
    setError('');

    try {
      const data = await listMilestones();
      setMilestones(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('milestones.error'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClick = (milestone: MilestoneSummary, event: React.MouseEvent) => {
    event.stopPropagation();
    setDeletingMilestone(milestone);
  };

  const confirmDelete = async () => {
    if (!deletingMilestone) return;

    setIsDeleting(true);
    setError('');

    try {
      await deleteMilestone(deletingMilestone.id);
      setDeletingMilestone(null);
      reloadMilestones();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('milestones.deleteError'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Client-side sorting
  const sortedMilestones = useMemo(() => {
    const sorted = [...milestones];
    const { sortBy, sortOrder } = tableState.sort;

    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'targetDate':
          cmp = a.targetDate.localeCompare(b.targetDate);
          break;
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        default:
          cmp = a.targetDate.localeCompare(b.targetDate);
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    return sorted;
  }, [milestones, tableState.sort]);

  // Render actions for each row
  const renderActions = (milestone: MilestoneSummary) => (
    <div className={styles.actionsMenu}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={() => setActiveMenuId(activeMenuId === milestone.id ? null : milestone.id)}
        aria-label={t('milestones.menu.actions')}
        data-testid={`milestone-menu-button-${milestone.id}`}
      >
        &#x22EE;
      </button>
      {activeMenuId === milestone.id && (
        <div className={styles.menuDropdown}>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => navigate(`/project/milestones/${milestone.id}`)}
            data-testid={`milestone-edit-${milestone.id}`}
          >
            {t('milestones.menu.edit')}
          </button>
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={(e) => handleDeleteClick(milestone, e)}
            data-testid={`milestone-delete-${milestone.id}`}
          >
            {t('milestones.menu.delete')}
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
        handler: () => navigate('/project/milestones/new'),
        description: t('milestones.keyboard.newMilestone'),
      },
      {
        key: 'ArrowDown',
        handler: () => {
          if (sortedMilestones.length > 0) {
            setSelectedIndex((prev) =>
              prev === -1 ? 0 : Math.min(prev + 1, sortedMilestones.length - 1),
            );
          }
        },
        description: t('milestones.keyboard.selectNext'),
      },
      {
        key: 'ArrowUp',
        handler: () => {
          if (sortedMilestones.length > 0) {
            setSelectedIndex((prev) => (prev === -1 ? 0 : Math.max(prev - 1, 0)));
          }
        },
        description: t('milestones.keyboard.selectPrevious'),
      },
      {
        key: 'Enter',
        handler: () => {
          if (selectedIndex >= 0 && sortedMilestones[selectedIndex]) {
            navigate(`/project/milestones/${sortedMilestones[selectedIndex].id}`);
          }
        },
        description: t('milestones.keyboard.openSelected'),
      },
      {
        key: '?',
        handler: () => setShowShortcutsHelp(true),
        description: t('milestones.keyboard.showShortcuts'),
      },
      {
        key: 'Escape',
        handler: () => {
          if (showShortcutsHelp) {
            setShowShortcutsHelp(false);
          } else if (deletingMilestone) {
            setDeletingMilestone(null);
          } else if (activeMenuId !== null) {
            setActiveMenuId(null);
          } else if (selectedIndex >= 0) {
            setSelectedIndex(-1);
          }
        },
        description: t('milestones.keyboard.closeDialog'),
      },
    ],
    [navigate, sortedMilestones, selectedIndex, showShortcutsHelp, deletingMilestone, activeMenuId, t],
  );

  useKeyboardShortcuts(shortcuts);

  // Reset selected index when milestones change
  useEffect(() => {
    if (selectedIndex >= sortedMilestones.length) {
      setSelectedIndex(-1);
    }
  }, [sortedMilestones.length, selectedIndex]);

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>{t('milestones.page.title')}</h1>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => navigate('/project/milestones/new')}
          data-testid="new-milestone-button"
        >
          {t('milestones.newButton')}
        </button>
      </div>
      <ProjectSubNav />

      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      <DataTable<MilestoneSummary>
        pageKey="milestones"
        columns={columns}
        items={sortedMilestones}
        totalItems={sortedMilestones.length}
        totalPages={1}
        currentPage={1}
        isLoading={isLoading}
        getRowKey={(item) => String(item.id)}
        onRowClick={(item) => navigate(`/project/milestones/${item.id}`)}
        renderActions={renderActions}
        tableState={tableState}
        onSortChange={setSort}
        onPageChange={setPage}
        visibleColumns={visibleColumns}
        onToggleColumn={toggleColumn}
        selectedIndex={selectedIndex}
        getCardTitle={(item) => item.title}
        emptyState={{
          noData: {
            title: t('milestones.empty.noItems'),
            description: t('milestones.empty.noItemsMessage'),
            action: (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => navigate('/project/milestones/new')}
              >
                {t('milestones.empty.createFirst')}
              </button>
            ),
          },
          noResults: {
            title: t('milestones.empty.noItems'),
            description: t('milestones.empty.noItemsMessage'),
          },
        }}
      />

      {/* Delete confirmation modal */}
      {deletingMilestone && (
        <div className={styles.modal} role="dialog" aria-modal="true">
          <div
            className={styles.modalBackdrop}
            onClick={() => !isDeleting && setDeletingMilestone(null)}
          />
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>{t('milestones.delete.confirm')}</h2>
            <p className={styles.modalText}>
              {t('milestones.delete.message')} &quot;<strong>{deletingMilestone.title}</strong>
              &quot;?
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setDeletingMilestone(null)}
                disabled={isDeleting}
              >
                {t('milestones.delete.cancel')}
              </button>
              <button
                type="button"
                className={styles.confirmDeleteButton}
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? t('milestones.delete.deleting') : t('milestones.delete.delete')}
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

export default MilestonesPage;
