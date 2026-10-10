import { createPortal } from 'react-dom';
import { useEffect, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import sharedStyles from '../../styles/shared.module.css';
import { getFocusableElements, useFocusTrap } from './useFocusTrap.js';
import styles from './Modal.module.css';

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Element to focus on mount instead of the first focusable element. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  className,
  initialFocusRef,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { t } = useTranslation('common');

  // Escape closes; Tab cycles within the modal content
  useFocusTrap(contentRef, { active: true, onEscape: onClose });

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
    <div className={sharedStyles.modal} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className={sharedStyles.modalBackdrop} onClick={onClose} />
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
            onClick={onClose}
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
