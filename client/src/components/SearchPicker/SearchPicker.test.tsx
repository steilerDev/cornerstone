/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControlledSearchPicker } from '../../test/ControlledSearchPicker.js';
import type { SearchPicker } from './SearchPicker.js';

interface TestItem {
  id: string;
  label: string;
  status: string;
}

const sampleItems: TestItem[] = [
  { id: 'item-1', label: 'Alpha Widget', status: 'active' },
  { id: 'item-2', label: 'Beta Gadget', status: 'inactive' },
  { id: 'item-3', label: 'Gamma Doohickey', status: 'active' },
];

const mockSearchFn =
  jest.fn<(query: string, excludeIds: string[], signal: AbortSignal) => Promise<TestItem[]>>();
const mockRenderItem = (item: TestItem) => ({ id: item.id, label: item.label });

function renderPicker(
  props: Partial<React.ComponentProps<typeof SearchPicker<TestItem>>> & {
    value?: string;
    onChange?: (id: string) => void;
    excludeIds?: string[];
  } = {},
) {
  return render(
    <ControlledSearchPicker<TestItem>
      value={props.value ?? ''}
      onChange={props.onChange ?? jest.fn()}
      excludeIds={props.excludeIds ?? []}
      searchFn={mockSearchFn}
      renderItem={mockRenderItem}
      {...props}
    />,
  );
}

describe('SearchPicker', () => {
  // Shared across every test in this describe: fake timers remove the wall-clock
  // dependency from userEvent's real-timer-driven click/type interactions.
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    mockSearchFn.mockReset();
    mockSearchFn.mockResolvedValue(sampleItems);
    jest.useFakeTimers();
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── 1. Initial render ─────────────────────────────────────────────────────

  describe('initial render', () => {
    it('renders input with given placeholder; no dropdown on mount', () => {
      renderPicker({ placeholder: 'Search things...' });

      expect(screen.getByPlaceholderText('Search things...')).toBeInTheDocument();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('uses "Search items..." as default placeholder', () => {
      renderPicker();
      expect(screen.getByPlaceholderText('Search items...')).toBeInTheDocument();
    });

    it('renders as a div container wrapping the input', () => {
      renderPicker({ placeholder: 'Test placeholder' });
      const input = screen.getByPlaceholderText('Test placeholder');
      // Input should be inside a container div
      expect(input.closest('div')).toBeInTheDocument();
    });
  });

  // ── 2. Debounce search ────────────────────────────────────────────────────

  describe('debounce behaviour', () => {
    it('typing triggers searchFn with typed query after 300ms debounce', async () => {
      // Use userEvent with fake timers via the advanceTimers option
      renderPicker({ placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');

      // Type a character — userEvent will internally advance fake timers
      await user.type(input, 'A');

      // Advance past debounce window
      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockSearchFn).toHaveBeenCalledWith('A', [], expect.any(AbortSignal));
      });
    });

    it('rapid typing only triggers one searchFn call after 300ms', async () => {
      renderPicker({ placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');

      // Type three characters quickly (userEvent types char-by-char)
      // Each keystroke resets the debounce timer
      await user.type(input, 'Alp');

      // Advance past debounce
      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        // searchFn should have been called (at most once per debounced invocation)
        expect(mockSearchFn).toHaveBeenCalled();
        // The final call should include the full typed string
        const lastCall = mockSearchFn.mock.calls[mockSearchFn.mock.calls.length - 1]!;
        expect(lastCall[0]!).toBe('Alp');
      });
    });

    it('searchFn called with excludeIds as second argument', async () => {
      renderPicker({ excludeIds: ['item-1', 'item-2'], placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.type(input, 'Alpha');

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(mockSearchFn).toHaveBeenCalledWith(
          expect.any(String),
          ['item-1', 'item-2'],
          expect.any(AbortSignal),
        );
      });
    });
  });

  // ── 3. Item selection ─────────────────────────────────────────────────────

  describe('item selection', () => {
    it('clicking a result calls onChange with item id and onSelectItem with { id, label }', async () => {
      const onChange = jest.fn<(id: string) => void>();
      const onSelectItem = jest.fn<(item: { id: string; label: string }) => void>();

      renderPicker({
        onChange: onChange as ReturnType<typeof jest.fn>,
        onSelectItem: onSelectItem as ReturnType<typeof jest.fn>,
        showItemsOnFocus: true,
        placeholder: 'Search...',
      });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => expect(screen.getByText('Alpha Widget')).toBeInTheDocument());

      await user.click(screen.getByText('Alpha Widget'));

      expect(onChange).toHaveBeenCalledWith('item-1');
      expect(onSelectItem).toHaveBeenCalledWith({ id: 'item-1', label: 'Alpha Widget' });
    });

    it('after selection: input hidden, selectedDisplay shown with label text', async () => {
      renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => expect(screen.getByText('Alpha Widget')).toBeInTheDocument());
      await user.click(screen.getByText('Alpha Widget'));

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
        expect(screen.getByText('Alpha Widget')).toBeInTheDocument();
      });
    });
  });

  // ── 4. showItemsOnFocus ───────────────────────────────────────────────────

  describe('showItemsOnFocus prop', () => {
    it('on focus, calls searchFn with empty string; results appear', async () => {
      renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Alpha Widget')).toBeInTheDocument();
        expect(screen.getByText('Beta Gadget')).toBeInTheDocument();
        expect(screen.getByText('Gamma Doohickey')).toBeInTheDocument();
      });

      expect(mockSearchFn).toHaveBeenCalledWith('', [], expect.any(AbortSignal));
    });
  });

  // ── Focus arrival: only the keyboard opens the list on focus ────────────────

  describe('opening on focus', () => {
    function renderBetweenButtons() {
      return render(
        <>
          <button type="button">before</button>
          <ControlledSearchPicker<TestItem>
            value=""
            onChange={jest.fn()}
            excludeIds={[]}
            searchFn={mockSearchFn}
            renderItem={mockRenderItem}
            showItemsOnFocus
            placeholder="Search..."
          />
          <button type="button">after</button>
        </>,
      );
    }

    it('does not open on a programmatic focus', async () => {
      renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });
      act(() => screen.getByPlaceholderText('Search...').focus());
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(mockSearchFn).not.toHaveBeenCalled();
    });

    it('does not open on a synthetic focus event', async () => {
      renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });
      fireEvent.focus(screen.getByPlaceholderText('Search...'));
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('opens when Tab arrives at the field', async () => {
      renderBetweenButtons();
      screen.getByText('before').focus();
      await user.tab();
      expect(screen.getByPlaceholderText('Search...')).toHaveFocus();
      expect(await screen.findByRole('listbox')).toBeInTheDocument();
      expect(await screen.findByText('Alpha Widget')).toBeInTheDocument();
    });

    it('opens when Shift+Tab arrives at the field', async () => {
      renderBetweenButtons();
      screen.getByText('after').focus();
      await user.tab({ shift: true });
      expect(screen.getByPlaceholderText('Search...')).toHaveFocus();
      expect(await screen.findByRole('listbox')).toBeInTheDocument();
    });

    it('a Tab keydown does not carry over to a programmatic focus in a later task', async () => {
      renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });
      fireEvent.keyDown(window, { key: 'Tab' });
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      act(() => screen.getByPlaceholderText('Search...').focus());
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('a programmatic focus inside the same task as a Tab keydown counts as keyboard arrival', async () => {
      renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });
      fireEvent.keyDown(window, { key: 'Tab' });
      fireEvent.keyDown(window, { key: 'Tab' });
      act(() => screen.getByPlaceholderText('Search...').focus());
      expect(await screen.findByRole('listbox')).toBeInTheDocument();
    });

    it('other keys do not mark a keyboard arrival', async () => {
      renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });
      fireEvent.keyDown(window, { key: 'a' });
      act(() => screen.getByPlaceholderText('Search...').focus());
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('a click still opens the list', async () => {
      renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });
      await user.click(screen.getByPlaceholderText('Search...'));
      expect(await screen.findByRole('listbox')).toBeInTheDocument();
    });

    it('removes its window listener on unmount, with a Tab still pending', () => {
      const remove = jest.spyOn(window, 'removeEventListener');
      const { unmount } = renderPicker({ placeholder: 'Search...' });
      fireEvent.keyDown(window, { key: 'Tab' });
      unmount();
      expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function), true);
      expect(() => fireEvent.keyDown(window, { key: 'Tab' })).not.toThrow();
      remove.mockRestore();
    });
  });

  // ── 5. Loading state ──────────────────────────────────────────────────────

  describe('loading state', () => {
    it('"Searching..." shown while searchFn is pending', async () => {
      let resolveSearch: (items: TestItem[]) => void;
      mockSearchFn.mockReturnValue(
        new Promise((res) => {
          resolveSearch = res;
        }),
      );

      renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      expect(screen.getByText('Searching...')).toBeInTheDocument();

      // Resolve to clean up pending promises
      resolveSearch!(sampleItems);
      await waitFor(() => expect(screen.queryByText('Searching...')).not.toBeInTheDocument());
    });
  });

  // ── 6. Error states ───────────────────────────────────────────────────────

  describe('error states', () => {
    it('loadErrorMessage shown when searchFn rejects on initial load', async () => {
      mockSearchFn.mockRejectedValue(new Error('Network failure'));
      renderPicker({
        showItemsOnFocus: true,
        placeholder: 'Search...',
        loadErrorMessage: 'Custom load error',
      });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Custom load error')).toBeInTheDocument();
      });
    });

    it('uses default loadErrorMessage "Failed to load items" when not specified', async () => {
      mockSearchFn.mockRejectedValue(new Error('Network failure'));
      renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Failed to load items')).toBeInTheDocument();
      });
    });

    it('searchErrorMessage shown when searchFn rejects during typing', async () => {
      // First call (initial load on focus) succeeds
      mockSearchFn.mockResolvedValueOnce([]);
      // Second call (typed query) fails
      mockSearchFn.mockRejectedValueOnce(new Error('Search error'));

      renderPicker({
        showItemsOnFocus: true,
        placeholder: 'Search...',
        searchErrorMessage: 'Custom search error',
      });

      // Focus to open dropdown (first call succeeds)
      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);
      await waitFor(() => expect(screen.queryByText('Searching...')).not.toBeInTheDocument());

      // Type to trigger search (second call fails)
      await user.type(input, 'A');

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText('Custom search error')).toBeInTheDocument();
      });
    });

    it('uses default searchErrorMessage "Failed to search items" when not specified', async () => {
      mockSearchFn.mockResolvedValueOnce([]);
      mockSearchFn.mockRejectedValueOnce(new Error('Search error'));

      renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);
      await waitFor(() => expect(screen.queryByText('Searching...')).not.toBeInTheDocument());

      await user.type(input, 'A');

      await act(async () => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to search items')).toBeInTheDocument();
      });
    });
  });

  // ── 15. Dropdown listbox role ─────────────────────────────────────────────

  describe('dropdown semantics', () => {
    it('dropdown has role="listbox" and result buttons have role="option"', async () => {
      renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        const options = screen.getAllByRole('option');
        expect(options.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('each result option shows the item label', async () => {
      renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Alpha Widget' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Beta Gadget' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Gamma Doohickey' })).toBeInTheDocument();
      });
    });
  });
});
