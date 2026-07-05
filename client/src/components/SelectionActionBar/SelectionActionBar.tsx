import type { ReactNode } from 'react';
import styles from './SelectionActionBar.module.css';

export interface SelectionActionBarProps {
  /** Pre-translated "N selected" text */
  countLabel: string;
  /** Invoked by the "Clear selection" button */
  onClear: () => void;
  /** Pre-translated "Clear selection" text */
  clearLabel: string;
  /** Primary action button(s), right-aligned */
  children: ReactNode;
  /** Optional positioning/width override */
  className?: string;
}

export function SelectionActionBar({
  countLabel,
  onClear,
  clearLabel,
  children,
  className,
}: SelectionActionBarProps) {
  return (
    <div className={`${styles.bar} ${className ?? ''}`}>
      <span className={styles.count}>{countLabel}</span>
      <div className={styles.actions}>
        <button type="button" className={styles.clearButton} onClick={onClear}>
          {clearLabel}
        </button>
        {children}
      </div>
    </div>
  );
}
