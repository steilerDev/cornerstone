/**
 * Unit tests for client/src/lib/reportPdf/shared.ts
 *
 * Covers: REFUND_TEXT_COLOR, buildPageHeader content shape, buildPageFooter pdfmake
 * footer-function contract, TABLE_LAYOUT.
 *
 * NOTE (frontend fix spec item 6): LIGHT_SOURCE_PALETTE, formatCurrencyForPdf, and
 * formatDateForPdf were deleted from shared.ts (and its index.ts re-export) — PDF builders now
 * receive locale-aware formatting via an explicit `formatters: Formatters` parameter (see
 * coverLetterPdf.test.ts / overviewPdf.test.ts / merge.test.ts) instead of importing module-level
 * formatting helpers from this file. The describe blocks that used to cover those three exports
 * have been removed accordingly — they no longer exist to import or test.
 */
import { describe, it, expect } from '@jest/globals';
import { REFUND_TEXT_COLOR, buildPageHeader, buildPageFooter, TABLE_LAYOUT } from './shared.js';

describe('reportPdf/shared', () => {
  describe('REFUND_TEXT_COLOR', () => {
    it('is a dark red hex color', () => {
      expect(REFUND_TEXT_COLOR).toBe('#991b1b');
      expect(REFUND_TEXT_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
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
