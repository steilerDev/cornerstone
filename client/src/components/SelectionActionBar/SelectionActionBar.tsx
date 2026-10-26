import { useEffect, useRef } from 'react';
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
  /**
   * `fixed` (default): pinned to the viewport above the shell bottom bar. `inline`: stays in the
   * flow where it is rendered, for a host with its own action row after the list (the report
   * wizard's Next row, Split with AI's totals and Save).
   */
  placement?: 'fixed' | 'inline';
}

const HEIGHT_VAR = '--sticky-action-bar-height';

/**
 * Bulk-action bar pinned to the viewport above the shell bottom bar. The shell's main column is
 * an overflow scroller that never scrolls on its own, so `position: sticky` cannot pin to the
 * viewport (same cause and fix as StickyActionBar): the bar is fixed, aligned to the column via
 * the in-flow spacer, which also reserves the bar's height. While mounted it publishes its height
 * as `--sticky-action-bar-height` so the Toast container stacks above it.
 */
export function SelectionActionBar({
  countLabel,
  onClear,
  clearLabel,
  children,
  className,
  announce = true,
  testId,
  placement = 'fixed',
}: SelectionActionBarProps) {
  const spacerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const fixed = placement === 'fixed';

  useEffect(() => {
    if (!fixed) return undefined;
    const spacer = spacerRef.current!;
    const bar = barRef.current!;
    const root = document.documentElement;
    const sync = () => {
      const height = bar.offsetHeight;
      const rect = spacer.getBoundingClientRect();
      spacer.style.height = `${height}px`;
      bar.style.left = `${rect.left}px`;
      bar.style.width = `${rect.width}px`;
      root.style.setProperty(HEIGHT_VAR, `${height}px`);
    };
    sync();
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(sync);
      observer.observe(bar);
      observer.observe(spacer);
    }
    window.addEventListener('resize', sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', sync);
      root.style.removeProperty(HEIGHT_VAR);
    };
  }, [fixed]);

  return (
    <div ref={spacerRef} className={fixed ? styles.spacer : styles.spacerInline}>
      <div
        ref={barRef}
        className={`${fixed ? styles.bar : styles.barInline} ${className ?? ''}`}
        data-testid={testId}
      >
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
    </div>
  );
}
