import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateChips, previousIsoDate } from './DateChips.js';
import type { DateChipsProps } from './DateChips.js';

const LABELS = {
  group: 'Date',
  today: 'Today',
  yesterday: 'Yesterday',
  pick: 'Pick a date',
  pickWithDate: (f: string) => `Pick · ${f}`,
  input: 'Entry date',
};

function setup(overrides: Partial<DateChipsProps> = {}) {
  const onChange = jest.fn();
  const props: DateChipsProps = {
    value: '2026-10-19',
    onChange,
    today: '2026-10-19',
    max: '2026-10-19',
    labels: LABELS,
    formatPicked: (iso) => `fmt(${iso})`,
    ...overrides,
  };
  const utils = render(<DateChips {...props} />);
  return { onChange, ...utils };
}

describe('previousIsoDate', () => {
  it.each([
    ['2026-10-19', '2026-10-18'],
    ['2026-03-01', '2026-02-28'],
    ['2028-03-01', '2028-02-29'],
    ['2027-01-01', '2026-12-31'],
  ])('%s -> %s', (input, expected) => {
    expect(previousIsoDate(input)).toBe(expected);
  });
});

describe('DateChips', () => {
  let raf: jest.SpiedFunction<typeof requestAnimationFrame>;
  beforeEach(() => {
    raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => {
      fn(0);
      return 0;
    });
  });
  afterEach(() => raf.mockRestore());

  it('presses Today when the value is today', () => {
    setup();
    expect(screen.getByTestId('date-chips-today')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('date-chips-yesterday')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('date-chips-pick')).not.toHaveAttribute('aria-pressed');
    expect(screen.getByTestId('date-chips-pick')).toHaveTextContent('Pick a date');
  });

  it('presses Yesterday across a month boundary', () => {
    setup({ value: '2026-02-28', today: '2026-03-01' });
    expect(screen.getByTestId('date-chips-yesterday')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('date-chips-today')).toHaveAttribute('aria-pressed', 'false');
  });

  it('presses Yesterday across a year boundary', () => {
    setup({ value: '2026-12-31', today: '2027-01-01' });
    expect(screen.getByTestId('date-chips-yesterday')).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the picked date on a pressed Pick chip for any other date', () => {
    setup({ value: '2026-10-01' });
    const pick = screen.getByTestId('date-chips-pick');
    expect(pick).toHaveTextContent('Pick · fmt(2026-10-01)');
    expect(pick).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('date-chips-today')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('date-chips-yesterday')).toHaveAttribute('aria-pressed', 'false');
  });

  it('labels the group via the visible label', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Date' })).toBeInTheDocument();
  });

  it('chooses today and yesterday through onChange', () => {
    const { onChange } = setup({ value: '2026-10-01' });
    fireEvent.click(screen.getByTestId('date-chips-today'));
    expect(onChange).toHaveBeenLastCalledWith('2026-10-19');
    fireEvent.click(screen.getByTestId('date-chips-yesterday'));
    expect(onChange).toHaveBeenLastCalledWith('2026-10-18');
  });

  it('Pick toggles the hidden input row with aria-expanded and aria-controls', () => {
    setup();
    const pick = screen.getByTestId('date-chips-pick');
    const input = screen.getByTestId('date-chips-input');
    const row = input.parentElement as HTMLElement;
    expect(row).toHaveAttribute('hidden');
    expect(pick).toHaveAttribute('aria-expanded', 'false');
    expect(pick).toHaveAttribute('aria-controls', row.id);
    fireEvent.click(pick);
    expect(row).not.toHaveAttribute('hidden');
    expect(pick).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(pick);
    expect(row).toHaveAttribute('hidden');
  });

  it('passes max and the input label to the date input', () => {
    setup();
    const input = screen.getByTestId('date-chips-input');
    expect(input).toHaveAttribute('max', '2026-10-19');
    expect(input).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('Entry date')).toBe(input);
  });

  it('picking a date calls onChange and closes the row', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByTestId('date-chips-pick'));
    fireEvent.change(screen.getByTestId('date-chips-input'), { target: { value: '2026-10-05' } });
    expect(onChange).toHaveBeenCalledWith('2026-10-05');
    expect(screen.getByTestId('date-chips-input').parentElement).toHaveAttribute('hidden');
  });

  it('returns focus to the pressed chip after picking', () => {
    setup({ value: '2026-10-05' });
    fireEvent.click(screen.getByTestId('date-chips-pick'));
    fireEvent.change(screen.getByTestId('date-chips-input'), { target: { value: '2026-10-06' } });
    expect(document.activeElement).toBe(screen.getByTestId('date-chips-pick'));
  });

  it('ignores clearing the date input', () => {
    const { onChange } = setup({ value: '2026-10-05' });
    fireEvent.click(screen.getByTestId('date-chips-pick'));
    fireEvent.change(screen.getByTestId('date-chips-input'), { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders the hint and honours a custom testIdPrefix', () => {
    setup({ hint: 'Photos keep their own date', testIdPrefix: 'entry-date' });
    expect(screen.getByText('Photos keep their own date')).toBeInTheDocument();
    expect(screen.getByTestId('entry-date-today')).toBeInTheDocument();
    expect(screen.queryByTestId('date-chips-today')).not.toBeInTheDocument();
  });

  it('disables the chips and the input', () => {
    setup({ disabled: true });
    expect(screen.getByTestId('date-chips-today')).toBeDisabled();
    expect(screen.getByTestId('date-chips-input')).toBeDisabled();
  });
});
