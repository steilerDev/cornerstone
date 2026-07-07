import { type FormEvent, type ReactNode, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ConfidenceLevel,
  Vendor,
  BudgetSource,
  BudgetCategory,
  // TODO: BudgetLineAssignRequest exported by backend-developer in shared types
  BudgetLineAssignRequest,
} from '@cornerstone/shared';
import { effectiveLineAmount } from '@cornerstone/shared';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { useFormatters } from '../../lib/formatters.js';
import { useLocale } from '../../contexts/LocaleContext.js';
import { FormError } from '../FormError/index.js';
import { ParentPicker } from '../ParentPicker/index.js';
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
  isUnassigned?: boolean;
  focusParentPicker?: boolean;
  onAssign?: (body: BudgetLineAssignRequest) => Promise<void>;
  assignBudgetLineId?: string;
  children?: ReactNode;
  // Props for the "edit assigned line" parent-picker (move affordance)
  currentParentType?: 'work_item' | 'household_item' | 'unassigned';
  currentParentId?: string | null;
  currentParentLabel?: string | null;
  onMove?: (newParentType: 'work_item' | 'household_item', newParentId: string) => Promise<void>;
  // Itemized amount field (only used in invoice-side edit context)
  itemizedAmount?: string;
  onItemizedAmountChange?: (value: string) => void;
  // Embedded mode and idPrefix for inline form rendering
  embedded?: boolean;
  idPrefix?: string;
  // Hide confidence field in inline form when auto-applied from document type
  hideConfidenceField?: boolean;
  // Hide VAT field in inline form when assigned to work item (VAT is auto-determined from extraction)
  hideVatField?: boolean;
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
  isUnassigned,
  focusParentPicker,
  onAssign,
  assignBudgetLineId,
  children,
  currentParentType,
  currentParentId,
  currentParentLabel,
  onMove,
  itemizedAmount,
  onItemizedAmountChange,
  embedded,
  idPrefix,
  hideConfidenceField,
  hideVatField,
}: BudgetLineFormProps) {
  const { t } = useTranslation('budget');
  const { t: tSettings } = useTranslation('settings');
  const { formatCurrency, getCurrencySymbol } = useFormatters();
  const { vatRate } = useLocale();
  const prefix = idPrefix ?? '';

  // Parent picker state
  const [selectedParentType, setSelectedParentType] = useState<'work_item' | 'household_item'>(
    'work_item',
  );
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [parentPickerError, setParentPickerError] = useState<string | null>(null);
  const parentPickerRef = useRef<HTMLFieldSetElement>(null);

  // Edit-move specific state
  const [isPickerExpanded, setIsPickerExpanded] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [movePickerError, setMovePickerError] = useState<string | null>(null);

  // Auto-focus parent picker when requested
  useEffect(() => {
    if (focusParentPicker && parentPickerRef.current) {
      const id = requestAnimationFrame(() => {
        parentPickerRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [focusParentPicker]);

  // Initialize selectedParentType when editing an assigned line
  useEffect(() => {
    /* eslint-disable @eslint-react/set-state-in-effect -- initializing picker state from prop */
    if (currentParentType && currentParentType !== 'unassigned') {
      setSelectedParentType(currentParentType);
    }
    /* eslint-enable @eslint-react/set-state-in-effect */
  }, [currentParentType]);

  // Handle parent assignment
  const handleAssign = async () => {
    if (!selectedParentId || !onAssign || !assignBudgetLineId) return;

    setParentPickerError(null);
    setIsAssigning(true);

    try {
      const body: BudgetLineAssignRequest = {
        targetType: selectedParentType,
        targetId: selectedParentId,
        budgetCategoryId: form.budgetCategoryId || null,
      };
      await onAssign(body);
    } catch {
      setParentPickerError(t('budgetLineForm.parentPickerError') || 'Failed to assign budget line');
    } finally {
      setIsAssigning(false);
    }
  };

  // Handle parent move (for edit mode)
  const handleMove = async () => {
    if (!selectedParentId || !onMove) return;
    setMovePickerError(null);
    setIsMoving(true);
    try {
      await onMove(selectedParentType, selectedParentId);
      setIsPickerExpanded(false);
      setSelectedParentId(null);
    } catch (err) {
      const msg =
        err instanceof Error && err.message ? err.message : t('budgetLineForm.parentPickerError');
      setMovePickerError(msg);
    } finally {
      setIsMoving(false);
    }
  };

  const qty = parseFloat(form.quantity);
  const price = parseFloat(form.unitPrice);
  const computedTotal =
    form.quantity && form.unitPrice && !isNaN(qty) && !isNaN(price)
      ? effectiveLineAmount({ amount: qty * price, includesVat: form.includesVat }, vatRate)
      : 0;

  return (
    <div className={styles.container}>
      <form
        onSubmit={onSubmit}
        className={styles.form}
        {...(embedded ? { 'aria-label': t('autoItemize.inlineFormLabel') } : {})}
      >
        {error && <FormError message={error} variant="banner" />}

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${prefix}budget-description`}>
            {t('budgetLineForm.descriptionLabel')}
          </label>
          <input
            type="text"
            id={`${prefix}budget-description`}
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
          <>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${prefix}budget-planned-amount`}>
                {t('budgetLineForm.plannedAmountLabel', { currencySymbol: getCurrencySymbol() })}
              </label>
              <input
                type="number"
                id={`${prefix}budget-planned-amount`}
                className={styles.input}
                value={form.plannedAmount}
                onChange={(e) => onFormChange({ plannedAmount: e.target.value })}
                min="0"
                step="0.01"
                placeholder="0.00"
                required
                disabled={isSaving}
                onWheel={(e) => e.currentTarget.blur()}
              />
            </div>

            {!hideVatField && (
              <div className={styles.field}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={form.includesVat}
                    onChange={(e) => onFormChange({ includesVat: e.target.checked })}
                    disabled={isSaving}
                  />
                  {t('budgetLineForm.includesVatLabel', {
                    vatRate: String(Math.round(vatRate * 100)),
                  })}
                </label>
                {!form.includesVat && (
                  <div className={styles.vatNote}>
                    {t('budgetLineForm.vatNote', { vatRate: String(Math.round(vatRate * 100)) })}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className={styles.unitPricingRow}>
              <div className={styles.unitField}>
                <label className={styles.label} htmlFor={`${prefix}budget-quantity`}>
                  {t('budgetLineForm.quantityLabel')}
                </label>
                <input
                  type="number"
                  id={`${prefix}budget-quantity`}
                  className={styles.input}
                  value={form.quantity}
                  onChange={(e) => onFormChange({ quantity: e.target.value })}
                  min="0"
                  step="0.01"
                  placeholder="0"
                  disabled={isSaving}
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </div>

              <div className={styles.unitField}>
                <label className={styles.label} htmlFor={`${prefix}budget-unit`}>
                  {t('budgetLineForm.unitLabel')}
                </label>
                <input
                  type="text"
                  id={`${prefix}budget-unit`}
                  className={styles.input}
                  value={form.unit}
                  onChange={(e) => onFormChange({ unit: e.target.value })}
                  placeholder={t('budgetLineForm.unitPlaceholder')}
                  disabled={isSaving}
                />
              </div>

              <div className={styles.unitSeparator}>×</div>

              <div className={styles.unitField}>
                <label className={styles.label} htmlFor={`${prefix}budget-unit-price`}>
                  {t('budgetLineForm.priceLabel')}
                </label>
                <input
                  type="number"
                  id={`${prefix}budget-unit-price`}
                  className={styles.input}
                  value={form.unitPrice}
                  onChange={(e) => onFormChange({ unitPrice: e.target.value })}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  disabled={isSaving}
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </div>

              <div className={styles.computedTotal}>
                <label className={styles.label}>{t('budgetLineForm.totalLabel')}</label>
                <div className={styles.computedValue}>{formatCurrency(computedTotal)}</div>
              </div>
            </div>

            {!hideVatField && (
              <div className={styles.field}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={form.includesVat}
                    onChange={(e) => onFormChange({ includesVat: e.target.checked })}
                    disabled={isSaving}
                  />
                  {t('budgetLineForm.includesVatLabel', {
                    vatRate: String(Math.round(vatRate * 100)),
                  })}
                </label>
                {!form.includesVat && (
                  <div className={styles.vatNote}>
                    {t('budgetLineForm.vatNote', { vatRate: String(Math.round(vatRate * 100)) })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!hideConfidenceField && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${prefix}budget-confidence`}>
              {t('budgetLineForm.confidenceLabel')}
            </label>
            <select
              id={`${prefix}budget-confidence`}
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
        )}

        {staticCategoryLabel ? (
          <div className={styles.field}>
            <label className={styles.label}>{t('budgetLineForm.categoryLabel')}</label>
            <div className={styles.staticValue}>{staticCategoryLabel}</div>
          </div>
        ) : budgetCategories ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${prefix}budget-category`}>
              {t('budgetLineForm.categoryLabel')}
            </label>
            <select
              id={`${prefix}budget-category`}
              className={styles.select}
              value={form.budgetCategoryId}
              onChange={(e) => onFormChange({ budgetCategoryId: e.target.value })}
              disabled={isSaving}
            >
              <option value="">{t('budgetLineForm.categoryNone')}</option>
              {budgetCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {getCategoryDisplayName(tSettings, cat.name, cat.translationKey)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${prefix}budget-source`}>
            {t('budgetLineForm.fundingSourceLabel')}
          </label>
          <select
            id={`${prefix}budget-source`}
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
          <label className={styles.label} htmlFor={`${prefix}budget-vendor`}>
            {t('budgetLineForm.vendorLabel')}
          </label>
          <select
            id={`${prefix}budget-vendor`}
            className={styles.select}
            value={form.vendorId}
            onChange={(e) => onFormChange({ vendorId: e.target.value })}
            disabled={isSaving}
          >
            <option value="">{t('budgetLineForm.vendorNone')}</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.trade?.name
                  ? ` — ${getCategoryDisplayName(tSettings, v.trade.name, v.trade.translationKey)}`
                  : ''}
              </option>
            ))}
          </select>
        </div>

        {children}

        {itemizedAmount !== undefined && onItemizedAmountChange !== undefined && (
          <div className={`${styles.field} ${styles.itemizedAmountField}`}>
            <label className={styles.label} htmlFor={`${prefix}budget-itemized-amount`}>
              {t('budgetLineForm.itemizedAmountLabel', { currencySymbol: getCurrencySymbol() })}
              <span className={styles.requiredStar}>*</span>
            </label>
            <input
              type="number"
              id={`${prefix}budget-itemized-amount`}
              className={styles.input}
              value={itemizedAmount}
              onChange={(e) => onItemizedAmountChange(e.target.value)}
              min="0"
              step="0.01"
              placeholder="0.00"
              required
              disabled={isSaving}
              onWheel={(e) => e.currentTarget.blur()}
            />
          </div>
        )}

        {/* Parent picker section for assigning unassigned budget lines */}
        {!embedded && isUnassigned && onAssign && (
          <fieldset ref={parentPickerRef} className={styles.parentPickerSection} tabIndex={-1}>
            <legend className={styles.parentPickerLegend}>
              {t('budgetLineForm.parentPickerFieldsetLegend')}
            </legend>
            <ParentPicker
              selectedType={selectedParentType}
              selectedId={selectedParentId}
              onChange={(type, id) => {
                setSelectedParentType(type);
                setSelectedParentId(id);
              }}
              disabled={isSaving}
            />
            {parentPickerError && <p className={styles.parentPickerError}>{parentPickerError}</p>}
            <button
              type="button"
              className={styles.assignSubmitButton}
              disabled={isAssigning || !selectedParentId}
              onClick={handleAssign}
            >
              {isAssigning
                ? t('invoiceDetail.budgetLines.assigningButton')
                : t('budgetLineForm.assignButton')}
            </button>
          </fieldset>
        )}

        {/* Parent picker section for editing assigned budget lines (move affordance) */}
        {!embedded && !isUnassigned && currentParentId && onMove && (
          <fieldset ref={parentPickerRef} className={styles.parentPickerSection} tabIndex={-1}>
            <legend className={styles.parentPickerLegend}>
              {t('budgetLineForm.linkedItemLegend')}
            </legend>

            {/* Collapsed view: current parent + "Change" button */}
            <div className={styles.currentParentRow} hidden={isPickerExpanded}>
              <span
                className={`${styles.entityTypePill} ${styles[`entityTypePill_${currentParentType ?? 'work_item'}`]}`}
              >
                {currentParentType === 'work_item'
                  ? t('budgetLineForm.parentPickerWorkItemTab')
                  : t('budgetLineForm.parentPickerHouseholdItemTab')}
              </span>
              <span className={styles.currentParentLabel}>{currentParentLabel ?? '—'}</span>
              <button
                type="button"
                className={styles.ghostChangeButton}
                onClick={() => setIsPickerExpanded(true)}
                aria-expanded={isPickerExpanded}
                aria-controls="parent-picker-body"
                disabled={isSaving || isMoving}
              >
                {t('budgetLineForm.changeParentButton')}
              </button>
            </div>

            {/* Expanded view: ParentPicker + optional move hint + buttons */}
            <div id="parent-picker-body" hidden={!isPickerExpanded}>
              <ParentPicker
                selectedType={selectedParentType}
                selectedId={selectedParentId}
                onChange={(type, id) => {
                  setSelectedParentType(type);
                  setSelectedParentId(id);
                }}
                onTabChange={(type) => setSelectedParentType(type)}
                disabled={isMoving}
              />
              {/* Cross-table move hint */}
              {currentParentType &&
                currentParentType !== 'unassigned' &&
                selectedParentType !== currentParentType && (
                  <div className={styles.moveHint} role="status" aria-atomic="true">
                    {selectedParentType === 'household_item'
                      ? t('budgetLineForm.moveCrossTableHint')
                      : t('budgetLineForm.moveCrossTableHintReverse')}
                  </div>
                )}
              {movePickerError && <p className={styles.parentPickerError}>{movePickerError}</p>}
              <button
                type="button"
                className={styles.assignSubmitButton}
                disabled={isMoving || !selectedParentId}
                onClick={() => void handleMove()}
              >
                {isMoving ? t('budgetLineForm.movingButton') : t('budgetLineForm.moveButton')}
              </button>
              <button
                type="button"
                className={styles.ghostCancelButton}
                onClick={() => {
                  setIsPickerExpanded(false);
                  setSelectedParentId(null);
                  setMovePickerError(null);
                }}
                disabled={isMoving}
              >
                {t('budgetLineForm.cancelChangeParentButton')}
              </button>
            </div>
          </fieldset>
        )}

        {!embedded && (
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
        )}
      </form>
    </div>
  );
}
