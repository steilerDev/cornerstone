import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export interface QueryTargetOptions {
  /** Query parameter that names the target, e.g. 'payment'. */
  param: string;
  /** True once the list holding the target is rendered. */
  ready: boolean;
  /** CSS selector for the candidates of an id, e.g. `id => `[data-payment-id="${CSS.escape(id)}"]``. */
  selector: (id: string) => string;
  highlightClassName: string;
  /** Called when the param is present but no element matches. */
  onMissing?: () => void;
  /** How long the highlight stays; default 3000. */
  durationMs?: number;
}

/**
 * Scrolls to, focuses and highlights the element named by a query parameter, then drops the
 * parameter with a `replace` navigation (the origin state is kept). Runs once per location key.
 */
export function useQueryTargetHighlight({
  param,
  ready,
  selector,
  highlightClassName,
  onMissing,
  durationMs = 3000,
}: QueryTargetOptions): void {
  const location = useLocation();
  const navigate = useNavigate();
  const handledKeyRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightedRef = useRef<Element | null>(null);

  // Latest callbacks without re-triggering the effect.
  const selectorRef = useRef(selector);
  const onMissingRef = useRef(onMissing);
  selectorRef.current = selector;
  onMissingRef.current = onMissing;

  useEffect(() => {
    if (!ready || handledKeyRef.current === location.key) return;
    const params = new URLSearchParams(location.search);
    const id = params.get(param);
    if (!id) return;
    handledKeyRef.current = location.key;

    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selectorRef.current(id)));
    // Both the table row and the mobile card are mounted: take the visible one.
    const target = candidates.find((el) => el.getClientRects().length > 0) ?? candidates[0] ?? null;

    if (target) {
      const reduceMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      }
      target.focus({ preventScroll: true });
      target.classList.add(highlightClassName);
      highlightedRef.current = target;
      timeoutRef.current = setTimeout(() => {
        target.classList.remove(highlightClassName);
        highlightedRef.current = null;
        timeoutRef.current = null;
      }, durationMs);
    } else {
      onMissingRef.current?.();
    }

    params.delete(param);
    const search = params.toString();
    navigate(
      { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash },
      { replace: true, state: location.state },
    );
  }, [ready, location, param, highlightClassName, durationMs, navigate]);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      highlightedRef.current?.classList.remove(highlightClassName);
    },
    [highlightClassName],
  );
}
