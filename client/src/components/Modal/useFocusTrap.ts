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
        onEscapeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !containerRef.current) return;

      const focusable = getFocusableElements(containerRef.current);
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

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      activeTraps.splice(activeTraps.indexOf(token), 1);
    };
  }, [active, containerRef]);
}
