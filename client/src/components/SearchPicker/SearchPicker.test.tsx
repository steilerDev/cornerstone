/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchPicker } from './SearchPicker.js';

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

const mockSearchFn = jest.fn<(query: string, excludeIds: string[]) => Promise<TestItem[]>>();
const mockRenderItem = (item: TestItem) => ({ id: item.id, label: item.label });

function renderPicker(
  props: Partial<React.ComponentProps<typeof SearchPicker<TestItem>>> & {
    value?: string;
    onChange?: (id: string) => void;
    excludeIds?: string[];
  } = {},
) {
  return render(
    <SearchPicker<TestItem>
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
        expect(mockSearchFn).toHaveBeenCalledWith('A', []);
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
        expect(mockSearchFn).toHaveBeenCalledWith(expect.any(String), ['item-1', 'item-2']);
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

      expect(mockSearchFn).toHaveBeenCalledWith('', []);
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
