import { useToast } from '../components/Toast/ToastContext.js';

/** Renders the toasts (ToastProvider alone shows nothing); the Undo button has `toast-undo`. */
export function ToastView() {
  const { toasts, undoToast } = useToast();
  return (
    <ul data-testid="toasts">
      {toasts.map((toast) => (
        <li key={toast.id}>
          <span>{toast.message}</span>
          {toast.variant === 'undo' && (
            <button type="button" data-testid="toast-undo" onClick={() => void undoToast(toast.id)}>
              Undo
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
