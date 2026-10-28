/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { ObjectListSelectFilter } from './ObjectListSelectFilter.js';
import type { ObjectListSelectFilterProps } from './ObjectListSelectFilter.js';
import type { ObjectListFilterRenderContext } from './types.js';

const OPTIONS = [
  { value: 'furniture', label: 'Furniture' },
  { value: 'appliances', label: 'Appliances' },
];

function setup(
  props: Partial<ObjectListSelectFilterProps> = {},
  ctx: Partial<ObjectListFilterRenderContext> = {},
) {
  const onChange = jest.fn<ObjectListFilterRenderContext['onChange']>();
  render(
    <ObjectListSelectFilter
      ctx={{ id: 'f-category', value: null, onChange, ...ctx }}
      label="Category"
      emptyLabel="Any category"
      options={OPTIONS}
      failure={null}
      failureFallback="Could not load the categories."
      testId="purchases-filter-category"
      {...props}
    />,
  );
  return { onChange };
}

describe('ObjectListSelectFilter', () => {
  it('labels the select and offers "any" first, then every option', () => {
    setup();

    const select = screen.getByLabelText('Category');
    expect(select).toBe(screen.getByTestId('purchases-filter-category'));
    expect(select).toHaveAttribute('id', 'f-category');
    expect(select).toHaveValue('');
    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      'Any category',
      'Furniture',
      'Appliances',
    ]);
  });

  it('shows the param value as selected and writes a picked option', () => {
    const { onChange } = setup({}, { value: 'appliances' });

    const select = screen.getByTestId('purchases-filter-category');
    expect(select).toHaveValue('appliances');
    fireEvent.change(select, { target: { value: 'furniture' } });
    expect(onChange).toHaveBeenCalledWith('furniture');
  });

  it('writes null when "any" is picked, which clears the param', () => {
    const { onChange } = setup({}, { value: 'furniture' });

    fireEvent.change(screen.getByTestId('purchases-filter-category'), { target: { value: '' } });

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows the given value instead of the param (the first id of a legacy CSV)', () => {
    setup({ value: 'furniture' }, { value: 'furniture,appliances' });

    expect(screen.getByTestId('purchases-filter-category')).toHaveValue('furniture');
  });

  it('shows no error when the options loaded', () => {
    setup();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the translated API error when the options failed to load', () => {
    setup({ failure: { kind: 'api', code: 'INTERNAL_ERROR', notFound: false } });

    expect(screen.getByText(/unexpected|error|wrong/i)).toBeInTheDocument();
    expect(screen.queryByText('Could not load the categories.')).not.toBeInTheDocument();
  });

  it('shows the fallback when the failure has no API code', () => {
    setup({ failure: { kind: 'other' } });

    expect(screen.getByText('Could not load the categories.')).toBeInTheDocument();
  });
});
