import { createPortal } from 'react-dom';
import { useEffect, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import sharedStyles from '../../styles/shared.module.css';
import { getFocusableElements, useFocusTrap } from './useFocusTrap.js';
import { lockScroll } from './scrollLock.js';
import { useFocusRestore } from './useFocusRestore.js';
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
  /**
   * When `.current` is true at unmount, the opener is not refocused (it is the thing the dialog
   * just acted on and may be removed later): focus goes to `returnFocusRef`, else the heading.
   */
  skipOpenerRef?: React.RefObject<boolean>;
  /** Rendered before the title inside the header (e.g. a back link). */
  headerStart?: React.ReactNode;
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
  skipOpenerRef,
  headerStart,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { t } = useTranslation('common');

  const handleClose = () => {
    if (dismissible) onClose();
  };

  // Escape closes; Tab cycles within the modal content
  useFocusTrap(contentRef, { active: true, onEscape: handleClose });

  // Page scroll is locked for the lifetime of the modal.
  useEffect(() => lockScroll(), []);

  // Focus restore (D20): opener, returnFocusRef, then the page heading; never <body>.
  useFocusRestore(contentRef, { active: true, returnFocusRef, skipOpenerRef });

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
