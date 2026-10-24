import { describe, it, expect } from '@jest/globals';
import {
  firstErrorField,
  initialFocusName,
  isFieldVisible,
  moreIsEmpty,
  startsExpanded,
  visibleFields,
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
  initialValues: { a: '', b: '', c: '' },
  validate: () => ({}),
  submit: () => Promise.resolve({ id: '1', href: '/x', label: 'x' }),
  ...over,
});

const onlyWhenFlag = (values: Record<string, unknown>) => values.flag === true;

describe('isFieldVisible / visibleFields', () => {
  it('shows a field without visibleWhen always', () => {
    expect(isFieldVisible(f({ name: 'a' }), {})).toBe(true);
  });

  it('asks visibleWhen with the current values', () => {
    const field = f({ name: 'a', visibleWhen: onlyWhenFlag });
    expect(isFieldVisible(field, { flag: true })).toBe(true);
    expect(isFieldVisible(field, { flag: false })).toBe(false);
  });

  it('keeps schema order and drops hidden fields', () => {
    const fields = [
      f({ name: 'a' }),
      f({ name: 'b', visibleWhen: onlyWhenFlag }),
      f({ name: 'c' }),
    ];
    expect(visibleFields(fields, { flag: false }).map((x) => x.name)).toEqual(['a', 'c']);
    expect(visibleFields(fields, { flag: true }).map((x) => x.name)).toEqual(['a', 'b', 'c']);
  });
});

describe('hidden fields take no part in focus, errors or More details', () => {
  it('skips a hidden required field for the initial focus', () => {
    const fields = [
      f({ name: 'a', required: true, essential: true, visibleWhen: onlyWhenFlag }),
      f({ name: 'b', essential: true }),
    ];
    expect(initialFocusName(fields, { flag: false }, false)).toBe('b');
    expect(initialFocusName(fields, { flag: true }, false)).toBe('a');
  });

  it('has no focus target when every field is hidden', () => {
    expect(
      initialFocusName([f({ name: 'a', essential: true, visibleWhen: () => false })], {}, false),
    ).toBeUndefined();
  });

  it('does not count a hidden More field as a value in More details', () => {
    const s = schema([
      f({ name: 'a', essential: true }),
      f({ name: 'b', visibleWhen: onlyWhenFlag }),
    ]);
    expect(moreIsEmpty(s, { flag: false, b: 'kept' })).toBe(true);
    expect(moreIsEmpty(s, { flag: true, b: 'kept' })).toBe(false);
  });

  it('does not start expanded for a prefilled hidden More field', () => {
    const s = schema([
      f({ name: 'a', essential: true }),
      f({ name: 'b', visibleWhen: () => false }),
    ]);
    expect(startsExpanded(s, { b: 'prefilled' })).toBe(false);
    const shown = schema([f({ name: 'a', essential: true }), f({ name: 'b' })]);
    expect(startsExpanded(shown, { b: 'prefilled' })).toBe(true);
  });

  it('judges visibility for the prefill merged over the initial values', () => {
    const s = schema(
      [f({ name: 'a', essential: true }), f({ name: 'b', visibleWhen: onlyWhenFlag })],
      {
        initialValues: { a: '', b: '', flag: true },
      },
    );
    expect(startsExpanded(s, { b: 'prefilled' })).toBe(true);
  });

  it('ignores an error on a hidden field when it is filtered first', () => {
    const fields = [f({ name: 'a', visibleWhen: onlyWhenFlag }), f({ name: 'b' })];
    const errors = { a: 'bad', b: 'bad' };
    expect(firstErrorField(visibleFields(fields, { flag: false }), errors)?.name).toBe('b');
  });
});
