import { describe, it, expect } from '@jest/globals';
import {
  DIALOG_ROUTE_IDS,
  backgroundStateFor,
  dialogParentRoute,
  displayLocationFor,
  hasCreateOpener,
  matchDialogRoute,
  readBackground,
} from './dialogRoutes.js';
import type { BackgroundLocation } from './dialogRoutes.js';

const bg = (over: Record<string, unknown> = {}) => ({
  background: {
    pathname: '/project/work-items',
    search: '?q=a',
    hash: '',
    key: 'k1',
    state: { origin: 'x' },
    ...over,
  },
});

describe('matchDialogRoute / dialogParentRoute', () => {
  it('matches the three dialog routes and nothing else', () => {
    expect(DIALOG_ROUTE_IDS).toEqual(['workItemNew', 'householdItemNew', 'milestoneNew']);
    expect(matchDialogRoute('/project/work-items/new')).toBe('workItemNew');
    expect(matchDialogRoute('/project/work-items')).toBeNull();
    expect(matchDialogRoute('/nowhere/at/all')).toBeNull();
  });

  it('pins the parent list of each dialog route', () => {
    expect(dialogParentRoute('workItemNew')).toBe('workItems');
    expect(dialogParentRoute('householdItemNew')).toBe('householdItems');
    expect(dialogParentRoute('milestoneNew')).toBe('milestones');
  });
});

describe('readBackground', () => {
  it('accepts a safe app path and keeps its fields', () => {
    expect(readBackground(bg())).toEqual({
      pathname: '/project/work-items',
      search: '?q=a',
      hash: '',
      key: 'k1',
      state: { origin: 'x' },
    });
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'x'],
    ['no background', {}],
    ['null background', { background: null }],
    ['string background', { background: '/x' }],
  ])('rejects non-object input: %s', (_n, state) => {
    expect(readBackground(state)).toBeNull();
  });

  it.each([
    ['protocol-relative', { pathname: '//evil.example/x' }],
    ['backslash', { pathname: '/\\evil.example' }],
    ['absolute url', { pathname: 'https://evil.example/' }],
    ['control chars', { pathname: '/a\u0000b' }],
    ['newline in search', { search: '?a=\n1' }],
    ['a dialog pathname', { pathname: '/project/work-items/new' }],
    ['missing key', { key: undefined }],
    ['numeric key', { key: 3 }],
    ['non-string search', { search: 1 }],
    ['non-string hash', { hash: null }],
    ['non-string pathname', { pathname: 7 }],
  ])('rejects %s', (_n, over) => {
    expect(readBackground(bg(over))).toBeNull();
  });

  it('strips a nested background from the kept state', () => {
    const result = readBackground(bg({ state: { origin: 'o', background: { pathname: '/x' } } }));
    expect(result?.state).toEqual({ origin: 'o' });
  });

  it('keeps a non-object nested state as is', () => {
    expect(readBackground(bg({ state: undefined }))?.state).toBeUndefined();
    expect(readBackground(bg({ state: null }))?.state).toBeNull();
  });
});

describe('backgroundStateFor', () => {
  it('wraps the location and drops its own background', () => {
    const loc: BackgroundLocation = {
      pathname: '/a',
      search: '?x=1',
      hash: '#h',
      key: 'k',
      state: { origin: 'o', background: { pathname: '/z' } },
    };
    expect(backgroundStateFor(loc)).toEqual({
      background: { pathname: '/a', search: '?x=1', hash: '#h', key: 'k', state: { origin: 'o' } },
    });
  });
});

describe('displayLocationFor', () => {
  const real = (pathname: string, state: unknown = null): BackgroundLocation => ({
    pathname,
    search: '?areaId=a1',
    hash: '#x',
    state,
    key: 'real',
  });

  it('returns the real location outside dialog routes', () => {
    const r = real('/project/work-items');
    expect(displayLocationFor(r)).toBe(r);
  });

  it('renders the validated background on a dialog route', () => {
    const d = displayLocationFor(real('/project/work-items/new', bg()));
    expect(d.pathname).toBe('/project/work-items');
    expect(d.search).toBe('?q=a');
    expect(d.key).toBe('k1');
  });

  it('falls back to the parent list with an empty search in deep-link mode', () => {
    const state = { origin: 'o' };
    const d = displayLocationFor(real('/project/work-items/new', state));
    expect(d.pathname).toBe('/project/work-items');
    expect(d.search).toBe('');
    expect(d.hash).toBe('');
    expect(d.state).toBe(state);
    expect(d.key).toBe('real');
  });

  it('treats an unsafe background as deep-link mode', () => {
    const d = displayLocationFor(
      real('/project/work-items/new', bg({ pathname: '//evil.example' })),
    );
    expect(d.pathname).toBe('/project/work-items');
    expect(d.search).toBe('');
  });
});

describe('hasCreateOpener', () => {
  it('is true only for createOpener === true', () => {
    expect(hasCreateOpener({ createOpener: true })).toBe(true);
    expect(hasCreateOpener({ createOpener: 'yes' })).toBe(false);
    expect(hasCreateOpener({})).toBe(false);
    expect(hasCreateOpener(null)).toBe(false);
    expect(hasCreateOpener('x')).toBe(false);
  });
});
