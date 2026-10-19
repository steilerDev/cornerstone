import { jest, describe, it, expect } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimeChips } from './TimeChips.js';
import type { TimeChipsProps } from './TimeChips.js';

const LABELS = { group: 'Start time', now: 'Now', other: 'Other time', input: 'Start' };

function setup(overrides: Partial<TimeChipsProps> = {}) {
  const onChange = jest.fn();
  const props: TimeChipsProps = {
    value: null,
    onChange,
    recent: ['07:30', '08:00'],
    now: () => '10:15',
    labels: LABELS,
    formatTime: (v) => `t${v}`,
    ...overrides,
  };
  render(<TimeChips {...props} />);
  return { onChange };
}

describe('TimeChips', () => {
  it('renders recents, then Now, then Other time', () => {
    setup();
    const group = screen.getByRole('group', { name: 'Start time' });
    const values = Array.from(group.querySelectorAll('button')).map((b) =>
      b.getAttribute('data-chip-value'),
    );
    expect(values).toEqual(['07:30', '08:00', '__now__', 'other']);
    expect(screen.getByTestId('time-chips-07:30')).toHaveTextContent('t07:30');
  });

  it('shows at most 3 recents', () => {
    setup({ recent: ['01:00', '02:00', '03:00', '04:00'] });
    expect(screen.queryByTestId('time-chips-04:00')).not.toBeInTheDocument();
    expect(screen.getByTestId('time-chips-03:00')).toBeInTheDocument();
  });

  it('presses the chip matching the value', () => {
    setup({ value: '08:00' });
    expect(screen.getByTestId('time-chips-08:00')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('time-chips-07:30')).toHaveAttribute('aria-pressed', 'false');
  });

  it('adds an extra pressed chip, after the recents, for an unknown value', () => {
    setup({ value: '13:45' });
    const extra = screen.getByTestId('time-chips-13:45');
    expect(extra).toHaveAttribute('aria-pressed', 'true');
    expect(extra).toHaveTextContent('t13:45');
    expect(extra.previousElementSibling).toBe(screen.getByTestId('time-chips-08:00'));
    expect(extra.nextElementSibling).toBe(screen.getByTestId('time-chips-__now__'));
  });

  it('Now stores the current time and is never pressed', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByTestId('time-chips-__now__'));
    expect(onChange).toHaveBeenCalledWith('10:15');
    expect(screen.getByTestId('time-chips-__now__')).toHaveAttribute('aria-pressed', 'false');
  });

  it('selects a recent and deselects the pressed one with null', () => {
    const { onChange } = setup({ value: '07:30' });
    fireEvent.click(screen.getByTestId('time-chips-08:00'));
    expect(onChange).toHaveBeenLastCalledWith('08:00');
    fireEvent.click(screen.getByTestId('time-chips-07:30'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('Other time toggles the input row with aria-expanded and aria-controls', () => {
    setup();
    const other = screen.getByTestId('time-chips-other');
    const input = screen.getByTestId('time-chips-input');
    const row = input.parentElement as HTMLElement;
    expect(row).toHaveAttribute('hidden');
    expect(other).toHaveAttribute('aria-expanded', 'false');
    expect(other).toHaveAttribute('aria-controls', row.id);
    expect(other).not.toHaveAttribute('aria-pressed');
    fireEvent.click(other);
    expect(row).not.toHaveAttribute('hidden');
    expect(other).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(other);
    expect(row).toHaveAttribute('hidden');
  });

  it('typing a time calls onChange; clearing gives null', () => {
    const { onChange } = setup({ value: '09:00' });
    const input = screen.getByLabelText('Start');
    expect(input).toHaveValue('09:00');
    fireEvent.change(input, { target: { value: '11:20' } });
    expect(onChange).toHaveBeenLastCalledWith('11:20');
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('input is empty when value is null', () => {
    setup();
    expect(screen.getByTestId('time-chips-input')).toHaveValue('');
  });

  it('invalid sets aria-invalid and describedBy links the error', () => {
    setup({ invalid: true, describedBy: 'err-1' });
    const input = screen.getByTestId('time-chips-input');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'err-1');
  });

  it('is valid by default', () => {
    setup();
    const input = screen.getByTestId('time-chips-input');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('honours a custom testIdPrefix', () => {
    setup({ testIdPrefix: 'work-start' });
    expect(screen.getByTestId('work-start-other')).toBeInTheDocument();
    expect(screen.getByTestId('work-start-input')).toBeInTheDocument();
  });
});
