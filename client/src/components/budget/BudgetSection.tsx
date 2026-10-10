import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../contexts/LocaleContext.js';
import type {
  BaseBudgetLine,
  BudgetSource,
  Vendor,
  BudgetCategory,
  SubsidyProgram,
} from '@cornerstone/shared';
import type { OriginState } from '../../navigation/origin.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { LocalizedError } from '../../lib/localizedError.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import type { UseBudgetSectionReturn } from '../../hooks/useBudgetSection.js';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import { CONFIDENCE_LABELS, effectivePlannedAmount } from '../../lib/budgetConstants.js';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog.js';
import { focusPageHeading } from '../../lib/focusPageHeading.js';
import { BudgetLineCard } from './BudgetLineCard.js';
import { BudgetLineForm } from './BudgetLineForm.js';
import { SubsidyLinkSection } from './SubsidyLinkSection.js';
import { BudgetCostOverview, type SubsidyPaybackData } from './BudgetCostOverview.js';
import { InvoiceGroup } from './InvoiceGroup.js';
import { EditBudgetLineModal } from './EditBudgetLineModal.js';
import styles from './BudgetSection.module.css';

export interface BudgetSectionProps<T extends BaseBudgetLine> {
  budgetLines: T[];
  subsidyPayback: SubsidyPaybackData | null;
  linkedSubsidies: SubsidyProgram[];
  availableSubsidies: SubsidyProgram[];
  budgetSectionHook: UseBudgetSectionReturn<T>;
  budgetSources: BudgetSource[];
  vendors: Vendor[];
  budgetCategories?: BudgetCategory[];
  staticCategoryLabel?: string;
  onLinkSubsidy: () => void;
  onUnlinkSubsidy: (subsidyProgramId: string) => void;
  /** Deletes the line whose id is in the hook's `deletingBudgetId`; rejects on failure. */
  onConfirmDeleteBudgetLine: () => Promise<void>;
  budgetLineType?: 'work_item' | 'household_item';
  onLinkInvoice?: (budgetLineId: string) => void;
  onUnlinkInvoice?: (budgetLineId: string, invoiceBudgetLineId: string) => void;
  isUnlinking?: Record<string, boolean>;
  inlineError?: string | null;
  /** When set, the inline-error banner shows a dismiss button that calls this. */
  onDismissInlineError?: () => void;
  oversubscribedSubsidyIds?: Set<string>;
  parentEntityId?: string;
  parentEntityLabel?: string;
  onMoveBudgetLine?: (
    budgetLineId: string,
    newParentType: 'work_item' | 'household_item',
    newParentId: string,
  ) => Promise<void>;
  onInvoiceLineEdit?: (line: T, form: BudgetLineFormState, itemizedAmount: string) => Promise<void>;
  onInvoiceLineMove?: (
    budgetLineId: string,
    newParentType: 'work_item' | 'household_item',
    newParentId: string,
  ) => Promise<void>;
  /** Router state (origin) passed to every invoice group link. */
  invoiceLinkState?: OriginState;
}

export function BudgetSection<T extends BaseBudgetLine>({
  budgetLines,
  subsidyPayback,
  linkedSubsidies,
  availableSubsidies,
  budgetSectionHook,
  budgetSources,
  vendors,
  budgetCategories,
  staticCategoryLabel,
  onLinkSubsidy,
  onUnlinkSubsidy,
  onConfirmDeleteBudgetLine,
  budgetLineType,
  onLinkInvoice,
  onUnlinkInvoice,
  isUnlinking,
  inlineError,
  onDismissInlineError,
  oversubscribedSubsidyIds,
  parentEntityId,
  parentEntityLabel,
  onMoveBudgetLine,
  onInvoiceLineEdit,
  onInvoiceLineMove,
  invoiceLinkState,
}: BudgetSectionProps<T>) {
  const { t } = useTranslation(budgetLineType === 'household_item' ? 'householdItems' : 'budget');
  const { vatRate } = useLocale();
  const { t: tBudget } = useTranslation('budget');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');

  // Cost-line delete confirmation state
  const [isDeletingLine, setIsDeletingLine] = useState(false);
  const [deleteLineError, setDeleteLineError] = useState<string | null>(null);
  const [deleteLineBlocked, setDeleteLineBlocked] = useState(false);

  // Invoice edit modal state
  const [invoiceEditLine, setInvoiceEditLine] = useState<T | null>(null);
  const [invoiceEditForm, setInvoiceEditForm] = useState<BudgetLineFormState | null>(null);
  const [invoiceEditItemizedAmount, setInvoiceEditItemizedAmount] = useState('');
  const [invoiceEditError, setInvoiceEditError] = useState('');
  const [invoiceEditMutating, setInvoiceEditMutating] = useState(false);

  const {
    openAddBudgetForm,
    openEditBudgetForm,
    closeBudgetForm,
    handleSaveBudgetLine,
    handleDeleteBudgetLine,
    showBudgetForm,
    budgetForm,
    editingBudgetId,
    isSavingBudget,
    budgetFormError,
    deletingBudgetId,
    selectedSubsidyId,
    isLinkingSubsidy,
    setBudgetFormPartial,
    setDeletingBudgetId,
    setSelectedSubsidyId,
  } = budgetSectionHook;

  const deletingLine = deletingBudgetId
    ? (budgetLines.find((line) => line.id === deletingBudgetId) ?? null)
    : null;

  const requestDeleteBudgetLine = (lineId: string) => {
    setDeleteLineError(null);
    setDeleteLineBlocked(false);
    handleDeleteBudgetLine(lineId);
  };

  const cancelDeleteBudgetLine = () => {
    if (isDeletingLine) return;
    setDeleteLineError(null);
    setDeleteLineBlocked(false);
    setDeletingBudgetId(null);
  };

  const confirmDeleteBudgetLineClick = async () => {
    setIsDeletingLine(true);
    setDeleteLineError(null);
    try {
      await onConfirmDeleteBudgetLine();
      focusPageHeading();
    } catch (err) {
      if (err instanceof ApiClientError) {
        // 409: the line is in use (e.g. invoiced); there is nothing to retry.
        setDeleteLineBlocked(err.statusCode === 409);
        setDeleteLineError(translateApiError(err.error.code, tErrors));
      } else if (err instanceof NetworkError) {
        setDeleteLineError(tCommon('requestErrors.network'));
      } else {
        setDeleteLineError(tBudget('budgetLineForm.errors.deleteFailed'));
      }
    } finally {
      setIsDeletingLine(false);
    }
  };

  // Handle invoice line edit submission
  const handleInvoiceEditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!invoiceEditLine || !invoiceEditForm || !onInvoiceLineEdit) return;

    setInvoiceEditMutating(true);
    setInvoiceEditError('');

    try {
      await onInvoiceLineEdit(invoiceEditLine, invoiceEditForm, invoiceEditItemizedAmount);
      setInvoiceEditLine(null);
      setInvoiceEditForm(null);
      setInvoiceEditItemizedAmount('');
    } catch (err) {
      let msg: string;
      if (err instanceof ApiClientError) {
        msg = translateApiError(err.error.code, tErrors);
      } else if (err instanceof NetworkError) {
        msg = tCommon('requestErrors.network');
      } else if (err instanceof LocalizedError) {
        msg = err.message;
      } else {
        msg = tBudget('invoiceDetail.budgetLines.editError.saveFailed');
      }
      setInvoiceEditError(msg);
    } finally {
      setInvoiceEditMutating(false);
    }
  };

  // Handle invoice line move
  const handleInvoiceEditMove = async (
    newParentType: 'work_item' | 'household_item',
    newParentId: string,
  ) => {
    if (!invoiceEditLine || !onInvoiceLineMove) return;
    setInvoiceEditMutating(true);
    setInvoiceEditError('');

    try {
      await onInvoiceLineMove(invoiceEditLine.id, newParentType, newParentId);
      setInvoiceEditLine(null);
      setInvoiceEditForm(null);
      setInvoiceEditItemizedAmount('');
    } catch (err) {
      let msg: string;
      if (err instanceof ApiClientError) {
        msg = translateApiError(err.error.code, tErrors);
      } else if (err instanceof NetworkError) {
        msg = tCommon('requestErrors.network');
      } else if (err instanceof LocalizedError) {
        msg = err.message;
      } else {
        msg = tBudget('budgetLineForm.parentPickerError');
      }
      setInvoiceEditError(msg);
    } finally {
      setInvoiceEditMutating(false);
    }
  };

  // Close invoice edit modal
  const closeInvoiceEditModal = () => {
    if (!invoiceEditMutating) {
      setInvoiceEditLine(null);
      setInvoiceEditForm(null);
      setInvoiceEditItemizedAmount('');
      setInvoiceEditError('');
    }
  };

  // Open invoice edit modal when a line is edited
  const handleInvoiceLineEditClick = (line: T) => {
    if (!line.invoiceLink) return;

    setInvoiceEditLine(line);
    setInvoiceEditItemizedAmount(line.invoiceLink.itemizedAmount.toString());

    // Pre-fill form
    const pricingMode = line.quantity !== null && line.unitPrice !== null ? 'unit' : 'direct';
    setInvoiceEditForm({
      description: line.description ?? '',
      plannedAmount: line.plannedAmount.toString(),
      confidence: line.confidence,
      budgetCategoryId: line.budgetCategory?.id ?? '',
      budgetSourceId: line.budgetSource?.id ?? '',
      vendorId: line.vendor?.id ?? '',
      pricingMode,
      quantity: line.quantity !== null ? line.quantity.toString() : '',
      unit: line.unit ?? '',
      unitPrice: line.unitPrice !== null ? line.unitPrice.toString() : '',
      includesVat: line.includesVat ?? true,
    });
  };

  // Group budget lines by invoice ID
  const invoiceGroups = new Map<string, T[]>();
  const unlinkedLines: T[] = [];

  budgetLines.forEach((line) => {
    if (line.invoiceLink) {
      const invoiceId = line.invoiceLink.invoiceId;
      if (!invoiceGroups.has(invoiceId)) {
        invoiceGroups.set(invoiceId, []);
      }
      invoiceGroups.get(invoiceId)!.push(line);
    } else {
      unlinkedLines.push(line);
    }
  });

  return (
    <>
      <h2 className={styles.sectionTitle}>
        {budgetLineType === 'household_item'
          ? t('detail.budget.title')
          : tBudget('common.budgetSectionTitle')}
      </h2>

      {inlineError && (
        <div className={styles.errorBanner} role="alert">
          {inlineError}
          {onDismissInlineError && (
            <button
              type="button"
              className={styles.closeError}
              onClick={onDismissInlineError}
              aria-label={tBudget('invoiceDetail.budgetLines.dismissErrorAriaLabel')}
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Cost overview box */}
      <BudgetCostOverview
        budgetLines={budgetLines}
        subsidyPayback={subsidyPayback}
        oversubscribedSubsidyNames={
          oversubscribedSubsidyIds && oversubscribedSubsidyIds.size > 0
            ? linkedSubsidies.filter((s) => oversubscribedSubsidyIds.has(s.id)).map((s) => s.name)
            : undefined
        }
      />

      {/* Budget line cards */}
      {budgetLines.length === 0 && !showBudgetForm && (
        <div className={styles.emptyState}>
          {budgetLineType === 'household_item'
            ? t('detail.budget.emptyState')
            : tBudget('budgetSection.noBudgetLines')}
        </div>
      )}
      <div className={styles.budgetLinesList}>
        {/* Invoice groups */}
        {Array.from(invoiceGroups.entries()).map(([invoiceId, groupLines]) => {
          const firstLine = groupLines[0]!;
          const invoiceLink = firstLine.invoiceLink!;
          const itemizedTotal = groupLines.reduce(
            (sum, line) => sum + (line.invoiceLink?.itemizedAmount || 0),
            0,
          );
          const plannedTotal = groupLines.reduce(
            (sum, line) => sum + effectivePlannedAmount(line, vatRate),
            0,
          );
          const vendorName = groupLines[0]?.invoiceLink?.vendorName ?? null;

          return (
            <InvoiceGroup
              key={invoiceId}
              invoiceId={invoiceId}
              invoiceNumber={invoiceLink.invoiceNumber}
              invoiceStatus={invoiceLink.invoiceStatus}
              itemizedTotal={itemizedTotal}
              plannedTotal={plannedTotal}
              lines={groupLines}
              onEdit={onInvoiceLineEdit ? handleInvoiceLineEditClick : openEditBudgetForm}
              onDelete={requestDeleteBudgetLine}
              onUnlink={onUnlinkInvoice || (() => {})}
              isUnlinking={isUnlinking || {}}
              confidenceLabels={CONFIDENCE_LABELS}
              vendorName={vendorName}
              linkState={invoiceLinkState}
            />
          );
        })}

        {/* Unlinked budget lines */}
        {unlinkedLines.map((line) => (
          <div key={line.id} className={styles.unlinkedLineWrapper}>
            {editingBudgetId === line.id ? (
              <BudgetLineForm
                form={budgetForm}
                onSubmit={handleSaveBudgetLine}
                onFormChange={setBudgetFormPartial}
                onCancel={closeBudgetForm}
                error={budgetFormError}
                isSaving={isSavingBudget}
                isEditing={true}
                confidenceLabels={CONFIDENCE_LABELS}
                budgetSources={budgetSources}
                vendors={vendors}
                budgetCategories={budgetCategories}
                staticCategoryLabel={staticCategoryLabel}
                currentParentType={budgetLineType ?? undefined}
                currentParentId={parentEntityId ?? undefined}
                currentParentLabel={parentEntityLabel ?? undefined}
                onMove={
                  onMoveBudgetLine
                    ? async (newParentType, newParentId) =>
                        onMoveBudgetLine(line.id, newParentType, newParentId)
                    : undefined
                }
              />
            ) : (
              <BudgetLineCard
                line={line}
                confidenceLabels={CONFIDENCE_LABELS}
                onEdit={() => openEditBudgetForm(line)}
                onDelete={() => requestDeleteBudgetLine(line.id)}
              >
                {/* Link to invoice button */}
                {budgetLineType && onLinkInvoice && (
                  <button
                    type="button"
                    className={styles.linkInvoiceBtn}
                    onClick={() => onLinkInvoice(line.id)}
                  >
                    {budgetLineType === 'household_item'
                      ? t('detail.budget.linkInvoiceButton')
                      : tBudget('budgetSection.linkToInvoice')}
                  </button>
                )}
              </BudgetLineCard>
            )}
          </div>
        ))}
      </div>

      {/* Budget line form for adding new lines (NOT editing — editing is handled inline above) */}
      {showBudgetForm && editingBudgetId === null && (
        <BudgetLineForm
          form={budgetForm}
          onSubmit={handleSaveBudgetLine}
          onFormChange={setBudgetFormPartial}
          onCancel={closeBudgetForm}
          error={budgetFormError}
          isSaving={isSavingBudget}
          isEditing={false}
          confidenceLabels={CONFIDENCE_LABELS}
          budgetSources={budgetSources}
          vendors={vendors}
          budgetCategories={budgetCategories}
          staticCategoryLabel={staticCategoryLabel}
        />
      )}

      {/* Invoice edit modal */}
      {invoiceEditLine && invoiceEditForm && (
        <EditBudgetLineModal
          line={{
            id: invoiceEditLine.id,
            description: invoiceEditLine.description,
            plannedAmount: invoiceEditLine.plannedAmount,
            confidence: invoiceEditLine.confidence,
            budgetCategory: invoiceEditLine.budgetCategory ?? null,
            budgetSource: invoiceEditLine.budgetSource ?? null,
            vendor: invoiceEditLine.vendor ?? null,
            quantity: invoiceEditLine.quantity,
            unit: invoiceEditLine.unit,
            unitPrice: invoiceEditLine.unitPrice,
            includesVat: invoiceEditLine.includesVat ?? true,
            invoiceLink: invoiceEditLine.invoiceLink,
            parentItemType: budgetLineType as 'work_item' | 'household_item' | undefined,
            parentItemId: parentEntityId,
            parentItemTitle: parentEntityLabel,
          }}
          fullForm={invoiceEditForm}
          onFullFormChange={(updates) =>
            setInvoiceEditForm((prev) => (prev ? { ...prev, ...updates } : null))
          }
          itemizedAmount={invoiceEditItemizedAmount}
          onItemizedAmountChange={setInvoiceEditItemizedAmount}
          onSubmit={handleInvoiceEditSubmit}
          onMove={handleInvoiceEditMove}
          onClose={closeInvoiceEditModal}
          error={invoiceEditError}
          isMutating={invoiceEditMutating}
          budgetSources={budgetSources}
          vendors={vendors}
          budgetCategories={budgetCategories}
          confidenceLabels={CONFIDENCE_LABELS}
          modalTitle={tBudget('invoiceDetail.budgetLines.modal.editTitle')}
        />
      )}

      {/* Cost-line delete confirmation (one dialog for work items and purchases) */}
      {deletingLine && (
        <ConfirmDialog
          title={tCommon('confirmDialog.deleteTitle', {
            name:
              deletingLine.description ||
              tBudget('invoiceDetail.budgetLines.picker.budgetLineGeneric'),
          })}
          irreversible
          confirmLabel={tCommon('button.delete')}
          busyLabel={tCommon('confirmDialog.deleting')}
          busy={isDeletingLine}
          error={deleteLineError}
          blocked={deleteLineBlocked}
          onConfirm={() => void confirmDeleteBudgetLineClick()}
          onCancel={cancelDeleteBudgetLine}
          testIdPrefix="cost-line-delete"
        />
      )}

      {/* Add line button */}
      {!showBudgetForm && (
        <button
          type="button"
          className={styles.addButton}
          onClick={openAddBudgetForm}
          aria-label={tBudget('budgetLineForm.addBudgetLineAriaLabel')}
        >
          {budgetLineType === 'household_item' ? t('detail.budget.addLineButton') : '+ Add Line'}
        </button>
      )}

      {/* Subsidies subsection */}
      <div className={styles.budgetSubsection}>
        <h3 className={styles.subsectionTitle}>{tBudget('budgetSection.subsidies')}</h3>
        <SubsidyLinkSection
          linkedSubsidies={linkedSubsidies}
          availableSubsidies={availableSubsidies}
          selectedSubsidyId={selectedSubsidyId}
          onSelectSubsidy={setSelectedSubsidyId}
          onLinkSubsidy={onLinkSubsidy}
          onUnlinkSubsidy={onUnlinkSubsidy}
          isLinking={isLinkingSubsidy}
          oversubscribedIds={oversubscribedSubsidyIds}
        />
      </div>
    </>
  );
}
