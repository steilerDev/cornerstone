/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type * as SearchApiTypes from '../../lib/searchApi.js';
import type * as PickerTypes from './CostLineTargetPicker.js';
import type { CostLineTarget } from '../CostLineTable/types.js';

const mockSearch = jest.fn<typeof SearchApiTypes.searchEverywhere>();
jest.unstable_mockModule('../../lib/searchApi.js', () => ({ searchEverywhere: mockSearch }));

const item = (id: string, label: string | null, areaPath: { id: string; name: string }[] | null) =>
  ({
    id,
    label,
    sublabel: null,
    matchedField: 'title',
    status: null,
    kind: null,
    date: null,
    phone: null,
    areaPath,
    parent: null,
  }) as never;

const RESPONSE = {
  query: 'fl',
  groups: [
    {
      type: 'work_item',
      total: 2,
      status: 'ok',
      items: [
        item('wi-1', 'Lay floors', [
          { id: 'a1', name: 'House' },
          { id: 'a2', name: 'Kitchen' },
        ]),
        item('wi-2', null, []),
      ],
    },
    { type: 'household_item', total: 1, status: 'ok', items: [item('hi-1', 'Floor lamp', null)] },
    { type: 'invoice', total: 1, status: 'ok', items: [item('inv-1', 'Ignored invoice', null)] },
  ],
} as unknown as Awaited<ReturnType<typeof SearchApiTypes.searchEverywhere>>;

describe('CostLineTargetPicker', () => {
  let Picker: typeof PickerTypes;
  const onChange = jest.fn<(target: CostLineTarget | null) => void>();

  beforeEach(async () => {
    mockSearch.mockReset();
    onChange.mockReset();
    mockSearch.mockResolvedValue(RESPONSE);
    if (!Picker) Picker = await import('./CostLineTargetPicker.js');
  });

  function Host({
    initial = null,
    excludeIds,
    placeholder,
    disabled,
  }: {
    initial?: CostLineTarget | null;
    excludeIds?: string[];
    placeholder?: string;
    disabled?: boolean;
  }) {
    const [value, setValue] = useState<CostLineTarget | null>(initial);
    return (
      <Picker.CostLineTargetPicker
        id="target"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        excludeIds={excludeIds}
        placeholder={placeholder}
        disabled={disabled}
        testId="picker"
      />
    );
  }

  it('builds option ids from the kind and the id', () => {
    expect(Picker.targetOptionId({ type: 'household_item', id: 'x' })).toBe('household_item:x');
  });

  it('does not search for fewer than two letters', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.type(screen.getByRole('textbox'), 'f');
    expect(mockSearch).not.toHaveBeenCalled();
    // Blanks do not count towards the minimum.
    await user.type(screen.getByRole('textbox'), '  ');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('lists tasks and purchases with the kind word and the area path, skipping other kinds', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.type(screen.getByRole('textbox'), 'fl');

    const task = await screen.findByRole('option', { name: /Lay floors/ });
    expect(task).toHaveTextContent('Task');
    expect(task).toHaveTextContent('House');
    expect(task).toHaveTextContent('Kitchen');
    expect(screen.getByRole('option', { name: /Floor lamp/ })).toHaveTextContent('Purchase');
    expect(screen.queryByRole('option', { name: /Ignored invoice/ })).toBeNull();
    expect(mockSearch).toHaveBeenCalledWith(
      { q: 'fl', types: ['work_item', 'household_item'], limit: 10 },
      expect.anything(),
    );
  });

  it('selects a target with its label and clears it again', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.type(screen.getByRole('textbox'), 'fl');
    await user.click(await screen.findByRole('option', { name: /Floor lamp/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'household_item',
      id: 'hi-1',
      label: 'Floor lamp',
      area: null,
    });

    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('selects an option without a label as an empty label', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.type(screen.getByRole('textbox'), 'fl');
    const options = await screen.findAllByRole('option');
    await user.click(options[1]!);
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'work_item',
      id: 'wi-2',
      label: '',
      area: null,
    });
  });

  it('leaves out the excluded options', async () => {
    const user = userEvent.setup();
    render(<Host excludeIds={['work_item:wi-1']} />);
    await user.type(screen.getByRole('textbox'), 'fl');
    await screen.findByRole('option', { name: /Floor lamp/ });
    expect(screen.queryByRole('option', { name: /Lay floors/ })).toBeNull();
  });

  it('shows the current target by its label and a custom placeholder otherwise', () => {
    const { unmount } = render(
      <Host initial={{ type: 'work_item', id: 'wi-1', label: 'Lay floors' }} />,
    );
    expect(screen.getByText('Lay floors')).toBeInTheDocument();
    unmount();
    render(<Host placeholder="Pick one" />);
    expect(screen.getByPlaceholderText('Pick one')).toBeInTheDocument();
  });

  it('uses the default placeholder and can be disabled', async () => {
    render(<Host disabled />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('placeholder', 'Search tasks and purchases');
    await waitFor(() => expect(input).toBeDisabled());
  });

  it('shows a hint for short queries and a message when nothing matches', async () => {
    const user = userEvent.setup();
    mockSearch.mockResolvedValue({ query: 'zz', groups: [] });
    render(<Host />);
    await user.type(screen.getByRole('textbox'), 'zz');
    expect(await screen.findByText('No tasks or purchases match.')).toBeInTheDocument();
  });
});
