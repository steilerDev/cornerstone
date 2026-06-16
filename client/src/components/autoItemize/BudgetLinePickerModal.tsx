import type { TFunction } from 'i18next';
import type { WorkItemBudgetLine, HouseholdItemBudgetLine } from '@cornerstone/shared';
import type { UseBudgetLinePickerReturn as UseBudgetLinePickerReturnType } from '../../hooks/useBudgetLinePicker.js';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import { ParentPicker } from '../ParentPicker/ParentPicker.js';
import { BudgetLineForm } from '../budget/BudgetLineForm.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { CONFIDENCE_LABELS } from '../../lib/budgetConstants.js';
import styles from './BudgetLinePickerModal.module.css';

interface BudgetLinePickerModalProps {
  pickerState: UseBudgetLinePickerReturnType['pickerState'];
  setPickerState: UseBudgetLinePickerReturnType['setPickerState'];
  handleSelectItem: UseBudgetLinePickerReturnType['handleSelectItem'];
  createBudgetLineButtonRef: React.RefObject<HTMLButtonElement | null>;
  onSelectBudgetLine: (line: WorkItemBudgetLine | HouseholdItemBudgetLine) => void;
  onCreateNewBudgetLine: () => void;
  onBackToStep1: () => void;
  onFormChange: (updates: Partial<BudgetLineFormState>) => void;
  onCancelCreateForm: () => void;
  onCreateBudgetLine: (e: React.FormEvent) => void;
  t: TFunction;
  tSettings: TFunction;
  formatCurrency: (amount: number) => string;
}

export function BudgetLinePickerModal({
  pickerState,
  setPickerState,
  handleSelectItem,
  createBudgetLineButtonRef,
  onSelectBudgetLine,
  onCreateNewBudgetLine,
  onBackToStep1,
  onFormChange,
  onCancelCreateForm,
  onCreateBudgetLine,
  t,
  tSettings,
  formatCurrency,
}: BudgetLinePickerModalProps) {
  return (
    <div className={styles.pickerContent}>
      {/* Step 1: Select item type and item */}
      {pickerState.step === 1 && (
        <div className={styles.pickerStep}>
          <ParentPicker
            selectedType={pickerState.type ?? 'work_item'}
            selectedId={pickerState.itemId ?? null}
            onChange={async (type, id) => {
              await handleSelectItem(id, type);
            }}
          />
        </div>
      )}

      {/* Step 2: Select budget line and set itemized amounts */}
      {pickerState.step === 2 && (
        <div className={styles.pickerStep}>
          {pickerState.isLoading && (
            <div className={styles.loadingState}>
              {t('invoiceDetail.budgetLines.picker.loadingLines')}
            </div>
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
                <p>{t('invoiceDetail.budgetLines.picker.noUnlinkedLines')}</p>
              </div>
            )}

          {!pickerState.isLoading && pickerState.showCreateForm && pickerState.createForm && (
            <div className={styles.createBudgetLineForm}>
              <fieldset className={styles.createBudgetLineFieldset}>
                <legend className={styles.srOnly}>
                  {t('invoiceDetail.budgetLines.createFormLegend')}
                </legend>
                <BudgetLineForm
                  form={pickerState.createForm}
                  onSubmit={onCreateBudgetLine}
                  onFormChange={onFormChange}
                  onCancel={onCancelCreateForm}
                  error={pickerState.createError ?? null}
                  isSaving={pickerState.isCreatingBudgetLine ?? false}
                  isEditing={false}
                  confidenceLabels={CONFIDENCE_LABELS}
                  budgetSources={pickerState.budgetSources ?? []}
                  vendors={pickerState.vendors ?? []}
                  budgetCategories={
                    pickerState.type === 'work_item' ? (pickerState.categories ?? []) : undefined
                  }
                />
              </fieldset>
            </div>
          )}

          {!pickerState.isLoading &&
            pickerState.budgetLines.length > 0 &&
            !pickerState.showCreateForm && (
              <div className={styles.budgetLineList}>
                {pickerState.budgetLines.map((line) => (
                  <button
                    key={line.id}
                    type="button"
                    className={styles.pickerBudgetLineRow}
                    onClick={() => onSelectBudgetLine(line)}
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

          {!pickerState.isLoading && !pickerState.showCreateForm && (
            <button
              type="button"
              ref={createBudgetLineButtonRef}
              className={styles.addButton}
              onClick={onCreateNewBudgetLine}
            >
              {t('invoiceDetail.budgetLines.picker.createLine')}
            </button>
          )}

          <button type="button" className={styles.backButton} onClick={onBackToStep1}>
            {t('invoiceDetail.budgetLines.picker.backButton')}
          </button>
        </div>
      )}
    </div>
  );
}
