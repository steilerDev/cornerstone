import styles from './BudgetBar.module.css';

export interface BudgetBarSegment {
  key: string;
  value: number;
  color: string; // CSS custom property expression, e.g. 'var(--color-budget-claimed)'
  label: string; // Human-readable name for tooltip / aria-label
}

interface BudgetBarProps {
  segments: BudgetBarSegment[];
  maxValue: number; // Total bar width = this value (available funds)
  overflow?: number; // Amount exceeding maxValue (shown in danger color)
  height?: 'sm' | 'md' | 'lg'; // sm=16px, md=24px, lg=32px — default md
  onSegmentHover?: (segment: BudgetBarSegment | null) => void;
  onSegmentClick?: (segment: BudgetBarSegment | null) => void;
  formatValue?: (value: number) => string;
}

const HEIGHT_CLASS: Record<'sm' | 'md' | 'lg', string> = {
  sm: styles.barSm,
  md: styles.barMd,
  lg: styles.barLg,
};

export function BudgetBar({
  segments,
  maxValue,
  overflow = 0,
  height = 'md',
  onSegmentHover,
  onSegmentClick,
  formatValue,
}: BudgetBarProps) {
  const heightClass = HEIGHT_CLASS[height];

  // Build aria-label describing all non-zero segments
  const visibleSegments = segments.filter((s) => s.value > 0);
  const ariaLabelParts = visibleSegments.map((s) => {
    const formatted = formatValue ? formatValue(s.value) : s.value.toString();
    return `${s.label} ${formatted}`;
  });
  if (overflow > 0) {
    const formatted = formatValue ? formatValue(overflow) : overflow.toString();
    ariaLabelParts.push(`Overflow ${formatted}`);
  }
  const ariaLabel =
    ariaLabelParts.length > 0
      ? `Budget breakdown: ${ariaLabelParts.join(', ')}`
      : 'Budget breakdown: no data';

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSegmentClick?.(null);
    }
  }

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      tabIndex={0}
      className={`${styles.bar} ${heightClass}`}
      onKeyDown={handleKeyDown}
    >
      {segments.map((segment) => {
        if (segment.value <= 0) return null;

        const widthPct = Math.min((segment.value / maxValue) * 100, 100);

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

      {overflow > 0 && (
        <div
          className={`${styles.segment} ${styles.overflow}`}
          style={{
            width: `${Math.min((overflow / maxValue) * 100, 100)}%`,
            flexShrink: 0,
          }}
          onMouseEnter={() =>
            onSegmentHover?.({
              key: '__overflow__',
              value: overflow,
              color: 'var(--color-budget-overflow)',
              label: 'Overflow',
            })
          }
          onMouseLeave={() => onSegmentHover?.(null)}
          onClick={() =>
            onSegmentClick?.({
              key: '__overflow__',
              value: overflow,
              color: 'var(--color-budget-overflow)',
              label: 'Overflow',
            })
          }
          aria-hidden="true"
        />
      )}
    </div>
  );
}
