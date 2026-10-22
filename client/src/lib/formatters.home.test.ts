import { describe, it, expect } from '@jest/globals';
import { createElement, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import {
  createFormatters,
  formatLongDate,
  formatSignedCurrency,
  useFormatters,
} from './formatters.js';
import { LocaleProvider } from '../contexts/LocaleContext.js';

describe('formatLongDate (#2230)', () => {
  it('formats weekday, day, month name and year in en-US', () => {
    expect(formatLongDate('2026-10-06', 'en-US')).toBe('Tuesday, October 6, 2026');
  });

  it('formats in German', () => {
    expect(formatLongDate('2026-10-06', 'de-DE')).toBe('Dienstag, 6. Oktober 2026');
  });

  it('defaults to en-US', () => {
    expect(formatLongDate('2026-03-10')).toBe('Tuesday, March 10, 2026');
  });

  it('ignores a time part (uses the first 10 characters)', () => {
    expect(formatLongDate('2026-10-06T23:30:00.000Z', 'en-US')).toBe('Tuesday, October 6, 2026');
  });

  it.each([null, undefined, '', 'not-a-date', '2026-00-10'])(
    'returns the en dash fallback for %p',
    (value) => {
      expect(formatLongDate(value as string | null | undefined)).toBe('—');
    },
  );

  it('uses a custom fallback', () => {
    expect(formatLongDate(null, 'en-US', 'n/a')).toBe('n/a');
  });
});

describe('formatSignedCurrency (#2230)', () => {
  it('puts a plus before positive and a minus before negative amounts (en-US EUR)', () => {
    expect(formatSignedCurrency(1500, 'en-US', 'EUR')).toBe('+€1,500.00');
    expect(formatSignedCurrency(-1234.5, 'en-US', 'EUR')).toBe('-€1,234.50');
  });

  it('has no sign for zero', () => {
    expect(formatSignedCurrency(0, 'en-US', 'EUR')).toBe('€0.00');
  });

  it('keeps two fraction digits and handles values of 1,000,000 and above', () => {
    expect(formatSignedCurrency(1234567.891, 'en-US', 'EUR')).toBe('+€1,234,567.89');
  });

  it('formats German with a trailing currency symbol and a sign', () => {
    const plus = formatSignedCurrency(1500, 'de-DE', 'EUR');
    const minus = formatSignedCurrency(-1500, 'de-DE', 'EUR');
    expect(plus).toMatch(/^\+1\.500,00\s€$/);
    expect(minus).toMatch(/^[-−]1\.500,00\s€$/);
  });

  it('defaults to en-US and EUR', () => {
    expect(formatSignedCurrency(5)).toBe('+€5.00');
  });

  it('honours another currency', () => {
    expect(formatSignedCurrency(-10, 'en-US', 'USD')).toBe('-$10.00');
  });
});

describe('createFormatters / useFormatters bindings (#2230)', () => {
  it('createFormatters binds locale and currency for both formatters', () => {
    const f = createFormatters('de-DE', 'EUR');
    expect(f.formatLongDate('2026-10-06')).toBe(formatLongDate('2026-10-06', 'de-DE'));
    expect(f.formatLongDate(null)).toBe('—');
    expect(f.formatLongDate(undefined, 'none')).toBe('none');
    expect(f.formatSignedCurrency(-42)).toBe(formatSignedCurrency(-42, 'de-DE', 'EUR'));
  });

  it('useFormatters exposes both, bound to the resolved locale', () => {
    const { result } = renderHook(() => useFormatters(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(LocaleProvider, null, children),
    });
    expect(result.current.formatLongDate('2026-10-06')).toBe('Tuesday, October 6, 2026');
    expect(result.current.formatSignedCurrency(10)).toMatch(/^\+/);
  });
});
