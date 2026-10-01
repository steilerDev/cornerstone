/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
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

  // ── 8. Special options ────────────────────────────────────────────────────

  describe('specialOptions prop', () => {
    it('specialOptions shown at top of dropdown on focus', async () => {
      const specialOptions = [{ id: '__SPECIAL__', label: 'Special Choice' }];
      renderPicker({ specialOptions, placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Special Choice' })).toBeInTheDocument();
      });
    });

    it('divider present when both special options and results exist', async () => {
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

    it('emptyHint IS shown when specialOptions exist but no results (hint and special options coexist)', async () => {
      mockSearchFn.mockResolvedValue([]);
      const specialOptions = [{ id: '__SPECIAL__', label: 'Special Choice' }];
      // Since Story #1675, emptyHint renders regardless of whether specialOptions exist.
      // Both the special option and the hint appear at the same time.
      renderPicker({ specialOptions, placeholder: 'Search...', emptyHint: 'Also shown' });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Special Choice' })).toBeInTheDocument();
      });

      // emptyHint is shown alongside special options (the hint is not gated on specialOptions)
      expect(screen.queryByText('Also shown')).toBeInTheDocument();
    });

    // ── Bug fix: empty-string special option id with value='' ────────────────

    it('empty-string special option: value="" shows input, not chip', () => {
      const specialOptions = [{ id: '', label: 'All Areas' }];
      renderPicker({ specialOptions, value: '', placeholder: 'Search...' });

      expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
      expect(screen.queryByText('All Areas')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /clear selection/i })).not.toBeInTheDocument();
    });

    it('empty-string special option: "All Areas" appears in dropdown on focus when value=""', async () => {
      const specialOptions = [{ id: '', label: 'All Areas' }];
      renderPicker({ specialOptions, value: '', placeholder: 'Search...' });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'All Areas' })).toBeInTheDocument();
      });
    });

    it('empty-string special option: selecting "All Areas" calls onChange("") and shows selected display', async () => {
      const onChange = jest.fn<(id: string) => void>();
      const specialOptions = [{ id: '', label: 'All Areas' }];
      renderPicker({
        specialOptions,
        value: '',
        onChange: onChange as ReturnType<typeof jest.fn>,
        placeholder: 'Search...',
      });

      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await waitFor(() =>
        expect(screen.getByRole('option', { name: 'All Areas' })).toBeInTheDocument(),
      );

      await user.click(screen.getByRole('option', { name: 'All Areas' }));

      expect(onChange).toHaveBeenCalledWith('');
      // After explicit selection, the selected display should appear
      await waitFor(() => {
        expect(screen.getByText('All Areas')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument();
      });
    });

    it('empty-string special option: clearing after selection returns to input', async () => {
      const onChange = jest.fn<(id: string) => void>();
      const specialOptions = [{ id: '', label: 'All Areas' }];
      renderPicker({
        specialOptions,
        value: '',
        onChange: onChange as ReturnType<typeof jest.fn>,
        placeholder: 'Search...',
      });

      // Select "All Areas"
      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);
      await waitFor(() =>
        expect(screen.getByRole('option', { name: 'All Areas' })).toBeInTheDocument(),
      );
      await user.click(screen.getByRole('option', { name: 'All Areas' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument(),
      );

      // Clear the selection
      await user.click(screen.getByRole('button', { name: /clear selection/i }));
      expect(onChange).toHaveBeenLastCalledWith('');

      // Should return to input mode
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
        expect(screen.queryByText('All Areas')).not.toBeInTheDocument();
      });
    });

    it('non-empty special option id: chip still renders (regression guard)', () => {
      const specialOptions = [{ id: 'all', label: 'All Items' }];
      renderPicker({ specialOptions, value: 'all', placeholder: 'Search...' });

      expect(screen.getByText('All Items')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument();
    });

    it('non-empty special option: clicking × on chip calls onChange("") and restores input', async () => {
      const onChange = jest.fn<(id: string) => void>();
      const specialOptions = [{ id: 'all', label: 'All Items' }];
      renderPicker({
        specialOptions,
        value: 'all',
        onChange: onChange as ReturnType<typeof jest.fn>,
        placeholder: 'Search...',
      });

      expect(screen.getByText('All Items')).toBeInTheDocument();

      const clearBtn = screen.getByRole('button', { name: /clear selection/i });
      await user.click(clearBtn);

      expect(onChange).toHaveBeenCalledWith('');
    });
  });

  // ── 9. Clear button ───────────────────────────────────────────────────────

  describe('clear button', () => {
    it('after selecting, clicking × calls onChange("") and restores input', async () => {
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

  // ── 16. No divider when no results ───────────────────────────────────────

  describe('special options divider logic', () => {
    it('no divider rendered when specialOptions exist but results are empty', async () => {
      mockSearchFn.mockResolvedValue([]);
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
