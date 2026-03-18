import { type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConfidenceLevel, Vendor, BudgetSource, BudgetCategory } from '@cornerstone/shared';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import { FormError } from '../FormError/index.js';
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
  const { t } = useTranslation('budget');

  return (
    <div className={styles.container}>
      <form onSubmit={onSubmit} className={styles.form}>
        {error && <FormError message={error} variant="banner" />}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="budget-description">
            {t('budgetLineForm.descriptionLabel')}
          </label>
          <input
            type="text"
            id="budget-description"
            className={styles.input}
            value={form.description}
            onChange={(e) => onFormChange({ description: e.target.value })}
            placeholder={t('budgetLineForm.descriptionPlaceholder')}
            disabled={isSaving}
          />
        </div>

        <div className={styles.modeToggle}>
          <button
            type="button"
            className={`${styles.modeBtn} ${form.pricingMode === 'direct' ? styles.modeBtnActive : ''}`}
            onClick={() => onFormChange({ pricingMode: 'direct' })}
            disabled={isSaving}
          >
            {t('budgetLineForm.modeDirect')}
          </button>
          <button
            type="button"
            className={`${styles.modeBtn} ${form.pricingMode === 'unit' ? styles.modeBtnActive : ''}`}
            onClick={() => onFormChange({ pricingMode: 'unit' })}
            disabled={isSaving}
          >
            {t('budgetLineForm.modeUnit')}
          </button>
        </div>

        {form.pricingMode === 'direct' ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="budget-planned-amount">
              {t('budgetLineForm.plannedAmountLabel', { currencySymbol: '€' })}
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
        ) : (
          <>
            <div className={styles.unitPricingRow}>
              <div className={styles.unitField}>
                <label className={styles.label} htmlFor="budget-quantity">
                  {t('budgetLineForm.quantityLabel')}
                </label>
                <input
                  type="number"
                  id="budget-quantity"
                  className={styles.input}
                  value={form.quantity}
                  onChange={(e) => onFormChange({ quantity: e.target.value })}
                  min="0"
                  step="0.01"
                  placeholder="0"
                  disabled={isSaving}
                />
              </div>

              <div className={styles.unitField}>
                <label className={styles.label} htmlFor="budget-unit">
                  {t('budgetLineForm.unitLabel')}
                </label>
                <input
                  type="text"
                  id="budget-unit"
                  className={styles.input}
                  value={form.unit}
                  onChange={(e) => onFormChange({ unit: e.target.value })}
                  placeholder={t('budgetLineForm.unitPlaceholder')}
                  disabled={isSaving}
                />
              </div>

              <div className={styles.unitSeparator}>×</div>

              <div className={styles.unitField}>
                <label className={styles.label} htmlFor="budget-unit-price">
                  {t('budgetLineForm.priceLabel')}
                </label>
                <input
                  type="number"
                  id="budget-unit-price"
                  className={styles.input}
                  value={form.unitPrice}
                  onChange={(e) => onFormChange({ unitPrice: e.target.value })}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  disabled={isSaving}
                />
              </div>

              <div className={styles.computedTotal}>
                <label className={styles.label}>{t('budgetLineForm.totalLabel')}</label>
                <div className={styles.computedValue}>
                  €
                  {form.quantity && form.unitPrice
                    ? (() => {
                        const qty = parseFloat(form.quantity);
                        const price = parseFloat(form.unitPrice);
                        if (!isNaN(qty) && !isNaN(price)) {
                          const multiplier = form.includesVat ? 1 : 1.19;
                          const total = Math.round(qty * price * multiplier * 100) / 100;
                          return total.toFixed(2);
                        }
                        return '0.00';
                      })()
                    : '0.00'}
                </div>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.includesVat}
                  onChange={(e) => onFormChange({ includesVat: e.target.checked })}
                  disabled={isSaving}
                />
                {t('budgetLineForm.includesVatLabel', { vatRate: '19' })}
              </label>
              {!form.includesVat && (
                <div className={styles.vatNote}>
                  {t('budgetLineForm.vatNote', { vatRate: '19' })}
                </div>
              )}
            </div>
          </>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="budget-confidence">
            {t('budgetLineForm.confidenceLabel')}
          </label>
          <select
            id="budget-confidence"
            className={styles.select}
            value={form.confidence}
            onChange={(e) => onFormChange({ confidence: e.target.value as ConfidenceLevel })}
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
            <label className={styles.label}>{t('budgetLineForm.categoryLabel')}</label>
            <div className={styles.staticValue}>{staticCategoryLabel}</div>
          </div>
        ) : budgetCategories ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="budget-category">
              {t('budgetLineForm.categoryLabel')}
            </label>
            <select
              id="budget-category"
              className={styles.select}
              value={form.budgetCategoryId}
              onChange={(e) => onFormChange({ budgetCategoryId: e.target.value })}
              disabled={isSaving}
            >
              <option value="">{t('budgetLineForm.categoryNone')}</option>
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
            {t('budgetLineForm.fundingSourceLabel')}
          </label>
          <select
            id="budget-source"
            className={styles.select}
            value={form.budgetSourceId}
            onChange={(e) => onFormChange({ budgetSourceId: e.target.value })}
            disabled={isSaving}
          >
            {budgetSources.map((src) => (
              <option key={src.id} value={src.id}>
                {src.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="budget-vendor">
            {t('budgetLineForm.vendorLabel')}
          </label>
          <select
            id="budget-vendor"
            className={styles.select}
            value={form.vendorId}
            onChange={(e) => onFormChange({ vendorId: e.target.value })}
            disabled={isSaving}
          >
            <option value="">{t('budgetLineForm.vendorNone')}</option>
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
            disabled={
              isSaving ||
              (form.pricingMode === 'direct'
                ? !form.plannedAmount
                : !form.quantity || !form.unitPrice)
            }
          >
            {isSaving
              ? t('budgetLineForm.submitSaving')
              : isEditing
                ? t('budgetLineForm.submitSave')
                : t('budgetLineForm.submitAdd')}
          </button>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={isSaving}
          >
            {t('budgetLineForm.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
