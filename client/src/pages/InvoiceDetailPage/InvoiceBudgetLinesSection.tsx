import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  InvoiceBudgetLineDetailResponse,
  WorkItemBudgetLine,
  HouseholdItemBudgetLine,
} from '@cornerstone/shared';
import {
  fetchInvoiceBudgetLines,
  createInvoiceBudgetLine,
  updateInvoiceBudgetLine,
  deleteInvoiceBudgetLine,
} from '../../lib/invoiceBudgetLinesApi.js';
import { fetchWorkItemBudgets } from '../../lib/workItemBudgetsApi.js';
import { fetchHouseholdItemBudgets } from '../../lib/householdItemBudgetsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { formatCurrency } from '../../lib/formatters.js';
import { WorkItemPicker } from '../../components/WorkItemPicker/WorkItemPicker.js';
import { HouseholdItemPicker } from '../../components/HouseholdItemPicker/HouseholdItemPicker.js';
import styles from './InvoiceBudgetLinesSection.module.css';

interface InvoiceBudgetLinesSectionProps {
  invoiceId: string;
  invoiceTotal: number;
}

/**
 * Budget line type discriminator for the two-step picker.
 */
type BudgetLineType = 'work_item' | 'household_item';

interface PickerState {
  step: 1 | 2;
  type?: BudgetLineType;
  itemId?: string;
  itemTitle?: string;
  budgetLines: (WorkItemBudgetLine | HouseholdItemBudgetLine)[];
  isLoading: boolean;
  error?: string;
}

export function InvoiceBudgetLinesSection({
  invoiceId,
  invoiceTotal,
}: InvoiceBudgetLinesSectionProps) {
  const [budgetLines, setBudgetLines] = useState<InvoiceBudgetLineDetailResponse[]>([]);
  const [remainingAmount, setRemainingAmount] = useState(invoiceTotal);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Picker modal state
  const [showPicker, setShowPicker] = useState(false);
  const [pickerState, setPickerState] = useState<PickerState>({
    step: 1,
    budgetLines: [],
    isLoading: false,
  });

  // Inline edit state
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation state
  const [deletingLineId, setDeletingLineId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Focus management
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const pickerModalRef = useRef<HTMLDivElement>(null);

  // Load budget lines on mount
  useEffect(() => {
    void loadBudgetLines();
  }, [invoiceId]);

  const loadBudgetLines = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchInvoiceBudgetLines(invoiceId);
      setBudgetLines(response.budgetLines);
      setRemainingAmount(response.remainingAmount);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to load budget lines. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Focus into picker modal when it opens
  useEffect(() => {
    if (showPicker && pickerModalRef.current) {
      setTimeout(() => {
        pickerModalRef.current?.focus();
      }, 0);
    }
  }, [showPicker]);

  const closePicker = useCallback(() => {
    setShowPicker(false);
    setPickerState({ step: 1, budgetLines: [], isLoading: false });
    setTimeout(() => {
      addButtonRef.current?.focus();
    }, 0);
  }, []);

  // Close modals on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && showPicker) {
        closePicker();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showPicker, closePicker]);

  /**
   * Step 1: User selects a work item or household item.
   * Fetch its budget lines and move to step 2.
   */
  const handleSelectItem = async (itemId: string, type: BudgetLineType) => {
    setPickerState({
      step: 2,
      type,
      itemId,
      itemTitle: itemId,
      budgetLines: [],
      isLoading: true,
    });

    try {
      const fetchFn = type === 'work_item' ? fetchWorkItemBudgets : fetchHouseholdItemBudgets;
      const lines = await fetchFn(itemId);

      // Filter to only unlinked budget lines
      const unlinkedLines = lines.filter((bl) => bl.invoiceLink === null);

      setPickerState({
        step: 2,
        type,
        itemId,
        itemTitle: itemId,
        budgetLines: unlinkedLines,
        isLoading: false,
      });
    } catch (err) {
      const errorMsg =
        err instanceof ApiClientError ? err.error.message : 'Failed to load budget lines.';

      setPickerState({
        step: 2,
        type,
        itemId,
        itemTitle: itemId,
        budgetLines: [],
        isLoading: false,
        error: errorMsg,
      });
    }
  };

  /**
   * Step 2: User selects a budget line from the filtered list.
   * Create the invoice budget line link.
   */
  const handleSelectBudgetLine = async (
    budgetLine: WorkItemBudgetLine | HouseholdItemBudgetLine,
  ) => {
    if (!pickerState.itemId || !pickerState.type) return;

    try {
      const createData = {
        invoiceId,
        ...(pickerState.type === 'work_item'
          ? { workItemBudgetId: budgetLine.id }
          : { householdItemBudgetId: budgetLine.id }),
        itemizedAmount: budgetLine.plannedAmount,
      };

      const response = await createInvoiceBudgetLine(invoiceId, createData);

      // Update state with new line and remaining amount
      setBudgetLines([...budgetLines, response.budgetLine]);
      setRemainingAmount(response.remainingAmount);
      closePicker();
    } catch (err) {
      let errorMsg = 'Failed to link budget line. Please try again.';

      if (err instanceof ApiClientError) {
        if (err.error.code === 'BUDGET_LINE_ALREADY_LINKED') {
          errorMsg = 'This budget line is already linked to another invoice.';
        } else if (err.error.code === 'ITEMIZED_SUM_EXCEEDS_INVOICE') {
          errorMsg = 'Linking this budget line would exceed the invoice total.';
        } else {
          errorMsg = err.error.message;
        }
      }

      setPickerState({
        ...pickerState,
        error: errorMsg,
      });
    }
  };

  /**
   * Start editing an itemized amount.
   */
  const startEditLine = (line: InvoiceBudgetLineDetailResponse) => {
    setEditingLineId(line.id);
    setEditAmount(line.itemizedAmount.toString());
    setEditError(null);
  };

  /**
   * Save an edited itemized amount.
   */
  const saveEditLine = async () => {
    if (!editingLineId) return;

    const newAmount = parseFloat(editAmount);
    if (isNaN(newAmount) || newAmount < 0) {
      setEditError('Amount must be a non-negative number.');
      return;
    }

    try {
      const response = await updateInvoiceBudgetLine(invoiceId, editingLineId, {
        itemizedAmount: newAmount,
      });

      // Update the line and remaining amount
      setBudgetLines(
        budgetLines.map((line) => (line.id === editingLineId ? response.budgetLine : line)),
      );
      setRemainingAmount(response.remainingAmount);
      setEditingLineId(null);
      setEditAmount('');
      setEditError(null);
    } catch (err) {
      let errorMsg = 'Failed to update budget line. Please try again.';

      if (err instanceof ApiClientError) {
        if (err.error.code === 'ITEMIZED_SUM_EXCEEDS_INVOICE') {
          errorMsg = 'The new amount would exceed the invoice total.';
        } else {
          errorMsg = err.error.message;
        }
      }

      setEditError(errorMsg);
    }
  };

  /**
   * Cancel editing.
   */
  const cancelEditLine = () => {
    setEditingLineId(null);
    setEditAmount('');
    setEditError(null);
  };

  /**
   * Delete a budget line.
   */
  const handleDeleteLine = async (lineId: string) => {
    setIsDeleting(true);

    try {
      await deleteInvoiceBudgetLine(invoiceId, lineId);

      // Re-fetch budget lines to get updated remaining amount
      await loadBudgetLines();
      setDeletingLineId(null);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to delete budget line. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Determine remaining color
  const getRemainingColor = () => {
    if (remainingAmount > 0.01) return 'warning'; // > 0
    if (remainingAmount < -0.01) return 'danger'; // < 0
    return 'neutral'; // ≈ 0
  };

  return (
    <section aria-labelledby="budget-lines-title" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 id="budget-lines-title" className={styles.sectionTitle}>
          Budget Lines
          {!isLoading && budgetLines.length > 0 && (
            <span
              className={styles.countBadge}
              aria-label={`${budgetLines.length} budget lines linked`}
            >
              {budgetLines.length}
            </span>
          )}
        </h2>
        <button
          type="button"
          ref={addButtonRef}
          className={styles.addButton}
          disabled={isLoading}
          onClick={() => {
            setShowPicker(true);
            setError(null);
          }}
        >
          + Add Budget Line
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className={styles.errorBanner} role="alert">
          <span>{error}</span>
          <button
            type="button"
            className={styles.dismissButton}
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && <div className={styles.loadingState}>Loading budget lines...</div>}

      {/* Empty state */}
      {!isLoading && budgetLines.length === 0 && !error && (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📊</span>
          <p className={styles.emptyTitle}>No budget lines linked</p>
          <p className={styles.emptyBody}>
            Link budget lines to allocate portions of this invoice to specific work items or
            household items.
          </p>
        </div>
      )}

      {/* Table view */}
      {!isLoading && budgetLines.length > 0 && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thDescription}>Description</th>
                <th className={styles.thCategory}>Category</th>
                <th className={styles.thPlanned}>Planned</th>
                <th className={styles.thItemized}>Itemized</th>
                <th className={styles.thActions}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {budgetLines.map((line) => (
                <tr key={line.id} className={styles.tr}>
                  <td className={styles.tdDescription}>{line.budgetLineDescription || '\u2014'}</td>
                  <td className={styles.tdCategory}>{line.categoryName || '\u2014'}</td>
                  <td className={styles.tdPlanned}>{formatCurrency(line.plannedAmount)}</td>
                  <td className={styles.tdItemized}>
                    {editingLineId === line.id ? (
                      <div className={styles.editContainer}>
                        <input
                          type="number"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className={styles.editInput}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          aria-label={`Edit itemized amount for budget line`}
                        />
                        {editError && <div className={styles.editErrorMsg}>{editError}</div>}
                        <div className={styles.editActions}>
                          <button
                            type="button"
                            className={styles.editSaveButton}
                            onClick={() => void saveEditLine()}
                            aria-label="Save"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className={styles.editCancelButton}
                            onClick={cancelEditLine}
                            aria-label="Cancel"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span>{formatCurrency(line.itemizedAmount)}</span>
                    )}
                  </td>
                  <td className={styles.tdActions}>
                    {editingLineId !== line.id && (
                      <div className={styles.actionButtons}>
                        <button
                          type="button"
                          className={styles.editButton}
                          onClick={() => startEditLine(line)}
                          title="Edit itemized amount"
                          aria-label={`Edit budget line for ${line.budgetLineDescription || 'budget line'}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={styles.removeButton}
                          onClick={() => setDeletingLineId(line.id)}
                          title="Remove this budget line"
                          aria-label={`Remove budget line for ${line.budgetLineDescription || 'budget line'}`}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}

              {/* Remaining row */}
              <tr
                className={`${styles.tr} ${styles.trRemaining} ${styles[`trRemaining_${getRemainingColor()}`]}`}
              >
                <td colSpan={3} className={styles.tdRemainingLabel}>
                  Remaining
                </td>
                <td className={styles.tdRemaining}>{formatCurrency(remainingAmount)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Add Budget Line picker modal (two-step) */}
      {showPicker && (
        <div className={styles.modal}>
          <div className={styles.modalBackdrop} onClick={closePicker} />
          <div
            ref={pickerModalRef}
            className={styles.modalContent}
            role="dialog"
            aria-modal="true"
            aria-labelledby="picker-title"
            tabIndex={-1}
          >
            <div className={styles.modalHeader}>
              <h2 id="picker-title" className={styles.modalTitle}>
                {pickerState.step === 1
                  ? 'Add Budget Line'
                  : `Select Budget Line for ${pickerState.itemTitle}`}
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={closePicker}
                aria-label="Close budget line picker"
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Step 1: Select item type and item */}
              {pickerState.step === 1 && (
                <div className={styles.pickerStep}>
                  <div className={styles.tabsContainer}>
                    <div className={styles.tab}>
                      <h3 className={styles.tabTitle}>Work Item</h3>
                      <WorkItemPicker
                        value=""
                        onChange={(itemId) => {
                          void handleSelectItem(itemId, 'work_item');
                        }}
                        onSelectItem={(item) => {
                          void handleSelectItem(item.id, 'work_item');
                        }}
                        excludeIds={[]}
                        placeholder="Search work items..."
                        showItemsOnFocus
                      />
                    </div>

                    <div className={styles.separator}>or</div>

                    <div className={styles.tab}>
                      <h3 className={styles.tabTitle}>Household Item</h3>
                      <HouseholdItemPicker
                        value=""
                        onChange={(itemId) => {
                          void handleSelectItem(itemId, 'household_item');
                        }}
                        excludeIds={[]}
                        placeholder="Search household items..."
                        showItemsOnFocus
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Select budget line */}
              {pickerState.step === 2 && (
                <div className={styles.pickerStep}>
                  {pickerState.isLoading && (
                    <div className={styles.loadingState}>Loading budget lines...</div>
                  )}

                  {pickerState.error && (
                    <div className={styles.errorBanner} role="alert">
                      {pickerState.error}
                    </div>
                  )}

                  {!pickerState.isLoading &&
                    pickerState.budgetLines.length === 0 &&
                    !pickerState.error && (
                      <div className={styles.emptyState}>
                        <p>No unlinked budget lines available for this item.</p>
                      </div>
                    )}

                  {!pickerState.isLoading && pickerState.budgetLines.length > 0 && (
                    <div className={styles.budgetLineList}>
                      {pickerState.budgetLines.map((line) => (
                        <button
                          key={line.id}
                          type="button"
                          className={styles.budgetLineItem}
                          onClick={() => void handleSelectBudgetLine(line)}
                        >
                          <div className={styles.budgetLineInfo}>
                            <div className={styles.budgetLineDesc}>
                              {line.description || 'Unnamed budget line'}
                            </div>
                            <div className={styles.budgetLineDetails}>
                              {line.budgetCategory && (
                                <span className={styles.budgetLineCategory}>
                                  {line.budgetCategory.name}
                                </span>
                              )}
                              <span className={styles.budgetLinePlanned}>
                                {formatCurrency(line.plannedAmount)}
                              </span>
                            </div>
                          </div>
                          <div className={styles.budgetLineArrow}>→</div>
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    className={styles.backButton}
                    onClick={() => setPickerState({ step: 1, budgetLines: [], isLoading: false })}
                  >
                    ← Back
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deletingLineId && (
        <div className={styles.modal}>
          <div className={styles.modalBackdrop} onClick={() => setDeletingLineId(null)} />
          <div
            className={styles.modalContent}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <h2 id="delete-title" className={styles.modalTitle}>
              Remove Budget Line?
            </h2>
            <p className={styles.modalText}>
              This budget line will be unlinked from the invoice. The budget line itself will remain
              in the work item or household item.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setDeletingLineId(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.deleteButton}
                onClick={() => void handleDeleteLine(deletingLineId)}
                disabled={isDeleting}
              >
                {isDeleting ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
