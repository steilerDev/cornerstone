import {
  createContext,
  use,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { focusPageHeading } from '../../lib/focusPageHeading.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastVariant = 'success' | 'info' | 'error' | 'undo';

export interface Toast {
  id: number;
  variant: ToastVariant;
  message: string;
  /** undo variant: restores the change; rejects with an ApiClientError on 404/409. */
  onUndo?: () => Promise<void>;
  /** undo variant: a newer toast with the same key replaces this one. */
  dedupeKey?: string;
  /** undo variant: Undo is running. */
  busy?: boolean;
  /** undo variant: where focus goes when the toast disappears with focus inside it. */
  focusFallback?: () => HTMLElement | null;
}

export interface ShowUndoToastOptions {
  message: string;
  dedupeKey: string;
  onUndo: () => Promise<void>;
  focusFallback?: () => HTMLElement | null;
}

export interface ToastContextValue {
  toasts: Toast[];
  showToast: (variant: Exclude<ToastVariant, 'undo'>, message: string) => void;
  showUndoToast: (options: ShowUndoToastOptions) => void;
  dismissToast: (id: number) => void;
  /** Stops the auto-dismiss clock of an undo toast (hover, focus). Calls must be balanced. */
  pauseToast: (id: number) => void;
  resumeToast: (id: number) => void;
  /** Runs Undo of an undo toast (the Undo button and Ctrl/⌘ Z). */
  undoToast: (id: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const MAX_TOASTS = 3;

/** Visible time of an undo toast; always shorter than the server's UNDO_WINDOW_MS (30 s). */
export const UNDO_TOAST_MS = 6000;

/** Auto-dismiss duration in milliseconds per variant. */
const DISMISS_DURATION: Record<ToastVariant, number> = {
  success: 4000,
  info: 6000,
  error: 6000,
  undo: UNDO_TOAST_MS,
};

interface Clock {
  remaining: number;
  startedAt: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  holds: number;
  pausable: boolean;
}

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable]';

function isEditable(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE_SELECTOR) !== null;
}

function toastElement(id: number): Element | null {
  return document.querySelector(`[data-toast-id="${id}"]`);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const { t } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastsRef = useRef<Toast[]>([]);
  const nextIdRef = useRef(0);
  const clocksRef = useRef<Map<number, Clock>>(new Map());
  const hiddenRef = useRef(false);
  const runningUndoRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const clock = clocksRef.current.get(id);
    if (clock?.timer) clearTimeout(clock.timer);
    clocksRef.current.delete(id);
  }, []);

  // Focus inside a toast that goes away must not fall to <body>.
  const handOffFocus = useCallback((id: number, fallbackOwner?: Toast) => {
    const el = toastElement(id);
    if (!el?.contains(document.activeElement)) return;
    const owner = fallbackOwner ?? toastsRef.current.find((toast) => toast.id === id);
    const fallback = owner?.focusFallback?.();
    if (fallback?.isConnected) fallback.focus();
    else focusPageHeading();
  }, []);

  const dismissToast = useCallback(
    (id: number) => {
      handOffFocus(id);
      removeToast(id);
    },
    [handOffFocus, removeToast],
  );

  const runClock = useCallback(
    (id: number) => {
      const clock = clocksRef.current.get(id);
      if (!clock || clock.timer) return;
      clock.startedAt = Date.now();
      clock.timer = setTimeout(() => dismissToast(id), clock.remaining);
    },
    [dismissToast],
  );

  const haltClock = useCallback((clock: Clock) => {
    if (!clock.timer) return;
    clearTimeout(clock.timer);
    clock.timer = null;
    if (clock.startedAt !== null) {
      clock.remaining = Math.max(0, clock.remaining - (Date.now() - clock.startedAt));
    }
    clock.startedAt = null;
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextIdRef.current++;
      const dedupeKey = toast.dedupeKey;
      const stale = dedupeKey
        ? toastsRef.current.filter((e) => e.dedupeKey === dedupeKey).map((e) => e.id)
        : [];
      setToasts((prev) => {
        const kept = dedupeKey ? prev.filter((existing) => existing.dedupeKey !== dedupeKey) : prev;
        const updated = [...kept, { ...toast, id }];
        // Keep only the last MAX_TOASTS visible
        return updated.length > MAX_TOASTS ? updated.slice(updated.length - MAX_TOASTS) : updated;
      });
      for (const staleId of stale) {
        handOffFocus(staleId, { ...toast, id });
        const clock = clocksRef.current.get(staleId);
        if (clock?.timer) clearTimeout(clock.timer);
        clocksRef.current.delete(staleId);
      }
      clocksRef.current.set(id, {
        remaining: DISMISS_DURATION[toast.variant],
        startedAt: null,
        timer: null,
        holds: 0,
        pausable: toast.variant === 'undo',
      });
      if (!(toast.variant === 'undo' && hiddenRef.current)) runClock(id);
    },
    [handOffFocus, runClock],
  );

  const showToast = useCallback(
    (variant: Exclude<ToastVariant, 'undo'>, message: string) => addToast({ variant, message }),
    [addToast],
  );

  const showUndoToast = useCallback(
    (options: ShowUndoToastOptions) =>
      addToast({
        variant: 'undo',
        message: options.message,
        dedupeKey: options.dedupeKey,
        onUndo: options.onUndo,
        focusFallback: options.focusFallback,
      }),
    [addToast],
  );

  const pauseToast = useCallback(
    (id: number) => {
      const clock = clocksRef.current.get(id);
      if (!clock?.pausable) return;
      clock.holds += 1;
      haltClock(clock);
    },
    [haltClock],
  );

  const resumeToast = useCallback(
    (id: number) => {
      const clock = clocksRef.current.get(id);
      if (!clock?.pausable) return;
      clock.holds = Math.max(0, clock.holds - 1);
      if (clock.holds === 0 && !hiddenRef.current) runClock(id);
    },
    [runClock],
  );

  // Undo toasts pause while the tab is hidden.
  useEffect(() => {
    const onVisibility = () => {
      hiddenRef.current = document.visibilityState === 'hidden';
      for (const [id, clock] of clocksRef.current) {
        if (!clock.pausable) continue;
        if (hiddenRef.current) haltClock(clock);
        else if (clock.holds === 0) runClock(id);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [haltClock, runClock]);

  const undoToast = useCallback(
    async (id: number) => {
      const toast = toastsRef.current.find((candidate) => candidate.id === id);
      if (!toast?.onUndo || runningUndoRef.current.has(id)) return;
      runningUndoRef.current.add(id);
      const clock = clocksRef.current.get(id);
      if (clock) {
        clock.holds += 1;
        haltClock(clock);
      }
      setToasts((prev) => prev.map((item) => (item.id === id ? { ...item, busy: true } : item)));
      try {
        await toast.onUndo();
        dismissToast(id);
        showToast('info', t('undoToast.undone'));
      } catch (err) {
        if (err instanceof ApiClientError && err.statusCode === 404) {
          // The token can never work again: the toast goes away.
          dismissToast(id);
          showToast('error', t('undoToast.tooLate'));
        } else if (err instanceof ApiClientError && err.statusCode === 409) {
          dismissToast(id);
          showToast('error', t('undoToast.changedSince'));
        } else {
          // Network / server error: keep the toast so the user can retry within the window.
          setToasts((prev) =>
            prev.map((item) => (item.id === id ? { ...item, busy: false } : item)),
          );
          const held = clocksRef.current.get(id);
          if (held) {
            held.holds = Math.max(0, held.holds - 1);
            if (held.holds === 0 && !hiddenRef.current) runClock(id);
          }
          showToast(
            'error',
            err instanceof ApiClientError
              ? translateApiError(err.error.code, tErrors)
              : t('undoToast.failed'),
          );
        }
      } finally {
        runningUndoRef.current.delete(id);
      }
    },
    [dismissToast, haltClock, runClock, showToast, t, tErrors],
  );

  // Ctrl/⌘ Z undoes the newest undo toast (outside editable fields).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') {
        return;
      }
      if (isEditable(e.target)) return;
      const newest = [...toastsRef.current].reverse().find((toast) => toast.variant === 'undo');
      if (!newest) return;
      e.preventDefault();
      void undoToast(newest.id);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [undoToast]);

  // Clear pending timers on unmount.
  useEffect(() => {
    const clocks = clocksRef.current;
    return () => {
      for (const clock of clocks.values()) if (clock.timer) clearTimeout(clock.timer);
      clocks.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      showToast,
      showUndoToast,
      dismissToast,
      pauseToast,
      resumeToast,
      undoToast,
    }),
    [toasts, showToast, showUndoToast, dismissToast, pauseToast, resumeToast, undoToast],
  );

  return <ToastContext value={value}>{children}</ToastContext>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useToast(): ToastContextValue {
  const context = use(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
