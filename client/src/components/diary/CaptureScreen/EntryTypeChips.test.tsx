import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ManualDiaryEntryType } from '@cornerstone/shared';
import { EntryTypeChips } from './EntryTypeChips.js';

function setup(value: ManualDiaryEntryType, disabled = false) {
  const onSelect = jest.fn();
  render(<EntryTypeChips value={value} onSelect={onSelect} disabled={disabled} />);
  return { onSelect };
}

describe('EntryTypeChips', () => {
  it('shows Daily log, Site visit and Delivery as chips, then More', () => {
    setup('daily_log');

    const group = screen.getByRole('group', { name: 'Entry type' });
    const labels = within(group)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(labels).toEqual(['Daily log', 'Site visit', 'Delivery']);
    expect(screen.getByTestId('capture-type-more')).toHaveTextContent('More');
  });

  it('presses the chip of the current type', () => {
    setup('site_visit');

    expect(screen.getByTestId('capture-type-site_visit')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('capture-type-daily_log')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('capture-type-more')).not.toHaveAttribute('data-current');
  });

  it('selects a chip type', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup('daily_log');

    await user.click(screen.getByTestId('capture-type-delivery'));

    expect(onSelect).toHaveBeenCalledWith('delivery');
  });

  it('does not deselect the pressed chip', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup('daily_log');

    await user.click(screen.getByTestId('capture-type-daily_log'));

    expect(onSelect).toHaveBeenCalledWith('daily_log');
    expect(onSelect).not.toHaveBeenCalledWith('');
  });

  it('opens a choice group with Defect and Note under More', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup('daily_log');

    await user.click(screen.getByTestId('capture-type-more'));

    const radios = screen.getAllByRole('menuitemradio');
    expect(radios.map((r) => r.textContent)).toEqual(['Defect', 'Note']);
    expect(radios.every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);

    await user.click(screen.getByTestId('capture-type-issue'));
    expect(onSelect).toHaveBeenCalledWith('issue');
  });

  it.each([
    ['issue', 'Defect'],
    ['general_note', 'Note'],
  ] as const)('shows %s in the More slot, pressed, with no chip pressed', async (type, label) => {
    const user = userEvent.setup();
    setup(type);

    const more = screen.getByTestId('capture-type-more');
    expect(more).toHaveTextContent(label);
    expect(more).toHaveAttribute('data-current', 'true');
    expect(more).toHaveAccessibleName(label);
    for (const chip of ['daily_log', 'site_visit', 'delivery']) {
      expect(screen.getByTestId(`capture-type-${chip}`)).toHaveAttribute('aria-pressed', 'false');
    }

    await user.click(more);
    expect(screen.getByRole('menuitemradio', { name: label })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('closes the More menu after a type was chosen', async () => {
    const user = userEvent.setup();
    setup('daily_log');

    await user.click(screen.getByTestId('capture-type-more'));
    await user.click(screen.getByTestId('capture-type-issue'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('disables the chips and the More trigger', () => {
    setup('daily_log', true);

    expect(screen.getByTestId('capture-type-daily_log')).toBeDisabled();
    expect(screen.getByTestId('capture-type-more')).toBeDisabled();
  });

  it('exposes the row ref for focus return', () => {
    const rowRef = { current: null as HTMLDivElement | null };
    render(<EntryTypeChips value="delivery" onSelect={jest.fn()} rowRef={rowRef} />);

    expect(rowRef.current).toBeInstanceOf(HTMLDivElement);
    expect(rowRef.current?.querySelector('[aria-pressed="true"]')).toHaveTextContent('Delivery');
  });
});
