/**
 * Unit tests for client/src/lib/reportPdf/pageGeometry.ts
 *
 * #1929 round 2 (QA spec scenarios 1-5). This module is the single source of truth for every
 * page/table geometry constant the round-2 fix depends on being COMPUTED rather than hand-derived
 * in a comment — round 1 shipped a hand-derived PAGE_TOP_MARGIN (75) and a hand-derived Usage
 * column budget, both wrong, because nothing forced the derivation to be checked against its own
 * inputs. These tests assert the *relationships* the formulas encode (offsets, budgets, margins),
 * not just literal output numbers, so a future constant change can't silently reintroduce that
 * class of bug while still passing a re-typed-literal test.
 */
import { describe, it, expect } from '@jest/globals';
import {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  PAGE_MARGIN_X,
  PAGE_MARGIN_BOTTOM,
  CELL_PADDING_X,
  V_LINE_WIDTH,
  TABLE_BODY_FONT_SIZE,
  TABLE_HEADER_FONT_SIZE,
  TABLE_SMALL_FONT_SIZE,
  DEFAULT_LINE_HEIGHT,
  PAGE_TOP_MARGIN,
  printableWidth,
  printableHeight,
  tableOffsetsTotal,
  usableColumnWidth,
  headerFootprint,
  PDF_STYLES,
} from './pageGeometry.js';

describe('pageGeometry — page constants', () => {
  it('PAGE_WIDTH/PAGE_HEIGHT are the A4 dimensions in points', () => {
    expect(PAGE_WIDTH).toBe(595.28);
    expect(PAGE_HEIGHT).toBe(841.89);
  });

  it('PAGE_MARGIN_X/PAGE_MARGIN_BOTTOM are unchanged from round 1 (only the top margin is new)', () => {
    expect(PAGE_MARGIN_X).toBe(40);
    expect(PAGE_MARGIN_BOTTOM).toBe(60);
  });

  it('CELL_PADDING_X is 4 (halved from round 1s 8, reclaiming Usage-column budget)', () => {
    expect(CELL_PADDING_X).toBe(4);
  });

  it('V_LINE_WIDTH is 0.5', () => {
    expect(V_LINE_WIDTH).toBe(0.5);
  });

  it('TABLE_BODY_FONT_SIZE is 8, the AC3-mandated floor (not lower)', () => {
    expect(TABLE_BODY_FONT_SIZE).toBe(8);
  });

  it('[#1929 round 3] TABLE_HEADER_FONT_SIZE is 10, consumed by PDF_STYLES.tableHeader below (#1939 relocated PDF_STYLES into this module) so overviewPdf.ts header word-break threshold is computed from the same constant PDF_STYLES renders with', () => {
    expect(TABLE_HEADER_FONT_SIZE).toBe(10);
  });

  it('TABLE_SMALL_FONT_SIZE is 9 and is the size PDF_STYLES.small actually renders with (#1939 relocated PDF_STYLES into this module, so the constant and the style it feeds cannot drift apart)', () => {
    expect(TABLE_SMALL_FONT_SIZE).toBe(9);
    // The single-source-of-truth relationship, not just the literal: the rendered style reads
    // this constant. #1959's fix round removed the Usage-column 9pt consumers this test used to
    // reference (areaText/attachmentsNote continuation rows) — the remaining consumers are the
    // report's secondary text blocks, which still render through PDF_STYLES.small.
    expect(PDF_STYLES['small']).toBeDefined();
    expect(PDF_STYLES['small']!.fontSize).toBe(TABLE_SMALL_FONT_SIZE);
  });

  it('DEFAULT_LINE_HEIGHT matches merge.ts defaultStyle.lineHeight (1.4)', () => {
    expect(DEFAULT_LINE_HEIGHT).toBe(1.4);
  });
});

describe('pageGeometry — PDF_STYLES.letterSubject / PDF_STYLES.subheader font sizes are independently pinned (#1953)', () => {
  // #1953: LETTER_SUBJECT_FONT_SIZE and SUBHEADER_FONT_SIZE are two module-private constants that
  // currently both equal 12, but production deliberately split them into two separate literals
  // (see pageGeometry.ts's LETTER_SUBJECT_FONT_SIZE comment) because they mean different things:
  // SUBHEADER_FONT_SIZE is load-bearing footprint arithmetic feeding PAGE_TOP_MARGIN (via
  // headerFootprint()); LETTER_SUBJECT_FONT_SIZE is plain cover-letter typography with no geometry
  // consumer at all. The two assertions below MUST stay separate, each pinned to its own literal —
  // do NOT "deduplicate" them into `expect(PDF_STYLES.letterSubject.fontSize).toBe(PDF_STYLES.subheader.fontSize)`
  // (or into `SUBHEADER_FONT_SIZE`) just because the numbers currently match. Doing so would
  // silently re-couple two values production deliberately decoupled, and this test would stop
  // catching the exact regression #1953 exists to prevent: an edit to one font size that
  // unintentionally changes the other (or, for SUBHEADER_FONT_SIZE, reflows every page's top
  // margin — see PAGE_TOP_MARGIN below).
  it('PDF_STYLES.letterSubject.fontSize is 12pt, pinned to its own literal', () => {
    expect(PDF_STYLES['letterSubject']).toBeDefined();
    expect(PDF_STYLES['letterSubject']!.fontSize).toBe(12);
  });

  it('PDF_STYLES.subheader.fontSize is 12pt, pinned to its own literal (independently of letterSubject above)', () => {
    expect(PDF_STYLES['subheader']).toBeDefined();
    expect(PDF_STYLES['subheader']!.fontSize).toBe(12);
  });

  it('PAGE_TOP_MARGIN does not depend on letterSubject.fontSize: headerFootprint() sums only HEADER_FONT_SIZE, SUBHEADER_FONT_SIZE, SUBHEADER_MARGIN_TOP, and HEADER_BLOCK_BOTTOM_MARGIN — letterSubject is not one of its inputs, so a future change to the cover-letter subject size cannot reflow any page of the report (#1953 Verification)', () => {
    expect(PAGE_TOP_MARGIN).toBe(93);
    expect(PAGE_TOP_MARGIN).toBe(Math.ceil(headerFootprint() + 15));
  });
});

describe('pageGeometry — printableWidth (scenario 1)', () => {
  it('printableWidth() === 515.28 (595.28 page width minus 40pt left/right margins)', () => {
    expect(printableWidth()).toBe(515.28);
  });

  it('is the relationship PAGE_WIDTH - 2*PAGE_MARGIN_X, not a re-typed literal', () => {
    expect(printableWidth()).toBeCloseTo(PAGE_WIDTH - 2 * PAGE_MARGIN_X, 10);
  });
});

describe('pageGeometry — tableOffsetsTotal (scenario 2)', () => {
  it('tableOffsetsTotal(7) === 60 at CELL_PADDING_X=4, V_LINE_WIDTH=0.5', () => {
    expect(tableOffsetsTotal(7)).toBe(60);
  });

  it('tableOffsetsTotal(6) === 51.5 at CELL_PADDING_X=4, V_LINE_WIDTH=0.5', () => {
    expect(tableOffsetsTotal(6)).toBe(51.5);
  });

  it('matches the pdfmake DocMeasure.js:531-546 formula: n*(2*padding + vLineWidth) + vLineWidth', () => {
    for (const n of [1, 5, 7, 12]) {
      expect(tableOffsetsTotal(n)).toBeCloseTo(
        n * (2 * CELL_PADDING_X + V_LINE_WIDTH) + V_LINE_WIDTH,
        10,
      );
    }
  });
});

describe('pageGeometry — usableColumnWidth (scenario 3)', () => {
  it('usableColumnWidth(7) === printableWidth() - tableOffsetsTotal(7) — asserts the relationship, not just the number', () => {
    expect(usableColumnWidth(7)).toBe(printableWidth() - tableOffsetsTotal(7));
    expect(usableColumnWidth(7)).toBeCloseTo(455.28, 10);
  });

  it('usableColumnWidth(6) === printableWidth() - tableOffsetsTotal(6) — asserts the relationship, not just the number', () => {
    expect(usableColumnWidth(6)).toBe(printableWidth() - tableOffsetsTotal(6));
    expect(usableColumnWidth(6)).toBeCloseTo(463.78, 10);
  });

  it('stays self-consistent under a hypothetical constant change (offsets always subtract from printable width)', () => {
    // Not a magic-number check: whatever tableOffsetsTotal(n) currently computes to, usableColumnWidth(n)
    // must be exactly printableWidth() minus that value, for any column count — this is what
    // guarantees a future padding/border tweak can't desync the two functions.
    for (const n of [1, 3, 6, 7, 10]) {
      expect(usableColumnWidth(n)).toBe(printableWidth() - tableOffsetsTotal(n));
    }
  });
});

describe('pageGeometry — headerFootprint / PAGE_TOP_MARGIN (scenario 4)', () => {
  it('headerFootprint() < PAGE_TOP_MARGIN, with at least a 10pt visible gap', () => {
    expect(headerFootprint()).toBeLessThan(PAGE_TOP_MARGIN);
    expect(PAGE_TOP_MARGIN - headerFootprint()).toBeGreaterThanOrEqual(10);
  });

  it('PAGE_TOP_MARGIN is a computed expression (Math.ceil(headerFootprint() + gap)), not a hardcoded literal like round 1s 75', () => {
    // The exact numeric value (93) is a downstream consequence of headerFootprint()'s own inputs
    // (font sizes/line height in merge.ts's styles) — asserting the formula relationship here means
    // a future header/subheader style change automatically keeps this margin correct, which is
    // exactly what round 1's hand-picked 75 failed to do (architect review Q2).
    expect(PAGE_TOP_MARGIN).toBe(Math.ceil(headerFootprint() + 15));
    expect(PAGE_TOP_MARGIN).toBe(93);
  });

  it('headerFootprint() budgets for a TWO-LINE subheader (unbounded sourceName, AC13) — sane, non-zero, bounded value', () => {
    expect(headerFootprint()).toBeGreaterThan(0);
    expect(headerFootprint()).toBeCloseTo(77.2, 10);
    expect(headerFootprint()).toBeLessThan(150); // sanity bound against a runaway/typo constant
  });
});

describe('pageGeometry — printableHeight (scenario 5)', () => {
  it('printableHeight() === PAGE_HEIGHT - PAGE_TOP_MARGIN - PAGE_MARGIN_BOTTOM', () => {
    expect(printableHeight()).toBe(PAGE_HEIGHT - PAGE_TOP_MARGIN - PAGE_MARGIN_BOTTOM);
  });

  it('is a sane positive printable height for an A4 page', () => {
    expect(printableHeight()).toBeGreaterThan(600);
    expect(printableHeight()).toBeLessThan(PAGE_HEIGHT);
  });
});
