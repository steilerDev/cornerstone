import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * Focusable descendants of a container. Disabled controls and `tabindex="-1"` elements are
 * excluded (an anchor with `[href]` and `tabindex="-1"` is reachable by pointer only).
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1');
}

export interface UseFocusTrapOptions {
  readonly active: boolean;
  readonly onEscape: () => void;
}

/** Active traps in open order: only the last (topmost dialog) handles Escape and Tab. */
const activeTraps: symbol[] = [];

/** While active: Escape calls onEscape; Tab and Shift+Tab wrap inside the container. */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  { active, onEscape }: UseFocusTrapOptions,
): void {
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return;
    const token = Symbol('focus-trap');
    activeTraps.push(token);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTraps[activeTraps.length - 1] !== token) return;
      if (e.key === 'Escape') {
        // Handled by the topmost dialog: keyboard handlers further out (a viewer) must skip it
        e.preventDefault();
        onEscapeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !containerRef.current) return;

      // The toast region sits above the dialog: its buttons (Undo, dismiss) join the cycle.
      const focusable = [
        ...getFocusableElements(containerRef.current),
        ...Array.from(document.querySelectorAll<HTMLElement>('[data-toast-container]')).flatMap(
          getFocusableElements,
        ),
      ];
      if (focusable.length === 0) return;

      // Step through the list ourselves: the toast portal can sit before or after the dialog in
      // the DOM, so native Tab order cannot be trusted at the dialog's edges.
      const active = document.activeElement as HTMLElement | null;
      const index = active ? focusable.indexOf(active) : -1;
      // Focus on something we do not list (a popover, a tabindex="-1" element): the browser steps.
      if (index === -1 && active && active !== document.body) return;
      const step = e.shiftKey ? -1 : 1;
      const start = index === -1 ? (e.shiftKey ? 0 : -1) : index;
      // A listed element can refuse focus (hidden at this width): try the next one, never stall.
      for (let tries = 1; tries <= focusable.length; tries++) {
        const candidate =
          focusable[(start + step * tries + focusable.length * tries) % focusable.length]!;
        candidate.focus();
        if (document.activeElement === candidate) {
          e.preventDefault();
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      activeTraps.splice(activeTraps.indexOf(token), 1);
    };
  }, [active, containerRef]);
}
