import { focusPageHeading } from '../../lib/focusPageHeading.js';
import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import sharedStyles from '../../styles/shared.module.css';
import { getFocusableElements, useFocusTrap } from './useFocusTrap.js';
import { lockScroll } from './scrollLock.js';
import styles from './Modal.module.css';

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Element to focus on mount instead of the first focusable element. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** `alertdialog` for confirmations that interrupt the user. Default `dialog`. */
  role?: 'dialog' | 'alertdialog';
  /** Id of the element that describes the dialog (aria-describedby). */
  describedById?: string;
  /** false: Escape, the backdrop and the close button do nothing (e.g. while busy). */
  dismissible?: boolean;
  /** Focus target on close when the opener is gone and focus is inside the modal or on body. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  className,
  initialFocusRef,
  role = 'dialog',
  describedById,
  dismissible = true,
  returnFocusRef,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { t } = useTranslation('common');

  const openerRef = useRef<HTMLElement | null>(null);
  const latestReturnFocusRef = useRef(returnFocusRef);
  latestReturnFocusRef.current = returnFocusRef;

  const handleClose = () => {
    if (dismissible) onClose();
  };

  // Escape closes; Tab cycles within the modal content
  useFocusTrap(contentRef, { active: true, onEscape: handleClose });

  // Page scroll is locked for the lifetime of the modal.
  useEffect(() => lockScroll(), []);

  // Focus restore (D20): only when focus is still inside the modal or has fallen to the body,
  // so hosts that move focus themselves keep working. The chain (opener, returnFocusRef, page
  // heading) runs once at unmount and again after the commit has settled: a host may remove the
  // opener in the same commit that closes the dialog, which drops focus to the body afterwards.
  useLayoutEffect(() => {
    const content = contentRef.current;
    // Captured before the initial-focus effect (passive) moves focus into the modal.
    openerRef.current = document.activeElement as HTMLElement | null;

    // Each candidate is tried in turn; focus() is a no-op on a disabled or hidden element, so
    // success is checked by reading activeElement. Last resort: the page heading, never body.
    const restore = () => {
      const opener = openerRef.current;
      if (opener && opener !== document.body && opener.isConnected) {
        opener.focus();
        if (document.activeElement === opener) return;
      }
      const fallback = latestReturnFocusRef.current?.current;
      if (fallback?.isConnected) {
        fallback.focus();
        if (document.activeElement === fallback) return;
      }
      focusPageHeading();
    };

    return () => {
      const active = document.activeElement;
      const lost = !active || active === document.body || (content?.contains(active) ?? false);
      if (!lost) return;
      restore();
      // After the commit: if the element just focused was removed, focus is on the body again.
      queueMicrotask(() => {
        const now = document.activeElement;
        if (!now || now === document.body) restore();
      });
    };
  }, []);

  // Focus management: focus first focusable element on mount
  useEffect(() => {
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
      return;
    }
    if (contentRef.current) {
      const [firstFocusable] = getFocusableElements(contentRef.current);
      firstFocusable?.focus();
    }
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- mount-only: initial focus must not re-run when the ref prop identity changes
  }, []);

  return createPortal(
    <div
      className={sharedStyles.modal}
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={describedById}
    >
      <div className={sharedStyles.modalBackdrop} onClick={handleClose} />
      <div
        className={[sharedStyles.modalContent, styles.content, className].filter(Boolean).join(' ')}
        ref={contentRef}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleClose}
            aria-disabled={dismissible ? undefined : true}
            aria-label={t('aria.closeDialog')}
          >
            ×
          </button>
        </div>

        <div className={styles.body}>{children}</div>

        {footer && (
          <div className={[sharedStyles.modalActions, styles.footer].filter(Boolean).join(' ')}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
