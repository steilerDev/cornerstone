import { type FormEvent } from 'react';
import type { BudgetCategory, BudgetSource, ConfidenceLevel, Vendor } from '@cornerstone/shared';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { BudgetLineForm } from './BudgetLineForm.js';
import { Modal } from '../Modal/Modal.js';

/**
 * A budget line that can be edited via the shared modal.
 * Supports assigned work item and household item budget lines with invoice links.
 */
export interface EditableBudgetLine {
  id: string;
  description: string | null;
  plannedAmount: number;
  confidence: ConfidenceLevel;
  budgetCategory: BudgetCategory | null;
  budgetSource: { id: string; name: string } | null;
  vendor: { id: string; name: string } | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  includesVat: boolean;
  invoiceLink: { invoiceBudgetLineId: string; invoiceId: string; itemizedAmount: number } | null;
  parentItemType?: 'work_item' | 'household_item';
  parentItemId?: string | null;
  parentItemTitle?: string | null;
}

export interface EditBudgetLineModalProps {
  line: EditableBudgetLine;
  fullForm: BudgetLineFormState;
  onFullFormChange: (updates: Partial<BudgetLineFormState>) => void;
  itemizedAmount: string;
  onItemizedAmountChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onMove: (parentType: 'work_item' | 'household_item', parentId: string) => Promise<void>;
  onClose: () => void;
  error: string;
  isMutating: boolean;
  focusParentPicker?: boolean;
  budgetSources: BudgetSource[];
  vendors: Vendor[];
  budgetCategories?: BudgetCategory[];
  confidenceLabels?: Record<ConfidenceLevel, string>;
  modalTitle: string;
}

export function EditBudgetLineModal({
  line,
  fullForm,
  onFullFormChange,
  itemizedAmount,
  onItemizedAmountChange,
  onSubmit,
  onMove,
  onClose,
  error,
  isMutating,
  focusParentPicker,
  budgetSources,
  vendors,
  budgetCategories,
  confidenceLabels,
  modalTitle,
}: EditBudgetLineModalProps) {
  // tSettings is needed only if category label lookup is required
  // If categoryName is provided in line, we derive label locally; otherwise, we pass the label from parent
  const getCategoryLabel = (): string | undefined => {
    if (line.budgetCategory?.name) {
      // We would need tSettings here, but since we're a shared component,
      // we assume the caller has already provided the derived label if needed
      return line.budgetCategory.name;
    }
    return undefined;
  };

  return (
    <Modal title={modalTitle} onClose={onClose}>
      <BudgetLineForm
        form={fullForm}
        onSubmit={onSubmit}
        onFormChange={onFullFormChange}
        onCancel={onClose}
        error={error}
        isSaving={isMutating}
        isEditing={true}
        confidenceLabels={
          confidenceLabels ?? {
            own_estimate: 'Own Estimate',
            professional_estimate: 'Professional Estimate',
            quote: 'Quote',
            invoice: 'Invoice',
          }
        }
        budgetSources={budgetSources}
        vendors={vendors}
        budgetCategories={budgetCategories}
        staticCategoryLabel={getCategoryLabel()}
        currentParentType={line.parentItemType as 'work_item' | 'household_item' | undefined}
        currentParentId={line.parentItemId ?? null}
        currentParentLabel={line.parentItemTitle ?? null}
        onMove={onMove}
        itemizedAmount={itemizedAmount}
        onItemizedAmountChange={onItemizedAmountChange}
        focusParentPicker={focusParentPicker}
      />
    </Modal>
  );
}
