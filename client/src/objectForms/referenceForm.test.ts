import { describe, it, expect } from '@jest/globals';
import {
  readReferenceValues,
  referenceChanges,
  referenceFormPrefill,
  type ReferenceExtraField,
} from './referenceForm.js';
import type { ReferenceListItem } from '../components/ReferenceList/ReferenceList.js';

const ALL: readonly ReferenceExtraField[] = ['description', 'color'];
const NONE: readonly ReferenceExtraField[] = [];

const item = (overrides: Partial<ReferenceListItem> = {}): ReferenceListItem =>
  ({
    id: 'r-1',
    name: 'Test Category A',
    description: null,
    color: null,
    ...overrides,
  }) as ReferenceListItem;

describe('referenceFormPrefill', () => {
  it('returns undefined for a new object', () => {
    expect(referenceFormPrefill(undefined, ALL)).toBeUndefined();
  });

  it('prefills the displayed name only when no extras are listed', () => {
    expect(referenceFormPrefill(item({ description: 'ignored', color: '#112233' }), NONE)).toEqual({
      name: 'Test Category A',
    });
  });

  it('prefills description as empty text and colour as null when unset', () => {
    expect(referenceFormPrefill(item(), ALL)).toEqual({
      name: 'Test Category A',
      description: '',
      color: null,
    });
  });

  it('prefills stored description and colour', () => {
    expect(referenceFormPrefill(item({ description: 'Notes', color: '#112233' }), ALL)).toEqual({
      name: 'Test Category A',
      description: 'Notes',
      color: '#112233',
    });
  });

  it('prefills only the listed extra', () => {
    expect(
      referenceFormPrefill(item({ description: 'Notes', color: '#112233' }), ['color']),
    ).toEqual({ name: 'Test Category A', color: '#112233' });
  });
});

describe('readReferenceValues', () => {
  it('trims the name', () => {
    expect(readReferenceValues({ name: '  Test Category A  ' }, NONE)).toEqual({
      name: 'Test Category A',
    });
  });

  it('reads a non-string name as empty', () => {
    expect(readReferenceValues({ name: 42 }, NONE)).toEqual({ name: '' });
  });

  it('turns a blank description into null and trims a real one', () => {
    expect(readReferenceValues({ name: 'A', description: '   ' }, ['description'])).toEqual({
      name: 'A',
      description: null,
    });
    expect(readReferenceValues({ name: 'A', description: '  Notes ' }, ['description'])).toEqual({
      name: 'A',
      description: 'Notes',
    });
  });

  it('turns an empty or non-string colour into null and keeps a real one', () => {
    expect(readReferenceValues({ name: 'A', color: '' }, ['color'])).toEqual({
      name: 'A',
      color: null,
    });
    expect(readReferenceValues({ name: 'A', color: null }, ['color'])).toEqual({
      name: 'A',
      color: null,
    });
    expect(readReferenceValues({ name: 'A', color: '#aabbcc' }, ['color'])).toEqual({
      name: 'A',
      color: '#aabbcc',
    });
  });

  it('omits extras that are not listed', () => {
    const result = readReferenceValues({ name: 'A', description: 'x', color: '#aabbcc' }, NONE);
    expect(result).toEqual({ name: 'A' });
    expect('description' in result).toBe(false);
    expect('color' in result).toBe(false);
  });
});

describe('referenceChanges', () => {
  it('returns nothing for unchanged values', () => {
    expect(referenceChanges(item(), { name: 'Test Category A' }, ALL)).toEqual({});
  });

  it('sends no name when it equals the displayed translated name (keeps the translation key)', () => {
    const translated = item({ name: 'Übersetzt', translated: true } as Partial<ReferenceListItem>);
    expect(referenceChanges(translated, { name: 'Übersetzt' }, ALL)).toEqual({});
  });

  it('sends a changed name', () => {
    expect(referenceChanges(item(), { name: 'Test Category B' }, ALL)).toEqual({
      name: 'Test Category B',
    });
  });

  it('treats an empty description and null as equal', () => {
    expect(
      referenceChanges(
        item({ description: null }),
        { name: 'Test Category A', description: null },
        ALL,
      ),
    ).toEqual({});
    expect(
      referenceChanges(
        item({ description: undefined }),
        { name: 'Test Category A', description: null },
        ALL,
      ),
    ).toEqual({});
  });

  it('sends a changed description, and null when it was cleared', () => {
    expect(
      referenceChanges(item(), { name: 'Test Category A', description: 'Notes' }, ALL),
    ).toEqual({ description: 'Notes' });
    expect(
      referenceChanges(
        item({ description: 'Notes' }),
        { name: 'Test Category A', description: null },
        ALL,
      ),
    ).toEqual({ description: null });
  });

  it('sends only the colour when only the colour changed', () => {
    expect(
      referenceChanges(
        item(),
        { name: 'Test Category A', description: null, color: '#112233' },
        ALL,
      ),
    ).toEqual({ color: '#112233' });
  });

  it('sends null when the colour was cleared', () => {
    expect(
      referenceChanges(
        item({ color: '#112233' }),
        { name: 'Test Category A', description: null, color: null },
        ALL,
      ),
    ).toEqual({ color: null });
  });

  it('never returns extras that are not listed', () => {
    expect(
      referenceChanges(
        item(),
        { name: 'Test Category A', description: 'Changed', color: '#112233' },
        NONE,
      ),
    ).toEqual({});
    expect(
      referenceChanges(
        item(),
        { name: 'Test Category A', description: 'Changed', color: '#112233' },
        ['color'],
      ),
    ).toEqual({ color: '#112233' });
  });
});
