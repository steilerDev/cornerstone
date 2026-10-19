/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { clearStickyTags, readStickyTags, writeStickyTags } from './stickyTags.js';

describe('stickyTags', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null when nothing was written', () => {
    expect(readStickyTags('d1')).toBeNull();
  });

  it('round-trips the chips of one draft', () => {
    writeStickyTags('d1', { areaId: 'kitchen', orientationId: 'north' });

    expect(readStickyTags('d1')).toEqual({ areaId: 'kitchen', orientationId: 'north' });
    expect(sessionStorage.getItem('cornerstone.capture.tags.d1')).not.toBeNull();
  });

  it('keeps drafts apart (per-draft sticky tags)', () => {
    writeStickyTags('d1', { areaId: 'a', orientationId: null });
    writeStickyTags('d2', { areaId: 'b', orientationId: 'o' });

    expect(readStickyTags('d1')).toEqual({ areaId: 'a', orientationId: null });
    expect(readStickyTags('d2')).toEqual({ areaId: 'b', orientationId: 'o' });
  });

  it('clear removes only that draft', () => {
    writeStickyTags('d1', { areaId: 'a', orientationId: null });
    writeStickyTags('d2', { areaId: 'b', orientationId: null });

    clearStickyTags('d1');

    expect(readStickyTags('d1')).toBeNull();
    expect(readStickyTags('d2')).not.toBeNull();
  });

  it('tolerates malformed JSON and non-object values', () => {
    sessionStorage.setItem('cornerstone.capture.tags.d1', '{oops');
    expect(readStickyTags('d1')).toBeNull();

    sessionStorage.setItem('cornerstone.capture.tags.d1', '"text"');
    expect(readStickyTags('d1')).toBeNull();

    sessionStorage.setItem('cornerstone.capture.tags.d1', 'null');
    expect(readStickyTags('d1')).toBeNull();
  });

  it('turns empty or non-string ids into null', () => {
    sessionStorage.setItem(
      'cornerstone.capture.tags.d1',
      JSON.stringify({ areaId: '', orientationId: 7 }),
    );

    expect(readStickyTags('d1')).toEqual({ areaId: null, orientationId: null });
  });

  it('stays silent when sessionStorage throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(readStickyTags('d1')).toBeNull();
    expect(() => writeStickyTags('d1', { areaId: 'a', orientationId: null })).not.toThrow();
    expect(() => clearStickyTags('d1')).not.toThrow();
  });
});
