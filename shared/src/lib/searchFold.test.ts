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
