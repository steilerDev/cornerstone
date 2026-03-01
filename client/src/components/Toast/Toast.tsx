import { createPortal } from 'react-dom';
import { useToast } from './ToastContext.js';
import type { ToastVariant } from './ToastContext.js';
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
};

const TOAST_VARIANT_CLASS: Record<ToastVariant, string> = {
  success: styles.toastSuccess,
  info: styles.toastInfo,
  error: styles.toastError,
};

// ---------------------------------------------------------------------------
// ToastList — rendered via portal to document.body
// ---------------------------------------------------------------------------

export function ToastList() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return createPortal(
    <div className={styles.container} role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const Icon = TOAST_ICONS[toast.variant];
        return (
          <div
            key={toast.id}
            className={`${styles.toast} ${TOAST_VARIANT_CLASS[toast.variant]}`}
            role="alert"
            data-testid={`toast-${toast.variant}`}
          >
            <Icon />
            <span className={styles.message}>{toast.message}</span>
            <button
              type="button"
              className={styles.dismiss}
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
            >
              <DismissIcon />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
