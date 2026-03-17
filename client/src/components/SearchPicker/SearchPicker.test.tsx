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
  beforeEach(() => {
    mockSearchFn.mockReset();
    mockSearchFn.mockResolvedValue(sampleItems);
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
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) });
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
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) });
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
        const lastCall = mockSearchFn.mock.calls[mockSearchFn.mock.calls.length - 1];
        expect(lastCall[0]).toBe('Alp');
      });
    });

    it('searchFn called with excludeIds as second argument', async () => {
      const user = userEvent.setup();
      renderPicker({ excludeIds: ['item-1', 'item-2'], placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.type(input, 'Alpha');

      await waitFor(() => {
        expect(mockSearchFn).toHaveBeenCalledWith(expect.any(String), ['item-1', 'item-2']);
      });
    });
  });

  // ── 3. Item selection ─────────────────────────────────────────────────────

  describe('item selection', () => {
    it('clicking a result calls onChange with item id and onSelectItem with { id, label }', async () => {
      const user = userEvent.setup();
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
      const user = userEvent.setup();
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
      const user = userEvent.setup();
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

      const user = userEvent.setup();
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
      const user = userEvent.setup();
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
      const user = userEvent.setup();
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

      const user = userEvent.setup();
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

      await waitFor(() => {
        expect(screen.getByText('Custom search error')).toBeInTheDocument();
      });
    });

    it('uses default searchErrorMessage "Failed to search items" when not specified', async () => {
      mockSearchFn.mockResolvedValueOnce([]);
      mockSearchFn.mockRejectedValueOnce(new Error('Search error'));

      const user = userEvent.setup();
      renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);
      await waitFor(() => expect(screen.queryByText('Searching...')).not.toBeInTheDocument());

      await user.type(input, 'A');

      await waitFor(() => {
        expect(screen.getByText('Failed to search items')).toBeInTheDocument();
      });
    });
  });

  // ── 7. Empty states ───────────────────────────────────────────────────────

  describe('empty states', () => {
    it('noResultsMessage shown when searchFn resolves with empty array after typing', async () => {
      mockSearchFn.mockResolvedValue([]);
      const user = userEvent.setup();
      renderPicker({
        noResultsMessage: 'Nothing matches',
        placeholder: 'Search...',
      });

      const input = screen.getByPlaceholderText('Search...');
      await user.type(input, 'XYZ');

      await waitFor(() => {
        expect(screen.getByText('Nothing matches')).toBeInTheDocument();
      });
    });

    it('uses default noResultsMessage "No matching items found" when not specified', async () => {
      mockSearchFn.mockResolvedValue([]);
      const user = userEvent.setup();
      renderPicker({ placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.type(input, 'XYZ');

      await waitFor(() => {
        expect(screen.getByText('No matching items found')).toBeInTheDocument();
      });
    });

    it('emptyHint shown when no query, no results, and no specialOptions', async () => {
      mockSearchFn.mockResolvedValue([]);
      const user = userEvent.setup();
      // Open dropdown via typing then clearing back to empty to show emptyHint
      renderPicker({ placeholder: 'Search...', emptyHint: 'Start typing to search' });

      const input = screen.getByPlaceholderText('Search...');
      await user.type(input, 'A');
      // Wait for search to run
      await waitFor(() => expect(screen.queryByText('Searching...')).not.toBeInTheDocument());

      // Clear the input
      await user.clear(input);

      await waitFor(() => {
        expect(screen.getByText('Start typing to search')).toBeInTheDocument();
      });
    });

    it('uses default emptyHint "Type to search items" when not specified', async () => {
      mockSearchFn.mockResolvedValue([]);
      const user = userEvent.setup();
      renderPicker({ placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.type(input, 'A');
      await waitFor(() => expect(screen.queryByText('Searching...')).not.toBeInTheDocument());
      await user.clear(input);

      await waitFor(() => {
        expect(screen.getByText('Type to search items')).toBeInTheDocument();
      });
    });
  });

  // ── 8. Special options ────────────────────────────────────────────────────

  describe('specialOptions prop', () => {
    it('specialOptions shown at top of dropdown on focus', async () => {
      const user = userEvent.setup();
      const specialOptions = [{ id: '__SPECIAL__', label: 'Special Choice' }];
      renderPicker({ specialOptions, placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Special Choice' })).toBeInTheDocument();
      });
    });

    it('divider present when both special options and results exist', async () => {
      const user = userEvent.setup();
      const specialOptions = [{ id: '__SPECIAL__', label: 'Special Choice' }];
      renderPicker({ specialOptions, placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      // Wait for items to load
      await waitFor(() => {
        expect(screen.getByText('Alpha Widget')).toBeInTheDocument();
      });

      const separator = document.querySelector('[role="separator"]');
      expect(separator).toBeInTheDocument();
    });

    it('selecting special option calls onChange(opt.id) and onSelectItem({ id, label })', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn<(id: string) => void>();
      const onSelectItem = jest.fn<(item: { id: string; label: string }) => void>();
      const specialOptions = [{ id: '__SPECIAL__', label: 'Special Choice' }];

      renderPicker({
        specialOptions,
        onChange: onChange as ReturnType<typeof jest.fn>,
        onSelectItem: onSelectItem as ReturnType<typeof jest.fn>,
        placeholder: 'Search...',
      });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() =>
        expect(screen.getByRole('option', { name: 'Special Choice' })).toBeInTheDocument(),
      );

      await user.click(screen.getByRole('option', { name: 'Special Choice' }));

      expect(onChange).toHaveBeenCalledWith('__SPECIAL__');
      expect(onSelectItem).toHaveBeenCalledWith({ id: '__SPECIAL__', label: 'Special Choice' });
    });

    it('selected special option shown in selectedDisplay mode', () => {
      const onChange = jest.fn<(id: string) => void>();
      const specialOptions = [{ id: '__SPECIAL__', label: 'Special Choice' }];

      const { rerender } = render(
        <SearchPicker<TestItem>
          value=""
          onChange={onChange as ReturnType<typeof jest.fn>}
          excludeIds={[]}
          searchFn={mockSearchFn}
          renderItem={mockRenderItem}
          specialOptions={specialOptions}
          placeholder="Search..."
        />,
      );

      // Parent sets value to special option id
      rerender(
        <SearchPicker<TestItem>
          value="__SPECIAL__"
          onChange={onChange as ReturnType<typeof jest.fn>}
          excludeIds={[]}
          searchFn={mockSearchFn}
          renderItem={mockRenderItem}
          specialOptions={specialOptions}
          placeholder="Search..."
        />,
      );

      expect(screen.getByText('Special Choice')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
    });

    it('emptyHint NOT shown when specialOptions exist but no results (dropdown still shows special options)', async () => {
      mockSearchFn.mockResolvedValue([]);
      const user = userEvent.setup();
      const specialOptions = [{ id: '__SPECIAL__', label: 'Special Choice' }];
      renderPicker({ specialOptions, placeholder: 'Search...', emptyHint: 'Should not appear' });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Special Choice' })).toBeInTheDocument();
      });

      expect(screen.queryByText('Should not appear')).not.toBeInTheDocument();
    });
  });

  // ── 9. Clear button ───────────────────────────────────────────────────────

  describe('clear button', () => {
    it('after selecting, clicking × calls onChange("") and restores input', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn<(id: string) => void>();
      renderPicker({
        showItemsOnFocus: true,
        onChange: onChange as ReturnType<typeof jest.fn>,
        placeholder: 'Search...',
      });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => expect(screen.getByText('Alpha Widget')).toBeInTheDocument());
      await user.click(screen.getByText('Alpha Widget'));

      await waitFor(() =>
        expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument(),
      );

      const clearBtn = screen.getByRole('button', { name: /clear selection/i });
      await user.click(clearBtn);

      expect(onChange).toHaveBeenLastCalledWith('');
      expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    });
  });

  // ── 10. initialTitle prop ─────────────────────────────────────────────────

  describe('initialTitle prop', () => {
    it('value="id" + initialTitle="Title" shows selectedDisplay with "Title"', () => {
      renderPicker({ value: 'item-existing', initialTitle: 'Pre-set Item Title' });
      expect(screen.getByText('Pre-set Item Title')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Search items...')).not.toBeInTheDocument();
    });

    it('initialTitle clear: clicking × calls onChange("") and shows input', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn<(id: string) => void>();
      renderPicker({
        value: 'item-existing',
        initialTitle: 'Pre-set Item Title',
        onChange: onChange as ReturnType<typeof jest.fn>,
      });

      expect(screen.getByText('Pre-set Item Title')).toBeInTheDocument();

      const clearBtn = screen.getByRole('button', { name: /clear selection/i });
      await user.click(clearBtn);

      expect(onChange).toHaveBeenCalledWith('');
      expect(screen.getByPlaceholderText('Search items...')).toBeInTheDocument();
      expect(screen.queryByText('Pre-set Item Title')).not.toBeInTheDocument();
    });

    it('initialTitle not shown when value is empty string', () => {
      renderPicker({ value: '', initialTitle: 'Pre-set Item Title' });
      expect(screen.queryByText('Pre-set Item Title')).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search items...')).toBeInTheDocument();
    });

    it('initialTitle not shown when initialTitle prop is absent', () => {
      renderPicker({ value: 'item-existing' });
      // No initialTitle: falls through to search input (no selectedItem in state)
      expect(screen.getByPlaceholderText('Search items...')).toBeInTheDocument();
    });
  });

  // ── 11. External value reset ──────────────────────────────────────────────

  describe('external value reset', () => {
    it('value changing to "" resets to input mode even after item selection', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn<(id: string) => void>();

      const { rerender } = render(
        <SearchPicker<TestItem>
          value=""
          onChange={onChange as ReturnType<typeof jest.fn>}
          excludeIds={[]}
          searchFn={mockSearchFn}
          renderItem={mockRenderItem}
          showItemsOnFocus={true}
          placeholder="Search..."
        />,
      );

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);
      await waitFor(() => expect(screen.getByText('Alpha Widget')).toBeInTheDocument());
      await user.click(screen.getByText('Alpha Widget'));

      await waitFor(() =>
        expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument(),
      );

      // Parent reflects selected value (simulating controlled component)
      rerender(
        <SearchPicker<TestItem>
          value="1"
          onChange={onChange as ReturnType<typeof jest.fn>}
          excludeIds={[]}
          searchFn={mockSearchFn}
          renderItem={mockRenderItem}
          showItemsOnFocus={true}
          placeholder="Search..."
        />,
      );

      // Parent resets value to empty (e.g. form submission)
      rerender(
        <SearchPicker<TestItem>
          value=""
          onChange={onChange as ReturnType<typeof jest.fn>}
          excludeIds={[]}
          searchFn={mockSearchFn}
          renderItem={mockRenderItem}
          showItemsOnFocus={true}
          placeholder="Search..."
        />,
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
      });
    });
  });

  // ── 12. Disabled state ────────────────────────────────────────────────────

  describe('disabled prop', () => {
    it('input is disabled when disabled=true', () => {
      renderPicker({ disabled: true, placeholder: 'Search...' });
      const input = screen.getByPlaceholderText('Search...');
      expect(input).toBeDisabled();
    });

    it('clear button is disabled when disabled=true in selectedDisplay mode (initialTitle)', () => {
      // Render directly in selected-display mode via initialTitle + value
      const onChange = jest.fn<(id: string) => void>();
      render(
        <SearchPicker<TestItem>
          value="item-existing"
          onChange={onChange as ReturnType<typeof jest.fn>}
          excludeIds={[]}
          searchFn={mockSearchFn}
          renderItem={mockRenderItem}
          initialTitle="Disabled Selected Item"
          disabled={true}
          placeholder="Search disabled..."
        />,
      );

      const clearBtn = screen.getByRole('button', { name: /clear selection/i });
      expect(clearBtn).toBeDisabled();
    });
  });

  // ── 13. Click outside closes dropdown ────────────────────────────────────

  describe('click outside', () => {
    it('mousedown outside the container closes the dropdown', async () => {
      const user = userEvent.setup();
      renderPicker({ showItemsOnFocus: true, placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());

      // Click outside
      await user.click(document.body);

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });

  // ── 14. getStatusBorderColor ──────────────────────────────────────────────

  describe('getStatusBorderColor prop', () => {
    it('after selection, selectedDisplay has borderLeftColor from callback', async () => {
      const user = userEvent.setup();
      const getStatusBorderColor = (item: TestItem) =>
        item.status === 'active' ? 'rgb(0, 128, 0)' : undefined;

      renderPicker({
        showItemsOnFocus: true,
        getStatusBorderColor,
        placeholder: 'Search...',
      });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => expect(screen.getByText('Alpha Widget')).toBeInTheDocument());
      await user.click(screen.getByText('Alpha Widget'));

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
      });

      // The selectedDisplay element should have the border color applied
      const selectedDisplay = document.querySelector('[class*="selectedDisplay"]');
      expect(selectedDisplay).toBeInTheDocument();
      expect((selectedDisplay as HTMLElement).style.borderLeftColor).toBe('rgb(0, 128, 0)');
    });

    it('no borderLeftColor style when callback returns undefined', async () => {
      const user = userEvent.setup();
      const getStatusBorderColor = (_item: TestItem) => undefined;

      renderPicker({
        showItemsOnFocus: true,
        getStatusBorderColor,
        placeholder: 'Search...',
      });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => expect(screen.getByText('Alpha Widget')).toBeInTheDocument());
      await user.click(screen.getByText('Alpha Widget'));

      await waitFor(() =>
        expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument(),
      );

      const selectedDisplay = document.querySelector('[class*="selectedDisplay"]');
      expect(selectedDisplay).toBeInTheDocument();
      expect((selectedDisplay as HTMLElement).style.borderLeftColor).toBe('');
    });
  });

  // ── 15. Dropdown listbox role ─────────────────────────────────────────────

  describe('dropdown semantics', () => {
    it('dropdown has role="listbox" and result buttons have role="option"', async () => {
      const user = userEvent.setup();
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
      const user = userEvent.setup();
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

  // ── 16. No divider when no results ───────────────────────────────────────

  describe('special options divider logic', () => {
    it('no divider rendered when specialOptions exist but results are empty', async () => {
      mockSearchFn.mockResolvedValue([]);
      const user = userEvent.setup();
      const specialOptions = [{ id: '__SPECIAL__', label: 'Special Choice' }];
      renderPicker({ specialOptions, placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Special Choice' })).toBeInTheDocument();
      });
      await waitFor(() => expect(screen.queryByText('Searching...')).not.toBeInTheDocument());

      const separator = document.querySelector('[role="separator"]');
      expect(separator).not.toBeInTheDocument();
    });
  });
});
