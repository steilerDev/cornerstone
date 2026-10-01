/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../Modal/Modal.js';
import { SearchPicker, type SearchPickerCreateAction } from './SearchPicker.js';

interface TestItem {
  id: string;
  label: string;
}

const sampleItems: TestItem[] = [
  { id: 'item-1', label: 'Alpha Widget' },
  { id: 'item-2', label: 'Beta Gadget' },
];

const mockSearchFn = jest.fn<(query: string, excludeIds: string[]) => Promise<TestItem[]>>();
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
    <SearchPicker<TestItem>
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
      expect(mockSearchFn).toHaveBeenCalledWith('', []);
      const options = await screen.findAllByRole('option');
      expect(options).toHaveLength(3);
      expect(options[options.length - 1]).toHaveAccessibleName('Add new');
      expect(mockGetLabel).toHaveBeenCalledWith('');
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
          <SearchPicker<TestItem>
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
});
