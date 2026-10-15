/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { useState } from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControlledSearchPicker } from '../../test/ControlledSearchPicker.js';
import { SearchPicker, type SearchPickerCreateAction } from './SearchPicker.js';

interface TestItem {
  id: string;
  label: string;
  amount?: string;
}

const sampleItems: TestItem[] = [
  { id: 'item-1', label: 'Alpha Widget', amount: '10.00' },
  { id: 'item-2', label: 'Beta Gadget' },
];

type SearchFn = (query: string, excludeIds: string[], signal: AbortSignal) => Promise<TestItem[]>;
const mockSearchFn = jest.fn<SearchFn>();
const renderItem = (item: TestItem) => ({ id: item.id, label: item.label });
const onChange = jest.fn<(id: string) => void>();
const onSelectItem = jest.fn<(item: { id: string; label: string }) => void>();

type PickerProps = Partial<React.ComponentProps<typeof ControlledSearchPicker<TestItem>>>;

function renderPicker(props: PickerProps = {}) {
  return render(
    <ControlledSearchPicker<TestItem>
      value=""
      onChange={onChange}
      onSelectItem={onSelectItem}
      excludeIds={[]}
      searchFn={mockSearchFn}
      renderItem={renderItem}
      placeholder="Search..."
      showItemsOnFocus
      {...props}
    />,
  );
}

function deferred() {
  let resolve!: (items: TestItem[]) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<TestItem[]>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('SearchPicker server search', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    mockSearchFn.mockReset();
    mockSearchFn.mockResolvedValue(sampleItems);
    onChange.mockReset();
    onSelectItem.mockReset();
    jest.useFakeTimers();
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('abort and stale-response guard', () => {
    async function typeAndDebounce(text: string) {
      const input = screen.getByPlaceholderText('Search...');
      await user.type(input, text);
      await act(async () => {
        jest.advanceTimersByTime(300);
      });
    }

    it('aborts the first search signal when a newer query starts', async () => {
      const first = deferred();
      mockSearchFn.mockReset();
      mockSearchFn.mockReturnValueOnce(first.promise);
      mockSearchFn.mockResolvedValue(sampleItems);
      renderPicker({ showItemsOnFocus: false });

      await typeAndDebounce('a');
      const firstSignal = mockSearchFn.mock.calls[0]![2];
      expect(firstSignal.aborted).toBe(false);

      await typeAndDebounce('b');

      expect(mockSearchFn.mock.calls[1]![0]).toBe('ab');
      expect(firstSignal.aborted).toBe(true);
    });

    it('never shows results of a superseded call that resolves late', async () => {
      const first = deferred();
      mockSearchFn.mockReset();
      mockSearchFn.mockReturnValueOnce(first.promise);
      mockSearchFn.mockResolvedValueOnce([{ id: 'item-2', label: 'Beta Gadget' }]);
      renderPicker({ showItemsOnFocus: false });

      await typeAndDebounce('a');
      await typeAndDebounce('b');
      await screen.findByText('Beta Gadget');

      await act(async () => {
        first.resolve([{ id: 'item-1', label: 'Alpha Widget' }]);
      });

      expect(screen.queryByText('Alpha Widget')).not.toBeInTheDocument();
      expect(screen.getByText('Beta Gadget')).toBeInTheDocument();
    });

    it('shows no error when a superseded call rejects', async () => {
      const first = deferred();
      mockSearchFn.mockReset();
      mockSearchFn.mockReturnValueOnce(first.promise);
      mockSearchFn.mockResolvedValueOnce(sampleItems);
      renderPicker({ showItemsOnFocus: false, searchErrorMessage: 'Search broke' });

      await typeAndDebounce('a');
      await typeAndDebounce('b');
      await screen.findByText('Alpha Widget');

      await act(async () => {
        first.reject(new DOMException('aborted', 'AbortError'));
      });

      expect(screen.queryByText('Search broke')).not.toBeInTheDocument();
      expect(screen.getByText('Alpha Widget')).toBeInTheDocument();
    });

    it('aborts an in-flight initial load when the picker unmounts', async () => {
      const pending = deferred();
      mockSearchFn.mockReset();
      mockSearchFn.mockReturnValue(pending.promise);
      const { unmount } = renderPicker();

      await user.click(screen.getByPlaceholderText('Search...'));
      const signal = mockSearchFn.mock.calls[0]![2];
      expect(signal.aborted).toBe(false);

      unmount();

      expect(signal.aborted).toBe(true);
    });

    it('ignores a stale initial-load failure once a newer search owns the list', async () => {
      const first = deferred();
      mockSearchFn.mockReset();
      mockSearchFn.mockReturnValueOnce(first.promise);
      mockSearchFn.mockResolvedValueOnce(sampleItems);
      renderPicker({ loadErrorMessage: 'Load broke' });

      await user.click(screen.getByPlaceholderText('Search...'));
      await typeAndDebounce('a');
      await screen.findByText('Alpha Widget');

      await act(async () => {
        first.reject(new Error('boom'));
      });

      expect(screen.queryByText('Load broke')).not.toBeInTheDocument();
    });
  });

  describe('focus after a pick', () => {
    it('focuses the "Clear selection" button after clicking a result', async () => {
      renderPicker();

      await user.click(screen.getByPlaceholderText('Search...'));
      await user.click(await screen.findByText('Alpha Widget'));

      await waitFor(() => {
        expect(document.activeElement).toBe(
          screen.getByRole('button', { name: 'Clear selection' }),
        );
      });
    });

    it('focuses the "Clear selection" button after ArrowDown and Enter', async () => {
      renderPicker();
      const input = screen.getByPlaceholderText('Search...');

      await user.click(input);
      await screen.findByText('Alpha Widget');
      await user.keyboard('{ArrowDown}');
      expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Alpha Widget' }));
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(document.activeElement).toBe(
          screen.getByRole('button', { name: 'Clear selection' }),
        );
      });
      expect(onChange).toHaveBeenCalledWith('item-1');
    });

    it('focuses the "Clear selection" button after choosing a special option', async () => {
      renderPicker({ specialOptions: [{ id: '__NONE__', label: 'No item' }] });

      await user.click(screen.getByPlaceholderText('Search...'));
      await user.click(await screen.findByRole('option', { name: 'No item' }));

      await waitFor(() => {
        expect(document.activeElement).toBe(
          screen.getByRole('button', { name: 'Clear selection' }),
        );
      });
      expect(onChange).toHaveBeenCalledWith('__NONE__');
    });

    it('focuses the input, not body, when the parent resets the value in onChange', async () => {
      renderPicker({ resetOnChange: true });
      const input = screen.getByPlaceholderText('Search...');

      await user.click(input);
      await user.click(await screen.findByText('Alpha Widget'));

      await waitFor(() => {
        expect(document.activeElement).toBe(input);
      });
      expect(document.activeElement).not.toBe(document.body);
      expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('focuses the input, not body, when the parent resets the value after a special option', async () => {
      renderPicker({
        resetOnChange: true,
        specialOptions: [{ id: '__NONE__', label: 'No item' }],
      });
      const input = screen.getByPlaceholderText('Search...');

      await user.click(input);
      await user.click(await screen.findByRole('option', { name: 'No item' }));

      await waitFor(() => {
        expect(document.activeElement).toBe(input);
      });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('focuses the input after "Clear selection" and opens the list (showItemsOnFocus)', async () => {
      renderPicker({ initialTitle: 'Alpha Widget', value: 'item-1' });

      await user.click(screen.getByRole('button', { name: 'Clear selection' }));

      const input = screen.getByPlaceholderText('Search...');
      await waitFor(() => expect(document.activeElement).toBe(input));
      expect(document.activeElement).not.toBe(document.body);
      expect(await screen.findByRole('option', { name: 'Alpha Widget' })).toBeInTheDocument();
    });

    it('focuses the input after clearing a picked item, without a list when showItemsOnFocus is off', async () => {
      renderPicker({ showItemsOnFocus: false });
      const input = screen.getByPlaceholderText('Search...');
      await user.type(input, 'a');
      await act(async () => {
        jest.advanceTimersByTime(300);
      });
      await user.click(await screen.findByRole('option', { name: 'Alpha Widget' }));

      await user.click(await screen.findByRole('button', { name: 'Clear selection' }));

      await waitFor(() =>
        expect(document.activeElement).toBe(screen.getByPlaceholderText('Search...')),
      );
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    describe('a parent that sets the value asynchronously', () => {
      function AsyncParent({ delay }: { delay: number }) {
        const [value, setValue] = useState('');
        return (
          <>
            <SearchPicker<TestItem>
              value={value}
              onChange={(id) => {
                setTimeout(() => setValue(id), delay);
              }}
              excludeIds={[]}
              searchFn={mockSearchFn}
              renderItem={renderItem}
              placeholder="Search..."
              showItemsOnFocus
            />
            <button type="button">elsewhere</button>
          </>
        );
      }

      it('ends on "Clear selection", never body, once the value arrives', async () => {
        render(<AsyncParent delay={1000} />);

        await user.click(screen.getByPlaceholderText('Search...'));
        await user.click(await screen.findByText('Alpha Widget'));
        // the value is not there yet: focus is parked on the input instead of body
        await waitFor(() => expect(document.activeElement).not.toBe(document.body));

        await act(async () => {
          jest.advanceTimersByTime(1000);
        });

        await waitFor(() => {
          expect(document.activeElement).toBe(
            screen.getByRole('button', { name: 'Clear selection' }),
          );
        });
      });

      it('does not steal focus once the pending intent expired (value arrives after 3 s)', async () => {
        render(<AsyncParent delay={4000} />);

        await user.click(screen.getByPlaceholderText('Search...'));
        await user.click(await screen.findByText('Alpha Widget'));
        await act(async () => {
          jest.advanceTimersByTime(3100);
        });
        const elsewhere = screen.getByRole('button', { name: 'elsewhere' });
        elsewhere.focus();

        await act(async () => {
          jest.advanceTimersByTime(1000);
        });

        expect(await screen.findByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
        expect(document.activeElement).toBe(elsewhere);
      });
    });

    it('still focuses the input without reopening when creating is cancelled', async () => {
      const onCreate = jest.fn<(q: string) => Promise<TestItem | null>>().mockResolvedValue(null);
      const createAction: SearchPickerCreateAction<TestItem> = {
        getLabel: (q) => `Add "${q}"`,
        onCreate,
      };
      renderPicker({ createAction });
      const input = screen.getByPlaceholderText('Search...');

      await user.type(input, 'Zed');
      await user.click(await screen.findByRole('option', { name: 'Add "Zed"' }));

      await waitFor(() => {
        expect(document.activeElement).toBe(input);
      });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('renderTrailing and getOptionTestId', () => {
    it('renders the trailing content after the title and a test id on each option', async () => {
      renderPicker({
        renderTrailing: (item) =>
          item.amount ? <span data-testid="amt">{item.amount}</span> : null,
        getOptionTestId: (item) => `opt-${item.id}`,
      });

      await user.click(screen.getByPlaceholderText('Search...'));
      await screen.findByText('Alpha Widget');

      const first = screen.getByTestId('opt-item-1');
      const second = screen.getByTestId('opt-item-2');
      expect(first).toHaveAttribute('role', 'option');
      expect(first).toContainElement(screen.getByTestId('amt'));
      expect(first.textContent).toBe('Alpha Widget10.00');
      expect(second.textContent).toBe('Beta Gadget');
      expect(screen.getAllByTestId('amt')).toHaveLength(1);
    });

    it('renders no trailing slot without renderTrailing', async () => {
      renderPicker();

      await user.click(screen.getByPlaceholderText('Search...'));
      await screen.findByText('Alpha Widget');

      expect(screen.getByRole('option', { name: 'Alpha Widget' }).textContent).toBe('Alpha Widget');
    });
  });

  describe('clearOnSelect', () => {
    it('reports the pick, shows no selected display, empties and focuses the input', async () => {
      renderPicker({ clearOnSelect: true });
      const input = screen.getByPlaceholderText('Search...');

      await user.click(input);
      await user.click(await screen.findByText('Alpha Widget'));

      expect(onChange).toHaveBeenCalledWith('item-1');
      expect(onSelectItem).toHaveBeenCalledWith({ id: 'item-1', label: 'Alpha Widget' });
      expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search...')).toHaveValue('');
      expect(document.activeElement).toBe(screen.getByPlaceholderText('Search...'));
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('does not search again when focus returns to the input after a pick', async () => {
      renderPicker({ clearOnSelect: true });

      await user.click(screen.getByPlaceholderText('Search...'));
      await user.click(await screen.findByText('Alpha Widget'));
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      expect(mockSearchFn).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('lets a second item be added after the first', async () => {
      renderPicker({ clearOnSelect: true });
      const input = screen.getByPlaceholderText('Search...');

      await user.click(input);
      await user.click(await screen.findByText('Alpha Widget'));
      input.blur();
      await user.click(input);
      await user.click(await screen.findByText('Beta Gadget'));

      expect(onChange).toHaveBeenNthCalledWith(1, 'item-1');
      expect(onChange).toHaveBeenNthCalledWith(2, 'item-2');
    });

    it('treats a created item the same way', async () => {
      const onCreate = jest
        .fn<(q: string) => Promise<TestItem | null>>()
        .mockResolvedValue({ id: 'new-1', label: 'Fresh' });
      renderPicker({
        clearOnSelect: true,
        createAction: { getLabel: (q) => `Add "${q}"`, onCreate },
      });
      const input = screen.getByPlaceholderText('Search...');

      await user.type(input, 'Fresh');
      await user.click(await screen.findByRole('option', { name: 'Add "Fresh"' }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search...')).toHaveValue('');
      });
      expect(onChange).toHaveBeenCalledWith('new-1');
      expect(onSelectItem).toHaveBeenCalledWith({ id: 'new-1', label: 'Fresh' });
      expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('inputAriaProps', () => {
    it('puts aria-label on the input', () => {
      renderPicker({ inputAriaProps: { 'aria-label': 'Company search' } });

      expect(screen.getByRole('textbox', { name: 'Company search' })).toBe(
        screen.getByPlaceholderText('Search...'),
      );
    });
  });
});
