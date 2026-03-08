import type { ReactNode } from 'react';
import type {
  BaseBudgetLine,
  ConfidenceLevel,
  BudgetSource,
  Vendor,
  BudgetCategory,
  SubsidyProgram,
} from '@cornerstone/shared';
import type { UseBudgetSectionReturn } from '../../hooks/useBudgetSection.js';
import { CONFIDENCE_LABELS } from '../../lib/budgetConstants.js';
import { BudgetLineCard } from './BudgetLineCard.js';
import { BudgetLineForm } from './BudgetLineForm.js';
import { SubsidyLinkSection } from './SubsidyLinkSection.js';
import { BudgetCostOverview, type SubsidyPaybackData } from './BudgetCostOverview.js';
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
  renderBudgetLineChildren?: (line: T) => ReactNode;
  inlineError?: string | null;
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
  renderBudgetLineChildren,
  inlineError,
}: BudgetSectionProps<T>) {
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

  return (
    <>
      <h2 className={styles.sectionTitle}>Budget</h2>

      {inlineError && (
        <div className={styles.errorBanner} role="alert">
          {inlineError}
        </div>
      )}

      {/* Cost overview box */}
      <BudgetCostOverview budgetLines={budgetLines} subsidyPayback={subsidyPayback} />

      {/* Budget line cards */}
      {budgetLines.length === 0 && !showBudgetForm && (
        <div className={styles.emptyState}>
          No budget lines yet. Add the first line to start tracking costs.
        </div>
      )}
      <div className={styles.budgetLinesList}>
        {budgetLines.map((line) => (
          <BudgetLineCard
            key={line.id}
            line={line}
            confidenceLabels={CONFIDENCE_LABELS}
            onEdit={() => openEditBudgetForm(line)}
            onDelete={() => handleDeleteBudgetLine(line.id)}
            isDeleting={deletingBudgetId === line.id}
            onConfirmDelete={onConfirmDeleteBudgetLine}
            onCancelDelete={() => setDeletingBudgetId(null)}
          >
            {renderBudgetLineChildren?.(line)}
          </BudgetLineCard>
        ))}
      </div>

      {/* Budget line form (inline) */}
      {showBudgetForm && (
        <BudgetLineForm
          form={budgetForm}
          onSubmit={handleSaveBudgetLine}
          onFormChange={setBudgetFormPartial}
          onCancel={closeBudgetForm}
          error={budgetFormError}
          isSaving={isSavingBudget}
          isEditing={editingBudgetId !== null}
          confidenceLabels={CONFIDENCE_LABELS}
          budgetSources={budgetSources}
          vendors={vendors}
          budgetCategories={budgetCategories}
          staticCategoryLabel={staticCategoryLabel}
        >
          <h3 className={styles.subsectionTitle}>
            {editingBudgetId ? 'Edit Budget Line' : 'New Budget Line'}
          </h3>
        </BudgetLineForm>
      )}

      {/* Add line button */}
      {!showBudgetForm && (
        <button
          type="button"
          className={styles.addButton}
          onClick={openAddBudgetForm}
          aria-label="Add budget line"
        >
          + Add Line
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
        />
      </div>
    </>
  );
}
