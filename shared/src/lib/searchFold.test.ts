import { describe, it, expect } from '@jest/globals';
import { foldSearchText, searchDigits } from './searchFold.js';

describe('foldSearchText', () => {
  it.each(['Müller', 'Mueller', 'MÜLLER', 'MUELLER', 'muller', 'Muller'])(
    'folds %s to muller',
    (input) => {
      expect(foldSearchText(input)).toBe('muller');
    },
  );

  it('folds ß and ss to the same form', () => {
    expect(foldSearchText('Fußboden')).toBe('fussboden');
    expect(foldSearchText('FUSSBODEN')).toBe('fussboden');
    expect(foldSearchText('Strasse')).toBe(foldSearchText('Straße'));
  });

  it('lowercases the capital sharp s before folding it to ss', () => {
    // Mutation: dropping toLowerCase leaves U+1E9E unfolded
    expect(foldSearchText('GROẞ')).toBe('gross');
  });

  it('folds ä/ae and ö/oe to the base vowel', () => {
    expect(foldSearchText('Bäcker')).toBe(foldSearchText('Baecker'));
    expect(foldSearchText('Bäcker')).toBe('backer');
    expect(foldSearchText('Schön')).toBe(foldSearchText('Schoen'));
    expect(foldSearchText('Schön')).toBe('schon');
  });

  it('folds accents', () => {
    expect(foldSearchText('Café é à ñ')).toBe('cafe e a n');
  });

  it('treats decomposed (NFD) and composed (NFC) input the same', () => {
    const nfc = 'ü';
    const nfd = 'ü';
    expect(foldSearchText(`M${nfd}ller`)).toBe(foldSearchText(`M${nfc}ller`));
    expect(foldSearchText(`M${nfd}ller`)).toBe('muller');
  });

  it('returns an empty string for empty input and for lone combining marks', () => {
    expect(foldSearchText('')).toBe('');
    expect(foldSearchText('̈')).toBe('');
  });

  it('leaves digits, spaces and punctuation untouched', () => {
    expect(foldSearchText('A-1 b_2%')).toBe('a-1 b_2%');
  });

  it('documented gap: a query that starts mid-digraph does not match the folded stored text', () => {
    // "Mueller" is stored as "muller"; the query "eller" keeps its "e" and so is not a
    // substring of "muller". Accepted behaviour, pinned so a change is deliberate.
    expect(foldSearchText('Mueller').includes(foldSearchText('eller'))).toBe(false);
    // A query that does not start inside the digraph still matches.
    expect(foldSearchText('Mueller').includes(foldSearchText('ller'))).toBe(true);
  });
});

describe('searchDigits', () => {
  it('keeps only the digits', () => {
    expect(searchDigits('+1 (2) 3-4')).toBe('1234');
  });

  it('returns an empty string when there are no digits', () => {
    expect(searchDigits('abc -')).toBe('');
    expect(searchDigits('')).toBe('');
  });

  it('strips non-ASCII digit look-alikes', () => {
    expect(searchDigits('１２3')).toBe('3');
  });
});

describe('foldSearchText fast path equivalence', () => {
  /** Reference implementation: the original, unconditional slow path. */
  function slowFold(value: string): string {
    return value
      .normalize('NFD')
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ae/g, 'a')
      .replace(/oe/g, 'o')
      .replace(/ue/g, 'u');
  }

  const FIXED = [
    '',
    ' ',
    '   \t\n ',
    'plain',
    'PLAIN TEXT 123',
    'no vowels here? rhythm',
    'Mueller',
    'MUELLER',
    'Baecker',
    'Schoen',
    'aeoeue',
    'AEOEUE',
    'ae',
    'e',
    'E',
    'eae',
    'ueue',
    'queue',
    'Michael',
    'Müller',
    'Mueller Müller',
    'Straße STRASSE Strasse',
    'GROẞ',
    'Café é',
    'u\u0308',
    'U\u0308e',
    'Mu\u0308ller',
    '\u0308',
    'a\u0308e',
    'ö + oe + o\u0308',
    'x_y%z\\w',
    '日本語 text',
    '😀 emoji ue',
    'İstanbul',
  ];

  it.each(FIXED.map((v) => [JSON.stringify(v), v] as const))(
    'matches the reference for %s',
    (_label, input) => {
      expect(foldSearchText(input)).toBe(slowFold(input));
    },
  );

  it('matches the reference for a deterministic pseudo-random corpus', () => {
    const alphabet = [
      'a',
      'e',
      'o',
      'u',
      'A',
      'E',
      'O',
      'U',
      'b',
      'k',
      'z',
      'Z',
      '1',
      '9',
      ' ',
      '-',
      '_',
      '%',
      'ä',
      'ö',
      'ü',
      'Ä',
      'Ö',
      'Ü',
      'ß',
      'ẞ',
      'é',
      'è',
      'ñ',
      '\u0308',
      '\u0301',
      '😀',
    ];
    let seed = 20210;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    for (let i = 0; i < 5000; i++) {
      const len = next(21);
      let str = '';
      for (let j = 0; j < len; j++) str += alphabet[next(alphabet.length)];
      expect(foldSearchText(str)).toBe(slowFold(str));
    }
  });

  it('still folds digraphs in pure ASCII (the fast path must not skip them)', () => {
    expect(foldSearchText('Mueller')).toBe('muller');
    expect(foldSearchText('Baecker')).toBe('backer');
    expect(foldSearchText('Schoen')).toBe('schon');
  });
});
