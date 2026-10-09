import { useTranslation } from 'react-i18next';
import styles from './BudgetBar.module.css';

export interface BudgetBarSegment {
  key: string;
  value: number;
  color: string; // CSS custom property expression, e.g. 'var(--color-budget-claimed)'
  label: string; // Human-readable name for tooltip / aria-label
  totalValue?: number; // Cumulative total for this segment (shown in tooltips instead of incremental value)
}

export const BUDGET_BAR_OVERFLOW_KEY = '__overflow__';

interface BudgetBarProps {
  segments: BudgetBarSegment[];
  /** Capacity: the amount available (e.g. a funding source's amount). Segments are drawn up to it. */
  maxValue: number;
  overflow?: number; // Amount beyond capacity, drawn as a striped danger segment
  /** Visible text stated under the bar when overflow > 0, e.g. "Over-allocated by 250.00". */
  overflowNote?: string;
  height?: 'sm' | 'md' | 'lg'; // sm=16px, md=24px, lg=32px — default md
  onSegmentHover?: (segment: BudgetBarSegment | null) => void;
  onSegmentClick?: (segment: BudgetBarSegment | null) => void;
  formatValue?: (value: number) => string;
}

const HEIGHT_CLASS: Record<'sm' | 'md' | 'lg', string> = {
  sm: styles.barSm!,
  md: styles.barMd!,
  lg: styles.barLg!,
};

export function BudgetBar({
  segments,
  maxValue,
  overflow = 0,
  overflowNote,
  height = 'md',
  onSegmentHover,
  onSegmentClick,
  formatValue,
}: BudgetBarProps) {
  const { t } = useTranslation('budget');
  const heightClass = HEIGHT_CLASS[height];

  // Build aria-label describing all non-zero segments
  const visibleSegments = segments.filter((s) => s.value > 0);
  const ariaLabelParts = visibleSegments.map((s) => {
    const displayValue = s.totalValue ?? s.value;
    const formatted = formatValue ? formatValue(displayValue) : displayValue.toString();
    return `${s.label} ${formatted}`;
  });
  if (overflow > 0) {
    const formatted = formatValue ? formatValue(overflow) : overflow.toString();
    ariaLabelParts.push(`${t('bar.overflowLabel')} ${formatted}`);
  }
  const ariaLabel =
    ariaLabelParts.length > 0
      ? t('bar.ariaBreakdown', { details: ariaLabelParts.join(', ') })
      : t('bar.ariaNoData');

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSegmentClick?.(null);
    }
  }

  const capacity = maxValue > 0 ? maxValue : 1;
  const hasOverflow = overflow > 0;
  const scale = hasOverflow ? capacity + overflow : capacity;
  let consumed = 0;

  const overflowSegment: BudgetBarSegment = {
    key: BUDGET_BAR_OVERFLOW_KEY,
    value: overflow,
    color: 'var(--color-budget-overflow)',
    label: t('bar.overflowLabel')!,
  };

  const bar = (
    <div
      role="img"
      aria-label={ariaLabel}
      tabIndex={0}
      className={`${styles.bar} ${heightClass}`}
      onKeyDown={handleKeyDown}
    >
      {segments.map((segment) => {
        if (segment.value <= 0) return null;

        const drawn = Math.max(0, Math.min(segment.value, capacity - consumed));
        consumed += drawn;
        if (drawn <= 0) return null;
        const widthPct = (drawn / scale) * 100;

        return (
          <div
            key={segment.key}
            className={styles.segment}
            style={{
              width: `${widthPct}%`,
              backgroundColor: segment.color,
              flexShrink: 0,
            }}
            onMouseEnter={() => onSegmentHover?.(segment)}
            onMouseLeave={() => onSegmentHover?.(null)}
            onClick={() => onSegmentClick?.(segment)}
            aria-hidden="true"
          />
        );
      })}

      {hasOverflow && (
        <div
          className={`${styles.segment} ${styles.overflow}`}
          style={{
            left: `${(capacity / scale) * 100}%`,
            width: `${(overflow / scale) * 100}%`,
          }}
          onMouseEnter={() => onSegmentHover?.(overflowSegment)}
          onMouseLeave={() => onSegmentHover?.(null)}
          onClick={() => onSegmentClick?.(overflowSegment)}
          aria-hidden="true"
        />
      )}
    </div>
  );

  if (overflowNote && hasOverflow) {
    return (
      <>
        {bar}
        <p className={styles.overflowNote} data-testid="budget-bar-overflow-note">
          <span aria-hidden="true">⚠</span> {overflowNote}
        </p>
      </>
    );
  }
  return bar;
}
