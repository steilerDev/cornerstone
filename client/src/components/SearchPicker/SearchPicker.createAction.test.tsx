/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../Modal/Modal.js';
import { ControlledSearchPicker } from '../../test/ControlledSearchPicker.js';
import type { SearchPicker } from './SearchPicker.js';
import { type SearchPickerCreateAction } from './SearchPicker.js';

interface TestItem {
  id: string;
  label: string;
}

const sampleItems: TestItem[] = [
  { id: 'item-1', label: 'Alpha Widget' },
  { id: 'item-2', label: 'Beta Gadget' },
];

const mockSearchFn =
  jest.fn<(query: string, excludeIds: string[], signal: AbortSignal) => Promise<TestItem[]>>();
const mockRenderItem = (item: TestItem) => ({ id: item.id, label: item.label });
const mockOnChange = jest.fn<(id: string) => void>();
const mockOnSelectItem = jest.fn<(item: { id: string; label: string }) => void>();
const mockOnCreate = jest.fn<(query: string) => Promise<TestItem | null>>();
const mockGetLabel = jest.fn<(query: string) => string>();

function createAction(): SearchPickerCreateAction<TestItem> {
  return { getLabel: mockGetLabel, onCreate: mockOnCreate };
}

function renderPicker(
  props: Partial<React.ComponentProps<typeof SearchPicker<TestItem>>> = {},
  withCreate = true,
) {
  return render(
    <ControlledSearchPicker<TestItem>
      value=""
      onChange={mockOnChange}
      onSelectItem={mockOnSelectItem}
      excludeIds={[]}
      searchFn={mockSearchFn}
      renderItem={mockRenderItem}
      placeholder="Search..."
      {...(withCreate ? { createAction: createAction() } : {})}
      {...props}
    />,
  );
}

describe('SearchPicker createAction (Story #2148)', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    mockSearchFn.mockReset();
    mockSearchFn.mockResolvedValue(sampleItems);
    mockOnChange.mockReset();
    mockOnSelectItem.mockReset();
    mockOnCreate.mockReset();
    mockGetLabel.mockReset();
    mockGetLabel.mockImplementation((q) => (q ? `Add "${q}"` : 'Add new'));
    jest.useFakeTimers();
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime.bind(jest) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('without createAction', () => {
    it('does not open on focus, does not search, and renders no create row', async () => {
      renderPicker({}, false);

      await user.click(screen.getByPlaceholderText('Search...'));

      expect(mockSearchFn).not.toHaveBeenCalled();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(screen.queryByText(/Add/)).not.toBeInTheDocument();
    });
  });

  describe('with createAction', () => {
    it('opens on focus, searches with an empty query and shows the create row last', async () => {
      renderPicker();

      await user.click(screen.getByPlaceholderText('Search...'));

      await waitFor(() => {
        expect(screen.getByText('Alpha Widget')).toBeInTheDocument();
      });
      expect(mockSearchFn).toHaveBeenCalledWith('', [], expect.any(AbortSignal));
      const options = await screen.findAllByRole('option');
      expect(options).toHaveLength(3);
      expect(options[options.length - 1]).toHaveAccessibleName('Add new');
      expect(mockGetLabel).toHaveBeenCalledWith('');
    });

    describe('reopening a closed picker', () => {
      async function typeThenClose() {
        renderPicker();
        const input = screen.getByPlaceholderText('Search...');
        await user.type(input, 'alp');
        await waitFor(() => {
          expect(mockSearchFn).toHaveBeenCalledWith('alp', [], expect.any(AbortSignal));
        });
        await user.keyboard('{Escape}');
        await waitFor(() => {
          expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        });
        mockSearchFn.mockClear();
        return input;
      }

      it('searches the text still in the input when the input is clicked again', async () => {
        const input = await typeThenClose();
        mockSearchFn.mockResolvedValue([sampleItems[0]!]);

        await user.click(input);

        await waitFor(() => {
          expect(mockSearchFn).toHaveBeenCalledWith('alp', [], expect.any(AbortSignal));
        });
        expect(await screen.findByText('Alpha Widget')).toBeInTheDocument();
        expect(screen.queryByText('Beta Gadget')).not.toBeInTheDocument();
        expect(mockSearchFn).not.toHaveBeenCalledWith('', [], expect.any(AbortSignal));
      });

      it('searches the text still in the input when focus returns to it', async () => {
        const input = await typeThenClose();
        input.blur();
        mockSearchFn.mockResolvedValue([sampleItems[0]!]);

        act(() => input.focus());

        await waitFor(() => {
          expect(mockSearchFn).toHaveBeenCalledWith('alp', [], expect.any(AbortSignal));
        });
        expect(mockSearchFn).not.toHaveBeenCalledWith('', [], expect.any(AbortSignal));
      });

      it('fetches the initial list when the input is empty', async () => {
        renderPicker();
        const input = screen.getByPlaceholderText('Search...');
        await user.click(input);
        await screen.findByText('Alpha Widget');
        await user.keyboard('{Escape}');
        await waitFor(() => {
          expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        });
        mockSearchFn.mockClear();

        await user.click(input);

        await waitFor(() => {
          expect(mockSearchFn).toHaveBeenCalledWith('', [], expect.any(AbortSignal));
        });
        expect(await screen.findByText('Beta Gadget')).toBeInTheDocument();
      });

      it('treats whitespace-only text as empty and fetches the initial list', async () => {
        renderPicker();
        const input = screen.getByPlaceholderText('Search...');
        await user.type(input, '  ');
        await user.keyboard('{Escape}');
        mockSearchFn.mockClear();

        await user.click(input);

        await waitFor(() => {
          expect(mockSearchFn).toHaveBeenCalledWith('', [], expect.any(AbortSignal));
        });
        expect(mockSearchFn).not.toHaveBeenCalledWith('  ', [], expect.any(AbortSignal));
      });
    });

    it('still shows the create row after the "no results" message', async () => {
      mockSearchFn.mockResolvedValue([]);
      renderPicker();
      const input = screen.getByPlaceholderText('Search...');

      await user.type(input, 'Zzz');

      await waitFor(() => {
        expect(screen.getByText('No matching items found')).toBeInTheDocument();
      });
      const options = await screen.findAllByRole('option');
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveAccessibleName('Add "Zzz"');
    });

    it('passes the trimmed query to getLabel', async () => {
      renderPicker();

      await user.type(screen.getByPlaceholderText('Search...'), '  Acme  ');

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Add "Acme"' })).toBeInTheDocument();
      });
      expect(mockGetLabel).toHaveBeenLastCalledWith('Acme');
    });

    it('calls onCreate once with the trimmed query when the row is clicked, and closes the dropdown', async () => {
      mockOnCreate.mockResolvedValue(null);
      renderPicker();

      await user.type(screen.getByPlaceholderText('Search...'), '  Acme  ');
      await user.click(await screen.findByRole('option', { name: 'Add "Acme"' }));

      expect(mockOnCreate).toHaveBeenCalledTimes(1);
      expect(mockOnCreate).toHaveBeenCalledWith('Acme');
      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });

    it('activates the create row with the Enter key', async () => {
      mockOnCreate.mockResolvedValue(null);
      renderPicker();

      await user.type(screen.getByPlaceholderText('Search...'), 'Acme');
      const row = await screen.findByRole('option', { name: 'Add "Acme"' });
      await user.keyboard('{ArrowDown}');
      for (let i = 0; i < 5 && document.activeElement !== row; i++) {
        await user.keyboard('{ArrowDown}');
      }
      expect(document.activeElement).toBe(row);
      await user.keyboard('{Enter}');

      expect(mockOnCreate).toHaveBeenCalledTimes(1);
      expect(mockOnCreate).toHaveBeenCalledWith('Acme');
    });

    it('passes an empty query to onCreate when nothing was typed', async () => {
      mockOnCreate.mockResolvedValue(null);
      renderPicker();

      await user.click(screen.getByPlaceholderText('Search...'));
      await user.click(await screen.findByRole('option', { name: 'Add new' }));

      expect(mockOnCreate).toHaveBeenCalledWith('');
    });

    it('selects the created item, shows its label and moves focus to the clear button', async () => {
      mockOnCreate.mockResolvedValue({ id: 'new-1', label: 'Acme Corp' });
      renderPicker();

      await user.type(screen.getByPlaceholderText('Search...'), 'Acme');
      await user.click(await screen.findByRole('option', { name: 'Add "Acme"' }));

      await waitFor(() => {
        expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      });
      expect(mockOnChange).toHaveBeenCalledWith('new-1');
      expect(mockOnSelectItem).toHaveBeenCalledWith({ id: 'new-1', label: 'Acme Corp' });
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Clear selection' }));
    });

    it('selects nothing and refocuses the input without reopening when onCreate resolves null', async () => {
      mockOnCreate.mockResolvedValue(null);
      renderPicker();
      const input = screen.getByPlaceholderText('Search...');

      await user.type(input, 'Acme');
      await user.click(await screen.findByRole('option', { name: 'Add "Acme"' }));

      await waitFor(() => {
        expect(document.activeElement).toBe(input);
      });
      expect(mockOnChange).not.toHaveBeenCalled();
      expect(mockOnSelectItem).not.toHaveBeenCalled();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

      // A later manual focus opens the dropdown again
      input.blur();
      await user.click(input);
      expect(await screen.findByRole('listbox')).toBeInTheDocument();
    });

    it('treats a rejected onCreate like a cancel', async () => {
      mockOnCreate.mockRejectedValue(new Error('boom'));
      renderPicker();
      const input = screen.getByPlaceholderText('Search...');

      await user.type(input, 'Acme');
      await user.click(await screen.findByRole('option', { name: 'Add "Acme"' }));

      await waitFor(() => {
        expect(document.activeElement).toBe(input);
      });
      expect(mockOnChange).not.toHaveBeenCalled();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('shows the new label after clearing a pre-populated initialTitle and creating', async () => {
      mockOnCreate.mockResolvedValue({ id: 'new-2', label: 'Fresh GmbH' });
      renderPicker({ value: 'old-id', initialTitle: 'Old Vendor' });

      expect(screen.getByText('Old Vendor')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Clear selection' }));
      await user.type(screen.getByPlaceholderText('Search...'), 'Fresh');
      await user.click(await screen.findByRole('option', { name: 'Add "Fresh"' }));

      await waitFor(() => {
        expect(screen.getByText('Fresh GmbH')).toBeInTheDocument();
      });
      expect(screen.queryByText('Old Vendor')).not.toBeInTheDocument();
    });
  });

  describe('keyboard navigation', () => {
    async function openList() {
      renderPicker();
      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);
      const options = await screen.findAllByRole('option');
      expect(options).toHaveLength(3);
      return { input, options };
    }

    it('ArrowDown on a closed (focused) picker opens it', async () => {
      const { input } = await openList();
      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
      expect(document.activeElement).toBe(input);

      await user.keyboard('{ArrowDown}');

      expect(await screen.findByRole('listbox')).toBeInTheDocument();
    });

    it('ArrowDown from the input enters the list at the first option', async () => {
      const { options } = await openList();

      await user.keyboard('{ArrowDown}');

      expect(document.activeElement).toBe(options[0]);
    });

    it('ArrowUp from the input focuses the last option (the create row)', async () => {
      const { options } = await openList();

      await user.keyboard('{ArrowUp}');

      expect(document.activeElement).toBe(options[2]);
      expect(options[2]).toHaveAccessibleName('Add new');
    });

    it('ArrowDown and ArrowUp move between options and stop at the last', async () => {
      const { options } = await openList();

      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');
      expect(document.activeElement).toBe(options[1]);
      await user.keyboard('{ArrowDown}');
      expect(document.activeElement).toBe(options[2]);
      await user.keyboard('{ArrowDown}');
      expect(document.activeElement).toBe(options[2]);
      await user.keyboard('{ArrowUp}');
      expect(document.activeElement).toBe(options[1]);
    });

    it('ArrowUp on the first option returns to the input without refetching or closing', async () => {
      const { input, options } = await openList();
      await user.keyboard('{ArrowDown}');
      expect(document.activeElement).toBe(options[0]);
      const callsBefore = mockSearchFn.mock.calls.length;

      await user.keyboard('{ArrowUp}');

      expect(document.activeElement).toBe(input);
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(mockSearchFn).toHaveBeenCalledTimes(callsBefore);
    });

    it('Home and End jump to the first and last option', async () => {
      const { options } = await openList();
      await user.keyboard('{ArrowDown}');

      await user.keyboard('{End}');
      expect(document.activeElement).toBe(options[2]);
      await user.keyboard('{Home}');
      expect(document.activeElement).toBe(options[0]);
    });

    it('Escape on an option closes the list and focuses the input without reopening', async () => {
      const { input } = await openList();
      await user.keyboard('{ArrowDown}');
      const callsBefore = mockSearchFn.mock.calls.length;

      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
      expect(document.activeElement).toBe(input);
      expect(mockSearchFn).toHaveBeenCalledTimes(callsBefore);
    });

    it('ArrowDown with an empty query does nothing without createAction or showItemsOnFocus', async () => {
      renderPicker({}, false);
      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);

      await user.keyboard('{ArrowDown}');

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(mockSearchFn).not.toHaveBeenCalled();
    });
  });

  describe('Escape inside a Modal', () => {
    const onModalClose = jest.fn<() => void>();

    function renderInModal() {
      onModalClose.mockReset();
      return render(
        <Modal title="Host" onClose={onModalClose}>
          <ControlledSearchPicker<TestItem>
            value=""
            onChange={mockOnChange}
            excludeIds={[]}
            searchFn={mockSearchFn}
            renderItem={mockRenderItem}
            placeholder="Search..."
            createAction={createAction()}
          />
        </Modal>,
      );
    }

    it('Escape in the input closes only the open dropdown, not the Modal', async () => {
      renderInModal();
      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);
      await screen.findAllByRole('option');

      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
      expect(onModalClose).not.toHaveBeenCalled();
    });

    it('Escape in the listbox closes only the dropdown, not the Modal', async () => {
      renderInModal();
      await user.click(screen.getByPlaceholderText('Search...'));
      await screen.findAllByRole('option');
      await user.keyboard('{ArrowDown}');

      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
      expect(onModalClose).not.toHaveBeenCalled();
    });

    it('Escape with the dropdown closed closes the Modal', async () => {
      renderInModal();
      const input = screen.getByPlaceholderText('Search...');
      await user.click(input);
      await screen.findAllByRole('option');
      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
      expect(onModalClose).not.toHaveBeenCalled();

      await user.keyboard('{Escape}');

      expect(onModalClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('inputAriaProps', () => {
    it('spreads the aria props onto the input element', () => {
      renderPicker({
        inputAriaProps: {
          'aria-required': true,
          'aria-invalid': true,
          'aria-describedby': 'vendor-error',
        },
      });

      const input = screen.getByPlaceholderText('Search...');
      expect(input).toHaveAttribute('aria-required', 'true');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby', 'vendor-error');
    });

    it('adds no aria attributes when not provided', () => {
      renderPicker({}, false);

      const input = screen.getByPlaceholderText('Search...');
      expect(input).not.toHaveAttribute('aria-required');
      expect(input).not.toHaveAttribute('aria-invalid');
      expect(input).not.toHaveAttribute('aria-describedby');
    });
  });

  describe("show: 'noExactMatch' (#2213)", () => {
    function renderNoExact(items: TestItem[] = sampleItems) {
      mockSearchFn.mockResolvedValue(items);
      return renderPicker({
        createAction: { getLabel: mockGetLabel, onCreate: mockOnCreate, show: 'noExactMatch' },
      });
    }
    const createRow = () => screen.queryByRole('option', { name: /^Add / });

    it('hides the row for an empty query', async () => {
      renderNoExact();

      await user.click(screen.getByPlaceholderText('Search...'));

      await screen.findByText('Alpha Widget');
      expect(createRow()).not.toBeInTheDocument();
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });

    it('hides the row for a whitespace-only query', async () => {
      renderNoExact([]);

      await user.type(screen.getByPlaceholderText('Search...'), '   ');

      await waitFor(() => expect(mockSearchFn).toHaveBeenCalled());
      expect(createRow()).not.toBeInTheDocument();
    });

    it('hides the row while the search is loading', async () => {
      mockSearchFn.mockReturnValue(new Promise(() => {}));
      renderPicker({
        createAction: { getLabel: mockGetLabel, onCreate: mockOnCreate, show: 'noExactMatch' },
      });

      await user.type(screen.getByPlaceholderText('Search...'), 'Gamma');

      await waitFor(() =>
        expect(mockSearchFn).toHaveBeenCalledWith('Gamma', [], expect.any(AbortSignal)),
      );
      expect(createRow()).not.toBeInTheDocument();
    });

    it('hides the row when the search failed', async () => {
      mockSearchFn.mockRejectedValue(new Error('boom'));
      renderPicker({
        createAction: { getLabel: mockGetLabel, onCreate: mockOnCreate, show: 'noExactMatch' },
      });

      await user.type(screen.getByPlaceholderText('Search...'), 'Gamma');

      await waitFor(() =>
        expect(mockSearchFn).toHaveBeenCalledWith('Gamma', [], expect.any(AbortSignal)),
      );
      expect(await screen.findByText('Failed to search items')).toBeInTheDocument();
      expect(createRow()).not.toBeInTheDocument();
    });

    it.each(['alpha widget', 'ALPHA WIDGET', '  Alpha Widget  '])(
      'hides the row when a result equals the query ignoring case and spaces (%j)',
      async (typed) => {
        renderNoExact();

        await user.type(screen.getByPlaceholderText('Search...'), typed);

        await screen.findByText('Alpha Widget');
        expect(createRow()).not.toBeInTheDocument();
      },
    );

    it('hides the row when a result equals the query ignoring umlauts and digraphs', async () => {
      renderNoExact([{ id: 'u1', label: 'Müller Bau' }]);

      await user.type(screen.getByPlaceholderText('Search...'), 'mueller bau');

      await screen.findByText('Müller Bau');
      expect(createRow()).not.toBeInTheDocument();
    });

    it('shows the row last when there are results but none is exact', async () => {
      renderNoExact();

      await user.type(screen.getByPlaceholderText('Search...'), 'Alpha');

      await screen.findByRole('option', { name: 'Add "Alpha"' });
      const options = await screen.findAllByRole('option');
      expect(options).toHaveLength(3);
      expect(options[2]).toHaveAccessibleName('Add "Alpha"');
    });

    it('hides the row between typing and the search answer, then shows it once results arrive', async () => {
      let resolveSearch: (items: TestItem[]) => void = () => {};
      mockSearchFn.mockImplementation(
        () =>
          new Promise<TestItem[]>((resolve) => {
            resolveSearch = resolve;
          }),
      );
      renderPicker({
        createAction: { getLabel: mockGetLabel, onCreate: mockOnCreate, show: 'noExactMatch' },
      });

      await user.type(screen.getByPlaceholderText('Search...'), 'Gamma');

      // Debounce window: the search has not even started.
      expect(mockSearchFn).not.toHaveBeenCalledWith('Gamma', [], expect.any(AbortSignal));
      expect(createRow()).not.toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(300);
      });
      await waitFor(() =>
        expect(mockSearchFn).toHaveBeenCalledWith('Gamma', [], expect.any(AbortSignal)),
      );
      expect(createRow()).not.toBeInTheDocument();

      await act(async () => {
        resolveSearch(sampleItems);
      });
      expect(await screen.findByRole('option', { name: 'Add "Gamma"' })).toBeInTheDocument();
    });

    it('keeps the row hidden when an aborted older search answers late', async () => {
      const resolvers: Array<(items: TestItem[]) => void> = [];
      mockSearchFn.mockImplementation(
        () =>
          new Promise<TestItem[]>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      renderPicker({
        createAction: { getLabel: mockGetLabel, onCreate: mockOnCreate, show: 'noExactMatch' },
      });
      const input = screen.getByPlaceholderText('Search...');

      await user.type(input, 'Gam');
      act(() => {
        jest.advanceTimersByTime(300);
      });
      // resolvers[0] is the on-focus search, already superseded by typing.
      await waitFor(() => expect(resolvers).toHaveLength(2));
      await user.type(input, 'ma');
      act(() => {
        jest.advanceTimersByTime(300);
      });
      await waitFor(() => expect(resolvers).toHaveLength(3));

      // The first (aborted) search answers: it must not clear the flag.
      await act(async () => {
        resolvers[1]!([]);
      });
      expect(createRow()).not.toBeInTheDocument();

      await act(async () => {
        resolvers[2]!([]);
      });
      expect(await screen.findByRole('option', { name: 'Add "Gamma"' })).toBeInTheDocument();
    });

    it('shows the error and no create row when the search fails', async () => {
      mockSearchFn.mockRejectedValue(new Error('boom'));
      renderNoExact();

      await user.type(screen.getByPlaceholderText('Search...'), 'Gamma');

      await waitFor(() => expect(mockSearchFn).toHaveBeenCalled());
      expect(createRow()).not.toBeInTheDocument();
    });

    it('does not count a partial match as exact', async () => {
      renderNoExact([{ id: 'p1', label: 'Alpha Widget Deluxe' }]);

      await user.type(screen.getByPlaceholderText('Search...'), 'Alpha Widget');

      expect(await screen.findByRole('option', { name: 'Add "Alpha Widget"' })).toBeInTheDocument();
    });

    it('replaces the "no results" line when there are zero results', async () => {
      renderNoExact([]);

      await user.type(screen.getByPlaceholderText('Search...'), 'Zzz');

      expect(await screen.findByRole('option', { name: 'Add "Zzz"' })).toBeInTheDocument();
      expect(screen.queryByText('No matching items found')).not.toBeInTheDocument();
    });

    it('shows the full label as the row tooltip', async () => {
      mockGetLabel.mockImplementation((q) => `New company ${q}`);
      renderNoExact([]);

      await user.type(screen.getByPlaceholderText('Search...'), 'Acme');

      const row = await screen.findByRole('option', { name: 'New company Acme' });
      expect(row).toHaveAttribute('title', 'New company Acme');
    });

    it('still creates from the row with the trimmed query', async () => {
      mockOnCreate.mockResolvedValue(null);
      renderNoExact([]);

      await user.type(screen.getByPlaceholderText('Search...'), '  Acme ');
      await user.click(await screen.findByRole('option', { name: 'Add "Acme"' }));

      expect(mockOnCreate).toHaveBeenCalledWith('Acme');
    });

    it("keeps 'no results' and the row when show is 'always'", async () => {
      mockSearchFn.mockResolvedValue([]);
      renderPicker({
        createAction: { getLabel: mockGetLabel, onCreate: mockOnCreate, show: 'always' },
      });

      await user.type(screen.getByPlaceholderText('Search...'), 'Zzz');

      expect(await screen.findByText('No matching items found')).toBeInTheDocument();
      expect(await screen.findByRole('option', { name: 'Add "Zzz"' })).toBeInTheDocument();
    });
  });

  describe("show: 'always' during the debounce window", () => {
    it('keeps the create row available while the search is still pending', async () => {
      mockSearchFn.mockReturnValue(new Promise(() => {}));
      renderPicker({
        createAction: { getLabel: mockGetLabel, onCreate: mockOnCreate, show: 'always' },
      });

      await user.type(screen.getByPlaceholderText('Search...'), 'Gamma');

      expect(await screen.findByRole('option', { name: 'Add "Gamma"' })).toBeInTheDocument();
    });
  });

  describe('showWhenEmpty with noExactMatch (#2213)', () => {
    const action = (over: Partial<SearchPickerCreateAction<TestItem>> = {}) => ({
      getLabel: mockGetLabel,
      onCreate: mockOnCreate,
      show: 'noExactMatch' as const,
      showWhenEmpty: true,
      ...over,
    });

    it('shows the row for an empty query once the results have loaded, labelled by getLabel("")', async () => {
      renderPicker({ createAction: action() });

      await user.click(screen.getByPlaceholderText('Search...'));

      await screen.findByText('Alpha Widget');
      expect(await screen.findByRole('option', { name: 'Add new' })).toBeInTheDocument();
      expect(mockGetLabel).toHaveBeenCalledWith('');
    });

    it('creates with an empty query from that row', async () => {
      mockOnCreate.mockResolvedValue(null);
      renderPicker({ createAction: action() });

      await user.click(screen.getByPlaceholderText('Search...'));
      await user.click(await screen.findByRole('option', { name: 'Add new' }));

      expect(mockOnCreate).toHaveBeenCalledWith('');
    });

    it('keeps the row hidden while the first search is loading', async () => {
      mockSearchFn.mockReturnValue(new Promise(() => {}));
      renderPicker({ createAction: action() });

      await user.click(screen.getByPlaceholderText('Search...'));

      await waitFor(() => expect(mockSearchFn).toHaveBeenCalled());
      expect(screen.queryByRole('option', { name: 'Add new' })).not.toBeInTheDocument();
    });

    it('keeps the row hidden when the search failed', async () => {
      mockSearchFn.mockRejectedValue(new Error('boom'));
      renderPicker({ createAction: action() });

      await user.click(screen.getByPlaceholderText('Search...'));

      expect(await screen.findByText('Failed to load items')).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Add new' })).not.toBeInTheDocument();
    });

    it('still hides the row for a typed query that equals a result', async () => {
      renderPicker({ createAction: action() });

      await user.type(screen.getByPlaceholderText('Search...'), 'alpha widget');

      await screen.findByRole('option', { name: 'Alpha Widget' });
      expect(screen.queryByRole('option', { name: /^Add / })).not.toBeInTheDocument();
    });

    it('without showWhenEmpty the empty query shows no row', async () => {
      renderPicker({ createAction: action({ showWhenEmpty: false }) });

      await user.click(screen.getByPlaceholderText('Search...'));

      await screen.findByText('Alpha Widget');
      expect(screen.queryByRole('option', { name: 'Add new' })).not.toBeInTheDocument();
    });

    it('showWhenEmpty has no effect on show "always"', async () => {
      renderPicker({ createAction: action({ show: 'always' }) });

      await user.click(screen.getByPlaceholderText('Search...'));

      expect(await screen.findByRole('option', { name: 'Add new' })).toBeInTheDocument();
    });
  });

  describe('stale answers and the pending flag (#2236 round 2)', () => {
    interface Call {
      query: string;
      signal: AbortSignal;
      resolve: (items: TestItem[]) => void;
    }
    let calls: Call[];

    function deferSearches() {
      calls = [];
      mockSearchFn.mockImplementation(
        (query, _exclude, signal) =>
          new Promise<TestItem[]>((resolve) => {
            calls.push({ query, signal, resolve });
          }),
      );
    }

    const lastCall = (query: string) => [...calls].reverse().find((c) => c.query === query)!;
    const createRow = () => screen.queryByRole('option', { name: /^Add / });

    const action = (over: Partial<SearchPickerCreateAction<TestItem>> = {}) => ({
      getLabel: mockGetLabel,
      onCreate: mockOnCreate,
      show: 'noExactMatch' as const,
      ...over,
    });

    function pickerElement(value: string) {
      return (
        <ControlledSearchPicker<TestItem>
          value={value}
          onChange={mockOnChange}
          onSelectItem={mockOnSelectItem}
          excludeIds={[]}
          searchFn={mockSearchFn}
          renderItem={mockRenderItem}
          placeholder="Search..."
          createAction={action({ showWhenEmpty: true })}
        />
      );
    }

    async function typeAndStartSearch(input: HTMLElement, text: string) {
      await user.type(input, text);
      act(() => {
        jest.advanceTimersByTime(300);
      });
      await waitFor(() => expect(calls.some((c) => c.query === text)).toBe(true));
    }

    async function staleAnswerScenario() {
      deferSearches();
      renderPicker({ createAction: action() });
      const input = screen.getByPlaceholderText('Search...');

      await typeAndStartSearch(input, 'Acme X');
      await user.type(input, '{Backspace}{Backspace}');
      expect(input).toHaveValue('Acme');

      // Search A (for "Acme X") answers while the text is already "Acme".
      await act(async () => {
        lastCall('Acme X').resolve([{ id: 'x1', label: 'Zeta Corp' }]);
      });
      expect(createRow()).not.toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(300);
      });
      await waitFor(() => expect(calls.some((c) => c.query === 'Acme')).toBe(true));
    }

    it('keeps the row hidden when the answer for the latest text contains an exact match', async () => {
      await staleAnswerScenario();

      await act(async () => {
        lastCall('Acme').resolve([{ id: 'a1', label: 'Acme' }]);
      });

      await screen.findByRole('option', { name: 'Acme' });
      expect(createRow()).not.toBeInTheDocument();
    });

    it('shows the row once the answer for the latest text has no exact match', async () => {
      await staleAnswerScenario();

      await act(async () => {
        lastCall('Acme').resolve([{ id: 'a2', label: 'Acme Holdings' }]);
      });

      expect(await screen.findByRole('option', { name: 'Add "Acme"' })).toBeInTheDocument();
    });

    it('does not strand the flag when the host resets the value and the old search answers late', async () => {
      deferSearches();
      const view = render(pickerElement(''));
      await typeAndStartSearch(screen.getByPlaceholderText('Search...'), 'Gam');

      view.rerender(pickerElement('picked'));
      view.rerender(pickerElement(''));
      expect(screen.getByPlaceholderText('Search...')).toHaveValue('');

      await act(async () => {
        lastCall('Gam').resolve([]);
      });

      await user.click(screen.getByPlaceholderText('Search...'));
      await waitFor(() => expect(calls.some((c) => c.query === '')).toBe(true));
      await act(async () => {
        lastCall('').resolve(sampleItems);
      });

      expect(await screen.findByRole('option', { name: 'Add new' })).toBeInTheDocument();
    });

    it('lets the empty-text row appear when focusing aborts the old search after a reset', async () => {
      deferSearches();
      const view = render(pickerElement(''));
      await typeAndStartSearch(screen.getByPlaceholderText('Search...'), 'Gam');
      const old = lastCall('Gam');

      view.rerender(pickerElement('picked'));
      view.rerender(pickerElement(''));

      // Leave the input, then focus it again: the focus search aborts the old one.
      await user.click(document.body);
      const before = calls.length;
      await user.click(screen.getByPlaceholderText('Search...'));
      await waitFor(() => expect(calls.length).toBeGreaterThan(before));
      expect(old.signal.aborted).toBe(true);
      await act(async () => {
        old.resolve([]);
        lastCall('').resolve(sampleItems);
      });

      expect(await screen.findByRole('option', { name: 'Add new' })).toBeInTheDocument();
    });

    it('keeps the flag set when the initial search answers while non-blank text is typed', async () => {
      deferSearches();
      renderPicker({ createAction: action() });
      const input = screen.getByPlaceholderText('Search...');

      await user.click(input);
      await waitFor(() => expect(calls.some((c) => c.query === '')).toBe(true));
      await user.type(input, 'Zed');
      await act(async () => {
        lastCall('').resolve([{ id: 'z1', label: 'Other' }]);
      });

      await screen.findByRole('option', { name: 'Other' });
      expect(createRow()).not.toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(300);
      });
      await waitFor(() => expect(calls.some((c) => c.query === 'Zed')).toBe(true));
      await act(async () => {
        lastCall('Zed').resolve([]);
      });
      expect(await screen.findByRole('option', { name: 'Add "Zed"' })).toBeInTheDocument();
    });

    it('lets the empty-text row appear after backspacing the text to blank', async () => {
      deferSearches();
      renderPicker({ createAction: action({ showWhenEmpty: true }) });
      const input = screen.getByPlaceholderText('Search...');

      await typeAndStartSearch(input, 'G');
      await act(async () => {
        lastCall('G').resolve([]);
      });

      await user.type(input, '{Backspace}');
      expect(input).toHaveValue('');
      expect(createRow()).not.toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(300);
      });
      await waitFor(() => expect(calls.some((c) => c.query === '')).toBe(true));
      await act(async () => {
        lastCall('').resolve(sampleItems);
      });

      expect(await screen.findByRole('option', { name: 'Add new' })).toBeInTheDocument();
    });

    it('does not strand the flag when an item is selected inside the debounce window', async () => {
      deferSearches();
      renderPicker({
        createAction: action({ showWhenEmpty: true }),
        clearOnSelect: true,
      });
      const input = screen.getByPlaceholderText('Search...');

      await user.click(input);
      await waitFor(() => expect(calls.some((c) => c.query === '')).toBe(true));
      await act(async () => {
        lastCall('').resolve(sampleItems);
      });

      await user.type(input, 'Gam');
      await user.click(await screen.findByRole('option', { name: 'Alpha Widget' }));
      expect(input).toHaveValue('');

      const before = calls.length;
      await user.click(input);
      await user.keyboard('{ArrowDown}');
      await waitFor(() => expect(calls.length).toBeGreaterThan(before));
      await act(async () => {
        lastCall('').resolve(sampleItems);
      });

      expect(await screen.findByRole('option', { name: 'Add new' })).toBeInTheDocument();
    });
  });
});
