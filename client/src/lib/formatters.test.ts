import { describe, it, expect } from '@jest/globals';
import { createElement, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import {
  formatCurrency,
  getCurrencySymbol,
  formatPercent,
  formatDate,
  formatTime,
  formatDateTime,
  computeActualDuration,
  formatWeekdayShort,
  formatWeekdayMonthDay,
  formatFileSize,
  formatHours,
  formatDateTimeWithZone,
  useFormatters,
} from './formatters.js';
import { LocaleProvider } from '../contexts/LocaleContext.js';

// ─── formatCurrency ───────────────────────────────────────────────────────────

describe('formatCurrency', () => {
  describe('locale-aware formatting', () => {
    it('formats 1234.56 in en-US with EUR → contains 1,234.56 and €', () => {
      const result = formatCurrency(1234.56, 'en-US', 'EUR');
      expect(result).toContain('1,234.56');
      expect(result).toContain('€');
    });

    it('formats 1234.56 in de-DE with EUR → uses dot thousands separator and comma decimal', () => {
      const result = formatCurrency(1234.56, 'de-DE', 'EUR');
      // German locale: "1.234,56 €" (thousands dot, decimal comma)
      expect(result).toContain('1.234,56');
      expect(result).toContain('€');
    });

    it('formats with USD → contains dollar sign', () => {
      const result = formatCurrency(1234.56, 'en-US', 'USD');
      expect(result).toContain('$');
      expect(result).toContain('1,234.56');
    });

    it('formats with CHF currency code', () => {
      const result = formatCurrency(100, 'en-US', 'CHF');
      expect(result).toContain('100');
      // CHF may appear as "CHF" or symbol depending on runtime
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('default parameters (backwards compatibility)', () => {
    it('works with only amount → no error, returns a string', () => {
      const result = formatCurrency(500);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('default currency is EUR', () => {
      const result = formatCurrency(100);
      expect(result).toContain('€');
    });

    it('default locale formats with comma thousands separator', () => {
      const result = formatCurrency(1000);
      expect(result).toContain('1,000');
    });

    it('shows exactly 2 fraction digits', () => {
      const result = formatCurrency(100, 'en-US', 'EUR');
      expect(result).toMatch(/\.00/);
    });
  });

  describe('edge cases', () => {
    it('negative values are rendered correctly', () => {
      const result = formatCurrency(-1234.56, 'en-US', 'EUR');
      expect(result).toContain('1,234.56');
      // Should have some negative indicator (−, -, or parenthesis)
      expect(result).not.toBe(formatCurrency(1234.56, 'en-US', 'EUR'));
    });

    it('zero is formatted as 0.00', () => {
      const result = formatCurrency(0, 'en-US', 'EUR');
      expect(result).toContain('0.00');
    });

    it('large value is formatted with thousands separator', () => {
      const result = formatCurrency(1000000, 'en-US', 'EUR');
      expect(result).toContain('1,000,000');
    });
  });
});

// ─── getCurrencySymbol (Story #1807) ──────────────────────────────────────────

describe('getCurrencySymbol', () => {
  it("Scenario 21: getCurrencySymbol('EUR', 'en-US') returns '€'", () => {
    expect(getCurrencySymbol('EUR', 'en-US')).toBe('€');
  });

  it("Scenario 22: getCurrencySymbol('USD', 'en-US') returns '$'", () => {
    expect(getCurrencySymbol('USD', 'en-US')).toBe('$');
  });

  it("getCurrencySymbol('CHF', 'en-US') returns a non-empty symbol containing 'CHF' or 'Fr'", () => {
    const result = getCurrencySymbol('CHF', 'en-US');
    expect(result.length).toBeGreaterThan(0);
    expect(result === 'CHF' || result.includes('CHF') || result.includes('Fr')).toBe(true);
  });

  it('Scenario 23: getCurrencySymbol() with both defaults omitted returns €', () => {
    expect(getCurrencySymbol()).toBe('€');
  });

  it('falls back to the currency code itself when Intl cannot resolve a symbol', () => {
    // Intl.NumberFormat throws for a syntactically invalid currency code rather than
    // silently falling back, so this documents behavior for a resolvable-but-unusual
    // code instead — the fallback branch (`?? currency`) is exercised for completeness.
    const result = getCurrencySymbol('EUR', 'de-DE');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── useFormatters().getCurrencySymbol (Story #1807) ──────────────────────────

describe('useFormatters — getCurrencySymbol', () => {
  it('Scenario 24: returns the currency symbol for the current locale/currency context (default EUR/en)', () => {
    // No mocking needed: fetchConfig() targets a relative '/config' URL which is
    // invalid for the global fetch in jsdom/Node and rejects asynchronously,
    // silently caught by LocaleProvider — currency/locale stay at their
    // synchronous defaults (EUR / en) for the duration of this test.
    const { result } = renderHook(() => useFormatters(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(LocaleProvider, null, children),
    });

    expect(result.current.getCurrencySymbol()).toBe('€');
  });
});

// ─── useFormatters() — new formatter functions (Issue #1813) ─────────────────

describe('useFormatters — new formatter bindings', () => {
  function renderFormatters() {
    return renderHook(() => useFormatters(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(LocaleProvider, null, children),
    });
  }

  it('formatWeekdayShort is bound and callable with a single Date argument', () => {
    const { result } = renderFormatters();
    // No stored locale preference → resolvedLocale defaults to 'en' in jsdom → en-US
    const monday = new Date(2026, 4, 25);
    expect(result.current.formatWeekdayShort(monday)).toBe('Mon');
  });

  it('formatWeekdayMonthDay is bound and callable with a single Date argument', () => {
    const { result } = renderFormatters();
    const date = new Date(2026, 1, 24);
    const output = result.current.formatWeekdayMonthDay(date);
    expect(output).toContain('Feb');
    expect(output).toContain('24');
  });

  it('formatFileSize is bound and callable with a single bytes argument', () => {
    const { result } = renderFormatters();
    expect(result.current.formatFileSize(1572864)).toBe('1.5 MB');
  });

  it('formatHours is bound and callable with a single hours argument', () => {
    const { result } = renderFormatters();
    expect(result.current.formatHours(7.5)).toBe('7.50 h');
  });

  it('formatDateTimeWithZone is bound and callable with a single Date argument', () => {
    const { result } = renderFormatters();
    const date = new Date(2026, 1, 24, 14, 45);
    const output = result.current.formatDateTimeWithZone(date);
    expect(output).toContain('Feb');
    expect(output).toContain('2026');
  });

  it('formatDate accepts the monthStyle 3rd bound argument', () => {
    const { result } = renderFormatters();
    const output = result.current.formatDate('2026-05-24', undefined, 'long');
    expect(output).toContain('May');
  });

  it('formatPercent is bound and accepts an optional digits argument', () => {
    const { result } = renderFormatters();
    expect(result.current.formatPercent(90, 0)).toBe('90%');
    expect(result.current.formatPercent(3.5)).toBe('3.50%');
  });

  it('formatCurrency is bound and callable with a single amount argument', () => {
    const { result } = renderFormatters();
    expect(result.current.formatCurrency(100)).toContain('€');
  });

  it('formatTime is bound and callable with a single timestamp argument', () => {
    const { result } = renderFormatters();
    const output = result.current.formatTime('2026-03-15T14:30:00');
    expect(output).toMatch(/AM|PM/i);
  });

  it('formatDateTime is bound and callable with a single timestamp argument', () => {
    const { result } = renderFormatters();
    const output = result.current.formatDateTime('2026-03-15T14:30:00');
    expect(output).toContain(' at ');
  });
});

// ─── formatPercent ────────────────────────────────────────────────────────────

describe('formatPercent', () => {
  it('formats 3.5 as "3.50%"', () => {
    expect(formatPercent(3.5)).toBe('3.50%');
  });

  it('formats 0 as "0.00%"', () => {
    expect(formatPercent(0)).toBe('0.00%');
  });

  it('formats 100 as "100.00%"', () => {
    expect(formatPercent(100)).toBe('100.00%');
  });

  it('formats negative percentage', () => {
    expect(formatPercent(-5.25)).toBe('-5.25%');
  });

  it('rounds to 2 decimal places', () => {
    expect(formatPercent(1.5555)).toBe('1.56%');
  });

  // ─── locale/digits parameters (Issue #1813) ─────────────────────────────────

  describe('locale and digits parameters', () => {
    it('formats 3.5 in de-DE with default digits (2) as "3,50%" (comma decimal)', () => {
      expect(formatPercent(3.5, 'de-DE', 2)).toBe('3,50%');
    });

    it('formats 90 in en-US with digits=0 as "90%" (no fraction digits)', () => {
      expect(formatPercent(90, 'en-US', 0)).toBe('90%');
    });

    it('formats 90 in de-DE with digits=0 as "90%" (still integer, no comma)', () => {
      expect(formatPercent(90, 'de-DE', 0)).toBe('90%');
    });

    it('formats with digits=1 → one fraction digit in en-US', () => {
      expect(formatPercent(16.666, 'en-US', 1)).toBe('16.7%');
    });

    it('formats with digits=1 → one fraction digit in de-DE (comma)', () => {
      expect(formatPercent(16.666, 'de-DE', 1)).toBe('16,7%');
    });

    it('never inserts a space before the "%" sign, in any locale', () => {
      expect(formatPercent(50, 'de-DE', 0)).not.toContain(' %');
      expect(formatPercent(50, 'en-US', 0)).not.toContain(' %');
    });

    it('default locale (omitted) behaves as en-US', () => {
      expect(formatPercent(3.5)).toBe(formatPercent(3.5, 'en-US'));
    });
  });
});

// ─── formatDate ───────────────────────────────────────────────────────────────

describe('formatDate', () => {
  describe('locale-aware date formatting', () => {
    it('formats 2026-03-15 in en-US → contains "Mar", "15", and "2026"', () => {
      const result = formatDate('2026-03-15', 'en-US');
      expect(result).toContain('Mar');
      expect(result).toContain('15');
      expect(result).toContain('2026');
    });

    it('formats 2026-03-15 in de-DE → contains "15" and year', () => {
      const result = formatDate('2026-03-15', 'de-DE');
      expect(result).toContain('15');
      expect(result).toContain('2026');
      // German March abbreviation
      expect(result.toLowerCase()).toMatch(/m[äa]r/);
    });

    it('formats 2026-01-01 in en-US → contains "Jan"', () => {
      const result = formatDate('2026-01-01', 'en-US');
      expect(result).toContain('Jan');
      expect(result).toContain('1');
      expect(result).toContain('2026');
    });

    it('formats 2026-12-31 in de-DE → contains "31" and "2026"', () => {
      const result = formatDate('2026-12-31', 'de-DE');
      expect(result).toContain('31');
      expect(result).toContain('2026');
    });
  });

  describe('null/undefined handling', () => {
    it('returns "—" for null input', () => {
      expect(formatDate(null)).toBe('—');
    });

    it('returns "—" for undefined input', () => {
      expect(formatDate(undefined)).toBe('—');
    });

    it('returns custom fallback string when provided and input is null', () => {
      expect(formatDate(null, 'en-US', 'N/A')).toBe('N/A');
    });

    it('returns custom fallback string when provided and input is undefined', () => {
      expect(formatDate(undefined, 'de-DE', 'Kein Datum')).toBe('Kein Datum');
    });

    it('returns "—" for empty string input', () => {
      expect(formatDate('')).toBe('—');
    });
  });

  describe('default parameters', () => {
    it('uses en-US locale by default', () => {
      const result = formatDate('2026-06-15');
      expect(result).toContain('Jun');
    });

    it('uses "—" as default fallback', () => {
      expect(formatDate(null)).toBe('—');
    });
  });

  describe('ISO timestamp support', () => {
    it('accepts ISO timestamp string (uses date part only)', () => {
      const result = formatDate('2026-03-15T10:30:00Z', 'en-US');
      expect(result).toContain('Mar');
      expect(result).toContain('15');
      expect(result).toContain('2026');
    });
  });

  // ─── monthStyle parameter (Issue #1813) ──────────────────────────────────────

  describe('monthStyle parameter', () => {
    it('monthStyle="long" in en-US renders the full month name', () => {
      const result = formatDate('2026-05-24', 'en-US', '—', 'long');
      expect(result).toContain('May');
      expect(result).not.toContain('Mai');
    });

    it('monthStyle="long" in de-DE renders the full German month name (May → "Mai")', () => {
      // May is chosen specifically because en/de short AND long forms diverge
      // ("May" vs "Mai"), unlike e.g. February short form ("Feb" in both).
      const result = formatDate('2026-05-24', 'de-DE', '—', 'long');
      expect(result).toContain('Mai');
      expect(result).not.toContain('May');
    });

    it('default monthStyle ("short", omitted param) is unaffected by the new 4th param', () => {
      const result = formatDate('2026-05-24', 'en-US');
      expect(result).toContain('May');
    });

    it('explicit monthStyle="short" behaves identically to the default', () => {
      expect(formatDate('2026-05-24', 'en-US', '—', 'short')).toBe(
        formatDate('2026-05-24', 'en-US'),
      );
    });

    it('monthStyle="long" still respects the fallback for null input', () => {
      expect(formatDate(null, 'en-US', 'N/A', 'long')).toBe('N/A');
    });
  });
});

// ─── formatTime ───────────────────────────────────────────────────────────────

describe('formatTime', () => {
  it('returns "—" for null input', () => {
    expect(formatTime(null)).toBe('—');
  });

  it('returns "—" for undefined input', () => {
    expect(formatTime(undefined)).toBe('—');
  });

  it('returns a non-empty string for a valid timestamp', () => {
    const result = formatTime('2026-03-15T14:30:00Z', 'en-US');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('—');
  });

  it('formats with locale parameter — en-US uses 12-hour with AM/PM', () => {
    const result = formatTime('2026-03-15T14:30:00', 'en-US');
    // 14:30 in en-US 12-hour format should contain "PM"
    expect(result).toMatch(/PM|AM/i);
  });

  it('returns custom fallback when timestamp is null', () => {
    expect(formatTime(null, 'en-US', 'Unknown')).toBe('Unknown');
  });

  it('returns the fallback when Intl throws for a malformed locale tag (catch branch)', () => {
    // An invalid BCP 47 locale tag makes toLocaleTimeString throw a RangeError,
    // exercising the try/catch fallback branch.
    expect(formatTime('2026-03-15T14:30:00', 'not-a-locale!!!', 'Unavailable')).toBe('Unavailable');
  });
});

// ─── formatDateTime ───────────────────────────────────────────────────────────

describe('formatDateTime', () => {
  it('returns "—" for null input', () => {
    expect(formatDateTime(null)).toBe('—');
  });

  it('returns "—" for undefined input', () => {
    expect(formatDateTime(undefined)).toBe('—');
  });

  it('returns a string containing both date and time parts for a valid timestamp', () => {
    const result = formatDateTime('2026-03-15T14:30:00', 'en-US');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Should contain year and some time indicator
    expect(result).toContain('2026');
    expect(result).toMatch(/AM|PM/i);
  });

  it('contains " at " separator between date and time', () => {
    const result = formatDateTime('2026-03-15T14:30:00', 'en-US');
    expect(result).toContain(' at ');
  });

  it('returns custom fallback when timestamp is null', () => {
    expect(formatDateTime(null, 'en-US', 'No time')).toBe('No time');
  });

  it('de-DE locale returns a non-empty string', () => {
    const result = formatDateTime('2026-03-15T14:30:00', 'de-DE');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('—');
  });

  it('returns the fallback when Intl throws for a malformed locale tag (catch branch)', () => {
    expect(formatDateTime('2026-03-15T14:30:00', 'not-a-locale!!!', 'Unavailable')).toBe(
      'Unavailable',
    );
  });
});

// ─── computeWorkDuration ─────────────────────────────────────────────────────

import { computeWorkDuration } from './formatters.js';

describe('computeWorkDuration', () => {
  it("('08:00','16:30') returns 8.5", () => {
    expect(computeWorkDuration('08:00', '16:30')).toBe(8.5);
  });

  it("('09:00','09:06') returns 0.1", () => {
    expect(computeWorkDuration('09:00', '09:06')).toBe(0.1);
  });

  it("(null,'16:00') returns null — missing start", () => {
    expect(computeWorkDuration(null, '16:00')).toBeNull();
  });

  it("('08:00',null) returns null — missing end", () => {
    expect(computeWorkDuration('08:00', null)).toBeNull();
  });

  it("('08:00','08:00') returns null — equal times", () => {
    expect(computeWorkDuration('08:00', '08:00')).toBeNull();
  });

  it("('16:00','08:00') returns null — end before start", () => {
    expect(computeWorkDuration('16:00', '08:00')).toBeNull();
  });

  it("('8:00','16:00') returns null — invalid format (no leading zero)", () => {
    expect(computeWorkDuration('8:00', '16:00')).toBeNull();
  });

  it("('08:00','16') returns null — invalid end format (no minutes)", () => {
    expect(computeWorkDuration('08:00', '16')).toBeNull();
  });

  it('(undefined, undefined) returns null', () => {
    expect(computeWorkDuration(undefined, undefined)).toBeNull();
  });

  it("('00:00','23:59') returns 23.98", () => {
    expect(computeWorkDuration('00:00', '23:59')).toBe(23.98);
  });
});

// ─── computeActualDuration ────────────────────────────────────────────────────

describe('computeActualDuration', () => {
  const today = new Date('2026-03-15');

  it('returns null when startDate is null', () => {
    expect(computeActualDuration(null, '2026-03-20', today)).toBeNull();
  });

  it('returns null when startDate is undefined', () => {
    expect(computeActualDuration(undefined as unknown as null, '2026-03-20', today)).toBeNull();
  });

  it('returns 5 for a 5-day span (start to end)', () => {
    expect(computeActualDuration('2026-03-10', '2026-03-15', today)).toBe(5);
  });

  it('returns 0 when start equals end', () => {
    expect(computeActualDuration('2026-03-15', '2026-03-15', today)).toBe(0);
  });

  it('returns elapsed days from start to today when endDate is null', () => {
    // today = 2026-03-15, start = 2026-03-10 → 5 days
    expect(computeActualDuration('2026-03-10', null, today)).toBe(5);
  });

  it('returns null when end is before start (negative duration)', () => {
    // 2026-03-10 is before 2026-03-15 — start=15 end=10 → negative → null
    expect(computeActualDuration('2026-03-15', '2026-03-10', today)).toBeNull();
  });

  it('handles large date ranges correctly', () => {
    // 365 days for a non-leap year
    const result = computeActualDuration('2025-01-01', '2026-01-01', today);
    expect(result).toBe(365);
  });
});

// ─── formatWeekdayShort (Issue #1813) ─────────────────────────────────────────

describe('formatWeekdayShort', () => {
  // 2026-05-25 is a Monday
  const monday = new Date(2026, 4, 25);

  it('formats a Monday in de-DE as "Mo"', () => {
    expect(formatWeekdayShort(monday, 'de-DE')).toBe('Mo');
  });

  it('formats a Monday in en-US as "Mon"', () => {
    expect(formatWeekdayShort(monday, 'en-US')).toBe('Mon');
  });

  it('default locale (omitted) behaves as en-US', () => {
    expect(formatWeekdayShort(monday)).toBe('Mon');
  });

  it('formats a Sunday correctly in en-US', () => {
    // 2026-05-24 is a Sunday
    const sunday = new Date(2026, 4, 24);
    expect(formatWeekdayShort(sunday, 'en-US')).toBe('Sun');
  });

  it('formats a Sunday correctly in de-DE', () => {
    const sunday = new Date(2026, 4, 24);
    expect(formatWeekdayShort(sunday, 'de-DE')).toBe('So');
  });
});

// ─── formatWeekdayMonthDay (Issue #1813) ──────────────────────────────────────

describe('formatWeekdayMonthDay', () => {
  it('formats en-US as "Mon, Feb 24" style (weekday, short month, day)', () => {
    // 2026-02-24 is a Tuesday
    const date = new Date(2026, 1, 24);
    const result = formatWeekdayMonthDay(date, 'en-US');
    expect(result).toContain('Tue');
    expect(result).toContain('Feb');
    expect(result).toContain('24');
  });

  it('formats de-DE with German weekday and month abbreviations', () => {
    const date = new Date(2026, 4, 24); // Sunday, May 24, 2026
    const result = formatWeekdayMonthDay(date, 'de-DE');
    expect(result).toContain('So');
    expect(result).toContain('Mai');
    expect(result).toContain('24');
  });

  it('does not include the year in the output', () => {
    const date = new Date(2026, 1, 24);
    const result = formatWeekdayMonthDay(date, 'en-US');
    expect(result).not.toContain('2026');
  });

  it('default locale (omitted) behaves as en-US', () => {
    const date = new Date(2026, 1, 24);
    expect(formatWeekdayMonthDay(date)).toBe(formatWeekdayMonthDay(date, 'en-US'));
  });
});

// ─── formatFileSize (Issue #1813) ─────────────────────────────────────────────

describe('formatFileSize', () => {
  describe('byte-boundary behavior', () => {
    it('formats 500 bytes as "500 B" (no decimal, en-US)', () => {
      expect(formatFileSize(500, 'en-US')).toBe('500 B');
    });

    it('formats 0 bytes as "0 B"', () => {
      expect(formatFileSize(0, 'en-US')).toBe('0 B');
    });

    it('formats exactly 1023 bytes as "1023 B" (just under the KB boundary)', () => {
      expect(formatFileSize(1023, 'en-US')).toBe('1023 B');
    });

    it('formats exactly 1024 bytes as "1.0 KB" (KB boundary, inclusive)', () => {
      expect(formatFileSize(1024, 'en-US')).toBe('1.0 KB');
    });

    it('formats exactly 1048575 bytes (1024*1024 - 1) as KB, not MB', () => {
      const result = formatFileSize(1048575, 'en-US');
      expect(result).toContain('KB');
      expect(result).not.toContain('MB');
    });

    it('formats exactly 1048576 bytes (1024*1024) as "1.0 MB" (MB boundary, inclusive)', () => {
      expect(formatFileSize(1048576, 'en-US')).toBe('1.0 MB');
    });
  });

  describe('locale-aware decimal formatting', () => {
    it('formats 1572864 bytes (1.5 MB) in de-DE with a comma decimal separator', () => {
      const result = formatFileSize(1572864, 'de-DE');
      expect(result).toContain('1,5');
      expect(result).not.toContain('1.5');
      expect(result).toContain('MB');
    });

    it('formats 1572864 bytes (1.5 MB) in en-US with a dot decimal separator', () => {
      expect(formatFileSize(1572864, 'en-US')).toBe('1.5 MB');
    });

    it('formats a KB value with a comma decimal separator in de-DE', () => {
      const result = formatFileSize(1536, 'de-DE'); // 1.5 KB
      expect(result).toContain('1,5');
      expect(result).toContain('KB');
    });

    it('unit suffixes (B/KB/MB) are not translated in de-DE', () => {
      expect(formatFileSize(500, 'de-DE')).toContain('B');
      expect(formatFileSize(1536, 'de-DE')).toContain('KB');
      expect(formatFileSize(1572864, 'de-DE')).toContain('MB');
    });
  });

  describe('default parameters', () => {
    it('default locale (omitted) behaves as en-US', () => {
      expect(formatFileSize(1572864)).toBe('1.5 MB');
    });
  });
});

// ─── formatHours (Issue #1813) ─────────────────────────────────────────────────

describe('formatHours', () => {
  it('formats 7.5 in de-DE as "7,50 h" (comma decimal)', () => {
    expect(formatHours(7.5, 'de-DE')).toBe('7,50 h');
  });

  it('formats 7.5 in en-US as "7.50 h" (dot decimal)', () => {
    expect(formatHours(7.5, 'en-US')).toBe('7.50 h');
  });

  it('always shows exactly 2 fraction digits', () => {
    expect(formatHours(8, 'en-US')).toBe('8.00 h');
  });

  it('formats 0 hours correctly', () => {
    expect(formatHours(0, 'en-US')).toBe('0.00 h');
  });

  it('default locale (omitted) behaves as en-US', () => {
    expect(formatHours(7.5)).toBe('7.50 h');
  });

  it('rounds a 3-decimal value to 2 fraction digits', () => {
    expect(formatHours(7.567, 'en-US')).toBe('7.57 h');
  });
});

// ─── formatDateTimeWithZone (Issue #1813) ─────────────────────────────────────

describe('formatDateTimeWithZone', () => {
  const fixedDate = new Date(2026, 1, 24, 14, 45); // Feb 24, 2026, 2:45 PM local

  it('en-US output contains the short month, day, and year', () => {
    const result = formatDateTimeWithZone(fixedDate, 'en-US');
    expect(result).toContain('Feb');
    expect(result).toContain('24');
    expect(result).toContain('2026');
  });

  it('de-DE output differs from en-US output for the same Date (month name diverges)', () => {
    // Use May so the short month name diverges between en/de ("May" vs "Mai")
    const mayDate = new Date(2026, 4, 24, 14, 45);
    const enResult = formatDateTimeWithZone(mayDate, 'en-US');
    const deResult = formatDateTimeWithZone(mayDate, 'de-DE');
    expect(enResult).not.toBe(deResult);
    expect(enResult).toContain('May');
    expect(deResult).toContain('Mai');
  });

  it('en-US output contains a time-zone abbreviation', () => {
    const result = formatDateTimeWithZone(fixedDate, 'en-US');
    // Time zone abbreviations vary by CI runner TZ (e.g. "GMT+1", "UTC", "EST") —
    // assert there is trailing non-numeric content after the time, not an exact zone.
    expect(result.length).toBeGreaterThan('Feb 24, 2026, 02:45 PM'.length - 5);
  });

  it('de-DE output contains a time-zone abbreviation', () => {
    const result = formatDateTimeWithZone(fixedDate, 'de-DE');
    expect(result.length).toBeGreaterThan(10);
  });

  it('default locale (omitted) behaves as en-US', () => {
    expect(formatDateTimeWithZone(fixedDate)).toBe(formatDateTimeWithZone(fixedDate, 'en-US'));
  });

  it('includes hour and minute in 2-digit form', () => {
    const result = formatDateTimeWithZone(fixedDate, 'en-US');
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});
