import { describe, it, expect } from '@jest/globals';
import {
  forwardOriginState,
  originHrefOr,
  originStateFor,
  pathnameOf,
  readOrigin,
} from './origin.js';

describe('readOrigin', () => {
  it('accepts an in-app URL with query and hash, and a name', () => {
    expect(readOrigin({ origin: { to: '/a?b#c', name: 'N' } })).toEqual({
      to: '/a?b#c',
      name: 'N',
    });
  });

  it('accepts an origin without a name', () => {
    expect(readOrigin({ origin: { to: '/schedule/gantt' } })).toEqual({ to: '/schedule/gantt' });
  });

  it.each([
    ['null state', null],
    ['undefined state', undefined],
    ['a string state', 'x'],
    ['a number state', 3],
    ['missing origin', {}],
    ['a null origin', { origin: null }],
    ['a string origin', { origin: '/a' }],
    ['a non-string to', { origin: { to: 5 } }],
    ['a missing to', { origin: { name: 'x' } }],
    ['a relative to', { origin: { to: 'a/b' } }],
    ['a protocol-relative to', { origin: { to: '//evil.example' } }],
    ['a backslash to', { origin: { to: '/\\evil' } }],
    ['a javascript: to', { origin: { to: 'javascript:alert(1)' } }],
    ['an absolute http to', { origin: { to: 'https://evil.example/x' } }],
    ['a tab-led protocol-relative to', { origin: { to: '/\t/evil.example' } }],
    ['a newline in to', { origin: { to: '/\n/x' } }],
    ['a carriage return in to', { origin: { to: '/\r/x' } }],
    ['a DEL character in to', { origin: { to: '/a\u007Fb' } }],
  ])('rejects %s', (_label, state) => {
    expect(readOrigin(state)).toBeNull();
  });

  it('trims the name', () => {
    expect(readOrigin({ origin: { to: '/a', name: '  Sofa  ' } })).toEqual({
      to: '/a',
      name: 'Sofa',
    });
  });

  it('drops an empty, whitespace, non-string or over-long name but keeps the origin', () => {
    expect(readOrigin({ origin: { to: '/a', name: '' } })).toEqual({ to: '/a' });
    expect(readOrigin({ origin: { to: '/a', name: '   ' } })).toEqual({ to: '/a' });
    expect(readOrigin({ origin: { to: '/a', name: 7 } })).toEqual({ to: '/a' });
    expect(readOrigin({ origin: { to: '/a', name: 'x'.repeat(201) } })).toEqual({ to: '/a' });
  });

  it('keeps a name of exactly 200 characters', () => {
    const name = 'x'.repeat(200);
    expect(readOrigin({ origin: { to: '/a', name } })).toEqual({ to: '/a', name });
  });
});

describe('originStateFor', () => {
  it('concatenates pathname, search and hash', () => {
    expect(originStateFor({ pathname: '/p', search: '?q=1', hash: '#h' })).toEqual({
      origin: { to: '/p?q=1#h' },
    });
  });

  it('trims the name and omits blank names', () => {
    const loc = { pathname: '/p', search: '', hash: '' };
    expect(originStateFor(loc, '  Sofa ')).toEqual({ origin: { to: '/p', name: 'Sofa' } });
    expect(originStateFor(loc, '  ')).toEqual({ origin: { to: '/p' } });
    expect(originStateFor(loc, null)).toEqual({ origin: { to: '/p' } });
  });
});

describe('forwardOriginState', () => {
  it('returns a valid origin state and drops unrelated state', () => {
    expect(forwardOriginState({ origin: { to: '/a', name: 'N' }, other: 1 })).toEqual({
      origin: { to: '/a', name: 'N' },
    });
  });

  it('returns undefined for invalid state', () => {
    expect(forwardOriginState(null)).toBeUndefined();
    expect(forwardOriginState({ origin: { to: '//evil' } })).toBeUndefined();
  });
});

describe('originHrefOr', () => {
  it('returns the origin URL when valid, else the fallback', () => {
    expect(originHrefOr({ origin: { to: '/a?x=1' } }, '/fallback')).toBe('/a?x=1');
    expect(originHrefOr(null, '/fallback')).toBe('/fallback');
    expect(originHrefOr({ origin: { to: 'javascript:1' } }, '/fallback')).toBe('/fallback');
  });
});

describe('pathnameOf', () => {
  it('strips query and hash', () => {
    expect(pathnameOf('/a/b?c#d')).toBe('/a/b');
    expect(pathnameOf('/a/b#d')).toBe('/a/b');
    expect(pathnameOf('/a/b?c')).toBe('/a/b');
  });

  it('returns a plain path unchanged', () => {
    expect(pathnameOf('/a/b')).toBe('/a/b');
  });
});
