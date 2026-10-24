import { describe, it, expect } from '@jest/globals';
import {
  MAX_PASTE_ROWS,
  applyMapping,
  defaultMapping,
  isTabular,
  numberToText,
  parseClipboard,
  parseLocaleNumber,
  splitClipboard,
} from './pasteRows.js';

describe('parseLocaleNumber', () => {
  it.each([
    ['1.234,56', 'de', 1234.56, false],
    ['1,234.56', 'en', 1234.56, false],
    ['1.234,56', 'en', 1234.56, false],
    ['12,5', 'de', 12.5, false],
    ['12.5', 'en', 12.5, false],
    ['12,5', 'en', 12.5, false],
    ['12.5', 'de', 12.5, false],
    ['42', 'en', 42, false],
    ['1.234', 'en', 1.234, true],
    ['1.234', 'de', 1234, true],
    ['1,234', 'en', 1234, true],
    ['1,234', 'de', 1.234, true],
    ['1.234.567', 'de', 1234567, false],
    ['€ 9,50', 'de', 9.5, false],
  ] as const)('reads %s (%s) as %s', (text, locale, value, ambiguous) => {
    expect(parseLocaleNumber(text, locale)).toEqual({ value, ambiguous });
  });

  it('rejects blanks, text and a repeated decimal sign', () => {
    expect(parseLocaleNumber('  ', 'en')).toEqual({ value: null, ambiguous: false });
    expect(parseLocaleNumber('abc', 'en')).toEqual({ value: null, ambiguous: false });
    expect(parseLocaleNumber('1.2.3', 'en')).toEqual({ value: null, ambiguous: false });
    expect(parseLocaleNumber('1,2,3', 'de')).toEqual({ value: null, ambiguous: false });
  });

  it('rejects a non-finite result', () => {
    expect(parseLocaleNumber(`1${'9'.repeat(400)}`, 'en').value).toBeNull();
  });
});

describe('numberToText', () => {
  it('uses the locale decimal sign', () => {
    expect(numberToText(1.5, 'de')).toBe('1,5');
    expect(numberToText(1.5, 'en')).toBe('1.5');
  });
});

describe('isTabular / splitClipboard / defaultMapping', () => {
  it('detects tables but not a single value or one trailing newline', () => {
    expect(isTabular('a\tb')).toBe(true);
    expect(isTabular('a\nb')).toBe(true);
    expect(isTabular('a\r\nb')).toBe(true);
    expect(isTabular('a')).toBe(false);
    expect(isTabular('a\n')).toBe(false);
  });

  it('drops empty rows and a header row', () => {
    expect(splitClipboard('Description\tAmount\r\n\r\nTile\t5\n')).toEqual([['Tile', '5']]);
    expect(splitClipboard('Tile\t5')).toEqual([['Tile', '5']]);
    expect(splitClipboard('')).toEqual([]);
  });

  it('maps columns by position', () => {
    expect(defaultMapping(2)).toEqual(['description', 'unitPrice']);
    expect(defaultMapping(3)).toEqual(['description', 'quantity', 'unitPrice']);
    expect(defaultMapping(5)).toEqual(['description', 'quantity', 'unit', 'unitPrice', 'ignore']);
  });
});

describe('applyMapping', () => {
  it('flags unparsable, ambiguous and description-less rows', () => {
    const { rows, problems } = applyMapping(
      [
        ['Tile', 'x', 'kg', '1,50'],
        ['', '2', 'm', '1.234'],
        ['Glue', '', '', ''],
      ],
      ['description', 'quantity', 'unit', 'unitPrice'],
      'de',
    );
    expect(rows[0]).toMatchObject({ quantity: 'x', unitPrice: '1,5', problem: true });
    expect(rows[1]).toMatchObject({ problem: true, ambiguous: ['unitPrice'] });
    expect(rows[2]).toMatchObject({ problem: false, quantity: '', unitPrice: '' });
    expect(problems).toBe(2);
  });

  it('tolerates a mapping without a column and short rows', () => {
    const { rows } = applyMapping([['Tile']], ['description', 'ignore', 'unitPrice'], 'en');
    expect(rows[0]).toMatchObject({ description: 'Tile', quantity: '', unit: '', unitPrice: '' });
  });
});

describe('parseClipboard', () => {
  it('takes 4 clean columns without a preview', () => {
    const result = parseClipboard('Tile\t2\tm2\t10.5\nGlue\t1\tkg\t3', 'en');
    expect(result).toMatchObject({ kind: 'rows', columnCount: 4, needsMapping: false });
  });

  it('takes 2 clean columns without a preview', () => {
    const result = parseClipboard('Tile\t10\nGlue\t3', 'en');
    expect(result).toMatchObject({ kind: 'rows', needsMapping: false, problems: 0 });
  });

  it('needs mapping for 3 columns or a problem cell', () => {
    expect(parseClipboard('Tile\t2\t10', 'en')).toMatchObject({ needsMapping: true });
    expect(parseClipboard('Tile\tabc', 'en')).toMatchObject({ needsMapping: true, problems: 1 });
  });

  it('reports more than the maximum rows as tooMany', () => {
    const text = Array.from({ length: MAX_PASTE_ROWS + 1 }, (_v, i) => `Item ${i}\t1`).join('\n');
    expect(parseClipboard(text, 'en')).toEqual({ kind: 'tooMany', count: MAX_PASTE_ROWS + 1 });
    const ok = Array.from({ length: MAX_PASTE_ROWS }, (_v, i) => `Item ${i}\t1`).join('\n');
    expect(parseClipboard(ok, 'en')).toMatchObject({ kind: 'rows' });
  });
});
