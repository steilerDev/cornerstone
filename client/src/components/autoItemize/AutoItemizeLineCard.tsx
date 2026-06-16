import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import type { BadgeVariantMap } from '../Badge/Badge.js';
import { Badge } from '../Badge/Badge.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './AutoItemizeLineCard.module.css';
import type { LineWithInclude } from './types.js';

interface AutoItemizeLineCardProps {
  line: LineWithInclude;
  onToggleInclude: (rowId: string) => void;
  onFieldChange: (rowId: string, field: keyof LineWithInclude, value: unknown) => void;
  onAssign: (rowId: string) => void;
  onClearAssign: (rowId: string) => void;
  categories: Array<{ id: string; name: string; translationKey?: string | null }>;
  budgetSources: Array<{ id: string; name: string }>;
  createdFromExtractionVariants: BadgeVariantMap;
  t: TFunction;
  tSettings: TFunction;
}

export function AutoItemizeLineCard({
  line,
  onToggleInclude,
  onFieldChange,
  onAssign,
  onClearAssign,
  categories,
  budgetSources,
  createdFromExtractionVariants,
  t,
  tSettings,
}: AutoItemizeLineCardProps) {
  const pct = useMemo(() => Math.round(line.confidence * 100), [line.confidence]);

  const confidenceLevel = useMemo(() => {
    if (line.confidence >= 0.85) return 'high';
    if (line.confidence >= 0.6) return 'medium';
    return 'low';
  }, [line.confidence]);

  return (
    <li
      className={`${styles.lineCard} ${!line.included ? styles.lineCardExcluded : ''}`}
    >
      {/* Top row: description + confidence dot */}
      <div className={styles.cardTopRow}>
        <textarea
          className={styles.cardDescriptionInput}
          value={line.description}
          rows={2}
          onChange={(e) =>
            onFieldChange(line.rowId, 'description', e.target.value)
          }
          aria-label={t('autoItemize.editDescriptionAriaLabel')}
        />
        <span
          role="img"
          className={styles.confidenceDot}
          data-confidence={confidenceLevel}
          title={`${pct}%`}
          aria-label={t('autoItemize.confidenceLabel', { pct })}
        />
      </div>

      {/* Middle row: metric grid */}
      <div className={styles.cardMetricGrid}>
        <div className={styles.cardMetricCell}>
          <span className={styles.cardMetricLabel}>
            {t('autoItemize.quantity')}
          </span>
          <input
            type="number"
            step="0.01"
            className={styles.cardMetricInput}
            value={line.quantity ?? ''}
            placeholder="—"
            onChange={(e) =>
              onFieldChange(line.rowId, 'quantity', e.target.value)
            }
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
            onChange={(e) =>
              onFieldChange(line.rowId, 'unit', e.target.value)
            }
            aria-label={t('autoItemize.editUnitAriaLabel')}
          />
        </div>
        <div className={styles.cardMetricCell}>
          <span className={styles.cardMetricLabel}>
            {t('autoItemize.unitPrice')}
          </span>
          <input
            type="number"
            step="0.01"
            className={styles.cardMetricInput}
            value={line.unitPrice ?? ''}
            placeholder="—"
            onChange={(e) =>
              onFieldChange(line.rowId, 'unitPrice', e.target.value)
            }
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
            onChange={(e) =>
              onFieldChange(line.rowId, 'totalAmount', e.target.value)
            }
            aria-label={t('autoItemize.editTotalAmountAriaLabel')}
          />
        </div>
      </div>

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
        <label className={styles.cardIncludeLabel}>
          <input
            type="checkbox"
            checked={line.includesVat !== false}
            onChange={(e) =>
              onFieldChange(line.rowId, 'includesVat', e.target.checked)
            }
          />
          {t('autoItemize.includesVat')}
        </label>

        <div className={styles.cardAssignZone}>
          {!line.assignedBudgetLineId && !line.inlineCreatedBudgetLineDraft ? (
            <button
              type="button"
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
              {line.createdFromExtraction && (
                <Badge
                  variants={createdFromExtractionVariants}
                  value="true"
                  testId="auto-created-badge"
                />
              )}
            </div>
          ) : (
            <div className={styles.assignedBadge}>
              <span>{t('autoItemize.creatingNew')}</span>
              <button
                type="button"
                className={styles.clearAssignButton}
                onClick={() => onClearAssign(line.rowId)}
                aria-label={t('autoItemize.clearAssignmentAriaLabel')}
              >
                ✕
              </button>
            </div>
          )}
        </div>

        <div className={styles.cardBottomRowPickerRow}>
          {/* Category picker */}
          <div className={styles.cardMetricCell}>
            <label
              htmlFor={`category-${line.rowId}`}
              className={styles.cardPickerLabel}
            >
              {t('autoItemize.categoryLabel')}
            </label>
            <select
              id={`category-${line.rowId}`}
              className={styles.cardMetricInput}
              value={line.budgetCategoryId ?? ''}
              onChange={(e) =>
                onFieldChange(
                  line.rowId,
                  'budgetCategoryId',
                  e.target.value || null,
                )
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
            <label
              htmlFor={`source-${line.rowId}`}
              className={styles.cardPickerLabel}
            >
              {t('autoItemize.fundingSourceLabel')}
            </label>
            <select
              id={`source-${line.rowId}`}
              className={styles.cardMetricInput}
              value={line.budgetSourceId ?? ''}
              onChange={(e) =>
                onFieldChange(line.rowId, 'budgetSourceId', e.target.value)
              }
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
      </div>
    </li>
  );
}
