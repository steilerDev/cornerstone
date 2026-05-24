import { useState, useEffect, useMemo, useRef, useCallback, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  InvoiceBudgetLineDetailResponse,
  WorkItemBudgetLine,
  HouseholdItemBudgetLine,
  Vendor,
  BudgetCategory,
  BudgetSource,
  EditAndMoveBudgetLineRequest,
} from '@cornerstone/shared';
import {
  fetchInvoiceBudgetLines,
  createInvoiceBudgetLine,
  deleteInvoiceBudgetLine,
  editAndMoveBudgetLine,
} from '../../lib/invoiceBudgetLinesApi.js';
import { assignBudgetLine } from '../../lib/budgetLineAssignApi.js';
import type { BudgetLineAssignRequest } from '@cornerstone/shared';
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
import { OverflowMenu } from '../../components/OverflowMenu/index.js';
import { Modal } from '../../components/Modal/Modal.js';
import { FormError } from '../../components/FormError/FormError.js';
import { Badge, type BadgeVariantMap } from '../../components/Badge/Badge.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import { useBudgetLinePicker } from '../../hooks/useBudgetLinePicker.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './InvoiceBudgetLinesSection.module.css';

interface InvoiceBudgetLinesSectionProps {
  invoiceId: string;
  invoiceTotal: number;
}

/**
 * Budget line modal modes.
 */
type BudgetLineModalMode = 'edit' | 'remove' | null;

export function InvoiceBudgetLinesSection({
  invoiceId,
  invoiceTotal,
}: InvoiceBudgetLinesSectionProps) {
  const { formatCurrency } = useFormatters();
  const { t: tSettings } = useTranslation('settings');
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');

  const unassignedBadgeVariants: BadgeVariantMap = useMemo(
    () => ({
      unassigned: {
        label: t('invoiceDetail.budgetLines.unassigned'),
        className: badgeStyles.iblUnassigned,
      },
    }),
    [t],
  );
  const [budgetLines, setBudgetLines] = useState<InvoiceBudgetLineDetailResponse[]>([]);
  const [remainingAmount, setRemainingAmount] = useState(invoiceTotal);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Budget line modal state
  const [budgetLineModalMode, setBudgetLineModalMode] = useState<BudgetLineModalMode>(null);
  const [selectedBudgetLine, setSelectedBudgetLine] =
    useState<InvoiceBudgetLineDetailResponse | null>(null);
  const [budgetLineFormError, setBudgetLineFormError] = useState('');
  const [isBudgetLineMutating, setIsBudgetLineMutating] = useState(false);
  const [assigningLineId, setAssigningLineId] = useState<string | null>(null);
  const [openedWithFocusParentPicker, setOpenedWithFocusParentPicker] = useState(false);

  // Full form state for editing assigned budget lines
  const [budgetLineFullForm, setBudgetLineFullForm] = useState<BudgetLineFormState | null>(null);
  const [budgetLineItemizedAmount, setBudgetLineItemizedAmount] = useState('');

  // Focus management
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const pickerModalRef = useRef<HTMLDivElement>(null);
  const remainingAmountRef = useRef<HTMLTableCellElement>(null);
  const newLineRowRef = useRef<HTMLTableRowElement>(null);

  // Use the picker hook
  const picker = useBudgetLinePicker({
    invoiceId,
    invoiceAmount: invoiceTotal,
    onLineCreated: (line, invoiceBudgetLineId) => {
      setBudgetLines((prev) => [...prev, { id: invoiceBudgetLineId } as InvoiceBudgetLineDetailResponse]);
      setRemainingAmount((prev) => prev - (line.plannedAmount ?? 0));
      picker.closePicker();
      setTimeout(() => {
        newLineRowRef.current?.focus();
      }, 100);
    },
  });

  // Load budget lines on mount
  const loadBudgetLines = useCallback(async () => {
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
        setError(t('invoiceDetail.budgetLines.loadError'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [invoiceId, t]);

  useEffect(() => {
    void loadBudgetLines();
  }, [loadBudgetLines]);

  const closeBudgetLineModal = useCallback(() => {
    if (!isBudgetLineMutating) {
      setBudgetLineModalMode(null);
      setSelectedBudgetLine(null);
      setBudgetLineFormError('');
      setOpenedWithFocusParentPicker(false);
      setBudgetLineFullForm(null);
      setBudgetLineItemizedAmount('');
      setError(null);
    }
  }, [isBudgetLineMutating]);


  const openEditBudgetLineModal = (
    line: InvoiceBudgetLineDetailResponse,
    options?: { focusParentPicker?: boolean },
  ) => {
    setSelectedBudgetLine(line);
    setBudgetLineFormError('');
    setOpenedWithFocusParentPicker(options?.focusParentPicker ?? false);

    // Initialize full form state for assigned lines
    if (line.parentItemType !== 'unassigned') {
      // Derive pricingMode: if both quantity and unitPrice are non-null, use 'unit'; else 'direct'
      const pricingMode = line.quantity !== null && line.unitPrice !== null ? 'unit' : 'direct';

      setBudgetLineFullForm({
        description: line.budgetLineDescription ?? '',
        plannedAmount: line.plannedAmount.toString(),
        confidence: line.confidence,
        budgetCategoryId: line.categoryId ?? '',
        budgetSourceId: line.budgetSourceId ?? '',
        vendorId: line.vendorId ?? '',
        pricingMode,
        quantity: line.quantity !== null ? line.quantity.toString() : '',
        unit: line.unit ?? '',
        unitPrice: line.unitPrice !== null ? line.unitPrice.toString() : '',
        includesVat: line.includesVat ?? true,
      });
      setBudgetLineItemizedAmount(line.itemizedAmount.toString());
    }

    setBudgetLineModalMode('edit');
  };

  const openAssignModal = useCallback((line: InvoiceBudgetLineDetailResponse) => {
    openEditBudgetLineModal(line, { focusParentPicker: true });
  }, []);

  const openRemoveBudgetLineModal = (line: InvoiceBudgetLineDetailResponse) => {
    setSelectedBudgetLine(line);
    setBudgetLineFormError('');
    setBudgetLineModalMode('remove');
  };

  // Focus into picker modal when it opens
  useEffect(() => {
    if (picker.pickerState.isOpen && pickerModalRef.current) {
      const timeoutId = setTimeout(() => {
        pickerModalRef.current?.focus();
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [picker.pickerState.isOpen]);

  // Close modals on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && picker.pickerState.isOpen) {
        picker.closePicker();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [picker.pickerState.isOpen, picker]);


  /**
   * Step 2: User selects a budget line from the filtered list.
   * Create the invoice budget line link.
   */
  const handleSelectBudgetLine = async (
    budgetLine: WorkItemBudgetLine | HouseholdItemBudgetLine,
  ) => {
    if (!picker.pickerState.itemId || !picker.pickerState.type) return;

    try {
      const createData = {
        invoiceId,
        ...(picker.pickerState.type === 'work_item'
          ? { workItemBudgetId: budgetLine.id }
          : { householdItemBudgetId: budgetLine.id }),
        itemizedAmount: budgetLine.plannedAmount,
      };

      const response = await createInvoiceBudgetLine(invoiceId, createData);

      // Update state with new line and remaining amount
      const newBudgetLines = [...budgetLines, response.budgetLine];
      setBudgetLines(newBudgetLines);
      setRemainingAmount(response.remainingAmount);
      picker.closePicker();

      // Focus the newly added row after a short delay
      setTimeout(() => {
        newLineRowRef.current?.focus();
      }, 100);
    } catch (err) {
      let errorMsg = t('invoiceDetail.budgetLines.picker.error.linkFailed');

      if (err instanceof ApiClientError) {
        if (err.error.code === 'BUDGET_LINE_ALREADY_LINKED') {
          errorMsg = t('invoiceDetail.budgetLines.picker.error.alreadyLinked');
        } else if (err.error.code === 'ITEMIZED_SUM_EXCEEDS_INVOICE') {
          errorMsg = t('invoiceDetail.budgetLines.picker.error.exceedsTotal');
        } else {
          errorMsg = err.error.message;
        }
      }

      picker.setPickerState({
        ...picker.pickerState,
        error: errorMsg,
      });
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

  /**
   * Handle full form submission for editing assigned budget lines.
   */
  const handleBudgetLineFullEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedBudgetLine || !budgetLineFullForm) return;

    const newAmount = parseFloat(budgetLineItemizedAmount);
    if (isNaN(newAmount) || newAmount <= 0) {
      setBudgetLineFormError(t('invoiceDetail.budgetLines.editError.amountInvalid'));
      return;
    }

    setIsBudgetLineMutating(true);
    setBudgetLineFormError('');

    try {
      // Compute plannedAmount from form
      let plannedAmount: number;
      if (budgetLineFullForm.pricingMode === 'direct') {
        plannedAmount = parseFloat(budgetLineFullForm.plannedAmount);
      } else {
        const qty = parseFloat(budgetLineFullForm.quantity);
        const price = parseFloat(budgetLineFullForm.unitPrice);
        plannedAmount = Math.round(qty * price * 100) / 100;
      }

      const payload: EditAndMoveBudgetLineRequest = {
        itemizedAmount: newAmount,
        description: budgetLineFullForm.description || null,
        plannedAmount,
        confidence: budgetLineFullForm.confidence,
        budgetCategoryId: budgetLineFullForm.budgetCategoryId || null,
        budgetSourceId: budgetLineFullForm.budgetSourceId || null,
        vendorId: budgetLineFullForm.vendorId || null,
        quantity:
          budgetLineFullForm.pricingMode === 'unit' && budgetLineFullForm.quantity
            ? parseFloat(budgetLineFullForm.quantity)
            : null,
        unit: budgetLineFullForm.pricingMode === 'unit' ? budgetLineFullForm.unit || null : null,
        unitPrice:
          budgetLineFullForm.pricingMode === 'unit' && budgetLineFullForm.unitPrice
            ? parseFloat(budgetLineFullForm.unitPrice)
            : null,
        includesVat: budgetLineFullForm.includesVat,
      };

      const response = await editAndMoveBudgetLine(invoiceId, selectedBudgetLine.id, payload);
      setBudgetLines((prev) =>
        prev.map((line) => (line.id === selectedBudgetLine.id ? response.budgetLine : line)),
      );
      setRemainingAmount(response.remainingAmount);
      closeBudgetLineModal();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.error.code === 'ITEMIZED_SUM_EXCEEDS_INVOICE') {
          setBudgetLineFormError(t('invoiceDetail.budgetLines.editError.exceedsTotal'));
        } else if (err.error.code === 'BUDGET_LINE_ALREADY_LINKED') {
          setBudgetLineFormError(translateApiError('BUDGET_LINE_ALREADY_LINKED', tErrors));
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
   * Handle moving a budget line to a new parent.
   */
  const handleMoveBudgetLine = useCallback(
    async (newParentType: 'work_item' | 'household_item', newParentId: string) => {
      if (!selectedBudgetLine || !budgetLineFullForm) return;

      const newAmount = parseFloat(budgetLineItemizedAmount);
      if (isNaN(newAmount) || newAmount <= 0) {
        throw new Error(t('invoiceDetail.budgetLines.editError.amountInvalid'));
      }

      let plannedAmount: number;
      if (budgetLineFullForm.pricingMode === 'direct') {
        plannedAmount = parseFloat(budgetLineFullForm.plannedAmount);
      } else {
        plannedAmount =
          Math.round(
            parseFloat(budgetLineFullForm.quantity) *
              parseFloat(budgetLineFullForm.unitPrice) *
              100,
          ) / 100;
      }

      const payload: EditAndMoveBudgetLineRequest = {
        itemizedAmount: newAmount,
        description: budgetLineFullForm.description || null,
        plannedAmount,
        confidence: budgetLineFullForm.confidence,
        budgetCategoryId: budgetLineFullForm.budgetCategoryId || null,
        budgetSourceId: budgetLineFullForm.budgetSourceId || null,
        vendorId: budgetLineFullForm.vendorId || null,
        quantity:
          budgetLineFullForm.pricingMode === 'unit' && budgetLineFullForm.quantity
            ? parseFloat(budgetLineFullForm.quantity)
            : null,
        unit: budgetLineFullForm.pricingMode === 'unit' ? budgetLineFullForm.unit || null : null,
        unitPrice:
          budgetLineFullForm.pricingMode === 'unit' && budgetLineFullForm.unitPrice
            ? parseFloat(budgetLineFullForm.unitPrice)
            : null,
        includesVat: budgetLineFullForm.includesVat,
        ...(newParentType === 'work_item'
          ? { newWorkItemId: newParentId }
          : { newHouseholdItemId: newParentId }),
      };

      const response = await editAndMoveBudgetLine(invoiceId, selectedBudgetLine.id, payload);
      setBudgetLines((prev) =>
        prev.map((line) => (line.id === selectedBudgetLine.id ? response.budgetLine : line)),
      );
      setRemainingAmount(response.remainingAmount);
      closeBudgetLineModal();
    },
    [selectedBudgetLine, budgetLineFullForm, budgetLineItemizedAmount, invoiceId, t, closeBudgetLineModal],
  );

  /**
   * Handle assigning an unassigned budget line.
   */
  const handleAssignBudgetLine = useCallback(
    async (body: BudgetLineAssignRequest) => {
      if (!selectedBudgetLine?.workItemBudgetId) return;
      const wibId = selectedBudgetLine.workItemBudgetId;
      setAssigningLineId(selectedBudgetLine.id);

      try {
        await assignBudgetLine(wibId, body);
        await loadBudgetLines();
        closeBudgetLineModal();
      } finally {
        setAssigningLineId(null);
      }
    },
    [selectedBudgetLine, closeBudgetLineModal, loadBudgetLines],
  );

  // Determine remaining color
  const getRemainingColor = () => {
    if (remainingAmount > 0.01) return 'warning'; // > 0
    if (remainingAmount < -0.01) return 'danger'; // < 0
    return 'neutral'; // ≈ 0
  };

  /**
   * Focus into the description field when the create form opens.
   */
  useEffect(() => {
    if (picker.pickerState.showCreateForm) {
      const timeoutId = setTimeout(() => {
        document.getElementById('budget-description')?.focus();
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [picker.pickerState.showCreateForm]);

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
        <div className={styles.buttonGroup}>
          <button
            type="button"
            ref={addButtonRef}
            className={sharedStyles.btnPrimary}
            disabled={isLoading}
            onClick={() => {
              picker.openPicker();
              setError(null);
            }}
          >
            + {t('invoiceDetail.budgetLines.addButton')}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
          <button
            type="button"
            className={styles.dismissButton}
            onClick={() => setError(null)}
            aria-label={t('invoiceDetail.budgetLines.dismissErrorAriaLabel')}
          >
            {t('invoiceDetail.budgetLines.dismissError')}
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className={styles.loadingState}>{t('invoiceDetail.budgetLines.loading')}</div>
      )}

      {/* Empty state */}
      {!isLoading && budgetLines.length === 0 && !error && (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📊</span>
          <p className={styles.emptyTitle}>{t('invoiceDetail.budgetLines.empty.message')}</p>
          <p className={styles.emptyBody}>{t('invoiceDetail.budgetLines.empty.description')}</p>
        </div>
      )}

      {/* Table view */}
      {!isLoading && budgetLines.length > 0 && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thDescription}>
                  {t('invoiceDetail.budgetLines.columns.description')}
                </th>
                <th className={styles.thCategory}>
                  {t('invoiceDetail.budgetLines.columns.category')}
                </th>
                <th className={styles.thPlanned}>
                  {t('invoiceDetail.budgetLines.columns.planned')}
                </th>
                <th className={styles.thItemized}>
                  {t('invoiceDetail.budgetLines.columns.itemized')}
                </th>
                <th className={styles.thLinkedItem}>
                  {t('invoiceDetail.budgetLines.columns.linkedItem')}
                </th>
                <th className={styles.thActions}>
                  {t('invoiceDetail.budgetLines.columns.actions')}
                </th>
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
                    {line.parentItemType === 'unassigned' ? (
                      <div className={styles.unassignedCell}>
                        <Badge
                          variants={unassignedBadgeVariants}
                          value="unassigned"
                          ariaLabel={t('invoiceDetail.budgetLines.unassignedAriaLabel')}
                        />
                        <button
                          type="button"
                          className={styles.assignButton}
                          disabled={assigningLineId === line.id}
                          onClick={() => openAssignModal(line)}
                          aria-label={t('invoiceDetail.budgetLines.assignAriaLabel', {
                            description: line.budgetLineDescription || 'budget line',
                          })}
                        >
                          {assigningLineId === line.id
                            ? t('invoiceDetail.budgetLines.assigningButton')
                            : t('invoiceDetail.budgetLines.assignButton')}
                        </button>
                      </div>
                    ) : (
                      <>
                        <Link
                          to={`/project/${line.parentItemType === 'work_item' ? 'work-items' : 'household-items'}/${line.parentItemId}`}
                          className={styles.linkedItemLink}
                        >
                          {line.parentItemTitle}
                        </Link>
                        {line.parentItemType === 'work_item' && (
                          <AreaBreadcrumb area={line.parentItemArea ?? null} variant="compact" />
                        )}
                      </>
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
                  aria-label={t('invoiceDetail.budgetLines.remainingAriaLabel', {
                    amount: formatCurrency(remainingAmount),
                  })}
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
      {picker.pickerState.isOpen && (
        <div className={styles.pickerModal}>
          <div className={styles.modalBackdrop} onClick={picker.closePicker} />
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
                {picker.pickerState.step === 1
                  ? t('invoiceDetail.budgetLines.picker.title')
                  : t('invoiceDetail.budgetLines.picker.step2Title', {
                      itemTitle: picker.pickerState.itemTitle,
                    })}
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={picker.closePicker}
                aria-label={t('invoiceDetail.budgetLines.picker.closeAriaLabel')}
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Step 1: Select item type and item */}
              {picker.pickerState.step === 1 && (
                <div className={styles.pickerStep}>
                  <div className={styles.tabsContainer}>
                    <div className={styles.tab}>
                      <h3 className={styles.tabTitle}>
                        {t('invoiceDetail.budgetLines.picker.workItemTab')}
                      </h3>
                      <WorkItemPicker
                        value=""
                        onChange={(itemId) => {
                          picker.handleSelectItem(itemId, 'work_item');
                        }}
                        onSelectItem={(item) => {
                          picker.handleSelectItem(item.id, 'work_item', item.title);
                        }}
                        excludeIds={[]}
                        placeholder="Search work items..."
                        showItemsOnFocus
                      />
                    </div>

                    <div className={styles.separator}>
                      {t('invoiceDetail.budgetLines.picker.separator')}
                    </div>

                    <div className={styles.tab}>
                      <h3 className={styles.tabTitle}>
                        {t('invoiceDetail.budgetLines.picker.householdItemTab')}
                      </h3>
                      <HouseholdItemPicker
                        value=""
                        onChange={(itemId) => {
                          picker.handleSelectItem(itemId, 'household_item');
                        }}
                        onSelectItem={(item) => {
                          picker.handleSelectItem(item.id, 'household_item', item.name);
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
              {picker.pickerState.step === 2 && (
                <div className={styles.pickerStep}>
                  {picker.pickerState.isLoading && (
                    <div className={styles.loadingState}>
                      {t('invoiceDetail.budgetLines.picker.loadingLines')}
                    </div>
                  )}

                  {picker.pickerState.error && (
                    <div className={styles.errorBanner} role="alert">
                      {picker.pickerState.error}
                    </div>
                  )}

                  {!picker.pickerState.isLoading &&
                    picker.pickerState.budgetLines.length === 0 &&
                    !picker.pickerState.error &&
                    !picker.pickerState.showCreateForm && (
                      <div className={styles.emptyState}>
                        <p>{t('invoiceDetail.budgetLines.picker.noUnlinkedLines')}</p>
                        <button
                          type="button"
                          ref={picker.createBudgetLineButtonRef}
                          className={styles.addButton}
                          onClick={() => picker.showCreateBudgetLineForm()}
                        >
                          {t('invoiceDetail.budgetLines.picker.createLine')}
                        </button>
                      </div>
                    )}

                  {!picker.pickerState.isLoading &&
                    picker.pickerState.showCreateForm &&
                    picker.pickerState.createForm && (
                      <div className={styles.createBudgetLineForm}>
                        <fieldset className={styles.createBudgetLineFieldset}>
                          <legend className={styles.srOnly}>
                            {t('invoiceDetail.budgetLines.createFormLegend')}
                          </legend>
                          <BudgetLineForm
                            form={picker.pickerState.createForm}
                            onSubmit={(e) => picker.handleCreateBudgetLine(e)}
                            onFormChange={(updates) =>
                              picker.setPickerState((prev) => ({
                                ...prev,
                                createForm: prev.createForm
                                  ? { ...prev.createForm, ...updates }
                                  : prev.createForm,
                              }))
                            }
                            onCancel={() => {
                              picker.setPickerState((prev) => ({
                                ...prev,
                                showCreateForm: false,
                                createForm: undefined,
                                createError: null,
                              }));
                              setTimeout(() => {
                                picker.createBudgetLineButtonRef.current?.focus();
                              }, 0);
                            }}
                            error={picker.pickerState.createError ?? null}
                            isSaving={picker.pickerState.isCreatingBudgetLine ?? false}
                            isEditing={false}
                            confidenceLabels={CONFIDENCE_LABELS}
                            budgetSources={picker.pickerState.budgetSources ?? []}
                            vendors={picker.pickerState.vendors ?? []}
                            budgetCategories={
                              picker.pickerState.type === 'work_item'
                                ? (picker.pickerState.categories ?? [])
                                : undefined
                            }
                          />
                        </fieldset>
                      </div>
                    )}

                  {!picker.pickerState.isLoading &&
                    picker.pickerState.budgetLines.length > 0 &&
                    !picker.pickerState.showCreateForm && (
                      <div className={styles.budgetLineList}>
                        {picker.pickerState.budgetLines.map((line) => (
                          <button
                            key={line.id}
                            type="button"
                            className={styles.pickerBudgetLineRow}
                            onClick={() => void handleSelectBudgetLine(line)}
                          >
                            <div className={styles.budgetLineInfo}>
                              <div className={styles.budgetLineDesc}>
                                {line.description ||
                                  t('invoiceDetail.budgetLines.picker.unnamedBudgetLine')}
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
                                  {t('invoiceDetail.budgetLines.picker.plannedLabel', {
                                    amount: formatCurrency(line.plannedAmount),
                                  })}
                                </span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                  <button
                    type="button"
                    className={styles.backButton}
                    onClick={() =>
                      picker.setPickerState((prev) => ({
                        ...prev,
                        step: 1,
                        budgetLines: [],
                        isLoading: false,
                      }))
                    }
                  >
                    {t('invoiceDetail.budgetLines.picker.backButton')}
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
          fullForm={
            budgetLineFullForm ??
            ({
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
            } as BudgetLineFormState)
          }
          onFullFormChange={(updates) =>
            setBudgetLineFullForm((prev) => (prev ? { ...prev, ...updates } : null))
          }
          itemizedAmount={budgetLineItemizedAmount}
          onItemizedAmountChange={setBudgetLineItemizedAmount}
          onSubmit={
            selectedBudgetLine.parentItemType === 'unassigned'
              ? () => {}
              : handleBudgetLineFullEditSubmit
          }
          onMove={handleMoveBudgetLine}
          onAssign={handleAssignBudgetLine}
          onClose={closeBudgetLineModal}
          error={budgetLineFormError}
          isMutating={isBudgetLineMutating}
          focusParentPicker={openedWithFocusParentPicker}
          budgetSources={picker.pickerState.budgetSources ?? []}
          vendors={picker.pickerState.vendors ?? []}
          budgetCategories={picker.pickerState.categories ?? undefined}
          t={t}
          tSettings={tSettings}
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
  fullForm: BudgetLineFormState;
  onFullFormChange: (updates: Partial<BudgetLineFormState>) => void;
  itemizedAmount: string;
  onItemizedAmountChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onMove: (parentType: 'work_item' | 'household_item', parentId: string) => Promise<void>;
  onAssign?: (body: BudgetLineAssignRequest) => Promise<void>;
  onClose: () => void;
  error: string;
  isMutating: boolean;
  focusParentPicker?: boolean;
  budgetSources: BudgetSource[];
  vendors: Vendor[];
  budgetCategories?: BudgetCategory[];
  t: (key: string, opts?: Record<string, unknown>) => string;
  tSettings: (key: string) => string;
}

function EditBudgetLineModal({
  line,
  fullForm,
  onFullFormChange,
  itemizedAmount,
  onItemizedAmountChange,
  onSubmit,
  onMove,
  onAssign,
  onClose,
  error,
  isMutating,
  focusParentPicker,
  budgetSources,
  vendors,
  budgetCategories,
  t,
  tSettings,
}: EditBudgetLineModalProps) {
  const isUnassigned = line.parentItemType === 'unassigned';

  return (
    <Modal title={t('invoiceDetail.budgetLines.modal.editTitle')} onClose={onClose}>
      {isUnassigned ? (
        // For unassigned budget lines, show the BudgetLineForm with parent picker
        <BudgetLineForm
          form={{
            description: line.budgetLineDescription || '',
            plannedAmount: line.plannedAmount.toString(),
            confidence: line.confidence,
            budgetCategoryId: line.categoryId || '',
            budgetSourceId: '',
            vendorId: '',
            pricingMode: 'direct',
            quantity: '',
            unit: '',
            unitPrice: '',
            includesVat: false,
          }}
          onSubmit={() => {}}
          onFormChange={() => {}}
          onCancel={onClose}
          error={null}
          isSaving={false}
          isEditing={true}
          confidenceLabels={CONFIDENCE_LABELS}
          budgetSources={[]}
          vendors={[]}
          budgetCategories={
            line.categoryName
              ? ([
                  {
                    id: line.categoryId || '',
                    name: line.categoryName,
                    translationKey: line.categoryTranslationKey || '',
                  },
                ] as BudgetCategory[])
              : []
          }
          staticCategoryLabel={
            line.categoryName
              ? getCategoryDisplayName(tSettings, line.categoryName, line.categoryTranslationKey)
              : undefined
          }
          isUnassigned={true}
          focusParentPicker={focusParentPicker}
          onAssign={onAssign}
          assignBudgetLineId={line.workItemBudgetId ?? undefined}
        />
      ) : (
        // For assigned budget lines, show the full BudgetLineForm with move support
        <BudgetLineForm
          form={fullForm}
          onSubmit={onSubmit}
          onFormChange={onFullFormChange}
          onCancel={onClose}
          error={error}
          isSaving={isMutating}
          isEditing={true}
          confidenceLabels={CONFIDENCE_LABELS}
          budgetSources={budgetSources}
          vendors={vendors}
          budgetCategories={budgetCategories}
          staticCategoryLabel={
            line.categoryName
              ? getCategoryDisplayName(tSettings, line.categoryName, line.categoryTranslationKey)
              : undefined
          }
          currentParentType={line.parentItemType as 'work_item' | 'household_item' | 'unassigned'}
          currentParentId={line.parentItemId ?? null}
          currentParentLabel={line.parentItemTitle ?? null}
          onMove={onMove}
          itemizedAmount={itemizedAmount}
          onItemizedAmountChange={onItemizedAmountChange}
        />
      )}
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
            {isMutating
              ? t('invoiceDetail.budgetLines.modal.removing')
              : t('invoiceDetail.budgetLines.modal.removeConfirmButton')}
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
