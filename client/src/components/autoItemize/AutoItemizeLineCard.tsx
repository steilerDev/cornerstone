import { useEffect, useMemo, useRef } from 'react';
import { useLocale } from '../../contexts/LocaleContext.js';
import type { TFunction } from 'i18next';
import type { BadgeVariantMap } from '../Badge/Badge.js';
import type { BudgetSource, Vendor, BudgetCategory } from '@cornerstone/shared';
import { Badge } from '../Badge/Badge.js';
import badgeStyles from '../Badge/Badge.module.css';
import { BudgetLineForm } from '../budget/BudgetLineForm.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import type { BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './AutoItemizeLineCard.module.css';
import { effectiveRowAmount } from '../../lib/autoItemizeDraftUtils.js';
import type { LineWithInclude } from './types.js';

interface AutoItemizeLineCardProps {
  line: LineWithInclude;
  formatCurrency: (amount: number) => string;
  onToggleInclude: (rowId: string) => void;
  onFieldChange: (rowId: string, field: keyof LineWithInclude, value: unknown) => void;
  onAssign: (rowId: string) => void;
  onClearAssign: (rowId: string) => void;
  categories: Array<{ id: string; name: string; translationKey?: string | null }>;
  budgetSources: BudgetSource[];
  createdFromExtractionVariants: BadgeVariantMap;
  t: TFunction;
  tSettings: TFunction;
  // New optional props for inline form rendering
  onQueueNewBudgetLine?: (rowId: string) => void;
  onInlineDraftChange?: (rowId: string, updates: Partial<BudgetLineFormState>) => void;
  confidenceLabels?: Record<string, string>;
  vendors?: Vendor[];
  budgetCategories?: BudgetCategory[];
  // Merge selection props
  selected?: boolean;
  selectable?: boolean;
  onToggleSelect?: (rowId: string) => void;
}

export function AutoItemizeLineCard({
  line,
  formatCurrency,
  onToggleInclude,
  onFieldChange,
  onAssign,
  onClearAssign,
  categories,
  budgetSources,
  createdFromExtractionVariants,
  t,
  tSettings,
  onQueueNewBudgetLine: _onQueueNewBudgetLine,
  onInlineDraftChange,
  confidenceLabels,
  vendors,
  budgetCategories,
  selected = false,
  selectable = false,
  onToggleSelect,
}: AutoItemizeLineCardProps) {
  const isLinked = !!line.assignedBudgetLineId;
  const snapshot = line.assignedBudgetLineSnapshot;
  const notSet = t('autoItemize.linkedLineNotSet');
  const linkedCategory = snapshot?.budgetCategory
    ? getCategoryDisplayName(
        tSettings,
        snapshot.budgetCategory.name,
        snapshot.budgetCategory.translationKey ?? null,
      )
    : notSet;
  const linkedSource = snapshot?.budgetSource?.name ?? notSet;
  const linkedPlanned = !snapshot
    ? notSet
    : snapshot.includesVat === false
      ? t('autoItemize.linkedLinePlannedNet', { amount: formatCurrency(snapshot.plannedAmount) })
      : formatCurrency(snapshot.plannedAmount);

  const assignButtonRef = useRef<HTMLButtonElement>(null);
  const changeButtonRef = useRef<HTMLButtonElement>(null);
  const prevLinkedIdRef = useRef(line.assignedBudgetLineId);
  // The picker modal does not restore focus and the Assign / clear buttons unmount on
  // toggle, so move focus to the counterpart control when nothing else holds it.
  useEffect(() => {
    const prev = prevLinkedIdRef.current;
    prevLinkedIdRef.current = line.assignedBudgetLineId;
    if (prev === line.assignedBudgetLineId) return;
    const active = globalThis.document.activeElement;
    if (active && active !== globalThis.document.body) return;
    (line.assignedBudgetLineId ? changeButtonRef : assignButtonRef).current?.focus();
  }, [line.assignedBudgetLineId]);

  const { vatRate } = useLocale();
  const pct = useMemo(() => Math.round(line.confidence * 100), [line.confidence]);

  const confidenceLevel = useMemo(() => {
    if (line.confidence >= 0.85) return 'high';
    if (line.confidence >= 0.6) return 'medium';
    return 'low';
  }, [line.confidence]);

  const creatingNewVariants = useMemo(
    (): BadgeVariantMap => ({
      true: {
        label: t('autoItemize.creatingNewBadge'),
        className: badgeStyles.warning,
      },
    }),
    [t],
  );

  return (
    <li
      className={`${styles.lineCard} ${!line.included ? styles.lineCardExcluded : ''} ${
        selected ? styles.lineCardSelected : ''
      }`}
    >
      {/* Top row: selection + description + confidence dot */}
      <div className={styles.cardTopRow}>
        {/* Selection checkbox */}
        {selectable ? (
          <label className={styles.selectCheckboxLabel}>
            <input
              type="checkbox"
              className={styles.selectCheckbox}
              checked={selected}
              onChange={() => onToggleSelect?.(line.rowId)}
            />
            <span className={sharedStyles.srOnly}>
              {t('autoItemize.selectForMergeAriaLabel', {
                description: line.description.slice(0, 60),
              })}
            </span>
          </label>
        ) : (
          <label className={styles.selectCheckboxLabel}>
            <input
              type="checkbox"
              className={styles.selectCheckbox}
              disabled
              aria-label={t('autoItemize.selectionDisabledAssignedAriaLabel')}
              title={t('autoItemize.selectionDisabledAssignedAriaLabel')}
            />
          </label>
        )}
        {isLinked ? (
          <p className={styles.cardDescriptionText} data-testid="linked-line-description">
            {line.description || '—'}
          </p>
        ) : (
          <textarea
            id={`line-description-${line.rowId}`}
            className={styles.cardDescriptionInput}
            value={line.description}
            rows={2}
            onChange={(e) => onFieldChange(line.rowId, 'description', e.target.value)}
            aria-label={t('autoItemize.editDescriptionAriaLabel')}
          />
        )}
        <span
          role="img"
          className={styles.confidenceDot}
          data-confidence={confidenceLevel}
          title={`${pct}%`}
          aria-label={t('autoItemize.confidenceLabel', { pct })}
        />
      </div>

      {/* Middle row: metric grid */}
      {!isLinked && !line.inlineCreatedBudgetLineDraft && (
        <div className={styles.cardMetricGrid}>
          <div className={styles.cardMetricCell}>
            <span className={styles.cardMetricLabel}>{t('autoItemize.quantity')}</span>
            <input
              type="number"
              step="0.01"
              className={styles.cardMetricInput}
              value={line.quantity ?? ''}
              placeholder="—"
              onChange={(e) => onFieldChange(line.rowId, 'quantity', e.target.value)}
              aria-label={t('autoItemize.editQuantityAriaLabel')}
            />
          </div>
          <div className={styles.cardMetricCell}>
            <span className={styles.cardMetricLabel}>{t('autoItemize.unit')}</span>
            <input
              type="text"
              className={styles.cardMetricInput}
              value={line.unit ?? ''}
              placeholder="—"
              onChange={(e) => onFieldChange(line.rowId, 'unit', e.target.value)}
              aria-label={t('autoItemize.editUnitAriaLabel')}
            />
          </div>
          <div className={styles.cardMetricCell}>
            <span className={styles.cardMetricLabel}>{t('autoItemize.unitPrice')}</span>
            <input
              type="number"
              step="0.01"
              className={styles.cardMetricInput}
              value={line.unitPrice ?? ''}
              placeholder="—"
              onChange={(e) => onFieldChange(line.rowId, 'unitPrice', e.target.value)}
              aria-label={t('autoItemize.editUnitPriceAriaLabel')}
            />
          </div>
          <div className={styles.cardMetricCell}>
            <span className={styles.cardMetricLabel}>{t('autoItemize.amount')}</span>
            <input
              type="number"
              step="0.01"
              className={styles.cardMetricInput}
              value={line.totalAmount ?? 0}
              onChange={(e) => onFieldChange(line.rowId, 'totalAmount', e.target.value)}
              aria-label={t('autoItemize.editTotalAmountAriaLabel')}
            />
          </div>
        </div>
      )}

      {isLinked && (
        <div className={styles.linkedLineSection} data-testid="linked-line-values">
          <p className={styles.linkedLineHint}>{t('autoItemize.linkedLineReadOnlyHint')}</p>
          <dl className={styles.linkedLineValues}>
            <div className={styles.cardMetricCell}>
              <dt className={styles.cardMetricLabel}>{t('autoItemize.categoryLabel')}</dt>
              <dd className={styles.linkedLineValue} data-testid="linked-line-category">
                {linkedCategory}
              </dd>
            </div>
            <div className={styles.cardMetricCell}>
              <dt className={styles.cardMetricLabel}>{t('autoItemize.fundingSourceLabel')}</dt>
              <dd className={styles.linkedLineValue} data-testid="linked-line-source">
                {linkedSource}
              </dd>
            </div>
            <div className={styles.cardMetricCell}>
              <dt className={styles.cardMetricLabel}>{t('autoItemize.plannedAmountLabel')}</dt>
              <dd className={styles.linkedLineValue} data-testid="linked-line-planned">
                {linkedPlanned}
              </dd>
            </div>
          </dl>
          <div className={`${styles.cardMetricCell} ${styles.linkedItemizedCell}`}>
            <label htmlFor={`linked-itemized-${line.rowId}`} className={styles.cardMetricLabel}>
              {t('autoItemize.itemizedAmountLabel')}
            </label>
            <input
              id={`linked-itemized-${line.rowId}`}
              type="number"
              step="0.01"
              min="0"
              className={styles.cardMetricInput}
              data-testid="linked-line-itemized-amount"
              value={line.linkedItemizedAmount ?? effectiveRowAmount(line, vatRate)}
              onChange={(e) => onFieldChange(line.rowId, 'linkedItemizedAmount', e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Bottom row: include + VAT + assign */}
      <div className={styles.cardBottomRow}>
        <label className={styles.cardIncludeLabel}>
          <input
            type="checkbox"
            checked={line.included}
            onChange={() => onToggleInclude(line.rowId)}
          />
          {t('autoItemize.included')}
        </label>
        {!isLinked && (
          <label className={styles.cardIncludeLabel}>
            <input
              type="checkbox"
              checked={line.includesVat !== false}
              onChange={(e) => onFieldChange(line.rowId, 'includesVat', e.target.checked)}
            />
            {t('autoItemize.includesVat')}
          </label>
        )}

        <div className={styles.cardAssignZone}>
          {!line.assignedBudgetLineId && !line.inlineCreatedBudgetLineDraft ? (
            <button
              type="button"
              ref={assignButtonRef}
              className={`${sharedStyles.btnPrimaryCompact} ${styles.assignButtonInTable}`}
              onClick={() => onAssign(line.rowId)}
            >
              {t('autoItemize.assignButton')}
            </button>
          ) : line.assignedBudgetLineId ? (
            <div className={styles.assignedBadgeWrapper}>
              <div className={styles.assignedBadge}>
                <span title={line.assignedBudgetLineDescription || undefined}>
                  {line.assignedBudgetLineDescription || t('autoItemize.assigned')}
                </span>
                <button
                  type="button"
                  className={styles.clearAssignButton}
                  onClick={() => onClearAssign(line.rowId)}
                  aria-label={t('autoItemize.clearAssignmentAriaLabel')}
                >
                  ✕
                </button>
              </div>
              <button
                type="button"
                ref={changeButtonRef}
                className={styles.changeAssignButton}
                onClick={() => onAssign(line.rowId)}
                aria-label={t('autoItemize.changeAssignmentAriaLabel')}
              >
                {t('autoItemize.changeAssignment')}
              </button>
              {line.createdFromExtraction && (
                <Badge
                  variants={createdFromExtractionVariants}
                  value="true"
                  testId="auto-created-badge"
                />
              )}
            </div>
          ) : (
            <div className={styles.assignedBadgeWrapper}>
              <Badge variants={creatingNewVariants} value="true" testId="creating-new-badge" />
              <button
                type="button"
                className={styles.clearAssignButton}
                onClick={() => onClearAssign(line.rowId)}
                aria-label={t('autoItemize.discardInlineDraft')}
              >
                {t('autoItemize.discardInlineDraft')}
              </button>
            </div>
          )}
        </div>

        {!isLinked && !line.inlineCreatedBudgetLineDraft && (
          <div className={styles.cardBottomRowPickerRow}>
            {/* Category picker */}
            <div className={styles.cardMetricCell}>
              <label htmlFor={`category-${line.rowId}`} className={styles.cardPickerLabel}>
                {t('autoItemize.categoryLabel')}
              </label>
              <select
                id={`category-${line.rowId}`}
                className={styles.cardMetricInput}
                value={line.budgetCategoryId ?? ''}
                onChange={(e) =>
                  onFieldChange(line.rowId, 'budgetCategoryId', e.target.value || null)
                }
                aria-label={t('autoItemize.categoryAriaLabel')}
              >
                <option value="">{t('autoItemize.categoryPlaceholder')}</option>
                {categories?.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {getCategoryDisplayName(tSettings, cat.name, cat.translationKey ?? null)}
                  </option>
                ))}
              </select>
            </div>

            {/* Funding Source picker */}
            <div className={styles.cardMetricCell}>
              <label htmlFor={`source-${line.rowId}`} className={styles.cardPickerLabel}>
                {t('autoItemize.fundingSourceLabel')}
              </label>
              <select
                id={`source-${line.rowId}`}
                className={styles.cardMetricInput}
                value={line.budgetSourceId ?? ''}
                onChange={(e) => onFieldChange(line.rowId, 'budgetSourceId', e.target.value)}
                aria-label={t('autoItemize.fundingSourceAriaLabel')}
              >
                {budgetSources?.map((src) => (
                  <option key={src.id} value={src.id}>
                    {src.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {line.inlineCreatedBudgetLineDraft &&
        onInlineDraftChange &&
        confidenceLabels &&
        vendors &&
        budgetCategories !== undefined && (
          <div className={styles.inlineFormWrapper}>
            <BudgetLineForm
              embedded
              idPrefix={`inline-${line.rowId}-`}
              form={line.inlineCreatedBudgetLineDraft}
              onFormChange={(updates) => onInlineDraftChange(line.rowId, updates)}
              onSubmit={(e) => e.preventDefault()}
              onCancel={() => onClearAssign(line.rowId)}
              error={null}
              isSaving={false}
              isEditing={false}
              confidenceLabels={confidenceLabels}
              budgetSources={budgetSources}
              vendors={vendors}
              budgetCategories={budgetCategories}
              hideConfidenceField={line.inlineHideConfidence}
              hideVatField={line.assignedItemType === 'work_item'}
            />
          </div>
        )}
    </li>
  );
}
