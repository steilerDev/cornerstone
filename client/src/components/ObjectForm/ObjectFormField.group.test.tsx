/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { ObjectFormField } from './ObjectFormField.js';
import type { ObjectFormField as FieldDef, ObjectFormRenderContext } from './types.js';

function setup(
  field: Partial<FieldDef> & { kind: FieldDef['kind'] },
  props: { values?: Record<string, unknown>; error?: string } = {},
) {
  return render(
    <ObjectFormField
      field={{ name: 'f', label: 'Label', ...field }}
      value=""
      values={props.values}
      error={props.error}
      busy={false}
      onChange={() => {}}
      onSetValues={() => {}}
      createChild={() => {}}
    />,
  );
}

describe('ObjectFormField group', () => {
  it('renders a custom group field as a fieldset with a legend instead of a label', () => {
    const { container } = setup({
      kind: 'custom',
      group: true,
      required: true,
      hint: 'A hint',
      render: (ctx) => <div id={ctx.id} role="radiogroup" />,
    });
    const fieldset = container.querySelector('fieldset');
    expect(fieldset).not.toBeNull();
    expect(fieldset?.querySelector('legend')).toHaveTextContent('Label');
    expect(fieldset?.querySelector('legend')).toHaveTextContent('required');
    expect(container.querySelector('label')).toBeNull();
    expect(screen.getByRole('group', { name: /Label/ })).toBe(fieldset);
    expect(fieldset).toHaveAttribute('aria-describedby', 'f-hint');
  });

  it('points the fieldset at the error when there is one', () => {
    const { container } = setup(
      {
        kind: 'custom',
        group: true,
        hint: 'A hint',
        render: () => <div />,
      },
      { error: 'Nope' },
    );
    expect(container.querySelector('fieldset')?.getAttribute('aria-describedby')).toContain(
      'f-error',
    );
    expect(screen.getByText('Nope')).toBeInTheDocument();
  });

  it('keeps a label for a custom field without group and for non-custom kinds with group', () => {
    const plain = setup({ kind: 'custom', render: (ctx) => <input id={ctx.id} /> });
    expect(plain.container.querySelector('fieldset')).toBeNull();
    expect(plain.container.querySelector('label')).not.toBeNull();
    plain.unmount();
    const text = setup({ kind: 'text', group: true });
    expect(text.container.querySelector('fieldset')).toBeNull();
    expect(screen.getByLabelText('Label')).toBeInTheDocument();
  });
});

describe('ObjectFormField values', () => {
  it('hands the values of the step to custom renderers', () => {
    let seen: ObjectFormRenderContext['values'] | undefined;
    setup(
      {
        kind: 'custom',
        render: (ctx) => {
          seen = ctx.values;
          return <input id={ctx.id} />;
        },
      },
      { values: { other: 'x' } },
    );
    expect(seen).toEqual({ other: 'x' });
  });

  it('hands an empty map when no values are passed', () => {
    let seen: ObjectFormRenderContext['values'] | undefined;
    setup({
      kind: 'custom',
      render: (ctx) => {
        seen = ctx.values;
        return <input id={ctx.id} />;
      },
    });
    expect(seen).toEqual({});
  });
});
