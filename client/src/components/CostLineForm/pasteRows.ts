/** Spreadsheet paste for the cost line grid: pure parsing, no React. */

/** Locales the grid parses numbers for (the resolved app locales). */
export type NumberLocale = 'en' | 'de';

/** At most this many rows are taken from one paste. */
export const MAX_PASTE_ROWS = 200;

export interface ParsedNumber {
  readonly value: number | null;
  /** Reads differently under the other locale's convention (e.g. "1.234" with no other separator). */
  readonly ambiguous: boolean;
}

const HEADER_WORDS = new Set([
  'description',
  'beschreibung',
  'bezeichnung',
  'item',
  'position',
  'artikel',
  'name',
]);

const LOCALE_DECIMAL: Record<NumberLocale, string> = { en: '.', de: ',' };

/** Plain-text form of a number that `parseLocaleNumber` reads back under the same locale. */
export function numberToText(value: number, locale: NumberLocale): string {
  const text = String(value);
  return locale === 'de' ? text.replace('.', ',') : text;
}

/**
 * Parses "1.234,56" (de) or "1,234.56" (en). With both separators present the last one is the
 * decimal point. With one separator kind, the locale's decimal sign reads as a decimal, and the
 * other sign as a thousands separator only when exactly three digits follow it.
 */
export function parseLocaleNumber(text: string, locale: NumberLocale): ParsedNumber {
  const cleaned = text.replace(/[\s\u00a0€$]/g, '');
  if (cleaned === '') return { value: null, ambiguous: false };
  if (!/^-?\d[\d.,]*$/.test(cleaned)) return { value: null, ambiguous: false };

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  const decimalSign = LOCALE_DECIMAL[locale];
  const asNumber = (integer: string, fraction: string): ParsedNumber => {
    const value = Number(fraction === '' ? integer : `${integer}.${fraction}`);
    return { value: Number.isFinite(value) ? value : null, ambiguous: false };
  };
  const strip = (input: string, sign: string) => input.split(sign).join('');

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalAt = Math.max(lastDot, lastComma);
    const thousands = decimalAt === lastDot ? ',' : '.';
    return asNumber(strip(cleaned.slice(0, decimalAt), thousands), cleaned.slice(decimalAt + 1));
  }
  const sign = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : '';
  if (sign === '') return asNumber(cleaned, '');

  const count = cleaned.split(sign).length - 1;
  if (count > 1) {
    // Repeated: only a thousands separator can repeat (1.234.567).
    return sign === decimalSign
      ? { value: null, ambiguous: false }
      : asNumber(strip(cleaned, sign), '');
  }
  const at = cleaned.indexOf(sign);
  const integer = cleaned.slice(0, at);
  const fraction = cleaned.slice(at + 1);
  const threeDigits = fraction.length === 3;
  if (sign === decimalSign) {
    return { ...asNumber(integer, fraction), ambiguous: threeDigits };
  }
  if (threeDigits) return { ...asNumber(`${integer}${fraction}`, ''), ambiguous: true };
  // Reads only one way: the other sign is a decimal point here.
  return asNumber(integer, fraction);
}

export type PasteColumn = 'description' | 'quantity' | 'unit' | 'unitPrice' | 'ignore';

/** A pasted row after column mapping; number cells are normalised to the locale's plain text. */
export interface MappedPasteRow {
  readonly description: string;
  readonly quantity: string;
  readonly unit: string;
  readonly unitPrice: string;
  /** A number cell did not parse or is ambiguous, or the description is empty. */
  readonly problem: boolean;
  /** Number cells that parse differently under the other locale's convention (flagged in the grid). */
  readonly ambiguous: readonly ('quantity' | 'unitPrice')[];
}

export type ClipboardResult =
  | { readonly kind: 'tooMany'; readonly count: number }
  | {
      readonly kind: 'rows';
      /** Raw cells, header row dropped, empty rows dropped. */
      readonly table: readonly (readonly string[])[];
      readonly columnCount: number;
      readonly mapping: readonly PasteColumn[];
      readonly rows: readonly MappedPasteRow[];
      readonly problems: number;
      /** The column count is not 2 or 4, or some cell needs a decision: show the preview. */
      readonly needsMapping: boolean;
    };

/** True when a paste is a table (a tab or a line break), not a single value. */
export function isTabular(text: string): boolean {
  return text.includes('\t') || /\r?\n/.test(text.replace(/\r?\n$/, ''));
}

/** Position-based default mapping: Description, Quantity, Unit, Unit price (2 columns: Description, Amount). */
export function defaultMapping(columnCount: number): PasteColumn[] {
  const order: PasteColumn[] =
    columnCount === 2
      ? ['description', 'unitPrice']
      : columnCount === 3
        ? ['description', 'quantity', 'unitPrice']
        : ['description', 'quantity', 'unit', 'unitPrice'];
  return Array.from({ length: columnCount }, (_unused, index) => order[index] ?? 'ignore');
}

/** Splits clipboard text into rows of cells; drops empty rows and one leading header row. */
export function splitClipboard(text: string): string[][] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.split('\t').map((cell) => cell.trim()))
    .filter((cells) => cells.some((cell) => cell !== ''));
  const first = rows[0]?.[0]?.toLowerCase();
  if (first !== undefined && HEADER_WORDS.has(first)) rows.shift();
  return rows;
}

/** Applies a column mapping to the raw cells. */
export function applyMapping(
  table: readonly (readonly string[])[],
  mapping: readonly PasteColumn[],
  locale: NumberLocale,
): { rows: MappedPasteRow[]; problems: number } {
  const column = (cells: readonly string[], kind: PasteColumn): string => {
    const index = mapping.indexOf(kind);
    return index >= 0 ? (cells[index] ?? '') : '';
  };
  const rows = table.map((cells): MappedPasteRow => {
    const description = column(cells, 'description');
    let problem = description === '';
    const ambiguous: ('quantity' | 'unitPrice')[] = [];
    const number = (kind: 'quantity' | 'unitPrice'): string => {
      const raw = column(cells, kind);
      if (raw === '') return '';
      const parsed = parseLocaleNumber(raw, locale);
      if (parsed.value === null || parsed.ambiguous) problem = true;
      if (parsed.value !== null && parsed.ambiguous) ambiguous.push(kind);
      return parsed.value === null ? raw : numberToText(parsed.value, locale);
    };
    return {
      description,
      quantity: number('quantity'),
      unit: column(cells, 'unit'),
      unitPrice: number('unitPrice'),
      problem,
      ambiguous,
    };
  });
  return { rows, problems: rows.filter((row) => row.problem).length };
}

/** Parses pasted spreadsheet text. */
export function parseClipboard(text: string, locale: NumberLocale): ClipboardResult {
  const table = splitClipboard(text);
  if (table.length > MAX_PASTE_ROWS) return { kind: 'tooMany', count: table.length };
  const columnCount = table.reduce((most, cells) => Math.max(most, cells.length), 0);
  const mapping = defaultMapping(columnCount);
  const { rows, problems } = applyMapping(table, mapping, locale);
  return {
    kind: 'rows',
    table,
    columnCount,
    mapping,
    rows,
    problems,
    needsMapping: (columnCount !== 2 && columnCount !== 4) || problems > 0,
  };
}
