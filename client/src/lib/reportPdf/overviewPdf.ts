/**
 * Overview table PDF content builder.
 * Consumes ReportContent (text only); no data derivation.
 */
import type { Content } from 'pdfmake/build/pdfmake';
import type {
  ReportContent,
  ReportContentRow,
  ReportSkipReason,
  ReportColumnKey,
} from '../reportContent/index.js';
import { visibleReportColumns } from '../reportContent/index.js';
import {
  TABLE_LAYOUT,
  REFUND_TEXT_COLOR,
  DEPOSIT_NOTE_TEXT_COLOR,
  DEPOSIT_NOTE_FONT_SIZE,
} from './shared.js';
import {
  TABLE_BODY_FONT_SIZE,
  TABLE_HEADER_FONT_SIZE,
  DEFAULT_LINE_HEIGHT,
  usableColumnWidth,
} from './pageGeometry.js';

// Fixed point widths (pt) for the narrow, bounded-content columns shared by both table shapes.
// #1929 round-3 architect review measured these directly against a real render (not the
// 0.495em/char scaling estimate that produced round 2's numbers) and confirmed CLOSED:
// DATE_WIDTH holds "15.02.2026" (40.19pt) / "02/15/2026"; INVOICE_NUMBER_WIDTH holds
// "2026-RE-004711" (58.86pt) / "RG-2026-00123-A" (62.70pt). Do not re-derive these from the
// 0.495em estimate — they are pinned by measurement.
const VENDOR_WIDTH = 45;
const INVOICE_NUMBER_WIDTH = 63;
const DATE_WIDTH = 46;
const STATUS_WIDTH = 40; // budget-overview (7-col) only; no per-line-char AC, wraps freely
const INVOICE_AMOUNT_WIDTH = 48;
const ALLOCATED_AMOUNT_WIDTH = 75; // value+markers (~57pt) + " (Abschlagszahlung)" badge (72.9pt)
// both hold; "Zugeordneter Betrag" header wraps at its internal space ("Zugeordneter"=60.42pt,
// "Betrag"=29.42pt — both < 75pt) so it never needs word-breaking either.

/**
 * Every column except Usage has a pinned, content-measured width (see the constants above).
 * Usage is the odd one out: its width is derived per-subset by computeColumnWidths below, never
 * pinned, which is what FixedColumnKey / PINNED_WIDTHS being Usage-exclusive encodes at the type
 * level (#1973).
 */
type FixedColumnKey = Exclude<ReportColumnKey, 'usage'>;
const PINNED_WIDTHS: Record<FixedColumnKey, number> = {
  vendor: VENDOR_WIDTH,
  invoiceNumber: INVOICE_NUMBER_WIDTH,
  date: DATE_WIDTH,
  status: STATUS_WIDTH,
  invoiceAmount: INVOICE_AMOUNT_WIDTH,
  allocatedAmount: ALLOCATED_AMOUNT_WIDTH,
};
const RIGHT_ALIGNED_COLUMNS: ReadonlySet<ReportColumnKey> = new Set([
  'invoiceAmount',
  'allocatedAmount',
]);
const LEADING_COLUMNS: readonly ReportColumnKey[] = ['vendor', 'invoiceNumber', 'date', 'status'];

export interface ColumnWidths {
  widths: Partial<Record<ReportColumnKey, number>>;
  absorber: ReportColumnKey | null;
}

/**
 * The R7 width-absorber algorithm (#1973). For a given ordered visible-column list, the
 * "absorber" is 'usage' if visible, else 'vendor' if visible, else null (no absorber — every
 * remaining column is bounded/numeric, so the table renders narrower than the page rather than
 * wider).
 *
 * Provably correct against AC 3.1-3.5 (re-derived here, not merely asserted):
 * - When an absorber exists: `total = tableOffsetsTotal(n) + fixedSum + (usableColumnWidth(n) -
 *   fixedSum) = tableOffsetsTotal(n) + usableColumnWidth(n) = printableWidth()` EXACTLY,
 *   algebraically, for any visible set with an absorber (AC 3.2's 72-subset case).
 * - When no absorber exists: `total = tableOffsetsTotal(n) + fixedSum(all visible)`, strictly
 *   less than printableWidth() since no term consumes the remaining slack (AC 3.4's 24-subset
 *   case).
 * - Every non-absorber visible column keeps its exact PINNED_WIDTHS value in every case (AC 3.5
 *   holds by construction).
 * - Removing any column while 'usage' stays the absorber strictly INCREASES widths.usage (fixedSum
 *   shrinks by the removed column's pinned width, and usableColumnWidth(n) grows by
 *   tableOffsetsTotal's per-column increment, 8.5pt) — so the narrowest Usage can ever be, across
 *   all 96 legal subsets, is USAGE_WIDTH_7COL (138.28pt), reached only at the full 7-column set.
 */
export function computeColumnWidths(visible: readonly ReportColumnKey[]): ColumnWidths {
  const n = visible.length;
  const absorber: ReportColumnKey | null = visible.includes('usage')
    ? 'usage'
    : visible.includes('vendor')
      ? 'vendor'
      : null;
  let fixedSum = 0;
  const widths: Partial<Record<ReportColumnKey, number>> = {};
  for (const col of visible) {
    if (col === absorber) continue;
    // Every non-absorber column reached here is a genuine FixedColumnKey: 'usage' is only ever
    // skipped as `absorber` (never appears in this branch), so this narrowly-scoped cast is the
    // one exception the compliance checklist allows for satisfying PINNED_WIDTHS' exhaustive key
    // type — do not widen it further.
    widths[col] = PINNED_WIDTHS[col as FixedColumnKey];
    fixedSum += widths[col]!;
  }
  if (absorber) widths[absorber] = usableColumnWidth(n) - fixedSum;
  return { widths, absorber };
}

/**
 * Usage column width (both shapes) — an EXPLICIT NUMERIC width computed from
 * usableColumnWidth(), never `'*'`. #1929 round-3 architect review CRITICAL/HIGH1:
 * `columnCalculator.js:52` reads `elasticWidth` to grow a column past its declared width, but
 * nothing in pdfmake ever assigns it — so numeric widths are honoured unconditionally, while a
 * `'*'` column's case-1 branch ("sum of minimum widths >= available width") forces it to its
 * content's widest-unbreakable-word floor, pushing the WHOLE TABLE past printableWidth(). With
 * every column numeric, that branch is structurally unreachable and the table's total rendered
 * width is printableWidth() for ANY input — not just the content this file happens to test with.
 * Computed (not hand-verified against a comment) so a future column-width edit can't silently
 * invalidate the invariant: `tableOffsetsTotal(n) + fixedSum(n) + USAGE_WIDTH_*COL ===
 * printableWidth()` holds by construction, algebraically, for both shapes.
 */
const USAGE_FIXED_SUM_7COL =
  VENDOR_WIDTH +
  INVOICE_NUMBER_WIDTH +
  DATE_WIDTH +
  STATUS_WIDTH +
  INVOICE_AMOUNT_WIDTH +
  ALLOCATED_AMOUNT_WIDTH;
const USAGE_FIXED_SUM_6COL =
  VENDOR_WIDTH + INVOICE_NUMBER_WIDTH + DATE_WIDTH + INVOICE_AMOUNT_WIDTH + ALLOCATED_AMOUNT_WIDTH;
export const USAGE_WIDTH_7COL = usableColumnWidth(7) - USAGE_FIXED_SUM_7COL; // 138.28pt
export const USAGE_WIDTH_6COL = usableColumnWidth(6) - USAGE_FIXED_SUM_6COL; // 186.78pt

/**
 * Worst-case single-character advance, as a fraction of font size (em), measured directly via
 * real pdfmake renders. This constant has been rescoped twice already (see #1939) after each
 * prior scan turned out to be narrower than its comment claimed — this revision states exactly
 * what was scanned.
 *
 * SCANNED, this round (#1939, a 3,919-codepoint sweep across 29 BMP ranges — ASCII printable,
 * Latin-1 supplement, German umlauts/eszett, Latin Extended-A/B, Cyrillic, Greek, currency
 * symbols, general punctuation, superscripts/subscripts, number forms, and other common
 * typographic symbols), at each of the three table fonts (8pt body, 9pt small, 10pt bold header):
 * `Ѹ` U+0478 (Cyrillic letter Uk) is the true maximum found, at 1.1611em (8pt/9pt) / 1.1787em
 * (10pt bold) — exceeding this constant. Runners-up: `Ҭ` U+04AC = 1.1274em/1.1455em, `Њ` U+040A =
 * 1.0806em/1.0684em, `₨` U+20A8 (rupee sign) = 1.0576em/1.0728em, and `№` U+2116 (Numero sign,
 * this constant's basis) = 1.0283em/1.0200em.
 *
 * `Ѹ` exceeding 1.04em is tolerable rather than a bug, for two reasons. (1) With no `'*'` column
 * in this table (every column is an explicit numeric width — see USAGE_FIXED_SUM_* above), an
 * under-flagged token can only paint outside its own cell's bounds — it can no longer widen the
 * table itself, which is the failure this constant exists to prevent. (2) MAX_SAFE_USAGE_CHUNK_CHARS
 * was pinned by DIRECT MEASUREMENT against a real render, not
 * derived algebraically from this em value — but that measurement used `№` (the widest character
 * the pre-#1939, 124-character scan had found), not `Ѹ`: it sits 7.7% below its measured
 * `№`-fill ceiling of 704 characters
 * (denominator: that constant's own measured ceiling — see
 * MAX_SAFE_USAGE_CHUNK_CHARS's comment). That percentage is a
 * margin against `№`, not against `Ѹ` — re-rendering with a `Ѹ` fill (narrower per-line character
 * count, since `Ѹ` is wider) has not been done, so no percentage margin against `Ѹ` is claimed
 * here. Reason (1) covers only horizontal overflow (a token painting outside its own cell); the
 * hazard this ceiling actually guards against is VERTICAL — an over-tall row silently
 * dropping content under `dontBreakRows` (an I1 violation; see MAX_SAFE_USAGE_CHUNK_CHARS's
 * comment) — and reason (1) says nothing about that. That vertical hazard CAN be derived against
 * `Ѹ` without a new render, because the measured ceiling is an exact multiple of its own
 * `№`-fill per-line character count: 704 = 44 lines x 16 chars/line (492.8pt). (#1929 round 4's
 * since-removed 9pt companion ceiling measured 546 = 39 lines x 14 chars/line (491.4pt) — two
 * independent exact multiples landing on the same ~492pt content
 * budget, which is what showed these measurements pinned a LINE budget (font-size-driven), not a
 * glyph-driven one.) Swapping in `Ѹ`'s narrower per-line count (14 chars/line at 8pt) gives a derived
 * `Ѹ` ceiling of 44 x 14 = 616 for MAX_SAFE_USAGE_CHUNK_CHARS.
 * MAX_SAFE_USAGE_CHUNK_CHARS (650) does NOT clear it — it is 34 characters (3 lines,
 * 33.6pt) over its derived 616-character `Ѹ` ceiling. That overage is tolerated on input
 * reachability, not on either reason above: it requires a 650-character unbroken run of archaic
 * Church Slavonic Uk in a single Usage cell, the same non-credible-input class as `markerText`'s
 * 250-skipped-document scenario (see the channel enumeration below). A `Ѹ`-safe value would have
 * to sit in [600, 616], collapsing AC12's [600, ceiling) window from 8.3% to ~2.7% — a real cost
 * for covering an input this unlikely, and why MAX_SAFE_USAGE_CHUNK_CHARS is left at 650 rather
 * than lowered.
 *
 * Raising this constant to cover `Ѹ` would be a net loss, not a free improvement, though the cost
 * is not immediate: recomputing `floor(width / (fontSize * em))` across the range shows raising to
 * 1.05em moves neither USAGE_SAFE_TOKEN_CHARS_7COL nor VENDOR_SAFE_TOKEN_CHARS — the first of the
 * two to move is USAGE_SAFE_TOKEN_CHARS_7COL, at em > 1.0803 (VENDOR_SAFE_TOKEN_CHARS doesn't move
 * until em > 1.125). Actually covering `Ѹ` at 1.1787em (its 10pt-bold width, the largest of the
 * three) costs both: USAGE_SAFE_TOKEN_CHARS_7COL drops from 16 to 14 characters, and
 * VENDOR_SAFE_TOKEN_CHARS drops from 5 to 4 — breaking MORE ordinary German compounds (this
 * table's actual, common content) in exchange for correctly flagging a Cyrillic letter that, per
 * the two reasons above, was already harmless to under-flag. 1.04em is used uniformly across all
 * three font sizes. Over-flagging a token as needing `wordBreak: 'break-all'` is harmless (see
 * buildUsageTextRuns); under-flagging a token this constant is meant to catch causes the exact
 * overflow this exists to prevent, so relative to its `№` basis the value is rounded UP, not to
 * the nearest measured figure.
 */
const WORST_CASE_CHAR_ADVANCE_EM = 1.04;
const BODY_WORST_CASE_CHAR_WIDTH_PT = TABLE_BODY_FONT_SIZE * WORST_CASE_CHAR_ADVANCE_EM; // 8.32pt
const HEADER_WORST_CASE_CHAR_WIDTH_PT = TABLE_HEADER_FONT_SIZE * WORST_CASE_CHAR_ADVANCE_EM; // 10.4pt

/**
 * A single Usage cell whose `usageText` exceeds this length is split into multiple table rows
 * (see splitIntoPageSafeChunks) rather than rendered as one unbreakable row. pdfmake's
 * dontBreakRows does not paginate an over-tall row — it silently drops what doesn't fit the
 * current page (#1929 architect review, HIGH 4). Per the product-owner's precedence ruling (I1
 * "no character is ever lost" outranks I3 "each row on one page"), a row that genuinely cannot
 * fit one page must still render completely, even if that means it spans pages.
 *
 * SCOPE: this bounds the Usage cell's ENTIRE content stream — `usageText` plus the grey
 * `areaText`/`attachmentsNote` suffix that #1959 renders inline in the same cell — not
 * `usageText` alone. The quantity that has to be bounded is "total height of everything in a
 * row's Usage cell"; see packUsageCellRows, which packs that whole stream against this constant.
 * Both parts render at the same font ('tableCell', 8pt — the suffix only overrides `color`), so
 * ONE character budget governs the whole cell. (#1929 round 4's separate 9pt ceiling for the
 * suffix's own continuation rows was removed with those rows: a 9pt budget is simply the wrong
 * bound for 8pt content, so it must not be reinstated as-is if a 9pt cell style ever returns.)
 *
 * Getting this scope wrong has now cost two rounds, in both directions. #1929 round 3 stacked
 * areaText/attachmentsNote onto the LAST usageText chunk's row while bounding only usageText,
 * leaving their COMBINED height unbounded — attachmentsNote has no maxLength anywhere (editor or
 * server) and areaText is aggregate-unbounded (N leaf areas x 200 chars each); measured
 * combinations (700-char usageText + 400-char attachmentsNote = 665.8pt; 700-char usageText +
 * 20-leaf-area areaText = 691.0pt; 2000-char attachmentsNote alone = 1119.4pt) all exceeded the
 * 634.89pt page budget and were silently dropped (rows requiring 3 and 9 pages both rendered as
 * 2). Round 4 fixed that by giving each field independently-chunked continuation rows of its
 * OWN. #1959 then moved both fields back inline as a single unchunked grey run — reinstating
 * round 3's defect verbatim (measured on that build: 16,000 characters of attachmentsNote
 * rendered as 2 pages, the same 16,000 as chunked usageText needs 9; page count SATURATED at 2
 * and even went 3 -> 2 as content grew, while rendered line count kept growing linearly).
 * The bound now follows the rendered cell rather than a single field, so it cannot be detached
 * from #1959's inline design by a future layout change the way round 4's per-field rows were.
 *
 * MEASURED CEILING (AC12, #1929 round-4 architect review): measured directly against a real
 * render of the production table shape (7-column, `headerRows: 1` with word-break-protected
 * header cells, one populated content row, then a Usage-only continuation row placed where
 * `dontBreakRows` would defer it — a fresh page), using the theoretical worst case: a single
 * unbroken run of '№' (U+2116, the widest character the pre-#1939, 124-character/3-font scan had
 * found) with NO whitespace at all, so every line packs to exactly the column's worst-case
 * character count with no slack. Measured ceiling: 704 characters (round-3's measurement used
 * 'W', not the widest character then known, and got 836 — a near-miss round 4's fix corrected).
 * This constant sits ~7.7% below that measured '№'-fill ceiling (denominator: 704) and ~8.3%
 * above AC12's 600-character zero-degradation requirement. #1939's wider 29-range/3,919-codepoint
 * scan (see WORST_CASE_CHAR_ADVANCE_EM) later found `Ѹ` U+0478 wider still (~1.16em vs `№`'s
 * 1.0283em) — this measurement was not redone against a `Ѹ` fill, so the 7.7% figure remains a
 * margin against `№`, not against the true widest character now known.
 */
export const MAX_SAFE_USAGE_CHUNK_CHARS = 650;

/**
 * Splits `text` into chunks no longer than `maxChars`, breaking only at whitespace boundaries
 * except when a single whitespace-free run itself exceeds maxChars, in which case it is
 * hard-split so the algorithm always makes forward progress. Joining the returned chunks with
 * '' reconstructs `text` exactly — no character, including whitespace, is ever dropped (#1929 I1).
 *
 * Throws on a non-positive `maxChars`. Without the guard the hard-split loop spins forever
 * (`token.slice(0, 0)` is `''` and `token.slice(0)` is `token`, so it never makes progress) — it
 * does NOT fail loudly on its own. Unreachable today (every caller passes a module constant), but
 * that stops being true the moment a budget is derived from column visibility, so it fails fast
 * rather than clamping: a silently clamped budget is a bound nobody can see.
 */
export function splitIntoPageSafeChunks(text: string, maxChars: number): string[] {
  if (maxChars <= 0) {
    throw new Error(`splitIntoPageSafeChunks: maxChars must be positive, got ${maxChars}`);
  }
  if (text.length <= maxChars) return [text];

  const tokens = text.split(/(\s+)/); // capturing group keeps whitespace as its own tokens
  const chunks: string[] = [];
  let current = '';

  for (let token of tokens) {
    while (token.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      chunks.push(token.slice(0, maxChars));
      token = token.slice(maxChars);
    }
    if (current.length + token.length > maxChars) {
      chunks.push(current);
      current = token;
    } else {
      current += token;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * One styled piece of a Usage cell's content stream. `meta: true` marks the grey
 * areaText/attachmentsNote suffix (#1959's inline meta design); everything else renders in the
 * body colour. Both render at the SAME font ('tableCell', 8pt) — the suffix only overrides
 * `color` — which is why ONE character budget (MAX_SAFE_USAGE_CHUNK_CHARS) governs the whole
 * stream, rather than a separate ceiling per styled piece.
 */
export interface UsageCellSegment {
  text: string;
  meta?: boolean;
}

/**
 * Packs a Usage cell's FULL content stream (usage prose, then the grey meta suffix) into per-row
 * segment groups, each holding at most `maxChars` characters — the bound that makes every emitted
 * row's Usage cell page-safe under `dontBreakRows: true`.
 *
 * This is the round-4 bound reinstated at the right scope. #1929 round 4 bounded the same quantity
 * by giving `areaText`/`attachmentsNote` continuation rows of their OWN; #1959 moved them inline
 * into the usage cell as a grey suffix, which restored the unbounded-cell failure mode round 4
 * fixed (pdfmake measures an over-tall row, then `PageElementWriter` silently DROPS whatever does
 * not fit — page count saturates at 2 while rendered line count keeps growing). The bound must
 * therefore apply to what the cell actually renders, which is now usage + area + attachments
 * TOGETHER, not to `usageText` alone.
 *
 * Packing is greedy, so #1959's visual intent is preserved exactly wherever it can be: whenever
 * the whole cell fits one page-safe row (the overwhelmingly common case), the output is a single
 * row whose runs are the usage prose followed by the `\n`-prefixed grey suffix — byte-identical to
 * the pre-fix output. The suffix only lands on a continuation row when the combined content
 * genuinely cannot fit one row, and it is always emitted LAST in the stream, so it stays the
 * trailing grey run of the last row it appears on (never split across two rows of one group more
 * than the budget forces, and never more than ONE grey run per cell).
 *
 * Lossless (#1929 I1): concatenating every returned segment's `text`, in order, reconstructs the
 * input stream exactly — no character, including whitespace, is added or dropped. Empty segments
 * are preserved so an empty `usageText` still renders its own (empty) leading run.
 *
 * Throws on a non-positive `maxChars`, which is not a survivable budget: with no room for even one
 * character the packing loop cannot make progress (`remaining <= 0` flushes a row that is already
 * empty, then retries the same state forever) — note this hangs in the packer's OWN loop, before it
 * ever delegates to splitIntoPageSafeChunks, so both functions need their own guard. Unreachable
 * while the budget is a module constant, but MAX_SAFE_USAGE_CHUNK_CHARS was measured against the
 * 7-column geometry, so any future per-shape or column-visibility-derived budget must fail loudly
 * here rather than be clamped into a bound nobody can see.
 */
export function packUsageCellRows(
  segments: UsageCellSegment[],
  maxChars: number,
): UsageCellSegment[][] {
  if (maxChars <= 0) {
    throw new Error(`packUsageCellRows: maxChars must be positive, got ${maxChars}`);
  }
  const rows: UsageCellSegment[][] = [];
  let current: UsageCellSegment[] = [];
  let used = 0;

  const flush = (): void => {
    if (current.length > 0) {
      rows.push(current);
      current = [];
      used = 0;
    }
  };

  for (const segment of segments) {
    if (segment.text.length === 0) {
      // Consumes no budget; kept so an empty usageText still contributes its own run.
      current.push({ ...segment });
      continue;
    }
    let rest = segment.text;
    while (rest.length > 0) {
      const remaining = maxChars - used;
      if (remaining <= 0) {
        flush();
        continue;
      }
      if (rest.length <= remaining) {
        current.push({ ...segment, text: rest });
        used += rest.length;
        break;
      }
      if (used > 0 && rest.length <= maxChars) {
        // Doesn't fit this row's leftover space, but fits a row of its own: start a fresh row
        // rather than splitting it into a sliver. This keeps the grey meta suffix ONE contiguous
        // run whenever it fits a page-safe row at all.
        flush();
        continue;
      }
      if (used > 0) {
        // Genuinely larger than a whole row — fill this row's leftover space, then carry on.
        const [head, ...tail] = splitIntoPageSafeChunks(rest, remaining);
        current.push({ ...segment, text: head! });
        rest = tail.join('');
        flush();
        continue;
      }
      const [head, ...tail] = splitIntoPageSafeChunks(rest, maxChars);
      current.push({ ...segment, text: head! });
      rest = tail.join('');
      flush();
    }
  }
  flush();

  return rows.length > 0 ? rows : [[{ text: '' }]];
}

/**
 * Row-total character count for a packed Usage-cell row (sum of every segment's text length).
 */
function rowCharCount(row: UsageCellSegment[]): number {
  return row.reduce((sum, segment) => sum + segment.text.length, 0);
}

/**
 * Wraps `packUsageCellRows` with a floor on every continuation row's (row index >= 1) character
 * count, so a would-be runt remainder never renders as its own near-empty row (#1940 AC1).
 *
 * Why the runt check gates the repack rather than always packing at a reduced budget: packing
 * once at the FULL `maxChars` budget and returning that result untouched whenever no row is a
 * runt preserves today's exact row counts for everything that already fits one row (AC8) and for
 * multi-row content that already divides cleanly — both cases are real-render-verified elsewhere
 * in this file (see MAX_SAFE_USAGE_CHUNK_CHARS). Unconditionally packing at `maxChars -
 * minTrailingChars` would split some of that content into an extra row for no reason, regressing
 * the "content at the ceiling renders as one row" behaviour AC8 exists to pin.
 *
 * AC2 safety argument (every row this returns fits the page-safe budget it was originally called
 * with): `packUsageCellRows` guarantees every row it returns is <= the `maxChars` it was called
 * with. In the repack path here, every raw row from `packUsageCellRows(segments, maxChars -
 * minTrailingChars)` is therefore <= `maxChars - minTrailingChars`. The backward scan below merges
 * `rows[i]` into `rows[i - 1]` only when `rowCharCount(rows[i]) < minTrailingChars`, and because
 * the scan runs backward, `rows[i - 1]` (the receiver) has never yet been grown by an earlier
 * merge in this same pass when it receives one — so every merge produces a row of size
 * `(<= maxChars - minTrailingChars) + (< minTrailingChars) < maxChars`, and this bound holds at
 * any cascade depth (a receiver can itself be merged into its predecessor later in the same
 * backward pass, but by the same argument applied again).
 *
 * Termination: a single backward pass over an array that only shrinks (`splice` removes, never
 * inserts) — `packUsageCellRows` is invoked exactly once up front and never again inside the loop,
 * so there is no risk of the repack recursing or re-deriving a smaller and smaller budget.
 *
 * The `minTrailingChars <= 0 || minTrailingChars >= maxChars` guard degrades to the plain
 * `packUsageCellRows` output rather than throwing: unlike `packUsageCellRows`/
 * `splitIntoPageSafeChunks` (which throw on a non-positive `maxChars` because that budget can
 * never be survived), a degenerate `minTrailingChars` here just means "no runt-merge floor" is
 * applicable, and the real caller always derives it as a positive value strictly below the chunk
 * ceiling — so falling back to unmerged rows is the correct behaviour for an edge case that isn't
 * expected to occur, rather than crashing a report render over a decoration threshold.
 */
export function packUsageCellRowsWithMinimum(
  segments: UsageCellSegment[],
  maxChars: number,
  minTrailingChars: number,
): UsageCellSegment[][] {
  if (minTrailingChars <= 0 || minTrailingChars >= maxChars) {
    return packUsageCellRows(segments, maxChars);
  }
  const rawRows = packUsageCellRows(segments, maxChars);
  const hasRunt = rawRows.slice(1).some((row) => rowCharCount(row) < minTrailingChars);
  if (!hasRunt) {
    return rawRows;
  }
  const rows = packUsageCellRows(segments, maxChars - minTrailingChars);
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rowCharCount(rows[i]!) < minTrailingChars) {
      rows[i - 1] = rows[i - 1]!.concat(rows[i]!);
      rows.splice(i, 1);
    }
  }
  return rows;
}

/**
 * A whitespace-free run at or under this many characters is guaranteed to fit on one line within
 * the given column width, EVEN IN THE WORST CASE (every character as wide as 'W'), and renders
 * with pdfmake's default (whitespace-only) wrapping. A run over this length gets
 * `wordBreak: 'break-all'` applied to itself alone, so it can wrap mid-character instead of
 * forcing a fixed-width column's content past its declared width (#1929 CRITICAL 2 / AC1 / AC2 —
 * AC2 permits breaking a word "only when it is wider than its column on its own"; pdfmake has no
 * intermediate "break long words only" mode, just 'normal' (whitespace-only) and 'break-all'
 * (every character), so it must be scoped per-run via a `text:` run array, never applied to a
 * whole cell — TextBreaker.js:15-40 confirms 'break-all' tokenizes per character;
 * StyleContextStack.js:160-165 confirms `wordBreak` is resolved per text-run item before falling
 * back to the style dictionary, so an ordinary run with no `wordBreak` set is unaffected).
 *
 * Deliberately conservative: uses BODY_WORST_CASE_CHAR_WIDTH_PT (1.04em, not an average — see
 * that constant's comment for the scanned charset and the round-3/round-4 architect review
 * findings that an average ratio, and then an insufficiently-conservative "worst case," both
 * under-flag real tokens). A token just under this threshold that gets `wordBreak: 'break-all'`
 * anyway is harmless (it simply never needs to break, since break-all only forces a mid-character
 * split when the token doesn't fit on one line); a token just over it that doesn't get flagged
 * causes exactly the overflow this exists to prevent — so the threshold is rounded down.
 */
function safeTokenChars(columnWidthPt: number, charWidthPt: number): number {
  return Math.floor(columnWidthPt / charWidthPt);
}

export const USAGE_SAFE_TOKEN_CHARS_7COL = safeTokenChars(
  USAGE_WIDTH_7COL,
  BODY_WORST_CASE_CHAR_WIDTH_PT,
);
export const USAGE_SAFE_TOKEN_CHARS_6COL = safeTokenChars(
  USAGE_WIDTH_6COL,
  BODY_WORST_CASE_CHAR_WIDTH_PT,
);

/**
 * Vendor column's safe-token-char threshold (body font). #1929 round-3 architect review HIGH1:
 * a real single-word German vendor name ("Elektroinstallationsbetrieb") measured 92.72pt against
 * the 45pt Vendor column — vendor names are free-form business names (unlike the system-
 * generated date/invoice-number/currency columns), so, like Usage, they need the same per-token
 * break-all protection rather than an assumption that they always fit.
 */
export const VENDOR_SAFE_TOKEN_CHARS = safeTokenChars(VENDOR_WIDTH, BODY_WORST_CASE_CHAR_WIDTH_PT);

/** Per-subset Usage safe-token-char threshold (AC 3.6) — same formula as USAGE_SAFE_TOKEN_CHARS_*COL
 * above, generalized to any Usage width computeColumnWidths produces. */
export function usageSafeTokenCharsForWidth(usageWidthPt: number): number {
  return safeTokenChars(usageWidthPt, BODY_WORST_CASE_CHAR_WIDTH_PT);
}

/**
 * AC 3.7 one-sided clamp. MAX_SAFE_USAGE_CHUNK_CHARS (650) was measured (see that constant's own
 * doc comment) against a real render at the 7-column shape's Usage width (USAGE_WIDTH_7COL,
 * 138.28pt) — the narrowest Usage can ever be across all 96 legal subsets (hiding any column
 * while Usage stays visible only ever widens it further; see computeColumnWidths' derivation).
 * Scaling proportionally to width and then clamping to 650 means this budget MAY scale down for a
 * width narrower than the reference, and MUST NOT scale up for a wider one — required by AC 3.7
 * specifically so a FUTURE column addition that narrows Usage below today's floor fails safe
 * instead of silently reinstating the #1929 content-loss defect. No subset in today's 96 legal
 * combinations reaches the downward branch — it exists for that future case, and must be tested
 * by calling this function directly with a synthetic width (see QA Spec), not by enumerating
 * today's subsets. Do not "simplify" this to always return MAX_SAFE_USAGE_CHUNK_CHARS: that would
 * remove the clamp's entire reason for existing.
 *
 * Why the full 7-column shape returns EXACTLY 650 rather than 649: the ratio is exactly 1.0 there,
 * because computeColumnWidths derives that subset's Usage width via the SAME usableColumnWidth(7)
 * call USAGE_WIDTH_7COL uses, minus a `fixedSum` that sums the identical six PINNED_WIDTHS values
 * USAGE_FIXED_SUM_7COL sums. Two computations of `usableColumnWidth(7) - X` are bit-identical
 * whenever both `X`s are bit-identical (floating-point subtraction is a deterministic function of
 * its two operands) — so the only question is whether `fixedSum === USAGE_FIXED_SUM_7COL`, and at
 * this magnitude (six terms, tens of pt each, nowhere near the 52-bit mantissa's limit) that sum is
 * order-independent REGARDLESS of whether a term is fractional — verified by exhaustively summing
 * all 720 orderings of the six pinned widths with each one substituted for a non-integer value in
 * turn: zero divergence. So, unlike an earlier draft of this comment claimed, a fractional pinned
 * width does NOT threaten this equality on its own; do not trust that framing if it reappears.
 *
 * The real fragility is that USAGE_FIXED_SUM_7COL / USAGE_FIXED_SUM_6COL (above) are hand-written
 * literal sums with no type-level tether to PINNED_WIDTHS or OVERVIEW_COLUMNS/CLAIM_COLUMNS —
 * unlike PINNED_WIDTHS, which is typed `Record<FixedColumnKey, number>` and forces a compile error
 * if a column is added without a pinned-width entry, nothing re-checks USAGE_FIXED_SUM_7COL's term
 * list against the columns it's meant to cover. If a future column addition or removal updates one
 * without the other, `fixedSum` and USAGE_FIXED_SUM_7COL would sum different term sets — a real,
 * likely non-trivial divergence (not a subtle rounding nudge) — and THAT is what would silently
 * break the boundary assertion in overviewPdf.test.ts's AC 3.7 block. Re-check that test, and this
 * comment, if either constant's term list is ever touched independently of the other.
 */
export function usageChunkCharsForWidth(usageWidthPt: number): number {
  const scaled = Math.floor(MAX_SAFE_USAGE_CHUNK_CHARS * (usageWidthPt / USAGE_WIDTH_7COL));
  return Math.min(MAX_SAFE_USAGE_CHUNK_CHARS, scaled);
}

/**
 * Splits `text` into inline pdfmake text runs. Whitespace-free runs at or under `safeTokenChars`
 * are emitted verbatim (default whitespace-only wrapping); a run over that length gets
 * `wordBreak: 'break-all'` applied to itself alone, so only that oversized token can break
 * mid-character — ordinary prose around it keeps wrapping at word boundaries. Used for the Usage
 * column, the Vendor column, and (via buildHeaderCell) every table header cell — anywhere a
 * fixed-width column's content isn't guaranteed to fit a single unbreakable token (#1929 round-3
 * architect review HIGH1: this is what "a column must at minimum accommodate its own header, or
 * apply the same per-token break-all treatment" resolves to for header cells too). Concatenating
 * every returned run's `text` reproduces `text` exactly — whitespace runs are preserved verbatim
 * and no character is ever added or dropped (#1929 I1).
 */
export function buildUsageTextRuns(text: string, safeTokenCharsForColumn: number): Content[] {
  const tokens = text.split(/(\s+)/); // capturing group keeps whitespace as its own tokens
  const runs: Content[] = [];
  for (const token of tokens) {
    if (token.length === 0) continue;
    const isWhitespace = /^\s+$/.test(token);
    if (!isWhitespace && token.length > safeTokenCharsForColumn) {
      runs.push({ text: token, wordBreak: 'break-all' });
    } else {
      runs.push({ text: token });
    }
  }
  return runs.length > 0 ? runs : [{ text: '' }];
}

/**
 * Builds a table header cell whose text is protected against HIGH1's overflow the same way
 * Usage/Vendor body cells are. #1929 round-3 architect review measured two German header labels
 * as single (space-free) tokens wider than their fixed columns — "Auftragnehmer" (vendor header)
 * at 67.50pt against a 45pt column, "Rechnungsbetrag" (invoiceAmount header) at 78.66pt against a
 * 48pt column — and `elasticWidth` never grows a fixed column to fit them (columnCalculator.js:52
 * is read but assigned nowhere). Widening every column to fit its own header outright was
 * evaluated and rejected: doing so for just these two columns already consumes enough of
 * usableColumnWidth(7) to push Usage under AC3's ~30-char floor, and AllocatedAmount's
 * multi-word header ("Zugeordneter Betrag") already wraps safely at its own space without any
 * column change. Applying `buildUsageTextRuns` uniformly to every header cell (both locales)
 * instead preserves the full Usage budget and is harmless wherever a label already fits.
 */
function buildHeaderCell(text: string, columnWidthPt: number, alignment?: 'right'): Content {
  const runs = buildUsageTextRuns(
    text,
    safeTokenChars(columnWidthPt, HEADER_WORST_CASE_CHAR_WIDTH_PT),
  );
  return alignment
    ? { text: runs, style: 'tableHeader', alignment }
    : { text: runs, style: 'tableHeader' };
}

/**
 * Conservative UPPER-BOUND height (pt) of the table's own repeating header row (`headerRows: 1`)
 * — a safety ceiling, not a typical or expected height. #1939: renamed from `HEADER_ROW_HEIGHT`
 * because that name read as an estimate of the typical rendered height, when the formula
 * actually computes the worst case if every character were the widest glyph this module scans
 * for (see WORST_CASE_CHAR_ADVANCE_EM) — the architect's real render of this exact row measured
 * 45.81pt, a 48% gap below this export's 68pt. Exported for #1932 (cover-letter overhaul) to
 * reuse rather than re-deriving its own version of this (round-4 review: no production consumer
 * yet, grep-verified; keep as-is since it's only ever subtracted from a height budget elsewhere,
 * so over-estimating can't invert a safety check — but #1932 must treat it as a ceiling, not a
 * typical height, or it will under-fill pages). Computed, not independently re-measured per
 * render: the narrowest fixed column (Vendor, 45pt) holding its longest bare header word,
 * "Auftragnehmer" (13 characters, no internal whitespace), broken across
 * `ceil(13 / safeTokenChars(VENDOR_WIDTH, header ratio))` lines at the header font's line height,
 * plus the table's own vertical cell padding (paddingTop(6) + paddingBottom(6) from
 * shared.ts's TABLE_LAYOUT — not yet parametrized in pageGeometry.ts). The architect directly
 * measured a real "Auftragnehmer" header row at 45.81pt (round-4 review) — this formula
 * intentionally overestimates that (currently 68pt, after round-4's WORST_CASE_CHAR_ADVANCE_EM
 * correction raised it from round-3's 54pt) rather than matching it exactly. #1929's own
 * MAX_SAFE_USAGE_CHUNK_CHARS does not depend on this being exact — it was pinned directly
 * against a real multi-row render instead (see that constant's comment); treat this export as a
 * documented conservative ceiling for reuse, never a load-bearing or typical-case measurement.
 */
const HEADER_ROW_VERTICAL_PADDING_PT = 12; // shared.ts TABLE_LAYOUT paddingTop(6) + paddingBottom(6)
const VENDOR_HEADER_WORST_CASE_LINES = Math.ceil(
  'Auftragnehmer'.length / safeTokenChars(VENDOR_WIDTH, HEADER_WORST_CASE_CHAR_WIDTH_PT),
);
export const HEADER_ROW_HEIGHT_MAX =
  VENDOR_HEADER_WORST_CASE_LINES * (TABLE_HEADER_FONT_SIZE * DEFAULT_LINE_HEIGHT) +
  HEADER_ROW_VERTICAL_PADDING_PT;

/**
 * Every cell-content channel this table renders (buildBodyCell/the row-building loop below), and
 * the bound that closes each one (#1939, product-architect round-4 sweep). Documentation only —
 * see the two exceptions called out at the end; neither is fixed here (scope guard: AC7).
 *
 * - `vendor`            — server `maxLength: 200` (`server/src/routes/vendors.ts` createVendorSchema,
 *                          `name` field). Worst case (VENDOR_SAFE_TOKEN_CHARS break-all, 200 chars
 *                          of the widest scanned glyph) measures ~393pt against this table's usage-
 *                          row height budget — 36.7% margin.
 * - `invoiceNumber`     — server `maxLength: 100` (`server/src/routes/invoices.ts`
 *                          createInvoiceSchema, `invoiceNumber` field). Worst case ~158pt — 74.6%
 *                          margin. NOT routed through buildUsageTextRuns (rendered as a plain
 *                          `contentRow.invoiceNumber` text cell in buildBodyCell) — see the
 *                          exception below.
 * - `statusText`        — enum label via `reportT` (bounded by construction: finite enum of
 *                          translated strings, not user input).
 * - `refundNoteText`    — fixed `reportT` string (bounded by construction, same as above).
 * - `allocatedAmountValueText` — via `reportFormatters.formatCurrency` (bounded by construction:
 *                          a formatted number, not user input).
 * - `usageText` / `areaText` / `attachmentsNote` — all three share ONE Usage cell (#1959 renders
 *                          areaText/attachmentsNote as an inline grey suffix), and that cell's
 *                          whole content stream is packed into page-safe rows by
 *                          packUsageCellRows against MAX_SAFE_USAGE_CHUNK_CHARS. VERTICAL height
 *                          is therefore bounded for all three together. The grey suffix routes
 *                          through buildUsageTextRuns (per-token break-all), so HORIZONTAL
 *                          overflow there is also closed (#1968).
 * - `markerText`        — UNBOUNDED. One `*N` footnote marker is appended per skipped document on
 *                          an invoice (see the row-building loop's `skipMarkers` accumulation),
 *                          with no chunking and no word-break, into the 75pt ALLOCATED_AMOUNT_WIDTH
 *                          column. Break-even is ~250 skipped documents on a single invoice
 *                          (~617pt against the page budget, 0.7% margin); over budget at ~300.
 *                          This is a documentation item, not a fix: it needs ~250 Paperless
 *                          documents linked to one invoice, all failing to fetch, in a 1-5-user
 *                          self-hosted app — not a credible input, and the fix (chunking a
 *                          footnote-marker run) would be pure ceremony against that reachability.
 *
 * Two channels are recorded here without a fix, same class as `markerText` above:
 * - `invoiceNumber` (see above) does not route through buildUsageTextRuns, so a 100-character
 *   unbroken number would paint outside its 63pt INVOICE_NUMBER_WIDTH column. Interior column,
 *   cosmetic overflow only, capped at 100 by the server schema — recorded, not fixed.
 * - `markerText` (see above) is the one remaining unbounded row-height contributor in this table.
 */

/**
 * Absolute floor (characters) for a continuation row's runt-merge threshold (#1940 AC1), used as
 * the lower bound of `Math.max(MIN_CONTINUATION_ROW_FLOOR_CHARS, usageSafeTokenChars)` below.
 *
 * The runt-merge threshold has two different jobs, and this constant is only the second one:
 * `usageSafeTokenChars` (the per-subset, per-line character budget already computed for word-
 * break protection) does the main work — it guarantees a merged runt fills at least one real line
 * at the CURRENT subset's actual width, so "does this look like a real line of content" holds
 * regardless of which of the 96 legal subsets (#1973) produced it. This constant is the fallback
 * for the case where that per-line figure is itself very small (a narrow Usage column at a small
 * font): 20 characters reads as "clearly more than a stray word or character" even in isolation,
 * independent of any subset's width, so the merge threshold never degrades below a value that
 * still looks like real content on its own.
 *
 * Named and exported (not inlined) per #1950: a numeric threshold that appears in test assertions
 * needs one source of truth, so a future ux-designer tuning of the floor changes this one constant
 * rather than silently drifting between production and every test call site that re-derives it.
 */
export const MIN_CONTINUATION_ROW_FLOOR_CHARS = 20;

export function buildOverviewContent(
  reportContent: ReportContent,
  skippedDocuments: Map<string, ReportSkipReason[]>,
  hiddenColumns: ReadonlySet<ReportColumnKey> = new Set(),
): Content[] {
  const content: Content[] = [];

  // Title
  content.push({
    text: reportContent.tableTitle,
    style: 'title',
    margin: [0, 0, 0, 20],
  });

  // Source info (skip for claim reports)
  if (!reportContent.isClaim) {
    const sourceInfoStack: Array<Content | null> = [
      {
        text: `${reportContent.labels.source}: ${reportContent.sourceInfo.sourceName}`,
        style: 'small',
      },
      {
        text: `${reportContent.labels.sourceType}: ${reportContent.sourceInfo.sourceTypeText}`,
        style: 'small',
      },
      reportContent.sourceInfo.referenceText
        ? {
            text: `${reportContent.labels.reference}: ${reportContent.sourceInfo.referenceText}`,
            style: 'small',
          }
        : null,
      {
        text: `${reportContent.labels.generatedAt}: ${reportContent.sourceInfo.generatedAtText}`,
        style: 'small',
      },
    ];

    content.push({
      stack: sourceInfoStack.filter(Boolean) as Content[],
      margin: [0, 0, 0, 20],
    });
  }

  // Visible columns for this report, in canonical order — the single AC 2.1 derivation shared
  // with ReportContentEditor's toggle UI (client/src/lib/reportContent/columns.ts). The R7
  // width-absorber algorithm (computeColumnWidths) is applied against this exact set.
  const visible = visibleReportColumns(reportContent.isOverview, hiddenColumns);
  const { widths: colWidths } = computeColumnWidths(visible);

  // Build table columns — every header cell goes through buildHeaderCell so a single-word label
  // wider than its column (#1929 round-3 architect review HIGH1) breaks mid-character instead of
  // overflowing; harmless for labels that already fit.
  const HEADER_LABEL: Record<ReportColumnKey, string> = {
    vendor: reportContent.labels.vendor,
    invoiceNumber: reportContent.labels.invoiceNumber,
    date: reportContent.labels.date,
    status: reportContent.labels.status,
    invoiceAmount: reportContent.labels.invoiceAmount,
    allocatedAmount: reportContent.labels.allocatedAmount,
    usage: reportContent.labels.usage,
  };
  const columns: Content[] = visible.map((col) =>
    buildHeaderCell(
      HEADER_LABEL[col],
      colWidths[col]!,
      RIGHT_ALIGNED_COLUMNS.has(col) ? 'right' : undefined,
    ),
  );

  const nonUsageVisible = visible.filter((c): c is FixedColumnKey => c !== 'usage');
  const usageVisible = visible.includes('usage');

  // R2's three-tier fallback for a summary row's label placement (AC 4.5/4.6), computed once per
  // document rather than per row.
  const lastLeadingVisible = [...LEADING_COLUMNS].reverse().find((c) => visible.includes(c));
  const hasLeadingVisible = lastLeadingVisible !== undefined;
  const invoiceAmountVisible = visible.includes('invoiceAmount');
  // Tier 3, exactly the {allocatedAmount} / {allocatedAmount, usage} subsets: no leading column
  // and no invoiceAmount column survive to carry the label, so summary rows render as a stack
  // block below the table instead of a table row — matching ReportContentEditor.tsx's preview,
  // which always renders summary rows in a separate block (R2's "preview parity").
  const usesSeparateSummaryBlock = !hasLeadingVisible && !invoiceAmountVisible;

  /**
   * Helper: build summary row (subtotal/total) with the label at the last visible leading column
   * (Tier 1), falling back to invoiceAmount when no leading column survives (Tier 2). Never
   * called for usesSeparateSummaryBlock's Tier 3 subsets.
   */
  function buildSummaryRow(labelText: string, amountText: string): Content[] {
    return nonUsageVisible
      .map((col): Content => {
        if (col === 'allocatedAmount') {
          return { text: amountText, style: 'tableCell', alignment: 'right', bold: true };
        }
        if (col === lastLeadingVisible) {
          return { text: labelText, style: 'tableCell', bold: true }; // Tier 1
        }
        if (col === 'invoiceAmount' && !hasLeadingVisible) {
          return { text: labelText, style: 'tableCell', bold: true }; // Tier 2
        }
        return { text: '', style: 'tableCell' };
      })
      .concat(usageVisible ? [{ text: '', style: 'tableCell' }] : []);
  }

  // Build table rows from reportContent.rows
  const rows: Content[][] = [columns as Content[]];

  // Track skip footnotes by invoice
  const skipFootnotesByInvoiceId = new Map<string, number[]>();
  let skipFootnoteNum = 1;
  for (const [invoiceId, reasons] of skippedDocuments) {
    if (!skipFootnotesByInvoiceId.has(invoiceId)) {
      skipFootnotesByInvoiceId.set(invoiceId, []);
    }
    const noteNums = skipFootnotesByInvoiceId.get(invoiceId)!;
    for (const _reason of reasons) {
      noteNums.push(skipFootnoteNum);
      skipFootnoteNum++;
    }
  }

  /**
   * Body cell for one non-usage visible column. AC14 precedent: status is never omitted even
   * when falsy — every visible non-usage column must always produce a cell, or the row's cell
   * count falls short of `widths` and pdfmake throws "Malformed table row, a cell is undefined."
   */
  function buildBodyCell(
    col: FixedColumnKey,
    contentRow: ReportContentRow,
    allocatedRuns: Content[],
  ): Content {
    switch (col) {
      case 'vendor':
        // Vendor names are free-form business names (unlike invoiceNumber/dateText, which are
        // system-generated and bounded) — protected with the same per-token break-all treatment
        // as Usage (#1929 round-3 architect review HIGH1: "Elektroinstallationsbetrieb" measured
        // 92.72pt against the 45pt Vendor column).
        return {
          text: buildUsageTextRuns(contentRow.vendor, VENDOR_SAFE_TOKEN_CHARS),
          style: 'tableCell',
        };
      case 'invoiceNumber':
        return { text: contentRow.invoiceNumber, style: 'tableCell' };
      case 'date':
        return { text: contentRow.dateText, style: 'tableCell' };
      case 'status':
        return { text: contentRow.statusText ?? '', style: 'tableCell' };
      case 'invoiceAmount':
        return {
          text: contentRow.invoiceAmountText,
          style: 'tableCell',
          alignment: 'right',
          color: contentRow.isRefund ? REFUND_TEXT_COLOR : undefined,
        };
      case 'allocatedAmount':
        return {
          text: allocatedRuns,
          style: 'tableCell',
          alignment: 'right',
          color: contentRow.isRefund ? REFUND_TEXT_COLOR : undefined,
        };
    }
  }

  /**
   * Empty body cell for a Usage continuation row — every non-usage visible column blank.
   */
  function buildEmptyBodyCell(col: FixedColumnKey): Content {
    return RIGHT_ALIGNED_COLUMNS.has(col)
      ? { text: '', style: 'tableCell', alignment: 'right' }
      : { text: '', style: 'tableCell' };
  }

  // Word-break threshold and chunk budget for THIS subset's Usage width (AC 3.6/3.7) — derived
  // from the per-subset width computeColumnWidths produced above, not the old two-shape
  // constants (USAGE_SAFE_TOKEN_CHARS_7COL/6COL, which remain exported unchanged as the "hiding
  // nothing" baseline values plus the reference denominator usageChunkCharsForWidth's clamp uses).
  const usageSafeTokenChars = usageVisible ? usageSafeTokenCharsForWidth(colWidths.usage!) : 0;
  const usageChunkChars = usageVisible ? usageChunkCharsForWidth(colWidths.usage!) : 0;

  // AC1 (#1940): floor for a continuation row so a would-be runt remainder merges into the row
  // before it instead of rendering as a near-empty row indistinguishable from a broken document.
  // Expressed via this subset's own per-line character budget (ux-designer recommendation), with
  // MIN_CONTINUATION_ROW_FLOOR_CHARS as the absolute lower bound — see that constant's doc comment
  // for why the threshold needs both terms.
  const minTrailingUsageChars = usageVisible
    ? Math.max(MIN_CONTINUATION_ROW_FLOOR_CHARS, usageSafeTokenChars)
    : 0;

  /**
   * Renders one packed row's worth of Usage-cell segments (see packUsageCellRows) into a cell.
   *
   * Both body and grey meta segments go through `buildUsageTextRuns` for per-token break-all
   * protection. Each meta run is coloured DEPOSIT_NOTE_TEXT_COLOR after the split, so a cell may
   * hold multiple consecutive grey runs — they are always last (relied on by splitUsageCell in
   * tests and by any caller reading these cells back).
   *
   * `isContinuation` (#1940 AC5) prepends a single literal `'… '` run (U+2026 + space) as the very
   * first run when true, per the ux-designer's visual spec (issue #1940 comment). This is pure
   * render-time decoration: it is never counted against `packUsageCellRowsWithMinimum`'s character
   * budget and never part of the #1929 I1 reconstruction, since neither `packUsageCellRows`/
   * `packUsageCellRowsWithMinimum` nor `UsageCellSegment.text` ever see this string — it is added
   * here, after packing, purely for what gets rendered. Deliberately NO colour override (not
   * `DEPOSIT_NOTE_TEXT_COLOR`): the ux-designer chose an ink-shape signal over a colour/fill signal
   * precisely because colour is what degrades under greyscale printing and photocopying, and this
   * is a bank document that gets scanned — do not "helpfully" add a colour here.
   */
  function buildUsageCell(segments: UsageCellSegment[], isContinuation = false): Content {
    const runs: Content[] = [];
    if (isContinuation) {
      runs.push({ text: '… ' });
    }
    segments.forEach((segment, index) => {
      if (!segment.meta) {
        runs.push(...buildUsageTextRuns(segment.text, usageSafeTokenChars));
        return;
      }
      // The '\n' separates the suffix from the usage prose it follows. When the suffix STARTS a
      // cell (it was pushed onto a continuation row of its own), that newline would render an
      // empty first line instead, so it is dropped — a presentational separator, not content.
      const text = index === 0 ? segment.text.replace(/^\n/, '') : segment.text;
      const metaRuns = buildUsageTextRuns(text, usageSafeTokenChars);
      runs.push(
        ...metaRuns.map((r) => Object.assign({}, r, { color: DEPOSIT_NOTE_TEXT_COLOR }) as Content),
      );
    });
    return { text: runs, style: 'tableCell' };
  }

  for (const contentRow of reportContent.rows) {
    // Allocated amount with skip markers and inline labels
    const skipMarkers = skipFootnotesByInvoiceId.get(contentRow.invoiceId) ?? [];
    let skipMarkerText = '';
    for (const noteNum of skipMarkers) {
      skipMarkerText += `*${noteNum}`;
    }

    // Build allocated runs: value+skip markers, then optional inline labels, then optional
    // refund note. `allocatedAmount` is the locked column — always in `visible` regardless of
    // `hiddenColumns` — so allocatedRuns is always built and always rendered here; #1973 AC 4.7
    // holds structurally, not incidentally.
    const allocatedRuns: Content[] = [
      { text: `${contentRow.allocatedAmountValueText}${skipMarkerText}` },
    ];
    if (contentRow.isDeposit) {
      allocatedRuns.push({
        text: ` (${reportContent.labels.deposit})`,
        color: DEPOSIT_NOTE_TEXT_COLOR,
        fontSize: DEPOSIT_NOTE_FONT_SIZE,
      });
    }
    if (contentRow.isSplit) {
      allocatedRuns.push({
        text: ` (${reportContent.labels.splitNote})`,
        color: DEPOSIT_NOTE_TEXT_COLOR,
        fontSize: DEPOSIT_NOTE_FONT_SIZE,
      });
    }
    if (contentRow.isDepositReduced) {
      allocatedRuns.push({
        text: ` (${reportContent.labels.depositReducedNote})`,
        color: DEPOSIT_NOTE_TEXT_COLOR,
        fontSize: DEPOSIT_NOTE_FONT_SIZE,
      });
    }
    if (contentRow.isRefund) {
      allocatedRuns.push({ text: ` ${contentRow.refundNoteText}` });
    }

    const nonUsageCells = nonUsageVisible.map((col) =>
      buildBodyCell(col, contentRow, allocatedRuns),
    );

    if (!usageVisible) {
      rows.push(nonUsageCells);
      continue; // no Usage cell ⇒ no continuation rows possible
    }

    // Area and attachmentsNote render inline as one trailing grey suffix on the Usage cell
    // (#1959), '\n'-prefixed and joined by ' · '.
    const metaPieces: string[] = [];
    if (contentRow.areaText) metaPieces.push(contentRow.areaText);
    if (contentRow.attachmentsNote) metaPieces.push(contentRow.attachmentsNote);

    // The Usage cell's ENTIRE content stream — usage prose plus that grey suffix — is packed into
    // page-safe rows against ONE budget. Bounding `usageText` alone is not enough: the suffix is
    // rendered in the same cell, at the same font, and neither `attachmentsNote` (no maxLength
    // anywhere) nor `areaText` (aggregate-unbounded across N leaf areas) is bounded by input, so
    // an unbounded suffix makes the row over-tall and `dontBreakRows: true` silently DROPS the
    // overflow instead of paginating it (#1929 architect review HIGH 4 / I1). Wherever the whole
    // cell fits one row — the common case — this emits exactly one row, unchanged from #1959.
    // The first packed row shares this invoice's leading/amount cells; any further row is a
    // Usage-only continuation row (#1929 AC2/AC4/AC12), now carrying the leading '… ' marker
    // buildUsageCell adds for isContinuation rows (#1940 AC5) — the earlier "no marker" ruling
    // was superseded once round-3/4 renders showed a markerless continuation row is visually
    // indistinguishable from a broken/orphaned one.
    const cellSegments: UsageCellSegment[] = [{ text: contentRow.usageText }];
    if (metaPieces.length > 0) {
      cellSegments.push({ text: `\n${metaPieces.join(' · ')}`, meta: true });
    }
    const packedCellRows = packUsageCellRowsWithMinimum(
      cellSegments,
      usageChunkChars,
      minTrailingUsageChars,
    );

    rows.push([...nonUsageCells, buildUsageCell(packedCellRows[0]!)]);
    for (let i = 1; i < packedCellRows.length; i++) {
      rows.push([
        ...nonUsageVisible.map(buildEmptyBodyCell),
        buildUsageCell(packedCellRows[i]!, true),
      ]);
    }
  }

  // Add summary rows from reportContent.summaryRows — Tier 1/2 push a row into the table body;
  // Tier 3 (usesSeparateSummaryBlock) renders as a stack block below the table instead (see the
  // block pushed after the table, below).
  if (!usesSeparateSummaryBlock) {
    for (const summaryRow of reportContent.summaryRows) {
      rows.push(buildSummaryRow(summaryRow.label, summaryRow.amountText));
    }
  }

  // Add table
  content.push({
    table: {
      headerRows: 1,
      // dontBreakRows lives on the TABLE node, not on `layout` — pdfmake reads it from
      // tableNode.table.dontBreakRows (TableProcessor.js:123); placing it on TABLE_LAYOUT
      // (as round 1 did) is inert, since layout is only consumed for border/padding/fill
      // callbacks (#1929 architect review, CRITICAL 1).
      dontBreakRows: true,
      // Every column is an explicit NUMBER, never '*' — #1929 round-3 architect review
      // CRITICAL/HIGH1: pdfmake never grows a fixed column past its declared width
      // (elasticWidth is read but assigned nowhere), so declaring every column numeric makes
      // the star column's content-driven overflow branch (columnCalculator.js's case-1) simply
      // unreachable — the table's total rendered width is printableWidth() for any input (see
      // computeColumnWidths' derivation for the general N-column proof).
      widths: visible.map((col) => colWidths[col]!),
      body: rows,
    },
    layout: TABLE_LAYOUT, // no longer carries dontBreakRows — see shared.ts
    margin: [0, 0, 0, 20],
  });

  // Tier 3 (usesSeparateSummaryBlock): summary rows render as their own stack block, matching
  // ReportContentEditor.tsx's preview which always renders summary rows separately from the
  // table (R2 "preview parity").
  if (usesSeparateSummaryBlock && reportContent.summaryRows.length > 0) {
    content.push({
      stack: reportContent.summaryRows.map((row) => ({
        columns: [
          { text: row.label, style: 'tableCell', bold: true },
          { text: row.amountText, style: 'tableCell', bold: true, alignment: 'right' },
        ],
      })),
      margin: [0, 0, 0, 20],
    });
  }

  // Add footnotes (skip block only; split/deposit annotations are now rendered inline)
  const footnotes: Content[] = [];

  // Skip block (generation-time data)
  if (skippedDocuments.size > 0) {
    let skipFootnoteNum = 1;
    for (const [invoiceId, reasons] of skippedDocuments) {
      // Find vendor/invoice info from reportContent.rows
      const row = reportContent.rows.find((r) => r.invoiceId === invoiceId);
      const vendorName = row?.vendor ?? '—';
      const invoiceNumber = row?.invoiceNumber ?? '—';

      for (const reason of reasons) {
        const reasonLabel = reportContent.labels.skipReasonLabels[reason];
        footnotes.push({
          text: `*${skipFootnoteNum}: ${vendorName} (${invoiceNumber}) — ${reasonLabel}`,
          style: 'small',
        });
        skipFootnoteNum++;
      }
    }
  }

  // Split + deposit footnotes from reportContent
  if (reportContent.footnotes.length > 0) {
    let isFirst = true;
    for (const footnote of reportContent.footnotes) {
      const content: Content = {
        text: `${footnote.marker}: ${footnote.text}`,
        style: 'small',
      };

      if (isFirst) {
        content.margin = [0, 4, 0, 0];
        isFirst = false;
      }

      footnotes.push(content);
    }
  }

  if (footnotes.length > 0) {
    content.push({
      stack: footnotes,
      margin: [0, 0, 0, 0],
    });
  }

  return content;
}
