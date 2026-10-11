import { describe, it, expect } from '@jest/globals';
import {
  SEARCH_RESULT_TYPES,
  SEARCH_MATCHED_FIELDS,
  SEARCH_QUERY_MIN_LENGTH,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
} from './search.js';

describe('search constants', () => {
  it('lists the result types in group display order', () => {
    expect([...SEARCH_RESULT_TYPES]).toEqual([
      'work_item',
      'milestone',
      'household_item',
      'invoice',
      'vendor',
      'diary_entry',
      'area',
      'budget_line',
      'paperless_document',
    ]);
  });

  it('lists the matched fields', () => {
    expect([...SEARCH_MATCHED_FIELDS]).toEqual([
      'title',
      'description',
      'name',
      'invoiceNumber',
      'notes',
      'companyName',
      'tradeName',
      'phone',
      'email',
      'contactName',
      'contactPhone',
      'contactEmail',
      'body',
      'fullText',
    ]);
  });

  it('has no duplicate entries', () => {
    expect(new Set(SEARCH_RESULT_TYPES).size).toBe(SEARCH_RESULT_TYPES.length);
    expect(new Set(SEARCH_MATCHED_FIELDS).size).toBe(SEARCH_MATCHED_FIELDS.length);
  });

  it('pins the query and limit bounds', () => {
    expect(SEARCH_QUERY_MIN_LENGTH).toBe(2);
    expect(SEARCH_QUERY_MAX_LENGTH).toBe(100);
    expect(SEARCH_DEFAULT_LIMIT).toBe(5);
    expect(SEARCH_MAX_LIMIT).toBe(20);
    expect(SEARCH_DEFAULT_LIMIT).toBeLessThanOrEqual(SEARCH_MAX_LIMIT);
  });
});
