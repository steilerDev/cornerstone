import { describe, it, expect } from '@jest/globals';
import {
  adjustForOptions,
  clearResolvedError,
  firstErrorField,
  hasValue,
  initialFocusName,
  isDirty,
  isMoreField,
  mapPrefill,
  moreIsEmpty,
  resetValues,
  serverFieldErrors,
  startsExpanded,
  startValues,
} from './objectFormState.js';
import type { ObjectFormField, ObjectFormSchema } from './types.js';

const f = (over: Partial<ObjectFormField> & { name: string }): ObjectFormField => ({
  label: over.name,
  kind: 'text',
  ...over,
});

const schema = (
  fields: ObjectFormField[],
  over: Partial<ObjectFormSchema> = {},
): ObjectFormSchema => ({
  id: 's',
  title: 'S',
  fields,
  initialValues: { a: '', b: '' },
  validate: () => ({}),
  submit: () => Promise.resolve({ id: '1', href: '/x', label: 'x' }),
  ...over,
});

describe('hasValue', () => {
  it('treats blank strings, empty arrays, null and undefined as empty', () => {
    expect(hasValue(undefined)).toBe(false);
    expect(hasValue(null)).toBe(false);
    expect(hasValue('  ')).toBe(false);
    expect(hasValue([])).toBe(false);
    expect(hasValue('x')).toBe(true);
    expect(hasValue(['x'])).toBe(true);
    expect(hasValue(0)).toBe(true);
    expect(hasValue(false)).toBe(true);
  });
});

describe('isDirty', () => {
  it('is false for equal maps and true for any changed field', () => {
    expect(isDirty({ a: '1' }, { a: '1' })).toBe(false);
    expect(isDirty({ a: '2' }, { a: '1' })).toBe(true);
  });
  it('compares arrays by content', () => {
    expect(isDirty({ a: ['x'] }, { a: ['x'] })).toBe(false);
    expect(isDirty({ a: ['x', 'y'] }, { a: ['x'] })).toBe(true);
  });
  it('notices keys present on only one side', () => {
    expect(isDirty({ a: '1', b: 'x' }, { a: '1' })).toBe(true);
    expect(isDirty({ a: '1' }, { a: '1', b: 'x' })).toBe(true);
  });
});

describe('mapPrefill', () => {
  it('maps pre-fill keys to field names through the schema', () => {
    const s = schema([], { prefill: { areaId: 'area', date: 'targetDate' } });
    expect(mapPrefill(s, { areaId: 'a1', date: '2026-03-01', companyId: 'c' })).toEqual({
      area: 'a1',
      targetDate: '2026-03-01',
    });
  });
  it('returns nothing without a schema mapping', () => {
    expect(mapPrefill(schema([]), { areaId: 'a1' })).toEqual({});
  });
});

describe('startValues / resetValues', () => {
  const s = schema([f({ name: 'a', keep: true }), f({ name: 'b' })], {
    initialValues: { a: 'd', b: 'e' },
  });
  it('merges pre-fill over the defaults', () => {
    expect(startValues(s, { a: 'p' })).toEqual({ a: 'p', b: 'e' });
    expect(startValues(s, undefined)).toEqual({ a: 'd', b: 'e' });
  });
  it('keeps only "keep" fields on reset', () => {
    expect(resetValues(s, undefined, { a: 'cur', b: 'cur' })).toEqual({ a: 'cur', b: 'e' });
  });
});

describe('more details helpers', () => {
  const s = schema([f({ name: 'a', essential: true }), f({ name: 'b' })]);
  it('isMoreField is true for non-essential fields', () => {
    expect(isMoreField(s.fields[0]!)).toBe(false);
    expect(isMoreField(s.fields[1]!)).toBe(true);
  });
  it('startsExpanded only for a pre-filled non-essential field', () => {
    expect(startsExpanded(s, undefined)).toBe(false);
    expect(startsExpanded(s, { a: 'x' })).toBe(false);
    expect(startsExpanded(s, { b: 'x' })).toBe(true);
  });
  it('moreIsEmpty reflects values of non-essential fields only', () => {
    expect(moreIsEmpty(s, { a: 'x', b: '' })).toBe(true);
    expect(moreIsEmpty(s, { b: 'x' })).toBe(false);
  });
});

describe('firstErrorField / clearResolvedError', () => {
  const fields = [f({ name: 'a' }), f({ name: 'b' })];
  it('finds the first field in schema order that has an error', () => {
    expect(firstErrorField(fields, { b: 'e', a: 'e' })?.name).toBe('a');
    expect(firstErrorField(fields, {})).toBeUndefined();
  });
  it('clears an error that validation no longer reports', () => {
    expect(clearResolvedError({ a: 'x', b: 'y' }, 'a', {})).toEqual({ b: 'y' });
  });
  it('keeps the same object when nothing changes', () => {
    const errors = { a: 'x' };
    expect(clearResolvedError(errors, 'a', { a: 'still' })).toBe(errors);
    expect(clearResolvedError(errors, 'b', {})).toBe(errors);
  });
});

describe('initialFocusName', () => {
  const fields = [
    f({ name: 'a', essential: true }),
    f({ name: 'b', essential: true, required: true }),
    f({ name: 'c', required: true }),
  ];
  it('picks the first empty required visible field', () => {
    expect(initialFocusName(fields, { a: '', b: '' }, false)).toBe('b');
  });
  it('falls back to the first visible field when required ones are filled', () => {
    expect(initialFocusName(fields, { b: 'x' }, false)).toBe('a');
  });
  it('considers More details fields only when expanded', () => {
    const only = [f({ name: 'a', essential: true }), f({ name: 'c', required: true })];
    expect(initialFocusName(only, {}, false)).toBe('a');
    expect(initialFocusName(only, {}, true)).toBe('c');
  });
  it('is undefined without fields', () => {
    expect(initialFocusName([], {}, true)).toBeUndefined();
  });
});

describe('adjustForOptions', () => {
  const sel = (over: Partial<ObjectFormField> = {}) =>
    f({
      name: 'sel',
      kind: 'select',
      options: [
        { value: '', label: 'none' },
        { value: 'x', label: 'X' },
      ],
      ...over,
    });

  it('clears an unknown untouched id in values and initial (never dirty)', () => {
    const r = adjustForOptions([sel()], { sel: 'gone' }, { sel: 'gone' });
    expect(r.values.sel).toBe('');
    expect(r.initial.sel).toBe('');
  });
  it('keeps a known id', () => {
    const values = { sel: 'x' };
    const initial = { sel: 'x' };
    const r = adjustForOptions([sel()], values, initial);
    expect(r.values).toBe(values);
    expect(r.initial).toBe(initial);
  });
  it('does not touch a changed field', () => {
    const values = { sel: 'gone' };
    expect(adjustForOptions([sel()], values, { sel: '' }).values).toBe(values);
  });
  it('applies defaultFromOptions first (skipping the empty option) without dirtying', () => {
    const r = adjustForOptions([sel({ defaultFromOptions: 'first' })], { sel: '' }, { sel: '' });
    expect(r.values.sel).toBe('x');
    expect(r.initial.sel).toBe('x');
  });
  it('skips a field without options (undefined) and a field whose options are loading', () => {
    const values = { a: 'q', sel: 'q' };
    const fields = [
      f({ name: 'a' }),
      sel({ options: undefined }),
      sel({ optionsLoading: true, options: [] }),
    ];
    expect(adjustForOptions(fields, values, values).values).toBe(values);
  });
  it('clears an unknown value of a custom field that has options, in values and initial', () => {
    const custom = f({
      name: 'area',
      kind: 'custom',
      options: [{ value: 'a1', label: 'Kitchen' }],
    });
    const r = adjustForOptions([custom], { area: 'gone' }, { area: 'gone' });
    expect(r.values.area).toBe('');
    expect(r.initial.area).toBe('');
    expect(isDirty(r.values, r.initial)).toBe(false);
  });
  it('keeps a known value of a custom field', () => {
    const custom = f({ name: 'area', kind: 'custom', options: [{ value: 'a1', label: 'K' }] });
    const values = { area: 'a1' };
    expect(adjustForOptions([custom], values, values).values).toBe(values);
  });
  it('a loaded empty list clears the value', () => {
    const custom = f({ name: 'area', kind: 'custom', options: [] });
    const r = adjustForOptions([custom], { area: 'gone' }, { area: 'gone' });
    expect(r.values.area).toBe('');
    expect(isDirty(r.values, r.initial)).toBe(false);
  });
  it('a loading custom field keeps its value until the options arrive', () => {
    const custom = f({ name: 'area', kind: 'custom', optionsLoading: true, options: [] });
    const values = { area: 'a1' };
    expect(adjustForOptions([custom], values, values).values).toBe(values);
  });
  it('does nothing when the value already equals the replacement', () => {
    const values = { sel: '' };
    expect(adjustForOptions([sel()], values, values).values).toBe(values);
  });
});

describe('serverFieldErrors', () => {
  const names = ['title', 'area'];
  it('maps /path entries to field names, de-duplicated', () => {
    expect(
      serverFieldErrors(
        { fields: [{ path: '/title' }, { path: '/title/0' }, { path: '/area' }] },
        names,
      ),
    ).toEqual({ fields: ['title', 'area'], unmapped: false });
  });
  it('flags unmapped paths so the banner shows too', () => {
    expect(serverFieldErrors({ fields: [{ path: '/title' }, { path: '/zzz' }] }, names)).toEqual({
      fields: ['title'],
      unmapped: true,
    });
  });
  it('is unmapped without usable details', () => {
    expect(serverFieldErrors(undefined, names)).toEqual({ fields: [], unmapped: true });
    expect(serverFieldErrors({ fields: 'x' }, names)).toEqual({ fields: [], unmapped: true });
    expect(serverFieldErrors({ fields: [null, { path: 3 }, 'x'] }, names)).toEqual({
      fields: [],
      unmapped: true,
    });
  });
  it('never exposes the server message', () => {
    const r = serverFieldErrors({ fields: [{ path: '/title', message: 'server text' }] }, names);
    expect(JSON.stringify(r)).not.toContain('server text');
  });
});
