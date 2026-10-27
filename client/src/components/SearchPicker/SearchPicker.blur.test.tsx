/**
 * @jest-environment jsdom
 *
 * Leaving the picker closes its list (#2241): focus moving anywhere outside the input and the
 * portaled listbox closes it without committing anything; focus moving into the listbox keeps it.
 *
 * Mutations these tests catch: dropping the relatedTarget check (the list would close while
 * arrowing into options), checking only the container (focus inside the portaled listbox would
 * close it), not closing on blur at all, and removing the listbox's mousedown preventDefault (a
 * press on an option would blur the input and unmount the option before the click lands).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControlledSearchPicker } from '../../test/ControlledSearchPicker.js';

interface TestItem {
  id: string;
  label: string;
}

const items: TestItem[] = [
  { id: 'item-1', label: 'Alpha Widget' },
  { id: 'item-2', label: 'Beta Gadget' },
];

const mockSearchFn =
  jest.fn<(query: string, excludeIds: string[], signal: AbortSignal) => Promise<TestItem[]>>();
const onChange = jest.fn<(id: string) => void>();

function renderPicker() {
  return render(
    <>
      <ControlledSearchPicker<TestItem>
        value=""
        onChange={onChange}
        excludeIds={[]}
        searchFn={mockSearchFn}
        renderItem={(item) => ({ id: item.id, label: item.label })}
        placeholder="Search..."
        showItemsOnFocus
      />
      <button type="button">outside</button>
    </>,
  );
}

describe('SearchPicker closes when focus leaves it', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    mockSearchFn.mockReset();
    mockSearchFn.mockResolvedValue(items);
    onChange.mockReset();
    jest.useFakeTimers();
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const input = () => screen.getByPlaceholderText('Search...');
  const outside = () => screen.getByRole('button', { name: 'outside' });

  async function open() {
    renderPicker();
    await user.click(input());
    await screen.findByRole('listbox');
  }

  it('Tab to the next control closes the list and selects nothing', async () => {
    await open();

    await user.tab();

    expect(outside()).toHaveFocus();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('moving focus to another element programmatically closes the list', async () => {
    await open();

    act(() => outside().focus());

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('a blur that reports no next element (the window lost focus) closes the list', async () => {
    await open();

    fireEvent.focusOut(input(), { relatedTarget: null });

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('a blur whose next element is inside the listbox keeps it open', async () => {
    await open();

    fireEvent.focusOut(input(), { relatedTarget: screen.getAllByRole('option')[0] });

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('arrowing from the input into the options keeps the list open', async () => {
    await open();

    await user.keyboard('{ArrowDown}');

    expect(screen.getAllByRole('option')[0]).toHaveFocus();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('moving focus out of a focused option closes the list', async () => {
    await open();
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[0]).toHaveFocus();

    act(() => outside().focus());

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a mouse press on an option does not blur the input, and the click still selects', async () => {
    await open();
    const option = screen.getAllByRole('option')[1]!;

    // fireEvent returns false when the event's default was prevented.
    expect(fireEvent.mouseDown(option)).toBe(false);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.click(option);

    expect(onChange).toHaveBeenCalledWith('item-2');
  });

  it('a blur while the list is already closed is harmless', async () => {
    renderPicker();

    fireEvent.focusOut(input(), { relatedTarget: outside() });
    fireEvent.focusOut(input(), { relatedTarget: null });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
