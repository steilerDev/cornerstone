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
      status: 'planned' as const,
      vendor: null,
      area: null,
      quantity: 1,
      orderDate: null,
      targetDeliveryDate: null,
      actualDeliveryDate: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      isLate: false,
      url: null,
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
      status: 'purchased' as const,
      vendor: null,
      area: null,
      quantity: 1,
      orderDate: null,
      targetDeliveryDate: null,
      actualDeliveryDate: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      isLate: false,
      url: null,
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

  // ── 1. Default placeholder ────────────────────────────────────────────────

  it('renders with default placeholder "Search household items..."', () => {
    renderPicker();
    expect(screen.getByPlaceholderText('Search household items...')).toBeInTheDocument();
  });

  // ── 2. onSelectItem adapter ───────────────────────────────────────────────

  it('onSelectItem receives { id, name } (not { id, label }) — adapter works', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn<(id: string) => void>();
    const onSelectItem = jest.fn<(item: { id: string; name: string }) => void>();

    renderPicker({
      showItemsOnFocus: true,
      onChange: onChange as ReturnType<typeof jest.fn>,
      onSelectItem: onSelectItem as ReturnType<typeof jest.fn>,
    });

    const input = screen.getByPlaceholderText('Search household items...');
    await user.click(input);

    await waitFor(() => expect(screen.getByText('Sofa')).toBeInTheDocument());
    await user.click(screen.getByText('Sofa'));

    // Adapter must map { id, label } → { id, name }
    expect(onSelectItem).toHaveBeenCalledWith({ id: 'hi-1', name: 'Sofa' });
    expect(onSelectItem).not.toHaveBeenCalledWith(expect.objectContaining({ label: 'Sofa' }));
  });

  // ── 3. showItemsOnFocus loads items ──────────────────────────────────────

  it('showItemsOnFocus loads items immediately on focus', async () => {
    const user = userEvent.setup();
    renderPicker({ showItemsOnFocus: true });

    const input = screen.getByPlaceholderText('Search household items...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByText('Sofa')).toBeInTheDocument();
      expect(screen.getByText('Dining Table')).toBeInTheDocument();
    });

    expect(mockListHouseholdItems).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 15 }));
  });

  // ── 4. excludeIds filtering ───────────────────────────────────────────────

  it('excludeIds filtering works: excluded items not shown in results', async () => {
    const user = userEvent.setup();
    renderPicker({ showItemsOnFocus: true, excludeIds: ['hi-1'] });

    const input = screen.getByPlaceholderText('Search household items...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByText('Dining Table')).toBeInTheDocument();
      expect(screen.queryByText('Sofa')).not.toBeInTheDocument();
    });
  });

  // ── 5. initialTitle displayed correctly ──────────────────────────────────

  it('initialTitle displayed correctly when value and initialTitle are provided', async () => {
    renderPicker({ value: 'hi-existing', initialTitle: 'Living Room Sofa' });

    await waitFor(() => {
      expect(screen.getByText('Living Room Sofa')).toBeInTheDocument();
    });
    expect(screen.queryByPlaceholderText('Search household items...')).not.toBeInTheDocument();
  });

  it('clicking clear from initialTitle state restores search input and calls onChange("")', async () => {
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

    expect(screen.getByPlaceholderText('Search household items...')).toBeInTheDocument();
    expect(screen.queryByText('Living Room Sofa')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('initialTitle not shown when value is empty string', () => {
    renderPicker({ value: '', initialTitle: 'Living Room Sofa' });
    expect(screen.queryByText('Living Room Sofa')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search household items...')).toBeInTheDocument();
  });

  // ── 6. Error message string ───────────────────────────────────────────────

  it('error message reads "Failed to load household items"', async () => {
    mockListHouseholdItems.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    renderPicker({ showItemsOnFocus: true });

    const input = screen.getByPlaceholderText('Search household items...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByText('Failed to load household items')).toBeInTheDocument();
    });
  });

  // ── 7. No-results message string ─────────────────────────────────────────

  it('no-results message reads "No matching household items found"', async () => {
    mockListHouseholdItems.mockResolvedValue(emptyListResponse);
    const user = userEvent.setup();
    renderPicker();

    const input = screen.getByPlaceholderText('Search household items...');
    await user.type(input, 'XYZ');

    await waitFor(() => {
      expect(screen.getByText('No matching household items found')).toBeInTheDocument();
    });
  });

  // ── 8. Backward-compatibility: no-op focus without showItemsOnFocus ───────

  it('does not open dropdown on focus without showItemsOnFocus', async () => {
    mockListHouseholdItems.mockResolvedValue(emptyListResponse);
    const user = userEvent.setup();
    renderPicker();

    const input = screen.getByPlaceholderText('Search household items...');
    await user.click(input);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(mockListHouseholdItems).not.toHaveBeenCalled();
  });

  // ── 9. Clear selected item ────────────────────────────────────────────────

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
    await user.click(screen.getByText('Sofa'));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search household items...')).not.toBeInTheDocument();
    });

    const clearButton = screen.getByRole('button', { name: /clear selection/i });
    await user.click(clearButton);

    expect(onChange).toHaveBeenLastCalledWith('');
    expect(screen.getByPlaceholderText('Search household items...')).toBeInTheDocument();
  });

  // ── 10. External value reset ──────────────────────────────────────────────

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
    await user.click(screen.getByText('Sofa'));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search household items...')).not.toBeInTheDocument();
    });

    // Simulate parent updating value after onChange
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

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search household items...')).toBeInTheDocument();
    });
  });

  // ── 11. Selected item display after selection ─────────────────────────────

  it('shows selected-display with item name after selection', async () => {
    const user = userEvent.setup();
    renderPicker({ showItemsOnFocus: true });

    const input = screen.getByPlaceholderText('Search household items...');
    await user.click(input);

    await waitFor(() => expect(screen.getByText('Sofa')).toBeInTheDocument());
    await user.click(screen.getByText('Sofa'));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search household items...')).not.toBeInTheDocument();
      expect(screen.getByText('Sofa')).toBeInTheDocument();
    });
  });

  // ── 12. Search results show item names ───────────────────────────────────

  it('shows item names in search results after typing', async () => {
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
});
