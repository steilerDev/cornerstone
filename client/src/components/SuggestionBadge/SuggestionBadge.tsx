import { useTranslation } from 'react-i18next';
import styles from './SuggestionBadge.module.css';

export interface SuggestionBadgeProps {
  /** The value the LLM extracted */
  suggestedValue: string;
  /** The field label (for aria-label) */
  fieldLabel: string;
  /** Called when user clicks Apply */
  onApply: () => void;
  /** Optional: formatted display value to show to user */
  displayValue?: string;
  /** CSS class override */
  className?: string;
  /** Allow multi-line text with line breaks */
  multiLine?: boolean;
}

export function SuggestionBadge({
  suggestedValue,
  fieldLabel,
  onApply,
  displayValue,
  className,
  multiLine = false,
}: SuggestionBadgeProps) {
  const { t } = useTranslation('budget');

  return (
    <span
      className={`${styles.badge} ${multiLine ? styles.badgeMultiLine : ''} ${className || ''}`}
    >
      <span aria-hidden="true">✨</span>
      <span>{t('autoItemize.suggested', { value: displayValue ?? suggestedValue })}</span>
      <button
        type="button"
        className={styles.applyButton}
        onClick={onApply}
        aria-label={t('autoItemize.applySuggestion', {
          field: fieldLabel,
          value: suggestedValue,
        })}
      >
        {t('autoItemize.apply')}
      </button>
    </span>
  );
}
