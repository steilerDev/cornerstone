import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  InvoiceBudgetLineDetailResponse,
  WorkItemBudgetLine,
  HouseholdItemBudgetLine,
  Vendor,
  BudgetCategory,
  CreateInvoiceBudgetLineRequest,
} from '@cornerstone/shared';
import {
  fetchInvoiceBudgetLines,
  createInvoiceBudgetLine,
  updateInvoiceBudgetLine,
  deleteInvoiceBudgetLine,
} from '../../lib/invoiceBudgetLinesApi.js';
import { fetchWorkItemBudgets, createWorkItemBudget } from '../../lib/workItemBudgetsApi.js';
import {
  fetchHouseholdItemBudgets,
  createHouseholdItemBudget,
} from '../../lib/householdItemBudgetsApi.js';
import { fetchBudgetCategories } from '../../lib/budgetCategoriesApi.js';
import { fetchBudgetSources } from '../../lib/budgetSourcesApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import type { BudgetSource } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { BudgetLineForm } from '../../components/budget/BudgetLineForm.js';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import { CONFIDENCE_LABELS } from '../../lib/budgetConstants.js';
import { WorkItemPicker } from '../../components/WorkItemPicker/WorkItemPicker.js';
import { HouseholdItemPicker } from '../../components/HouseholdItemPicker/HouseholdItemPicker.js';
import { AreaBreadcrumb } from '../../components/AreaBreadcrumb/index.js';
import { OverflowMenu, type OverflowMenuItem } from '../../components/OverflowMenu/index.js';
import { Modal } from '../../components/Modal/Modal.js';
import { FormError } from '../../components/FormError/FormError.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './InvoiceBudgetLinesSection.module.css';

interface InvoiceBudgetLinesSectionProps {
  invoiceId: string;
  invoiceTotal: number;
}

/**
 * Budget line type discriminator for the two-step picker.
 */
type BudgetLineType = 'work_item' | 'household_item';

/**
 * Budget line modal modes.
 */
type BudgetLineModalMode = 'edit' | 'remove' | null;

interface PickerState {
  step: 1 | 2;
  type?: BudgetLineType;
  itemId?: string;
  itemTitle?: string;
  budgetLines: (WorkItemBudgetLine | HouseholdItemBudgetLine)[];
  isLoading: boolean;
  error?: string;
  itemizedAmounts?: Record<string, number>;
  showCreateForm?: boolean;
  // Rich form state (replaces createFormData)
  createForm?: BudgetLineFormState;
  categories?: BudgetCategory[];
  budgetSources?: BudgetSource[];
  vendors?: Vendor[];
  isCreatingBudgetLine?: boolean;
  createError?: string | null;
}

export function InvoiceBudgetLinesSection({
  invoiceId,
  invoiceTotal,
}: InvoiceBudgetLinesSectionProps) {
  const { formatCurrency } = useFormatters();
  const { t: tSettings } = useTranslation('settings');
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
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

  // Budget line modal state
  const [budgetLineModalMode, setBudgetLineModalMode] = useState<BudgetLineModalMode>(null);
  const [selectedBudgetLine, setSelectedBudgetLine] =
    useState<InvoiceBudgetLineDetailResponse | null>(null);
  const [budgetLineFormAmount, setBudgetLineFormAmount] = useState('');
  const [budgetLineFormError, setBudgetLineFormError] = useState('');
  const [isBudgetLineMutating, setIsBudgetLineMutating] = useState(false);

  // Focus management
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const pickerModalRef = useRef<HTMLDivElement>(null);
  const remainingAmountRef = useRef<HTMLTableCellElement>(null);
  const newLineRowRef = useRef<HTMLTableRowElement>(null);
  const createBudgetLineButtonRef = useRef<HTMLButtonElement>(null);

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
        setError(t('invoiceDetail.budgetLines.loading'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const closeBudgetLineModal = () => {
    if (!isBudgetLineMutating) {
      setBudgetLineModalMode(null);
      setSelectedBudgetLine(null);
      setBudgetLineFormAmount('');
      setBudgetLineFormError('');
    }
  };

  const openEditBudgetLineModal = (line: InvoiceBudgetLineDetailResponse) => {
    setSelectedBudgetLine(line);
    setBudgetLineFormAmount(line.itemizedAmount.toString());
    setBudgetLineFormError('');
    setBudgetLineModalMode('edit');
  };

  const openRemoveBudgetLineModal = (line: InvoiceBudgetLineDetailResponse) => {
    setSelectedBudgetLine(line);
    setBudgetLineFormError('');
    setBudgetLineModalMode('remove');
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
  const handleSelectItem = async (itemId: string, type: BudgetLineType, itemTitle?: string) => {
    setPickerState({
      step: 2,
      type,
      itemId,
      itemTitle: itemTitle ?? itemId,
      budgetLines: [],
      isLoading: true,
      itemizedAmounts: {},
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
        itemTitle: itemTitle ?? itemId,
        budgetLines: unlinkedLines,
        isLoading: false,
        itemizedAmounts: {},
      });
    } catch (err) {
      const errorMsg =
        err instanceof ApiClientError ? err.error.message : 'Failed to load budget lines.';

      setPickerState({
        step: 2,
        type,
        itemId,
        itemTitle: itemTitle ?? itemId,
        budgetLines: [],
        isLoading: false,
        error: errorMsg,
        itemizedAmounts: {},
      });
    }
  };

  /**
   * Show the rich budget line form for creating a new budget line.
   */
  const showCreateBudgetLineForm = async () => {
    try {
      const [categoriesResponse, sourcesResponse, vendorsResponse] = await Promise.all([
        fetchBudgetCategories(),
        fetchBudgetSources(),
        fetchVendors({ pageSize: 100 }),
      ]);

      const discretionaryId = sourcesResponse.budgetSources.find((s) => s.isDiscretionary)?.id;

      const initialForm: BudgetLineFormState = {
        ...emptyCreateForm(),
        budgetSourceId: discretionaryId ?? '',
      };

      setPickerState((prev) => ({
        ...prev,
        showCreateForm: true,
        createForm: initialForm,
        categories: categoriesResponse.categories,
        budgetSources: sourcesResponse.budgetSources,
        vendors: vendorsResponse.vendors,
        createError: null,
      }));
    } catch (err) {
      const errorMsg =
        err instanceof ApiClientError ? err.error.message : 'Failed to load form data.';
      setPickerState((prev) => ({
        ...prev,
        error: errorMsg,
      }));
    }
  };

  /**
   * Handle creating a new budget line via the rich form and auto-linking it to the invoice.
   */
  const handleCreateBudgetLine = async (e: FormEvent) => {
    e.preventDefault();
    if (!pickerState.itemId || !pickerState.type || !pickerState.createForm) return;

    const form = pickerState.createForm;

    let plannedAmount: number;
    if (form.pricingMode === 'direct') {
      plannedAmount = parseFloat(form.plannedAmount);
      if (isNaN(plannedAmount) || plannedAmount < 0) {
        setPickerState((prev) => ({
          ...prev,
          createError: 'Planned amount must be a valid non-negative number.',
        }));
        return;
      }
      const multiplier = form.includesVat ? 1 : 1.19;
      plannedAmount = Math.round(plannedAmount * multiplier * 100) / 100;
    } else {
      const qty = parseFloat(form.quantity);
      const price = parseFloat(form.unitPrice);
      if (isNaN(qty) || qty <= 0) {
        setPickerState((prev) => ({
          ...prev,
          createError: 'Quantity must be a valid positive number.',
        }));
        return;
      }
      if (isNaN(price) || price < 0) {
        setPickerState((prev) => ({
          ...prev,
          createError: 'Unit price must be a valid non-negative number.',
        }));
        return;
      }
      plannedAmount = Math.round(qty * price * 100) / 100;
    }

    setPickerState((prev) => ({
      ...prev,
      isCreatingBudgetLine: true,
      createError: null,
      error: undefined,
    }));

    try {
      const createFn =
        pickerState.type === 'work_item' ? createWorkItemBudget : createHouseholdItemBudget;
      const payload = {
        description: form.description.trim() || null,
        plannedAmount,
        confidence: form.confidence,
        budgetCategoryId: pickerState.type === 'work_item' ? form.budgetCategoryId || null : null,
        budgetSourceId: form.budgetSourceId || null,
        vendorId: form.vendorId || null,
        quantity: form.pricingMode === 'unit' && form.quantity ? parseFloat(form.quantity) : null,
        unit: form.pricingMode === 'unit' && form.unit ? form.unit : null,
        unitPrice:
          form.pricingMode === 'unit' && form.unitPrice ? parseFloat(form.unitPrice) : null,
        includesVat: form.includesVat,
      };
      const newBudgetLine = await createFn(pickerState.itemId, payload);

      const linkData: CreateInvoiceBudgetLineRequest = {
        invoiceId,
        ...(pickerState.type === 'work_item'
          ? { workItemBudgetId: newBudgetLine.id }
          : { householdItemBudgetId: newBudgetLine.id }),
        itemizedAmount: newBudgetLine.plannedAmount,
      };
      const linkResponse = await createInvoiceBudgetLine(invoiceId, linkData);

      setBudgetLines((prev) => [...prev, linkResponse.budgetLine]);
      setRemainingAmount(linkResponse.remainingAmount);
      closePicker();

      setTimeout(() => {
        newLineRowRef.current?.focus();
      }, 100);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (
          err.error.code === 'ITEMIZED_SUM_EXCEEDS_INVOICE' ||
          err.error.code === 'BUDGET_LINE_ALREADY_LINKED'
        ) {
          try {
            const fetchFn =
              pickerState.type === 'work_item' ? fetchWorkItemBudgets : fetchHouseholdItemBudgets;
            const lines = await fetchFn(pickerState.itemId!);
            const unlinkedLines = lines.filter((bl) => bl.invoiceLink === null);

            let errorMsg: string;
            if (err.error.code === 'ITEMIZED_SUM_EXCEEDS_INVOICE') {
              errorMsg = 'Linking this budget line would exceed the invoice total.';
            } else {
              errorMsg = 'This budget line is already linked to another invoice.';
            }

            setPickerState((prev) => ({
              ...prev,
              showCreateForm: false,
              createForm: undefined,
              budgetLines: unlinkedLines,
              isCreatingBudgetLine: false,
              createError: null,
              error: errorMsg,
            }));
          } catch {
            setPickerState((prev) => ({
              ...prev,
              showCreateForm: false,
              createForm: undefined,
              isCreatingBudgetLine: false,
              createError: null,
              error:
                err instanceof ApiClientError ? err.error.message : 'Failed to load budget lines.',
            }));
          }
          return;
        }

        setPickerState((prev) => ({
          ...prev,
          isCreatingBudgetLine: false,
          createError: err.error.message,
        }));
      } else {
        setPickerState((prev) => ({
          ...prev,
          isCreatingBudgetLine: false,
          createError: 'Failed to create budget line.',
        }));
      }
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
      const newBudgetLines = [...budgetLines, response.budgetLine];
      setBudgetLines(newBudgetLines);
      setRemainingAmount(response.remainingAmount);
      closePicker();

      // Focus the newly added row after a short delay
      setTimeout(() => {
        newLineRowRef.current?.focus();
      }, 100);
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
   * Handle edit budget line submit.
   */
  const handleBudgetLineEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedBudgetLine) return;

    const newAmount = parseFloat(budgetLineFormAmount);
    if (isNaN(newAmount) || newAmount < 0) {
      setBudgetLineFormError(t('invoiceDetail.budgetLines.editError.amountInvalid'));
      return;
    }

    setIsBudgetLineMutating(true);
    setBudgetLineFormError('');

    try {
      const response = await updateInvoiceBudgetLine(invoiceId, selectedBudgetLine.id, {
        itemizedAmount: newAmount,
      });

      setBudgetLines((prev) =>
        prev.map((line) =>
          line.id === selectedBudgetLine.id ? response.budgetLine : line,
        ),
      );
      setRemainingAmount(response.remainingAmount);
      closeBudgetLineModal();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.error.code === 'ITEMIZED_SUM_EXCEEDS_INVOICE') {
          setBudgetLineFormError(t('invoiceDetail.budgetLines.editError.exceedsTotal'));
        } else {
          setBudgetLineFormError(translateApiError(err.error.code, tErrors));
        }
      } else {
        setBudgetLineFormError(t('invoiceDetail.budgetLines.editError.saveFailed'));
      }
    } finally {
      setIsBudgetLineMutating(false);
    }
  };

  /**
   * Handle delete budget line confirm.
   */
  const handleBudgetLineDeleteConfirm = async () => {
    if (!selectedBudgetLine) return;

    setIsBudgetLineMutating(true);
    setBudgetLineFormError('');

    try {
      await deleteInvoiceBudgetLine(invoiceId, selectedBudgetLine.id);
      await loadBudgetLines();
      closeBudgetLineModal();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setBudgetLineFormError(translateApiError(err.error.code, tErrors));
      } else {
        setBudgetLineFormError(t('invoiceDetail.budgetLines.editError.saveFailed'));
      }
    } finally {
      setIsBudgetLineMutating(false);
    }
  };

  // Determine remaining color
  const getRemainingColor = () => {
    if (remainingAmount > 0.01) return 'warning'; // > 0
    if (remainingAmount < -0.01) return 'danger'; // < 0
    return 'neutral'; // ≈ 0
  };

  /**
   * Create an empty budget line form state.
   */
  const emptyCreateForm = (): BudgetLineFormState => ({
    description: '',
    plannedAmount: '',
    confidence: 'own_estimate',
    budgetCategoryId: '',
    budgetSourceId: '',
    vendorId: '',
    pricingMode: 'direct',
    quantity: '',
    unit: '',
    unitPrice: '',
    includesVat: true,
  });

  /**
   * Focus into the description field when the create form opens.
   */
  useEffect(() => {
    if (pickerState.showCreateForm) {
      setTimeout(() => {
        document.getElementById('budget-description')?.focus();
      }, 0);
    }
  }, [pickerState.showCreateForm]);

  return (
    <section aria-labelledby="budget-lines-title" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 id="budget-lines-title" className={styles.sectionTitle}>
          {t('invoiceDetail.budgetLines.sectionTitle')}
          {!isLoading && budgetLines.length > 0 && (
            <span
              className={styles.countBadge}
              aria-label={t('invoiceDetail.budgetLines.countLabel_other', {
                count: budgetLines.length,
              })}
            >
              {budgetLines.length}
            </span>
          )}
        </h2>
        <button
          type="button"
          ref={addButtonRef}
          className={sharedStyles.btnPrimary}
          disabled={isLoading}
          onClick={() => {
            setShowPicker(true);
            setError(null);
          }}
        >
          {t('invoiceDetail.budgetLines.addButton')}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <FormError message={error} />
      )}

      {/* Loading state */}
      {isLoading && <div className={styles.loadingState}>{t('invoiceDetail.budgetLines.loading')}</div>}

      {/* Empty state */}
      {!isLoading && budgetLines.length === 0 && !error && (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📊</span>
          <p className={styles.emptyTitle}>{t('invoiceDetail.budgetLines.empty.message')}</p>
          <p className={styles.emptyBody}>
            {t('invoiceDetail.budgetLines.empty.description')}
          </p>
        </div>
      )}

      {/* Table view */}
      {!isLoading && budgetLines.length > 0 && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thDescription}>{t('invoiceDetail.budgetLines.columns.description')}</th>
                <th className={styles.thCategory}>{t('invoiceDetail.budgetLines.columns.category')}</th>
                <th className={styles.thPlanned}>{t('invoiceDetail.budgetLines.columns.planned')}</th>
                <th className={styles.thItemized}>{t('invoiceDetail.budgetLines.columns.itemized')}</th>
                <th className={styles.thLinkedItem}>{t('invoiceDetail.budgetLines.columns.linkedItem')}</th>
                <th className={styles.thActions}>{t('invoiceDetail.budgetLines.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {budgetLines.map((line, index) => (
                <tr
                  key={line.id}
                  className={styles.tr}
                  ref={index === budgetLines.length - 1 ? newLineRowRef : null}
                  data-row-id={line.id}
                  tabIndex={-1}
                >
                  <td className={styles.tdDescription}>{line.budgetLineDescription || '\u2014'}</td>
                  <td className={styles.tdCategory}>
                    {line.categoryName
                      ? getCategoryDisplayName(
                          tSettings,
                          line.categoryName,
                          line.categoryTranslationKey,
                        )
                      : '—'}
                  </td>
                  <td className={styles.tdPlanned}>{formatCurrency(line.plannedAmount)}</td>
                  <td className={styles.tdItemized}>
                    <span>{formatCurrency(line.itemizedAmount)}</span>
                  </td>
                  <td className={styles.tdLinkedItem}>
                    <Link
                      to={`/project/${line.parentItemType === 'work_item' ? 'work-items' : 'household-items'}/${line.parentItemId}`}
                      className={styles.linkedItemLink}
                    >
                      {line.parentItemTitle}
                    </Link>
                    {line.parentItemType === 'work_item' && (
                      <AreaBreadcrumb area={line.parentItemArea ?? null} variant="compact" />
                    )}
                  </td>
                  <td className={styles.tdActions}>
                    <OverflowMenu
                      items={[
                        {
                          label: t('invoiceDetail.budgetLines.menu.edit'),
                          onClick: () => openEditBudgetLineModal(line),
                        },
                        {
                          label: t('invoiceDetail.budgetLines.menu.remove'),
                          onClick: () => openRemoveBudgetLineModal(line),
                          variant: 'destructive',
                        },
                      ]}
                      triggerAriaLabel={t('invoiceDetail.budgetLines.menu.ariaLabel', {
                        description: line.budgetLineDescription || 'budget line',
                      })}
                      placement="bottom-end"
                      usePortal
                      data-testid={`budget-line-menu-${line.id}`}
                    />
                  </td>
                </tr>
              ))}

              {/* Remaining row */}
              <tr
                className={`${styles.tr} ${styles.trRemaining} ${styles[`trRemaining_${getRemainingColor()}`]}`}
              >
                <td colSpan={4} className={styles.tdRemainingLabel}>
                  {t('invoiceDetail.budgetLines.columns.remaining')}
                </td>
                <td
                  ref={remainingAmountRef}
                  className={styles.tdRemaining}
                  aria-live="polite"
                  aria-label={`Remaining amount: ${formatCurrency(remainingAmount)}`}
                >
                  {formatCurrency(remainingAmount)}
                </td>
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
                          void handleSelectItem(item.id, 'work_item', item.title);
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
                        onSelectItem={(item) => {
                          void handleSelectItem(item.id, 'household_item', item.name);
                        }}
                        excludeIds={[]}
                        placeholder="Search household items..."
                        showItemsOnFocus
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Select budget line and set itemized amounts */}
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
                    !pickerState.error &&
                    !pickerState.showCreateForm && (
                      <div className={styles.emptyState}>
                        <p>No unlinked budget lines for this item.</p>
                        <button
                          type="button"
                          ref={createBudgetLineButtonRef}
                          className={styles.addButton}
                          onClick={() => void showCreateBudgetLineForm()}
                        >
                          Create Budget Line
                        </button>
                      </div>
                    )}

                  {!pickerState.isLoading &&
                    pickerState.showCreateForm &&
                    pickerState.createForm && (
                      <div className={styles.createBudgetLineForm}>
                        <fieldset className={styles.createBudgetLineFieldset}>
                          <legend className={styles.srOnly}>
                            {t('invoiceDetail.budgetLines.createFormLegend')}
                          </legend>
                          <BudgetLineForm
                            form={pickerState.createForm}
                            onSubmit={(e) => void handleCreateBudgetLine(e)}
                            onFormChange={(updates) =>
                              setPickerState((prev) => ({
                                ...prev,
                                createForm: prev.createForm
                                  ? { ...prev.createForm, ...updates }
                                  : prev.createForm,
                              }))
                            }
                            onCancel={() => {
                              setPickerState((prev) => ({
                                ...prev,
                                showCreateForm: false,
                                createForm: undefined,
                                createError: null,
                              }));
                              setTimeout(() => {
                                createBudgetLineButtonRef.current?.focus();
                              }, 0);
                            }}
                            error={pickerState.createError ?? null}
                            isSaving={pickerState.isCreatingBudgetLine ?? false}
                            isEditing={false}
                            confidenceLabels={CONFIDENCE_LABELS}
                            budgetSources={pickerState.budgetSources ?? []}
                            vendors={pickerState.vendors ?? []}
                            budgetCategories={
                              pickerState.type === 'work_item'
                                ? (pickerState.categories ?? [])
                                : undefined
                            }
                          />
                        </fieldset>
                      </div>
                    )}

                  {!pickerState.isLoading &&
                    pickerState.budgetLines.length > 0 &&
                    !pickerState.showCreateForm && (
                      <>
                        <div className={styles.budgetLineList}>
                          {pickerState.budgetLines.map((line) => {
                            const itemizedAmount = pickerState.itemizedAmounts?.[line.id] ?? 0;
                            return (
                              <div key={line.id} className={styles.pickerBudgetLineRow}>
                                <div className={styles.budgetLineInfo}>
                                  <div className={styles.budgetLineDesc}>
                                    {line.description || 'Unnamed budget line'}
                                  </div>
                                  <div className={styles.budgetLineDetails}>
                                    {line.budgetCategory && (
                                      <span className={styles.budgetLineCategory}>
                                        {getCategoryDisplayName(
                                          tSettings,
                                          line.budgetCategory.name,
                                          line.budgetCategory.translationKey,
                                        )}
                                      </span>
                                    )}
                                    <span className={styles.budgetLinePlanned}>
                                      Planned: {formatCurrency(line.plannedAmount)}
                                    </span>
                                  </div>
                                </div>
                                <div className={styles.pickerBudgetLineAmount}>
                                  <input
                                    type="number"
                                    value={itemizedAmount > 0 ? itemizedAmount.toString() : ''}
                                    onChange={(e) => {
                                      const newAmount = parseFloat(e.target.value) || 0;
                                      setPickerState({
                                        ...pickerState,
                                        itemizedAmounts: {
                                          ...pickerState.itemizedAmounts,
                                          [line.id]: newAmount,
                                        },
                                      });
                                    }}
                                    className={styles.pickerAmountInput}
                                    placeholder="0.00"
                                    min="0"
                                    step="0.01"
                                    aria-label={`Itemized amount for ${line.description || 'budget line'}`}
                                    onWheel={(e) => e.currentTarget.blur()}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Remaining to allocate indicator */}
                        <div className={styles.remainingIndicator}>
                          <span className={styles.remainingLabel}>Remaining to allocate:</span>
                          <span
                            className={`${styles.remainingAmount} ${
                              pickerState.itemizedAmounts &&
                              Object.values(pickerState.itemizedAmounts).reduce(
                                (sum, v) => sum + v,
                                0,
                              ) > invoiceTotal
                                ? styles.remainingExceeds
                                : ''
                            }`}
                          >
                            {formatCurrency(
                              invoiceTotal -
                                (pickerState.itemizedAmounts
                                  ? Object.values(pickerState.itemizedAmounts).reduce(
                                      (sum, v) => sum + v,
                                      0,
                                    )
                                  : 0),
                            )}
                          </span>
                        </div>

                        {/* Create links for all entered amounts */}
                        <button
                          type="button"
                          className={styles.addButton}
                          onClick={async () => {
                            if (
                              !pickerState.itemId ||
                              !pickerState.type ||
                              !pickerState.itemizedAmounts
                            )
                              return;

                            // Create links for all lines with amounts entered
                            for (const line of pickerState.budgetLines) {
                              const amount = pickerState.itemizedAmounts[line.id] ?? 0;
                              if (amount > 0) {
                                try {
                                  const createData = {
                                    invoiceId,
                                    ...(pickerState.type === 'work_item'
                                      ? { workItemBudgetId: line.id }
                                      : { householdItemBudgetId: line.id }),
                                    itemizedAmount: amount,
                                  };

                                  const response = await createInvoiceBudgetLine(
                                    invoiceId,
                                    createData,
                                  );

                                  // Update state with new line and remaining amount
                                  const newBudgetLines = [...budgetLines, response.budgetLine];
                                  setBudgetLines(newBudgetLines);
                                  setRemainingAmount(response.remainingAmount);
                                } catch (err) {
                                  let errorMsg = 'Failed to link budget line. Please try again.';

                                  if (err instanceof ApiClientError) {
                                    if (err.error.code === 'BUDGET_LINE_ALREADY_LINKED') {
                                      errorMsg =
                                        'This budget line is already linked to another invoice.';
                                    } else if (err.error.code === 'ITEMIZED_SUM_EXCEEDS_INVOICE') {
                                      errorMsg =
                                        'Linking this budget line would exceed the invoice total.';
                                    } else {
                                      errorMsg = err.error.message;
                                    }
                                  }

                                  setPickerState({
                                    ...pickerState,
                                    error: errorMsg,
                                  });
                                  return;
                                }
                              }
                            }

                            closePicker();

                            // Focus the newly added row after a short delay
                            setTimeout(() => {
                              newLineRowRef.current?.focus();
                            }, 100);
                          }}
                          disabled={
                            !pickerState.itemizedAmounts ||
                            Object.values(pickerState.itemizedAmounts).reduce(
                              (sum, v) => sum + v,
                              0,
                            ) === 0
                          }
                        >
                          Add Selected Lines
                        </button>
                        <button
                          type="button"
                          ref={createBudgetLineButtonRef}
                          className={styles.addButton}
                          onClick={() => void showCreateBudgetLineForm()}
                        >
                          Create Budget Line
                        </button>
                      </>
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

      {/* Edit budget line modal */}
      {budgetLineModalMode === 'edit' && selectedBudgetLine && (
        <EditBudgetLineModal
          line={selectedBudgetLine}
          formAmount={budgetLineFormAmount}
          onFormAmountChange={setBudgetLineFormAmount}
          onSubmit={handleBudgetLineEditSubmit}
          onClose={closeBudgetLineModal}
          error={budgetLineFormError}
          isMutating={isBudgetLineMutating}
          t={t}
        />
      )}

      {/* Delete budget line modal */}
      {budgetLineModalMode === 'remove' && selectedBudgetLine && (
        <DeleteBudgetLineModal
          line={selectedBudgetLine}
          onConfirm={handleBudgetLineDeleteConfirm}
          onClose={closeBudgetLineModal}
          error={budgetLineFormError}
          isMutating={isBudgetLineMutating}
          t={t}
        />
      )}
    </section>
  );
}

// ============================================================================
// Sub-component: EditBudgetLineModal
// ============================================================================

interface EditBudgetLineModalProps {
  line: InvoiceBudgetLineDetailResponse;
  formAmount: string;
  onFormAmountChange: (amount: string) => void;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
  error: string;
  isMutating: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function EditBudgetLineModal({
  formAmount,
  onFormAmountChange,
  onSubmit,
  onClose,
  error,
  isMutating,
  t,
}: EditBudgetLineModalProps) {
  return (
    <Modal
      title={t('invoiceDetail.budgetLines.modal.editTitle')}
      onClose={onClose}
      className={styles.modal}
      footer={
        <div className={styles.modalActions}>
          <button
            type="button"
            className={sharedStyles.btnSecondary}
            onClick={onClose}
            disabled={isMutating}
          >
            {t('common:button.cancel')}
          </button>
          <button
            type="submit"
            className={sharedStyles.btnPrimary}
            form="budget-line-edit-form"
            disabled={isMutating || !formAmount}
          >
            {isMutating ? t('invoiceDetail.budgetLines.form.saving') : t('common:button.save')}
          </button>
        </div>
      }
    >
      <form id="budget-line-edit-form" onSubmit={onSubmit} noValidate>
        {error && <FormError message={error} />}

        <p className={styles.editModalHint}>
          {t('invoiceDetail.budgetLines.form.itemizedAmount')}
        </p>

        <div className={styles.formField}>
          <label htmlFor="budget-line-amount" className={styles.label}>
            {t('invoiceDetail.budgetLines.form.itemizedAmount')}
            <span className={styles.required}>
              {t('invoiceDetail.budgetLines.form.required')}
            </span>
          </label>
          <input
            type="number"
            id="budget-line-amount"
            value={formAmount}
            onChange={(e) => onFormAmountChange(e.target.value)}
            className={sharedStyles.input}
            placeholder="0.00"
            min="0"
            step="0.01"
            required
            disabled={isMutating}
            onWheel={(e) => e.currentTarget.blur()}
          />
        </div>
      </form>
    </Modal>
  );
}

// ============================================================================
// Sub-component: DeleteBudgetLineModal
// ============================================================================

interface DeleteBudgetLineModalProps {
  line: InvoiceBudgetLineDetailResponse;
  onConfirm: () => void;
  onClose: () => void;
  error: string;
  isMutating: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function DeleteBudgetLineModal({
  onConfirm,
  onClose,
  error,
  isMutating,
  t,
}: DeleteBudgetLineModalProps) {
  return (
    <Modal
      title={t('invoiceDetail.budgetLines.modal.removeTitle')}
      onClose={onClose}
      className={styles.modal}
      footer={
        <div className={styles.modalActions}>
          <button
            type="button"
            className={sharedStyles.btnSecondary}
            onClick={onClose}
            disabled={isMutating}
          >
            {t('common:button.cancel')}
          </button>
          <button
            type="button"
            className={sharedStyles.btnConfirmDelete}
            onClick={onConfirm}
            disabled={isMutating}
          >
            {isMutating ? t('invoiceDetail.budgetLines.modal.removing') : t('invoiceDetail.budgetLines.modal.removeConfirmButton')}
          </button>
        </div>
      }
    >
      {error && <FormError message={error} />}

      <p className={styles.deleteConfirmText}>
        {t('invoiceDetail.budgetLines.modal.removeConfirm')}
      </p>
    </Modal>
  );
}
