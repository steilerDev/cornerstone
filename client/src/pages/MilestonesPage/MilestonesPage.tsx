import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MilestoneSummary } from '@cornerstone/shared';
import type { ColumnDef, TableState } from '../../components/DataTable/DataTable.js';
import { DataTable } from '../../components/DataTable/DataTable.js';
import { Badge, type BadgeVariantMap } from '../../components/Badge/Badge.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import { Modal } from '../../components/Modal/Modal.js';
import { listMilestones, deleteMilestone } from '../../lib/milestonesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { KeyboardShortcutsHelp } from '../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import { useFormatters } from '../../lib/formatters.js';
import { ProjectSubNav } from '../../components/ProjectSubNav/ProjectSubNav.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './MilestonesPage.module.css';

export function MilestonesPage() {
  const { formatDate } = useFormatters();
  const { t } = useTranslation('schedule');
  const navigate = useNavigate();

  // Data state
  const [milestones, setMilestones] = useState<MilestoneSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Delete confirmation state
  const [deletingMilestone, setDeletingMilestone] = useState<MilestoneSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Action menu state
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);

  // Keyboard shortcuts state
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Table state
  const [tableState, setTableState] = useState<TableState>({
    search: '',
    filters: new Map(),
    sortBy: null,
    sortDir: null,
    page: 1,
    pageSize: 100,
  });

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

  const handleDeleteClick = (milestone: MilestoneSummary) => {
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

  // Status badge variants
  const milestoneStatusVariants = useMemo(
    (): BadgeVariantMap => ({
      completed: {
        label: t('milestones.status.completed'),
        className: badgeStyles.milestoneCompleted,
      },
      pending: {
        label: t('milestones.status.pending'),
        className: badgeStyles.milestonePending,
      },
    }),
    [t],
  );

  // Client-side filtering and sorting
  const filtered = useMemo(() => {
    let result = [...milestones];

    // Text search
    const searchLower = tableState.search.toLowerCase();
    if (searchLower) {
      result = result.filter(
        (m) =>
          m.title.toLowerCase().includes(searchLower) ||
          (m.description && m.description.toLowerCase().includes(searchLower)),
      );
    }

    // Status filter
    const statusFilter = tableState.filters.get('status')?.value;
    if (statusFilter) {
      result = result.filter((m) => {
        if (statusFilter === 'completed') return m.isCompleted;
        if (statusFilter === 'pending') return !m.isCompleted;
        return true;
      });
    }

    // Date range filter (format: "from:YYYY-MM-DD,to:YYYY-MM-DD")
    const dateFilter = tableState.filters.get('targetDate')?.value;
    if (dateFilter) {
      const match = dateFilter.match(/from:([^,]+)(?:,to:(.+))?/);
      if (match) {
        const fromDate = match[1] ? new Date(match[1]) : null;
        const toDate = match[2] ? new Date(match[2]) : null;

        result = result.filter((m) => {
          const mDate = new Date(m.targetDate);
          if (fromDate && mDate < fromDate) return false;
          if (toDate && mDate > toDate) return false;
          return true;
        });
      }
    }

    // Sorting
    if (tableState.sortBy) {
      result.sort((a, b) => {
        let aVal: unknown;
        let bVal: unknown;

        if (tableState.sortBy === 'title') {
          aVal = a.title;
          bVal = b.title;
        } else if (tableState.sortBy === 'targetDate') {
          aVal = new Date(a.targetDate).getTime();
          bVal = new Date(b.targetDate).getTime();
        } else if (tableState.sortBy === 'isCompleted') {
          aVal = a.isCompleted ? 1 : 0;
          bVal = b.isCompleted ? 1 : 0;
        } else if (tableState.sortBy === 'workItemCount') {
          aVal = a.workItemCount ?? 0;
          bVal = b.workItemCount ?? 0;
        }

        if (aVal === bVal) return 0;
        const comparison = (aVal as number) > (bVal as number) ? 1 : -1;
        return tableState.sortDir === 'desc' ? -comparison : comparison;
      });
    }

    return result;
  }, [milestones, tableState]);

  // Column definitions
  const columns = useMemo(
    (): ColumnDef<MilestoneSummary>[] => [
      {
        key: 'title',
        label: t('milestones.table.headers.title'),
        sortable: true,
        filterable: true,
        filterType: 'string',
        defaultVisible: true,
        render: (m) => m.title,
      },
      {
        key: 'targetDate',
        label: t('milestones.table.headers.targetDate'),
        sortable: true,
        filterable: true,
        filterType: 'date',
        defaultVisible: true,
        render: (m) => formatDate(m.targetDate),
      },
      {
        key: 'status',
        label: t('milestones.table.headers.status'),
        sortable: true,
        sortKey: 'isCompleted',
        filterable: true,
        filterType: 'enum',
        filterParamKey: 'status',
        enumOptions: [
          { value: 'completed', label: t('milestones.status.completed') },
          { value: 'pending', label: t('milestones.status.pending') },
        ],
        defaultVisible: true,
        render: (m) => (
          <Badge
            variants={milestoneStatusVariants}
            value={m.isCompleted ? 'completed' : 'pending'}
          />
        ),
      },
      {
        key: 'workItemCount',
        label: t('milestones.table.headers.linkedItems'),
        sortable: true,
        defaultVisible: true,
        render: (m) => m.workItemCount ?? 0,
      },
      {
        key: 'description',
        label: t('milestones.table.headers.description'),
        sortable: false,
        defaultVisible: true,
        render: (m) => {
          if (!m.description) return '—';
          return m.description.length > 60 ? `${m.description.substring(0, 60)}...` : m.description;
        },
      },
      {
        key: 'completedAt',
        label: t('milestones.table.headers.completedAt'),
        sortable: false,
        defaultVisible: false,
        render: (m) => (m.completedAt ? formatDate(m.completedAt) : '—'),
      },
    ],
    [t, formatDate, milestoneStatusVariants],
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
  const renderActions = (milestone: MilestoneSummary) => (
    <div className={styles.actionsMenu}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={() => setActiveMenuId(activeMenuId === milestone.id ? null : milestone.id)}
        aria-label={t('milestones.menu.actions')}
        data-testid={`milestone-menu-button-${milestone.id}`}
      >
        ⋮
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
            onClick={() => handleDeleteClick(milestone)}
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
          }
        },
        description: t('milestones.keyboard.closeDialog'),
      },
    ],
    [navigate, showShortcutsHelp, deletingMilestone, activeMenuId, t],
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h1 className={styles.pageTitle}>{t('milestones.page.title')}</h1>
          <button
            type="button"
            className={sharedStyles.btnPrimary}
            onClick={() => navigate('/project/milestones/new')}
            data-testid="new-milestone-button"
          >
            {t('milestones.newButton')}
          </button>
        </div>
        <ProjectSubNav />

        <DataTable<MilestoneSummary>
        pageKey="milestones"
        columns={columns}
        items={filtered}
        totalItems={filtered.length}
        totalPages={1}
        currentPage={1}
        isLoading={isLoading}
        error={error}
        getRowKey={(m) => String(m.id)}
        onRowClick={(m) => navigate(`/project/milestones/${m.id}`)}
        renderActions={renderActions}
        tableState={tableState}
        onStateChange={setTableState}
        emptyState={{
          message: t('milestones.empty.noItems'),
          description: t('milestones.empty.noItemsMessage'),
          action: {
            label: t('milestones.empty.createFirst'),
            onClick: () => navigate('/project/milestones/new'),
          },
        }}
      />

      {/* Delete confirmation modal */}
      {deletingMilestone && (
        <Modal
          title={t('milestones.delete.confirm')}
          onClose={() => !isDeleting && setDeletingMilestone(null)}
          footer={
            <>
              <button
                type="button"
                className={sharedStyles.btnSecondary}
                onClick={() => setDeletingMilestone(null)}
                disabled={isDeleting}
              >
                {t('milestones.delete.cancel')}
              </button>
              <button
                type="button"
                className={sharedStyles.btnConfirmDelete}
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? t('milestones.delete.deleting') : t('milestones.delete.delete')}
              </button>
            </>
          }
        >
          <p>
            {t('milestones.delete.message')} &quot;<strong>{deletingMilestone.title}</strong>
            &quot;?
          </p>
        </Modal>
      )}

      {/* Keyboard shortcuts help */}
      {showShortcutsHelp && (
        <KeyboardShortcutsHelp shortcuts={shortcuts} onClose={() => setShowShortcutsHelp(false)} />
      )}
      </div>
    </div>
  );
}

export default MilestonesPage;
