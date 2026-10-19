/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { pushRecentTag, readRecentTags } from './recentTags.js';

const ALL = (...ids: string[]) => new Set(ids);

describe('recentTags', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns an empty list when nothing is stored', () => {
    expect(readRecentTags('area', 'u1', ALL('a'))).toEqual([]);
  });

  it('keeps the newest id first', () => {
    pushRecentTag('area', 'u1', 'a');
    pushRecentTag('area', 'u1', 'b');
    pushRecentTag('area', 'u1', 'c');

    expect(readRecentTags('area', 'u1', ALL('a', 'b', 'c'))).toEqual(['c', 'b', 'a']);
  });

  it('moves an existing id to the front without duplicating it', () => {
    pushRecentTag('area', 'u1', 'a');
    pushRecentTag('area', 'u1', 'b');
    pushRecentTag('area', 'u1', 'a');

    expect(readRecentTags('area', 'u1', ALL('a', 'b'))).toEqual(['a', 'b']);
  });

  it('caps the list at 8 ids and drops the oldest', () => {
    for (let i = 1; i <= 10; i += 1) pushRecentTag('area', 'u1', `id-${i}`);
    const valid = ALL(...Array.from({ length: 10 }, (_, i) => `id-${i + 1}`));

    const recents = readRecentTags('area', 'u1', valid);

    expect(recents).toHaveLength(8);
    expect(recents[0]).toBe('id-10');
    expect(recents[7]).toBe('id-3');
    expect(JSON.parse(localStorage.getItem('cornerstone.capture.recentAreas.u1')!)).toHaveLength(8);
  });

  it('drops ids that no longer exist', () => {
    pushRecentTag('orientation', 'u1', 'gone');
    pushRecentTag('orientation', 'u1', 'kept');

    expect(readRecentTags('orientation', 'u1', ALL('kept'))).toEqual(['kept']);
  });

  it('keeps areas and orientations and users apart', () => {
    pushRecentTag('area', 'u1', 'a');
    pushRecentTag('orientation', 'u1', 'o');
    pushRecentTag('area', 'u2', 'z');

    expect(readRecentTags('area', 'u1', ALL('a', 'o', 'z'))).toEqual(['a']);
    expect(readRecentTags('orientation', 'u1', ALL('a', 'o', 'z'))).toEqual(['o']);
    expect(readRecentTags('area', 'u2', ALL('a', 'o', 'z'))).toEqual(['z']);
    expect(localStorage.getItem('cornerstone.capture.recentOrientations.u1')).not.toBeNull();
  });

  it('tolerates malformed JSON', () => {
    localStorage.setItem('cornerstone.capture.recentAreas.u1', '{not json');
    expect(readRecentTags('area', 'u1', ALL('a'))).toEqual([]);

    pushRecentTag('area', 'u1', 'a');
    expect(readRecentTags('area', 'u1', ALL('a'))).toEqual(['a']);
  });

  it('ignores a stored value that is not an array and non-string entries', () => {
    localStorage.setItem('cornerstone.capture.recentAreas.u1', '{"a":1}');
    expect(readRecentTags('area', 'u1', ALL('a'))).toEqual([]);

    localStorage.setItem('cornerstone.capture.recentAreas.u1', JSON.stringify(['a', 3, null, 'b']));
    expect(readRecentTags('area', 'u1', ALL('a', 'b'))).toEqual(['a', 'b']);
  });

  it('stays silent when storage throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    expect(readRecentTags('area', 'u1', ALL('a'))).toEqual([]);
    expect(() => pushRecentTag('area', 'u1', 'a')).not.toThrow();
  });
});
