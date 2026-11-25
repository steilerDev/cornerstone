import { describe, it, expect, afterEach } from '@jest/globals';
import { detectBrowserLocale } from './detectLocale.js';

/** @jest-environment jsdom is not needed: navigator is stubbed through Object.defineProperty. */
const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function stubNavigator(value: unknown) {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
}

afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'navigator', original);
  else delete (globalThis as { navigator?: unknown }).navigator;
});

describe('detectBrowserLocale', () => {
  it('maps a German region tag to de', () => {
    expect(detectBrowserLocale(['de-DE'])).toBe('de');
  });

  it('walks the list to the first supported language', () => {
    expect(detectBrowserLocale(['fr-FR', 'de-AT'])).toBe('de');
  });

  it('is case-insensitive', () => {
    expect(detectBrowserLocale(['EN-gb'])).toBe('en');
  });

  it('falls back to en for an empty list', () => {
    expect(detectBrowserLocale([])).toBe('en');
  });

  it('falls back to en when nothing is supported', () => {
    expect(detectBrowserLocale(['pt-BR', 'fr'])).toBe('en');
  });

  it('reads navigator.languages by default', () => {
    stubNavigator({ languages: ['fr-FR', 'de-DE'], language: 'en-US' });
    expect(detectBrowserLocale()).toBe('de');
  });

  it('falls back to navigator.language when languages is empty', () => {
    stubNavigator({ languages: [], language: 'de-CH' });
    expect(detectBrowserLocale()).toBe('de');
  });

  it('returns en when navigator has neither', () => {
    stubNavigator({});
    expect(detectBrowserLocale()).toBe('en');
  });

  it('returns en when navigator is undefined', () => {
    stubNavigator(undefined);
    expect(detectBrowserLocale()).toBe('en');
  });
});
