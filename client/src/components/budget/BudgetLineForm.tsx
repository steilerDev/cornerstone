import { type FormEvent, type ReactNode } from 'react';
import type { ConfidenceLevel, Vendor, BudgetSource, BudgetCategory } from '@cornerstone/shared';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import styles from './BudgetLineForm.module.css';

export interface BudgetLineFormProps {
  form: BudgetLineFormState;
  onSubmit: (e: FormEvent) => void;
  onFormChange: (updates: Partial<BudgetLineFormState>) => void;
  onCancel: () => void;
  error: string | null;
  isSaving: boolean;
  isEditing: boolean;
  confidenceLabels: Record<ConfidenceLevel, string>;
  budgetSources: BudgetSource[];
  vendors: Vendor[];
  budgetCategories?: BudgetCategory[];
  staticCategoryLabel?: string;
  children?: ReactNode;
}

export function BudgetLineForm({
  form,
  onSubmit,
  onFormChange,
  onCancel,
  error,
  isSaving,
  isEditing,
  confidenceLabels,
  budgetSources,
  vendors,
  budgetCategories,
  staticCategoryLabel,
  children,
}: BudgetLineFormProps) {
  return (
    <div className={styles.container}>
      <form onSubmit={onSubmit} className={styles.form}>
        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="budget-description">
            Description
          </label>
          <input
            type="text"
            id="budget-description"
            className={styles.input}
            value={form.description}
            onChange={(e) => onFormChange({ description: e.target.value })}
            placeholder="Optional description"
            disabled={isSaving}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="budget-planned-amount">
            Planned Amount (€) *
          </label>
          <input
            type="number"
            id="budget-planned-amount"
            className={styles.input}
            value={form.plannedAmount}
            onChange={(e) => onFormChange({ plannedAmount: e.target.value })}
            min="0"
            step="0.01"
            placeholder="0.00"
            required
            disabled={isSaving}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="budget-confidence">
            Confidence
          </label>
          <select
            id="budget-confidence"
            className={styles.select}
            value={form.confidence}
            onChange={(e) =>
              onFormChange({ confidence: e.target.value as ConfidenceLevel })
            }
            disabled={isSaving}
          >
            {Object.entries(confidenceLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {staticCategoryLabel ? (
          <div className={styles.field}>
            <label className={styles.label}>Category</label>
            <div className={styles.staticValue}>{staticCategoryLabel}</div>
          </div>
        ) : budgetCategories ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="budget-category">
              Category
            </label>
            <select
              id="budget-category"
              className={styles.select}
              value={form.budgetCategoryId}
              onChange={(e) => onFormChange({ budgetCategoryId: e.target.value })}
              disabled={isSaving}
            >
              <option value="">None</option>
              {budgetCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="budget-source">
            Funding Source
          </label>
          <select
            id="budget-source"
            className={styles.select}
            value={form.budgetSourceId}
            onChange={(e) => onFormChange({ budgetSourceId: e.target.value })}
            disabled={isSaving}
          >
            <option value="">None</option>
            {budgetSources.map((src) => (
              <option key={src.id} value={src.id}>
                {src.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="budget-vendor">
            Vendor
          </label>
          <select
            id="budget-vendor"
            className={styles.select}
            value={form.vendorId}
            onChange={(e) => onFormChange({ vendorId: e.target.value })}
            disabled={isSaving}
          >
            <option value="">None</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.specialty ? ` — ${v.specialty}` : ''}
              </option>
            ))}
          </select>
        </div>

        {children}

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={isSaving || !form.plannedAmount}
          >
            {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Line'}
          </button>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
