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

  // ── 1. Default placeholder ────────────────────────────────────────────────

  it('renders with default placeholder "Search work items..."', () => {
    renderPicker();
    expect(screen.getByPlaceholderText('Search work items...')).toBeInTheDocument();
  });

  // ── 2. onSelectItem adapter ───────────────────────────────────────────────

  it('onSelectItem receives { id, title } (not { id, label }) — adapter works', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn<(id: string) => void>();
    const onSelectItem = jest.fn<(item: { id: string; title: string }) => void>();

    renderPicker({
      showItemsOnFocus: true,
      onChange: onChange as ReturnType<typeof jest.fn>,
      onSelectItem: onSelectItem as ReturnType<typeof jest.fn>,
    });

    const input = screen.getByPlaceholderText('Search work items...');
    await user.click(input);

    await waitFor(() => expect(screen.getByText('Foundation')).toBeInTheDocument());
    await user.click(screen.getByText('Foundation'));

    // Adapter must map { id, label } → { id, title }
    expect(onSelectItem).toHaveBeenCalledWith({ id: 'wi-1', title: 'Foundation' });
    expect(onSelectItem).not.toHaveBeenCalledWith(expect.objectContaining({ label: 'Foundation' }));
  });

  // ── 3. specialOptions pass-through ───────────────────────────────────────

  it('specialOptions pass-through works: special option shown in dropdown', async () => {
    const user = userEvent.setup();
    const specialOptions = [{ id: '__THIS_ITEM__', label: 'This item' }];
    renderPicker({ specialOptions });

    const input = screen.getByPlaceholderText('Search work items...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'This item' })).toBeInTheDocument();
    });
  });

  it('selecting special option calls onSelectItem with { id, title } (adapter applies)', async () => {
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

  // ── 4. showItemsOnFocus loads items ──────────────────────────────────────

  it('showItemsOnFocus loads items immediately on focus', async () => {
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

  // ── 5. excludeIds filtering ───────────────────────────────────────────────

  it('excludeIds filtering works: excluded items not shown in results', async () => {
    const user = userEvent.setup();
    renderPicker({ showItemsOnFocus: true, excludeIds: ['wi-1'] });

    const input = screen.getByPlaceholderText('Search work items...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByText('Framing')).toBeInTheDocument();
      expect(screen.queryByText('Foundation')).not.toBeInTheDocument();
    });
  });

  // ── 6. initialTitle displayed correctly ──────────────────────────────────

  it('initialTitle displayed correctly when value and initialTitle are provided', async () => {
    renderPicker({ value: 'wi-existing', initialTitle: 'Foundation Work' });

    await waitFor(() => {
      expect(screen.getByText('Foundation Work')).toBeInTheDocument();
    });
    expect(screen.queryByPlaceholderText('Search work items...')).not.toBeInTheDocument();
  });

  it('clicking clear from initialTitle state restores search input and calls onChange("")', async () => {
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

    expect(screen.getByPlaceholderText('Search work items...')).toBeInTheDocument();
    expect(screen.queryByText('Foundation Work')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith('');
  });

  // ── 7. Error message string ───────────────────────────────────────────────

  it('error message reads "Failed to load work items"', async () => {
    mockListWorkItems.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    renderPicker({ showItemsOnFocus: true });

    const input = screen.getByPlaceholderText('Search work items...');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByText('Failed to load work items')).toBeInTheDocument();
    });
  });

  // ── 8. No-results message string ─────────────────────────────────────────

  it('no-results message reads "No matching work items found"', async () => {
    mockListWorkItems.mockResolvedValue(emptyListResponse);
    const user = userEvent.setup();
    renderPicker();

    const input = screen.getByPlaceholderText('Search work items...');
    await user.type(input, 'XYZ');

    await waitFor(() => {
      expect(screen.getByText('No matching work items found')).toBeInTheDocument();
    });
  });

  // ── 9. Backward-compatibility: no-op focus without showItemsOnFocus ───────

  it('does not open dropdown on focus without showItemsOnFocus or specialOptions', async () => {
    mockListWorkItems.mockResolvedValue(emptyListResponse);
    const user = userEvent.setup();
    renderPicker();

    const input = screen.getByPlaceholderText('Search work items...');
    await user.click(input);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(mockListWorkItems).not.toHaveBeenCalled();
  });

  // ── 10. Clear selected item ───────────────────────────────────────────────

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
    await user.click(screen.getByText('Foundation'));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search work items...')).not.toBeInTheDocument();
    });

    const clearButton = screen.getByRole('button', { name: /clear selection/i });
    await user.click(clearButton);

    expect(onChange).toHaveBeenLastCalledWith('');
    expect(screen.getByPlaceholderText('Search work items...')).toBeInTheDocument();
  });

  // ── 11. Selected special option display ──────────────────────────────────

  it('shows selected special option in display mode after value set to special id', () => {
    const specialOptions = [{ id: '__THIS_ITEM__', label: 'This item' }];
    const onChange = jest.fn<(id: string) => void>();

    const { rerender } = render(
      <WorkItemPickerModule.WorkItemPicker
        value=""
        onChange={onChange as ReturnType<typeof jest.fn>}
        excludeIds={[]}
        specialOptions={specialOptions}
      />,
    );

    rerender(
      <WorkItemPickerModule.WorkItemPicker
        value="__THIS_ITEM__"
        onChange={onChange as ReturnType<typeof jest.fn>}
        excludeIds={[]}
        specialOptions={specialOptions}
      />,
    );

    expect(screen.getByText('This item')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search work items...')).not.toBeInTheDocument();
  });
});
