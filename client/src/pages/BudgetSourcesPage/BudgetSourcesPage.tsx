import { useState, useEffect, type FormEvent } from 'react';
import type {
  BudgetSource,
  BudgetSourceType,
  BudgetSourceStatus,
  CreateBudgetSourceRequest,
} from '@cornerstone/shared';
import {
  fetchBudgetSources,
  createBudgetSource,
  updateBudgetSource,
  deleteBudgetSource,
} from '../../lib/budgetSourcesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { formatCurrency, formatPercent } from '../../lib/formatters.js';
import { BudgetSubNav } from '../../components/BudgetSubNav/BudgetSubNav.js';
import styles from './BudgetSourcesPage.module.css';

// ---- Display helpers ----

const SOURCE_TYPE_LABELS: Record<BudgetSourceType, string> = {
  bank_loan: 'Bank Loan',
  credit_line: 'Credit Line',
  savings: 'Savings',
  other: 'Other',
};

const STATUS_LABELS: Record<BudgetSourceStatus, string> = {
  active: 'Active',
  exhausted: 'Exhausted',
  closed: 'Closed',
};

function getSourceTypeClass(styles: Record<string, string>, sourceType: BudgetSourceType): string {
  const map: Record<BudgetSourceType, string> = {
    bank_loan: styles.typeBankLoan ?? '',
    credit_line: styles.typeCreditLine ?? '',
    savings: styles.typeSavings ?? '',
    other: styles.typeOther ?? '',
  };
  return map[sourceType] ?? '';
}

function getStatusClass(styles: Record<string, string>, status: BudgetSourceStatus): string {
  const map: Record<BudgetSourceStatus, string> = {
    active: styles.statusActive ?? '',
    exhausted: styles.statusExhausted ?? '',
    closed: styles.statusClosed ?? '',
  };
  return map[status] ?? '';
}

// ---- Editing state shape ----

type EditingSource = {
  id: string;
  name: string;
  sourceType: BudgetSourceType;
  totalAmount: string;
  interestRate: string;
  terms: string;
  notes: string;
  status: BudgetSourceStatus;
};

function sourceToEditState(source: BudgetSource): EditingSource {
  return {
    id: source.id,
    name: source.name,
    sourceType: source.sourceType,
    totalAmount: String(source.totalAmount),
    interestRate: source.interestRate != null ? String(source.interestRate) : '',
    terms: source.terms ?? '',
    notes: source.notes ?? '',
    status: source.status,
  };
}

// ---- Component ----

export function BudgetSourcesPage() {
  const [sources, setSources] = useState<BudgetSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSourceType, setNewSourceType] = useState<BudgetSourceType>('bank_loan');
  const [newTotalAmount, setNewTotalAmount] = useState('');
  const [newInterestRate, setNewInterestRate] = useState('');
  const [newTerms, setNewTerms] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newStatus, setNewStatus] = useState<BudgetSourceStatus>('active');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string>('');

  // Edit state
  const [editingSource, setEditingSource] = useState<EditingSource | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string>('');

  // Delete confirmation state
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');

  useEffect(() => {
    void loadSources();
  }, []);

  const loadSources = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetchBudgetSources();
      setSources(response.budgetSources);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to load budget sources. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetCreateForm = () => {
    setNewName('');
    setNewSourceType('bank_loan');
    setNewTotalAmount('');
    setNewInterestRate('');
    setNewTerms('');
    setNewNotes('');
    setNewStatus('active');
    setCreateError('');
  };

  const handleCreateSource = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError('');
    setSuccessMessage('');

    const trimmedName = newName.trim();
    if (!trimmedName) {
      setCreateError('Source name is required');
      return;
    }

    const totalAmountValue = parseFloat(newTotalAmount);
    if (isNaN(totalAmountValue) || totalAmountValue < 0) {
      setCreateError('Total amount must be a non-negative number');
      return;
    }

    const interestRateValue =
      newInterestRate.trim() !== '' ? parseFloat(newInterestRate) : undefined;
    if (interestRateValue !== undefined && (isNaN(interestRateValue) || interestRateValue < 0)) {
      setCreateError('Interest rate must be a non-negative number');
      return;
    }

    const payload: CreateBudgetSourceRequest = {
      name: trimmedName,
      sourceType: newSourceType,
      totalAmount: totalAmountValue,
      interestRate: interestRateValue ?? null,
      terms: newTerms.trim() || null,
      notes: newNotes.trim() || null,
      status: newStatus,
    };

    setIsCreating(true);

    try {
      const created = await createBudgetSource(payload);
      setSources([...sources, created]);
      resetCreateForm();
      setShowCreateForm(false);
      setSuccessMessage(`Budget source "${created.name}" created successfully`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCreateError(err.error.message);
      } else {
        setCreateError('Failed to create budget source. Please try again.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (source: BudgetSource) => {
    setEditingSource(sourceToEditState(source));
    setUpdateError('');
    setSuccessMessage('');
  };

  const cancelEdit = () => {
    setEditingSource(null);
    setUpdateError('');
  };

  const handleUpdateSource = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingSource) return;

    setUpdateError('');
    setSuccessMessage('');

    const trimmedName = editingSource.name.trim();
    if (!trimmedName) {
      setUpdateError('Source name is required');
      return;
    }

    const totalAmountValue = parseFloat(editingSource.totalAmount);
    if (isNaN(totalAmountValue) || totalAmountValue < 0) {
      setUpdateError('Total amount must be a non-negative number');
      return;
    }

    const interestRateValue =
      editingSource.interestRate.trim() !== '' ? parseFloat(editingSource.interestRate) : null;
    if (interestRateValue !== null && (isNaN(interestRateValue) || interestRateValue < 0)) {
      setUpdateError('Interest rate must be a non-negative number');
      return;
    }

    setIsUpdating(true);

    try {
      const updated = await updateBudgetSource(editingSource.id, {
        name: trimmedName,
        sourceType: editingSource.sourceType,
        totalAmount: totalAmountValue,
        interestRate: interestRateValue,
        terms: editingSource.terms.trim() || null,
        notes: editingSource.notes.trim() || null,
        status: editingSource.status,
      });
      setSources(sources.map((s) => (s.id === updated.id ? updated : s)));
      setEditingSource(null);
      setSuccessMessage(`Budget source "${updated.name}" updated successfully`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setUpdateError(err.error.message);
      } else {
        setUpdateError('Failed to update budget source. Please try again.');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const openDeleteConfirm = (sourceId: string) => {
    setDeletingSourceId(sourceId);
    setDeleteError('');
    setSuccessMessage('');
  };

  const closeDeleteConfirm = () => {
    if (!isDeleting) {
      setDeletingSourceId(null);
      setDeleteError('');
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    setIsDeleting(true);
    setDeleteError('');

    try {
      await deleteBudgetSource(sourceId);
      const deleted = sources.find((s) => s.id === sourceId);
      setSources(sources.filter((s) => s.id !== sourceId));
      setDeletingSourceId(null);
      setSuccessMessage(`Budget source "${deleted?.name}" deleted successfully`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setDeleteError(
            'This budget source cannot be deleted because it is currently referenced by one or more budget entries.',
          );
        } else {
          setDeleteError(err.error.message);
        }
      } else {
        setDeleteError('Failed to delete budget source. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Budget</h1>
          </div>
          <BudgetSubNav />
          <div className={styles.loading}>Loading budget sources...</div>
        </div>
      </div>
    );
  }

  if (error && sources.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Budget</h1>
          </div>
          <BudgetSubNav />
          <div className={styles.errorCard} role="alert">
            <h2 className={styles.errorTitle}>Error</h2>
            <p>{error}</p>
            <button type="button" className={styles.button} onClick={() => void loadSources()}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Budget</h1>
        </div>

        {/* Budget sub-navigation */}
        <BudgetSubNav />

        {/* Section header */}
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Sources</h2>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              setShowCreateForm(true);
              setCreateError('');
            }}
            disabled={showCreateForm}
          >
            Add Source
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
            <h2 className={styles.cardTitle}>New Budget Source</h2>
            <p className={styles.cardDescription}>
              Budget sources represent financing for your project (e.g., bank loans, credit lines,
              savings).
            </p>

            {createError && (
              <div className={styles.errorBanner} role="alert">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSource} className={styles.form}>
              <div className={styles.formRow}>
                <div className={styles.fieldGrow}>
                  <label htmlFor="sourceName" className={styles.label}>
                    Name <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    id="sourceName"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className={styles.input}
                    placeholder="e.g., Primary Bank Loan"
                    maxLength={200}
                    disabled={isCreating}
                    autoFocus
                  />
                </div>

                <div className={styles.fieldSelect}>
                  <label htmlFor="sourceType" className={styles.label}>
                    Type <span className={styles.required}>*</span>
                  </label>
                  <select
                    id="sourceType"
                    value={newSourceType}
                    onChange={(e) => setNewSourceType(e.target.value as BudgetSourceType)}
                    className={styles.select}
                    disabled={isCreating}
                  >
                    {Object.entries(SOURCE_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.fieldSelect}>
                  <label htmlFor="sourceStatus" className={styles.label}>
                    Status
                  </label>
                  <select
                    id="sourceStatus"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as BudgetSourceStatus)}
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
              </div>

              <div className={styles.formRow}>
                <div className={styles.fieldGrow}>
                  <label htmlFor="sourceTotalAmount" className={styles.label}>
                    Total Amount ($) <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="number"
                    id="sourceTotalAmount"
                    value={newTotalAmount}
                    onChange={(e) => setNewTotalAmount(e.target.value)}
                    className={styles.input}
                    placeholder="0.00"
                    min={0}
                    step="0.01"
                    disabled={isCreating}
                  />
                </div>

                <div className={styles.fieldNarrow}>
                  <label htmlFor="sourceInterestRate" className={styles.label}>
                    Interest Rate (%)
                  </label>
                  <input
                    type="number"
                    id="sourceInterestRate"
                    value={newInterestRate}
                    onChange={(e) => setNewInterestRate(e.target.value)}
                    className={styles.input}
                    placeholder="e.g., 3.50"
                    min={0}
                    step="0.01"
                    disabled={isCreating}
                  />
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="sourceTerms" className={styles.label}>
                  Terms
                </label>
                <input
                  type="text"
                  id="sourceTerms"
                  value={newTerms}
                  onChange={(e) => setNewTerms(e.target.value)}
                  className={styles.input}
                  placeholder="e.g., 30-year fixed, monthly payments"
                  maxLength={500}
                  disabled={isCreating}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="sourceNotes" className={styles.label}>
                  Notes
                </label>
                <textarea
                  id="sourceNotes"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className={styles.textarea}
                  placeholder="Optional notes"
                  maxLength={2000}
                  disabled={isCreating}
                  rows={3}
                />
              </div>

              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={styles.button}
                  disabled={isCreating || !newName.trim() || !newTotalAmount.trim()}
                >
                  {isCreating ? 'Creating...' : 'Create Source'}
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

        {/* Sources list */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Sources ({sources.length})</h2>

          {sources.length === 0 ? (
            <p className={styles.emptyState}>
              No budget sources yet. Add your first financing source to start tracking project
              funding.
            </p>
          ) : (
            <div className={styles.sourcesList}>
              {sources.map((source) => (
                <div key={source.id} className={styles.sourceRow}>
                  {editingSource?.id === source.id ? (
                    <form
                      onSubmit={handleUpdateSource}
                      className={styles.editForm}
                      aria-label={`Edit ${source.name}`}
                    >
                      {updateError && (
                        <div className={styles.errorBanner} role="alert">
                          {updateError}
                        </div>
                      )}

                      <div className={styles.editFormRow}>
                        <div className={styles.fieldGrow}>
                          <label htmlFor={`edit-name-${source.id}`} className={styles.label}>
                            Name <span className={styles.required}>*</span>
                          </label>
                          <input
                            type="text"
                            id={`edit-name-${source.id}`}
                            value={editingSource.name}
                            onChange={(e) =>
                              setEditingSource({ ...editingSource, name: e.target.value })
                            }
                            className={styles.input}
                            maxLength={200}
                            disabled={isUpdating}
                            autoFocus
                          />
                        </div>

                        <div className={styles.fieldSelect}>
                          <label htmlFor={`edit-type-${source.id}`} className={styles.label}>
                            Type
                          </label>
                          <select
                            id={`edit-type-${source.id}`}
                            value={editingSource.sourceType}
                            onChange={(e) =>
                              setEditingSource({
                                ...editingSource,
                                sourceType: e.target.value as BudgetSourceType,
                              })
                            }
                            className={styles.select}
                            disabled={isUpdating}
                          >
                            {Object.entries(SOURCE_TYPE_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className={styles.fieldSelect}>
                          <label htmlFor={`edit-status-${source.id}`} className={styles.label}>
                            Status
                          </label>
                          <select
                            id={`edit-status-${source.id}`}
                            value={editingSource.status}
                            onChange={(e) =>
                              setEditingSource({
                                ...editingSource,
                                status: e.target.value as BudgetSourceStatus,
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
                      </div>

                      <div className={styles.editFormRow}>
                        <div className={styles.fieldGrow}>
                          <label htmlFor={`edit-amount-${source.id}`} className={styles.label}>
                            Total Amount ($) <span className={styles.required}>*</span>
                          </label>
                          <input
                            type="number"
                            id={`edit-amount-${source.id}`}
                            value={editingSource.totalAmount}
                            onChange={(e) =>
                              setEditingSource({ ...editingSource, totalAmount: e.target.value })
                            }
                            className={styles.input}
                            min={0}
                            step="0.01"
                            disabled={isUpdating}
                          />
                        </div>

                        <div className={styles.fieldNarrow}>
                          <label htmlFor={`edit-rate-${source.id}`} className={styles.label}>
                            Interest Rate (%)
                          </label>
                          <input
                            type="number"
                            id={`edit-rate-${source.id}`}
                            value={editingSource.interestRate}
                            onChange={(e) =>
                              setEditingSource({ ...editingSource, interestRate: e.target.value })
                            }
                            className={styles.input}
                            min={0}
                            step="0.01"
                            disabled={isUpdating}
                          />
                        </div>
                      </div>

                      <div className={styles.field}>
                        <label htmlFor={`edit-terms-${source.id}`} className={styles.label}>
                          Terms
                        </label>
                        <input
                          type="text"
                          id={`edit-terms-${source.id}`}
                          value={editingSource.terms}
                          onChange={(e) =>
                            setEditingSource({ ...editingSource, terms: e.target.value })
                          }
                          className={styles.input}
                          placeholder="e.g., 30-year fixed, monthly payments"
                          maxLength={500}
                          disabled={isUpdating}
                        />
                      </div>

                      <div className={styles.field}>
                        <label htmlFor={`edit-notes-${source.id}`} className={styles.label}>
                          Notes
                        </label>
                        <textarea
                          id={`edit-notes-${source.id}`}
                          value={editingSource.notes}
                          onChange={(e) =>
                            setEditingSource({ ...editingSource, notes: e.target.value })
                          }
                          className={styles.textarea}
                          placeholder="Optional notes"
                          maxLength={2000}
                          disabled={isUpdating}
                          rows={3}
                        />
                      </div>

                      <div className={styles.editActions}>
                        <button
                          type="submit"
                          className={styles.saveButton}
                          disabled={
                            isUpdating ||
                            !editingSource.name.trim() ||
                            !editingSource.totalAmount.trim()
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
                      <div className={styles.sourceInfo}>
                        <div className={styles.sourceMain}>
                          <span className={styles.sourceName}>{source.name}</span>
                          <div className={styles.sourceBadges}>
                            <span
                              className={`${styles.typeBadge} ${getSourceTypeClass(styles, source.sourceType)}`}
                            >
                              {SOURCE_TYPE_LABELS[source.sourceType]}
                            </span>
                            <span
                              className={`${styles.statusBadge} ${getStatusClass(styles, source.status)}`}
                            >
                              {STATUS_LABELS[source.status]}
                            </span>
                          </div>
                        </div>

                        <div className={styles.sourceAmounts}>
                          <div className={styles.amountGroup}>
                            <span className={styles.amountLabel}>Total</span>
                            <span className={styles.amountValue}>
                              {formatCurrency(source.totalAmount)}
                            </span>
                          </div>
                          <div className={styles.amountGroup}>
                            <span className={styles.amountLabel}>Used</span>
                            <span className={styles.amountValue}>
                              {formatCurrency(source.usedAmount)}
                            </span>
                          </div>
                          <div className={styles.amountGroup}>
                            <span className={styles.amountLabel}>Available</span>
                            <span
                              className={`${styles.amountValue} ${source.availableAmount < 0 ? styles.amountNegative : ''}`}
                            >
                              {formatCurrency(source.availableAmount)}
                            </span>
                          </div>
                          {source.interestRate != null && (
                            <div className={styles.amountGroup}>
                              <span className={styles.amountLabel}>Rate</span>
                              <span className={styles.amountValue}>
                                {formatPercent(source.interestRate)}
                              </span>
                            </div>
                          )}
                        </div>

                        {source.terms && (
                          <p className={styles.sourceTerms} title="Terms">
                            {source.terms}
                          </p>
                        )}
                      </div>

                      <div className={styles.sourceActions}>
                        <button
                          type="button"
                          className={styles.editButton}
                          onClick={() => startEdit(source)}
                          disabled={!!editingSource}
                          aria-label={`Edit ${source.name}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => openDeleteConfirm(source.id)}
                          disabled={!!editingSource}
                          aria-label={`Delete ${source.name}`}
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
      {deletingSourceId && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeDeleteConfirm} />
          <div className={styles.modalContent}>
            <h2 id="delete-modal-title" className={styles.modalTitle}>
              Delete Budget Source
            </h2>
            <p className={styles.modalText}>
              Are you sure you want to delete the budget source &quot;
              <strong>{sources.find((s) => s.id === deletingSourceId)?.name}</strong>
              &quot;?
            </p>

            {deleteError ? (
              <div className={styles.errorBanner} role="alert">
                {deleteError}
              </div>
            ) : (
              <p className={styles.modalWarning}>
                This action cannot be undone. The source will be permanently removed.
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
                  onClick={() => void handleDeleteSource(deletingSourceId)}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete Source'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BudgetSourcesPage;
