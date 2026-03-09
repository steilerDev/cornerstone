import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MilestoneSummary } from '@cornerstone/shared';
import { listMilestones, deleteMilestone } from '../../lib/milestonesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { KeyboardShortcutsHelp } from '../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import { formatDate } from '../../lib/formatters.js';
import { ProjectSubNav } from '../../components/ProjectSubNav/ProjectSubNav.js';
import styles from './MilestonesPage.module.css';

export function MilestonesPage() {
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
          setError('Failed to load milestones. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadMilestones();
  }, []);

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
        setError('Failed to load milestones. Please try again.');
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
        setError('Failed to delete milestone. Please try again.');
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
        description: 'New milestone',
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
        description: 'Select next item',
      },
      {
        key: 'ArrowUp',
        handler: () => {
          if (milestones.length > 0) {
            setSelectedIndex((prev) => (prev === -1 ? 0 : Math.max(prev - 1, 0)));
          }
        },
        description: 'Select previous item',
      },
      {
        key: 'Enter',
        handler: () => {
          if (selectedIndex >= 0 && milestones[selectedIndex]) {
            navigate(`/project/milestones/${milestones[selectedIndex].id}`);
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
          } else if (deletingMilestone) {
            setDeletingMilestone(null);
          } else if (activeMenuId !== null) {
            setActiveMenuId(null);
          } else if (selectedIndex >= 0) {
            setSelectedIndex(-1);
          }
        },
        description: 'Close dialog or cancel',
      },
    ],
    [navigate, milestones, selectedIndex, showShortcutsHelp, deletingMilestone, activeMenuId],
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
        <div className={styles.loading}>Loading milestones...</div>
      </div>
    );
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>Project</h1>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => navigate('/project/milestones/new')}
          data-testid="new-milestone-button"
        >
          New Milestone
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
          <h2>No milestones yet</h2>
          <p>Create your first milestone to mark major project progress points.</p>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => navigate('/project/milestones/new')}
          >
            Create First Milestone
          </button>
        </div>
      ) : (
        <>
          {/* Desktop table view */}
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Target Date</th>
                  <th>Status</th>
                  <th>Description</th>
                  <th className={styles.actionsColumn}>Actions</th>
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
                        {milestone.isCompleted ? 'Completed' : 'Pending'}
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
                          aria-label="Actions menu"
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
                              Edit
                            </button>
                            <button
                              type="button"
                              className={`${styles.menuItem} ${styles.menuItemDanger}`}
                              onClick={(e) => handleDeleteClick(milestone, e)}
                              data-testid={`milestone-delete-${milestone.id}`}
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
                        aria-label="Actions menu"
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
                            Edit
                          </button>
                          <button
                            type="button"
                            className={`${styles.menuItem} ${styles.menuItemDanger}`}
                            onClick={(e) => handleDeleteClick(milestone, e)}
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
                    <span className={styles.cardLabel}>Target Date:</span>
                    <span>{formatDate(milestone.targetDate)}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Status:</span>
                    <span
                      className={`${styles.statusBadge} ${
                        milestone.isCompleted ? styles.statusCompleted : styles.statusPending
                      }`}
                    >
                      {milestone.isCompleted ? 'Completed' : 'Pending'}
                    </span>
                  </div>
                  {milestone.description && (
                    <div className={styles.cardRow}>
                      <span className={styles.cardLabel}>Description:</span>
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
            <h2 className={styles.modalTitle}>Delete Milestone</h2>
            <p className={styles.modalText}>
              Are you sure you want to delete &quot;<strong>{deletingMilestone.title}</strong>
              &quot;?
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setDeletingMilestone(null)}
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
                {isDeleting ? 'Deleting...' : 'Delete Milestone'}
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
