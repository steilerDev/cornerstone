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

function sameGroup(a: HTMLElement, b: HTMLElement): boolean {
  return (
    a instanceof HTMLInputElement &&
    b instanceof HTMLInputElement &&
    a.type === 'radio' &&
    b.type === 'radio' &&
    a.name !== '' &&
    a.name === b.name &&
    a.form === b.form
  );
}

/** Tab stops in DOM order: a radio group counts once (its checked radio, else its first). */
function tabStops(items: HTMLElement[]): HTMLElement[] {
  return items.filter((item) => {
    if (!(item instanceof HTMLInputElement) || item.type !== 'radio' || item.name === '') {
      return true;
    }
    const group = items.filter((other) => sameGroup(item, other)) as HTMLInputElement[];
    const stop = group.find((radio) => radio.checked) ?? group[0];
    return stop === item;
  });
}

/** The focused element is the stop itself or, for a radio, any radio of the stop's group. */
function sameStop(active: HTMLElement, stop: HTMLElement): boolean {
  return active === stop || sameGroup(active, stop);
}

/** Where Tab lands when it wraps: the first item (forward) or the last (backward), then inward. */
function edge(items: HTMLElement[], forward: boolean): HTMLElement[] {
  return forward ? items : [...items].reverse();
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

      const dialogItems = tabStops(getFocusableElements(containerRef.current));
      const toastItems = Array.from(
        document.querySelectorAll<HTMLElement>('[data-toast-container]'),
      ).flatMap(getFocusableElements);
      const active = document.activeElement as HTMLElement | null;
      const forward = !e.shiftKey;

      // Candidates to focus, in preference order; undefined = leave Tab to the browser.
      let candidates: HTMLElement[] | undefined;
      const toastIndex = active ? toastItems.indexOf(active) : -1;
      if (toastIndex !== -1) {
        // On a toast button: step within the toast, then back into the dialog.
        const step = toastItems[toastIndex + (forward ? 1 : -1)];
        candidates = step ? [step] : edge(dialogItems, forward);
      } else if (!active || active === document.body) {
        candidates = edge(dialogItems, forward);
      } else if (containerRef.current.contains(active)) {
        // Inside the dialog the browser steps, except where Tab would leave it.
        const leaving = forward
          ? dialogItems.length > 0 && sameStop(active, dialogItems[dialogItems.length - 1]!)
          : dialogItems.length > 0 && sameStop(active, dialogItems[0]!);
        if (leaving) {
          candidates =
            toastItems.length > 0 ? edge(toastItems, forward) : edge(dialogItems, forward);
        }
      }
      if (!candidates) return;
      // A target can refuse focus (hidden at this width): try the next one, never stall.
      for (const candidate of candidates) {
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
