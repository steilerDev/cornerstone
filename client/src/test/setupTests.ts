// Jest setup for client tests
// Runtime: extends expect with jest-dom matchers
// Types: the triple-slash directive augments global jest.Matchers
/// <reference types="@testing-library/jest-dom" />
import '@testing-library/jest-dom/jest-globals';

// Polyfill TextEncoder/TextDecoder for jsdom (required by react-router)
import { TextEncoder, TextDecoder } from 'node:util';

Object.defineProperties(globalThis, {
  TextEncoder: { value: TextEncoder },
  TextDecoder: { value: TextDecoder },
});

// Polyfill window.matchMedia for jsdom (not implemented in jsdom by default).
// ThemeContext uses this to detect the OS dark-mode preference.
// We default to light mode (matches: false) so tests run with the light theme.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
