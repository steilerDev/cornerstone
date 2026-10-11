import { useEffect, useId, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { getFocusableElements, useFocusTrap } from './useFocusTrap.js';
import { lockScroll } from './scrollLock.js';
import { useFocusRestore } from './useFocusRestore.js';
import styles from './Sheet.module.css';

export interface SheetProps {
  readonly id: string;
  readonly open: boolean;
  /** Called for Close, backdrop and Escape (focus then returns to returnFocusRef). */
  readonly onClose: () => void;
  readonly title: string;
  /** Focus target after an explicit dismissal (and the restore chain fallback). */
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly testId?: string;
  readonly children: ReactNode;
  /** `fullScreen` covers the viewport (phone object forms). Default `bottom`. */
  readonly variant?: 'bottom' | 'fullScreen';
  /** Pinned below the scrolling body (e.g. Cancel and Save). */
  readonly footer?: ReactNode;
  /** Element to focus on open instead of the first focusable element in the body. */
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  /** false: Escape, the backdrop and Close do nothing (e.g. while busy). Default true. */
  readonly dismissible?: boolean;
  /** Rendered before the title inside the header (e.g. a back link). */
  readonly headerStart?: ReactNode;
  /**
   * For conditionally mounted sheets: restore focus through the shared chain (opener,
   * returnFocusRef, page heading) when the sheet closes or unmounts.
   */
  readonly restoreFocusOnUnmount?: boolean;
  /** With restoreFocusOnUnmount: when `.current` is true the opener is not refocused. */
  readonly skipOpenerRef?: RefObject<boolean>;
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
  variant = 'bottom',
  footer,
  initialFocusRef,
  dismissible = true,
  headerStart,
  restoreFocusOnUnmount = false,
  skipOpenerRef,
}: SheetProps) {
  const { t } = useTranslation('common');
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef(false);
  const wasOpenRef = useRef(false);

  const dismiss = () => {
    if (!dismissible) return;
    restoreRef.current = true;
    onClose();
  };

  useFocusTrap(panelRef, { active: open, onEscape: dismiss });
  useFocusRestore(panelRef, {
    active: restoreFocusOnUnmount && open,
    returnFocusRef,
    skipOpenerRef,
  });

  // Focus: first control on open; back to the opener after an explicit dismissal.
  useEffect(() => {
    if (open) {
      const [first] = bodyRef.current ? getFocusableElements(bodyRef.current) : [];
      (initialFocusRef?.current ?? first ?? closeRef.current)?.focus();
    } else if (wasOpenRef.current && restoreRef.current && !restoreFocusOnUnmount) {
      returnFocusRef?.current?.focus();
    }
    if (!open) restoreRef.current = false;
    wasOpenRef.current = open;
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- focus runs on open/close only; ref props are read at that moment
  }, [open]);

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
        className={cx(
          styles.panel,
          open && styles.panelOpen,
          variant === 'fullScreen' && styles.panelFullScreen,
        )}
        data-open={open ? 'true' : 'false'}
        data-testid={testId}
      >
        <div className={styles.header}>
          {headerStart ? (
            <div className={styles.headerStart}>
              {headerStart}
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
            </div>
          ) : (
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
          )}
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            aria-label={t('aria.closeDialog')}
            aria-disabled={dismissible ? undefined : true}
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
        <div
          ref={bodyRef}
          className={cx(styles.body, variant === 'fullScreen' && styles.bodyFullScreen)}
        >
          {children}
        </div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </>
  );
}
