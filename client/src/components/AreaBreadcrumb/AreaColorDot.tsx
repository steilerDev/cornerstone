import type { CSSProperties } from 'react';
import styles from './AreaColorDot.module.css';

export interface AreaColorDotProps {
  /** The area's colour; null renders the empty outline. */
  readonly color: string | null;
}

/** The area colour dot (as in the Areas tree): decorative, so it is always aria-hidden. */
export function AreaColorDot({ color }: AreaColorDotProps) {
  return (
    <span
      aria-hidden="true"
      className={styles.dot}
      data-color={color ? 'set' : undefined}
      style={color ? ({ '--tree-color': color } as CSSProperties) : undefined}
    />
  );
}
