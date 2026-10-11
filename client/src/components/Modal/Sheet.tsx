import { useEffect, useId, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { getFocusableElements, useFocusTrap } from './useFocusTrap.js';
import { lockScroll } from './scrollLock.js';
import styles from './Sheet.module.css';

export interface SheetProps {
  readonly id: string;
  readonly open: boolean;
  /** Called for Close, backdrop and Escape (focus then returns to returnFocusRef). */
  readonly onClose: () => void;
  readonly title: string;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly testId?: string;
  readonly children: ReactNode;
}

function cx(...parts: readonly (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * Bottom sheet dialog. The panel stays mounted and inert while closed; it only carries the
 * dialog role (and traps focus) while open, so a closed sheet is invisible to assistive tech.
 */
export function Sheet({
  id,
  open,
  onClose,
  title,
  returnFocusRef,
  testId = 'sheet',
  children,
}: SheetProps) {
  const { t } = useTranslation('common');
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef(false);
  const wasOpenRef = useRef(false);

  const dismiss = () => {
    restoreRef.current = true;
    onClose();
  };

  useFocusTrap(panelRef, { active: open, onEscape: dismiss });

  // Focus: first control on open; back to the opener after an explicit dismissal.
  useEffect(() => {
    if (open) {
      const [first] = bodyRef.current ? getFocusableElements(bodyRef.current) : [];
      (first ?? closeRef.current)?.focus();
    } else if (wasOpenRef.current && restoreRef.current) {
      returnFocusRef.current?.focus();
    }
    if (!open) restoreRef.current = false;
    wasOpenRef.current = open;
  }, [open, returnFocusRef]);

  // Page scroll is locked while the sheet is open.
  useEffect(() => {
    if (!open) return;
    return lockScroll();
  }, [open]);

  return (
    <>
      <div
        className={cx(styles.backdrop, open && styles.backdropOpen)}
        aria-hidden="true"
        onClick={dismiss}
        data-testid={`${testId}-backdrop`}
      />
      <div
        id={id}
        ref={panelRef}
        inert={!open}
        {...(open ? { role: 'dialog', 'aria-modal': true, 'aria-labelledby': titleId } : {})}
        className={cx(styles.panel, open && styles.panelOpen)}
        data-open={open ? 'true' : 'false'}
        data-testid={testId}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            aria-label={t('aria.closeDialog')}
            onClick={dismiss}
            data-testid={`${testId}-close`}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        <div ref={bodyRef} className={styles.body}>
          {children}
        </div>
      </div>
    </>
  );
}
