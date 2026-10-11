import { act } from '@testing-library/react';

/**
 * Test helper: a controllable `window.matchMedia`. jsdom never matches a query, so tests drive the
 * 768 px ObjectForm switch (and any other width query) by hand.
 */
export interface MatchMediaControl {
  /** Sets whether `query` matches and notifies its listeners inside act(). */
  set(query: string, matches: boolean): void;
  restore(): void;
}

export function installMatchMedia(
  initial: Readonly<Record<string, boolean>> = {},
): MatchMediaControl {
  const original = window.matchMedia;
  const state = new Map<string, boolean>(Object.entries(initial));
  const listeners = new Map<string, Set<() => void>>();

  window.matchMedia = (query: string): MediaQueryList => {
    return {
      get matches() {
        return state.get(query) ?? false;
      },
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_type: string, listener: () => void) => {
        const set = listeners.get(query) ?? new Set<() => void>();
        set.add(listener);
        listeners.set(query, set);
      },
      removeEventListener: (_type: string, listener: () => void) => {
        listeners.get(query)?.delete(listener);
      },
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  };

  return {
    set(query, matches) {
      state.set(query, matches);
      act(() => {
        listeners.get(query)?.forEach((listener) => listener());
      });
    },
    restore() {
      window.matchMedia = original;
    },
  };
}
