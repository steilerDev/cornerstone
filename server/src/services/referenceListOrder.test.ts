/**
 * Unit tests for referenceListOrder.ts, the helpers shared by the three
 * reorderable reference lists (Story #2215).
 */

import { describe, it, expect } from '@jest/globals';
import {
  REORDER_ID_MAX_LENGTH,
  REORDER_MAX_IDS,
  assertSameIdSet,
  buildReorderSchema,
  diffIdSets,
  nextSortOrder,
} from './referenceListOrder.js';
import { ReorderSetMismatchError } from '../errors/AppError.js';

describe('diffIdSets()', () => {
  it('reports ids that were left out as missing', () => {
    expect(diffIdSets(['a', 'b', 'c'], ['a'])).toEqual({ missingIds: ['b', 'c'], unknownIds: [] });
  });

  it('reports ids that are not in the list as unknown', () => {
    expect(diffIdSets(['a'], ['a', 'x', 'y'])).toEqual({ missingIds: [], unknownIds: ['x', 'y'] });
  });

  it('reports both at once', () => {
    expect(diffIdSets(['a', 'b'], ['b', 'z'])).toEqual({ missingIds: ['a'], unknownIds: ['z'] });
  });

  it('is empty for the same set in a different order', () => {
    expect(diffIdSets(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual({
      missingIds: [],
      unknownIds: [],
    });
  });

  it('keeps current order for missing ids and request order for unknown ids', () => {
    expect(diffIdSets(['a', 'b', 'c'], ['q', 'p'])).toEqual({
      missingIds: ['a', 'b', 'c'],
      unknownIds: ['q', 'p'],
    });
  });

  it('handles two empty lists', () => {
    expect(diffIdSets([], [])).toEqual({ missingIds: [], unknownIds: [] });
  });
});

describe('assertSameIdSet()', () => {
  it('does not throw for the same set in another order', () => {
    expect(() => assertSameIdSet(['a', 'b'], ['b', 'a'])).not.toThrow();
  });

  it('throws ReorderSetMismatchError carrying the exact details', () => {
    let caught: unknown;
    try {
      assertSameIdSet(['a', 'b'], ['b', 'z']);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ReorderSetMismatchError);
    expect((caught as ReorderSetMismatchError).details).toEqual({
      missingIds: ['a'],
      unknownIds: ['z'],
    });
  });

  it('throws when only an id is missing', () => {
    expect(() => assertSameIdSet(['a', 'b'], ['a'])).toThrow(ReorderSetMismatchError);
  });

  it('throws when only an id is unknown', () => {
    expect(() => assertSameIdSet(['a'], ['a', 'z'])).toThrow(ReorderSetMismatchError);
  });
});

describe('nextSortOrder()', () => {
  it.each([
    [null, 0],
    [undefined, 0],
    [0, 1],
    [7, 8],
  ])('maps the current max %s to %s', (max, expected) => {
    expect(nextSortOrder(max)).toBe(expected);
  });
});

describe('buildReorderSchema()', () => {
  const body = buildReorderSchema().body;
  const ids = body.properties.ids;

  it('requires ids and forbids other properties', () => {
    expect(body.required).toEqual(['ids']);
    expect(body.additionalProperties).toBe(false);
  });

  it('limits the list to 1..500 unique ids', () => {
    expect(REORDER_MAX_IDS).toBe(500);
    expect(ids.minItems).toBe(1);
    expect(ids.maxItems).toBe(500);
    expect(ids.uniqueItems).toBe(true);
  });

  it('limits each id to 1..64 characters', () => {
    expect(REORDER_ID_MAX_LENGTH).toBe(64);
    expect(ids.items).toEqual({ type: 'string', minLength: 1, maxLength: 64 });
  });
});
