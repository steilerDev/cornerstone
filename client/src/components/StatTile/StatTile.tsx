import type { ReactNode } from 'react';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import styles from './StatTile.module.css';

export interface StatTileProps {
  label: string;
  figure: ReactNode;
  /** Accessible text for a figure that is not text (an en dash): `role="img"` plus this label. */
  figureLabel?: string;
  /** `large` = the 3xl figure (2xl below 480 px); `medium` = xl. */
  figureSize?: 'large' | 'medium';
  detail?: ReactNode;
  /** Where the tile goes; the whole tile is one link. */
  to: string;
  state?: unknown;
  /** Level of the label heading. Default 3. */
  headingLevel?: 2 | 3 | 4;
  /** `li` inside a list, `div` elsewhere. Default `div`. */
  as?: 'li' | 'div';
  testId: string;
}

/**
 * A headline figure with a label and a detail line; the whole tile is one link. Its accessible
 * name is its text (no `aria-label`); nothing interactive sits inside it.
 */
export function StatTile({
  label,
  figure,
  figureLabel,
  figureSize = 'large',
  detail,
  to,
  state,
  headingLevel = 3,
  as: Root = 'div',
  testId,
}: StatTileProps) {
  const Heading = headingLevel === 2 ? 'h2' : headingLevel === 4 ? 'h4' : 'h3';
  return (
    <Root className={styles.root}>
      <NavAnchor to={to} state={state} className={styles.tile} data-testid={testId}>
        <Heading className={styles.label}>
          {label}
          <span aria-hidden="true"> ›</span>
        </Heading>
        <span
          className={
            figureSize === 'medium' ? `${styles.figure} ${styles.figureMedium}` : styles.figure
          }
          {...(figureLabel ? { role: 'img', 'aria-label': figureLabel } : {})}
          data-testid={`${testId}-figure`}
        >
          {figure}
        </span>
        {detail ? (
          <span className={styles.detail} data-testid={`${testId}-detail`}>
            {detail}
          </span>
        ) : null}
      </NavAnchor>
    </Root>
  );
}
