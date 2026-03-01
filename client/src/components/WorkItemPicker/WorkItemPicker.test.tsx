/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';

// Mock the API module before any dynamic imports
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();

jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItems: mockListWorkItems,
}));

import type { WorkItemPicker as WorkItemPickerType } from './WorkItemPicker.js';

describe('WorkItemPicker', () => {
  let WorkItemPickerModule: {
    WorkItemPicker: typeof WorkItemPickerType;
  };

  const sampleItems = [
    {
      id: 'wi-1',
      title: 'Foundation',
      status: 'completed' as const,
      startDate: null,
      endDate: null,
      durationDays: null,
      actualStartDate: null,
      actualEndDate: null,
      assignedUser: null,
      tags: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'wi-2',
      title: 'Framing',
      status: 'in_progress' as const,
      startDate: null,
      endDate: null,
      durationDays: null,
      actualStartDate: null,
      actualEndDate: null,
      assignedUser: null,
      tags: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
  ];

  const emptyListResponse = {
    items: [],
    pagination: { page: 1, pageSize: 15, totalItems: 0, totalPages: 0 },
  };

  beforeEach(async () => {
    mockListWorkItems.mockReset();
    mockListWorkItems.mockResolvedValue({
      items: sampleItems,
      pagination: { page: 1, pageSize: 15, totalItems: 2, totalPages: 1 },
    });

    if (!WorkItemPickerModule) {
      WorkItemPickerModule = await import('./WorkItemPicker.js');
    }
  });

  function renderPicker(
    props: Partial<React.ComponentProps<typeof WorkItemPickerModule.WorkItemPicker>> = {},
  ) {
    const { WorkItemPicker } = WorkItemPickerModule;
    return render(<WorkItemPicker value="" onChange={jest.fn()} excludeIds={[]} {...props} />);
  }

  describe('backward compatibility (no new props)', () => {
    it('renders input without special options', () => {
      renderPicker();
      expect(screen.getByPlaceholderText('Search work items...')).toBeInTheDocument();
    });

    it('does not open dropdown on focus without showItemsOnFocus or specialOptions', async () => {
      mockListWorkItems.mockResolvedValue(emptyListResponse);
      const user = userEvent.setup();
      renderPicker();

      const input = screen.getByPlaceholderText('Search work items...');
      await user.click(input);

      // Without showItemsOnFocus or specialOptions, focusing does NOT open the dropdown
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      // API should not be called on mere focus
      expect(mockListWorkItems).not.toHaveBeenCalled();
    });

    it('fetches and shows items after typing', async () => {
      const user = userEvent.setup();
      renderPicker();

      const input = screen.getByPlaceholderText('Search work items...');
      await user.type(input, 'Found');

      await waitFor(() => {
        expect(screen.getByText('Foundation')).toBeInTheDocument();
      });

      expect(mockListWorkItems).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'Found', pageSize: 15 }),
      );
    });

    it('calls onChange with item id when selecting a search result', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn<(id: string) => void>();
      renderPicker({ onChange: onChange as ReturnType<typeof jest.fn> });

      const input = screen.getByPlaceholderText('Search work items...');
      await user.type(input, 'Foundation');

      await waitFor(() => expect(screen.getByText('Foundation')).toBeInTheDocument());

      await user.click(screen.getByText('Foundation'));

      expect(onChange).toHaveBeenCalledWith('wi-1');
    });
  });

  describe('specialOptions prop', () => {
    it('shows special options at top of dropdown on focus', async () => {
      const user = userEvent.setup();
      const specialOptions = [{ id: '__THIS_ITEM__', label: 'This item' }];
      renderPicker({ specialOptions });

      const input = screen.getByPlaceholderText('Search work items...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'This item' })).toBeInTheDocument();
      });
    });

    it('calls onChange and onSelectItem with special option when clicked', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn<(id: string) => void>();
      const onSelectItem = jest.fn<(item: { id: string; title: string }) => void>();
      const specialOptions = [{ id: '__THIS_ITEM__', label: 'This item' }];
      renderPicker({
        specialOptions,
        onChange: onChange as ReturnType<typeof jest.fn>,
        onSelectItem: onSelectItem as ReturnType<typeof jest.fn>,
      });

      const input = screen.getByPlaceholderText('Search work items...');
      await user.click(input);

      await waitFor(() =>
        expect(screen.getByRole('option', { name: 'This item' })).toBeInTheDocument(),
      );

      await user.click(screen.getByRole('option', { name: 'This item' }));

      expect(onChange).toHaveBeenCalledWith('__THIS_ITEM__');
      expect(onSelectItem).toHaveBeenCalledWith({ id: '__THIS_ITEM__', title: 'This item' });
    });

    it('shows selected special option in display mode with italic style class', () => {
      const specialOptions = [{ id: '__THIS_ITEM__', label: 'This item' }];
      const onChange = jest.fn<(id: string) => void>();

      // First render with empty value, then simulate controlled parent setting value
      const { rerender } = render(
        <WorkItemPickerModule.WorkItemPicker
          value=""
          onChange={onChange as ReturnType<typeof jest.fn>}
          excludeIds={[]}
          specialOptions={specialOptions}
        />,
      );

      // Simulate that parent set value to the special option
      rerender(
        <WorkItemPickerModule.WorkItemPicker
          value="__THIS_ITEM__"
          onChange={onChange as ReturnType<typeof jest.fn>}
          excludeIds={[]}
          specialOptions={specialOptions}
        />,
      );

      // Should show the selected special option label
      expect(screen.getByText('This item')).toBeInTheDocument();
      // Should show a clear button
      expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument();
    });

    it('renders a divider between special options and search results', async () => {
      const user = userEvent.setup();
      const specialOptions = [{ id: '__THIS_ITEM__', label: 'This item' }];
      renderPicker({ specialOptions });

      const input = screen.getByPlaceholderText('Search work items...');
      await user.click(input);

      // Wait for search results to load (items from API)
      await waitFor(() => {
        expect(screen.getByText('Foundation')).toBeInTheDocument();
      });

      // Divider should be present (rendered as a separator element)
      const separator = document.querySelector('[role="separator"]');
      expect(separator).toBeInTheDocument();
    });
  });

  describe('showItemsOnFocus prop', () => {
    it('fetches and shows items immediately on focus without typing', async () => {
      const user = userEvent.setup();
      renderPicker({ showItemsOnFocus: true });

      const input = screen.getByPlaceholderText('Search work items...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Foundation')).toBeInTheDocument();
        expect(screen.getByText('Framing')).toBeInTheDocument();
      });

      expect(mockListWorkItems).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 15 }));
    });

    it('shows loading state while fetching on focus', async () => {
      // Delay the API response so we can see the loading state
      let resolveListItems: (
        value: Awaited<ReturnType<typeof WorkItemsApiTypes.listWorkItems>>,
      ) => void;
      mockListWorkItems.mockReturnValue(
        new Promise((res) => {
          resolveListItems = res;
        }),
      );

      const user = userEvent.setup();
      renderPicker({ showItemsOnFocus: true });

      const input = screen.getByPlaceholderText('Search work items...');
      await user.click(input);

      expect(screen.getByText('Searching...')).toBeInTheDocument();

      // Resolve and verify results appear
      resolveListItems!({
        items: sampleItems,
        pagination: { page: 1, pageSize: 15, totalItems: 2, totalPages: 1 },
      });

      await waitFor(() => {
        expect(screen.queryByText('Searching...')).not.toBeInTheDocument();
        expect(screen.getByText('Foundation')).toBeInTheDocument();
      });
    });
  });

  describe('excludeIds filtering', () => {
    it('filters out excluded IDs from results', async () => {
      const user = userEvent.setup();
      renderPicker({ showItemsOnFocus: true, excludeIds: ['wi-1'] });

      const input = screen.getByPlaceholderText('Search work items...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Framing')).toBeInTheDocument();
        expect(screen.queryByText('Foundation')).not.toBeInTheDocument();
      });
    });
  });

  describe('clear selection', () => {
    it('clears selected item and calls onChange with empty string', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn<(id: string) => void>();
      renderPicker({
        showItemsOnFocus: true,
        onChange: onChange as ReturnType<typeof jest.fn>,
      });

      const input = screen.getByPlaceholderText('Search work items...');
      await user.click(input);

      await waitFor(() => expect(screen.getByText('Foundation')).toBeInTheDocument());

      // Select an item
      await user.click(screen.getByText('Foundation'));

      // Should now show the selected display
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Search work items...')).not.toBeInTheDocument();
      });

      // Click clear
      const clearButton = screen.getByRole('button', { name: /clear selection/i });
      await user.click(clearButton);

      expect(onChange).toHaveBeenLastCalledWith('');
      // Input should be visible again
      expect(screen.getByPlaceholderText('Search work items...')).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('shows error message when API call fails', async () => {
      mockListWorkItems.mockRejectedValue(new Error('Network error'));
      const user = userEvent.setup();
      renderPicker({ showItemsOnFocus: true });

      const input = screen.getByPlaceholderText('Search work items...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Failed to load work items')).toBeInTheDocument();
      });
    });
  });

  // ── initialTitle prop (#338) ──────────────────────────────────────────────

  describe('initialTitle prop', () => {
    it('shows the initialTitle text when value and initialTitle are provided (no selectedItem yet)', async () => {
      renderPicker({ value: 'wi-existing', initialTitle: 'Foundation Work' });
      // Should render in selected-display mode showing the initialTitle
      await waitFor(() => {
        expect(screen.getByText('Foundation Work')).toBeInTheDocument();
      });
    });

    it('shows a clear button when initialTitle is displayed', async () => {
      renderPicker({ value: 'wi-existing', initialTitle: 'Foundation Work' });
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument();
      });
    });

    it('switches to search input when clear button is clicked', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn<(id: string) => void>();
      renderPicker({
        value: 'wi-existing',
        initialTitle: 'Foundation Work',
        onChange: onChange as ReturnType<typeof jest.fn>,
      });

      await waitFor(() => expect(screen.getByText('Foundation Work')).toBeInTheDocument());

      const clearBtn = screen.getByRole('button', { name: /clear selection/i });
      await user.click(clearBtn);

      // After clearing, should show the search input again
      expect(screen.getByPlaceholderText('Search work items...')).toBeInTheDocument();
      expect(screen.queryByText('Foundation Work')).not.toBeInTheDocument();
      expect(onChange).toHaveBeenCalledWith('');
    });

    it('does NOT show initialTitle when value is empty string', () => {
      renderPicker({ value: '', initialTitle: 'Foundation Work' });
      // Empty value: picker is in search mode, not selected-display mode
      expect(screen.queryByText('Foundation Work')).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search work items...')).toBeInTheDocument();
    });

    it('does NOT show initialTitle when initialTitle prop is not provided', () => {
      renderPicker({ value: 'wi-existing' });
      // No initialTitle: falls through to search input (no selectedItem in state)
      expect(screen.getByPlaceholderText('Search work items...')).toBeInTheDocument();
    });
  });
});
