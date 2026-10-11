import { createPortal } from 'react-dom';
import { useEffect, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import sharedStyles from '../../styles/shared.module.css';
import { getFocusableElements, useFocusTrap } from './useFocusTrap.js';
import { lockScroll } from './scrollLock.js';
import { useFocusRestore } from './useFocusRestore.js';
import { dialogLayerStyle, useDialogLevel } from './dialogLayer.js';
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
  /**
   * `palette`: the command-search surface. No header row and no close button, no padding, a
   * wide panel in the upper third of the viewport; the title stays as the accessible name.
   */
  variant?: 'default' | 'palette';
  /** Keeps the title as the accessible name but hides it visually. */
  hideTitle?: boolean;
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
  variant = 'default',
  hideTitle = false,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const level = useDialogLevel(true);
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

  const palette = variant === 'palette';
  const titleClass = hideTitle || palette ? sharedStyles.srOnly : styles.title;
  const heading = (
    <h2 id={titleId} className={titleClass}>
      {title}
    </h2>
  );

  return createPortal(
    <div
      className={[sharedStyles.modal, palette && styles.paletteRoot].filter(Boolean).join(' ')}
      role={role}
      style={dialogLayerStyle(level)}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={describedById}
    >
      <div className={sharedStyles.modalBackdrop} onClick={handleClose} />
      <div
        className={(palette
          ? [styles.palette, className]
          : [sharedStyles.modalContent, styles.content, className]
        )
          .filter(Boolean)
          .join(' ')}
        ref={contentRef}
      >
        {palette ? (
          <>
            {heading}
            <div className={styles.paletteBody}>{children}</div>
          </>
        ) : (
          <>
            <div className={styles.header}>
              {headerStart ? (
                <div className={styles.headerStart}>
                  {headerStart}
                  {heading}
                </div>
              ) : (
                heading
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
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
