import { useTranslation } from 'react-i18next';
import type {
  BaseBudgetLine,
  BudgetSource,
  Vendor,
  BudgetCategory,
  SubsidyProgram,
} from '@cornerstone/shared';
import type { UseBudgetSectionReturn } from '../../hooks/useBudgetSection.js';
import { CONFIDENCE_LABELS, effectivePlannedAmount } from '../../lib/budgetConstants.js';
import { BudgetLineCard } from './BudgetLineCard.js';
import { BudgetLineForm } from './BudgetLineForm.js';
import { SubsidyLinkSection } from './SubsidyLinkSection.js';
import { BudgetCostOverview, type SubsidyPaybackData } from './BudgetCostOverview.js';
import { InvoiceGroup } from './InvoiceGroup.js';
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
  onConfirmDeleteBudgetLine: () => void;
  budgetLineType?: 'work_item' | 'household_item';
  onLinkInvoice?: (budgetLineId: string) => void;
  onUnlinkInvoice?: (budgetLineId: string, invoiceBudgetLineId: string) => void;
  isUnlinking?: Record<string, boolean>;
  inlineError?: string | null;
  oversubscribedSubsidyIds?: Set<string>;
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
  oversubscribedSubsidyIds,
}: BudgetSectionProps<T>) {
  const { t } = useTranslation(budgetLineType === 'household_item' ? 'householdItems' : 'budget');

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
        {budgetLineType === 'household_item' ? t('detail.budget.title') : 'Budget'}
      </h2>

      {inlineError && (
        <div className={styles.errorBanner} role="alert">
          {inlineError}
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
            : 'No budget lines yet. Add the first line to start tracking costs.'}
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
            (sum, line) => sum + effectivePlannedAmount(line),
            0,
          );

          return (
            <InvoiceGroup
              key={invoiceId}
              invoiceId={invoiceId}
              invoiceNumber={invoiceLink.invoiceNumber}
              invoiceStatus={invoiceLink.invoiceStatus}
              itemizedTotal={itemizedTotal}
              plannedTotal={plannedTotal}
              lines={groupLines}
              onEdit={openEditBudgetForm}
              onDelete={handleDeleteBudgetLine}
              isDeleting={Object.fromEntries(
                groupLines.map((l) => [l.id, deletingBudgetId === l.id]),
              )}
              onConfirmDelete={onConfirmDeleteBudgetLine}
              onCancelDelete={() => setDeletingBudgetId(null)}
              onUnlink={onUnlinkInvoice || (() => {})}
              isUnlinking={isUnlinking || {}}
              confidenceLabels={CONFIDENCE_LABELS}
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
              />
            ) : (
              <BudgetLineCard
                line={line}
                confidenceLabels={CONFIDENCE_LABELS}
                onEdit={() => openEditBudgetForm(line)}
                onDelete={() => handleDeleteBudgetLine(line.id)}
                isDeleting={deletingBudgetId === line.id}
                onConfirmDelete={onConfirmDeleteBudgetLine}
                onCancelDelete={() => setDeletingBudgetId(null)}
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
                      : 'Link to Invoice'}
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

      {/* Add line button */}
      {!showBudgetForm && (
        <button
          type="button"
          className={styles.addButton}
          onClick={openAddBudgetForm}
          aria-label="Add budget line"
        >
          {budgetLineType === 'household_item' ? t('detail.budget.addLineButton') : '+ Add Line'}
        </button>
      )}

      {/* Subsidies subsection */}
      <div className={styles.budgetSubsection}>
        <h3 className={styles.subsectionTitle}>Subsidies</h3>
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
