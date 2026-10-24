import { describe, it, expect, jest } from '@jest/globals';
import type { TFunction } from 'i18next';
import { searchingAllNote } from './searchingAllNote.js';

const t = jest.fn(
  (key: string, opts?: Record<string, unknown>) => `${key}${opts ? JSON.stringify(opts) : ''}`,
) as unknown as TFunction;

describe('searchingAllNote', () => {
  it('uses none for zero matches outside, whatever the chips', () => {
    expect(searchingAllNote(t, { outside: 0, chips: [] })).toBe('objectList.searchingAll.none');
    expect(searchingAllNote(t, { outside: 0, chips: ['Paid'] })).toBe(
      'objectList.searchingAll.none',
    );
  });

  it('names one chip', () => {
    expect(searchingAllNote(t, { outside: 3, chips: ['Paid'] })).toBe(
      'objectList.searchingAll.inChip{"count":3,"chip":"Paid"}',
    );
  });

  it('names two chips', () => {
    expect(searchingAllNote(t, { outside: 2, chips: ['Offers', 'Paid'] })).toBe(
      'objectList.searchingAll.inTwo{"count":2,"first":"Offers","second":"Paid"}',
    );
  });

  it('falls back to other statuses for 3+ chips or none named', () => {
    expect(searchingAllNote(t, { outside: 5, chips: ['A', 'B', 'C'] })).toBe(
      'objectList.searchingAll.inOther{"count":5}',
    );
    expect(searchingAllNote(t, { outside: 1, chips: [] })).toBe(
      'objectList.searchingAll.inOther{"count":1}',
    );
  });
});
