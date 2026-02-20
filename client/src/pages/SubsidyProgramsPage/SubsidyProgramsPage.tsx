import { useState, useEffect, type FormEvent } from 'react';
import type {
  SubsidyProgram,
  SubsidyApplicationStatus,
  SubsidyReductionType,
} from '@cornerstone/shared';
import type { BudgetCategory } from '@cornerstone/shared';
import {
  fetchSubsidyPrograms,
  createSubsidyProgram,
  updateSubsidyProgram,
  deleteSubsidyProgram,
} from '../../lib/subsidyProgramsApi.js';
import { fetchBudgetCategories } from '../../lib/budgetCategoriesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import styles from './SubsidyProgramsPage.module.css';

// ---- Display helpers ----

const STATUS_LABELS: Record<SubsidyApplicationStatus, string> = {
  eligible: 'Eligible',
  applied: 'Applied',
  approved: 'Approved',
  received: 'Received',
  rejected: 'Rejected',
};

const REDUCTION_TYPE_LABELS: Record<SubsidyReductionType, string> = {
  percentage: 'Percentage (%)',
  fixed: 'Fixed Amount ($)',
};

function formatReduction(reductionType: SubsidyReductionType, reductionValue: number): string {
  if (reductionType === 'percentage') {
    return `${reductionValue}%`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(reductionValue);
}

function formatDeadline(deadline: string | null): string {
  if (!deadline) return '';
  const date = new Date(deadline);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getStatusClassName(
  cssStyles: Record<string, string>,
  status: SubsidyApplicationStatus,
): string {
  const map: Record<SubsidyApplicationStatus, string> = {
    eligible: cssStyles.statusEligible ?? '',
    applied: cssStyles.statusApplied ?? '',
    approved: cssStyles.statusApproved ?? '',
    received: cssStyles.statusReceived ?? '',
    rejected: cssStyles.statusRejected ?? '',
  };
  return map[status] ?? '';
}

// ---- Editing state shape ----

type EditingProgram = {
  id: string;
  name: string;
  description: string;
  eligibility: string;
  reductionType: SubsidyReductionType;
  reductionValue: string;
  applicationStatus: SubsidyApplicationStatus;
  applicationDeadline: string;
  notes: string;
  categoryIds: string[];
};

function programToEditState(program: SubsidyProgram): EditingProgram {
  return {
    id: program.id,
    name: program.name,
    description: program.description ?? '',
    eligibility: program.eligibility ?? '',
    reductionType: program.reductionType,
    reductionValue: String(program.reductionValue),
    applicationStatus: program.applicationStatus,
    applicationDeadline: program.applicationDeadline
      ? program.applicationDeadline.substring(0, 10)
      : '',
    notes: program.notes ?? '',
    categoryIds: program.applicableCategories.map((c) => c.id),
  };
}

// ---- Component ----

export function SubsidyProgramsPage() {
  const [programs, setPrograms] = useState<SubsidyProgram[]>([]);
  const [allCategories, setAllCategories] = useState<BudgetCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newEligibility, setNewEligibility] = useState('');
  const [newReductionType, setNewReductionType] = useState<SubsidyReductionType>('percentage');
  const [newReductionValue, setNewReductionValue] = useState('');
  const [newApplicationStatus, setNewApplicationStatus] =
    useState<SubsidyApplicationStatus>('eligible');
  const [newApplicationDeadline, setNewApplicationDeadline] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newCategoryIds, setNewCategoryIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>('');

  // Edit state
  const [editingProgram, setEditingProgram] = useState<EditingProgram | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string>('');

  // Delete confirmation state
  const [deletingProgramId, setDeletingProgramId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    setError('');

    try {
      const [programsResponse, categoriesResponse] = await Promise.all([
        fetchSubsidyPrograms(),
        fetchBudgetCategories(),
      ]);
      setPrograms(programsResponse.subsidyPrograms);
      setAllCategories(categoriesResponse.categories);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to load subsidy programs. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetCreateForm = () => {
    setNewName('');
    setNewDescription('');
    setNewEligibility('');
    setNewReductionType('percentage');
    setNewReductionValue('');
    setNewApplicationStatus('eligible');
    setNewApplicationDeadline('');
    setNewNotes('');
    setNewCategoryIds([]);
    setCreateError('');
  };

  const toggleNewCategory = (categoryId: string) => {
    setNewCategoryIds((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId],
    );
  };

  const toggleEditCategory = (categoryId: string) => {
    if (!editingProgram) return;
    setEditingProgram({
      ...editingProgram,
      categoryIds: editingProgram.categoryIds.includes(categoryId)
        ? editingProgram.categoryIds.filter((id) => id !== categoryId)
        : [...editingProgram.categoryIds, categoryId],
    });
  };

  const handleCreateProgram = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError('');
    setSuccessMessage('');

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setCreateError('Program name is required');
      return;
    }

    const reductionValueNum = parseFloat(newReductionValue);
    if (isNaN(reductionValueNum) || reductionValueNum < 0) {
      setCreateError('Reduction value must be a non-negative number');
      return;
    }

    if (newReductionType === 'percentage' && reductionValueNum > 100) {
      setCreateError('Percentage reduction cannot exceed 100%');
      return;
    }

    setIsCreating(true);

    try {
      const created = await createSubsidyProgram({
        name: trimmedName,
        description: newDescription.trim() || null,
        eligibility: newEligibility.trim() || null,
        reductionType: newReductionType,
        reductionValue: reductionValueNum,
        applicationStatus: newApplicationStatus,
        applicationDeadline: newApplicationDeadline || null,
        notes: newNotes.trim() || null,
        categoryIds: newCategoryIds,
      });
      setPrograms([...programs, created]);
      resetCreateForm();
      setShowCreateForm(false);
      setSuccessMessage(`Subsidy program "${created.name}" created successfully`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.error.message);
      } else {
        setCreateError('Failed to create subsidy program. Please try again.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (program: SubsidyProgram) => {
    setEditingProgram(programToEditState(program));
    setUpdateError('');
    setSuccessMessage('');
  };

  const cancelEdit = () => {
    setEditingProgram(null);
    setUpdateError('');
  };

  const handleUpdateProgram = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingProgram) return;

    setUpdateError('');
    setSuccessMessage('');

    const trimmedName = editingProgram.name.trim();
    if (!trimmedName) {
      setUpdateError('Program name is required');
      return;
    }

    const reductionValueNum = parseFloat(editingProgram.reductionValue);
    if (isNaN(reductionValueNum) || reductionValueNum < 0) {
      setUpdateError('Reduction value must be a non-negative number');
      return;
    }

    if (editingProgram.reductionType === 'percentage' && reductionValueNum > 100) {
      setUpdateError('Percentage reduction cannot exceed 100%');
      return;
    }

    setIsUpdating(true);

    try {
      const updated = await updateSubsidyProgram(editingProgram.id, {
        name: trimmedName,
        description: editingProgram.description.trim() || null,
        eligibility: editingProgram.eligibility.trim() || null,
        reductionType: editingProgram.reductionType,
        reductionValue: reductionValueNum,
        applicationStatus: editingProgram.applicationStatus,
        applicationDeadline: editingProgram.applicationDeadline || null,
        notes: editingProgram.notes.trim() || null,
        categoryIds: editingProgram.categoryIds,
      });
      setPrograms(programs.map((p) => (p.id === updated.id ? updated : p)));
      setEditingProgram(null);
      setSuccessMessage(`Subsidy program "${updated.name}" updated successfully`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setUpdateError(err.error.message);
      } else {
        setUpdateError('Failed to update subsidy program. Please try again.');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const openDeleteConfirm = (programId: string) => {
    setDeletingProgramId(programId);
    setDeleteError('');
    setSuccessMessage('');
  };

  const closeDeleteConfirm = () => {
    if (!isDeleting) {
      setDeletingProgramId(null);
      setDeleteError('');
    }
  };

  const handleDeleteProgram = async (programId: string) => {
    setIsDeleting(true);
    setDeleteError('');

    try {
      await deleteSubsidyProgram(programId);
      const deleted = programs.find((p) => p.id === programId);
      setPrograms(programs.filter((p) => p.id !== programId));
      setDeletingProgramId(null);
      setSuccessMessage(`Subsidy program "${deleted?.name}" deleted successfully`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setDeleteError(
            'This subsidy program cannot be deleted because it is currently referenced by one or more budget entries.',
          );
        } else {
          setDeleteError(err.error.message);
        }
      } else {
        setDeleteError('Failed to delete subsidy program. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading subsidy programs...</div>
      </div>
    );
  }

  if (error && programs.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>Error</h2>
          <p>{error}</p>
          <button type="button" className={styles.button} onClick={() => void loadData()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Subsidy Programs</h1>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              setShowCreateForm(true);
              setCreateError('');
            }}
            disabled={showCreateForm}
          >
            Add Program
          </button>
        </div>

        {successMessage && (
          <div className={styles.successBanner} role="alert">
            {successMessage}
          </div>
        )}

        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
          </div>
        )}

        {/* Create form */}
        {showCreateForm && (
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>New Subsidy Program</h2>
            <p className={styles.cardDescription}>
              Subsidy programs represent government or institutional programs that reduce
              construction costs through percentage or fixed-amount reductions.
            </p>

            {createError && (
              <div className={styles.errorBanner} role="alert">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateProgram} className={styles.form}>
              {/* Row 1: Name */}
              <div className={styles.field}>
                <label htmlFor="programName" className={styles.label}>
                  Name <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  id="programName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className={styles.input}
                  placeholder="e.g., Energy Efficiency Rebate Program"
                  maxLength={200}
                  disabled={isCreating}
                  autoFocus
                />
              </div>

              {/* Row 2: Reduction type + value */}
              <div className={styles.formRow}>
                <div className={styles.fieldSelect}>
                  <label htmlFor="reductionType" className={styles.label}>
                    Reduction Type <span className={styles.required}>*</span>
                  </label>
                  <select
                    id="reductionType"
                    value={newReductionType}
                    onChange={(e) => setNewReductionType(e.target.value as SubsidyReductionType)}
                    className={styles.select}
                    disabled={isCreating}
                  >
                    {Object.entries(REDUCTION_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.fieldNarrow}>
                  <label htmlFor="reductionValue" className={styles.label}>
                    {newReductionType === 'percentage' ? 'Value (%)' : 'Value ($)'}{' '}
                    <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="number"
                    id="reductionValue"
                    value={newReductionValue}
                    onChange={(e) => setNewReductionValue(e.target.value)}
                    className={styles.input}
                    placeholder={newReductionType === 'percentage' ? '15' : '5000'}
                    min={0}
                    max={newReductionType === 'percentage' ? 100 : undefined}
                    step={newReductionType === 'percentage' ? '0.01' : '0.01'}
                    disabled={isCreating}
                  />
                </div>

                <div className={styles.fieldSelect}>
                  <label htmlFor="applicationStatus" className={styles.label}>
                    Application Status
                  </label>
                  <select
                    id="applicationStatus"
                    value={newApplicationStatus}
                    onChange={(e) =>
                      setNewApplicationStatus(e.target.value as SubsidyApplicationStatus)
                    }
                    className={styles.select}
                    disabled={isCreating}
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.fieldNarrow}>
                  <label htmlFor="applicationDeadline" className={styles.label}>
                    Deadline
                  </label>
                  <input
                    type="date"
                    id="applicationDeadline"
                    value={newApplicationDeadline}
                    onChange={(e) => setNewApplicationDeadline(e.target.value)}
                    className={styles.input}
                    disabled={isCreating}
                  />
                </div>
              </div>

              {/* Row 3: Description */}
              <div className={styles.field}>
                <label htmlFor="programDescription" className={styles.label}>
                  Description
                </label>
                <textarea
                  id="programDescription"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className={styles.textarea}
                  placeholder="Optional description of this program"
                  maxLength={2000}
                  disabled={isCreating}
                  rows={2}
                />
              </div>

              {/* Row 4: Eligibility */}
              <div className={styles.field}>
                <label htmlFor="programEligibility" className={styles.label}>
                  Eligibility Requirements
                </label>
                <textarea
                  id="programEligibility"
                  value={newEligibility}
                  onChange={(e) => setNewEligibility(e.target.value)}
                  className={styles.textarea}
                  placeholder="Optional eligibility criteria or requirements"
                  maxLength={2000}
                  disabled={isCreating}
                  rows={2}
                />
              </div>

              {/* Row 5: Notes */}
              <div className={styles.field}>
                <label htmlFor="programNotes" className={styles.label}>
                  Notes
                </label>
                <textarea
                  id="programNotes"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className={styles.textarea}
                  placeholder="Optional additional notes"
                  maxLength={2000}
                  disabled={isCreating}
                  rows={2}
                />
              </div>

              {/* Row 6: Category picker */}
              {allCategories.length > 0 && (
                <div className={styles.field}>
                  <span className={styles.label}>Applicable Budget Categories</span>
                  <div className={styles.categoryCheckboxList}>
                    {allCategories.map((category) => (
                      <label
                        key={category.id}
                        className={`${styles.categoryCheckboxItem} ${isCreating ? styles.categoryCheckboxItemDisabled : ''}`}
                      >
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={newCategoryIds.includes(category.id)}
                          onChange={() => toggleNewCategory(category.id)}
                          disabled={isCreating}
                        />
                        <span
                          className={styles.categoryDot}
                          style={{ backgroundColor: category.color ?? '#6b7280' }}
                          aria-hidden="true"
                        />
                        <span className={styles.categoryCheckboxLabel}>{category.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={styles.button}
                  disabled={isCreating || !newName.trim() || !newReductionValue.trim()}
                >
                  {isCreating ? 'Creating...' : 'Create Program'}
                </button>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={() => {
                    setShowCreateForm(false);
                    resetCreateForm();
                  }}
                  disabled={isCreating}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Programs list */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Programs ({programs.length})</h2>

          {programs.length === 0 ? (
            <p className={styles.emptyState}>
              No subsidy programs yet. Add your first program to start tracking available subsidies
              and government incentives for your project.
            </p>
          ) : (
            <div className={styles.programsList}>
              {programs.map((program) => (
                <div key={program.id} className={styles.programRow}>
                  {editingProgram?.id === program.id ? (
                    <form
                      onSubmit={handleUpdateProgram}
                      className={styles.editForm}
                      aria-label={`Edit ${program.name}`}
                    >
                      {updateError && (
                        <div className={styles.errorBanner} role="alert">
                          {updateError}
                        </div>
                      )}

                      {/* Edit Row 1: Name */}
                      <div className={styles.field}>
                        <label htmlFor={`edit-name-${program.id}`} className={styles.label}>
                          Name <span className={styles.required}>*</span>
                        </label>
                        <input
                          type="text"
                          id={`edit-name-${program.id}`}
                          value={editingProgram.name}
                          onChange={(e) =>
                            setEditingProgram({ ...editingProgram, name: e.target.value })
                          }
                          className={styles.input}
                          maxLength={200}
                          disabled={isUpdating}
                          autoFocus
                        />
                      </div>

                      {/* Edit Row 2: Reduction type + value + status + deadline */}
                      <div className={styles.editFormRow}>
                        <div className={styles.fieldSelect}>
                          <label
                            htmlFor={`edit-reductiontype-${program.id}`}
                            className={styles.label}
                          >
                            Reduction Type
                          </label>
                          <select
                            id={`edit-reductiontype-${program.id}`}
                            value={editingProgram.reductionType}
                            onChange={(e) =>
                              setEditingProgram({
                                ...editingProgram,
                                reductionType: e.target.value as SubsidyReductionType,
                              })
                            }
                            className={styles.select}
                            disabled={isUpdating}
                          >
                            {Object.entries(REDUCTION_TYPE_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className={styles.fieldNarrow}>
                          <label
                            htmlFor={`edit-reductionvalue-${program.id}`}
                            className={styles.label}
                          >
                            {editingProgram.reductionType === 'percentage'
                              ? 'Value (%)'
                              : 'Value ($)'}{' '}
                            <span className={styles.required}>*</span>
                          </label>
                          <input
                            type="number"
                            id={`edit-reductionvalue-${program.id}`}
                            value={editingProgram.reductionValue}
                            onChange={(e) =>
                              setEditingProgram({
                                ...editingProgram,
                                reductionValue: e.target.value,
                              })
                            }
                            className={styles.input}
                            min={0}
                            max={editingProgram.reductionType === 'percentage' ? 100 : undefined}
                            step="0.01"
                            disabled={isUpdating}
                          />
                        </div>

                        <div className={styles.fieldSelect}>
                          <label htmlFor={`edit-status-${program.id}`} className={styles.label}>
                            Status
                          </label>
                          <select
                            id={`edit-status-${program.id}`}
                            value={editingProgram.applicationStatus}
                            onChange={(e) =>
                              setEditingProgram({
                                ...editingProgram,
                                applicationStatus: e.target.value as SubsidyApplicationStatus,
                              })
                            }
                            className={styles.select}
                            disabled={isUpdating}
                          >
                            {Object.entries(STATUS_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className={styles.fieldNarrow}>
                          <label htmlFor={`edit-deadline-${program.id}`} className={styles.label}>
                            Deadline
                          </label>
                          <input
                            type="date"
                            id={`edit-deadline-${program.id}`}
                            value={editingProgram.applicationDeadline}
                            onChange={(e) =>
                              setEditingProgram({
                                ...editingProgram,
                                applicationDeadline: e.target.value,
                              })
                            }
                            className={styles.input}
                            disabled={isUpdating}
                          />
                        </div>
                      </div>

                      {/* Edit Row 3: Description */}
                      <div className={styles.field}>
                        <label htmlFor={`edit-description-${program.id}`} className={styles.label}>
                          Description
                        </label>
                        <textarea
                          id={`edit-description-${program.id}`}
                          value={editingProgram.description}
                          onChange={(e) =>
                            setEditingProgram({ ...editingProgram, description: e.target.value })
                          }
                          className={styles.textarea}
                          placeholder="Optional description"
                          maxLength={2000}
                          disabled={isUpdating}
                          rows={2}
                        />
                      </div>

                      {/* Edit Row 4: Eligibility */}
                      <div className={styles.field}>
                        <label htmlFor={`edit-eligibility-${program.id}`} className={styles.label}>
                          Eligibility Requirements
                        </label>
                        <textarea
                          id={`edit-eligibility-${program.id}`}
                          value={editingProgram.eligibility}
                          onChange={(e) =>
                            setEditingProgram({ ...editingProgram, eligibility: e.target.value })
                          }
                          className={styles.textarea}
                          placeholder="Optional eligibility criteria"
                          maxLength={2000}
                          disabled={isUpdating}
                          rows={2}
                        />
                      </div>

                      {/* Edit Row 5: Notes */}
                      <div className={styles.field}>
                        <label htmlFor={`edit-notes-${program.id}`} className={styles.label}>
                          Notes
                        </label>
                        <textarea
                          id={`edit-notes-${program.id}`}
                          value={editingProgram.notes}
                          onChange={(e) =>
                            setEditingProgram({ ...editingProgram, notes: e.target.value })
                          }
                          className={styles.textarea}
                          placeholder="Optional notes"
                          maxLength={2000}
                          disabled={isUpdating}
                          rows={2}
                        />
                      </div>

                      {/* Edit Row 6: Category picker */}
                      {allCategories.length > 0 && (
                        <div className={styles.field}>
                          <span className={styles.label}>Applicable Budget Categories</span>
                          <div className={styles.categoryCheckboxList}>
                            {allCategories.map((category) => (
                              <label
                                key={category.id}
                                className={`${styles.categoryCheckboxItem} ${isUpdating ? styles.categoryCheckboxItemDisabled : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  className={styles.checkbox}
                                  checked={editingProgram.categoryIds.includes(category.id)}
                                  onChange={() => toggleEditCategory(category.id)}
                                  disabled={isUpdating}
                                />
                                <span
                                  className={styles.categoryDot}
                                  style={{ backgroundColor: category.color ?? '#6b7280' }}
                                  aria-hidden="true"
                                />
                                <span className={styles.categoryCheckboxLabel}>
                                  {category.name}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className={styles.editActions}>
                        <button
                          type="submit"
                          className={styles.saveButton}
                          disabled={
                            isUpdating ||
                            !editingProgram.name.trim() ||
                            !editingProgram.reductionValue.trim()
                          }
                        >
                          {isUpdating ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className={styles.cancelButton}
                          onClick={cancelEdit}
                          disabled={isUpdating}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className={styles.programInfo}>
                        <div className={styles.programMain}>
                          <span className={styles.programName}>{program.name}</span>
                          <div className={styles.programBadges}>
                            <span
                              className={`${styles.statusBadge} ${getStatusClassName(styles, program.applicationStatus)}`}
                            >
                              {STATUS_LABELS[program.applicationStatus]}
                            </span>
                            <span className={styles.reductionBadge}>
                              {formatReduction(program.reductionType, program.reductionValue)}
                            </span>
                          </div>
                        </div>

                        {program.applicationDeadline && (
                          <div className={styles.programDeadline}>
                            <span className={styles.deadlineLabel}>Deadline:</span>{' '}
                            <span className={styles.deadlineValue}>
                              {formatDeadline(program.applicationDeadline)}
                            </span>
                          </div>
                        )}

                        {program.description && (
                          <p className={styles.programDescription}>{program.description}</p>
                        )}

                        {program.applicableCategories.length > 0 && (
                          <div className={styles.categoryPills}>
                            {program.applicableCategories.map((category) => (
                              <span key={category.id} className={styles.categoryPill}>
                                <span
                                  className={styles.categoryDot}
                                  style={{ backgroundColor: category.color ?? '#6b7280' }}
                                  aria-hidden="true"
                                />
                                {category.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className={styles.programActions}>
                        <button
                          type="button"
                          className={styles.editButton}
                          onClick={() => startEdit(program)}
                          disabled={!!editingProgram}
                          aria-label={`Edit ${program.name}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => openDeleteConfirm(program.id)}
                          disabled={!!editingProgram}
                          aria-label={`Delete ${program.name}`}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Delete confirmation modal */}
      {deletingProgramId && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeDeleteConfirm} />
          <div className={styles.modalContent}>
            <h2 id="delete-modal-title" className={styles.modalTitle}>
              Delete Subsidy Program
            </h2>
            <p className={styles.modalText}>
              Are you sure you want to delete the program &quot;
              <strong>{programs.find((p) => p.id === deletingProgramId)?.name}</strong>
              &quot;?
            </p>

            {deleteError ? (
              <div className={styles.errorBanner} role="alert">
                {deleteError}
              </div>
            ) : (
              <p className={styles.modalWarning}>
                This action cannot be undone. The program will be permanently removed.
              </p>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeDeleteConfirm}
                disabled={isDeleting}
              >
                Cancel
              </button>
              {!deleteError && (
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={() => void handleDeleteProgram(deletingProgramId)}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete Program'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SubsidyProgramsPage;
