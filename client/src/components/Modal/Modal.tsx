import { createPortal } from 'react-dom';
import { useEffect, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import sharedStyles from '../../styles/shared.module.css';
import styles from './Modal.module.css';

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('disabled'));
}

export function Modal({ title, onClose, children, footer, className }: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { t } = useTranslation('common');

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
      const [firstFocusable] = getFocusableElements(contentRef.current);
      firstFocusable?.focus();
    }
  }, []);

  // Focus trap: cycle Tab/Shift+Tab within the modal content
  useEffect(() => {
    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !contentRef.current) return;

      const focusable = getFocusableElements(contentRef.current);
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
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
