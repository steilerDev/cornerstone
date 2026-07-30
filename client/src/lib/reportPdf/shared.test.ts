/**
 * Unit tests for client/src/lib/reportPdf/shared.ts
 *
 * Covers: LIGHT_SOURCE_PALETTE shape/indexing, formatCurrencyForPdf/formatDateForPdf
 * delegation to formatters.ts, buildPageHeader content shape, buildPageFooter
 * pdfmake footer-function contract, TABLE_LAYOUT.
 */
import { describe, it, expect } from '@jest/globals';
import {
  LIGHT_SOURCE_PALETTE,
  formatCurrencyForPdf,
  formatDateForPdf,
  buildPageHeader,
  buildPageFooter,
  TABLE_LAYOUT,
} from './shared.js';
import { formatCurrency, formatDate } from '../formatters.js';

describe('reportPdf/shared', () => {
  describe('LIGHT_SOURCE_PALETTE', () => {
    it('has exactly 10 entries (index 0 unassigned + 1-9 named sources)', () => {
      expect(LIGHT_SOURCE_PALETTE).toHaveLength(10);
    });

    it('every entry is a hex color string', () => {
      for (const color of LIGHT_SOURCE_PALETTE) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });

    it('index 0 is a distinct grey used for unassigned', () => {
      expect(LIGHT_SOURCE_PALETTE[0]).toBe('#6b7280');
    });

    it('all 10 entries are unique colors', () => {
      expect(new Set(LIGHT_SOURCE_PALETTE).size).toBe(10);
    });
  });

  describe('formatCurrencyForPdf', () => {
    it('delegates to formatters.ts formatCurrency with default locale/currency', () => {
      expect(formatCurrencyForPdf(1234.5)).toBe(formatCurrency(1234.5));
    });

    it('formats zero correctly', () => {
      expect(formatCurrencyForPdf(0)).toBe(formatCurrency(0));
    });

    it('formats negative amounts correctly', () => {
      expect(formatCurrencyForPdf(-99.9)).toBe(formatCurrency(-99.9));
    });
  });

  describe('formatDateForPdf', () => {
    it('delegates to formatters.ts formatDate for a string date', () => {
      expect(formatDateForPdf('2026-01-15')).toBe(formatDate('2026-01-15'));
    });

    // FIXED (was BUG, reported and now resolved in production): formatDateForPdf's own signature
    // is declared as `(date: string | Date): string`, promising Date support. It previously
    // forwarded a raw Date straight to formatters.ts's real `formatDate` (which only accepts
    // `string | null | undefined` and does `dateStr.slice(0, 10)` internally — Date has no
    // `.slice`), throwing a TypeError on every caller that legitimately passes `new Date()`
    // (coverLetterPdf.ts's "today" line, overviewPdf.ts's "generatedAt" line). Production now
    // converts a Date to its ISO date portion (`date.toISOString().slice(0, 10)`) before
    // delegating — verify that conversion produces the same output as passing the equivalent
    // date string directly.
    it('accepts a Date object and formats it identically to the equivalent date string', () => {
      expect(formatDateForPdf(new Date('2026-01-15T00:00:00.000Z'))).toBe(formatDate('2026-01-15'));
    });

    it('accepts a Date object with a non-UTC-midnight time and still uses only its date portion', () => {
      expect(formatDateForPdf(new Date('2026-01-15T23:59:59.999Z'))).toBe(formatDate('2026-01-15'));
    });
  });

  describe('buildPageHeader', () => {
    it('builds a two-column header with report type, source name, and generated-at label', () => {
      const header = buildPageHeader('Claim Report', 'Home Loan', 'Generated: 2026-01-15');

      expect(header).toEqual(
        expect.objectContaining({
          columns: expect.any(Array),
          margin: [0, 0, 0, 20],
        }),
      );

      const columns = (header as { columns: unknown[] }).columns;
      expect(columns).toHaveLength(2);

      const [left, right] = columns as [
        { stack: { text: string; style: string }[] },
        { text: string; alignment: string; style: string },
      ];
      expect(left.stack[0]).toEqual({ text: 'Claim Report', style: 'header' });
      expect(left.stack[1]).toEqual({ text: 'Home Loan', style: 'subheader' });
      expect(right).toEqual({
        text: 'Generated: 2026-01-15',
        alignment: 'right',
        style: 'small',
      });
    });
  });

  describe('buildPageFooter', () => {
    it('returns a pdfmake footer function producing "label current / total"', () => {
      const footerFn = buildPageFooter('Page');
      expect(typeof footerFn).toBe('function');

      const result = footerFn(2, 5);
      expect(result).toEqual({
        text: 'Page 2 / 5',
        alignment: 'center',
        style: 'small',
        margin: [0, 20, 0, 0],
      });
    });

    it('reflects the current/total page numbers passed by pdfmake', () => {
      const footerFn = buildPageFooter('Seite');
      const result = footerFn(1, 1) as { text: string };
      expect(result.text).toBe('Seite 1 / 1');
    });
  });

  describe('TABLE_LAYOUT', () => {
    it('defines line widths, colors, and padding functions for pdfmake tables', () => {
      expect(TABLE_LAYOUT.hLineWidth()).toBe(0.5);
      expect(TABLE_LAYOUT.vLineWidth()).toBe(0.5);
      expect(TABLE_LAYOUT.hLineColor).toBe('#d1d5db');
      expect(TABLE_LAYOUT.vLineColor).toBe('#d1d5db');
      expect(TABLE_LAYOUT.paddingLeft()).toBe(8);
      expect(TABLE_LAYOUT.paddingRight()).toBe(8);
      expect(TABLE_LAYOUT.paddingTop()).toBe(6);
      expect(TABLE_LAYOUT.paddingBottom()).toBe(6);
    });
  });
});
