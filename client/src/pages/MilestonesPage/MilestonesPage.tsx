import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MilestoneSummary } from '@cornerstone/shared';
import { listMilestones, deleteMilestone } from '../../lib/milestonesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { KeyboardShortcutsHelp } from '../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import { formatDate } from '../../lib/formatters.js';
import { ProjectSubNav } from '../../components/ProjectSubNav/ProjectSubNav.js';
import styles from './MilestonesPage.module.css';

export function MilestonesPage() {
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

  const handleRowClick = (milestoneId: number) => {
    navigate(`/project/milestones/${milestoneId}`);
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
          if (milestones.length > 0) {
            setSelectedIndex((prev) =>
              prev === -1 ? 0 : Math.min(prev + 1, milestones.length - 1),
            );
          }
        },
        description: t('milestones.keyboard.selectNext'),
      },
      {
        key: 'ArrowUp',
        handler: () => {
          if (milestones.length > 0) {
            setSelectedIndex((prev) => (prev === -1 ? 0 : Math.max(prev - 1, 0)));
          }
        },
        description: t('milestones.keyboard.selectPrevious'),
      },
      {
        key: 'Enter',
        handler: () => {
          if (selectedIndex >= 0 && milestones[selectedIndex]) {
            navigate(`/project/milestones/${milestones[selectedIndex].id}`);
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
    [navigate, milestones, selectedIndex, showShortcutsHelp, deletingMilestone, activeMenuId, t],
  );

  useKeyboardShortcuts(shortcuts);

  // Reset selected index when milestones change
  useEffect(() => {
    if (selectedIndex >= milestones.length) {
      setSelectedIndex(-1);
    }
  }, [milestones.length, selectedIndex]);

  if (isLoading && milestones.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t('milestones.loading')}</div>
      </div>
    );
  }

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

      {/* Milestones list */}
      {milestones.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>{t('milestones.empty.noItems')}</h2>
          <p>{t('milestones.empty.noItemsMessage')}</p>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => navigate('/project/milestones/new')}
          >
            {t('milestones.empty.createFirst')}
          </button>
        </div>
      ) : (
        <>
          {/* Desktop table view */}
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('milestones.table.headers.title')}</th>
                  <th>{t('milestones.table.headers.targetDate')}</th>
                  <th>{t('milestones.table.headers.status')}</th>
                  <th>{t('milestones.table.headers.description')}</th>
                  <th className={styles.actionsColumn}>{t('milestones.table.headers.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((milestone, index) => (
                  <tr
                    key={milestone.id}
                    className={`${styles.tableRow} ${index === selectedIndex ? styles.tableRowSelected : ''}`}
                    onClick={() => handleRowClick(milestone.id)}
                  >
                    <td className={styles.titleCell}>{milestone.title}</td>
                    <td>{formatDate(milestone.targetDate)}</td>
                    <td>
                      <span
                        className={`${styles.statusBadge} ${
                          milestone.isCompleted ? styles.statusCompleted : styles.statusPending
                        }`}
                      >
                        {milestone.isCompleted ? t('milestones.status.completed') : t('milestones.status.pending')}
                      </span>
                    </td>
                    <td className={styles.descriptionCell}>
                      {milestone.description
                        ? milestone.description.substring(0, 60) +
                          (milestone.description.length > 60 ? '...' : '')
                        : '—'}
                    </td>
                    <td className={styles.actionsCell} onClick={(e) => e.stopPropagation()}>
                      <div className={styles.actionsMenu}>
                        <button
                          type="button"
                          className={styles.menuButton}
                          onClick={() =>
                            setActiveMenuId(activeMenuId === milestone.id ? null : milestone.id)
                          }
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
                              onClick={(e) => handleDeleteClick(milestone, e)}
                              data-testid={`milestone-delete-${milestone.id}`}
                            >
                              {t('milestones.menu.delete')}
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
            {milestones.map((milestone) => (
              <div
                key={milestone.id}
                className={styles.card}
                onClick={() => handleRowClick(milestone.id)}
              >
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>{milestone.title}</h3>
                  <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.actionsMenu}>
                      <button
                        type="button"
                        className={styles.menuButton}
                        onClick={() =>
                          setActiveMenuId(activeMenuId === milestone.id ? null : milestone.id)
                        }
                        aria-label={t('milestones.menu.actions')}
                      >
                        ⋮
                      </button>
                      {activeMenuId === milestone.id && (
                        <div className={styles.menuDropdown}>
                          <button
                            type="button"
                            className={styles.menuItem}
                            onClick={() => navigate(`/project/milestones/${milestone.id}`)}
                          >
                            {t('milestones.menu.edit')}
                          </button>
                          <button
                            type="button"
                            className={`${styles.menuItem} ${styles.menuItemDanger}`}
                            onClick={(e) => handleDeleteClick(milestone, e)}
                          >
                            {t('milestones.menu.delete')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>{t('milestones.card.targetDate')}</span>
                    <span>{formatDate(milestone.targetDate)}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>{t('milestones.card.status')}</span>
                    <span
                      className={`${styles.statusBadge} ${
                        milestone.isCompleted ? styles.statusCompleted : styles.statusPending
                      }`}
                    >
                      {milestone.isCompleted ? t('milestones.status.completed') : t('milestones.status.pending')}
                    </span>
                  </div>
                  {milestone.description && (
                    <div className={styles.cardRow}>
                      <span className={styles.cardLabel}>{t('milestones.card.description')}</span>
                      <span>
                        {milestone.description.substring(0, 60) +
                          (milestone.description.length > 60 ? '...' : '')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

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
