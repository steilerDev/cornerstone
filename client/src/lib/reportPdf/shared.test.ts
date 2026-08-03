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
 *
 * #1929 ROUND 2: `dontBreakRows` and `PAGE_TOP_MARGIN` no longer live in this file at all.
 *  - `dontBreakRows` moved to the `table` node in overviewPdf.ts — TABLE_LAYOUT never carried the
 *    real fix (round 1's assertion here pinned a property pdfmake never reads; see
 *    overviewPdf.test.ts's "table.dontBreakRows" test and TABLE_LAYOUT's own doc comment for why).
 *  - `PAGE_TOP_MARGIN` moved to pageGeometry.ts, now a COMPUTED value (see pageGeometry.test.ts).
 * The describe blocks that used to cover those two here have been removed accordingly. Padding
 * assertions below now import their expected value from pageGeometry.ts (CELL_PADDING_X/
 * V_LINE_WIDTH) instead of a re-typed literal, so a future geometry constant change can't silently
 * desync this test from TABLE_LAYOUT's actual (also-imported) values.
 */
import { describe, it, expect } from '@jest/globals';
import { REFUND_TEXT_COLOR, buildPageHeader, buildPageFooter, TABLE_LAYOUT } from './shared.js';
import { CELL_PADDING_X, V_LINE_WIDTH } from './pageGeometry.js';

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
    it('defines line widths, colors, and padding functions for pdfmake tables, sourced from pageGeometry.ts (round 2: padding halved 8 -> 4 to reclaim Usage-column budget)', () => {
      expect(TABLE_LAYOUT.hLineWidth()).toBe(V_LINE_WIDTH);
      expect(TABLE_LAYOUT.vLineWidth()).toBe(V_LINE_WIDTH);
      expect(TABLE_LAYOUT.hLineColor).toBe('#d1d5db');
      expect(TABLE_LAYOUT.vLineColor).toBe('#d1d5db');
      expect(TABLE_LAYOUT.paddingLeft()).toBe(CELL_PADDING_X);
      expect(TABLE_LAYOUT.paddingRight()).toBe(CELL_PADDING_X);
      expect(TABLE_LAYOUT.paddingTop()).toBe(6);
      expect(TABLE_LAYOUT.paddingBottom()).toBe(6);
      // Pin the literal too, so this test still catches a regression even if a future change to
      // pageGeometry.ts's constants also (wrongly) drags TABLE_LAYOUT down with it.
      expect(TABLE_LAYOUT.paddingLeft()).toBe(4);
    });

    it('[regression #1929 round 2 / CRITICAL 1] never carries dontBreakRows — pdfmake reads that flag from the table node (TableProcessor.js:123: tableNode.table.dontBreakRows), never from the layout object passed as `layout:`', () => {
      // Round 1 set `dontBreakRows: true` HERE, on TABLE_LAYOUT (passed to pdfmake as `layout:`).
      // Confirmed inert by the architect's byte-identical-output test against a real render: since
      // `layout` is only ever consumed for border/padding/fill callbacks (hLineWidth, paddingLeft,
      // ...), nothing in pdfmake ever reads `_layout.dontBreakRows`. The real fix places the flag
      // on the `table` object directly in overviewPdf.ts (see its own regression test, which reads
      // the table node itself — the only place pdfmake actually honors it).
      expect(TABLE_LAYOUT).not.toHaveProperty('dontBreakRows');
    });
  });
});
