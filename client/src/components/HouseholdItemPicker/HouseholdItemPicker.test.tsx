/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';

// Mock the API module before any dynamic imports
const mockListHouseholdItems = jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>();

jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  listHouseholdItems: mockListHouseholdItems,
}));

import type { HouseholdItemPicker as HouseholdItemPickerType } from './HouseholdItemPicker.js';

describe('HouseholdItemPicker', () => {
  let HouseholdItemPickerModule: {
    HouseholdItemPicker: typeof HouseholdItemPickerType;
  };

  const sampleItems = [
    {
      id: 'hi-1',
      name: 'Sofa',
      description: null,
      category: 'furniture' as const,
      status: 'not_ordered' as const,
      vendor: null,
      room: null,
      quantity: 1,
      orderDate: null,
      expectedDeliveryDate: null,
      actualDeliveryDate: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      url: null,
      tagIds: [],
      budgetLineCount: 0,
      totalPlannedAmount: 0,
      budgetSummary: {
        totalPlanned: 0,
        totalActual: 0,
        subsidyReduction: 0,
        netCost: 0,
      },
      createdBy: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'hi-2',
      name: 'Dining Table',
      description: null,
      category: 'furniture' as const,
      status: 'ordered' as const,
      vendor: null,
      room: null,
      quantity: 1,
      orderDate: null,
      expectedDeliveryDate: null,
      actualDeliveryDate: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      url: null,
      tagIds: [],
      budgetLineCount: 0,
      totalPlannedAmount: 0,
      budgetSummary: {
        totalPlanned: 0,
        totalActual: 0,
        subsidyReduction: 0,
        netCost: 0,
      },
      createdBy: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
  ];

  const emptyListResponse = {
    items: [],
    pagination: { page: 1, pageSize: 15, totalItems: 0, totalPages: 0 },
  };

  beforeEach(async () => {
    mockListHouseholdItems.mockReset();
    mockListHouseholdItems.mockResolvedValue({
      items: sampleItems,
      pagination: { page: 1, pageSize: 15, totalItems: 2, totalPages: 1 },
    });

    if (!HouseholdItemPickerModule) {
      HouseholdItemPickerModule = await import('./HouseholdItemPicker.js');
    }
  });

  function renderPicker(
    props: Partial<React.ComponentProps<typeof HouseholdItemPickerModule.HouseholdItemPicker>> = {},
  ) {
    const { HouseholdItemPicker } = HouseholdItemPickerModule;
    return render(<HouseholdItemPicker value="" onChange={jest.fn()} excludeIds={[]} {...props} />);
  }

  describe('default rendering', () => {
    it('renders search input with default placeholder', () => {
      renderPicker();
      expect(screen.getByPlaceholderText('Search household items...')).toBeInTheDocument();
    });

    it('does not open dropdown on focus without showItemsOnFocus', async () => {
      mockListHouseholdItems.mockResolvedValue(emptyListResponse);
      const user = userEvent.setup();
      renderPicker();

      const input = screen.getByPlaceholderText('Search household items...');
      await user.click(input);

      // Without showItemsOnFocus, focusing does NOT open the dropdown
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      // API should not be called on mere focus
      expect(mockListHouseholdItems).not.toHaveBeenCalled();
    });

    it('fetches and shows items after typing', async () => {
      const user = userEvent.setup();
      renderPicker();

      const input = screen.getByPlaceholderText('Search household items...');
      await user.type(input, 'Sofa');

      await waitFor(() => {
        expect(screen.getByText('Sofa')).toBeInTheDocument();
      });

      expect(mockListHouseholdItems).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'Sofa', pageSize: 15 }),
      );
    });

    it("shows 'No matching household items found' when empty results returned", async () => {
      mockListHouseholdItems.mockResolvedValue(emptyListResponse);
      const user = userEvent.setup();
      renderPicker();

      const input = screen.getByPlaceholderText('Search household items...');
      await user.type(input, 'XYZ');

      await waitFor(() => {
        expect(screen.getByText('No matching household items found')).toBeInTheDocument();
      });
    });

    it("shows 'Type to search household items' hint when focused with empty search", async () => {
      const user = userEvent.setup();
      // Open dropdown by typing then clearing
      renderPicker({ showItemsOnFocus: false });

      const input = screen.getByPlaceholderText('Search household items...');
      await user.type(input, 'S');

      // Now clear the text so searchTerm is empty but dropdown stays open
      await user.clear(input);

      await waitFor(() => {
        expect(screen.getByText('Type to search household items')).toBeInTheDocument();
      });
    });
  });

  describe('showItemsOnFocus prop', () => {
    it('fetches and shows items immediately on focus', async () => {
      const user = userEvent.setup();
      renderPicker({ showItemsOnFocus: true });

      const input = screen.getByPlaceholderText('Search household items...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Sofa')).toBeInTheDocument();
        expect(screen.getByText('Dining Table')).toBeInTheDocument();
      });

      expect(mockListHouseholdItems).toHaveBeenCalledWith(
        expect.objectContaining({ pageSize: 15 }),
      );
    });

    it('shows loading state while fetching on focus', async () => {
      // Delay the API response so we can see the loading state
      let resolveListItems: (
        value: Awaited<ReturnType<typeof HouseholdItemsApiTypes.listHouseholdItems>>,
      ) => void;
      mockListHouseholdItems.mockReturnValue(
        new Promise((res) => {
          resolveListItems = res;
        }),
      );

      const user = userEvent.setup();
      renderPicker({ showItemsOnFocus: true });

      const input = screen.getByPlaceholderText('Search household items...');
      await user.click(input);

      expect(screen.getByText('Searching...')).toBeInTheDocument();

      // Resolve and verify results appear
      resolveListItems!({
        items: sampleItems,
        pagination: { page: 1, pageSize: 15, totalItems: 2, totalPages: 1 },
      });

      await waitFor(() => {
        expect(screen.queryByText('Searching...')).not.toBeInTheDocument();
        expect(screen.getByText('Sofa')).toBeInTheDocument();
      });
    });
  });

  describe('item selection', () => {
    it('calls onChange with item id when selecting a result', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn<(id: string) => void>();
      renderPicker({ onChange: onChange as ReturnType<typeof jest.fn> });

      const input = screen.getByPlaceholderText('Search household items...');
      await user.type(input, 'Sofa');

      await waitFor(() => expect(screen.getByText('Sofa')).toBeInTheDocument());

      await user.click(screen.getByText('Sofa'));

      expect(onChange).toHaveBeenCalledWith('hi-1');
    });

    it('shows selected-display with item name after selection', async () => {
      const user = userEvent.setup();
      renderPicker({ showItemsOnFocus: true });

      const input = screen.getByPlaceholderText('Search household items...');
      await user.click(input);

      await waitFor(() => expect(screen.getByText('Sofa')).toBeInTheDocument());

      await user.click(screen.getByText('Sofa'));

      // After selection: search input hidden, item name shown
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Search household items...')).not.toBeInTheDocument();
        expect(screen.getByText('Sofa')).toBeInTheDocument();
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

      const input = screen.getByPlaceholderText('Search household items...');
      await user.click(input);

      await waitFor(() => expect(screen.getByText('Sofa')).toBeInTheDocument());

      // Select an item
      await user.click(screen.getByText('Sofa'));

      // Should now show the selected display (no search input)
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Search household items...')).not.toBeInTheDocument();
      });

      // Click clear
      const clearButton = screen.getByRole('button', { name: /clear selection/i });
      await user.click(clearButton);

      expect(onChange).toHaveBeenLastCalledWith('');
      // Input should be visible again
      expect(screen.getByPlaceholderText('Search household items...')).toBeInTheDocument();
    });
  });

  describe('initialTitle prop', () => {
    it('shows the initialTitle text when value and initialTitle are provided', async () => {
      renderPicker({ value: 'hi-existing', initialTitle: 'Living Room Sofa' });
      // Should render in selected-display mode showing the initialTitle
      await waitFor(() => {
        expect(screen.getByText('Living Room Sofa')).toBeInTheDocument();
      });
    });

    it('switches to search input when clear button is clicked from initialTitle state', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn<(id: string) => void>();
      renderPicker({
        value: 'hi-existing',
        initialTitle: 'Living Room Sofa',
        onChange: onChange as ReturnType<typeof jest.fn>,
      });

      await waitFor(() => expect(screen.getByText('Living Room Sofa')).toBeInTheDocument());

      const clearBtn = screen.getByRole('button', { name: /clear selection/i });
      await user.click(clearBtn);

      // After clearing, should show the search input again
      expect(screen.getByPlaceholderText('Search household items...')).toBeInTheDocument();
      expect(screen.queryByText('Living Room Sofa')).not.toBeInTheDocument();
      expect(onChange).toHaveBeenCalledWith('');
    });

    it('does NOT show initialTitle when value is empty string', () => {
      renderPicker({ value: '', initialTitle: 'Living Room Sofa' });
      // Empty value: picker is in search mode, not selected-display mode
      expect(screen.queryByText('Living Room Sofa')).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search household items...')).toBeInTheDocument();
    });
  });

  describe('excludeIds filtering', () => {
    it('filters out excluded IDs from results', async () => {
      const user = userEvent.setup();
      renderPicker({ showItemsOnFocus: true, excludeIds: ['hi-1'] });

      const input = screen.getByPlaceholderText('Search household items...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Dining Table')).toBeInTheDocument();
        expect(screen.queryByText('Sofa')).not.toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('shows error message when API call fails', async () => {
      mockListHouseholdItems.mockRejectedValue(new Error('Network error'));
      const user = userEvent.setup();
      renderPicker({ showItemsOnFocus: true });

      const input = screen.getByPlaceholderText('Search household items...');
      await user.click(input);

      await waitFor(() => {
        expect(screen.getByText('Failed to load household items')).toBeInTheDocument();
      });
    });
  });

  describe('external value reset', () => {
    it('resets to search input when value is externally set to empty string', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn<(id: string) => void>();
      const { HouseholdItemPicker } = HouseholdItemPickerModule;

      const { rerender } = render(
        <HouseholdItemPicker
          value=""
          onChange={onChange as ReturnType<typeof jest.fn>}
          excludeIds={[]}
          showItemsOnFocus={true}
        />,
      );

      const input = screen.getByPlaceholderText('Search household items...');
      await user.click(input);
      await waitFor(() => expect(screen.getByText('Sofa')).toBeInTheDocument());

      // Select an item
      await user.click(screen.getByText('Sofa'));
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Search household items...')).not.toBeInTheDocument();
      });

      // Simulate parent updating value after onChange (like real form state)
      rerender(
        <HouseholdItemPicker
          value="hi-1"
          onChange={onChange as ReturnType<typeof jest.fn>}
          excludeIds={[]}
          showItemsOnFocus={true}
        />,
      );

      // Parent resets value to empty (e.g. form submission)
      rerender(
        <HouseholdItemPicker
          value=""
          onChange={onChange as ReturnType<typeof jest.fn>}
          excludeIds={[]}
          showItemsOnFocus={true}
        />,
      );

      // Should show search input again
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search household items...')).toBeInTheDocument();
      });
    });
  });
});
