/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControlledSearchPicker } from '../../test/ControlledSearchPicker.js';
import { SearchPicker as RawSearchPicker } from './SearchPicker.js';
import type { SearchPicker } from './SearchPicker.js';

interface TestItem {
  id: string;
  label: string;
}

const items: TestItem[] = [
  { id: 'item-1', label: 'Alpha Widget' },
  { id: 'item-2', label: 'Beta Gadget' },
  { id: 'item-3', label: 'Gamma Doohickey' },
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
      {...props}
    />,
  );
}

describe('SearchPicker keyboard and refocus behaviour', () => {
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

  const options = () => screen.getAllByRole('option');

  async function openWithFocusItems() {
    renderPicker({ showItemsOnFocus: true });
    await user.click(screen.getByPlaceholderText('Search...'));
    await screen.findByRole('listbox');
  }

  describe('with typed text and no showItemsOnFocus', () => {
    async function typeThenEscape() {
      renderPicker();
      const input = screen.getByPlaceholderText('Search...');
      await user.type(input, 'al');
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      await screen.findByRole('listbox');
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      return input;
    }

    it('focusing the input again reopens the list for the typed text', async () => {
      const input = await typeThenEscape();
      act(() => input.blur());

      await user.click(input);

      expect(await screen.findByRole('listbox')).toBeInTheDocument();
    });

    it('ArrowDown reopens the list for the typed text', async () => {
      await typeThenEscape();

      await user.keyboard('{ArrowDown}');

      expect(await screen.findByRole('listbox')).toBeInTheDocument();
    });

    it('ArrowDown with no text and no showItemsOnFocus opens nothing', async () => {
      renderPicker();
      await user.click(screen.getByPlaceholderText('Search...'));
      await user.keyboard('{ArrowDown}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('ArrowDown on a closed input with showItemsOnFocus', () => {
    it('searches the typed text instead of loading the initial list', async () => {
      renderPicker({ showItemsOnFocus: true });
      const input = screen.getByPlaceholderText('Search...');
      await user.type(input, 'al');
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      await screen.findByRole('listbox');
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      mockSearchFn.mockClear();

      await user.keyboard('{ArrowDown}');

      expect(await screen.findByRole('listbox')).toBeInTheDocument();
      expect(mockSearchFn).toHaveBeenCalledTimes(1);
      expect(mockSearchFn.mock.calls[0]![0]).toBe('al');
    });

    it('loads the initial list when the input is empty', async () => {
      renderPicker({ showItemsOnFocus: true });
      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);
      await screen.findByRole('listbox');
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      mockSearchFn.mockClear();

      await user.keyboard('{ArrowDown}');

      expect(await screen.findByRole('listbox')).toBeInTheDocument();
      expect(mockSearchFn).toHaveBeenCalledTimes(1);
      expect(mockSearchFn.mock.calls[0]![0]).toBe('');
    });
  });

  describe('moving through the options', () => {
    it('ArrowDown from the input focuses the first option, then steps and stops at the last', async () => {
      await openWithFocusItems();

      await user.keyboard('{ArrowDown}');
      expect(options()[0]).toHaveFocus();
      await user.keyboard('{ArrowDown}');
      expect(options()[1]).toHaveFocus();
      await user.keyboard('{ArrowDown}{ArrowDown}');
      expect(options()[2]).toHaveFocus();
    });

    it('ArrowUp steps back and returns to the input from the first option', async () => {
      await openWithFocusItems();
      await user.keyboard('{ArrowDown}{ArrowDown}');
      expect(options()[1]).toHaveFocus();

      await user.keyboard('{ArrowUp}');
      expect(options()[0]).toHaveFocus();

      await user.keyboard('{ArrowUp}');
      expect(screen.getByPlaceholderText('Search...')).toHaveFocus();
    });

    it('ArrowUp in the input jumps to the last option', async () => {
      await openWithFocusItems();
      await user.keyboard('{ArrowUp}');
      expect(options()[2]).toHaveFocus();
    });

    it('Home and End jump to the first and last option', async () => {
      await openWithFocusItems();
      await user.keyboard('{ArrowDown}');

      await user.keyboard('{End}');
      expect(options()[2]).toHaveFocus();
      await user.keyboard('{Home}');
      expect(options()[0]).toHaveFocus();
    });

    it('selecting without an onSelectItem callback still reports the id', async () => {
      const onChange = jest.fn();
      renderPicker({ showItemsOnFocus: true, onChange });
      await user.click(screen.getByPlaceholderText('Search...'));
      await screen.findByRole('listbox');

      await user.click(options()[1]!);

      expect(onChange).toHaveBeenCalledWith('item-2');
    });
  });

  describe('clicking the input', () => {
    it('opens a closed dropdown after autoFocus left it closed', async () => {
      renderPicker({ autoFocus: true, showItemsOnFocus: true });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

      await user.click(screen.getByPlaceholderText('Search...'));

      expect(await screen.findByRole('listbox')).toBeInTheDocument();
      expect(mockSearchFn).toHaveBeenCalledTimes(1);
    });

    it('a click while the dropdown is open neither closes it nor fetches again', async () => {
      await openWithFocusItems();
      expect(mockSearchFn).toHaveBeenCalledTimes(1);

      await user.click(screen.getByPlaceholderText('Search...'));

      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(mockSearchFn).toHaveBeenCalledTimes(1);
    });

    it('without showItemsOnFocus and an empty input a click opens nothing', async () => {
      renderPicker({ autoFocus: true });
      await user.click(screen.getByPlaceholderText('Search...'));
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(mockSearchFn).not.toHaveBeenCalled();
    });

    it('without showItemsOnFocus a click on a focused input with text reopens the list', async () => {
      renderPicker();
      const input = screen.getByPlaceholderText('Search...');
      await user.type(input, 'al');
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      await screen.findByRole('listbox');
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

      await user.click(input);

      expect(await screen.findByRole('listbox')).toBeInTheDocument();
    });

    it('clearOnSelect: after a pick the input keeps focus with the list closed, and a later click opens it', async () => {
      const onChange = jest.fn();
      renderPicker({ showItemsOnFocus: true, clearOnSelect: true, onChange });
      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);
      await screen.findByRole('listbox');

      await user.click(options()[0]!);

      expect(onChange).toHaveBeenCalledWith('item-1');
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(input).toHaveFocus();

      await user.click(input);

      expect(await screen.findByRole('listbox')).toBeInTheDocument();
    });
  });

  describe('edge cases of the list and the search lifecycle', () => {
    it('ArrowUp with the list closed does nothing', async () => {
      renderPicker({ showItemsOnFocus: true, autoFocus: true });
      await user.keyboard('{ArrowUp}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('ArrowUp and ArrowDown with an open list that has no options do nothing', async () => {
      mockSearchFn.mockResolvedValue([]);
      renderPicker({ showItemsOnFocus: true });
      await user.click(screen.getByPlaceholderText('Search...'));
      await screen.findByRole('listbox');
      expect(screen.queryAllByRole('option')).toHaveLength(0);

      await user.keyboard('{ArrowUp}{ArrowDown}');

      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search...')).toHaveFocus();
    });

    it('ignores the answer of a superseded initial search', async () => {
      let resolveFirst!: (value: TestItem[]) => void;
      mockSearchFn.mockReturnValueOnce(
        new Promise<TestItem[]>((r) => {
          resolveFirst = r;
        }),
      );
      mockSearchFn.mockResolvedValueOnce([{ id: 'item-9', label: 'Second Answer' }]);
      renderPicker({ showItemsOnFocus: true });
      await user.click(screen.getByPlaceholderText('Search...'));
      await user.keyboard('{Escape}');
      await user.keyboard('{ArrowDown}');
      expect(await screen.findByText('Second Answer')).toBeInTheDocument();

      await act(async () => {
        resolveFirst([{ id: 'item-8', label: 'Stale Answer' }]);
      });

      expect(screen.queryByText('Stale Answer')).not.toBeInTheDocument();
      expect(screen.getByText('Second Answer')).toBeInTheDocument();
    });

    it('a second pick before the parent accepts the first re-arms the pending focus', async () => {
      render(
        <RawSearchPicker<TestItem>
          value=""
          onChange={() => {}}
          excludeIds={[]}
          searchFn={mockSearchFn}
          renderItem={(item) => ({ id: item.id, label: item.label })}
          placeholder="Search..."
          showItemsOnFocus
        />,
      );
      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);
      await screen.findByRole('listbox');
      await user.click(options()[0]!);

      await user.click(input);
      await screen.findByRole('listbox');
      await user.click(options()[1]!);

      // The parent never accepted a value: focus stays on the input, never on <body>
      expect(input).toHaveFocus();
    });
  });
});
