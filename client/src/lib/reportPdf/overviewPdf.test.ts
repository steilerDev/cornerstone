/**
 * Unit tests for client/src/lib/reportPdf/overviewPdf.ts
 *
 * Story #1900 REWRITE. buildOverviewContent's signature changed from consuming a raw
 * SourceReportResponse + derivation params to consuming an already-built `ReportContent` (text
 * only, no PDF-specific data derivation left in this file) plus the generation-time
 * `skippedDocuments: Map<invoiceId, reason[]>` map (skip footnotes are the one thing NOT baked
 * into ReportContent per the spec — they're async, generation-time data):
 *
 *   buildOverviewContent(reportContent: ReportContent, skippedDocuments: Map<string, string[]>, t: TFunction): Content[]
 *
 * `appendixByInvoiceId` is GONE entirely (previously accepted-but-unrendered; now the appendix
 * column doesn't exist in the signature at all — see merge.ts/merge.test.ts for where appendix
 * numbering lives now, purely in the pdf-lib splice step, never touching the table itself).
 * Row-level data derivation (usage text, attachment notes, split/deposit markers, footnote text)
 * has all moved to buildReportContent.ts (see buildReportContent.test.ts) — this file only lays
 * out the already-derived ReportContent fields into pdfmake Content[].
 *
 * #1929 ROUND 2 (QA spec scenarios 6-12): round 1's width-sum assertion
 * (`fixedSum <= PRINTABLE_WIDTH_PT`) omitted pdfmake's per-column offsets (padding + borders) and
 * was satisfied by a 673pt table on a 515.28pt page — a no-op guard (architect review, HIGH 3).
 * Round 1's `dontBreakRows` assertion is also gone from this file's "layout passthrough" section
 * — it now lives on the `table` node itself (see the dedicated test below), not on TABLE_LAYOUT
 * (shared.ts no longer carries it at all — see shared.test.ts). New coverage: splitIntoPageSafeChunks
 * (chunking algorithm), the multi-row continuation-row shape it drives, and AC14's malformed-row
 * crash fix (unconditional status cell push).
 *
 * #1929 ROUND 3 (architect re-review at a3b085cd, CRITICAL/HIGH1/HIGH2/HIGH3): the Usage column is
 * no longer a `'*'` (star) column at all — it's an EXPLICIT NUMERIC width
 * (`USAGE_WIDTH_7COL`/`_6COL`, renamed from round 2's `USAGE_MIN_WIDTH_*COL`). Since
 * `elasticWidth` is read but never assigned anywhere in pdfmake (`columnCalculator.js:52`), a
 * FIXED column's `_calcWidth` is unconditionally its declared width — content can never grow it,
 * so the round-2 `<=`/`>=` inequality guards (checking the Usage floor was merely "enough room")
 * are replaced below by an EXACT `===` identity: `tableOffsetsTotal(n) + fixedSum(n) +
 * USAGE_WIDTH_nCOL === printableWidth()` holds algebraically, unconditionally, for both shapes.
 * Round 3 also found round 2's 0.495em AVERAGE char-width ratio under-flagged all-caps/M-W-heavy
 * tokens by ~45% (a 32-char all-caps Usage token measured 538.57pt against 515.28pt) — the
 * `USAGE_SAFE_TOKEN_CHARS_*COL` thresholds are recomputed from a 0.89em WORST-CASE ratio (were
 * 32/44, now 19/26), and the same per-token break-all protection now ALSO applies to every table
 * header cell (German header labels like "Auftragnehmer" measured wider than their own fixed
 * columns) and to Vendor body cells (free-form business names, e.g.
 * "Elektroinstallationsbetrieb" measured 92.72pt against the 45pt Vendor column) via the new
 * exported `VENDOR_SAFE_TOKEN_CHARS`.
 */
import { describe, it, expect } from '@jest/globals';
import type { TFunction } from 'i18next';
import type { ReportContent, ReportContentRow } from '../reportContent/index.js';
import {
  buildOverviewContent,
  splitIntoPageSafeChunks,
  buildUsageTextRuns,
  USAGE_WIDTH_7COL,
  USAGE_WIDTH_6COL,
  USAGE_SAFE_TOKEN_CHARS_7COL,
  USAGE_SAFE_TOKEN_CHARS_6COL,
  VENDOR_SAFE_TOKEN_CHARS,
  SMALL_SAFE_TOKEN_CHARS_7COL,
  SMALL_SAFE_TOKEN_CHARS_6COL,
  MAX_SAFE_USAGE_CHUNK_CHARS,
  MAX_SAFE_SMALL_CHUNK_CHARS,
} from './overviewPdf.js';
import { tableOffsetsTotal, printableWidth } from './pageGeometry.js';

const t = ((key: string) => key) as unknown as TFunction;

function makeRow(overrides: Partial<ReportContentRow> = {}): ReportContentRow {
  return {
    invoiceId: 'inv-1',
    vendor: 'ACME Builders',
    invoiceNumber: 'INV-001',
    dateText: 'date(2026-01-10)',
    status: null,
    statusText: null,
    invoiceAmountText: '€1000.00',
    allocatedAmountValueText: '€1000.00',
    allocatedMarkers: '',
    isDeposit: false,
    isRefund: false,
    refundNoteText: 'sourceReports.table.refundNote',
    usageText: '—',
    attachmentsNote: null,
    areaText: null,
    ...overrides,
  };
}

// Key-echo convention: labels values equal the i18n key strings themselves, matching the mock
// `t` used throughout this file (`t = (key) => key`). This keeps every existing header/source-info
// assertion (which asserts against the raw key string) passing unchanged, since buildReportContent
// (not tested here) is what would normally produce these translated values — overviewPdf.ts only
// ever reads reportContent.labels.*, never calls t() for label text itself.
function makeLabels(): ReportContent['labels'] {
  return {
    vendor: 'sourceReports.table.vendor',
    invoiceNumber: 'sourceReports.table.invoiceNumber',
    date: 'sourceReports.table.date',
    status: 'sourceReports.table.status',
    invoiceAmount: 'sourceReports.table.invoiceAmount',
    allocatedAmount: 'sourceReports.table.allocatedAmount',
    usage: 'sourceReports.table.usage',
    attachmentsNote: 'sourceReports.editable.attachmentsNoteLabel',
    deposit: 'sourceReports.table.attachmentType.deposit',
    source: 'sourceReports.table.source',
    sourceType: 'sourceReports.table.sourceType',
    reference: 'sourceReports.table.reference',
    generatedAt: 'sourceReports.table.generatedAt',
  };
}

function makeContent(overrides: Partial<ReportContent> = {}): ReportContent {
  return {
    isOverview: false,
    isClaim: false,
    tableTitle: 'sourceReports.table.title.claim',
    labels: makeLabels(),
    sourceInfo: {
      sourceName: 'Home Loan',
      sourceTypeText: 'sourceReports.sourceType.bank_loan',
      referenceText: null,
      generatedAtText: 'date(2026-01-15)',
    },
    coverLetter: null,
    rows: [],
    summaryRows: [{ key: 'total', label: 'sourceReports.table.total', amountText: '€0.00' }],
    footnotes: [],
    ...overrides,
  };
}

// Flattens a pdfmake `table.body` row into plain text strings for easy assertions. Cells that are
// `stack`s (the Usage column when an attachment note or area text is present) yield `undefined`.
// The allocated-amount cell's `text` is always an array of runs (story #1923: the isDeposit inline
// label is a distinct, separately-styled run) — concatenate those runs' own `.text` values so
// existing plain-string assertions keep working; dedicated tests inspect the raw run array instead
// where the per-run styling itself is under test.
function rowTexts(row: unknown): (string | undefined)[] {
  return (row as { text?: string | { text: string }[] }[]).map((cell) => {
    if (Array.isArray(cell.text)) {
      return cell.text.map((run) => run.text).join('');
    }
    return cell.text;
  });
}

// #1929 round 2 (word-break follow-up finding): a Usage cell's `.text` is now ALWAYS an array of
// pdfmake text runs (`buildUsageTextRuns()`) — never a plain string, even for ordinary short text
// with no oversized token — because the runs array is how a single whitespace-free token can carry
// its own `wordBreak: 'break-all'` without affecting the rest of the cell. Reconstruct before
// comparing to a plain-string expectation. (`rowTexts()` above already does this generically for
// whole rows; this is the same logic scoped to a single already-extracted `.text` value, needed
// when a Usage cell is nested inside a `stack` alongside areaText/attachmentsNote, which are NOT
// run arrays and must not be run through this reconstruction.)
function usageRunsText(text: unknown): string {
  if (Array.isArray(text)) {
    return (text as { text: string }[]).map((run) => run.text).join('');
  }
  return text as string;
}

function getTable(content: unknown[]): {
  headerRows: number;
  widths: (string | number)[];
  body: unknown[][];
} {
  const tableItem = content.find((c) => typeof c === 'object' && c !== null && 'table' in c) as {
    table: { headerRows: number; widths: (string | number)[]; body: unknown[][] };
  };
  return tableItem.table;
}

describe('buildOverviewContent — title and source info', () => {
  it('renders the title from reportContent.tableTitle and source info from reportContent.sourceInfo', () => {
    const content = makeContent({ tableTitle: 'sourceReports.table.title.claim' });
    const result = buildOverviewContent(content, new Map(), t);

    const titleItem = result[0] as { text: string };
    expect(titleItem.text).toBe('sourceReports.table.title.claim');

    const infoStack = result[1] as { stack: { text: string }[] };
    expect(infoStack.stack.map((s) => s.text)).toEqual(
      expect.arrayContaining([
        'sourceReports.table.source: Home Loan',
        expect.stringContaining('sourceReports.table.sourceType'),
        expect.stringContaining('sourceReports.table.generatedAt'),
      ]),
    );
  });

  it('omits the reference line when sourceInfo.referenceText is null', () => {
    const content = makeContent({
      sourceInfo: { ...makeContent().sourceInfo, referenceText: null },
    });
    const result = buildOverviewContent(content, new Map(), t);
    const infoStack = result[1] as { stack: { text: string }[] };
    expect(
      infoStack.stack.find((s) => s.text.includes('sourceReports.table.reference')),
    ).toBeUndefined();
  });

  it('includes the reference line when sourceInfo.referenceText is present', () => {
    const content = makeContent({
      sourceInfo: { ...makeContent().sourceInfo, referenceText: 'REF-99' },
    });
    const result = buildOverviewContent(content, new Map(), t);
    const infoStack = result[1] as { stack: { text: string }[] };
    expect(infoStack.stack.find((s) => s.text.includes('REF-99'))).toBeDefined();
  });

  it('AC3.2: omits the sourceInfoStack entirely when isClaim is true — the table follows the title directly', () => {
    const content = makeContent({ isClaim: true, rows: [] });
    const result = buildOverviewContent(content, new Map(), t);
    expect(result).toHaveLength(2); // title + table only, no stack in between
    const second = result[1] as unknown as Record<string, unknown>;
    expect(second.table).toBeDefined();
    expect(second.stack).toBeUndefined();
  });

  it('renders the sourceInfoStack when isClaim is false (budget-overview/proof-of-funds), unchanged', () => {
    const content = makeContent({ isClaim: false, rows: [] });
    const result = buildOverviewContent(content, new Map(), t);
    const second = result[1] as unknown as Record<string, unknown>;
    expect(second.stack).toBeDefined();
  });
});

describe('buildOverviewContent — column layout', () => {
  it('[regression #1929 round 3, scenario 6] budget-overview header is exactly [vendor, invoiceNumber, date, status, invoiceAmount, allocatedAmount, usage]; EVERY width (including Usage) is an explicit number — no "*" anywhere — and the algebraic identity holds exactly', () => {
    const content = makeContent({ isOverview: true });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);

    // #1929 round 3 (architect CRITICAL/HIGH1): Usage is no longer '*' — pdfmake never grows a
    // fixed column past its declared width (elasticWidth is read but assigned nowhere,
    // columnCalculator.js:52), so declaring EVERY column numeric makes the star column's
    // content-driven overflow branch structurally unreachable. On round-2 this array was
    // [...,'*'] — five/six fixed columns plus one content-driven star column.
    expect(table.headerRows).toBe(1);
    expect(table.widths).toHaveLength(7);
    expect(table.widths.every((w) => typeof w === 'number')).toBe(true);
    expect(table.widths.some((w) => w === '*' || w === 'auto')).toBe(false);
    expect(table.widths[6]).toBe(USAGE_WIDTH_7COL);

    // The invariant that replaced round 2's inequality guard: declared widths are CONTENT widths,
    // not the space they occupy on the page — pdfmake additionally reserves tableOffsetsTotal(7)
    // for padding+borders before distributing them. With every column numeric, this identity
    // holds EXACTLY (not just "leaves enough room"), by construction, for ANY content.
    const fixedSum = (table.widths.slice(0, 6) as number[]).reduce((a, b) => a + b, 0);
    expect(tableOffsetsTotal(7) + fixedSum + USAGE_WIDTH_7COL).toBe(printableWidth());

    expect(rowTexts(table.body[0])).toEqual([
      'sourceReports.table.vendor',
      'sourceReports.table.invoiceNumber',
      'sourceReports.table.date',
      'sourceReports.table.status',
      'sourceReports.table.invoiceAmount',
      'sourceReports.table.allocatedAmount',
      'sourceReports.table.usage',
    ]);
  });

  it('[regression #1929 round 3, scenario 6] claim/proof-of-funds header has exactly 6 cells with no status column; EVERY width (including Usage) is an explicit number, and the algebraic identity holds exactly', () => {
    const content = makeContent({ isOverview: false });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);

    // Same shape/contract as the 7-column case above.
    expect(table.headerRows).toBe(1);
    expect(table.widths).toHaveLength(6);
    expect(table.widths.every((w) => typeof w === 'number')).toBe(true);
    expect(table.widths.some((w) => w === '*' || w === 'auto')).toBe(false);
    expect(table.widths[5]).toBe(USAGE_WIDTH_6COL);

    const fixedSum = (table.widths.slice(0, 5) as number[]).reduce((a, b) => a + b, 0);
    expect(tableOffsetsTotal(6) + fixedSum + USAGE_WIDTH_6COL).toBe(printableWidth());

    expect(rowTexts(table.body[0])).toEqual([
      'sourceReports.table.vendor',
      'sourceReports.table.invoiceNumber',
      'sourceReports.table.date',
      'sourceReports.table.invoiceAmount',
      'sourceReports.table.allocatedAmount',
      'sourceReports.table.usage',
    ]);
  });

  it('never renders an Appendix column (the appendix concept no longer exists in this signature)', () => {
    const content = makeContent({ isOverview: false, rows: [makeRow()] });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    expect(rowTexts(table.body[0])).not.toContain('sourceReports.table.appendix');
    expect((table.body[1] as unknown[]).length).toBe(6);
  });

  it('[regression #1929 round 2 / CRITICAL 1, scenario 7] the table NODE itself carries dontBreakRows: true — the only place pdfmake actually reads it (TableProcessor.js:123: tableNode.table.dontBreakRows), not the round-1 (inert) TABLE_LAYOUT placement', () => {
    const content = makeContent({ isOverview: true });
    const result = buildOverviewContent(content, new Map(), t);
    const tableItem = result.find((c) => typeof c === 'object' && c !== null && 'table' in c) as {
      table: { dontBreakRows?: boolean };
    };
    expect(tableItem.table.dontBreakRows).toBe(true);
  });
});

describe('splitIntoPageSafeChunks (scenario 8)', () => {
  it('(a) input <= maxChars returns [input] unchanged', () => {
    expect(splitIntoPageSafeChunks('short text', 100)).toEqual(['short text']);
    // Exact-length boundary too.
    const exact = 'x'.repeat(50);
    expect(splitIntoPageSafeChunks(exact, 50)).toEqual([exact]);
  });

  it('(b) input with clean word boundaries splits into <= maxChars chunks that rejoin (chunks.join("")) to the exact original', () => {
    const text = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const maxChars = 30;
    const chunks = splitIntoPageSafeChunks(text, maxChars);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(maxChars);
    }
    expect(chunks.join('')).toBe(text);
  });

  it('(c) a single whitespace-free token longer than maxChars hard-splits into maxChars-sized pieces that still rejoin exactly', () => {
    const longToken = 'a'.repeat(97); // no whitespace anywhere
    const maxChars = 20;
    const chunks = splitIntoPageSafeChunks(longToken, maxChars);
    expect(chunks.length).toBe(Math.ceil(97 / 20));
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.length).toBe(maxChars);
    }
    expect(chunks.join('')).toBe(longToken);
  });

  it('(c) a long unbreakable token embedded among normal words still rejoins exactly and every chunk stays <= maxChars', () => {
    const text = `start ${'b'.repeat(55)} end`;
    const maxChars = 20;
    const chunks = splitIntoPageSafeChunks(text, maxChars);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(maxChars);
    }
    expect(chunks.join('')).toBe(text);
  });

  it('(d) empty string returns [""]', () => {
    expect(splitIntoPageSafeChunks('', 100)).toEqual(['']);
  });

  it('never drops a character for a variety of lengths relative to maxChars (I1 spot-check)', () => {
    const maxChars = 47;
    for (const len of [
      0,
      1,
      maxChars - 1,
      maxChars,
      maxChars + 1,
      maxChars * 3,
      maxChars * 3 + 5,
    ]) {
      const text = Array.from({ length: len }, (_, i) => String(i % 10)).join('');
      // Reintroduce occasional spaces so the fixture isn't purely a single unbreakable token.
      const spaced = text.replace(/(.{5})/g, '$1 ').trimEnd();
      expect(splitIntoPageSafeChunks(spaced, maxChars).join('')).toBe(spaced);
    }
  });
});

// Reconstructs the text buildUsageTextRuns would render, by concatenating each run's own `.text`
// in order — the same technique used by rowTexts()/usageRunsText() elsewhere in this file. Used
// throughout this describe block to assert I1 (no character, including whitespace, is ever
// dropped or added) independent of exactly how the tokens got split into runs.
function runsText(runs: { text: string }[]): string {
  return runs.map((run) => run.text).join('');
}

describe('buildUsageTextRuns (#1929 round 2/3/4 word-break follow-up findings, scenarios 1/2/3)', () => {
  // Pin the actual threshold constants rather than re-typing 16/22 — if pageGeometry.ts's
  // per-char estimate or the USAGE_WIDTH_*COL values ever change, this test's own expectations
  // move with them instead of silently testing against a stale literal. The 1.04 ratio itself
  // (WORST_CASE_CHAR_ADVANCE_EM) is not exported — it's a module-private derivation constant in
  // overviewPdf.ts — so it's pinned here as a literal, same as round 3 pinned its own 0.89 (which
  // round 4 superseded: a 124-char/3-font glyph scan found '№' (U+2116) at 1.0283em, wider than
  // round 3's 'W'-based 0.8872em — round 3's own worst-case claim was itself an underclaim).
  it('USAGE_SAFE_TOKEN_CHARS_7COL === 16 and USAGE_SAFE_TOKEN_CHARS_6COL === 22 (floor(USAGE_WIDTH_*COL / (8 * 1.04)) — round 4s wider glyph-scan ratio, not round 3s "W"-only one)', () => {
    expect(USAGE_SAFE_TOKEN_CHARS_7COL).toBe(16);
    expect(USAGE_SAFE_TOKEN_CHARS_6COL).toBe(22);
    // Relationship, not just the literals: both thresholds are Math.floor(width / (8 * 1.04)).
    expect(USAGE_SAFE_TOKEN_CHARS_7COL).toBe(Math.floor(USAGE_WIDTH_7COL / (8 * 1.04)));
    expect(USAGE_SAFE_TOKEN_CHARS_6COL).toBe(Math.floor(USAGE_WIDTH_6COL / (8 * 1.04)));
  });

  it('VENDOR_SAFE_TOKEN_CHARS === 5 (floor(VENDOR_WIDTH=45 / (8 * 1.04)) — the #1929 round-3 HIGH1 export protecting free-form vendor names, tightened again in round 4)', () => {
    expect(VENDOR_SAFE_TOKEN_CHARS).toBe(5);
    expect(VENDOR_SAFE_TOKEN_CHARS).toBe(Math.floor(45 / (8 * 1.04)));
  });

  it('[#1929 round 4] SMALL_SAFE_TOKEN_CHARS_7COL === 14 and _6COL === 19 (floor(USAGE_WIDTH_*COL / (9 * 1.04)) — the areaText/attachmentsNote continuation-row threshold, at the 9pt "small" style, not the 8pt body font)', () => {
    expect(SMALL_SAFE_TOKEN_CHARS_7COL).toBe(14);
    expect(SMALL_SAFE_TOKEN_CHARS_6COL).toBe(19);
    expect(SMALL_SAFE_TOKEN_CHARS_7COL).toBe(Math.floor(USAGE_WIDTH_7COL / (9 * 1.04)));
    expect(SMALL_SAFE_TOKEN_CHARS_6COL).toBe(Math.floor(USAGE_WIDTH_6COL / (9 * 1.04)));
  });

  it('[#1929 round 4] MAX_SAFE_USAGE_CHUNK_CHARS === 650, sitting below the measured true ceiling (704) with margin, and comfortably above AC12s 600-char zero-degradation floor', () => {
    // Pin the RELATIONSHIP, not just the literal: 650 must stay strictly between AC12's 600-char
    // floor and the measured true ceiling (704, from a real '№'-only worst-case render — see
    // MAX_SAFE_USAGE_CHUNK_CHARS's own doc comment) — round 3's 700 had only 4 characters of
    // margin (0.57%) below its OWN true ceiling (836, later found to be under-measured with 'W'
    // instead of the true-worst '№'). If this constant ever moves outside that window again
    // without a fresh real-render measurement backing it, that's exactly the erosion this pins
    // against.
    const AC12_FLOOR = 600;
    const MEASURED_TRUE_CEILING = 704;
    expect(MAX_SAFE_USAGE_CHUNK_CHARS).toBe(650);
    expect(MAX_SAFE_USAGE_CHUNK_CHARS).toBeGreaterThan(AC12_FLOOR);
    expect(MAX_SAFE_USAGE_CHUNK_CHARS).toBeLessThan(MEASURED_TRUE_CEILING);
    // At least ~8% margin below the measured true ceiling — round 3's ~0.57% margin is exactly
    // what let a font-metric drift risk slip through undetected.
    const marginFraction =
      (MEASURED_TRUE_CEILING - MAX_SAFE_USAGE_CHUNK_CHARS) / MEASURED_TRUE_CEILING;
    expect(marginFraction).toBeGreaterThanOrEqual(0.07);
  });

  it('[#1929 round 4] MAX_SAFE_SMALL_CHUNK_CHARS === 450, sitting below its own measured true ceiling (546) — the new areaText/attachmentsNote chunking ceiling, no AC-mandated floor unlike usageText', () => {
    const MEASURED_TRUE_CEILING = 546;
    expect(MAX_SAFE_SMALL_CHUNK_CHARS).toBe(450);
    expect(MAX_SAFE_SMALL_CHUNK_CHARS).toBeLessThan(MEASURED_TRUE_CEILING);
    const marginFraction =
      (MEASURED_TRUE_CEILING - MAX_SAFE_SMALL_CHUNK_CHARS) / MEASURED_TRUE_CEILING;
    expect(marginFraction).toBeGreaterThanOrEqual(0.15);
  });

  describe('I1: joining every returned run reconstructs the input exactly', () => {
    it('empty string returns a single empty-text run', () => {
      const runs = buildUsageTextRuns('', USAGE_SAFE_TOKEN_CHARS_7COL);
      expect(runs).toEqual([{ text: '' }]);
      expect(runsText(runs as { text: string }[])).toBe('');
    });

    it('whitespace-only input reconstructs exactly (whitespace runs are preserved verbatim)', () => {
      const text = '   \t  ';
      const runs = buildUsageTextRuns(text, USAGE_SAFE_TOKEN_CHARS_7COL);
      expect(runsText(runs as { text: string }[])).toBe(text);
    });

    it('a token exactly AT the threshold reconstructs exactly and is NOT flagged for word-break', () => {
      const token = 'a'.repeat(USAGE_SAFE_TOKEN_CHARS_7COL);
      const runs = buildUsageTextRuns(token, USAGE_SAFE_TOKEN_CHARS_7COL) as {
        text: string;
        wordBreak?: string;
      }[];
      expect(runsText(runs)).toBe(token);
      expect(runs.some((run) => run.wordBreak === 'break-all')).toBe(false);
    });

    it('a token just ONE character OVER the threshold reconstructs exactly and IS flagged for word-break', () => {
      const token = 'a'.repeat(USAGE_SAFE_TOKEN_CHARS_7COL + 1);
      const runs = buildUsageTextRuns(token, USAGE_SAFE_TOKEN_CHARS_7COL) as {
        text: string;
        wordBreak?: string;
      }[];
      expect(runsText(runs)).toBe(token);
      expect(runs).toEqual([{ text: token, wordBreak: 'break-all' }]);
    });

    it('a very long single unbroken token (well over the threshold) reconstructs exactly as one flagged run', () => {
      const token = 'x'.repeat(500);
      const runs = buildUsageTextRuns(token, USAGE_SAFE_TOKEN_CHARS_7COL) as {
        text: string;
        wordBreak?: string;
      }[];
      expect(runsText(runs)).toBe(token);
      expect(runs).toHaveLength(1);
      expect(runs[0]!.wordBreak).toBe('break-all');
    });

    it('long tokens mixed into ordinary prose reconstruct exactly, with only the long tokens flagged', () => {
      const longToken = 'y'.repeat(60); // well over the 32/44 thresholds
      const text = `Materials and ${longToken} for the exterior renovation`;
      const runs = buildUsageTextRuns(text, USAGE_SAFE_TOKEN_CHARS_7COL) as {
        text: string;
        wordBreak?: string;
      }[];
      expect(runsText(runs)).toBe(text);
      const flagged = runs.filter((run) => run.wordBreak === 'break-all');
      expect(flagged).toEqual([{ text: longToken, wordBreak: 'break-all' }]);
    });
  });

  describe('I4: ordinary prose never gets a cell-wide (or per-word) break-all — only the oversized token does', () => {
    it('no run for an ordinary short-word sentence carries wordBreak at all', () => {
      const text =
        'Materials and labor for the exterior renovation, including brick veneer and mortar mix.';
      const runs = buildUsageTextRuns(text, USAGE_SAFE_TOKEN_CHARS_7COL) as {
        text: string;
        wordBreak?: string;
      }[];
      expect(runsText(runs)).toBe(text);
      expect(runs.every((run) => run.wordBreak === undefined)).toBe(true);
    });

    it('every token strictly under the threshold is emitted verbatim with no wordBreak, even directly adjacent to a flagged long token', () => {
      const longToken = 'z'.repeat(70);
      const text = `short ${longToken} words`;
      const runs = buildUsageTextRuns(text, USAGE_SAFE_TOKEN_CHARS_7COL) as {
        text: string;
        wordBreak?: string;
      }[];
      const shortRuns = runs.filter((run) => !/^\s*$/.test(run.text) && run.text !== longToken);
      expect(shortRuns).toEqual([{ text: 'short' }, { text: 'words' }]);
    });

    it('a moderate German compound noun UNDER both thresholds stays entirely unflagged in both shapes', () => {
      // 'Putzarbeiten' is 12 characters — under both USAGE_SAFE_TOKEN_CHARS_7COL (19) and _6COL
      // (26), so it must NOT be flagged. ('Wärmedämmverbundsystem' at 23 chars, round 2's example
      // here, is now itself a case that MUST be flagged for the 7-col shape under round 3's
      // tighter 19-char threshold — see the next test — so it can no longer serve as a
      // "stays unflagged in every shape" example.)
      const text = 'Lieferung und Montage sowie Putzarbeiten';
      const runs7 = buildUsageTextRuns(text, USAGE_SAFE_TOKEN_CHARS_7COL) as {
        text: string;
        wordBreak?: string;
      }[];
      const runs6 = buildUsageTextRuns(text, USAGE_SAFE_TOKEN_CHARS_6COL) as {
        text: string;
        wordBreak?: string;
      }[];
      expect(runsText(runs7)).toBe(text);
      expect(runsText(runs6)).toBe(text);
      expect(runs7.every((run) => run.wordBreak === undefined)).toBe(true);
      expect(runs6.every((run) => run.wordBreak === undefined)).toBe(true);
    });

    it('[#1929 round 3, H2 closed] "Wärmedämmverbundsystem" (22 chars) is now correctly flagged in the 7-col shape (22 > 19) but still unflagged in the 6-col shape (22 <= 26) — round 2s 32/44 thresholds would have missed the 7-col case entirely', () => {
      const text = 'Lieferung und Montage Wärmedämmverbundsystem inklusive Putzarbeiten';
      expect('Wärmedämmverbundsystem'.length).toBe(22);
      // Would NOT have been flagged under round 2's coarser thresholds (32/44) — this is exactly
      // the gap the architect's H2 finding identified.
      expect('Wärmedämmverbundsystem'.length).toBeLessThan(32);

      const runs7 = buildUsageTextRuns(text, USAGE_SAFE_TOKEN_CHARS_7COL) as {
        text: string;
        wordBreak?: string;
      }[];
      const runs6 = buildUsageTextRuns(text, USAGE_SAFE_TOKEN_CHARS_6COL) as {
        text: string;
        wordBreak?: string;
      }[];
      expect(runsText(runs7)).toBe(text);
      expect(runsText(runs6)).toBe(text);
      expect(runs7.filter((run) => run.wordBreak === 'break-all').map((run) => run.text)).toEqual([
        'Wärmedämmverbundsystem',
      ]);
      expect(runs6.every((run) => run.wordBreak === undefined)).toBe(true);
    });
  });

  describe('buildOverviewContent wiring: the correct safeTokenChars is selected per table shape', () => {
    it('a token that is unsafe for the 7-col floor but safe for the 6-col floor is flagged in a budget-overview report and NOT flagged in a claim report', () => {
      // 22 chars: over USAGE_SAFE_TOKEN_CHARS_7COL (19), under/at USAGE_SAFE_TOKEN_CHARS_6COL (26).
      const borderlineToken = 'a'.repeat(22);
      expect(borderlineToken.length).toBeGreaterThan(USAGE_SAFE_TOKEN_CHARS_7COL);
      expect(borderlineToken.length).toBeLessThanOrEqual(USAGE_SAFE_TOKEN_CHARS_6COL);

      const row = makeRow({ usageText: borderlineToken });

      const overviewContent = makeContent({ isOverview: true, rows: [row] });
      const overviewResult = buildOverviewContent(overviewContent, new Map(), t);
      const overviewTable = getTable(overviewResult);
      const overviewCell = (overviewTable.body[1] as unknown[])[6] as {
        text: { text: string; wordBreak?: string }[];
      };
      expect(overviewCell.text.some((run) => run.wordBreak === 'break-all')).toBe(true);

      const claimContent = makeContent({ isOverview: false, rows: [row] });
      const claimResult = buildOverviewContent(claimContent, new Map(), t);
      const claimTable = getTable(claimResult);
      const claimCell = (claimTable.body[1] as unknown[])[5] as {
        text: { text: string; wordBreak?: string }[];
      };
      expect(claimCell.text.some((run) => run.wordBreak === 'break-all')).toBe(false);
    });
  });
});

describe('#1929 round 3 HIGH1: header-cell and vendor-body-cell word-break protection', () => {
  // Real German sourceReports.table label strings (client/src/i18n/de/budget.json) — the exact
  // measured-overflow labels from the architect's round-3 review, not synthetic fixtures.
  function makeGermanLabels(): ReportContent['labels'] {
    return {
      ...makeLabels(),
      vendor: 'Auftragnehmer',
      invoiceNumber: 'Rechnungsnr.',
      date: 'Datum',
      status: 'Status',
      invoiceAmount: 'Rechnungsbetrag',
      allocatedAmount: 'Zugeordneter Betrag',
      usage: 'Verwendung',
    };
  }

  it('[HIGH1] "Auftragnehmer" (13 chars, vendor header, 45pt column) is flagged for word-break — measured 67.50pt against the 45pt column', () => {
    const content = makeContent({ isOverview: true, labels: makeGermanLabels() });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    const vendorHeaderCell = (table.body[0] as unknown[])[0] as {
      text: { text: string; wordBreak?: string }[];
    };
    expect(runsText(vendorHeaderCell.text)).toBe('Auftragnehmer');
    expect(vendorHeaderCell.text.some((run) => run.wordBreak === 'break-all')).toBe(true);
  });

  it('[HIGH1] "Rechnungsbetrag" (15 chars, invoiceAmount header, 48pt column) is flagged for word-break — measured 78.66pt against the 48pt column', () => {
    const content = makeContent({ isOverview: true, labels: makeGermanLabels() });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    const invoiceAmountHeaderCell = (table.body[0] as unknown[])[4] as {
      text: { text: string; wordBreak?: string }[];
    };
    expect(runsText(invoiceAmountHeaderCell.text)).toBe('Rechnungsbetrag');
    expect(invoiceAmountHeaderCell.text.some((run) => run.wordBreak === 'break-all')).toBe(true);
  });

  it('[HIGH1] "Zugeordneter Betrag" (allocatedAmount header, 75pt column): each word\'s own token-level flag reflects the conservative worst-case estimate exactly — "Betrag" (6 chars) fits under the 8-char header threshold and is NOT flagged; "Zugeordneter" (12 chars) exceeds it and IS flagged even though its real measured width (60.42pt) fits the 75pt column on its own — over-flagging here is the designed-harmless case (see buildHeaderCell/buildUsageTextRuns doc comments), not a bug: break-all only forces a MID-CHARACTER split when a token does not fit on one line by itself, which "Zugeordneter" does. The real-render test in realRender.test.ts confirms this never visually force-breaks the word.', () => {
    const content = makeContent({ isOverview: true, labels: makeGermanLabels() });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    const allocatedHeaderCell = (table.body[0] as unknown[])[5] as {
      text: { text: string; wordBreak?: string }[];
    };
    expect(runsText(allocatedHeaderCell.text)).toBe('Zugeordneter Betrag');
    const zugeordneterRun = allocatedHeaderCell.text.find((r) => r.text === 'Zugeordneter');
    const betragRun = allocatedHeaderCell.text.find((r) => r.text === 'Betrag');
    expect(zugeordneterRun?.wordBreak).toBe('break-all');
    expect(betragRun?.wordBreak).toBeUndefined();
  });

  it('[HIGH1, round 4] "Verwendung" (Usage header, wide column) stays unflagged; "Datum" (Date header, narrow column) is now ALSO flagged under round 4s tighter worst-case ratio — over-flagging, not a bug', () => {
    const content = makeContent({ isOverview: true, labels: makeGermanLabels() });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    const dateHeaderCell = (table.body[0] as unknown[])[2] as {
      text: { text: string; wordBreak?: string }[];
    };
    const usageHeaderCell = (table.body[0] as unknown[])[6] as {
      text: { text: string; wordBreak?: string }[];
    };
    // 'Verwendung' = 10 chars, comfortably under the Usage header threshold (16 for 7-col) — the
    // Usage column is wide enough that even round 4's much tighter worst-case ratio (1.04em, up
    // from round 3's 0.89em) doesn't flag it.
    expect(runsText(usageHeaderCell.text)).toBe('Verwendung');
    expect(usageHeaderCell.text.every((run) => run.wordBreak === undefined)).toBe(true);
    // 'Datum' = 5 chars, over the Date column's round-4 header threshold (floor(46 / (10*1.04)) =
    // 4) — round 3's looser 0.89em ratio put this exactly AT its (then 5-char) threshold, so it
    // used to be the "stays unflagged" example; round 4's tighter ratio flags it too. Harmless
    // over-flagging (see buildHeaderCell/buildUsageTextRuns doc comments) — real-render coverage
    // in realRender.test.ts confirms short flagged header words like this don't visually
    // mid-character-split, they just carry an unneeded flag.
    expect(runsText(dateHeaderCell.text)).toBe('Datum');
    expect(dateHeaderCell.text.some((run) => run.wordBreak === 'break-all')).toBe(true);
  });

  it('[HIGH1] a real free-form vendor body cell ("Elektroinstallationsbetrieb", 28 chars, no whitespace) is flagged for word-break — measured 92.72pt against the 45pt Vendor column', () => {
    const row = makeRow({ vendor: 'Elektroinstallationsbetrieb' });
    const content = makeContent({ isOverview: false, rows: [row] });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    const vendorBodyCell = (table.body[1] as unknown[])[0] as {
      text: { text: string; wordBreak?: string }[];
    };
    expect(runsText(vendorBodyCell.text)).toBe('Elektroinstallationsbetrieb');
    expect(vendorBodyCell.text).toEqual([
      { text: 'Elektroinstallationsbetrieb', wordBreak: 'break-all' },
    ]);
  });

  it('[HIGH1] an ordinary multi-word vendor name (each token under VENDOR_SAFE_TOKEN_CHARS) is never flagged, only whitespace-separated into its own runs', () => {
    // 'ACME' (4) and 'Builders' (8) — 'Builders' is over VENDOR_SAFE_TOKEN_CHARS (6), so THIS
    // fixture would actually flag 'Builders' too; use a fixture where every token is <= 6 chars to
    // exercise the "nothing flagged" path cleanly.
    const row = makeRow({ vendor: 'ACME AG' });
    const content = makeContent({ isOverview: false, rows: [row] });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    const vendorBodyCell = (table.body[1] as unknown[])[0] as {
      text: { text: string; wordBreak?: string }[];
    };
    expect(runsText(vendorBodyCell.text)).toBe('ACME AG');
    expect(vendorBodyCell.text.every((run) => run.wordBreak === undefined)).toBe(true);
  });
});

describe('buildOverviewContent — row rendering (consumes already-derived ReportContent.rows)', () => {
  it('renders vendor/invoiceNumber/date/status/invoiceAmount straight from the row fields', () => {
    const row = makeRow({
      vendor: 'Included Vendor',
      invoiceNumber: 'X-1',
      dateText: 'date(2026-02-01)',
      statusText: 'sources.lines.invoiceStatus.pending',
    });
    const content = makeContent({ isOverview: true, rows: [row] });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    expect(rowTexts(table.body[1])).toEqual([
      'Included Vendor',
      'X-1',
      'date(2026-02-01)',
      'sources.lines.invoiceStatus.pending',
      '€1000.00',
      '€1000.00',
      '—',
    ]);
  });

  it('omits the status cell when isOverview is false, even if statusText happens to be set', () => {
    const row = makeRow({ statusText: 'sources.lines.invoiceStatus.pending' });
    const content = makeContent({ isOverview: false, rows: [row] });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    expect(rowTexts(table.body[1])).not.toContain('sources.lines.invoiceStatus.pending');
  });

  it('renders every row in reportContent.rows, in order, with no independent filtering', () => {
    const rows = [
      makeRow({ invoiceId: 'inv-1', vendor: 'First' }),
      makeRow({ invoiceId: 'inv-2', vendor: 'Second' }),
    ];
    const content = makeContent({ rows });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    expect(rowTexts(table.body[1])[0]).toBe('First');
    expect(rowTexts(table.body[2])[0]).toBe('Second');
  });

  describe('refund-adjustment rows: color and no sign negation', () => {
    it('renders the invoice amount with the refund text color', () => {
      const row = makeRow({ isRefund: true, invoiceAmountText: '€200.00' });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);
      const rawRow = table.body[1] as { color?: string }[];
      expect(rawRow[3]!.color).toBe('#991b1b');
      expect(rowTexts(table.body[1])[3]).toBe('€200.00');
    });

    it('appends the refund note to the allocated cell and colors it, only when isRefund', () => {
      const row = makeRow({
        isRefund: true,
        allocatedAmountValueText: '€-200.00',
        refundNoteText: '(refund)',
      });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toBe('€-200.00 (refund)');
      const rawRow = table.body[1] as { color?: string }[];
      expect(rawRow[4]!.color).toBe('#991b1b');
    });

    it('does not apply the refund color or note for a non-refund row', () => {
      const row = makeRow({ isRefund: false, allocatedAmountValueText: '€500.00' });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toBe('€500.00');
      const rawRow = table.body[1] as { color?: string }[];
      expect(rawRow[4]!.color).toBeUndefined();
    });
  });

  describe('Usage cell: always a plain { text } cell — areaText/attachmentsNote render as SEPARATE continuation rows (#1929 round 4 architect review HIGH: the round-3 stack: [usageChunk, areaText, attachmentsNote] construction left their COMBINED height in one cell unbounded and silently dropped rows needing 3+/9+ pages; each field now gets its own independently-chunked row(s), never sharing a cell with usageText or with each other)', () => {
    it('renders a plain { text } cell with no extra rows when both areaText and attachmentsNote are null', () => {
      const row = makeRow({ usageText: 'Kitchen work', areaText: null, attachmentsNote: null });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);
      const cell = (table.body[1] as unknown[])[5] as { text?: unknown; stack?: unknown };
      expect(cell.stack).toBeUndefined();
      expect(usageRunsText(cell.text)).toBe('Kitchen work');
      // header (1) + 1 usage row + 1 summary row = 3 — no continuation rows.
      expect(table.body).toHaveLength(3);
    });

    it('renders the usage row PLUS one continuation row (style "small") for attachmentsNote — never stacked into the usage cell', () => {
      const row = makeRow({ usageText: 'Kitchen work', attachmentsNote: '1 attachment: Invoice' });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);

      const usageCell = (table.body[1] as unknown[])[5] as { text?: unknown; stack?: unknown };
      expect(usageCell.stack).toBeUndefined();
      expect(usageRunsText(usageCell.text)).toBe('Kitchen work');

      // header (1) + usage row (1) + attachmentsNote continuation row (1) + summary row (1) = 4.
      expect(table.body).toHaveLength(4);
      const noteRow = table.body[2] as { text?: unknown; style?: string }[];
      // Leading/amount cells on the continuation row are all blank.
      expect(rowTexts(noteRow).slice(0, 5)).toEqual(['', '', '', '', '']);
      const noteCell = noteRow[5] as { text: unknown; style?: string };
      expect(usageRunsText(noteCell.text)).toBe('1 attachment: Invoice');
      expect(noteCell.style).toBe('small');
    });

    it('AC5.2: renders the usage row, then an areaText continuation row, then an attachmentsNote continuation row — in that order, each its own row', () => {
      const row = makeRow({
        usageText: 'Kitchen work',
        areaText: 'Ground Floor',
        attachmentsNote: '1 attachment: Invoice',
      });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);

      // header (1) + usage row + areaText row + attachmentsNote row + summary row = 5.
      expect(table.body).toHaveLength(5);
      const usageCell = (table.body[1] as unknown[])[5] as { text: unknown };
      const areaCell = (table.body[2] as unknown[])[5] as { text: unknown; style?: string };
      const noteCell = (table.body[3] as unknown[])[5] as { text: unknown; style?: string };
      expect(usageRunsText(usageCell.text)).toBe('Kitchen work');
      expect(usageRunsText(areaCell.text)).toBe('Ground Floor');
      expect(areaCell.style).toBe('small');
      expect(usageRunsText(noteCell.text)).toBe('1 attachment: Invoice');
      expect(noteCell.style).toBe('small');
    });

    it('renders the usage row plus only an areaText continuation row when areaText is present but attachmentsNote is null', () => {
      const row = makeRow({
        usageText: 'Kitchen work',
        areaText: 'Ground Floor',
        attachmentsNote: null,
      });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);
      // header (1) + usage row + areaText row + summary row = 4.
      expect(table.body).toHaveLength(4);
      const areaCell = (table.body[2] as unknown[])[5] as { text: unknown };
      expect(usageRunsText(areaCell.text)).toBe('Ground Floor');
    });

    it('[#1929 round 2] the plain-cell Usage text is a run array of the individual whitespace-preserving tokens (buildUsageTextRuns wiring, not a plain string)', () => {
      const row = makeRow({ usageText: 'Kitchen work', attachmentsNote: null });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);
      const cell = (table.body[1] as unknown[])[5] as { text: { text: string }[] };
      expect(Array.isArray(cell.text)).toBe(true);
      expect(cell.text.map((run) => run.text)).toEqual(['Kitchen', ' ', 'work']);
    });
  });

  describe('allocated cell composition (skip markers + allocatedMarkers + refund note)', () => {
    it('renders allocatedAmountValueText plain when there are no markers and not a refund', () => {
      const row = makeRow({ allocatedAmountValueText: '€400.00', allocatedMarkers: '' });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toBe('€400.00');
    });

    it('appends the pre-computed, unnumbered/shared split+deposit markers verbatim (already formatted by buildReportContent)', () => {
      const row = makeRow({ allocatedAmountValueText: '€400.00', allocatedMarkers: '†‡' });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toBe('€400.00†‡');
    });

    it('prepends skip-footnote markers (*N) BEFORE the allocatedMarkers, numbered from skippedDocuments', () => {
      const row = makeRow({
        invoiceId: 'inv-1',
        allocatedAmountValueText: '€400.00',
        allocatedMarkers: '†',
      });
      const content = makeContent({ rows: [row] });
      const skipped = new Map<string, string[]>([['inv-1', ['footnoteFetchFailed']]]);
      const result = buildOverviewContent(content, skipped, t);
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toBe('€400.00*1†');
    });

    it('numbers multiple skip reasons on the same invoice sequentially', () => {
      const row = makeRow({ invoiceId: 'inv-1', allocatedAmountValueText: '€400.00' });
      const content = makeContent({ rows: [row] });
      const skipped = new Map<string, string[]>([
        ['inv-1', ['footnoteFetchFailed', 'footnoteInvalidPdf']],
      ]);
      const result = buildOverviewContent(content, skipped, t);
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toBe('€400.00*1*2');
    });
  });

  describe('allocated cell: isDeposit inline label (AC2.1)', () => {
    it('renders the allocated cell text as an array of runs when isDeposit is true', () => {
      const row = makeRow({ allocatedAmountValueText: '€300.00', isDeposit: true });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);
      const cell = (table.body[1] as unknown[])[4] as { text: unknown };
      expect(Array.isArray(cell.text)).toBe(true);
    });

    it('the second run carries the deposit label, gray color and small fontSize', () => {
      const row = makeRow({ allocatedAmountValueText: '€300.00', isDeposit: true });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);
      const cell = (table.body[1] as unknown[])[4] as {
        text: { text: string; color?: string; fontSize?: number }[];
      };
      expect(cell.text[0]!.text).toBe('€300.00');
      const depositRun = cell.text[1]!;
      expect(depositRun.color).toBe('#6b7280');
      expect(depositRun.fontSize).toBe(8);
      expect(depositRun.text).toContain('sourceReports.table.attachmentType.deposit');
    });

    it('renders exactly one run (no deposit run appended) when isDeposit is false', () => {
      const row = makeRow({ allocatedAmountValueText: '€300.00', isDeposit: false });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);
      const cell = (table.body[1] as unknown[])[4] as { text: { text: string }[] };
      expect(cell.text).toHaveLength(1);
      expect(cell.text[0]!.text).toBe('€300.00');
    });
  });
});

// Builds word-boundary-clean prose of a specific character length (repeating a short filler word
// list). Deliberately a plain arithmetic construction, NOT derived from any AI/validator length
// cap (#1929 AC12) — every describe block below that uses it says so explicitly at the call site.
function proseOfLength(exactLength: number): string {
  const words = ['usage', 'text', 'for', 'the', 'renovation', 'and', 'related', 'materials'];
  let text = '';
  let i = 0;
  for (;;) {
    const word = words[i % words.length]!;
    const candidate = text.length === 0 ? word : `${text} ${word}`;
    if (candidate.length >= exactLength) {
      return candidate.slice(0, exactLength);
    }
    text = candidate;
    i++;
  }
}

describe('buildOverviewContent — Usage chunking into continuation rows (scenarios 9-11)', () => {
  it('[scenario 9] usageText at exactly MAX_SAFE_USAGE_CHUNK_CHARS produces exactly one row for that invoice (no continuation rows)', () => {
    const usageText = proseOfLength(MAX_SAFE_USAGE_CHUNK_CHARS);
    expect(usageText.length).toBe(MAX_SAFE_USAGE_CHUNK_CHARS);
    const row = makeRow({ invoiceId: 'inv-1', vendor: 'Only Row', usageText });
    const content = makeContent({ rows: [row] });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    // header (1) + exactly 1 row for this invoice + 1 summary row = 3
    expect(table.body).toHaveLength(3);
    expect(rowTexts(table.body[1])[0]).toBe('Only Row');
  });

  it('[scenario 9] usageText below MAX_SAFE_USAGE_CHUNK_CHARS also produces exactly one row', () => {
    const usageText = proseOfLength(MAX_SAFE_USAGE_CHUNK_CHARS - 1);
    const row = makeRow({ invoiceId: 'inv-1', vendor: 'Only Row', usageText });
    const content = makeContent({ rows: [row] });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    expect(table.body).toHaveLength(3);
  });

  it('[scenario 10] usageText at 5x the threshold produces multiple rows; extra rows have empty leading/amount cells and non-empty Usage cells; concatenated Usage text reproduces the original exactly', () => {
    const usageText = proseOfLength(MAX_SAFE_USAGE_CHUNK_CHARS * 5);
    const rowA = makeRow({
      invoiceId: 'inv-long',
      vendor: 'Long Vendor',
      invoiceNumber: 'LONG-1',
      dateText: 'date(2026-03-01)',
      statusText: 'sources.lines.invoiceStatus.pending',
      invoiceAmountText: '€999.00',
      allocatedAmountValueText: '€999.00',
      usageText,
    });
    const rowB = makeRow({ invoiceId: 'inv-next', vendor: 'Next Vendor', usageText: 'short' });
    const content = makeContent({ isOverview: true, rows: [rowA, rowB] });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);

    // Derive the expected chunk count from splitIntoPageSafeChunks itself (unit-tested separately
    // above) rather than a naive Math.ceil(len/maxChars) — the algorithm greedily fills each chunk
    // up to the last clean word boundary <= maxChars, so it can produce one or two MORE chunks
    // than the arithmetic minimum. This test's job is to verify buildOverviewContent WIRES that
    // chunking output into the right row shapes, not to re-derive the chunking algorithm's output.
    const expectedChunks = splitIntoPageSafeChunks(usageText, MAX_SAFE_USAGE_CHUNK_CHARS).length;
    expect(expectedChunks).toBeGreaterThan(1);

    // header (1) + expectedChunks rows for inv-long + 1 row for inv-next + 1 summary row.
    expect(table.body).toHaveLength(1 + expectedChunks + 1 + 1);

    const longRows = table.body.slice(1, 1 + expectedChunks) as Record<string, unknown>[][];
    // First row carries the real leading/amount data.
    expect(rowTexts(longRows[0]!)).toEqual([
      'Long Vendor',
      'LONG-1',
      'date(2026-03-01)',
      'sources.lines.invoiceStatus.pending',
      '€999.00',
      '€999.00',
      expect.any(String),
    ]);
    // Every subsequent (continuation) row: leading + amount cells are all blank, Usage cell is
    // non-empty text.
    for (const contRow of longRows.slice(1)) {
      const texts = rowTexts(contRow);
      expect(texts.slice(0, 6)).toEqual(['', '', '', '', '', '']);
      expect(texts[6]).toBeTruthy();
    }

    // I1: concatenating every chunk row's Usage text, in table order, reproduces the ORIGINAL
    // usageText exactly — no character (including inter-chunk whitespace) is dropped.
    const reconstructed = longRows.map((r) => rowTexts(r)[6]).join('');
    expect(reconstructed).toBe(usageText);

    // The next invoice's own (unrelated) row must still be present and unaffected, immediately
    // after the chunked invoice's rows.
    const nextRow = table.body[1 + expectedChunks] as Record<string, unknown>[];
    expect(rowTexts(nextRow)[0]).toBe('Next Vendor');
  });

  it('[scenario 11, #1929 round 4 re-shape] areaText/attachmentsNote each render as their OWN continuation row(s), AFTER every usageText chunk row — never stacked into a usage row, each appearing exactly once', () => {
    const usageText = proseOfLength(MAX_SAFE_USAGE_CHUNK_CHARS * 3);
    const row = makeRow({
      invoiceId: 'inv-1',
      vendor: 'Chunked Vendor',
      usageText,
      areaText: 'Ground Floor',
      attachmentsNote: '1 attachment: Invoice',
    });
    const content = makeContent({ rows: [row] });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);

    const expectedUsageChunks = splitIntoPageSafeChunks(
      usageText,
      MAX_SAFE_USAGE_CHUNK_CHARS,
    ).length;
    expect(expectedUsageChunks).toBeGreaterThan(1);
    // areaText/attachmentsNote are short here (well under MAX_SAFE_SMALL_CHUNK_CHARS), so each
    // contributes exactly one continuation row.
    const usageRows = table.body.slice(1, 1 + expectedUsageChunks) as unknown[][];
    const areaRow = table.body[1 + expectedUsageChunks] as { text?: unknown; style?: string }[];
    const noteRow = table.body[1 + expectedUsageChunks + 1] as {
      text?: unknown;
      style?: string;
    }[];

    // Every usageText chunk row's Usage cell is plain { text } — no stack, no area/attachments
    // note mixed in (#1929 round 4: these never share a cell with usageText anymore).
    for (const contRow of usageRows) {
      const usageCell = contRow[contRow.length - 1] as { text?: unknown; stack?: unknown };
      expect(usageCell.stack).toBeUndefined();
    }

    // areaText's OWN row, immediately after every usageText chunk row.
    const areaCell = areaRow[areaRow.length - 1] as { text: unknown; style?: string };
    expect(usageRunsText(areaCell.text)).toBe('Ground Floor');
    expect(areaCell.style).toBe('small');
    expect(
      rowTexts(areaRow)
        .slice(0, areaRow.length - 1)
        .every((txt) => txt === ''),
    ).toBe(true);

    // attachmentsNote's OWN row, immediately after areaText's row.
    const noteCell = noteRow[noteRow.length - 1] as { text: unknown; style?: string };
    expect(usageRunsText(noteCell.text)).toBe('1 attachment: Invoice');
    expect(noteCell.style).toBe('small');
    expect(
      rowTexts(noteRow)
        .slice(0, noteRow.length - 1)
        .every((txt) => txt === ''),
    ).toBe(true);

    // header (1) + usageChunks + areaText row (1) + attachmentsNote row (1) + summary row (1).
    expect(table.body).toHaveLength(1 + expectedUsageChunks + 1 + 1 + 1);

    // areaText/attachmentsNote appear EXACTLY once across the WHOLE table (not just this chunked
    // group) — no duplication, no leakage into a usage row.
    const allUsageColumnTexts = table.body.map((r) =>
      usageRunsText((r[r.length - 1] as { text?: unknown })?.text),
    );
    expect(allUsageColumnTexts.filter((txt) => txt === 'Ground Floor')).toHaveLength(1);
    expect(allUsageColumnTexts.filter((txt) => txt === '1 attachment: Invoice')).toHaveLength(1);
  });
});

describe('buildOverviewContent — AC14: falsy statusText never produces a malformed row (scenario 12)', () => {
  it('an overview row with statusText: "" still produces a 7-cell row with an empty-text status cell, and does not throw', () => {
    const row = makeRow({ statusText: '' });
    const content = makeContent({ isOverview: true, rows: [row] });
    expect(() => buildOverviewContent(content, new Map(), t)).not.toThrow();
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    expect((table.body[1] as unknown[]).length).toBe(7);
    expect((table.body[1] as { text?: string }[])[3]).toEqual({ text: '', style: 'tableCell' });
  });

  it('an overview row with statusText: null still produces a 7-cell row with an empty-text status cell, and does not throw', () => {
    const row = makeRow({ statusText: null });
    const content = makeContent({ isOverview: true, rows: [row] });
    expect(() => buildOverviewContent(content, new Map(), t)).not.toThrow();
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    expect((table.body[1] as unknown[]).length).toBe(7);
    expect((table.body[1] as { text?: string }[])[3]).toEqual({ text: '', style: 'tableCell' });
  });

  it('a truthy statusText still renders normally alongside falsy ones in the same report (no cross-row regression)', () => {
    const rows = [
      makeRow({ invoiceId: 'inv-1', vendor: 'A', statusText: '' }),
      makeRow({ invoiceId: 'inv-2', vendor: 'B', statusText: 'sources.lines.invoiceStatus.paid' }),
    ];
    const content = makeContent({ isOverview: true, rows });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    expect((table.body[1] as unknown[]).length).toBe(7);
    expect((table.body[2] as unknown[]).length).toBe(7);
    expect(rowTexts(table.body[2])[3]).toBe('sources.lines.invoiceStatus.paid');
  });
});

describe('buildOverviewContent — footnotes (skip block first, then reportContent.footnotes verbatim)', () => {
  it('renders numbered skipped-document footnotes attributing each to its row vendor/invoice number', () => {
    const rows = [
      makeRow({ invoiceId: 'inv-1', vendor: 'ACME', invoiceNumber: 'A-1' }),
      makeRow({ invoiceId: 'inv-2', vendor: 'Beta', invoiceNumber: 'B-2' }),
    ];
    const content = makeContent({ rows });
    const skipped = new Map<string, string[]>([
      ['inv-1', ['footnoteFetchFailed']],
      ['inv-2', ['footnoteInvalidPdf', 'footnoteFetchFailed']],
    ]);
    const result = buildOverviewContent(content, skipped, t);
    const notesStack = result[result.length - 1] as { stack: { text: string }[] };
    expect(notesStack.stack).toHaveLength(3);
    expect(notesStack.stack[0]!.text).toBe(
      '*1: ACME (A-1) — sourceReports.table.footnoteFetchFailed',
    );
    expect(notesStack.stack[1]!.text).toBe(
      '*2: Beta (B-2) — sourceReports.table.footnoteInvalidPdf',
    );
    expect(notesStack.stack[2]!.text).toBe(
      '*3: Beta (B-2) — sourceReports.table.footnoteFetchFailed',
    );
  });

  it('falls back to em-dashes when the skipped invoiceId is not found in reportContent.rows', () => {
    const content = makeContent({ rows: [] });
    const skipped = new Map<string, string[]>([['unknown-inv', ['footnoteFetchFailed']]]);
    const result = buildOverviewContent(content, skipped, t);
    const notesStack = result[result.length - 1] as { stack: { text: string }[] };
    expect(notesStack.stack[0]!.text).toBe('*1: — (—) — sourceReports.table.footnoteFetchFailed');
  });

  it('appends reportContent.footnotes verbatim after the skip block, without re-deriving text', () => {
    const content = makeContent({
      footnotes: [
        {
          id: 'split-1',
          marker: '†1',
          text: 'Gamma Corp (G-9) — sourceReports.table.splitFootnote',
        },
      ],
    });
    const skipped = new Map<string, string[]>([['inv-skip', ['footnoteFetchFailed']]]);
    const contentWithSkipRow = makeContent({
      rows: [makeRow({ invoiceId: 'inv-skip', vendor: 'Skip Co', invoiceNumber: 'K-1' })],
      footnotes: content.footnotes,
    });
    const result = buildOverviewContent(contentWithSkipRow, skipped, t);
    const notesStack = result[result.length - 1] as { stack: { text: string }[] };
    expect(notesStack.stack).toHaveLength(2);
    expect(notesStack.stack[0]!.text).toBe(
      '*1: Skip Co (K-1) — sourceReports.table.footnoteFetchFailed',
    );
    expect(notesStack.stack[1]!.text).toBe(
      '†1: Gamma Corp (G-9) — sourceReports.table.splitFootnote',
    );
  });

  it('the first footnote entry carries margin [0,4,0,0]; skip entries never do', () => {
    const content = makeContent({
      footnotes: [{ id: 'split-1', marker: '†1', text: 'first footnote' }],
    });
    const skipped = new Map<string, string[]>([['inv-skip', ['footnoteFetchFailed']]]);
    const result = buildOverviewContent(content, skipped, t);
    const notesStack = result[result.length - 1] as {
      stack: (Record<string, unknown> & { text: string })[];
    };
    const skipEntry = notesStack.stack.find((n) => n.text.startsWith('*1'))!;
    expect(skipEntry.margin).toBeUndefined();
    const splitEntry = notesStack.stack.find((n) => n.text.startsWith('†1'))!;
    expect(splitEntry.margin).toEqual([0, 4, 0, 0]);
  });

  it('a non-first entry in reportContent.footnotes carries no special margin', () => {
    const content = makeContent({
      footnotes: [
        { id: 'split-1', marker: '†1', text: 'first' },
        { id: 'split-2', marker: '†2', text: 'second' },
      ],
    });
    const result = buildOverviewContent(content, new Map(), t);
    const notesStack = result[result.length - 1] as {
      stack: (Record<string, unknown> & { text: string })[];
    };
    expect(notesStack.stack[0]!.margin).toEqual([0, 4, 0, 0]);
    expect(notesStack.stack[1]!.margin).toBeUndefined();
  });

  it('renders no footnotes block when skippedDocuments is empty and reportContent.footnotes is empty', () => {
    const content = makeContent({ footnotes: [] });
    const result = buildOverviewContent(content, new Map(), t);
    const lastItem = result[result.length - 1];
    expect(lastItem).toEqual(expect.objectContaining({ table: expect.anything() }));
  });
});

describe('buildOverviewContent — summary rows (consumes reportContent.summaryRows verbatim)', () => {
  it('budget-overview: label lands at leadingCount-1=3, amount at index 5, trailing usage cell empty', () => {
    const content = makeContent({
      isOverview: true,
      summaryRows: [{ key: 'total', label: 'sourceReports.table.total', amountText: '€500.00' }],
    });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    const totalRow = table.body[table.body.length - 1] as Record<string, unknown>[];
    expect(totalRow).toEqual([
      { text: '', style: 'tableCell' },
      { text: '', style: 'tableCell' },
      { text: '', style: 'tableCell' },
      { text: 'sourceReports.table.total', style: 'tableCell', bold: true },
      { text: '', style: 'tableCell' },
      { text: '€500.00', style: 'tableCell', alignment: 'right', bold: true },
      { text: '', style: 'tableCell' },
    ]);
  });

  it('claim/proof-of-funds: label lands at leadingCount-1=2, amount at index 4', () => {
    const content = makeContent({
      isOverview: false,
      summaryRows: [{ key: 'total', label: 'sourceReports.table.total', amountText: '€500.00' }],
    });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    const totalRow = table.body[table.body.length - 1] as Record<string, unknown>[];
    expect(totalRow).toEqual([
      { text: '', style: 'tableCell' },
      { text: '', style: 'tableCell' },
      { text: 'sourceReports.table.total', style: 'tableCell', bold: true },
      { text: '', style: 'tableCell' },
      { text: '€500.00', style: 'tableCell', alignment: 'right', bold: true },
      { text: '', style: 'tableCell' },
    ]);
  });

  it('renders one summary row per reportContent.summaryRows entry, in order', () => {
    const content = makeContent({
      summaryRows: [
        { key: 'subtotal-pending', label: 'Pending Subtotal', amountText: '€100.00' },
        { key: 'subtotal-paid', label: 'Paid Subtotal', amountText: '€200.00' },
        { key: 'total', label: 'Total', amountText: '€300.00' },
      ],
    });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    // header (1) + 0 invoice rows + 3 summary rows = 4
    expect(table.body).toHaveLength(4);
    expect(rowTexts(table.body[1])[2]).toBe('Pending Subtotal');
    expect(rowTexts(table.body[2])[2]).toBe('Paid Subtotal');
    expect(rowTexts(table.body[3])[2]).toBe('Total');
  });
});

describe('buildOverviewContent — layout passthrough', () => {
  it('passes the real TABLE_LAYOUT through to the pdfmake table content block', async () => {
    const { TABLE_LAYOUT } = await import('./shared.js');
    const content = makeContent();
    const result = buildOverviewContent(content, new Map(), t);
    const tableItem = result.find((c) => typeof c === 'object' && c !== null && 'table' in c) as {
      layout: unknown;
    };
    expect(tableItem.layout).toBe(TABLE_LAYOUT);
  });
});
