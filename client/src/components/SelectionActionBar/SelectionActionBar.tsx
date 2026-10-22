import type { ReactNode } from 'react';
import sharedStyles from '../../styles/shared.module.css';
import styles from './SelectionActionBar.module.css';

export interface SelectionActionBarProps {
  /** Pre-translated "N selected" text */
  countLabel: string;
  /** Invoked by the "Clear selection" button */
  onClear: () => void;
  /** Pre-translated "Clear selection" text */
  clearLabel: string;
  /** Action buttons (never a primary), right-aligned */
  children: ReactNode;
  /** Optional positioning/width override */
  className?: string;
  /** Announce the count through this bar's own live region (default true); false when the host announces. */
  announce?: boolean;
  testId?: string;
}

export function SelectionActionBar({
  countLabel,
  onClear,
  clearLabel,
  children,
  className,
  announce = true,
  testId,
}: SelectionActionBarProps) {
  return (
    <div className={`${styles.bar} ${className ?? ''}`} data-testid={testId}>
      <span
        className={styles.count}
        aria-live={announce ? 'polite' : undefined}
        aria-atomic={announce ? 'true' : undefined}
      >
        {countLabel}
      </span>
      <div className={styles.actions}>
        <button type="button" className={sharedStyles.btnSecondaryCompact} onClick={onClear}>
          {clearLabel}
        </button>
        {children}
      </div>
    </div>
  );
}
