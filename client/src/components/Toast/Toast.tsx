import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useToast } from './ToastContext.js';
import type { Toast, ToastVariant } from './ToastContext.js';
import styles from './Toast.module.css';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function SuccessIcon() {
  return (
    <svg
      className={styles.icon}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      className={styles.icon}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      className={styles.icon}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function DismissIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const TOAST_ICONS: Record<ToastVariant, React.ComponentType> = {
  success: SuccessIcon,
  info: InfoIcon,
  error: ErrorIcon,
  undo: SuccessIcon,
};

const TOAST_VARIANT_CLASS: Record<ToastVariant, string> = {
  success: styles.toastSuccess!,
  info: styles.toastInfo!,
  error: styles.toastError!,
  undo: styles.toastSuccess!,
};

// ---------------------------------------------------------------------------
// ToastItem
// ---------------------------------------------------------------------------

interface ToastItemProps {
  readonly toast: Toast;
}

function ToastItem({ toast }: ToastItemProps) {
  const { t } = useTranslation('common');
  const { dismissToast, pauseToast, resumeToast, undoToast } = useToast();
  const Icon = TOAST_ICONS[toast.variant];
  const isUndo = toast.variant === 'undo';

  const pauseProps = isUndo
    ? {
        onMouseEnter: () => pauseToast(toast.id),
        onMouseLeave: () => resumeToast(toast.id),
        onFocus: (e: React.FocusEvent<HTMLDivElement>) => {
          // Only the first focus entering the toast pauses.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) pauseToast(toast.id);
        },
        onBlur: (e: React.FocusEvent<HTMLDivElement>) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) resumeToast(toast.id);
        },
      }
    : {};

  return (
    <div
      className={`${styles.toast} ${TOAST_VARIANT_CLASS[toast.variant]}`}
      data-testid={`toast-${toast.variant}`}
      data-toast-id={toast.id}
      {...pauseProps}
    >
      <Icon />
      <span className={styles.message}>{toast.message}</span>
      {isUndo && (
        <button
          type="button"
          className={styles.undoButton}
          aria-keyshortcuts="Control+Z Meta+Z"
          aria-disabled={toast.busy ? 'true' : undefined}
          data-testid="toast-undo-button"
          onClick={() => {
            if (!toast.busy) void undoToast(toast.id);
          }}
        >
          {toast.busy ? t('undoToast.undoing') : t('undoToast.undo')}
        </button>
      )}
      <button
        type="button"
        className={styles.dismiss}
        aria-label={t('toast.dismissAriaLabel')}
        onClick={() => dismissToast(toast.id)}
      >
        <DismissIcon />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToastList — rendered via portal to document.body
// ---------------------------------------------------------------------------

/**
 * Two persistent live regions (they must exist before a toast arrives to be announced):
 * polite status for success / info / undo, assertive for errors. Individual toasts carry no
 * role (D14).
 */
export function ToastList() {
  const { toasts } = useToast();

  return createPortal(
    <div className={styles.container}>
      <div role="status" className={styles.region}>
        {toasts
          .filter((toast) => toast.variant !== 'error')
          .map((toast) => (
            <ToastItem key={toast.id} toast={toast} />
          ))}
      </div>
      <div aria-live="assertive" className={styles.region}>
        {toasts
          .filter((toast) => toast.variant === 'error')
          .map((toast) => (
            <ToastItem key={toast.id} toast={toast} />
          ))}
      </div>
    </div>,
    document.body,
  );
}
