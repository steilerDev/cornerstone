import { memo } from 'react';
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  FocusEvent as ReactFocusEvent,
} from 'react';
import type { TimelineHouseholdItem } from '@cornerstone/shared';
import { dateToX, toUtcMidnight, ROW_HEIGHT } from './ganttUtils.js';
import type { ChartRange, ZoomLevel } from './ganttUtils.js';
import styles from './GanttHouseholdItems.module.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CIRCLE_RADIUS = 7;
const HIT_RADIUS = 16;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HouseholdItemColors {
  fill: string;
  stroke: string;
  arrivedFill: string;
  arrivedStroke: string;
  hoverGlow: string;
}

export type HouseholdItemInteractionState = 'highlighted' | 'dimmed' | 'default';

export interface GanttHouseholdItemsProps {
  householdItems: TimelineHouseholdItem[];
  chartRange: ChartRange;
  zoom: ZoomLevel;
  hiRowIndices: ReadonlyMap<string, number>;
  colors: HouseholdItemColors;
  columnWidth?: number;
  hiInteractionStates?: ReadonlyMap<string, HouseholdItemInteractionState>;
  onHiMouseEnter?: (item: TimelineHouseholdItem, event: ReactMouseEvent<SVGGElement>) => void;
  onHiMouseLeave?: (item: TimelineHouseholdItem) => void;
  onHiMouseMove?: (event: ReactMouseEvent<SVGGElement>) => void;
  onHiFocus?: (item: TimelineHouseholdItem, event: ReactFocusEvent<SVGGElement>) => void;
  onHiBlur?: (item: TimelineHouseholdItem) => void;
  onHiClick?: (itemId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const GanttHouseholdItems = memo(function GanttHouseholdItems({
  householdItems,
  chartRange,
  zoom,
  hiRowIndices,
  colors,
  columnWidth = 40,
  hiInteractionStates,
  onHiMouseEnter,
  onHiMouseLeave,
  onHiMouseMove,
  onHiFocus,
  onHiBlur,
  onHiClick,
}: GanttHouseholdItemsProps) {
  if (householdItems.length === 0) return null;

  return (
    <g
      aria-label={`Household item markers (${householdItems.length})`}
      data-testid="gantt-hi-layer"
    >
      {householdItems.map((hi) => {
        const isDelivered = hi.status === 'arrived';
        const fill = isDelivered ? colors.arrivedFill : colors.fill;
        const stroke = isDelivered ? colors.arrivedStroke : colors.stroke;
        const ariaLabel = `Household item: ${hi.name}, ${hi.status}, delivery ${hi.earliestDeliveryDate ?? 'unknown'}`;

        const rowIndex = hiRowIndices.get(hi.id) ?? 0;
        const y = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

        const dateStr = hi.actualDeliveryDate ?? hi.earliestDeliveryDate;
        if (!dateStr) return null;

        const x = dateToX(toUtcMidnight(dateStr), chartRange, zoom, columnWidth);
        const interactionState = hiInteractionStates?.get(hi.id) ?? 'default';

        const interactionClass =
          interactionState === 'highlighted'
            ? styles.hiHighlighted
            : interactionState === 'dimmed'
              ? styles.hiDimmed
              : '';

        return (
          <g
            key={hi.id}
            role="graphics-symbol"
            aria-label={ariaLabel}
            tabIndex={0}
            className={`${styles.hiMarker} ${interactionClass}`}
            style={{ '--hi-hover-glow': colors.hoverGlow } as CSSProperties}
            onMouseEnter={(e) => onHiMouseEnter?.(hi, e)}
            onMouseLeave={() => onHiMouseLeave?.(hi)}
            onMouseMove={(e) => onHiMouseMove?.(e)}
            onFocus={(e) => onHiFocus?.(hi, e)}
            onBlur={() => onHiBlur?.(hi)}
            onClick={() => onHiClick?.(hi.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onHiClick?.(hi.id);
              }
            }}
            data-testid="gantt-hi-circle"
          >
            {/* Hit area */}
            <circle cx={x} cy={y} r={HIT_RADIUS} fill="transparent" aria-hidden="true" />
            {/* Glow ring (shown on hover/focus via CSS) */}
            <circle
              cx={x}
              cy={y}
              r={14}
              fill={colors.hoverGlow}
              className={styles.hiGlow}
              aria-hidden="true"
            />
            {/* Main circle marker */}
            <circle cx={x} cy={y} r={CIRCLE_RADIUS} fill={fill} stroke={stroke} strokeWidth={2} />
          </g>
        );
      })}
    </g>
  );
});
