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

  describe('selectedValues (multi-select)', () => {
    it('marks every chip in selectedValues as pressed, regardless of value', () => {
      render(
        <FilterChipGroup
          options={OPTIONS}
          value=""
          selectedValues={['a', 'b']}
          onChange={() => {}}
          ariaLabel="Groups"
        />,
      );
      expect(screen.getByRole('button', { name: 'Kitchen' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: 'Bath' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('ignores value for the pressed state when selectedValues is given', () => {
      render(
        <FilterChipGroup
          options={OPTIONS}
          value="all"
          selectedValues={[]}
          onChange={() => {}}
          ariaLabel="Groups"
        />,
      );
      expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('calls onChange with the clicked value, also for an already pressed chip (the host toggles)', () => {
      const onChange = jest.fn();
      render(
        <FilterChipGroup
          options={OPTIONS}
          value=""
          selectedValues={['a']}
          deselectable
          onChange={onChange}
          ariaLabel="Groups"
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));
      expect(onChange).toHaveBeenLastCalledWith('a');
      fireEvent.click(screen.getByRole('button', { name: 'Bath' }));
      expect(onChange).toHaveBeenLastCalledWith('b');
    });
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

  it('uses labelledBy instead of aria-label when both are given', () => {
    render(
      <>
        <span id="lbl">Area</span>
        <FilterChipGroup
          options={OPTIONS}
          value="all"
          onChange={() => {}}
          ariaLabel="ignored"
          labelledBy="lbl"
        />
      </>,
    );
    const group = screen.getByRole('group', { name: 'Area' });
    expect(group).not.toHaveAttribute('aria-label');
    expect(group).toHaveAttribute('aria-labelledby', 'lbl');
  });

  it('exposes layout and tone as data attributes with defaults', () => {
    const { rerender } = render(
      <FilterChipGroup options={OPTIONS} value="all" onChange={() => {}} ariaLabel="G" />,
    );
    expect(screen.getByRole('group')).toHaveAttribute('data-layout', 'scroll');
    expect(screen.getByRole('group')).toHaveAttribute('data-tone', 'default');
    rerender(
      <FilterChipGroup
        options={OPTIONS}
        value="all"
        onChange={() => {}}
        ariaLabel="G"
        layout="wrap"
        tone="onPhoto"
      />,
    );
    expect(screen.getByRole('group')).toHaveAttribute('data-layout', 'wrap');
    expect(screen.getByRole('group')).toHaveAttribute('data-tone', 'onPhoto');
  });

  it('puts data-chip-value on every chip', () => {
    render(<FilterChipGroup options={OPTIONS} value="all" onChange={() => {}} ariaLabel="G" />);
    expect(screen.getByTestId('filter-chip-b')).toHaveAttribute('data-chip-value', 'b');
  });

  it('deselects the pressed chip with an empty value only when deselectable', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <FilterChipGroup options={OPTIONS} value="a" onChange={onChange} ariaLabel="G" />,
    );
    fireEvent.click(screen.getByTestId('filter-chip-a'));
    expect(onChange).toHaveBeenLastCalledWith('a');
    rerender(
      <FilterChipGroup
        options={OPTIONS}
        value="a"
        onChange={onChange}
        ariaLabel="G"
        deselectable
      />,
    );
    fireEvent.click(screen.getByTestId('filter-chip-a'));
    expect(onChange).toHaveBeenLastCalledWith('');
    fireEvent.click(screen.getByTestId('filter-chip-b'));
    expect(onChange).toHaveBeenLastCalledWith('b');
  });

  it('action chips call onSelect, not onChange, and carry aria attributes', () => {
    const onChange = jest.fn();
    const onSelect = jest.fn();
    render(
      <FilterChipGroup
        options={[
          ...OPTIONS,
          {
            value: 'more',
            label: 'More',
            action: true,
            onSelect,
            ariaLabel: 'More areas',
            ariaExpanded: true,
            ariaControls: 'panel',
            ariaHasPopup: 'menu',
            trailing: <svg data-testid="chev" />,
            testId: 'custom-more',
          },
        ]}
        value="more"
        onChange={onChange}
        ariaLabel="G"
      />,
    );
    const chip = screen.getByTestId('custom-more');
    expect(chip).not.toHaveAttribute('aria-pressed');
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    expect(chip).toHaveAttribute('aria-controls', 'panel');
    expect(chip).toHaveAttribute('aria-haspopup', 'menu');
    expect(chip).toHaveAttribute('aria-label', 'More areas');
    expect(screen.getByTestId('chev').parentElement).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(chip);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('action chip with actionPressed is pressed; without onSelect click is a no-op', () => {
    render(
      <FilterChipGroup
        options={[{ value: 'p', label: 'Pick', action: true, actionPressed: true }]}
        value=""
        onChange={() => {}}
        ariaLabel="G"
      />,
    );
    const chip = screen.getByTestId('filter-chip-p');
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chip);
  });

  it('attaches groupRef to the group element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(
      <FilterChipGroup
        options={OPTIONS}
        value="all"
        onChange={() => {}}
        ariaLabel="G"
        groupRef={ref}
      />,
    );
    expect(ref.current).toBe(screen.getByRole('group'));
  });
});
