/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { ObjectListCheckboxFilter } from './ObjectListCheckboxFilter.js';
import type { ObjectListCheckboxFilterProps } from './ObjectListCheckboxFilter.js';
import type { ObjectListFilterRenderContext } from './types.js';

const OPTIONS = [
  { value: '3', label: 'Contract' },
  { value: '5', label: 'Plan' },
  { value: '9', label: 'Receipt' },
];

function setup(
  props: Partial<ObjectListCheckboxFilterProps> = {},
  ctx: Partial<ObjectListFilterRenderContext> = {},
) {
  const onChange = jest.fn<ObjectListFilterRenderContext['onChange']>();
  const utils = render(
    <ObjectListCheckboxFilter
      ctx={{ id: 'f-tags', value: null, onChange, ...ctx }}
      mode="multi"
      options={OPTIONS}
      testIdPrefix="docs-filter-tags"
      {...props}
    />,
  );
  const rerenderWith = (nextCtx: Partial<ObjectListFilterRenderContext>) =>
    utils.rerender(
      <ObjectListCheckboxFilter
        ctx={{ id: 'f-tags', value: null, onChange, ...ctx, ...nextCtx }}
        mode="multi"
        options={OPTIONS}
        testIdPrefix="docs-filter-tags"
        {...props}
      />,
    );
  return { onChange, rerenderWith };
}

const box = (value: string) => screen.getByTestId(`docs-filter-tags-${value}`) as HTMLInputElement;

describe('ObjectListCheckboxFilter: multi', () => {
  it('renders one labelled checkbox per option, unchecked without a URL value', () => {
    setup();

    for (const option of OPTIONS) {
      expect(screen.getByRole('checkbox', { name: option.label })).not.toBeChecked();
      expect(box(option.value)).toBe(screen.getByLabelText(option.label));
    }
  });

  it('gives the first checkbox the field id and no other checkbox an id', () => {
    setup();

    expect(box('3')).toHaveAttribute('id', 'f-tags');
    expect(box('5')).not.toHaveAttribute('id');
    expect(box('9')).not.toHaveAttribute('id');
  });

  it('checks the boxes named in the URL value', () => {
    setup({}, { value: '3,9' });

    expect(box('3')).toBeChecked();
    expect(box('5')).not.toBeChecked();
    expect(box('9')).toBeChecked();
  });

  it('ignores URL values that are not options', () => {
    setup({}, { value: '5,77,abc' });

    expect(box('5')).toBeChecked();
    expect(box('3')).not.toBeChecked();
    expect(box('9')).not.toBeChecked();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('writes the checked values comma-joined in option order, not click order', () => {
    const { onChange } = setup();

    fireEvent.click(box('9'));
    expect(onChange).toHaveBeenLastCalledWith('9');
    fireEvent.click(box('3'));
    expect(onChange).toHaveBeenLastCalledWith('3,9');
    fireEvent.click(box('5'));
    expect(onChange).toHaveBeenLastCalledWith('3,5,9');
  });

  it('writes null when the last checked box is cleared', () => {
    const { onChange } = setup({}, { value: '5' });

    fireEvent.click(box('5'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('keeps the remaining values when one of several boxes is cleared', () => {
    const { onChange } = setup({}, { value: '3,5,9' });

    fireEvent.click(box('5'));

    expect(onChange).toHaveBeenCalledWith('3,9');
  });

  it('toggles when the label text is clicked', () => {
    const { onChange } = setup();

    fireEvent.click(screen.getByText('Plan'));

    expect(onChange).toHaveBeenCalledWith('5');
    expect(box('5')).toBeChecked();
  });

  it('keeps the box checked from a local draft even before the URL value follows', () => {
    setup();

    fireEvent.click(box('3'));

    // the URL value is still null (the router has not transitioned): the box must not revert
    expect(box('3')).toBeChecked();
  });

  it('adopts a changed URL value (for example Clear filters)', () => {
    const { rerenderWith } = setup({}, { value: '3,5' });
    expect(box('3')).toBeChecked();

    rerenderWith({ value: null });

    expect(box('3')).not.toBeChecked();
    expect(box('5')).not.toBeChecked();
  });

  it('adopts a URL value written elsewhere', () => {
    const { rerenderWith } = setup();

    rerenderWith({ value: '9' });

    expect(box('9')).toBeChecked();
    expect(box('3')).not.toBeChecked();
  });
});

describe('ObjectListCheckboxFilter: single', () => {
  const SINGLE = [{ value: '1', label: 'Hide already linked' }];

  it('renders one checkbox named by its label, unchecked by default', () => {
    setup({ mode: 'single', options: SINGLE, testIdPrefix: 'docs-filter-unlinked' });

    const checkbox = screen.getByRole('checkbox', { name: 'Hide already linked' });
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toHaveAttribute('id', 'f-tags');
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('writes the option value when checked and null when unchecked', () => {
    const { onChange } = setup({
      mode: 'single',
      options: SINGLE,
      testIdPrefix: 'docs-filter-unlinked',
    });
    const checkbox = screen.getByTestId('docs-filter-unlinked-1');

    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenLastCalledWith('1');
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(checkbox).not.toBeChecked();
  });

  it('shows the box checked for the URL value 1 and unchecked for any other value', () => {
    const first = setup(
      { mode: 'single', options: SINGLE, testIdPrefix: 'docs-filter-unlinked' },
      { value: '1' },
    );
    expect(screen.getByTestId('docs-filter-unlinked-1')).toBeChecked();
    first.rerenderWith({ value: 'yes' });
    expect(screen.getByTestId('docs-filter-unlinked-1')).not.toBeChecked();
  });
});
