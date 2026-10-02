import { jest, describe, it, expect } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterChipGroup } from './FilterChipGroup.js';

const OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'a', label: 'Kitchen' },
  { value: 'b', label: 'Bath' },
];

describe('FilterChipGroup', () => {
  it('renders a labelled group with one button per option', () => {
    render(
      <FilterChipGroup options={OPTIONS} value="all" onChange={() => {}} ariaLabel="Groups" />,
    );

    const group = screen.getByRole('group', { name: 'Groups' });
    expect(group.querySelectorAll('button')).toHaveLength(3);
  });

  it('marks only the chip matching value as pressed', () => {
    render(<FilterChipGroup options={OPTIONS} value="a" onChange={() => {}} ariaLabel="Groups" />);

    expect(screen.getByRole('button', { name: 'Kitchen' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Bath' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the clicked option value', () => {
    const onChange = jest.fn();
    render(
      <FilterChipGroup options={OPTIONS} value="all" onChange={onChange} ariaLabel="Groups" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Bath' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('uses the default testIdPrefix', () => {
    render(
      <FilterChipGroup options={OPTIONS} value="all" onChange={() => {}} ariaLabel="Groups" />,
    );
    expect(screen.getByTestId('filter-chip-a')).toHaveTextContent('Kitchen');
  });

  it('honours a custom testIdPrefix', () => {
    render(
      <FilterChipGroup
        options={OPTIONS}
        value="all"
        onChange={() => {}}
        ariaLabel="Groups"
        testIdPrefix="spot-group-chip"
      />,
    );
    expect(screen.getByTestId('spot-group-chip-b')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-chip-b')).not.toBeInTheDocument();
  });
});
