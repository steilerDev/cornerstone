import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type {
  MilestoneSummary,
  MilestoneDetail,
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
  WorkItemSummary,
  WorkItemDependentSummary,
} from '@cornerstone/shared';
import { getMilestone } from '../../lib/milestonesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type { UseMilestonesResult } from '../../hooks/useMilestones.js';
import { MilestoneForm } from './MilestoneForm.js';
import { MilestoneWorkItemLinker } from './MilestoneWorkItemLinker.js';
import styles from './MilestonePanel.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PanelView = 'list' | 'create' | 'edit' | 'linker';

interface MilestonePanelProps {
  milestones: MilestoneSummary[];
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  hooks: Pick<
    UseMilestonesResult,
    'createMilestone' | 'updateMilestone' | 'deleteMilestone' | 'linkWorkItem' | 'unlinkWorkItem'
  >;
  /** Called after any mutation so the timeline can refetch. */
  onMutated: () => void;
  /** Called when a milestone diamond should be focused. Optional. */
  onMilestoneSelect?: (milestoneId: number) => void;
  /**
   * Map from milestone ID to its projected completion date (latest end date among linked work
   * items). Sourced from the timeline API response. Optional — omit to hide projected dates.
   */
  projectedDates?: ReadonlyMap<number, string | null>;
}

// ---------------------------------------------------------------------------
// Diamond icon for status indicator
// ---------------------------------------------------------------------------

function SmallDiamond({ completed, late }: { completed: boolean; late?: boolean }) {
  let className: string;
  if (completed) {
    className = styles.diamondComplete;
  } else if (late) {
    className = styles.diamondLate;
  } else {
    className = styles.diamondIncomplete;
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 10 10"
      width="10"
      height="10"
      className={className}
      aria-hidden="true"
    >
      <polygon points="5,0 10,5 5,10 0,5" strokeWidth="1.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

interface DeleteConfirmDialogProps {
  milestoneName: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmDialog({
  milestoneName,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const content = (
    <div
      className={styles.deleteOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
    >
      <div className={styles.deleteDialog}>
        <div className={styles.dialogHeader}>
          <h2 id="delete-confirm-title" className={styles.dialogTitle}>
            Delete Milestone
          </h2>
        </div>
        <div className={styles.dialogBody}>
          <p className={styles.deleteDescription}>
            Are you sure you want to delete <strong>&ldquo;{milestoneName}&rdquo;</strong>? This
            will remove the milestone and all its work item links. This action cannot be undone.
          </p>
        </div>
        <div className={styles.dialogFooter}>
          <button
            type="button"
            className={styles.buttonCancel}
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.buttonDanger}
            onClick={onConfirm}
            disabled={isDeleting}
            data-testid="milestone-delete-confirm"
          >
            {isDeleting ? 'Deleting…' : 'Delete Milestone'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

// ---------------------------------------------------------------------------
// Main MilestonePanel component
// ---------------------------------------------------------------------------

export function MilestonePanel({
  milestones,
  isLoading,
  error,
  onClose,
  hooks,
  onMutated,
  onMilestoneSelect,
  projectedDates,
}: MilestonePanelProps) {
  const [view, setView] = useState<PanelView>('list');
  const [editingMilestone, setEditingMilestone] = useState<MilestoneSummary | null>(null);
  const [detailData, setDetailData] = useState<MilestoneDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Form submit state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Delete state
  const [deletingMilestone, setDeletingMilestone] = useState<MilestoneSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Linker state
  const [isLinking, setIsLinking] = useState(false);

  // Close with Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (deletingMilestone) {
          setDeletingMilestone(null);
          return;
        }
        if (view !== 'list') {
          setView('list');
          setEditingMilestone(null);
          setSubmitError(null);
          return;
        }
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [view, deletingMilestone, onClose]);

  // Load milestone detail for edit/link views
  const loadDetail = useCallback(async (milestoneId: number) => {
    setIsLoadingDetail(true);
    try {
      const detail = await getMilestone(milestoneId);
      setDetailData(detail);
    } catch {
      setDetailData(null);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  function handleEditClick(milestone: MilestoneSummary) {
    setEditingMilestone(milestone);
    setSubmitError(null);
    setView('edit');
    void loadDetail(milestone.id);
  }

  function handleLinkerClick(milestone: MilestoneSummary) {
    setEditingMilestone(milestone);
    setView('linker');
    void loadDetail(milestone.id);
  }

  function handleBackToList() {
    setView('list');
    setEditingMilestone(null);
    setDetailData(null);
    setSubmitError(null);
  }

  async function handleCreate(data: CreateMilestoneRequest | UpdateMilestoneRequest) {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await hooks.createMilestone(data as CreateMilestoneRequest);
      if (result) {
        onMutated();
        setView('list');
      } else {
        setSubmitError('Failed to create milestone. Please try again.');
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError(err.error.message ?? 'Failed to create milestone.');
      } else {
        setSubmitError('An unexpected error occurred.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdate(data: CreateMilestoneRequest | UpdateMilestoneRequest) {
    if (!editingMilestone) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await hooks.updateMilestone(
        editingMilestone.id,
        data as UpdateMilestoneRequest,
      );
      if (result) {
        onMutated();
        setView('list');
        setEditingMilestone(null);
      } else {
        setSubmitError('Failed to update milestone. Please try again.');
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError(err.error.message ?? 'Failed to update milestone.');
      } else {
        setSubmitError('An unexpected error occurred.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deletingMilestone) return;
    setIsDeleting(true);
    try {
      const success = await hooks.deleteMilestone(deletingMilestone.id);
      if (success) {
        onMutated();
        setDeletingMilestone(null);
        if (editingMilestone?.id === deletingMilestone.id) {
          setView('list');
          setEditingMilestone(null);
        }
      }
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleLink(workItemId: string) {
    if (!editingMilestone) return;
    setIsLinking(true);
    try {
      await hooks.linkWorkItem(editingMilestone.id, workItemId);
      onMutated();
      await loadDetail(editingMilestone.id);
    } finally {
      setIsLinking(false);
    }
  }

  async function handleUnlink(workItemId: string) {
    if (!editingMilestone) return;
    setIsLinking(true);
    try {
      await hooks.unlinkWorkItem(editingMilestone.id, workItemId);
      onMutated();
      await loadDetail(editingMilestone.id);
    } finally {
      setIsLinking(false);
    }
  }

  // Determine dialog title
  const dialogTitle =
    view === 'create'
      ? 'New Milestone'
      : view === 'edit'
        ? 'Edit Milestone'
        : view === 'linker'
          ? 'Contributing Work Items'
          : 'Milestones';

  const content = (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="milestone-dialog-title"
      data-testid="milestone-panel"
      onClick={(e) => {
        // Close when clicking overlay backdrop
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.dialog}>
        {/* Header */}
        <div className={styles.dialogHeader}>
          <h2 id="milestone-dialog-title" className={styles.dialogTitle}>
            {dialogTitle}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close milestones panel"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              width="20"
              height="20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* ---- LIST VIEW ---- */}
        {view === 'list' && (
          <>
            <div className={styles.dialogBody}>
              {/* Loading */}
              {isLoading && (
                <div className={styles.listLoading} aria-busy="true">
                  Loading milestones…
                </div>
              )}

              {/* Error */}
              {!isLoading && error !== null && (
                <div className={styles.listError} role="alert">
                  {error}
                </div>
              )}

              {/* Empty */}
              {!isLoading && error === null && milestones.length === 0 && (
                <div className={styles.listEmpty} data-testid="milestone-list-empty">
                  <p>No milestones yet</p>
                  <p className={styles.listEmptyHint}>
                    Create a milestone to track major project progress points.
                  </p>
                </div>
              )}

              {/* Milestone list */}
              {!isLoading && error === null && milestones.length > 0 && (
                <ul role="list" className={styles.milestoneList} aria-label="Milestone list">
                  {milestones
                    .slice()
                    .sort(
                      (a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime(),
                    )
                    .map((m) => {
                      const projectedDate = projectedDates?.get(m.id) ?? null;
                      const isLate =
                        !m.isCompleted && projectedDate !== null && projectedDate > m.targetDate;
                      const statusLabel = m.isCompleted
                        ? 'completed'
                        : isLate
                          ? 'late'
                          : 'incomplete';
                      return (
                        <li
                          key={m.id}
                          role="listitem"
                          className={styles.milestoneItem}
                          data-testid="milestone-list-item"
                        >
                          <button
                            type="button"
                            className={styles.milestoneItemButton}
                            onClick={() => {
                              if (onMilestoneSelect) onMilestoneSelect(m.id);
                            }}
                            aria-label={`${m.title}, ${statusLabel}, ${formatDate(m.targetDate)}`}
                          >
                            <span className={styles.milestoneItemLeft}>
                              <SmallDiamond completed={m.isCompleted} late={isLate} />
                              <span className={styles.milestoneItemTitle}>{m.title}</span>
                            </span>
                            <span className={styles.milestoneItemMeta}>
                              <span className={styles.milestoneItemDate}>
                                Target: {formatDate(m.targetDate)}
                              </span>
                              {!m.isCompleted && projectedDates !== undefined && (
                                <span
                                  className={`${styles.milestoneItemProjected} ${isLate ? styles.milestoneItemProjectedLate : ''}`}
                                >
                                  Projected:{' '}
                                  {projectedDate !== null ? formatDate(projectedDate) : '—'}
                                </span>
                              )}
                              {m.workItemCount > 0 && (
                                <span className={styles.milestoneItemCount}>
                                  {m.workItemCount} item{m.workItemCount !== 1 ? 's' : ''}
                                </span>
                              )}
                            </span>
                          </button>
                          <div className={styles.milestoneItemActions}>
                            <button
                              type="button"
                              className={styles.milestoneActionButton}
                              onClick={() => handleLinkerClick(m)}
                              aria-label={`Manage contributing work items for ${m.title}`}
                              title="Manage contributing work items"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                width="14"
                                height="14"
                                fill="none"
                                aria-hidden="true"
                              >
                                <path
                                  d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
                                  fill="currentColor"
                                />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className={styles.milestoneActionButton}
                              onClick={() => handleEditClick(m)}
                              aria-label={`Edit ${m.title}`}
                              title="Edit milestone"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                width="14"
                                height="14"
                                fill="none"
                                aria-hidden="true"
                              >
                                <path
                                  d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
                                  fill="currentColor"
                                />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className={`${styles.milestoneActionButton} ${styles.milestoneActionDanger}`}
                              onClick={() => setDeletingMilestone(m)}
                              aria-label={`Delete ${m.title}`}
                              title="Delete milestone"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                width="14"
                                height="14"
                                fill="none"
                                aria-hidden="true"
                              >
                                <path
                                  d="M6 2l1-1h6l1 1h3v2H3V2h3zM4 6h12l-1 12H5L4 6z"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>

            <div className={styles.dialogFooter}>
              <button
                type="button"
                className={styles.buttonConfirm}
                onClick={() => {
                  setView('create');
                  setSubmitError(null);
                }}
                data-testid="milestone-new-button"
              >
                + New Milestone
              </button>
            </div>
          </>
        )}

        {/* ---- CREATE VIEW ---- */}
        {view === 'create' && (
          <MilestoneForm
            milestone={null}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onSubmit={(data) => void handleCreate(data)}
            onCancel={handleBackToList}
          />
        )}

        {/* ---- EDIT VIEW ---- */}
        {view === 'edit' && editingMilestone !== null && (
          <>
            <MilestoneForm
              milestone={editingMilestone}
              isSubmitting={isSubmitting}
              submitError={submitError}
              onSubmit={(data) => void handleUpdate(data)}
              onCancel={handleBackToList}
            />
            <div className={styles.editFooterExtra}>
              <button
                type="button"
                className={styles.buttonDangerOutline}
                onClick={() => setDeletingMilestone(editingMilestone)}
                disabled={isSubmitting}
              >
                Delete Milestone
              </button>
            </div>
          </>
        )}

        {/* ---- LINKER VIEW ---- */}
        {view === 'linker' && editingMilestone !== null && (
          <MilestoneWorkItemLinker
            milestoneId={editingMilestone.id}
            linkedWorkItems={
              isLoadingDetail
                ? []
                : ((detailData?.workItems as WorkItemSummary[] | undefined) ?? [])
            }
            dependentWorkItems={
              isLoadingDetail
                ? []
                : ((detailData?.dependentWorkItems as WorkItemDependentSummary[] | undefined) ?? [])
            }
            isLinking={isLinking}
            onLink={(id) => void handleLink(id)}
            onUnlink={(id) => void handleUnlink(id)}
            onBack={handleBackToList}
          />
        )}
      </div>

      {/* Delete confirmation dialog */}
      {deletingMilestone !== null && (
        <DeleteConfirmDialog
          milestoneName={deletingMilestone.title}
          isDeleting={isDeleting}
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={() => setDeletingMilestone(null)}
        />
      )}
    </div>
  );

  return createPortal(content, document.body);
}
