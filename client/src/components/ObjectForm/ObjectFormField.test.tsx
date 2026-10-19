/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { ObjectFormField } from './ObjectFormField.js';
import type { ObjectFormFieldProps } from './ObjectFormField.js';
import type { ObjectFormField as FieldDef } from './types.js';

function setup(
  field: Partial<FieldDef> & { kind: FieldDef['kind'] },
  props: Partial<ObjectFormFieldProps> = {},
) {
  const onChange = jest.fn<(v: unknown) => void>();
  const createChild = jest.fn();
  const utils = render(
    <ObjectFormField
      field={{ name: 'f', label: 'Label', ...field }}
      value=""
      error={undefined}
      busy={false}
      onChange={onChange}
      createChild={createChild}
      {...props}
    />,
  );
  return { onChange, createChild, ...utils };
}

describe('ObjectFormField kinds', () => {
  it.each([
    ['text', 'text'],
    ['number', 'number'],
    ['date', 'date'],
    ['url', 'url'],
  ] as const)('renders a %s input labelled by its label', (kind, type) => {
    setup({ kind });
    const input = screen.getByLabelText('Label') as HTMLInputElement;
    expect(input.tagName).toBe('INPUT');
    expect(input.type).toBe(type);
    expect(input.id).toBe('f');
    expect(input.name).toBe('f');
  });

  it('passes min, maxLength, placeholder and testId to the control', () => {
    setup({ kind: 'number', min: 0, maxLength: 5, placeholder: '0', testId: 'x-input' });
    const input = screen.getByTestId('x-input') as HTMLInputElement;
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('maxlength', '5');
    expect(input).toHaveAttribute('placeholder', '0');
  });

  it('does not set min on a non-number input', () => {
    setup({ kind: 'text', min: 3 });
    expect(screen.getByLabelText('Label')).not.toHaveAttribute('min');
  });

  it('renders a textarea', () => {
    setup({ kind: 'textarea', placeholder: 'p' }, { value: 'hello' });
    const area = screen.getByLabelText('Label') as HTMLTextAreaElement;
    expect(area.tagName).toBe('TEXTAREA');
    expect(area.value).toBe('hello');
    fireEvent.change(area, { target: { value: 'bye' } });
  });

  it('renders a select with its options and reports the picked value', () => {
    const { onChange } = setup(
      {
        kind: 'select',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
      { value: 'a' },
    );
    const select = screen.getByLabelText('Label') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['a', 'b']);
    expect(select.value).toBe('a');
    fireEvent.change(select, { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('renders a select without options as empty', () => {
    setup({ kind: 'select' });
    expect((screen.getByLabelText('Label') as HTMLSelectElement).options).toHaveLength(0);
  });

  it('reports typed text for inputs and textareas', () => {
    const { onChange } = setup({ kind: 'text' });
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'abc' } });
    expect(onChange).toHaveBeenCalledWith('abc');
  });

  it('shows a numeric value as text and a non-text value as empty', () => {
    const { rerender } = setup({ kind: 'number' }, { value: 5 });
    expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('5');
    rerender(
      <ObjectFormField
        field={{ name: 'f', label: 'Label', kind: 'number' }}
        value={['x']}
        error={undefined}
        busy={false}
        onChange={() => {}}
        createChild={() => {}}
      />,
    );
    expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('');
  });

  it('blurs a number input on wheel so scrolling never changes it', () => {
    setup({ kind: 'number' });
    const input = screen.getByLabelText('Label');
    input.focus();
    fireEvent.wheel(input);
    expect(input).not.toHaveFocus();
  });
});

describe('ObjectFormField labels, hints, errors', () => {
  it('shows the required marker and aria-required only when required', () => {
    setup({ kind: 'text', required: true });
    expect(screen.getByText('(required)')).toBeInTheDocument();
    expect(screen.getByLabelText(/Label/)).toHaveAttribute('aria-required', 'true');
  });

  it('shows no marker and no aria-required for an optional field', () => {
    setup({ kind: 'text' });
    expect(screen.queryByText('(required)')).toBeNull();
    expect(screen.getByLabelText('Label')).not.toHaveAttribute('aria-required');
  });

  it('wires the hint and the error through aria-describedby and aria-invalid', () => {
    setup({ kind: 'text', hint: 'A hint' }, { error: 'Bad value' });
    const input = screen.getByLabelText('Label');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toEqual(['f-hint', 'f-error']);
    expect(document.getElementById('f-hint')).toHaveTextContent('A hint');
    expect(document.getElementById('f-error')).toHaveTextContent('Bad value');
  });

  it('renders a notice as a field message wired into aria-describedby, without aria-invalid', () => {
    setup({ kind: 'text', notice: 'Could not load options' });
    const input = screen.getByLabelText('Label');
    expect(input).toHaveAttribute('aria-describedby', 'f-notice');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(document.getElementById('f-notice')).toHaveTextContent('Could not load options');
  });

  it('orders hint, notice and error in aria-describedby', () => {
    setup({ kind: 'text', hint: 'H', notice: 'N' }, { error: 'E' });
    expect(screen.getByLabelText('Label').getAttribute('aria-describedby')).toBe(
      'f-hint f-notice f-error',
    );
  });

  it('has no aria-describedby or aria-invalid without hint or error', () => {
    setup({ kind: 'text' });
    const input = screen.getByLabelText('Label');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('describes an invalid select and textarea too', () => {
    const { unmount } = setup({ kind: 'select', options: [] }, { error: 'E' });
    expect(screen.getByLabelText('Label')).toHaveAttribute('aria-invalid', 'true');
    unmount();
    setup({ kind: 'textarea' }, { error: 'E' });
    expect(screen.getByLabelText('Label')).toHaveAttribute('aria-describedby', 'f-error');
  });

  it('applies the half-width class', () => {
    setup({ kind: 'text', width: 'half' });
    expect(screen.getByLabelText('Label').parentElement?.className).toContain('fieldHalf');
  });
});

describe('busy state', () => {
  it('inputs and textareas become read-only', () => {
    const { unmount } = setup({ kind: 'text' }, { busy: true });
    expect(screen.getByLabelText('Label')).toHaveAttribute('readonly');
    unmount();
    setup({ kind: 'textarea' }, { busy: true });
    expect(screen.getByLabelText('Label')).toHaveAttribute('readonly');
  });

  it('a select is aria-disabled and ignores changes', () => {
    const { onChange } = setup(
      { kind: 'select', options: [{ value: 'a', label: 'A' }] },
      { busy: true },
    );
    const select = screen.getByLabelText('Label');
    expect(select).toHaveAttribute('aria-disabled', 'true');
    fireEvent.change(select, { target: { value: 'a' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('loading options and custom fields', () => {
  it('shows a Skeleton instead of the control while options load', () => {
    setup({ kind: 'select', optionsLoading: true });
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Label')).toBeInTheDocument();
  });

  it('renders a custom field through render() with the context', () => {
    const render = jest.fn(
      (ctx: { id: string; busy: boolean; invalid: boolean; describedBy?: string }) => (
        <button
          type="button"
          id={ctx.id}
          data-testid="custom"
        >{`${ctx.busy}|${ctx.invalid}|${ctx.describedBy}`}</button>
      ),
    );
    setup({ kind: 'custom', render: render as never }, { error: 'oops', busy: true });
    expect(screen.getByTestId('custom')).toHaveTextContent('true|true|f-error');
    expect(screen.getByLabelText('Label')).toBe(screen.getByTestId('custom'));
  });

  it('custom setValue works when idle and is ignored while busy', () => {
    const idle = setup({
      kind: 'custom',
      render: (ctx) => (
        <button type="button" data-testid="set" onClick={() => ctx.setValue('v')}>
          set
        </button>
      ),
    });
    fireEvent.click(screen.getByTestId('set'));
    expect(idle.onChange).toHaveBeenCalledWith('v');
    idle.unmount();
    const busy = setup(
      {
        kind: 'custom',
        render: (ctx) => (
          <button type="button" data-testid="set" onClick={() => ctx.setValue('v')}>
            set
          </button>
        ),
      },
      { busy: true },
    );
    fireEvent.click(screen.getByTestId('set'));
    expect(busy.onChange).not.toHaveBeenCalled();
  });

  it('hands createChild through to custom fields', () => {
    const { createChild } = setup({
      kind: 'custom',
      render: (ctx) => (
        <button
          type="button"
          data-testid="child"
          onClick={() => ctx.createChild({ schema: {} as never, onCreated: () => {} })}
        >
          c
        </button>
      ),
    });
    fireEvent.click(screen.getByTestId('child'));
    expect(createChild).toHaveBeenCalledTimes(1);
  });

  it('renders nothing for a custom field without render()', () => {
    setup({ kind: 'custom' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Label')).toBeInTheDocument();
  });
});

describe('color field', () => {
  it('renders the colour input and the "No color" checkbox for a colour value', () => {
    setup({ kind: 'color', testId: 'area' }, { value: '#112233' });
    const input = screen.getByTestId('area-color') as HTMLInputElement;
    expect(input.type).toBe('color');
    expect(input.value).toBe('#112233');
    expect(input.id).toBe('f');
    expect(screen.getByLabelText('Label')).toBe(input);
    expect(screen.getByLabelText('No color')).not.toBeChecked();
  });

  it.each([
    ['empty string', ''],
    ['non-string', 5],
    ['null', null],
  ])('treats a %s value as "No color"', (_name, value) => {
    setup({ kind: 'color', testId: 'area' }, { value });
    expect(screen.getByTestId('area-no-color')).toBeChecked();
    expect(screen.getByTestId('area-color')).toBeDisabled();
  });

  it('reports a picked colour and null when "No color" is ticked', () => {
    const { onChange } = setup({ kind: 'color', testId: 'area' }, { value: '#112233' });
    fireEvent.change(screen.getByTestId('area-color'), { target: { value: '#abcdef' } });
    expect(onChange).toHaveBeenLastCalledWith('#abcdef');
    fireEvent.click(screen.getByTestId('area-no-color'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('is disabled while busy and wired to the hint and error', () => {
    setup(
      { kind: 'color', testId: 'area', hint: 'Pick one.' },
      { value: '#112233', busy: true, error: 'Bad colour.' },
    );
    expect(screen.getByTestId('area-color')).toBeDisabled();
    expect(screen.getByTestId('area-no-color')).toBeDisabled();
    expect(screen.getByTestId('area-color').getAttribute('aria-describedby')).toContain('f-error');
    expect(screen.getByText('Bad colour.')).toBeInTheDocument();
  });
});
