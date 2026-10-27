/**
 * @jest-environment jsdom
 *
 * Cancelling a create dialog must not reopen the list (#2241). The dialog restores focus to the
 * picker's input while `onCreate` is still pending, so the suppress flag has to be set BEFORE the
 * await and cleared as soon as the promise settles (never stuck).
 *
 * Mutations these tests catch: removing the pre-await `suppressFocusOpenRef = true` (the focus
 * restore during the pending promise reopens the list), never clearing it (a later real focus
 * would not open the list), and not clearing it when onCreate resolves immediately.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControlledSearchPicker } from '../../test/ControlledSearchPicker.js';

interface TestItem {
  id: string;
  label: string;
}

const mockSearchFn =
  jest.fn<(query: string, excludeIds: string[], signal: AbortSignal) => Promise<TestItem[]>>();
const onChange = jest.fn<(id: string) => void>();
const onCreate = jest.fn<(query: string) => Promise<TestItem | null>>();

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
        createAction={{ getLabel: (q) => `Add "${q}"`, onCreate }}
      />
      <button type="button">dialog control</button>
    </>,
  );
}

describe('SearchPicker create dialog and focus', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    mockSearchFn.mockReset();
    mockSearchFn.mockResolvedValue([]);
    onChange.mockReset();
    onCreate.mockReset();
    jest.useFakeTimers();
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const input = () => screen.getByPlaceholderText('Search...');

  /** Opens the create dialog from the row; `onCreate` stays pending until `settle` is called. */
  async function startCreate() {
    let settle!: (value: TestItem | null) => void;
    onCreate.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    renderPicker();
    await user.type(input(), 'Acme');
    await user.click(await screen.findByRole('option', { name: 'Add "Acme"' }));
    expect(onCreate).toHaveBeenCalledWith('Acme');
    return { settle: (value: TestItem | null) => act(async () => settle(value)) };
  }

  /** The dialog takes focus, then gives it back to the input when it closes. */
  function dialogRestoresFocus() {
    act(() => screen.getByRole('button', { name: 'dialog control' }).focus());
    act(() => input().focus());
  }

  it.each(['Escape', 'backdrop click', 'Cancel button'])(
    'a focus restore while the pending dialog is closed by %s leaves the list closed',
    async () => {
      const { settle } = await startCreate();

      dialogRestoresFocus();
      expect(screen.queryByRole('listbox')).toBeNull();

      await settle(null);

      expect(screen.queryByRole('listbox')).toBeNull();
      expect(input()).toHaveFocus();
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it('a later real focus on the input still opens the list (the flag is not stuck)', async () => {
    const { settle } = await startCreate();
    dialogRestoresFocus();
    await settle(null);
    expect(screen.queryByRole('listbox')).toBeNull();

    act(() => input().blur());
    await user.click(input());

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });

  it('an onCreate that resolves at once (a child step returning null) clears the flag too', async () => {
    onCreate.mockResolvedValue(null);
    renderPicker();
    await user.type(input(), 'Acme');
    await user.click(await screen.findByRole('option', { name: 'Add "Acme"' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole('listbox')).toBeNull();

    act(() => input().blur());
    await user.click(input());

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });

  it('a successful create selects the new value even after a focus restore while pending', async () => {
    const { settle } = await startCreate();
    dialogRestoresFocus();

    await settle({ id: 'new-1', label: 'Acme Corp' });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('new-1'));
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('a rejected onCreate behaves like a cancel and leaves the list closed', async () => {
    let fail!: (e: Error) => void;
    onCreate.mockReturnValue(new Promise((_r, rj) => (fail = rj)));
    renderPicker();
    await user.type(input(), 'Acme');
    await user.click(await screen.findByRole('option', { name: 'Add "Acme"' }));
    dialogRestoresFocus();

    await act(async () => fail(new Error('boom')));

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
