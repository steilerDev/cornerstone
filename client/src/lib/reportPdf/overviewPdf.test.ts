/**
 * Unit tests for client/src/lib/reportPdf/overviewPdf.ts
 *
 * Story #1900 REWRITE. buildOverviewContent's signature changed from consuming a raw
 * SourceReportResponse + derivation params to consuming an already-built `ReportContent` (text
 * only, no PDF-specific data derivation left in this file) plus the generation-time
 * `skippedDocuments: Map<invoiceId, reason[]>` map (skip footnotes are the one thing NOT baked
 * into ReportContent per the spec — they're async, generation-time data):
 *
 *   buildOverviewContent(reportContent: ReportContent, skippedDocuments: Map<string, string[]>): Content[]
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
import type {
  ReportContent,
  ReportContentRow,
  ReportSkipReason,
  ReportColumnKey,
} from '../reportContent/index.js';
import { reportColumnsForUseCase, visibleReportColumns } from '../reportContent/index.js';
import type { UsageCellSegment } from './overviewPdf.js';
import {
  buildOverviewContent,
  splitIntoPageSafeChunks,
  packUsageCellRows,
  packUsageCellRowsWithMinimum,
  buildUsageTextRuns,
  computeColumnWidths,
  usageSafeTokenCharsForWidth,
  usageChunkCharsForWidth,
  USAGE_WIDTH_7COL,
  USAGE_WIDTH_6COL,
  USAGE_SAFE_TOKEN_CHARS_7COL,
  USAGE_SAFE_TOKEN_CHARS_6COL,
  VENDOR_SAFE_TOKEN_CHARS,
  MAX_SAFE_USAGE_CHUNK_CHARS,
  MIN_CONTINUATION_ROW_FLOOR_CHARS,
} from './overviewPdf.js';
import { tableOffsetsTotal, printableWidth } from './pageGeometry.js';

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
    isSplit: false,
    isDepositReduced: false,
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
    splitNote: 'sourceReports.table.splitInlineLabel',
    depositReducedNote: 'sourceReports.table.depositReducedInlineLabel',
    source: 'sourceReports.table.source',
    sourceType: 'sourceReports.table.sourceType',
    reference: 'sourceReports.table.reference',
    generatedAt: 'sourceReports.table.generatedAt',
    pageLabel: 'sourceReports.table.pageLabel',
    coverLetterReferenceLabel: 'sourceReports.coverLetter.reference',
    coverLetterSubjectLabel: 'sourceReports.coverLetter.subjectLabel',
    skipReasonLabels: {
      footnoteFetchFailed: 'sourceReports.table.footnoteFetchFailed',
      footnoteInvalidPdf: 'sourceReports.table.footnoteInvalidPdf',
    },
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

// #1940 AC5: buildUsageCell prepends a single literal `{ text: '… ' }` run (U+2026 + space, no
// `color` override) as the very first run of a CONTINUATION row's (packedCellRows index >= 1)
// Usage cell — the visual "this row continues" signal. Every reconstruction helper in this file
// concatenates a cell's ENTIRE run array, so without stripping, every continuation-row assertion
// would silently start comparing `'… ' + text` against `text`. Centralized HERE, once, rather than
// patched ad hoc per call site: strips exactly one leading run whose `.text === '… '` and which
// carries no `color`. Only ever applied when the CALLER already asserts the row is a continuation
// row (`isContinuation: true`) — never applied unconditionally by substring/prefix match, which
// would risk silently masking a genuine reconstruction defect that happened to produce a leading
// '… ' in real user content on a row that was never supposed to carry the marker.
function stripContinuationMarker<T extends { text: string; color?: string }>(runs: T[]): T[] {
  if (runs.length > 0 && runs[0]!.text === '… ' && runs[0]!.color === undefined) {
    return runs.slice(1);
  }
  return runs;
}

// Flattens a pdfmake `table.body` row into plain text strings for easy assertions. Cells that are
// `stack`s (the Usage column when an attachment note or area text is present) yield `undefined`.
// The allocated-amount cell's `text` is always an array of runs (story #1923: the isDeposit inline
// label is a distinct, separately-styled run) — concatenate those runs' own `.text` values so
// existing plain-string assertions keep working; dedicated tests inspect the raw run array instead
// where the per-run styling itself is under test.
//
// `opts.isContinuation` (#1940): pass `true` when `row` is known to be a Usage continuation row —
// strips the leading '… ' marker (see stripContinuationMarker above) from the LAST cell before
// reconstructing, since the Usage cell is always the last cell in a row (buildOverviewContent
// always appends it last) and the only cell that is ever a run array on a continuation row (every
// other column is blanked to a plain '' string by buildEmptyBodyCell).
function rowTexts(row: unknown, opts: { isContinuation?: boolean } = {}): (string | undefined)[] {
  const cells = row as { text?: string | { text: string; color?: string }[] }[];
  return cells.map((cell, i) => {
    if (Array.isArray(cell.text)) {
      const runs =
        opts.isContinuation && i === cells.length - 1
          ? stripContinuationMarker(cell.text)
          : cell.text;
      return runs.map((run) => run.text).join('');
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

// #1959: `areaText`/`attachmentsNote` are no longer separate stack sub-rows or separate
// continuation rows — they are appended to the SAME Usage cell as the first `usageText` chunk, as
// one or more trailing grey runs prefixed with '\n' (see buildOverviewContent's `metaPieces`).
// After #1968 the meta suffix itself routes through buildUsageTextRuns and may produce multiple
// grey runs (one per whitespace-delimited token). Because `buildUsageTextRuns()` tokenizes
// usageText into one run PER WHITESPACE-DELIMITED TOKEN, the grey meta run(s) are NEVER at a fixed
// index like `text[1]` — their positions depend on the token count of the usage text before them.
// Split the cell into "the usageText runs" and "the trailing grey meta runs (if any)" by their own
// grey color, so assertions address the two by identity rather than by a positional guess that
// silently drifts with the fixture's word count.
const GREY = '#6b7280';

// `opts.isContinuation` (#1940): pass `true` when `cell` is known to be a Usage continuation row's
// cell — strips the leading '… ' marker (see stripContinuationMarker above) before parsing, so the
// marker never leaks into `usageText` (it would otherwise land in the non-grey prefix, ahead of
// any grey meta run).
function splitUsageCell(
  cell: unknown,
  opts: { isContinuation?: boolean } = {},
): {
  usageText: string;
  metaRun: { text: string; color?: string } | null;
  /** Raw grey runs preserving all pdfmake run properties including wordBreak. */
  greyRuns: { text: string; color?: string; wordBreak?: string }[];
} {
  const rawRuns = (cell as { text: { text: string; color?: string; wordBreak?: string }[] }).text;
  if (!Array.isArray(rawRuns)) {
    throw new Error('Usage cell .text is not a run array — buildUsageTextRuns wiring changed?');
  }
  const runs = opts.isContinuation ? stripContinuationMarker(rawRuns) : rawRuns;
  const greyIndexes = runs.map((run, i) => (run.color === GREY ? i : -1)).filter((i) => i !== -1);
  if (greyIndexes.length === 0) {
    return { usageText: runs.map((r) => r.text).join(''), metaRun: null, greyRuns: [] };
  }
  // Grey meta runs must be contiguous and occupy the tail of the run array (they are a suffix,
  // never interleaved into the usage prose). Multiple grey runs are allowed since #1968 routes
  // the meta suffix through buildUsageTextRuns, which may split it into per-token runs.
  const firstGrey = greyIndexes[0]!;
  const lastGrey = greyIndexes[greyIndexes.length - 1]!;
  if (lastGrey !== runs.length - 1) {
    throw new Error(
      `Grey meta run(s) must be the last run(s) in a Usage cell — last grey at ${lastGrey}, last run at ${runs.length - 1}`,
    );
  }
  if (lastGrey - firstGrey !== greyIndexes.length - 1) {
    throw new Error(
      `Grey meta runs must be contiguous in a Usage cell — found gaps in indexes ${greyIndexes.join(', ')}`,
    );
  }
  return {
    usageText: runs
      .slice(0, firstGrey)
      .map((r) => r.text)
      .join(''),
    metaRun: {
      text: greyIndexes.map((i) => runs[i]!.text).join(''),
      color: GREY,
    },
    greyRuns: greyIndexes.map((i) => runs[i]!),
  };
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
    const result = buildOverviewContent(content, new Map());

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
    const result = buildOverviewContent(content, new Map());
    const infoStack = result[1] as { stack: { text: string }[] };
    expect(
      infoStack.stack.find((s) => s.text.includes('sourceReports.table.reference')),
    ).toBeUndefined();
  });

  it('includes the reference line when sourceInfo.referenceText is present', () => {
    const content = makeContent({
      sourceInfo: { ...makeContent().sourceInfo, referenceText: 'REF-99' },
    });
    const result = buildOverviewContent(content, new Map());
    const infoStack = result[1] as { stack: { text: string }[] };
    expect(infoStack.stack.find((s) => s.text.includes('REF-99'))).toBeDefined();
  });

  it('AC3.2: omits the sourceInfoStack entirely when isClaim is true — the table follows the title directly', () => {
    const content = makeContent({ isClaim: true, rows: [] });
    const result = buildOverviewContent(content, new Map());
    expect(result).toHaveLength(2); // title + table only, no stack in between
    const second = result[1] as unknown as Record<string, unknown>;
    expect(second.table).toBeDefined();
    expect(second.stack).toBeUndefined();
  });

  it('renders the sourceInfoStack when isClaim is false (budget-overview/proof-of-funds), unchanged', () => {
    const content = makeContent({ isClaim: false, rows: [] });
    const result = buildOverviewContent(content, new Map());
    const second = result[1] as unknown as Record<string, unknown>;
    expect(second.stack).toBeDefined();
  });
});

describe('buildOverviewContent — column layout', () => {
  it('[regression #1929 round 3, scenario 6] budget-overview header is exactly [vendor, invoiceNumber, date, status, invoiceAmount, allocatedAmount, usage]; EVERY width (including Usage) is an explicit number — no "*" anywhere — and the algebraic identity holds exactly', () => {
    const content = makeContent({ isOverview: true });
    const result = buildOverviewContent(content, new Map());
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
    const result = buildOverviewContent(content, new Map());
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
    const result = buildOverviewContent(content, new Map());
    const table = getTable(result);
    expect(rowTexts(table.body[0])).not.toContain('sourceReports.table.appendix');
    expect((table.body[1] as unknown[]).length).toBe(6);
  });

  it('[regression #1929 round 2 / CRITICAL 1, scenario 7] the table NODE itself carries dontBreakRows: true — the only place pdfmake actually reads it (TableProcessor.js:123: tableNode.table.dontBreakRows), not the round-1 (inert) TABLE_LAYOUT placement', () => {
    const content = makeContent({ isOverview: true });
    const result = buildOverviewContent(content, new Map());
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

  // #1959 fix round. A non-positive budget used to HANG rather than fail: the hard-split path does
  // `token.slice(0, maxChars)`, and `slice(0, 0)` is `''`, so `rest` never shrinks and the loop
  // spins forever (a probe hit 100,000 iterations before being killed). A clamp was rejected in
  // favour of throwing, because a silently clamped budget is a bound nobody can see. These tests
  // also serve as termination proofs: if the guard regressed to a clamp-or-spin, they would time
  // out rather than fail fast.
  it.each([0, -1, -650])(
    'throws on a non-positive maxChars (%i) instead of looping forever, and names the offending value',
    (maxChars) => {
      expect(() => splitIntoPageSafeChunks('some text that exceeds any budget', maxChars)).toThrow(
        `splitIntoPageSafeChunks: maxChars must be positive, got ${maxChars}`,
      );
    },
  );

  it('rejects a non-positive maxChars even when the text would short-circuit as already-fitting', () => {
    // `text.length <= maxChars` returns early, so an unguarded implementation would accept a
    // nonsense budget for short input and only blow up later on long input — the guard must come
    // first so the contract is the same for every input.
    expect(() => splitIntoPageSafeChunks('', 0)).toThrow(/maxChars must be positive/);
    expect(() => splitIntoPageSafeChunks('x', -5)).toThrow(/maxChars must be positive/);
  });

  it('accepts the smallest legal budget (1) and still terminates, one character per chunk', () => {
    // Boundary on the legal side of the guard: 1 is the tightest budget that can make progress.
    expect(splitIntoPageSafeChunks('abc', 1)).toEqual(['a', 'b', 'c']);
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

// ─── packUsageCellRows (#1959 fix round) ──────────────────────────────────────────────────────
//
// The bound that makes `dontBreakRows: true` safe now applies to the Usage cell's WHOLE content
// stream (usage prose + the grey areaText/attachmentsNote suffix), because both render in the same
// cell at the same 8pt font. Bounding `usageText` alone is what let #1959 silently drop pages: the
// suffix is unbounded by input (`attachmentsNote` has no maxLength anywhere; `areaText` is
// aggregate-unbounded across N leaf areas), so an over-tall row was measured and then discarded.
//
// These are the packer's own unit tests. Every assertion below is expressed against the INPUT and
// the declared budget, never against the packer's own output, so a packing regression cannot
// satisfy them by moving in step.
describe('packUsageCellRows (#1959 fix round: one page-safe budget for the whole Usage cell)', () => {
  const BUDGET = 20; // small, so the packing rules are legible in the assertions

  function flatten(rows: UsageCellSegment[][]): UsageCellSegment[] {
    return rows.flat();
  }
  function totalText(rows: UsageCellSegment[][]): string {
    return flatten(rows)
      .map((s) => s.text)
      .join('');
  }
  function rowLengths(rows: UsageCellSegment[][]): number[] {
    return rows.map((row) => row.reduce((sum, s) => sum + s.text.length, 0));
  }
  function metaRowIndexes(rows: UsageCellSegment[][]): number[] {
    return rows.flatMap((row, i) => (row.some((s) => s.meta) ? [i] : []));
  }

  // #1959 fix round: same non-positive-budget contract as splitIntoPageSafeChunks (which this
  // delegates to for hard splits, and which would otherwise spin). Throws rather than clamps.
  it.each([0, -1, -650])(
    'throws on a non-positive maxChars (%i) rather than looping or clamping, and names the offending value',
    (maxChars) => {
      expect(() =>
        packUsageCellRows([{ text: 'prose' }, { text: '\nmeta', meta: true }], maxChars),
      ).toThrow(`packUsageCellRows: maxChars must be positive, got ${maxChars}`);
    },
  );

  it('rejects a non-positive maxChars even for an empty stream, which would otherwise short-circuit', () => {
    expect(() => packUsageCellRows([], 0)).toThrow(/maxChars must be positive/);
  });

  it('returns a single row, segments unchanged, when the whole stream fits the budget (the dominant case must not grow rows)', () => {
    const segments: UsageCellSegment[] = [
      { text: 'Kitchen' },
      { text: '\nGround Floor', meta: true },
    ];
    const rows = packUsageCellRows(segments, BUDGET);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(segments);
  });

  it('never exceeds the budget on any row, for a stream far larger than one row', () => {
    const rows = packUsageCellRows(
      [{ text: 'aaa bbb ccc ddd eee fff ggg hhh iii jjj' }, { text: '\nkkk lll mmm', meta: true }],
      BUDGET,
    );
    expect(rows.length).toBeGreaterThan(1);
    for (const length of rowLengths(rows)) {
      expect(length).toBeLessThanOrEqual(BUDGET);
    }
  });

  it('is lossless: concatenating every returned segment reproduces the input stream exactly, whitespace included', () => {
    const prose = 'Materialien und Arbeitsleistung für die Sanierung der Fassade';
    const meta = '\nErdgeschoss · 2 Anhänge: Angebot, Rechnung';
    const rows = packUsageCellRows([{ text: prose }, { text: meta, meta: true }], BUDGET);
    expect(totalText(rows)).toBe(prose + meta);
  });

  it("preserves each segment's own `meta` flag through splitting — prose pieces never become grey and suffix pieces never become body text", () => {
    const prose = 'aaa bbb ccc ddd eee fff ggg hhh';
    const meta = '\niii jjj kkk lll mmm nnn';
    const rows = packUsageCellRows([{ text: prose }, { text: meta, meta: true }], BUDGET);
    const flat = flatten(rows);
    expect(
      flat
        .filter((s) => !s.meta)
        .map((s) => s.text)
        .join(''),
    ).toBe(prose);
    expect(
      flat
        .filter((s) => s.meta)
        .map((s) => s.text)
        .join(''),
    ).toBe(meta);
  });

  it('places the suffix LAST: its final piece always lands on the last row, and no row before the suffix starts carries it', () => {
    const rows = packUsageCellRows(
      [{ text: 'aaa bbb ccc ddd eee fff ggg hhh iii' }, { text: '\njjj kkk', meta: true }],
      BUDGET,
    );
    const metaRows = metaRowIndexes(rows);
    expect(metaRows.length).toBeGreaterThan(0);
    expect(Math.max(...metaRows)).toBe(rows.length - 1);
    // Contiguous: once the suffix starts it never yields back to prose rows.
    expect(metaRows).toEqual(
      Array.from({ length: metaRows.length }, (_, i) => Math.min(...metaRows) + i),
    );
  });

  it('starts a fresh row rather than splitting a suffix that does not fit the leftover but does fit a whole row — keeping the grey run contiguous', () => {
    // Prose 12 chars leaves 8 of a 20-char budget; the 11-char suffix fits a whole row but not the
    // leftover, so it must move down intact rather than be sliced across two rows.
    const rows = packUsageCellRows(
      [{ text: 'aaaa bbb ccc' }, { text: '\ndddd eeee', meta: true }],
      BUDGET,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!.every((s) => !s.meta)).toBe(true);
    expect(rows[1]).toEqual([{ text: '\ndddd eeee', meta: true }]);
  });

  it('splits a suffix genuinely larger than a whole row across as many rows as the budget requires', () => {
    const meta = `\n${'x'.repeat(BUDGET * 3)}`;
    const rows = packUsageCellRows([{ text: 'a' }, { text: meta, meta: true }], BUDGET);
    expect(metaRowIndexes(rows).length).toBeGreaterThan(1);
    expect(totalText(rows)).toBe('a' + meta);
    for (const length of rowLengths(rows)) {
      expect(length).toBeLessThanOrEqual(BUDGET);
    }
  });

  it('flushes cleanly when the prose fills a row EXACTLY, putting the suffix on the next row rather than a zero-space row', () => {
    // 'aaaa bbbb cccc ddddd' is exactly BUDGET (20) characters, so the row is full with zero
    // leftover when the suffix arrives — the `remaining <= 0` boundary. A regression here would
    // either emit an empty row or loop.
    const prose = 'aaaa bbbb cccc ddddd';
    expect(prose.length).toBe(BUDGET);
    const rows = packUsageCellRows([{ text: prose }, { text: '\nEG', meta: true }], BUDGET);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual([{ text: prose }]);
    expect(rows[1]).toEqual([{ text: '\nEG', meta: true }]);
    expect(totalText(rows)).toBe(prose + '\nEG');
    for (const length of rowLengths(rows)) {
      expect(length).toBeGreaterThan(0);
      expect(length).toBeLessThanOrEqual(BUDGET);
    }
  });

  it('keeps an empty usageText as its own (empty) leading segment, so the cell still renders a body run', () => {
    const rows = packUsageCellRows([{ text: '' }, { text: '\nGround Floor', meta: true }], BUDGET);
    expect(rows).toHaveLength(1);
    expect(rows[0]![0]).toEqual({ text: '' });
    expect(rows[0]![1]!.meta).toBe(true);
  });

  it('returns one empty row for an entirely empty stream, never an empty array (callers index row 0 unconditionally)', () => {
    expect(packUsageCellRows([], BUDGET)).toEqual([[{ text: '' }]]);
  });

  it('handles a prose-only stream identically to plain chunking, with no grey segment invented', () => {
    const prose = 'aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk';
    const rows = packUsageCellRows([{ text: prose }], BUDGET);
    expect(totalText(rows)).toBe(prose);
    expect(flatten(rows).some((s) => s.meta)).toBe(false);
    expect(rows.map((r) => r[0]!.text)).toEqual(splitIntoPageSafeChunks(prose, BUDGET));
  });

  it('hard-splits a single whitespace-free token longer than the budget rather than looping forever', () => {
    const token = 'z'.repeat(BUDGET * 2 + 5);
    const rows = packUsageCellRows([{ text: token }], BUDGET);
    expect(totalText(rows)).toBe(token);
    for (const length of rowLengths(rows)) {
      expect(length).toBeLessThanOrEqual(BUDGET);
    }
  });

  it('at the production budget, a realistic short cell is still exactly one row (guards against a regression that paginates ordinary reports)', () => {
    const rows = packUsageCellRows(
      [
        { text: 'Rohbauarbeiten Erdgeschoss inklusive Bodenplatte' },
        { text: '\nErdgeschoss · 1 Anhang: Rechnung', meta: true },
      ],
      MAX_SAFE_USAGE_CHUNK_CHARS,
    );
    expect(rows).toHaveLength(1);
  });
});

// ─── packUsageCellRowsWithMinimum (#1940 AC1/AC2: runt-remainder merge) ───────────────────────
//
// Wraps packUsageCellRows with a floor on every CONTINUATION row's (index >= 1) character count,
// so a would-be runt remainder merges into the row before it instead of rendering as a near-empty
// row indistinguishable from a broken document (#1940 — the "Could Have" deferred from #1929,
// observed twice in a real rendered PDF). Every assertion below is expressed against the INPUT/
// budget/floor, or against a direct packUsageCellRows() call for comparison — never against the
// wrapped function's own prior output — same discipline as the packUsageCellRows block above.
describe('packUsageCellRowsWithMinimum (#1940 AC1/AC2: runt-remainder merge)', () => {
  const BUDGET = 20; // same small budget as the packUsageCellRows block, for legible assertions
  const MIN = 5;

  function flatten(rows: UsageCellSegment[][]): UsageCellSegment[] {
    return rows.flat();
  }
  function totalText(rows: UsageCellSegment[][]): string {
    return flatten(rows)
      .map((s) => s.text)
      .join('');
  }
  function rowLengths(rows: UsageCellSegment[][]): number[] {
    return rows.map((row) => row.reduce((sum, s) => sum + s.text.length, 0));
  }
  // Local word-boundary-clean filler, scoped to this describe block per this file's own
  // convention (see proseOfLength further down, duplicated rather than hoisted-and-shared).
  function fillerOfLength(exactLength: number): string {
    const words = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing'];
    let text = '';
    let i = 0;
    for (;;) {
      const word = words[i % words.length]!;
      const candidate = text.length === 0 ? word : `${text} ${word}`;
      if (candidate.length >= exactLength) return candidate.slice(0, exactLength);
      text = candidate;
      i++;
    }
  }

  it('minTrailingChars <= 0 degrades to a direct packUsageCellRows call — no floor applies', () => {
    const segments: UsageCellSegment[] = [
      { text: 'aaaa bbbb cccc ddddd' },
      { text: '\nEEEEE', meta: true },
    ];
    expect(packUsageCellRowsWithMinimum(segments, BUDGET, 0)).toEqual(
      packUsageCellRows(segments, BUDGET),
    );
    expect(packUsageCellRowsWithMinimum(segments, BUDGET, -3)).toEqual(
      packUsageCellRows(segments, BUDGET),
    );
  });

  it('minTrailingChars >= maxChars degrades to a direct packUsageCellRows call — a floor that would consume the whole budget is not a floor', () => {
    const segments: UsageCellSegment[] = [
      { text: 'aaaa bbbb cccc ddddd' },
      { text: '\nEEEEE', meta: true },
    ];
    expect(packUsageCellRowsWithMinimum(segments, BUDGET, BUDGET)).toEqual(
      packUsageCellRows(segments, BUDGET),
    );
    expect(packUsageCellRowsWithMinimum(segments, BUDGET, BUDGET + 10)).toEqual(
      packUsageCellRows(segments, BUDGET),
    );
  });

  it("propagates packUsageCellRows's non-positive-maxChars throw rather than the degenerate-minTrailingChars guard swallowing it", () => {
    const segments: UsageCellSegment[] = [{ text: 'x' }];
    expect(() => packUsageCellRowsWithMinimum(segments, 0, MIN)).toThrow(
      'packUsageCellRows: maxChars must be positive, got 0',
    );
    expect(() => packUsageCellRowsWithMinimum(segments, -1, MIN)).toThrow(
      'packUsageCellRows: maxChars must be positive, got -1',
    );
  });

  it('fast-path preservation, single row: content of exactly maxChars returns EXACTLY what packUsageCellRows returns (deep equality, not merely "one row")', () => {
    const segments: UsageCellSegment[] = [{ text: 'a'.repeat(BUDGET) }];
    expect(packUsageCellRowsWithMinimum(segments, BUDGET, MIN)).toEqual(
      packUsageCellRows(segments, BUDGET),
    );
  });

  it('fast-path preservation, multi-row no-runt: two healthy rows come back unchanged — proves the fix path never engages when unneeded', () => {
    const segments: UsageCellSegment[] = [
      { text: 'aaaa bbbb cccc ddddd' }, // exactly BUDGET (20 chars): one full row
      { text: '\nEEEEE', meta: true }, // 6 chars, >= MIN(5): not a runt
    ];
    const raw = packUsageCellRows(segments, BUDGET);
    expect(raw).toHaveLength(2);
    expect(rowLengths(raw)[1]).toBeGreaterThanOrEqual(MIN); // sanity: this fixture has no runt
    expect(packUsageCellRowsWithMinimum(segments, BUDGET, MIN)).toEqual(raw);
  });

  it("the pathological single-token case: a token of length 2*maxChars + 1 hard-splits to [maxChars, maxChars, 1] under plain packing (today's runt) — the wrapped function leaves no row after the first under MIN, and every row stays <= maxChars", () => {
    const token = 'z'.repeat(BUDGET * 2 + 1); // 41 chars
    const segments: UsageCellSegment[] = [{ text: token }];

    // Document the exact pre-fix pathology this AC exists to close.
    const raw = packUsageCellRows(segments, BUDGET);
    expect(rowLengths(raw)).toEqual([BUDGET, BUDGET, 1]);

    const rows = packUsageCellRowsWithMinimum(segments, BUDGET, MIN);
    for (const length of rowLengths(rows).slice(1)) {
      expect(length).toBeGreaterThanOrEqual(MIN);
    }
    for (const length of rowLengths(rows)) {
      expect(length).toBeLessThanOrEqual(BUDGET);
    }
    expect(totalText(rows)).toBe(token); // I1 still holds
  });

  it('a MID-list runt (not merely trailing) is also eliminated: a short word stranded alone between two full-width rows', () => {
    // 'A'x20 fills row 0 exactly; the leftover ' hi ' (4 chars, < MIN) doesn't fit alongside the
    // next token ('B'x18, itself <= BUDGET) but DOES fit a row of its own, so plain packing stands
    // it up as its own near-empty row — sandwiched between two full rows, not at the tail.
    const text = 'A'.repeat(BUDGET) + ' hi ' + 'B'.repeat(18);
    const segments: UsageCellSegment[] = [{ text }];

    const raw = packUsageCellRows(segments, BUDGET);
    expect(raw).toHaveLength(3);
    const rawLengths = rowLengths(raw);
    expect(rawLengths[1]).toBeLessThan(MIN); // confirms the runt sits at index 1
    expect(raw.length - 1).toBeGreaterThan(1); // 1 < rows.length - 1: genuinely mid-list, not trailing

    const rows = packUsageCellRowsWithMinimum(segments, BUDGET, MIN);
    for (const length of rowLengths(rows).slice(1)) {
      expect(length).toBeGreaterThanOrEqual(MIN);
    }
    for (const length of rowLengths(rows)) {
      expect(length).toBeLessThanOrEqual(BUDGET);
    }
    expect(totalText(rows)).toBe(text);
  });

  describe('I1: reconstruction holds across every fixture above, plus one carrying a meta segment', () => {
    it.each<[string, UsageCellSegment[]]>([
      ['exact-fit single row', [{ text: 'a'.repeat(BUDGET) }]],
      ['multi-row no-runt', [{ text: 'aaaa bbbb cccc ddddd' }, { text: '\nEEEEE', meta: true }]],
      ['pathological hard-split token', [{ text: 'z'.repeat(BUDGET * 2 + 1) }]],
      ['mid-list runt', [{ text: 'A'.repeat(BUDGET) + ' hi ' + 'B'.repeat(18) }]],
      [
        'mid-list runt shape with a trailing meta segment',
        [
          { text: 'A'.repeat(BUDGET) + ' hi ' + 'B'.repeat(18) },
          { text: '\nGround Floor', meta: true },
        ],
      ],
    ])('%s', (_label, segments) => {
      const expected = segments.map((s) => s.text).join('');
      const rows = packUsageCellRowsWithMinimum(segments, BUDGET, MIN);
      expect(totalText(rows)).toBe(expected);
    });
  });

  it('property-style sweep: for total lengths stepping from maxChars - minTrailingChars up to maxChars * 4, NO row after the first is EVER < minTrailingChars, and NO row EVER exceeds maxChars', () => {
    for (let len = BUDGET - MIN; len <= BUDGET * 4; len++) {
      const text = fillerOfLength(len);
      const segments: UsageCellSegment[] = [{ text }];
      const rows = packUsageCellRowsWithMinimum(segments, BUDGET, MIN);
      for (const length of rowLengths(rows).slice(1)) {
        expect(length).toBeGreaterThanOrEqual(MIN);
      }
      for (const length of rowLengths(rows)) {
        expect(length).toBeLessThanOrEqual(BUDGET);
      }
    }
  });
});

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
      const overviewResult = buildOverviewContent(overviewContent, new Map());
      const overviewTable = getTable(overviewResult);
      const overviewCell = (overviewTable.body[1] as unknown[])[6] as {
        text: { text: string; wordBreak?: string }[];
      };
      expect(overviewCell.text.some((run) => run.wordBreak === 'break-all')).toBe(true);

      const claimContent = makeContent({ isOverview: false, rows: [row] });
      const claimResult = buildOverviewContent(claimContent, new Map());
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
    const result = buildOverviewContent(content, new Map());
    const table = getTable(result);
    const vendorHeaderCell = (table.body[0] as unknown[])[0] as {
      text: { text: string; wordBreak?: string }[];
    };
    expect(runsText(vendorHeaderCell.text)).toBe('Auftragnehmer');
    expect(vendorHeaderCell.text.some((run) => run.wordBreak === 'break-all')).toBe(true);
  });

  it('[HIGH1] "Rechnungsbetrag" (15 chars, invoiceAmount header, 48pt column) is flagged for word-break — measured 78.66pt against the 48pt column', () => {
    const content = makeContent({ isOverview: true, labels: makeGermanLabels() });
    const result = buildOverviewContent(content, new Map());
    const table = getTable(result);
    const invoiceAmountHeaderCell = (table.body[0] as unknown[])[4] as {
      text: { text: string; wordBreak?: string }[];
    };
    expect(runsText(invoiceAmountHeaderCell.text)).toBe('Rechnungsbetrag');
    expect(invoiceAmountHeaderCell.text.some((run) => run.wordBreak === 'break-all')).toBe(true);
  });

  it('[HIGH1] "Zugeordneter Betrag" (allocatedAmount header, 75pt column): each word\'s own token-level flag reflects the conservative worst-case estimate exactly — "Betrag" (6 chars) fits under the 8-char header threshold and is NOT flagged; "Zugeordneter" (12 chars) exceeds it and IS flagged even though its real measured width (60.42pt) fits the 75pt column on its own — over-flagging here is the designed-harmless case (see buildHeaderCell/buildUsageTextRuns doc comments), not a bug: break-all only forces a MID-CHARACTER split when a token does not fit on one line by itself, which "Zugeordneter" does. The real-render test in realRender.test.ts confirms this never visually force-breaks the word.', () => {
    const content = makeContent({ isOverview: true, labels: makeGermanLabels() });
    const result = buildOverviewContent(content, new Map());
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
    const result = buildOverviewContent(content, new Map());
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
    const result = buildOverviewContent(content, new Map());
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
    const result = buildOverviewContent(content, new Map());
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
    const result = buildOverviewContent(content, new Map());
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
    const result = buildOverviewContent(content, new Map());
    const table = getTable(result);
    expect(rowTexts(table.body[1])).not.toContain('sources.lines.invoiceStatus.pending');
  });

  it('renders every row in reportContent.rows, in order, with no independent filtering', () => {
    const rows = [
      makeRow({ invoiceId: 'inv-1', vendor: 'First' }),
      makeRow({ invoiceId: 'inv-2', vendor: 'Second' }),
    ];
    const content = makeContent({ rows });
    const result = buildOverviewContent(content, new Map());
    const table = getTable(result);
    expect(rowTexts(table.body[1])[0]).toBe('First');
    expect(rowTexts(table.body[2])[0]).toBe('Second');
  });

  describe('refund-adjustment rows: color and no sign negation', () => {
    it('renders the invoice amount with the refund text color', () => {
      const row = makeRow({ isRefund: true, invoiceAmountText: '€200.00' });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map());
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
      const result = buildOverviewContent(content, new Map());
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toBe('€-200.00 (refund)');
      const rawRow = table.body[1] as { color?: string }[];
      expect(rawRow[4]!.color).toBe('#991b1b');
    });

    it('does not apply the refund color or note for a non-refund row', () => {
      const row = makeRow({ isRefund: false, allocatedAmountValueText: '€500.00' });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map());
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toBe('€500.00');
      const rawRow = table.body[1] as { color?: string }[];
      expect(rawRow[4]!.color).toBeUndefined();
    });
  });

  describe('Usage cell: plain text vs inline grey meta text', () => {
    it('renders a plain { text } cell (not a stack) with NO grey meta run when both areaText and attachmentsNote are null', () => {
      const row = makeRow({ usageText: 'Kitchen work', areaText: null, attachmentsNote: null });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map());
      const table = getTable(result);
      const cell = (table.body[1] as unknown[])[5] as { text?: unknown; stack?: unknown };
      expect(cell.stack).toBeUndefined();
      const { usageText, metaRun } = splitUsageCell(cell);
      expect(usageText).toBe('Kitchen work');
      expect(metaRun).toBeNull();
      // header (1) + 1 usage row + 1 summary row = 3 — no continuation rows.
      expect(table.body).toHaveLength(3);
    });

    it('#1959: appends attachmentsNote as a trailing grey newline-prefixed run INSIDE the usage cell (not a stack sub-row, not a separate row)', () => {
      const row = makeRow({ usageText: 'Kitchen work', attachmentsNote: '1 attachment: Invoice' });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map());
      const table = getTable(result);
      const cell = (table.body[1] as unknown[])[5] as { text: unknown; stack?: unknown };
      expect(cell.stack).toBeUndefined();
      const { usageText, metaRun } = splitUsageCell(cell);
      // The usage prose itself is untouched — the note is NOT folded into it.
      expect(usageText).toBe('Kitchen work');
      expect(usageText).not.toContain('1 attachment: Invoice');
      // ...and the note IS present, as the grey suffix run, newline-separated from the prose.
      expect(metaRun).not.toBeNull();
      expect(metaRun!.text).toBe('\n1 attachment: Invoice');
      expect(metaRun!.color).toBe(GREY);
      // The whole thing stays in ONE row — no continuation row is emitted for the note.
      expect(table.body).toHaveLength(3);
    });

    it('#1959 AC5.2: joins areaText and attachmentsNote with " · " in a single trailing grey run, area first', () => {
      const row = makeRow({
        usageText: 'Kitchen work',
        areaText: 'Ground Floor',
        attachmentsNote: '1 attachment: Invoice',
      });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map());
      const table = getTable(result);
      const cell = (table.body[1] as unknown[])[5] as { text: unknown };
      const { usageText, metaRun } = splitUsageCell(cell);
      expect(usageText).toBe('Kitchen work');
      // Exact string pins the order (area before note), the separator, and the newline prefix —
      // any of those changing is a visible regression in the rendered PDF.
      expect(metaRun).not.toBeNull();
      expect(metaRun!.text).toBe('\nGround Floor · 1 attachment: Invoice');
      expect(metaRun!.color).toBe(GREY);
    });

    it('#1959: renders areaText alone in the trailing grey run when attachmentsNote is null (no separator, no empty piece)', () => {
      const row = makeRow({
        usageText: 'Kitchen work',
        areaText: 'Ground Floor',
        attachmentsNote: null,
      });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map());
      const table = getTable(result);
      const cell = (table.body[1] as unknown[])[5] as { text: unknown; stack?: unknown };
      expect(cell.stack).toBeUndefined();
      const { usageText, metaRun } = splitUsageCell(cell);
      expect(usageText).toBe('Kitchen work');
      expect(metaRun).not.toBeNull();
      expect(metaRun!.text).toBe('\nGround Floor');
      // No dangling separator from the absent attachmentsNote.
      expect(metaRun!.text).not.toContain('·');
      expect(metaRun!.color).toBe(GREY);
    });

    it('[#1929 round 2] the plain-cell Usage text is a run array of the individual whitespace-preserving tokens (buildUsageTextRuns wiring, not a plain string)', () => {
      const row = makeRow({ usageText: 'Kitchen work', attachmentsNote: null });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map());
      const table = getTable(result);
      const cell = (table.body[1] as unknown[])[5] as { text: { text: string }[] };
      expect(Array.isArray(cell.text)).toBe(true);
      expect(cell.text.map((run) => run.text)).toEqual(['Kitchen', ' ', 'work']);
    });
  });

  describe('allocated cell composition (skip markers + inline labels + refund note)', () => {
    it('renders allocatedAmountValueText plain when there are no markers and not a refund', () => {
      const row = makeRow({ allocatedAmountValueText: '€400.00' });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map());
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toBe('€400.00');
    });

    it('appends inline isSplit label when isSplit=true', () => {
      const row = makeRow({ allocatedAmountValueText: '€400.00', isSplit: true });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map());
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toContain('€400.00');
      expect(rowTexts(table.body[1])[4]).toContain('sourceReports.table.splitInlineLabel');
    });

    it('appends inline isDepositReduced label when isDepositReduced=true', () => {
      const row = makeRow({ allocatedAmountValueText: '€400.00', isDepositReduced: true });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map());
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toContain('€400.00');
      expect(rowTexts(table.body[1])[4]).toContain('sourceReports.table.depositReducedInlineLabel');
    });

    it('prepends skip-footnote markers (*N) before the allocated value, numbered from skippedDocuments', () => {
      const row = makeRow({ invoiceId: 'inv-1', allocatedAmountValueText: '€400.00' });
      const content = makeContent({ rows: [row] });
      const skipped = new Map<string, ReportSkipReason[]>([['inv-1', ['footnoteFetchFailed']]]);
      const result = buildOverviewContent(content, skipped);
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toBe('€400.00*1');
    });

    it('numbers multiple skip reasons on the same invoice sequentially', () => {
      const row = makeRow({ invoiceId: 'inv-1', allocatedAmountValueText: '€400.00' });
      const content = makeContent({ rows: [row] });
      const skipped = new Map<string, ReportSkipReason[]>([
        ['inv-1', ['footnoteFetchFailed', 'footnoteInvalidPdf']],
      ]);
      const result = buildOverviewContent(content, skipped);
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toBe('€400.00*1*2');
    });
  });

  describe('allocated cell: isDeposit inline label (AC2.1)', () => {
    it('renders the allocated cell text as an array of runs when isDeposit is true', () => {
      const row = makeRow({ allocatedAmountValueText: '€300.00', isDeposit: true });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map());
      const table = getTable(result);
      const cell = (table.body[1] as unknown[])[4] as { text: unknown };
      expect(Array.isArray(cell.text)).toBe(true);
    });

    it('the second run carries the deposit label, gray color and small fontSize', () => {
      const row = makeRow({ allocatedAmountValueText: '€300.00', isDeposit: true });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map());
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
      const result = buildOverviewContent(content, new Map());
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
    const result = buildOverviewContent(content, new Map());
    const table = getTable(result);
    // header (1) + exactly 1 row for this invoice + 1 summary row = 3
    expect(table.body).toHaveLength(3);
    expect(rowTexts(table.body[1])[0]).toBe('Only Row');
  });

  it('[scenario 9] usageText below MAX_SAFE_USAGE_CHUNK_CHARS also produces exactly one row', () => {
    const usageText = proseOfLength(MAX_SAFE_USAGE_CHUNK_CHARS - 1);
    const row = makeRow({ invoiceId: 'inv-1', vendor: 'Only Row', usageText });
    const content = makeContent({ rows: [row] });
    const result = buildOverviewContent(content, new Map());
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
    const result = buildOverviewContent(content, new Map());
    const table = getTable(result);

    // Derive the expected chunk count from the SAME formula buildOverviewContent itself calls
    // (#1940 AC1: packUsageCellRowsWithMinimum, not the bare splitIntoPageSafeChunks a runt-merge
    // fix can change the row count of) rather than a naive Math.ceil(len/maxChars) — this test's
    // job is to verify buildOverviewContent WIRES that packer's output into the right row shapes,
    // not to re-derive the packing algorithm's own output. isOverview: true above -> 7-column
    // shape -> USAGE_SAFE_TOKEN_CHARS_7COL is the right per-line floor input.
    const expectedChunks = packUsageCellRowsWithMinimum(
      [{ text: usageText }],
      MAX_SAFE_USAGE_CHUNK_CHARS,
      Math.max(MIN_CONTINUATION_ROW_FLOOR_CHARS, USAGE_SAFE_TOKEN_CHARS_7COL),
    ).length;
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
    // non-empty text (marker-stripped — #1940 AC5 prepends '… ' to every continuation row, see
    // stripContinuationMarker).
    for (const contRow of longRows.slice(1)) {
      const texts = rowTexts(contRow, { isContinuation: true });
      expect(texts.slice(0, 6)).toEqual(['', '', '', '', '', '']);
      expect(texts[6]).toBeTruthy();
    }

    // I1: concatenating every chunk row's Usage text, in table order, reproduces the ORIGINAL
    // usageText exactly — no character (including inter-chunk whitespace) is dropped. Row 0 is
    // never a continuation row (isContinuation: i > 0), so its marker-free text stays as-is.
    const reconstructed = longRows
      .map((r, i) => rowTexts(r, { isContinuation: i > 0 })[6])
      .join('');
    expect(reconstructed).toBe(usageText);

    // The next invoice's own (unrelated) row must still be present and unaffected, immediately
    // after the chunked invoice's rows.
    const nextRow = table.body[1 + expectedChunks] as Record<string, unknown>[];
    expect(rowTexts(nextRow)[0]).toBe('Next Vendor');
  });

  it('[scenario 11, #1959 fix round] areaText/attachmentsNote render as ONE inline grey suffix on the LAST usageText row — never mid-prose, never repeated, appearing exactly once', () => {
    const usageText = proseOfLength(MAX_SAFE_USAGE_CHUNK_CHARS * 3);
    const row = makeRow({
      invoiceId: 'inv-1',
      vendor: 'Chunked Vendor',
      usageText,
      areaText: 'Ground Floor',
      attachmentsNote: '1 attachment: Invoice',
    });
    const content = makeContent({ rows: [row] });
    const result = buildOverviewContent(content, new Map());
    const table = getTable(result);

    // Row count is driven by `packUsageCellRowsWithMinimum` over the WHOLE cell stream (prose +
    // suffix) — the same formula buildOverviewContent itself calls (#1940 AC1), not the bare
    // packUsageCellRows a runt-merge fix can change the row count of. isOverview defaults false
    // above -> 6-column (claim) shape -> USAGE_SAFE_TOKEN_CHARS_6COL is the right per-line floor.
    const expectedRows = packUsageCellRowsWithMinimum(
      [{ text: usageText }, { text: '\nGround Floor · 1 attachment: Invoice', meta: true }],
      MAX_SAFE_USAGE_CHUNK_CHARS,
      Math.max(MIN_CONTINUATION_ROW_FLOOR_CHARS, USAGE_SAFE_TOKEN_CHARS_6COL),
    ).length;
    expect(expectedRows).toBeGreaterThan(1);
    // header (1) + packed rows + summary row (1).
    expect(table.body).toHaveLength(1 + expectedRows + 1);

    const usageRows = table.body.slice(1, 1 + expectedRows) as unknown[][];

    // PLACEMENT (changed deliberately in the fix round): the suffix trails the prose, so it sits on
    // the LAST row — not row 0. Pinning it to row 0 rendered grey meta text mid-prose with more
    // usage text below it, and forced the prose's own chunk boundary to shrink to make room.
    // usageRows.length === expectedRows > 1, so the last row is always index >= 1 (a continuation
    // row) — strip its #1940 AC5 marker before inspecting.
    const lastRow = usageRows[usageRows.length - 1]!;
    const lastCell = lastRow[lastRow.length - 1] as { text: unknown; stack?: unknown };
    expect(lastCell.stack).toBeUndefined();
    const last = splitUsageCell(lastCell, { isContinuation: true });
    expect(last.metaRun).not.toBeNull();
    expect(last.metaRun!.text).toBe('\nGround Floor · 1 attachment: Invoice');
    expect(last.metaRun!.color).toBe(GREY);

    // Every EARLIER row is pure prose — the suffix is neither duplicated nor emitted early. Row 0
    // (index 0 of usageRows) is never a continuation row; any further "earlier" row (index >= 1,
    // possible when expectedRows > 2) is.
    usageRows.slice(0, -1).forEach((earlierRow, i) => {
      const cell = earlierRow[earlierRow.length - 1] as { text: unknown; stack?: unknown };
      expect(cell.stack).toBeUndefined();
      expect(splitUsageCell(cell, { isContinuation: i > 0 }).metaRun).toBeNull();
    });

    // I1 (no character is ever lost): concatenating only the usageText PORTION of every row's cell
    // — i.e. excluding the grey meta suffix AND the #1940 marker — reproduces the original
    // usageText exactly. This is what proves the inline suffix didn't displace or truncate any
    // prose, and that the marker (render-time decoration only) never enters the reconstruction.
    const reconstructed = usageRows
      .map((r, i) => splitUsageCell(r[r.length - 1], { isContinuation: i > 0 }).usageText)
      .join('');
    expect(reconstructed).toBe(usageText);

    // Every row's Usage cell stays within the ONE page-safe budget — the bound that makes
    // `dontBreakRows: true` safe. Asserted against the constant, not the packer's own output.
    usageRows.forEach((usageRow, i) => {
      const { usageText: prose, metaRun } = splitUsageCell(usageRow[usageRow.length - 1], {
        isContinuation: i > 0,
      });
      expect(prose.length + (metaRun?.text.length ?? 0)).toBeLessThanOrEqual(
        MAX_SAFE_USAGE_CHUNK_CHARS,
      );
    });

    // areaText/attachmentsNote text appears EXACTLY once across the WHOLE table — no duplication
    // onto other rows, no leakage into the summary row.
    const wholeUsageColumn = table.body
      .map((r) => usageRunsText((r[r.length - 1] as { text?: unknown })?.text))
      .join(' ');
    expect(wholeUsageColumn.split('Ground Floor')).toHaveLength(2);
    expect(wholeUsageColumn.split('1 attachment: Invoice')).toHaveLength(2);
  });

  it('[#1959 fix round] when the suffix gets a row of ITS OWN, its leading newline is dropped — the separator must not render as a blank first line in that cell', () => {
    // 645 chars of prose fits one 650-char row with only 5 to spare, so the 37-char suffix cannot
    // share it but does fit a row of its own: it becomes the FIRST (and only) run of the next
    // row's cell. There the '\n' has nothing to separate it from and would render an empty line.
    const usageText = proseOfLength(645);
    const row = makeRow({
      invoiceId: 'inv-1',
      usageText,
      areaText: 'Ground Floor',
      attachmentsNote: '1 attachment: Invoice',
    });
    const table = getTable(buildOverviewContent(makeContent({ rows: [row] }), new Map()));

    // header (1) + prose row + suffix-only row + summary (1).
    expect(table.body).toHaveLength(4);

    // Row 0 (the prose row) is never a continuation row — no #1940 marker.
    const proseRow = splitUsageCell((table.body[1] as unknown[])[5]);
    expect(proseRow.usageText).toBe(usageText);
    expect(proseRow.metaRun).toBeNull();

    // Row 1 (the suffix-only row) IS a continuation row. #1940 trace: this exact 645+37 fixture
    // does NOT trigger AC1's runt-merge repack — packUsageCellRowsWithMinimum(6-col shape,
    // minTrailingChars=22) packs the 37-char suffix into its own row at full budget already (37 >=
    // 22, no runt), so packUsageCellRowsWithMinimum returns byte-identical row boundaries to plain
    // packUsageCellRows here. The marker is still unconditionally prepended by buildUsageCell for
    // every row index >= 1 regardless of whether AC1's merge fired — assert that directly first.
    const suffixCellRaw = (table.body[2] as unknown[])[5] as {
      text: { text: string; color?: string }[];
    };
    expect(suffixCellRaw.text[0]).toEqual({ text: '… ' });

    const suffixRow = splitUsageCell((table.body[2] as unknown[])[5], { isContinuation: true });
    // Body portion is the empty run buildUsageTextRuns emits for an absent prose segment (after
    // the marker itself is stripped).
    expect(suffixRow.usageText).toBe('');
    expect(suffixRow.metaRun).not.toBeNull();
    // NO leading newline — this is the whole point of the assertion.
    expect(suffixRow.metaRun!.text).toBe('Ground Floor · 1 attachment: Invoice');
    expect(suffixRow.metaRun!.text.startsWith('\n')).toBe(false);
    expect(suffixRow.metaRun!.color).toBe(GREY);
  });

  it('[#1959 fix round] a short usage cell whose prose + suffix fit ONE page-safe row still emits exactly one row, suffix inline and last — the dominant case, unchanged by packing', () => {
    const row = makeRow({
      invoiceId: 'inv-1',
      usageText: 'Kitchen work',
      areaText: 'Ground Floor',
      attachmentsNote: '1 attachment: Invoice',
    });
    const content = makeContent({ rows: [row] });
    const table = getTable(buildOverviewContent(content, new Map()));

    // header (1) + exactly ONE data row + summary (1) — packing must not add rows when the whole
    // cell already fits, or every ordinary report would grow spurious continuation rows.
    expect(table.body).toHaveLength(3);
    const { usageText, metaRun } = splitUsageCell((table.body[1] as unknown[])[5]);
    expect(usageText).toBe('Kitchen work');
    expect(metaRun).not.toBeNull();
    expect(metaRun!.text).toBe('\nGround Floor · 1 attachment: Invoice');
    expect(metaRun!.color).toBe(GREY);
  });

  it('[#1968 regression] a space-containing meta suffix produces multiple grey runs — proves per-token emission, not the pre-fix single-run fallback', () => {
    // 'Ground Floor' has a space. buildUsageTextRuns splits it: ['\n', 'Ground', ' ', 'Floor'].
    // Pre-#1968 the entire suffix was ONE run — greyRuns.length === 1. Post-fix: > 1.
    // This is the structural assertion the "revert the production hunk" test checks.
    const row = makeRow({ invoiceId: 'inv-1', usageText: 'x', areaText: 'Ground Floor' });
    const table = getTable(buildOverviewContent(makeContent({ rows: [row] }), new Map()));
    const dataRows = table.body.slice(1, table.body.length - 1) as unknown[][];
    const lastRow = dataRows[dataRows.length - 1]!;
    const { greyRuns } = splitUsageCell(lastRow[lastRow.length - 1]);
    expect(greyRuns.length).toBeGreaterThan(1);
  });

  it('[#1968 regression] a single over-wide space-free token in the meta suffix gets wordBreak: break-all on the grey run', () => {
    // 'W'.repeat(30) exceeds both USAGE_SAFE_TOKEN_CHARS thresholds (7-col: 19, 6-col: 26).
    // Pre-#1968, the run had no wordBreak property (single-run emit, bypassing buildUsageTextRuns).
    // Post-fix, buildUsageTextRuns sees a token longer than safeTokenChars and flags it.
    const overWideToken = 'W'.repeat(30);
    const row = makeRow({ invoiceId: 'inv-1', usageText: 'x', areaText: overWideToken });
    const table = getTable(buildOverviewContent(makeContent({ rows: [row] }), new Map()));
    const dataRows = table.body.slice(1, table.body.length - 1) as unknown[][];
    const lastRow = dataRows[dataRows.length - 1]!;
    const { greyRuns } = splitUsageCell(lastRow[lastRow.length - 1]);
    expect(greyRuns.length).toBeGreaterThan(0);
    expect(greyRuns.some((r) => r.wordBreak === 'break-all')).toBe(true);
  });
});

describe('AC5 (#1940): the "… " continuation marker — placement and exact run shape', () => {
  it('(a) multiple continuation rows, no meta suffix: row 0 never starts with the marker; every row i>=1 starts with EXACTLY { text: "… " } — no color, bold, or fontSize', () => {
    const usageText = proseOfLength(MAX_SAFE_USAGE_CHUNK_CHARS * 5);
    const row = makeRow({ invoiceId: 'inv-1', vendor: 'Marker Vendor', usageText });
    const content = makeContent({ rows: [row] }); // isOverview default false -> 6-column shape
    const table = getTable(buildOverviewContent(content, new Map()));

    const expectedRows = packUsageCellRowsWithMinimum(
      [{ text: usageText }],
      MAX_SAFE_USAGE_CHUNK_CHARS,
      Math.max(MIN_CONTINUATION_ROW_FLOOR_CHARS, USAGE_SAFE_TOKEN_CHARS_6COL),
    ).length;
    expect(expectedRows).toBeGreaterThan(1);

    const usageRows = table.body.slice(1, 1 + expectedRows) as { text: unknown }[][];

    const row0Cell = usageRows[0]![usageRows[0]!.length - 1] as {
      text: { text: string; color?: string }[];
    };
    expect(row0Cell.text[0]!.text).not.toBe('… ');

    for (const contRow of usageRows.slice(1)) {
      const cell = contRow[contRow.length - 1] as {
        text: { text: string; color?: string; bold?: boolean; fontSize?: number }[];
      };
      // Exact run shape — not just "starts with the right text" but no stray styling either.
      expect(cell.text[0]).toEqual({ text: '… ' });
    }
  });

  it('(b) the meta-suffix-on-its-own-row case: the marker still comes first, then the grey run whose text no longer starts with "\\n"', () => {
    const usageText = proseOfLength(645);
    const row = makeRow({
      invoiceId: 'inv-1',
      usageText,
      areaText: 'Ground Floor',
      attachmentsNote: '1 attachment: Invoice',
    });
    const table = getTable(buildOverviewContent(makeContent({ rows: [row] }), new Map()));

    const suffixCell = (table.body[2] as unknown[])[5] as {
      text: { text: string; color?: string }[];
    };
    expect(suffixCell.text[0]).toEqual({ text: '… ' });
    expect(suffixCell.text[1]!.color).toBe(GREY);
    expect(suffixCell.text[1]!.text.startsWith('\n')).toBe(false);
  });
});

describe('AC8 (#1940): content at/below the zero-degradation range never produces a continuation row', () => {
  it('MAX_SAFE_USAGE_CHUNK_CHARS characters still yields exactly ONE row for the 7-column shape — unchanged by the runt-merge fix', () => {
    const usageText = proseOfLength(MAX_SAFE_USAGE_CHUNK_CHARS);
    const row = makeRow({ usageText });
    const content = makeContent({ isOverview: true, rows: [row] });
    const table = getTable(buildOverviewContent(content, new Map()));
    // header (1) + exactly 1 row + 1 summary row.
    expect(table.body).toHaveLength(3);
  });

  it('600 characters yields exactly ONE row at the widest legal subset ({allocatedAmount, usage}) — derived via computeColumnWidths, not hand-computed', () => {
    const { widths } = computeColumnWidths(['allocatedAmount', 'usage']);
    // Sanity: this subset's Usage width really is wider than the 7-column reference (a real,
    // legal #1973 subset, not an invented one) — a failure here means the fixture premise
    // ("widest legal subset") silently stopped holding, not that AC8 broke.
    expect(widths.usage!).toBeGreaterThan(USAGE_WIDTH_7COL);
    const usageChunkChars = usageChunkCharsForWidth(widths.usage!);
    // usageChunkCharsForWidth's one-sided clamp (AC 3.7) means a WIDER subset never exceeds
    // MAX_SAFE_USAGE_CHUNK_CHARS — confirmed directly rather than assumed >= 600.
    expect(usageChunkChars).toBe(MAX_SAFE_USAGE_CHUNK_CHARS);

    const usageText = proseOfLength(600);
    const row = makeRow({ usageText });
    const hiddenColumns = new Set<ReportColumnKey>([
      'vendor',
      'invoiceNumber',
      'date',
      'status',
      'invoiceAmount',
    ]);
    const content = makeContent({ isOverview: true, rows: [row] });
    const table = getTable(buildOverviewContent(content, new Map(), hiddenColumns));

    // Confirm the subset genuinely rendered as {allocatedAmount, usage} — not silently something
    // wider — so this test can't pass vacuously if the hidden-set derivation above were wrong.
    expect(table.widths).toHaveLength(2);
    // header (1) + exactly 1 row. No leading column and no invoiceAmount column survive at this
    // subset, so summary rows render as a separate stack block below the table (Tier 3, R2) rather
    // than a table row — table.body has no third row to account for here.
    expect(table.body).toHaveLength(2);
  });
});

describe('AC2 (#1940): every emitted row still fits the page-safe ceiling after the runt merge', () => {
  it('a token engineered to hard-split into a runt at the 7-column shape: every row (marker excluded) stays within usageChunkChars, and no continuation row drops below minTrailingUsageChars', () => {
    const { widths } = computeColumnWidths(reportColumnsForUseCase(true) as ReportColumnKey[]);
    const usageChunkChars = usageChunkCharsForWidth(widths.usage!);
    // Two deliberately distinct jobs, not a redundant pair: usageSafeTokenCharsForWidth does the
    // main work of guaranteeing a merged runt fills one real line at THIS subset's width;
    // MIN_CONTINUATION_ROW_FLOOR_CHARS is the absolute fallback floor for subsets where that
    // per-line figure is itself small. Do not collapse this to either operand alone.
    const minTrailingUsageChars = Math.max(
      MIN_CONTINUATION_ROW_FLOOR_CHARS,
      usageSafeTokenCharsForWidth(widths.usage!),
    );

    // Today's exact pathology: a whitespace-free run of 2*usageChunkChars + 1 hard-splits to
    // [usageChunkChars, usageChunkChars, 1] under plain packing — a 1-character runt row.
    const token = 'z'.repeat(usageChunkChars * 2 + 1);
    const row = makeRow({ usageText: token });
    const content = makeContent({ isOverview: true, rows: [row] });
    const table = getTable(buildOverviewContent(content, new Map()));

    const dataRows = table.body.slice(1, table.body.length - 1) as unknown[][];
    expect(dataRows.length).toBeGreaterThan(1);

    let reconstructed = '';
    dataRows.forEach((r, i) => {
      const { usageText } = splitUsageCell(r[r.length - 1], { isContinuation: i > 0 });
      reconstructed += usageText;
      expect(usageText.length).toBeLessThanOrEqual(usageChunkChars);
      if (i > 0) {
        expect(usageText.length).toBeGreaterThanOrEqual(minTrailingUsageChars);
      }
    });
    expect(reconstructed).toBe(token);
  });

  it('AC4 regression: a whitespace-free run of usageChunkChars * 3 still terminates, every row <= usageChunkChars, and reconstructs exactly', () => {
    const { widths } = computeColumnWidths(reportColumnsForUseCase(true) as ReportColumnKey[]);
    const usageChunkChars = usageChunkCharsForWidth(widths.usage!);
    const token = 'q'.repeat(usageChunkChars * 3);
    const row = makeRow({ usageText: token });
    const content = makeContent({ isOverview: true, rows: [row] });
    const table = getTable(buildOverviewContent(content, new Map()));

    const dataRows = table.body.slice(1, table.body.length - 1) as unknown[][];
    let reconstructed = '';
    dataRows.forEach((r, i) => {
      const { usageText } = splitUsageCell(r[r.length - 1], { isContinuation: i > 0 });
      reconstructed += usageText;
      expect(usageText.length).toBeLessThanOrEqual(usageChunkChars);
    });
    expect(reconstructed).toBe(token);
  });
});

describe('buildOverviewContent — AC14: falsy statusText never produces a malformed row (scenario 12)', () => {
  it('an overview row with statusText: "" still produces a 7-cell row with an empty-text status cell, and does not throw', () => {
    const row = makeRow({ statusText: '' });
    const content = makeContent({ isOverview: true, rows: [row] });
    expect(() => buildOverviewContent(content, new Map())).not.toThrow();
    const result = buildOverviewContent(content, new Map());
    const table = getTable(result);
    expect((table.body[1] as unknown[]).length).toBe(7);
    expect((table.body[1] as { text?: string }[])[3]).toEqual({ text: '', style: 'tableCell' });
  });

  it('an overview row with statusText: null still produces a 7-cell row with an empty-text status cell, and does not throw', () => {
    const row = makeRow({ statusText: null });
    const content = makeContent({ isOverview: true, rows: [row] });
    expect(() => buildOverviewContent(content, new Map())).not.toThrow();
    const result = buildOverviewContent(content, new Map());
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
    const result = buildOverviewContent(content, new Map());
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
    const skipped = new Map<string, ReportSkipReason[]>([
      ['inv-1', ['footnoteFetchFailed']],
      ['inv-2', ['footnoteInvalidPdf', 'footnoteFetchFailed']],
    ]);
    const result = buildOverviewContent(content, skipped);
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
    const skipped = new Map<string, ReportSkipReason[]>([['unknown-inv', ['footnoteFetchFailed']]]);
    const result = buildOverviewContent(content, skipped);
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
    const skipped = new Map<string, ReportSkipReason[]>([['inv-skip', ['footnoteFetchFailed']]]);
    const contentWithSkipRow = makeContent({
      rows: [makeRow({ invoiceId: 'inv-skip', vendor: 'Skip Co', invoiceNumber: 'K-1' })],
      footnotes: content.footnotes,
    });
    const result = buildOverviewContent(contentWithSkipRow, skipped);
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
    const skipped = new Map<string, ReportSkipReason[]>([['inv-skip', ['footnoteFetchFailed']]]);
    const result = buildOverviewContent(content, skipped);
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
    const result = buildOverviewContent(content, new Map());
    const notesStack = result[result.length - 1] as {
      stack: (Record<string, unknown> & { text: string })[];
    };
    expect(notesStack.stack[0]!.margin).toEqual([0, 4, 0, 0]);
    expect(notesStack.stack[1]!.margin).toBeUndefined();
  });

  it('renders no footnotes block when skippedDocuments is empty and reportContent.footnotes is empty', () => {
    const content = makeContent({ footnotes: [] });
    const result = buildOverviewContent(content, new Map());
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
    const result = buildOverviewContent(content, new Map());
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
    const result = buildOverviewContent(content, new Map());
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
    const result = buildOverviewContent(content, new Map());
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
    const result = buildOverviewContent(content, new Map());
    const tableItem = result.find((c) => typeof c === 'object' && c !== null && 'table' in c) as {
      layout: unknown;
    };
    expect(tableItem.layout).toBe(TABLE_LAYOUT);
  });
});

describe('AC7 — skip reason labels come from reportContent.labels.skipReasonLabels, not TFunction (#2001)', () => {
  it('uses skipReasonLabels.footnoteFetchFailed from labels, not t() key resolution', () => {
    const rows = [makeRow({ invoiceId: 'inv-1', vendor: 'ACME', invoiceNumber: 'A-1' })];
    const content = makeContent({
      rows,
      labels: {
        ...makeLabels(),
        skipReasonLabels: {
          footnoteFetchFailed: 'FETCH-SENTINEL',
          footnoteInvalidPdf: 'INVALID-SENTINEL',
        },
      },
    });
    const skipped = new Map<string, ReportSkipReason[]>([['inv-1', ['footnoteFetchFailed']]]);
    const result = buildOverviewContent(content, skipped);
    const notesStack = result[result.length - 1] as { stack: { text: string }[] };
    expect(notesStack.stack[0]!.text).toBe('*1: ACME (A-1) — FETCH-SENTINEL');
  });

  it('uses skipReasonLabels.footnoteInvalidPdf from labels, not t() key resolution', () => {
    const rows = [makeRow({ invoiceId: 'inv-2', vendor: 'Beta', invoiceNumber: 'B-2' })];
    const content = makeContent({
      rows,
      labels: {
        ...makeLabels(),
        skipReasonLabels: {
          footnoteFetchFailed: 'FETCH-SENTINEL',
          footnoteInvalidPdf: 'INVALID-SENTINEL',
        },
      },
    });
    const skipped = new Map<string, ReportSkipReason[]>([['inv-2', ['footnoteInvalidPdf']]]);
    const result = buildOverviewContent(content, skipped);
    const notesStack = result[result.length - 1] as { stack: { text: string }[] };
    expect(notesStack.stack[0]!.text).toBe('*1: Beta (B-2) — INVALID-SENTINEL');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// #1973 — column visibility wired through to the PDF geometry engine (96 legal subsets)
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// R6/AC2.6: budget-overview (isOverview=true) has 6 free (hideable) columns -> 2^6 = 64 legal
// subsets; claim/proof-of-funds (isOverview=false) has 5 free columns -> 2^5 = 32 legal subsets.
// allocatedAmount is never free (R1) so it is not part of either mask. 64 + 32 = 96 total.
const OVERVIEW_FREE: ReportColumnKey[] = [
  'vendor',
  'invoiceNumber',
  'date',
  'status',
  'invoiceAmount',
  'usage',
];
const CLAIM_FREE: ReportColumnKey[] = ['vendor', 'invoiceNumber', 'date', 'invoiceAmount', 'usage'];

/** Every legal hiddenColumns Set for a use case: one per bitmask over its free-column list. */
function allLegalHiddenSets(isOverview: boolean): Set<ReportColumnKey>[] {
  const free = isOverview ? OVERVIEW_FREE : CLAIM_FREE;
  const sets: Set<ReportColumnKey>[] = [];
  for (let mask = 0; mask < 1 << free.length; mask++) {
    const hidden = free.filter((_col, i) => (mask & (1 << i)) === 0);
    sets.push(new Set(hidden));
  }
  return sets;
}

// Sanity on the enumerator itself — if this drifts, every test below silently tests fewer/more
// subsets than the AC requires.
describe('#1973 subset enumerator sanity', () => {
  it('produces exactly 64 overview subsets and 32 claim subsets (96 total, per R6)', () => {
    expect(allLegalHiddenSets(true)).toHaveLength(64);
    expect(allLegalHiddenSets(false)).toHaveLength(32);
  });

  it('every produced subset always keeps allocatedAmount visible (never appears in any hidden set)', () => {
    for (const isOverview of [true, false]) {
      for (const hidden of allLegalHiddenSets(isOverview)) {
        expect(hidden.has('allocatedAmount')).toBe(false);
      }
    }
  });
});

describe('#1973 AC3.1/3.2/3.3: computeColumnWidths — full base sets (scenario 7)', () => {
  it('7-column budget-overview: absorber is usage, widths.usage === USAGE_WIDTH_7COL exactly', () => {
    const { widths, absorber } = computeColumnWidths(reportColumnsForUseCase(true));
    expect(absorber).toBe('usage');
    expect(widths.usage).toBe(USAGE_WIDTH_7COL);
  });

  it('6-column claim/proof-of-funds: absorber is usage, widths.usage === USAGE_WIDTH_6COL exactly', () => {
    const { widths, absorber } = computeColumnWidths(reportColumnsForUseCase(false));
    expect(absorber).toBe('usage');
    expect(widths.usage).toBe(USAGE_WIDTH_6COL);
  });
});

describe('#1973 AC3.2/3.3/3.5: geometry across all 96 legal subsets', () => {
  // Reference per-column pinned widths, derived from a real computeColumnWidths call rather than
  // re-typed literals (AC3.2 explicitly forbids adding more bare-literal geometry assertions —
  // #1950). The 7-column full set has every FixedColumnKey visible except usage (the absorber),
  // so it supplies the reference width for all six non-usage columns at once.
  const REFERENCE_WIDTHS = computeColumnWidths(reportColumnsForUseCase(true)).widths;

  function totalWidth(
    widths: Partial<Record<ReportColumnKey, number>>,
    visible: ReportColumnKey[],
  ): number {
    return tableOffsetsTotal(visible.length) + visible.reduce((sum, col) => sum + widths[col]!, 0);
  }

  it('(AC3.2, scenario 8) for every subset where usage or vendor is visible (72 of 96), the total equals printableWidth() exactly', () => {
    let checked = 0;
    for (const isOverview of [true, false]) {
      for (const hidden of allLegalHiddenSets(isOverview)) {
        const visible = visibleReportColumns(isOverview, hidden);
        if (!visible.includes('usage') && !visible.includes('vendor')) continue;
        const { widths, absorber } = computeColumnWidths(visible);
        expect(absorber).not.toBeNull();
        expect(totalWidth(widths, visible)).toBe(printableWidth());
        checked++;
      }
    }
    expect(checked).toBe(72); // 48 overview + 24 claim, per R7/AC3.2
  });

  it('(AC3.4, scenario 9) for every subset where NEITHER usage nor vendor is visible (24 of 96), the total is strictly less than printableWidth(), and the min/max checkpoints are exactly 84.00pt / 315.00pt, computed from tableOffsetsTotal + the pinned constants', () => {
    const totals: number[] = [];
    let checked = 0;
    for (const isOverview of [true, false]) {
      for (const hidden of allLegalHiddenSets(isOverview)) {
        const visible = visibleReportColumns(isOverview, hidden);
        if (visible.includes('usage') || visible.includes('vendor')) continue;
        const { widths, absorber } = computeColumnWidths(visible);
        expect(absorber).toBeNull();
        const total = totalWidth(widths, visible);
        expect(total).toBeLessThan(printableWidth());
        totals.push(total);
        checked++;
      }
    }
    expect(checked).toBe(24); // 16 overview + 8 claim

    // Min checkpoint: {allocatedAmount} alone (reachable identically from both use cases).
    const minExpected = tableOffsetsTotal(1) + REFERENCE_WIDTHS.allocatedAmount!;
    expect(minExpected).toBe(84);
    expect(Math.min(...totals)).toBe(minExpected);

    // Max checkpoint: the 5-column overview subset {invoiceNumber, date, status, invoiceAmount,
    // allocatedAmount} — the largest no-absorber subset, since only budget-overview has a 5th
    // free (non-usage/vendor) column (status) to add.
    const maxVisible = visibleReportColumns(true, new Set(['vendor', 'usage']));
    expect(maxVisible).toEqual([
      'invoiceNumber',
      'date',
      'status',
      'invoiceAmount',
      'allocatedAmount',
    ]);
    const maxExpected = totalWidth(REFERENCE_WIDTHS, maxVisible);
    expect(maxExpected).toBe(315);
    expect(Math.max(...totals)).toBe(maxExpected);
  });

  it('(AC3.5, scenario 10) every visible non-absorber column keeps its exact pinned width, at every one of the 96 subsets', () => {
    let checked = 0;
    for (const isOverview of [true, false]) {
      for (const hidden of allLegalHiddenSets(isOverview)) {
        const visible = visibleReportColumns(isOverview, hidden);
        const { widths, absorber } = computeColumnWidths(visible);
        for (const col of visible) {
          if (col === absorber) continue;
          expect(widths[col]).toBe(REFERENCE_WIDTHS[col]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('#1973 AC3.6: usageSafeTokenCharsForWidth recomputes per subset width, not the pinned *_7COL/_6COL constants', () => {
  it('(scenario 11) hiding date from a 7-column report widens Usage, producing a strictly higher safe-token-char threshold than USAGE_SAFE_TOKEN_CHARS_7COL', () => {
    const visible = visibleReportColumns(true, new Set(['date']));
    const { widths } = computeColumnWidths(visible);
    const recomputed = usageSafeTokenCharsForWidth(widths.usage!);
    expect(widths.usage!).toBeGreaterThan(USAGE_WIDTH_7COL);
    expect(recomputed).toBeGreaterThan(USAGE_SAFE_TOKEN_CHARS_7COL);
  });
});

describe('#1973 AC3.7: usageChunkCharsForWidth — one-sided clamp (scenario 12)', () => {
  // No subset among today's 96 legal combinations reaches the downward branch (hiding columns
  // only ever WIDENS Usage — see computeColumnWidths' own derivation comment), so both directions
  // are exercised by calling the function directly with synthetic widths, per the QA spec.
  it('a width NARROWER than USAGE_WIDTH_7COL scales the budget strictly below 650', () => {
    const narrower = USAGE_WIDTH_7COL / 2;
    const result = usageChunkCharsForWidth(narrower);
    expect(result).toBeLessThan(MAX_SAFE_USAGE_CHUNK_CHARS);
    expect(result).toBe(Math.floor(MAX_SAFE_USAGE_CHUNK_CHARS * (narrower / USAGE_WIDTH_7COL)));
  });

  it('a width WIDER than USAGE_WIDTH_7COL (e.g. USAGE_WIDTH_6COL, or hiding every other free column) stays clamped at exactly 650, never scaling up', () => {
    expect(USAGE_WIDTH_6COL).toBeGreaterThan(USAGE_WIDTH_7COL);
    expect(usageChunkCharsForWidth(USAGE_WIDTH_6COL)).toBe(MAX_SAFE_USAGE_CHUNK_CHARS);

    // A much wider synthetic width (e.g. the degenerate near-full-page Usage-only case) must
    // still clamp at 650, not scale proportionally past it.
    const muchWider = USAGE_WIDTH_7COL * 3;
    expect(usageChunkCharsForWidth(muchWider)).toBe(MAX_SAFE_USAGE_CHUNK_CHARS);
  });

  it('exactly at USAGE_WIDTH_7COL (the reference width) returns exactly 650 — the boundary is inclusive', () => {
    expect(usageChunkCharsForWidth(USAGE_WIDTH_7COL)).toBe(MAX_SAFE_USAGE_CHUNK_CHARS);
  });
});

describe('#1973 AC2.4/AC4.1/AC4.2: buildOverviewContent renders every one of the 96 legal subsets without a malformed row', () => {
  function fixtureContent(isOverview: boolean): ReportContent {
    return makeContent({
      isOverview,
      rows: [
        makeRow({ invoiceId: 'inv-1', vendor: 'ACME', statusText: isOverview ? 'Pending' : null }),
        makeRow({ invoiceId: 'inv-2', vendor: 'Beta Co', statusText: isOverview ? 'Paid' : null }),
      ],
      summaryRows: [{ key: 'total', label: 'sourceReports.table.total', amountText: '€500.00' }],
    });
  }

  it('every one of the 96 subsets builds without throwing, and every header/body/summary row has exactly visible.length cells (scenarios 13, 15)', () => {
    let checked = 0;
    for (const isOverview of [true, false]) {
      const content = fixtureContent(isOverview);
      for (const hidden of allLegalHiddenSets(isOverview)) {
        const visible = visibleReportColumns(isOverview, hidden);
        let result: unknown[] = [];
        expect(() => {
          result = buildOverviewContent(content, new Map(), hidden);
        }).not.toThrow();
        const table = getTable(result);
        // Header row.
        expect((table.body[0] as unknown[]).length).toBe(visible.length);
        // Every remaining row (data + summary — no continuation rows possible with this short
        // fixture text) also matches the visible column count exactly.
        for (const row of table.body.slice(1)) {
          expect((row as unknown[]).length).toBe(visible.length);
        }
        checked++;
      }
    }
    expect(checked).toBe(96);
  });

  it('(AC2.7, scenario 14) the single-column case ({allocatedAmount} alone) produces a 1-wide table with one header cell and no zero-width column, for both use cases', () => {
    for (const isOverview of [true, false]) {
      const free = isOverview ? OVERVIEW_FREE : CLAIM_FREE;
      const content = fixtureContent(isOverview);
      const result = buildOverviewContent(content, new Map(), new Set(free));
      const table = getTable(result);
      expect(table.widths).toHaveLength(1);
      expect(table.widths[0]).toBeGreaterThan(0);
      expect((table.body[0] as unknown[]).length).toBe(1);
    }
  });
});

describe('#1973 AC4.3: no content belonging to a visible column is ever dropped, across every subset (scenario 16)', () => {
  function fixtureContent(isOverview: boolean): ReportContent {
    return makeContent({
      isOverview,
      rows: [
        makeRow({
          invoiceId: 'inv-1',
          vendor: 'Vendor One',
          invoiceNumber: 'INV-100',
          dateText: 'date-a',
          statusText: isOverview ? 'Pending' : null,
          invoiceAmountText: '€111.00',
          allocatedAmountValueText: '€222.00',
          usageText: 'Kitchen work',
        }),
        makeRow({
          invoiceId: 'inv-2',
          vendor: 'Vendor Two',
          invoiceNumber: 'INV-200',
          dateText: 'date-b',
          statusText: isOverview ? 'Paid' : null,
          invoiceAmountText: '€333.00',
          allocatedAmountValueText: '€444.00',
          usageText: 'Bathroom work',
        }),
      ],
      summaryRows: [],
    });
  }

  function dataRowCellsByColumn(
    result: unknown[],
    visible: ReportColumnKey[],
  ): Partial<Record<ReportColumnKey, string | undefined>>[] {
    const table = getTable(result);
    // Header (1) + 2 data rows, no summary rows in this fixture, no continuation rows (short text).
    const dataRows = table.body.slice(1, 3);
    return dataRows.map((row) => {
      const texts = rowTexts(row);
      const map: Partial<Record<ReportColumnKey, string | undefined>> = {};
      visible.forEach((col, i) => {
        map[col] = texts[i];
      });
      return map;
    });
  }

  it('every visible column, at every subset, renders byte-identical text to the same column in the full-column-set baseline', () => {
    let comparisons = 0;
    for (const isOverview of [true, false]) {
      const content = fixtureContent(isOverview);
      const baselineVisible = reportColumnsForUseCase(isOverview) as ReportColumnKey[];
      const baseline = dataRowCellsByColumn(
        buildOverviewContent(content, new Map()),
        baselineVisible,
      );

      for (const hidden of allLegalHiddenSets(isOverview)) {
        const visible = visibleReportColumns(isOverview, hidden);
        const rows = dataRowCellsByColumn(
          buildOverviewContent(content, new Map(), hidden),
          visible,
        );
        for (const col of visible) {
          for (let r = 0; r < rows.length; r++) {
            expect(rows[r]![col]).toBe(baseline[r]![col]);
            comparisons++;
          }
        }
      }
    }
    expect(comparisons).toBeGreaterThan(0);
  });
});

describe('#1973 AC4.4: summaryRows render identically at every subset (scenario 17)', () => {
  function fixtureContent(isOverview: boolean): ReportContent {
    return makeContent({
      isOverview,
      rows: [makeRow({ invoiceId: 'inv-1' })],
      summaryRows: [
        { key: 'subtotal', label: 'sourceReports.table.subtotal', amountText: '€100.00' },
        { key: 'total', label: 'sourceReports.table.total', amountText: '€200.00' },
      ],
    });
  }

  it("every summaryRows entry's amountText renders byte-for-byte identically regardless of hiddenColumns (R4: visibility never changes a number)", () => {
    for (const isOverview of [true, false]) {
      const content = fixtureContent(isOverview);
      for (const hidden of allLegalHiddenSets(isOverview)) {
        const visible = visibleReportColumns(isOverview, hidden);
        const result = buildOverviewContent(content, new Map(), hidden);
        // Every subset renders BOTH declared amounts somewhere in the document — either as
        // in-table cells (Tier 1/2) or as a stack block beneath the table (Tier 3, asserted in
        // detail in the AC4.5/4.6 describe block below).
        const allStrings = JSON.stringify(result);
        expect(allStrings).toContain('€100.00');
        expect(allStrings).toContain('€200.00');
        expect(visible.length).toBeGreaterThan(0); // sanity: subset is non-degenerate to reach here
      }
    }
  });
});

describe('#1973 AC4.5/AC4.6: summary-label three-tier placement, asserted per tier (scenario 18)', () => {
  function fixtureContent(isOverview: boolean): ReportContent {
    return makeContent({
      isOverview,
      rows: [],
      summaryRows: [{ key: 'total', label: 'TOTAL_LABEL', amountText: '€999.00' }],
    });
  }

  it("Tier 1 (92 subsets): label lands at the last visible LEADING column's own cell — e.g. date, when it is the only leading column left visible", () => {
    const content = fixtureContent(true);
    const hidden = new Set<ReportColumnKey>(['vendor', 'invoiceNumber', 'status', 'usage']);
    const visible = visibleReportColumns(true, hidden);
    expect(visible).toEqual(['date', 'invoiceAmount', 'allocatedAmount']);

    const result = buildOverviewContent(content, new Map(), hidden);
    const table = getTable(result);
    const summaryRow = table.body[table.body.length - 1] as { text?: unknown }[];
    expect(rowTexts(summaryRow)).toEqual(['TOTAL_LABEL', '', '€999.00']);
  });

  it('Tier 2 ({invoiceAmount, allocatedAmount}, no leading column): label appears in the invoiceAmount cell, NOT the allocatedAmount cell', () => {
    const content = fixtureContent(false);
    const hidden = new Set<ReportColumnKey>(['vendor', 'invoiceNumber', 'date', 'usage']);
    const visible = visibleReportColumns(false, hidden);
    expect(visible).toEqual(['invoiceAmount', 'allocatedAmount']);

    const result = buildOverviewContent(content, new Map(), hidden);
    const table = getTable(result);
    const summaryRow = table.body[table.body.length - 1] as Record<string, unknown>[];
    expect(rowTexts(summaryRow)).toEqual(['TOTAL_LABEL', '€999.00']);
    // The label is specifically in the invoiceAmount cell (index 0), not folded into the bold
    // right-aligned allocatedAmount cell (index 1).
    expect(summaryRow[0]!['bold']).toBe(true);
    expect(summaryRow[0]!['alignment']).toBeUndefined();
    expect(summaryRow[1]!['alignment']).toBe('right');
  });

  it.each([
    ['overview', true, ['vendor', 'invoiceNumber', 'date', 'status', 'invoiceAmount', 'usage']],
    ['overview+usage', true, ['vendor', 'invoiceNumber', 'date', 'status', 'invoiceAmount']],
    ['claim', false, ['vendor', 'invoiceNumber', 'date', 'invoiceAmount', 'usage']],
    ['claim+usage', false, ['vendor', 'invoiceNumber', 'date', 'invoiceAmount']],
  ] as const)(
    'Tier 3 (%s): {allocatedAmount} / {allocatedAmount, usage} render NO in-table summary row — the label+amount live in a separate stack block below the table instead',
    (_label, isOverview, hiddenList) => {
      const content = fixtureContent(isOverview);
      const hidden = new Set<ReportColumnKey>(hiddenList as unknown as ReportColumnKey[]);
      const visible = visibleReportColumns(isOverview, hidden);
      expect(visible.every((c) => c === 'allocatedAmount' || c === 'usage')).toBe(true);

      const result = buildOverviewContent(content, new Map(), hidden);
      const table = getTable(result);
      // No data rows in this fixture (rows: []), so the table body must be JUST the header — no
      // unlabelled bare-number row leaked into the table for the total.
      expect(table.body).toHaveLength(1);

      // The label+amount instead render as a stack block AFTER the table item in the content array.
      const tableIndex = result.findIndex(
        (c) => typeof c === 'object' && c !== null && 'table' in c,
      );
      const afterTable = result[tableIndex + 1] as { stack?: { columns: { text: string }[] }[] };
      expect(afterTable.stack).toBeDefined();
      expect(afterTable.stack).toHaveLength(1);
      const [labelCell, amountCell] = afterTable.stack![0]!.columns;
      expect(labelCell!.text).toBe('TOTAL_LABEL');
      expect(amountCell!.text).toBe('€999.00');
    },
  );
});

describe('#1973 AC4.7: inline (partial) label survives even with every other free column hidden (scenario 19)', () => {
  it('visible = [allocatedAmount] alone still renders the isSplit inline label in the Allocated Amount cell text', () => {
    const row = makeRow({ allocatedAmountValueText: '€400.00', isSplit: true });
    const content = makeContent({
      isOverview: true,
      rows: [row],
      labels: { ...makeLabels(), splitNote: 'SPLIT_LABEL_SENTINEL' },
    });
    const hidden = new Set<ReportColumnKey>(OVERVIEW_FREE);
    const visible = visibleReportColumns(true, hidden);
    expect(visible).toEqual(['allocatedAmount']);

    const result = buildOverviewContent(content, new Map(), hidden);
    const table = getTable(result);
    expect(rowTexts(table.body[1])).toEqual(['€400.00 (SPLIT_LABEL_SENTINEL)']);
  });
});

describe('#1973 AC6.1 regression (R3/#1965 precondition): legend is unconditional, independent of Invoice Amount visibility (scenario 20)', () => {
  it('a subset with Invoice Amount hidden and a (partial) row still emits the split footnote/legend text — this must hold structurally, not via an `if (invoiceAmountHidden)` branch', () => {
    const row = makeRow({ isSplit: true });
    const content = makeContent({
      rows: [row],
      footnotes: [{ id: 'split', marker: 'SPLIT_MARKER', text: 'SPLIT_LEGEND_SENTINEL' }],
    });

    // Invoice Amount hidden, alongside vendor/invoiceNumber/date/usage — only allocatedAmount
    // (locked) survives, so Invoice Amount is unambiguously absent from `visible`.
    const hidden = new Set<ReportColumnKey>(CLAIM_FREE);
    const visible = visibleReportColumns(false, hidden);
    expect(visible).not.toContain('invoiceAmount');

    const result = buildOverviewContent(content, new Map(), hidden);
    const allText = JSON.stringify(result);
    expect(allText).toContain('SPLIT_LEGEND_SENTINEL');

    // Same assertion holds when Invoice Amount IS visible too — the legend does not depend on it
    // either way (R3 rejects a conditional legend in BOTH directions).
    const withInvoiceAmountVisible = visibleReportColumns(true, new Set());
    expect(withInvoiceAmountVisible).toContain('invoiceAmount');
    const resultVisible = buildOverviewContent(
      makeContent({ isOverview: true, rows: [row], footnotes: content.footnotes }),
      new Map(),
    );
    expect(JSON.stringify(resultVisible)).toContain('SPLIT_LEGEND_SENTINEL');
  });
});

describe('#1973 AC6.3: attachment-tier skip-footnote handling is unaffected by column visibility (scenario 21)', () => {
  it('the same skippedDocuments input produces identical footnote output whether or not Usage is hidden', () => {
    const row = makeRow({ invoiceId: 'inv-1', vendor: 'Skip Co', invoiceNumber: 'SK-1' });
    const content = makeContent({ rows: [row] });
    const skipped = new Map<string, ReportSkipReason[]>([['inv-1', ['footnoteFetchFailed']]]);

    const baseline = buildOverviewContent(content, skipped);
    const baselineNotes = (baseline[baseline.length - 1] as { stack: { text: string }[] }).stack;

    const withUsageHidden = buildOverviewContent(content, skipped, new Set(['usage']));
    const hiddenNotes = (
      withUsageHidden[withUsageHidden.length - 1] as { stack: { text: string }[] }
    ).stack;

    expect(hiddenNotes.map((n) => n.text)).toEqual(baselineNotes.map((n) => n.text));
  });
});
