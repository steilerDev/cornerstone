import { describe, it, expect } from '@jest/globals';
import {
  formatCurrency,
  formatPercent,
  formatDate,
  formatTime,
  formatDateTime,
  computeActualDuration,
} from './formatters.js';

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
