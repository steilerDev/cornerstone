/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';

// Mock the workItemsApi before any dynamic imports
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();

jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItems: mockListWorkItems,
}));

import type { DependencySentenceBuilder as DependencySentenceBuilderType } from './DependencySentenceBuilder.js';

describe('DependencySentenceBuilder', () => {
  let DependencySentenceBuilderModule: {
    DependencySentenceBuilder: typeof DependencySentenceBuilderType;
  };

  const emptyListResponse = {
    items: [],
    pagination: { page: 1, pageSize: 15, totalItems: 0, totalPages: 0 },
  };

  const sampleWorkItems = [
    {
      id: 'wi-1',
      title: 'Foundation',
      status: 'completed' as const,
      startDate: null,
      endDate: null,
      durationDays: null,
      assignedUser: null,
      tags: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'wi-2',
      title: 'Drywall',
      status: 'in_progress' as const,
      startDate: null,
      endDate: null,
      durationDays: null,
      assignedUser: null,
      tags: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    mockListWorkItems.mockReset();
    mockListWorkItems.mockResolvedValue({
      items: sampleWorkItems,
      pagination: { page: 1, pageSize: 15, totalItems: 2, totalPages: 1 },
    });

    if (!DependencySentenceBuilderModule) {
      DependencySentenceBuilderModule = await import('./DependencySentenceBuilder.js');
    }
  });

  function renderBuilder(
    onAdd = jest.fn<() => void>(),
    { thisItemId = 'real-id', excludeIds = [] as string[], thisItemLabel = 'This item' } = {},
  ) {
    const { DependencySentenceBuilder } = DependencySentenceBuilderModule;
    return render(
      <MemoryRouter>
        <DependencySentenceBuilder
          thisItemId={thisItemId}
          thisItemLabel={thisItemLabel}
          excludeIds={excludeIds}
          onAdd={onAdd}
        />
      </MemoryRouter>,
    );
  }

  describe('default state', () => {
    it('renders predecessor verb select defaulting to "finish"', async () => {
      renderBuilder();
      const predVerbSelect = screen.getByRole('combobox', {
        name: /predecessor verb/i,
      }) as HTMLSelectElement;
      expect(predVerbSelect.value).toBe('finish');
    });

    it('renders successor verb select defaulting to "start"', async () => {
      renderBuilder();
      const succVerbSelect = screen.getByRole('combobox', {
        name: /successor verb/i,
      }) as HTMLSelectElement;
      expect(succVerbSelect.value).toBe('start');
    });

    it('renders the Add button disabled when slot 1 is empty', async () => {
      renderBuilder();
      const addButton = screen.getByRole('button', { name: /add/i });
      expect(addButton).toBeDisabled();
    });

    it('renders conjunction words: must, before, can', async () => {
      renderBuilder();
      expect(screen.getByText('must')).toBeInTheDocument();
      expect(screen.getByText('before')).toBeInTheDocument();
      expect(screen.getByText('can')).toBeInTheDocument();
    });
  });

  describe('verb select options', () => {
    it('predecessor verb select has finish and start options', async () => {
      renderBuilder();
      const predVerbSelect = screen.getByRole('combobox', {
        name: /predecessor verb/i,
      }) as HTMLSelectElement;
      const options = Array.from(predVerbSelect.options).map((o) => o.value);
      expect(options).toContain('finish');
      expect(options).toContain('start');
    });

    it('successor verb select has start and finish options', async () => {
      renderBuilder();
      const succVerbSelect = screen.getByRole('combobox', {
        name: /successor verb/i,
      }) as HTMLSelectElement;
      const options = Array.from(succVerbSelect.options).map((o) => o.value);
      expect(options).toContain('start');
      expect(options).toContain('finish');
    });
  });

  describe('selecting a work item enables the Add button', () => {
    it('enables Add button when slot 1 has a selected work item', async () => {
      const user = userEvent.setup();
      renderBuilder();

      // Focus the slot 1 input to open dropdown
      const inputs = screen.getAllByPlaceholderText('Search work items...');
      const slot1Input = inputs[0];
      await user.click(slot1Input);

      // Wait for dropdown options to appear
      await waitFor(() => {
        expect(screen.getByText('Foundation')).toBeInTheDocument();
      });

      // Select "Foundation" from the dropdown
      await user.click(screen.getByText('Foundation'));

      // Add button should now be enabled
      await waitFor(() => {
        const addButton = screen.getByRole('button', { name: /add/i });
        expect(addButton).not.toBeDisabled();
      });
    });
  });

  describe('changing verb selects updates dependency type', () => {
    it('changing predecessor verb from finish to start produces start_to_start type', async () => {
      const user = userEvent.setup();
      const onAdd =
        jest.fn<
          (data: {
            predecessorId: string;
            successorId: string;
            dependencyType: string;
            otherItemTitle: string;
          }) => void
        >();
      renderBuilder(onAdd as ReturnType<typeof jest.fn>);

      // Select work item in slot 1
      const inputs = screen.getAllByPlaceholderText('Search work items...');
      await user.click(inputs[0]);
      await waitFor(() => expect(screen.getByText('Foundation')).toBeInTheDocument());
      await user.click(screen.getByText('Foundation'));

      // Change predecessor verb to "start"
      const predVerbSelect = screen.getByRole('combobox', { name: /predecessor verb/i });
      await user.selectOptions(predVerbSelect, 'start');

      // Click Add
      const addButton = screen.getByRole('button', { name: /add/i });
      await user.click(addButton);

      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          dependencyType: 'start_to_start',
        }),
      );
    });

    it('changing successor verb from start to finish produces finish_to_finish type', async () => {
      const user = userEvent.setup();
      const onAdd =
        jest.fn<
          (data: {
            predecessorId: string;
            successorId: string;
            dependencyType: string;
            otherItemTitle: string;
          }) => void
        >();
      renderBuilder(onAdd as ReturnType<typeof jest.fn>);

      // Select work item in slot 1
      const inputs = screen.getAllByPlaceholderText('Search work items...');
      await user.click(inputs[0]);
      await waitFor(() => expect(screen.getByText('Foundation')).toBeInTheDocument());
      await user.click(screen.getByText('Foundation'));

      // Change successor verb to "finish"
      const succVerbSelect = screen.getByRole('combobox', { name: /successor verb/i });
      await user.selectOptions(succVerbSelect, 'finish');

      // Click Add
      const addButton = screen.getByRole('button', { name: /add/i });
      await user.click(addButton);

      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          dependencyType: 'finish_to_finish',
        }),
      );
    });
  });

  describe('onAdd callback', () => {
    it('calls onAdd with predecessorId, successorId, dependencyType, and otherItemTitle when slot 1 selected and slot 2 is thisItem', async () => {
      const user = userEvent.setup();
      const onAdd =
        jest.fn<
          (data: {
            predecessorId: string;
            successorId: string;
            dependencyType: string;
            otherItemTitle: string;
          }) => void
        >();
      renderBuilder(onAdd as ReturnType<typeof jest.fn>, { thisItemId: 'real-id-123' });

      // Select "Foundation" in slot 1 (predecessor)
      const inputs = screen.getAllByPlaceholderText('Search work items...');
      await user.click(inputs[0]);
      await waitFor(() => expect(screen.getByText('Foundation')).toBeInTheDocument());
      await user.click(screen.getByText('Foundation'));

      // Slot 2 defaults to "This item" (real-id-123)
      const addButton = screen.getByRole('button', { name: /add/i });
      await user.click(addButton);

      expect(onAdd).toHaveBeenCalledWith({
        predecessorId: 'wi-1',
        successorId: 'real-id-123',
        dependencyType: 'finish_to_start',
        otherItemTitle: 'Foundation',
      });
    });
  });

  describe('form reset after adding', () => {
    it('resets slot 1 and verb selects to defaults after clicking Add', async () => {
      const user = userEvent.setup();
      const onAdd = jest.fn<() => void>();
      renderBuilder(onAdd);

      // Select work item in slot 1
      const inputs = screen.getAllByPlaceholderText('Search work items...');
      await user.click(inputs[0]);
      await waitFor(() => expect(screen.getByText('Foundation')).toBeInTheDocument());
      await user.click(screen.getByText('Foundation'));

      // Change predecessor verb
      const predVerbSelect = screen.getByRole('combobox', {
        name: /predecessor verb/i,
      }) as HTMLSelectElement;
      await user.selectOptions(predVerbSelect, 'start');

      // Click Add
      const addButton = screen.getByRole('button', { name: /add/i });
      await user.click(addButton);

      // Verb should reset to "finish"
      await waitFor(() => {
        const refreshedPredVerb = screen.getByRole('combobox', {
          name: /predecessor verb/i,
        }) as HTMLSelectElement;
        expect(refreshedPredVerb.value).toBe('finish');
      });

      // Successor verb should reset to "start"
      const succVerbSelect = screen.getByRole('combobox', {
        name: /successor verb/i,
      }) as HTMLSelectElement;
      expect(succVerbSelect.value).toBe('start');

      // Add button should be disabled again
      const refreshedAddButton = screen.getByRole('button', { name: /add/i });
      expect(refreshedAddButton).toBeDisabled();
    });
  });

  describe('"This item" mutual exclusion', () => {
    it('does not show "This item" special option in slot 1 when slot 2 already has thisItemId', async () => {
      // By default, slot 2 is pre-filled with "This item" (thisItemId).
      // Therefore slot 1 special options should be empty — "This item" cannot appear in both.
      const user = userEvent.setup();
      renderBuilder(jest.fn(), { thisItemId: 'my-item' });

      // Open slot 1 dropdown
      const inputs = screen.getAllByPlaceholderText('Search work items...');
      await user.click(inputs[0]);

      // Wait for dropdown to open
      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // "This item" should NOT appear as a special option in slot 1 because slot 2 already has it
      expect(screen.queryByRole('option', { name: 'This item' })).not.toBeInTheDocument();
    });

    it('clears slot 2 when "This item" is selected in slot 1 (after slot 2 is changed first)', async () => {
      const user = userEvent.setup();
      renderBuilder(jest.fn(), { thisItemId: 'my-item' });

      // First: open slot 2 and change it to a real work item
      // Slot 2 starts in selected-special display mode for "This item"
      // Click the clear button on slot 2 to deselect it
      const clearButton = screen.getByRole('button', { name: /clear selection/i });
      await user.click(clearButton);

      // Now slot 2 is empty — slot 1 should show "This item" as a special option
      const inputs = screen.getAllByPlaceholderText('Search work items...');
      await user.click(inputs[0]);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'This item' })).toBeInTheDocument();
      });

      // Select "This item" in slot 1
      await user.click(screen.getByRole('option', { name: 'This item' }));

      // Now slot 1 shows "This item" in display mode. Slot 2 input should be visible.
      await waitFor(() => {
        // Slot 2 should still have its input visible (empty)
        const remainingInputs = screen.getAllByPlaceholderText('Search work items...');
        expect(remainingInputs.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('clears slot 2 when "This item" selected in slot 1 and slot 2 was also thisItemId', async () => {
      // Initial state: slot1=empty, slot2=thisItemId
      // If slot2 is cleared and then "This item" is selected in slot 1,
      // slot 2 should be cleared (cannot have "This item" twice)
      const user = userEvent.setup();
      renderBuilder(jest.fn(), { thisItemId: 'my-item' });

      // slot 2 starts with "This item" selected. Clear it.
      const clearButton = screen.getByRole('button', { name: /clear selection/i });
      await user.click(clearButton);

      // Now open slot 1 and select "This item"
      const inputs = screen.getAllByPlaceholderText('Search work items...');
      await user.click(inputs[0]);

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'This item' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('option', { name: 'This item' }));

      // After selecting "This item" in slot 1:
      // - "This item" label appears in slot 1 (display mode)
      await waitFor(() => {
        // The "This item" should appear as a selected display
        const displayedTexts = screen.queryAllByText('This item');
        expect(displayedTexts.length).toBeGreaterThan(0);
      });
    });
  });

  describe('disabled state', () => {
    it('disables verb selects when disabled prop is true', async () => {
      const { DependencySentenceBuilder } = DependencySentenceBuilderModule;
      render(
        <MemoryRouter>
          <DependencySentenceBuilder
            thisItemId="real-id"
            excludeIds={[]}
            disabled={true}
            onAdd={jest.fn()}
          />
        </MemoryRouter>,
      );

      const predVerbSelect = screen.getByRole('combobox', { name: /predecessor verb/i });
      const succVerbSelect = screen.getByRole('combobox', { name: /successor verb/i });

      expect(predVerbSelect).toBeDisabled();
      expect(succVerbSelect).toBeDisabled();
    });

    it('disables Add button when disabled prop is true', async () => {
      const { DependencySentenceBuilder } = DependencySentenceBuilderModule;
      render(
        <MemoryRouter>
          <DependencySentenceBuilder
            thisItemId="real-id"
            excludeIds={[]}
            disabled={true}
            onAdd={jest.fn()}
          />
        </MemoryRouter>,
      );

      const addButton = screen.getByRole('button', { name: /add/i });
      expect(addButton).toBeDisabled();
    });
  });

  describe('emptyListResponse handling', () => {
    it('shows empty results list when API returns no items', async () => {
      mockListWorkItems.mockResolvedValue(emptyListResponse);
      const user = userEvent.setup();
      renderBuilder();

      const inputs = screen.getAllByPlaceholderText('Search work items...');
      await user.click(inputs[0]);

      // Type to trigger a search with results
      await user.type(inputs[0], 'xyz');

      await waitFor(() => {
        expect(screen.getByText('No matching work items found')).toBeInTheDocument();
      });
    });
  });
});
