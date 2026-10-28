import { memo } from 'react';
import { BAR_HEIGHT, BAR_OFFSET_Y, ROW_HEIGHT } from './ganttUtils.js';

const DIAMOND_HALF = 8;

/** One dashed outline: a bar-shaped rect, or a diamond for a milestone. */
export interface GanttGhostShape {
  readonly testId: string;
  readonly shape: 'bar' | 'diamond';
  /** Left edge for a bar, centre for a diamond. */
  readonly x: number;
  /** Bar width; ignored by a diamond. */
  readonly width: number;
  readonly rowIndex: number;
}

export interface GanttGhostsProps {
  ghosts: readonly GanttGhostShape[];
  /** Resolved stroke color (SVG cannot use var()). */
  stroke: string;
  /** `planned`: the 4 3 dash of a late task's plan. `preview`: the reschedule preview. */
  variant: 'planned' | 'preview';
}

/**
 * Dashed, unfilled outlines drawn under the bars (planned dates of late tasks) or over them
 * (reschedule preview). They never take pointer events.
 */
export const GanttGhosts = memo(function GanttGhosts({
  ghosts,
  stroke,
  variant,
}: GanttGhostsProps) {
  if (ghosts.length === 0) return null;
  return (
    <g aria-hidden="true" data-testid={`gantt-ghosts-${variant}`}>
      {ghosts.map((ghost) => {
        const rowY = ghost.rowIndex * ROW_HEIGHT;
        if (ghost.shape === 'diamond') {
          const y = rowY + ROW_HEIGHT / 2;
          const points = [
            `${ghost.x},${y - DIAMOND_HALF}`,
            `${ghost.x + DIAMOND_HALF},${y}`,
            `${ghost.x},${y + DIAMOND_HALF}`,
            `${ghost.x - DIAMOND_HALF},${y}`,
          ].join(' ');
          return (
            <polygon
              key={ghost.testId}
              points={points}
              fill="none"
              stroke={stroke}
              strokeWidth={2}
              strokeDasharray="4 3"
              pointerEvents="none"
              data-testid={ghost.testId}
            />
          );
        }
        return (
          <rect
            key={ghost.testId}
            x={ghost.x}
            y={rowY + BAR_OFFSET_Y}
            width={ghost.width}
            height={BAR_HEIGHT}
            rx={4}
            fill="none"
            stroke={stroke}
            strokeWidth={variant === 'preview' ? 2 : 1.5}
            strokeDasharray="4 3"
            pointerEvents="none"
            data-testid={ghost.testId}
          />
        );
      })}
    </g>
  );
});
