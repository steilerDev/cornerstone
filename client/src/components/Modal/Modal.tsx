import { createPortal } from 'react-dom';
import { useEffect, useRef, useId } from 'react';
import sharedStyles from '../../styles/shared.module.css';
import styles from './Modal.module.css';

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Modal({ title, onClose, children, footer, className }: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Focus management: focus first focusable element on mount
  useEffect(() => {
    if (contentRef.current) {
      const focusableElements = contentRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const firstFocusable = focusableElements[0] as HTMLElement;
      firstFocusable?.focus();
    }
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
            aria-label="Close dialog"
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
