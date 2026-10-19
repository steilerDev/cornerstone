/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControlledSearchPicker } from '../../test/ControlledSearchPicker.js';
import type { SearchPicker } from './SearchPicker.js';

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

function renderPicker(props: Partial<React.ComponentProps<typeof SearchPicker<TestItem>>> = {}) {
  return render(
    <ControlledSearchPicker<TestItem>
      value=""
      onChange={jest.fn()}
      excludeIds={[]}
      searchFn={mockSearchFn}
      renderItem={(item) => ({ id: item.id, label: item.label })}
      placeholder="Search..."
      showItemsOnFocus
      {...props}
    />,
  );
}

describe('SearchPicker autoFocus', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    mockSearchFn.mockReset();
    mockSearchFn.mockResolvedValue(items);
    jest.useFakeTimers();
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('input shown', () => {
    it('focuses the input on mount without opening the dropdown or searching', () => {
      renderPicker({ autoFocus: true });

      expect(screen.getByPlaceholderText('Search...')).toHaveFocus();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(mockSearchFn).not.toHaveBeenCalled();
    });

    it('opens on ArrowDown afterwards', async () => {
      renderPicker({ autoFocus: true });

      await user.keyboard('{ArrowDown}');

      expect(await screen.findByText('Alpha Widget')).toBeInTheDocument();
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('opens when the user types', async () => {
      renderPicker({ autoFocus: true, showItemsOnFocus: false });

      await user.keyboard('al');
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      expect(await screen.findByText('Alpha Widget')).toBeInTheDocument();
      expect(mockSearchFn).toHaveBeenCalled();
    });

    it('a later real focus (blur, then click) opens it normally', async () => {
      renderPicker({ autoFocus: true });
      const input = screen.getByPlaceholderText('Search...');
      act(() => input.blur());
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

      await user.click(input);

      expect(await screen.findByText('Alpha Widget')).toBeInTheDocument();
    });

    it('Escape still closes an opened dropdown', async () => {
      renderPicker({ autoFocus: true });
      await user.keyboard('{ArrowDown}');
      await screen.findByRole('listbox');

      await user.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    });
  });

  describe('selection shown', () => {
    it('focuses the Clear button and opens nothing', () => {
      renderPicker({ autoFocus: true, value: 'item-1', initialTitle: 'Alpha Widget' });

      expect(screen.getByRole('button', { name: 'Clear selection' })).toHaveFocus();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(mockSearchFn).not.toHaveBeenCalled();
    });

    it('does not swallow the next real focus: after Clear, focusing the input opens normally', async () => {
      renderPicker({ autoFocus: true, value: 'item-1', initialTitle: 'Alpha Widget' });

      await user.click(screen.getByRole('button', { name: 'Clear selection' }));
      const input = await screen.findByPlaceholderText('Search...');
      act(() => input.blur());
      await user.click(input);

      expect(await screen.findByText('Alpha Widget')).toBeInTheDocument();
    });
  });

  describe('without autoFocus (default)', () => {
    it('does not move focus on mount', () => {
      renderPicker();
      expect(screen.getByPlaceholderText('Search...')).not.toHaveFocus();
      expect(document.body).toHaveFocus();
    });

    it('does not focus the Clear button of a shown selection', () => {
      renderPicker({ value: 'item-1', initialTitle: 'Alpha Widget' });
      expect(screen.getByRole('button', { name: 'Clear selection' })).not.toHaveFocus();
    });

    it('focusing the input still opens the dropdown with showItemsOnFocus', async () => {
      renderPicker();
      await user.click(screen.getByPlaceholderText('Search...'));
      expect(await screen.findByText('Alpha Widget')).toBeInTheDocument();
    });
  });
});
