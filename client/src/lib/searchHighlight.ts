import { foldSearchText } from '@cornerstone/shared';

/** `[start, end)` in the ORIGINAL text. */
export type MatchRange = readonly [start: number, end: number];

interface FoldedChar {
  readonly ch: string;
  readonly start: number;
  readonly end: number;
}

const COMBINING_MARKS = /[̀-ͯ]/g;

/** The fold of one source code point, as separate characters that each carry the source range. */
function foldCodePoint(source: string, start: number): { chars: FoldedChar[]; end: number } {
  const codePoint = source.codePointAt(start) ?? 0;
  const piece = String.fromCodePoint(codePoint);
  const end = start + piece.length;
  const folded = piece
    .normalize('NFD')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(COMBINING_MARKS, '');
  return {
    // One element per UTF-16 unit, so indexes into `chars` match indexes into the joined string.
    chars: folded.split('').map((ch) => ({ ch, start, end })),
    end,
  };
}

/** One of the digraph passes of foldSearchText: `<letter>e` -> `<letter>`, left to right. */
function collapseDigraph(chars: readonly FoldedChar[], letter: string): FoldedChar[] {
  const out: FoldedChar[] = [];
  for (let i = 0; i < chars.length; i += 1) {
    const current = chars[i]!;
    const next = chars[i + 1];
    if (current.ch === letter && next?.ch === 'e') {
      out.push({ ch: letter, start: current.start, end: next.end });
      i += 1;
    } else {
      out.push(current);
    }
  }
  return out;
}

const COMBINING_MARK = /^\p{M}$/u;

function isMarkAt(text: string, index: number): boolean {
  const cp = text.codePointAt(index);
  return cp !== undefined && COMBINING_MARK.test(String.fromCodePoint(cp));
}

/** A range never ends before a combining mark that belongs to its last character. */
function extendEnd(text: string, end: number): number {
  let result = end;
  while (result < text.length && isMarkAt(text, result)) {
    result += (text.codePointAt(result) ?? 0) > 0xffff ? 2 : 1;
  }
  return result;
}

/** A range never starts on a combining mark: it moves back to the mark's base character. */
function snapStart(text: string, start: number): number {
  let result = start;
  while (result > 0 && result < text.length && isMarkAt(text, result)) result -= 1;
  return result;
}

/**
 * Ranges of the original `text` that match the whole trimmed `query` under the search fold
 * (case, accents, ß, German digraphs). Returns no ranges when the fold cannot be mapped back to
 * the original characters exactly: no highlight is better than a wrong one.
 */
export function findMatchRanges(text: string, query: string): MatchRange[] {
  const needle = foldSearchText(query.trim());
  if (needle === '' || text === '') return [];

  let chars: FoldedChar[] = [];
  for (let index = 0; index < text.length;) {
    const { chars: piece, end } = foldCodePoint(text, index);
    chars.push(...piece);
    index = end;
  }
  for (const letter of ['a', 'o', 'u']) chars = collapseDigraph(chars, letter);

  const folded = chars.map((c) => c.ch).join('');
  if (folded !== foldSearchText(text)) return [];

  const ranges: [number, number][] = [];
  for (let from = folded.indexOf(needle); from !== -1; from = folded.indexOf(needle, from)) {
    const first = chars[from];
    const last = chars[from + needle.length - 1];
    from += needle.length;
    if (!first || !last) continue;
    const start = snapStart(text, first.start);
    const end = extendEnd(text, last.end);
    const previous = ranges[ranges.length - 1];
    if (previous && previous[1] >= start) {
      previous[1] = Math.max(previous[1], end);
    } else {
      ranges.push([start, end]);
    }
  }
  return ranges;
}
