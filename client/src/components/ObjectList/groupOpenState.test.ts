/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { readGroupOpen, writeGroupOpen } from './groupOpenState.js';

describe('groupOpenState', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('round-trips under objectList:<list>:<group>', () => {
    writeGroupOpen('tasks', 'area', { a: true, b: false });
    expect(sessionStorage.getItem('objectList:tasks:area')).toBe('{"a":true,"b":false}');
    expect(readGroupOpen('tasks', 'area')).toEqual({ a: true, b: false });
    expect(readGroupOpen('tasks', 'other')).toEqual({});
  });

  it('returns {} for corrupt JSON, non-objects and arrays', () => {
    sessionStorage.setItem('objectList:t:g', '{nope');
    expect(readGroupOpen('t', 'g')).toEqual({});
    sessionStorage.setItem('objectList:t:g', 'null');
    expect(readGroupOpen('t', 'g')).toEqual({});
    sessionStorage.setItem('objectList:t:g', '"s"');
    expect(readGroupOpen('t', 'g')).toEqual({});
    sessionStorage.setItem('objectList:t:g', '[true]');
    expect(readGroupOpen('t', 'g')).toEqual({});
  });

  it('drops non-boolean values', () => {
    sessionStorage.setItem('objectList:t:g', '{"a":true,"b":"yes","c":1}');
    expect(readGroupOpen('t', 'g')).toEqual({ a: true });
  });

  it('survives storage that throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readGroupOpen('t', 'g')).toEqual({});
    expect(() => writeGroupOpen('t', 'g', { a: true })).not.toThrow();
  });
});
