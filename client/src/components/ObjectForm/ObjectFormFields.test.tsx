/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { ObjectFormFields } from './ObjectFormFields.js';
import type { ObjectFormFieldsProps } from './ObjectFormFields.js';
import type { ObjectFormField, ObjectFormValues } from './types.js';

const FIELDS: readonly ObjectFormField[] = [
  { name: 'title', label: 'Title', kind: 'text', required: true, hint: 'Short and clear' },
  { name: 'notes', label: 'Notes', kind: 'textarea' },
  { name: 'due', label: 'Due', kind: 'date' },
  {
    name: 'hidden',
    label: 'Hidden one',
    kind: 'text',
    visibleWhen: (values) => values.showHidden === true,
  },
  { name: 'color', label: 'Colour', kind: 'color' },
];

function setup(props: Partial<ObjectFormFieldsProps> = {}) {
  const onChange = jest.fn<(name: string, value: unknown) => void>();
  const utils = render(
    <ObjectFormFields
      fields={FIELDS}
      names={['title', 'notes', 'due']}
      values={{ title: 'Roof', notes: '', due: '' }}
      errors={{}}
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange, ...utils };
}

const renderedNames = () =>
  Array.from(document.querySelectorAll('[data-field]')).map((el) => el.getAttribute('data-field'));

describe('ObjectFormFields', () => {
  it('renders only the listed fields, in the listed order', () => {
    setup({ names: ['due', 'title'] });
    expect(renderedNames()).toEqual(['due', 'title']);
    expect(screen.queryByLabelText('Notes')).toBeNull();
  });

  it('skips names the schema does not have (out of scope) without failing', () => {
    setup({ names: ['title', 'nope', 'due'] });
    expect(renderedNames()).toEqual(['title', 'due']);
  });

  it('skips a field whose visibleWhen is false and shows it once true', () => {
    const { rerender, onChange } = setup({ names: ['title', 'hidden'] });
    expect(renderedNames()).toEqual(['title']);
    rerender(
      <ObjectFormFields
        fields={FIELDS}
        names={['title', 'hidden']}
        values={{ title: 'Roof', showHidden: true }}
        errors={{}}
        onChange={onChange}
      />,
    );
    expect(renderedNames()).toEqual(['title', 'hidden']);
  });

  it('renders the field markup with value, label, required marker and hint', () => {
    setup();
    const title = screen.getByLabelText(/^Title/) as HTMLInputElement;
    expect(title.value).toBe('Roof');
    expect(title).toHaveAttribute('aria-required', 'true');
    expect(screen.getByText('Short and clear')).toHaveAttribute('id', 'title-hint');
    expect(title).toHaveAttribute('aria-describedby', 'title-hint');
  });

  it('has no "More details" disclosure: every listed field shows', () => {
    setup();
    expect(screen.queryByTestId('object-form-more')).toBeNull();
    expect(screen.queryByRole('button', { name: /more details/i })).toBeNull();
  });

  it('uses the field name as the DOM id by default', () => {
    setup();
    expect(screen.getByLabelText(/^Title/)).toHaveAttribute('id', 'title');
  });

  it('prefixes DOM ids with idPrefix', () => {
    setup({ idPrefix: ':r1:-' });
    const title = screen.getByLabelText(/^Title/);
    expect(title).toHaveAttribute('id', ':r1:-title');
    expect(title).toHaveAttribute('name', 'title');
    expect(screen.getByText('Short and clear')).toHaveAttribute('id', ':r1:-title-hint');
  });

  it('lets ids override the prefixed id for one field only', () => {
    setup({ idPrefix: 'p-', ids: { due: 'milestone-target-date' } });
    expect(screen.getByLabelText('Due')).toHaveAttribute('id', 'milestone-target-date');
    expect(screen.getByLabelText('Notes')).toHaveAttribute('id', 'p-notes');
  });

  it('lets testIds override the control test id', () => {
    setup({ testIds: { title: 'task-title-input' } });
    expect(screen.getByTestId('task-title-input')).toBe(screen.getByLabelText(/^Title/));
  });

  it('passes the test id override to the colour field as its prefix', () => {
    setup({ names: ['color'], values: {}, testIds: { color: 'milestone-color' } });
    expect(screen.getByTestId('milestone-color-color')).toBeInTheDocument();
    expect(screen.getByTestId('milestone-color-no-color')).toBeInTheDocument();
  });

  it('shows an error under its field with aria-invalid and aria-describedby to the error id', () => {
    setup({ idPrefix: 'p-', errors: { title: 'Title is required' } });
    const title = screen.getByLabelText(/^Title/);
    const message = screen.getByText('Title is required');
    expect(message).toHaveAttribute('id', 'p-title-error');
    expect(message.closest('[data-field]')).toHaveAttribute('data-field', 'title');
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title.getAttribute('aria-describedby')?.split(' ')).toContain('p-title-error');
    expect(screen.getByLabelText('Notes')).not.toHaveAttribute('aria-invalid');
  });

  it('shows no error for a field that is not rendered', () => {
    setup({ names: ['title'], errors: { notes: 'Notes are bad' } });
    expect(screen.queryByText('Notes are bad')).toBeNull();
  });

  it('reports each change as onChange(name, value)', () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Walls' } });
    expect(onChange).toHaveBeenCalledWith('title', 'Walls');
    fireEvent.change(screen.getByLabelText('Due'), { target: { value: '2026-05-01' } });
    expect(onChange).toHaveBeenLastCalledWith('due', '2026-05-01');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('fans a custom field setValues out to onChange, one call per key', () => {
    const fields: readonly ObjectFormField[] = [
      {
        name: 'combo',
        label: 'Combo',
        kind: 'custom',
        render: (ctx) => (
          <button type="button" onClick={() => ctx.setValues({ a: 1, b: 'two' }, 'Filled.')}>
            fill
          </button>
        ),
      },
    ];
    const { onChange } = setup({ fields, names: ['combo'], values: {} });
    fireEvent.click(screen.getByText('fill'));
    expect(onChange.mock.calls).toEqual([
      ['a', 1],
      ['b', 'two'],
    ]);
  });

  it('is a no-op for a child step (cards never create from a picker)', () => {
    const fields: readonly ObjectFormField[] = [
      {
        name: 'combo',
        label: 'Combo',
        kind: 'custom',
        render: (ctx) => (
          <button
            type="button"
            onClick={() =>
              ctx.createChild({
                schema: {
                  id: 'c',
                  title: 'C',
                  fields: [],
                  initialValues: {},
                  validate: () => ({}),
                  submit: () => Promise.resolve({ id: '1', href: '/x', label: 'x' }),
                },
                onCreated: () => {},
              })
            }
          >
            child
          </button>
        ),
      },
    ];
    const { onChange } = setup({ fields, names: ['combo'], values: {} });
    expect(() => fireEvent.click(screen.getByText('child'))).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('makes controls read-only while busy and ignores custom changes', () => {
    const values: ObjectFormValues = { title: 'Roof' };
    const { onChange } = setup({ busy: true, values, names: ['title'] });
    expect(screen.getByLabelText(/^Title/)).toHaveAttribute('readonly');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('errorFrom (#2255)', () => {
  const LINKED: readonly ObjectFormField[] = [
    { name: 'first', label: 'First', kind: 'text' },
    { name: 'last', label: 'Last', kind: 'text', errorFrom: 'first' },
  ];

  it('links the second field to the first field error through the id prefix', () => {
    setup({
      fields: LINKED,
      names: ['first', 'last'],
      values: {},
      errors: { first: 'Name needed' },
      idPrefix: 'card-1-',
    });
    expect(screen.getAllByText('Name needed')).toHaveLength(1);
    const last = screen.getByLabelText('Last');
    expect(last).toHaveAttribute('aria-invalid', 'true');
    expect(last).toHaveAttribute('aria-describedby', 'card-1-first-error');
    expect(document.getElementById('card-1-first-error')).toHaveTextContent('Name needed');
  });

  it('uses the ids override of the source field when given', () => {
    setup({
      fields: LINKED,
      names: ['first', 'last'],
      values: {},
      errors: { first: 'Name needed' },
      idPrefix: 'p-',
      ids: { first: 'custom-first' },
    });
    expect(screen.getByLabelText('Last')).toHaveAttribute('aria-describedby', 'custom-first-error');
    expect(document.getElementById('custom-first-error')).not.toBeNull();
  });

  it('leaves the second field valid while the source field has no error', () => {
    setup({ fields: LINKED, names: ['first', 'last'], values: {}, errors: {} });
    expect(screen.getByLabelText('Last')).not.toHaveAttribute('aria-invalid');
  });
});
