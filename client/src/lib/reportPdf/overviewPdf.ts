/**
 * Overview table PDF content builder.
 * Consumes ReportContent (text only); no data derivation.
 */
import type { TFunction } from 'i18next';
import type { Content } from 'pdfmake/build/pdfmake';
import type { ReportContent, ReportContentRow } from '../reportContent/index.js';
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
 */
export function splitIntoPageSafeChunks(text: string, maxChars: number): string[] {
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
 */
export function packUsageCellRows(
  segments: UsageCellSegment[],
  maxChars: number,
): UsageCellSegment[][] {
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
 * Every cell-content channel this table renders (buildLeadingCells/buildAmountCells/the row-
 * building loop below), and the bound that closes each one (#1939, product-architect round-4
 * sweep). Documentation only — see the two exceptions called out at the end; neither is fixed
 * here (scope guard: AC7).
 *
 * - `vendor`            — server `maxLength: 200` (`server/src/routes/vendors.ts` createVendorSchema,
 *                          `name` field). Worst case (VENDOR_SAFE_TOKEN_CHARS break-all, 200 chars
 *                          of the widest scanned glyph) measures ~393pt against this table's usage-
 *                          row height budget — 36.7% margin.
 * - `invoiceNumber`     — server `maxLength: 100` (`server/src/routes/invoices.ts`
 *                          createInvoiceSchema, `invoiceNumber` field). Worst case ~158pt — 74.6%
 *                          margin. NOT routed through buildUsageTextRuns (rendered as a plain
 *                          `contentRow.invoiceNumber` text cell in buildLeadingCells) — see the
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
 *                          is therefore bounded for all three together. The grey suffix is not
 *                          routed through buildUsageTextRuns, so HORIZONTALLY it is in the same
 *                          recorded-not-fixed class as `invoiceNumber` below.
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
 * Three channels are recorded here without a fix, same class as `markerText` above:
 * - `invoiceNumber` (see above) does not route through buildUsageTextRuns, so a 100-character
 *   unbroken number would paint outside its 63pt INVOICE_NUMBER_WIDTH column. Interior column,
 *   cosmetic overflow only, capped at 100 by the server schema — recorded, not fixed.
 * - the inline grey `areaText`/`attachmentsNote` suffix (see above) is emitted as ONE run rather
 *   than per-token runs, so an unbroken token in a leaf-area name or note wider than the Usage
 *   column paints outside that cell. Horizontal and cosmetic only (every column is an explicit
 *   numeric width, so no token can widen the table itself — see WORST_CASE_CHAR_ADVANCE_EM reason
 *   (1)); the VERTICAL channel, which is the one that loses content, is closed. Emitting per-token
 *   runs here would also put more than one grey run in a cell, which readers of these cells
 *   currently treat as an invariant violation — recorded, not fixed.
 * - `markerText` (see above) is the one remaining unbounded row-height contributor in this table.
 */

export function buildOverviewContent(
  reportContent: ReportContent,
  skippedDocuments: Map<string, string[]>,
  t: TFunction,
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

  // Build table columns — every header cell goes through buildHeaderCell so a single-word label
  // wider than its column (#1929 round-3 architect review HIGH1) breaks mid-character instead of
  // overflowing; harmless for labels that already fit.
  const usageWidth = reportContent.isOverview ? USAGE_WIDTH_7COL : USAGE_WIDTH_6COL;
  const columns: Content[] = [
    buildHeaderCell(reportContent.labels.vendor, VENDOR_WIDTH),
    buildHeaderCell(reportContent.labels.invoiceNumber, INVOICE_NUMBER_WIDTH),
    buildHeaderCell(reportContent.labels.date, DATE_WIDTH),
  ];

  // Add status column only if budget-overview
  if (reportContent.isOverview) {
    columns.push(buildHeaderCell(reportContent.labels.status, STATUS_WIDTH));
  }

  columns.push(
    buildHeaderCell(reportContent.labels.invoiceAmount, INVOICE_AMOUNT_WIDTH, 'right'),
    buildHeaderCell(reportContent.labels.allocatedAmount, ALLOCATED_AMOUNT_WIDTH, 'right'),
    buildHeaderCell(reportContent.labels.usage, usageWidth),
  );

  /**
   * Helper: build summary row (subtotal/total) with label at last leading index.
   */
  function buildSummaryRow(labelText: string, amountText: string): Content[] {
    const leadingCount = reportContent.isOverview ? 4 : 3;
    const row: Content[] = [];

    // Leading cells: empty except the last one which has the label
    for (let i = 0; i < leadingCount; i++) {
      if (i === leadingCount - 1) {
        row.push({ text: labelText, style: 'tableCell', bold: true });
      } else {
        row.push({ text: '', style: 'tableCell' });
      }
    }

    // Empty invoiceAmount cell
    row.push({ text: '', style: 'tableCell' });

    // Bold right-aligned amount
    row.push({
      text: amountText,
      style: 'tableCell',
      alignment: 'right',
      bold: true,
    });

    // Empty trailing usage cell
    row.push({ text: '', style: 'tableCell' });

    return row;
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
   * Leading (vendor/invoiceNumber/date/[status]) cells for a content row. Status is pushed
   * unconditionally whenever isOverview — see AC14: a falsy statusText must still produce a
   * cell, or the row's cell count falls short of the 7-entry `widths` array and pdfmake throws
   * "Malformed table row, a cell is undefined."
   */
  function buildLeadingCells(
    contentRow: ReportContentRow,
    isOverview: boolean,
    statusText: string,
  ): Content[] {
    const cells: Content[] = [
      // Vendor names are free-form business names (unlike invoiceNumber/dateText, which are
      // system-generated and bounded) — protected with the same per-token break-all treatment
      // as Usage (#1929 round-3 architect review HIGH1: "Elektroinstallationsbetrieb" measured
      // 92.72pt against the 45pt Vendor column).
      { text: buildUsageTextRuns(contentRow.vendor, VENDOR_SAFE_TOKEN_CHARS), style: 'tableCell' },
      { text: contentRow.invoiceNumber, style: 'tableCell' },
      { text: contentRow.dateText, style: 'tableCell' },
    ];
    if (isOverview) {
      cells.push({ text: statusText, style: 'tableCell' });
    }
    return cells;
  }

  /**
   * Invoice-amount and allocated-amount cells for a content row.
   */
  function buildAmountCells(contentRow: ReportContentRow, allocatedRuns: Content[]): Content[] {
    return [
      {
        text: contentRow.invoiceAmountText,
        style: 'tableCell',
        alignment: 'right',
        color: contentRow.isRefund ? REFUND_TEXT_COLOR : undefined,
      },
      {
        text: allocatedRuns,
        style: 'tableCell',
        alignment: 'right',
        color: contentRow.isRefund ? REFUND_TEXT_COLOR : undefined,
      },
    ];
  }

  /**
   * Empty leading cells for a Usage continuation row — every column blank except Usage.
   */
  function buildEmptyLeadingCells(isOverview: boolean): Content[] {
    const cells: Content[] = [
      { text: '', style: 'tableCell' },
      { text: '', style: 'tableCell' },
      { text: '', style: 'tableCell' },
    ];
    if (isOverview) cells.push({ text: '', style: 'tableCell' });
    return cells;
  }

  /**
   * Empty amount cells for a Usage continuation row.
   */
  function buildEmptyAmountCells(): Content[] {
    return [
      { text: '', style: 'tableCell', alignment: 'right' },
      { text: '', style: 'tableCell', alignment: 'right' },
    ];
  }

  // Word-break thresholds for this table shape (#1929 round-2 review finding: AC2 permits
  // breaking a word only when it doesn't fit its column alone — see buildUsageTextRuns).
  const usageSafeTokenChars = reportContent.isOverview
    ? USAGE_SAFE_TOKEN_CHARS_7COL
    : USAGE_SAFE_TOKEN_CHARS_6COL;

  /**
   * Renders one packed row's worth of Usage-cell segments (see packUsageCellRows) into a cell.
   *
   * Body segments go through `buildUsageTextRuns` for per-token break-all protection; the grey
   * meta suffix is emitted as ONE run, so a cell never holds more than a single grey run and that
   * run is always last (both properties are relied on when reading these cells back). The meta
   * suffix is NOT token-protected: it is 8pt body-font text in a fixed-width column, so an
   * over-wide unbroken token there paints outside its own cell — cosmetic horizontal overflow only,
   * the same recorded-not-fixed class as `invoiceNumber` (see the channel enumeration above).
   */
  function buildUsageCell(segments: UsageCellSegment[]): Content {
    const runs: Content[] = [];
    segments.forEach((segment, index) => {
      if (!segment.meta) {
        runs.push(...buildUsageTextRuns(segment.text, usageSafeTokenChars));
        return;
      }
      // The '\n' separates the suffix from the usage prose it follows. When the suffix STARTS a
      // cell (it was pushed onto a continuation row of its own), that newline would render an
      // empty first line instead, so it is dropped — a presentational separator, not content.
      const text = index === 0 ? segment.text.replace(/^\n/, '') : segment.text;
      runs.push({ text, color: DEPOSIT_NOTE_TEXT_COLOR });
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

    // Build allocated runs: value+skip markers, then optional inline labels, then optional refund note
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
    // Usage-only continuation row with no "continued" marker, per the product-owner's ruling
    // (#1929 AC2/AC4/AC12).
    const cellSegments: UsageCellSegment[] = [{ text: contentRow.usageText }];
    if (metaPieces.length > 0) {
      cellSegments.push({ text: `\n${metaPieces.join(' · ')}`, meta: true });
    }
    const packedCellRows = packUsageCellRows(cellSegments, MAX_SAFE_USAGE_CHUNK_CHARS);

    rows.push([
      ...buildLeadingCells(contentRow, reportContent.isOverview, contentRow.statusText ?? ''),
      ...buildAmountCells(contentRow, allocatedRuns),
      buildUsageCell(packedCellRows[0]!),
    ]);
    for (let i = 1; i < packedCellRows.length; i++) {
      rows.push([
        ...buildEmptyLeadingCells(reportContent.isOverview),
        ...buildEmptyAmountCells(),
        buildUsageCell(packedCellRows[i]!),
      ]);
    }
  }

  // Add summary rows from reportContent.summaryRows
  for (const summaryRow of reportContent.summaryRows) {
    rows.push(buildSummaryRow(summaryRow.label, summaryRow.amountText));
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
      // Usage is an explicit NUMBER (usageWidth), never '*' — #1929 round-3 architect review
      // CRITICAL/HIGH1: pdfmake never grows a fixed column past its declared width
      // (elasticWidth is read but assigned nowhere), so declaring every column numeric makes
      // the star column's content-driven overflow branch (columnCalculator.js's case-1) simply
      // unreachable — the table's total rendered width is printableWidth() for any input.
      widths: reportContent.isOverview
        ? [
            VENDOR_WIDTH,
            INVOICE_NUMBER_WIDTH,
            DATE_WIDTH,
            STATUS_WIDTH,
            INVOICE_AMOUNT_WIDTH,
            ALLOCATED_AMOUNT_WIDTH,
            usageWidth,
          ]
        : [
            VENDOR_WIDTH,
            INVOICE_NUMBER_WIDTH,
            DATE_WIDTH,
            INVOICE_AMOUNT_WIDTH,
            ALLOCATED_AMOUNT_WIDTH,
            usageWidth,
          ],
      body: rows,
    },
    layout: TABLE_LAYOUT, // no longer carries dontBreakRows — see shared.ts
    margin: [0, 0, 0, 20],
  });

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
        footnotes.push({
          text: `*${skipFootnoteNum}: ${vendorName} (${invoiceNumber}) — ${t(`sourceReports.table.${reason}`)}`,
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
