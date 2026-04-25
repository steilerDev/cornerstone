import { useTranslation } from 'react-i18next';
import { getSourceColorIndex } from '../../lib/budgetSourceColors.js';
import styles from './BudgetSourceChip.module.css';

export interface BudgetSourceChipProps {
  /** Pass null for the "Unassigned" pseudo-chip. */
  sourceId: string | null;
  name: string;
  isSelected: boolean;
  onToggle: (sourceId: string | null) => void;
  disabled?: boolean;
}

const MAX_LABEL_LENGTH = 24;

function truncate(s: string): string {
  return s.length > MAX_LABEL_LENGTH ? `${s.slice(0, MAX_LABEL_LENGTH)}…` : s;
}

export function BudgetSourceChip({ sourceId, name, isSelected, onToggle, disabled }: BudgetSourceChipProps) {
  const { t } = useTranslation('budget');
  const colorIndex = sourceId === null ? 0 : getSourceColorIndex(sourceId);
  const label = truncate(name);

  const chipStyle = {
    '--chip-bg': `var(--color-source-${colorIndex}-bg)`,
    '--chip-text': `var(--color-source-${colorIndex}-text)`,
    '--chip-dot': `var(--color-source-${colorIndex}-dot)`,
  } as React.CSSProperties;

  const ariaLabel = isSelected
    ? t('overview.costBreakdown.sourceFilter.chipSelected', { name })
    : t('overview.costBreakdown.sourceFilter.chipNotSelected', { name });

  return (
    <button
      type="button"
      className={`${styles.chip} ${isSelected ? styles.chipSelected : ''}`}
      style={chipStyle}
      aria-pressed={isSelected}
      aria-label={ariaLabel}
      onClick={() => onToggle(sourceId)}
      disabled={disabled}
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </button>
  );
}
