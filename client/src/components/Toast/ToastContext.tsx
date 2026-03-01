import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastVariant = 'success' | 'info' | 'error';

export interface Toast {
  id: number;
  variant: ToastVariant;
  message: string;
}

export interface ToastContextValue {
  toasts: Toast[];
  showToast: (variant: ToastVariant, message: string) => void;
  dismissToast: (id: number) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const MAX_TOASTS = 3;

/** Auto-dismiss duration in milliseconds per variant. */
const DISMISS_DURATION: Record<ToastVariant, number> = {
  success: 4000,
  info: 6000,
  error: 6000,
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = nextId.current++;
      const toast: Toast = { id, variant, message };

      setToasts((prev) => {
        const updated = [...prev, toast];
        // Keep only the last MAX_TOASTS visible
        return updated.length > MAX_TOASTS ? updated.slice(updated.length - MAX_TOASTS) : updated;
      });

      const timer = setTimeout(() => {
        dismissToast(id);
      }, DISMISS_DURATION[variant]);

      timers.current.set(id, timer);
    },
    [dismissToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
