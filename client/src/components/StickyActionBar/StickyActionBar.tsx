import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import shared from '../../styles/shared.module.css';
import styles from './StickyActionBar.module.css';

export interface StickyActionBarProps {
  /** Visible status text (left slot). Rendered aria-hidden: the announcement carries it. */
  status?: ReactNode;
  /** Always-mounted visually hidden role="status" text (no aria-live, no aria-atomic). */
  announcement: string;
  /** One-line note above the bar content. */
  note?: ReactNode;
  /** Right slot: the host's own action buttons. */
  children: ReactNode;
  /** Status region testid is `${testId}-status`. */
  testId?: string;
}

const HEIGHT_VAR = '--sticky-action-bar-height';

/**
 * Bottom action bar pinned to the viewport above the bottom bar. While mounted it publishes its height as
 * `--sticky-action-bar-height` on the document root so floating UI (the Toast container)
 * can stack above it.
 */
export function StickyActionBar({
  status,
  announcement,
  note,
  children,
  testId = 'sticky-action-bar',
}: StickyActionBarProps) {
  const spacerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const spacer = spacerRef.current;
    const bar = barRef.current;
    if (!spacer || !bar) return undefined;
    const root = document.documentElement;
    // The shell's main column is itself an overflow scroller that never scrolls on its own,
    // so `position: sticky` cannot pin to the viewport. The bar is fixed instead, aligned to
    // the column via the in-flow spacer, which also reserves the bar's height at the end of
    // the content.
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
  }, []);

  return (
    <div ref={spacerRef} className={styles.spacer}>
      <div ref={barRef} className={styles.bar} data-testid={testId}>
        {note ? <p className={styles.note}>{note}</p> : null}
        <div className={styles.content}>
          <div className={styles.status} aria-hidden="true">
            {status}
          </div>
          <div className={styles.actions}>{children}</div>
        </div>
        <div role="status" className={shared.srOnly} data-testid={`${testId}-status`}>
          {announcement}
        </div>
      </div>
    </div>
  );
}
