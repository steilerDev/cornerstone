/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type * as TagsApiTypes from '../../lib/tagsApi.js';
import type * as BudgetCategoriesApiTypes from '../../lib/budgetCategoriesApi.js';
import type * as HICApiTypes from '../../lib/householdItemCategoriesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type { TagResponse, BudgetCategory, HouseholdItemCategoryEntity } from '@cornerstone/shared';

// ─── Mock API modules BEFORE importing components ─────────────────────────────

const mockFetchTags = jest.fn<typeof TagsApiTypes.fetchTags>();
const mockCreateTag = jest.fn<typeof TagsApiTypes.createTag>();
const mockUpdateTag = jest.fn<typeof TagsApiTypes.updateTag>();
const mockDeleteTag = jest.fn<typeof TagsApiTypes.deleteTag>();

jest.unstable_mockModule('../../lib/tagsApi.js', () => ({
  fetchTags: mockFetchTags,
  createTag: mockCreateTag,
  updateTag: mockUpdateTag,
  deleteTag: mockDeleteTag,
}));

const mockFetchBudgetCategories = jest.fn<typeof BudgetCategoriesApiTypes.fetchBudgetCategories>();
const mockCreateBudgetCategory = jest.fn<typeof BudgetCategoriesApiTypes.createBudgetCategory>();
const mockUpdateBudgetCategory = jest.fn<typeof BudgetCategoriesApiTypes.updateBudgetCategory>();
const mockDeleteBudgetCategory = jest.fn<typeof BudgetCategoriesApiTypes.deleteBudgetCategory>();

jest.unstable_mockModule('../../lib/budgetCategoriesApi.js', () => ({
  fetchBudgetCategories: mockFetchBudgetCategories,
  createBudgetCategory: mockCreateBudgetCategory,
  updateBudgetCategory: mockUpdateBudgetCategory,
  deleteBudgetCategory: mockDeleteBudgetCategory,
}));

const mockFetchHICCategories = jest.fn<typeof HICApiTypes.fetchHouseholdItemCategories>();
const mockCreateHICCategory = jest.fn<typeof HICApiTypes.createHouseholdItemCategory>();
const mockUpdateHICCategory = jest.fn<typeof HICApiTypes.updateHouseholdItemCategory>();
const mockDeleteHICCategory = jest.fn<typeof HICApiTypes.deleteHouseholdItemCategory>();

jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchHICCategories,
  createHouseholdItemCategory: mockCreateHICCategory,
  updateHouseholdItemCategory: mockUpdateHICCategory,
  deleteHouseholdItemCategory: mockDeleteHICCategory,
}));

// Mock SettingsSubNav to avoid AuthContext dependency
jest.unstable_mockModule('../../components/SettingsSubNav/SettingsSubNav.js', () => ({
  SettingsSubNav: () => null,
}));

// ─── Sample test data ──────────────────────────────────────────────────────────

const sampleTag1: TagResponse = {
  id: 'tag-1',
  name: 'Electrical',
  color: '#F59E0B',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const sampleTag2: TagResponse = {
  id: 'tag-2',
  name: 'Plumbing',
  color: '#3B82F6',
  createdAt: '2026-01-02T00:00:00.000Z',
};

const sampleBudgetCat1: BudgetCategory = {
  id: 'bc-1',
  name: 'Materials',
  description: 'Building materials',
  color: '#FF5733',
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sampleBudgetCat2: BudgetCategory = {
  id: 'bc-2',
  name: 'Labor',
  description: null,
  color: '#3B82F6',
  sortOrder: 1,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const sampleHICat1: HouseholdItemCategoryEntity = {
  id: 'hic-1',
  name: 'Furniture',
  color: '#8B5CF6',
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sampleHICat2: HouseholdItemCategoryEntity = {
  id: 'hic-2',
  name: 'Appliances',
  color: '#3B82F6',
  sortOrder: 1,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

// ─── Test suite ────────────────────────────────────────────────────────────────

describe('ManagePage', () => {
  let ManagePage: React.ComponentType;

  function renderManagePage(initialPath = '/settings/manage') {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <ManagePage />
      </MemoryRouter>,
    );
  }

  beforeEach(async () => {
    if (!ManagePage) {
      const module = await import('./ManagePage.js');
      ManagePage = module.default;
    }

    // Reset all mocks
    mockFetchTags.mockReset();
    mockCreateTag.mockReset();
    mockUpdateTag.mockReset();
    mockDeleteTag.mockReset();
    mockFetchBudgetCategories.mockReset();
    mockCreateBudgetCategory.mockReset();
    mockUpdateBudgetCategory.mockReset();
    mockDeleteBudgetCategory.mockReset();
    mockFetchHICCategories.mockReset();
    mockCreateHICCategory.mockReset();
    mockUpdateHICCategory.mockReset();
    mockDeleteHICCategory.mockReset();

    // Default: tags tab loads tags
    mockFetchTags.mockResolvedValue({ tags: [sampleTag1, sampleTag2] });
    // Budget categories and HI categories default to empty (only fetched when tab is active)
    mockFetchBudgetCategories.mockResolvedValue({
      categories: [sampleBudgetCat1, sampleBudgetCat2],
    });
    mockFetchHICCategories.mockResolvedValue({ categories: [sampleHICat1, sampleHICat2] });
  });

  // ─── Tab rendering ─────────────────────────────────────────────────────────

  describe('Tab navigation', () => {
    it('renders the "Manage" page heading', async () => {
      renderManagePage();
      expect(screen.getByRole('heading', { name: 'Manage', level: 1 })).toBeInTheDocument();
    });

    it('renders all three tab buttons', async () => {
      renderManagePage();
      expect(screen.getByRole('tab', { name: 'Tags' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Budget Categories' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Household Item Categories' })).toBeInTheDocument();
    });

    it('Tags tab is active by default (no URL param)', async () => {
      renderManagePage('/settings/manage');
      const tagsTab = screen.getByRole('tab', { name: 'Tags' });
      expect(tagsTab).toHaveAttribute('aria-selected', 'true');
      const budgetTab = screen.getByRole('tab', { name: 'Budget Categories' });
      expect(budgetTab).toHaveAttribute('aria-selected', 'false');
      const hicTab = screen.getByRole('tab', { name: 'Household Item Categories' });
      expect(hicTab).toHaveAttribute('aria-selected', 'false');
    });

    it('Tags tab is active when ?tab=tags in URL', async () => {
      renderManagePage('/settings/manage?tab=tags');
      const tagsTab = screen.getByRole('tab', { name: 'Tags' });
      expect(tagsTab).toHaveAttribute('aria-selected', 'true');
    });

    it('Budget Categories tab is active when ?tab=budget-categories in URL', async () => {
      renderManagePage('/settings/manage?tab=budget-categories');
      const budgetTab = screen.getByRole('tab', { name: 'Budget Categories' });
      expect(budgetTab).toHaveAttribute('aria-selected', 'true');
      const tagsTab = screen.getByRole('tab', { name: 'Tags' });
      expect(tagsTab).toHaveAttribute('aria-selected', 'false');
    });

    it('Household Item Categories tab is active when ?tab=hi-categories in URL', async () => {
      renderManagePage('/settings/manage?tab=hi-categories');
      const hicTab = screen.getByRole('tab', { name: 'Household Item Categories' });
      expect(hicTab).toHaveAttribute('aria-selected', 'true');
      const tagsTab = screen.getByRole('tab', { name: 'Tags' });
      expect(tagsTab).toHaveAttribute('aria-selected', 'false');
    });

    it('clicking Budget Categories tab makes it active', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage');

      // Initially Tags tab is active
      expect(screen.getByRole('tab', { name: 'Tags' })).toHaveAttribute('aria-selected', 'true');

      // Click Budget Categories tab
      await user.click(screen.getByRole('tab', { name: 'Budget Categories' }));

      const budgetTab = screen.getByRole('tab', { name: 'Budget Categories' });
      expect(budgetTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Tags' })).toHaveAttribute('aria-selected', 'false');
    });

    it('clicking Household Item Categories tab makes it active', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage');

      await user.click(screen.getByRole('tab', { name: 'Household Item Categories' }));

      const hicTab = screen.getByRole('tab', { name: 'Household Item Categories' });
      expect(hicTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Tags' })).toHaveAttribute('aria-selected', 'false');
    });
  });

  // ─── Tags tab content ──────────────────────────────────────────────────────

  describe('Tags tab', () => {
    it('shows loading state while fetching tags', () => {
      // Don't resolve to keep it loading
      mockFetchTags.mockReturnValue(new Promise(() => {}));
      renderManagePage('/settings/manage');
      expect(screen.getByText('Loading tags...')).toBeInTheDocument();
    });

    it('shows tag list after loading', async () => {
      renderManagePage('/settings/manage');
      await waitFor(() => {
        expect(screen.getByText('Electrical')).toBeInTheDocument();
      });
      expect(screen.getByText('Plumbing')).toBeInTheDocument();
    });

    it('shows Create New Tag section', async () => {
      renderManagePage('/settings/manage');
      await waitFor(() => {
        expect(screen.getByText('Create New Tag')).toBeInTheDocument();
      });
    });

    it('shows error state when loading tags fails', async () => {
      mockFetchTags.mockRejectedValue(new Error('Network error'));
      renderManagePage('/settings/manage');
      await waitFor(() => {
        expect(screen.getByText('Failed to load tags. Please try again.')).toBeInTheDocument();
      });
    });

    it('shows tag name and count', async () => {
      renderManagePage('/settings/manage');
      await waitFor(() => {
        // Two tags loaded
        expect(screen.getByText(/Existing Tags \(2\)/)).toBeInTheDocument();
      });
    });

    it('delete confirmation modal appears on delete click', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage');

      await waitFor(() => {
        expect(screen.getByText('Electrical')).toBeInTheDocument();
      });

      // Click the Delete button for tag "Electrical"
      const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
      await user.click(deleteButtons[0]);

      // Modal should appear with the heading
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
      expect(screen.getByRole('heading', { name: 'Delete Tag' })).toBeInTheDocument();
    });

    it('successfully creates a new tag', async () => {
      const user = userEvent.setup();
      const newTag: TagResponse = {
        id: 'tag-3',
        name: 'HVAC',
        color: '#22C55E',
        createdAt: '2026-03-06T00:00:00.000Z',
      };
      mockCreateTag.mockResolvedValue(newTag);

      renderManagePage('/settings/manage');

      await waitFor(() => {
        expect(screen.getByText('Create New Tag')).toBeInTheDocument();
      });

      const nameInput = screen.getByRole('textbox', { name: 'Tag Name' });
      await user.type(nameInput, 'HVAC');

      await user.click(screen.getByRole('button', { name: 'Create Tag' }));

      await waitFor(() => {
        expect(mockCreateTag).toHaveBeenCalledWith(expect.objectContaining({ name: 'HVAC' }));
      });

      await waitFor(() => {
        expect(screen.getByText('Tag "HVAC" created successfully')).toBeInTheDocument();
      });
    });

    it('shows validation error when creating a tag with empty name', async () => {
      renderManagePage('/settings/manage');

      await waitFor(() => {
        expect(screen.getByText('Create New Tag')).toBeInTheDocument();
      });

      // Create Tag button is disabled when name is empty
      const createButton = screen.getByRole('button', { name: 'Create Tag' });
      expect(createButton).toBeDisabled();
    });

    it('shows edit form when Edit button is clicked for a tag', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage');

      await waitFor(() => {
        expect(screen.getByText('Electrical')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: 'Edit' });
      await user.click(editButtons[0]);

      // Edit form should appear with current values
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('cancels edit and returns to view mode', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage');

      await waitFor(() => {
        expect(screen.getByText('Electrical')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: 'Edit' });
      await user.click(editButtons[0]);

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      // Back to normal view — Edit buttons visible again
      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
      });
    });

    it('successfully updates a tag', async () => {
      const user = userEvent.setup();
      const updatedTag: TagResponse = {
        id: 'tag-1',
        name: 'Electrical Updated',
        color: '#F59E0B',
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      mockUpdateTag.mockResolvedValue(updatedTag);

      renderManagePage('/settings/manage');

      await waitFor(() => {
        expect(screen.getByText('Electrical')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: 'Edit' });
      await user.click(editButtons[0]);

      // Clear the current name and type a new one
      const nameInputs = screen.getAllByRole('textbox');
      // The inline edit input (no label) — clear and retype
      await user.clear(nameInputs[nameInputs.length - 1]);
      await user.type(nameInputs[nameInputs.length - 1], 'Electrical Updated');

      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockUpdateTag).toHaveBeenCalledWith(
          'tag-1',
          expect.objectContaining({ name: 'Electrical Updated' }),
        );
      });

      await waitFor(() => {
        expect(
          screen.getByText('Tag "Electrical Updated" updated successfully'),
        ).toBeInTheDocument();
      });
    });

    it('successfully deletes a tag after confirming in modal', async () => {
      const user = userEvent.setup();
      mockDeleteTag.mockResolvedValue(undefined);

      renderManagePage('/settings/manage');

      await waitFor(() => {
        expect(screen.getByText('Electrical')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Delete Tag' }));

      await waitFor(() => {
        expect(mockDeleteTag).toHaveBeenCalledWith('tag-1');
      });

      await waitFor(() => {
        expect(screen.getByText(/Tag "Electrical" deleted successfully/)).toBeInTheDocument();
      });
    });
  });

  // ─── Budget Categories tab content ────────────────────────────────────────

  describe('Budget Categories tab', () => {
    it('shows loading state while fetching budget categories', () => {
      mockFetchBudgetCategories.mockReturnValue(new Promise(() => {}));
      renderManagePage('/settings/manage?tab=budget-categories');
      expect(screen.getByText('Loading budget categories...')).toBeInTheDocument();
    });

    it('shows budget category list after loading', async () => {
      renderManagePage('/settings/manage?tab=budget-categories');
      await waitFor(() => {
        expect(screen.getByText('Materials')).toBeInTheDocument();
      });
      expect(screen.getByText('Labor')).toBeInTheDocument();
    });

    it('shows Add Category button', async () => {
      renderManagePage('/settings/manage?tab=budget-categories');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add Category' })).toBeInTheDocument();
      });
    });

    it('shows error state when loading budget categories fails', async () => {
      mockFetchBudgetCategories.mockRejectedValue(new Error('Network error'));
      renderManagePage('/settings/manage?tab=budget-categories');
      await waitFor(() => {
        expect(
          screen.getByText('Failed to load budget categories. Please try again.'),
        ).toBeInTheDocument();
      });
    });

    it('shows category count', async () => {
      renderManagePage('/settings/manage?tab=budget-categories');
      await waitFor(() => {
        expect(screen.getByText(/Categories \(2\)/)).toBeInTheDocument();
      });
    });

    it('shows New Budget Category form when Add Category is clicked', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage?tab=budget-categories');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add Category' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Add Category' }));

      expect(screen.getByText('New Budget Category')).toBeInTheDocument();
    });

    it('delete confirmation modal appears on delete click', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage?tab=budget-categories');

      await waitFor(() => {
        expect(screen.getByText('Materials')).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: 'Delete Materials' });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
      expect(screen.getByRole('heading', { name: 'Delete Category' })).toBeInTheDocument();
    });

    it('calls fetchBudgetCategories when tab is active', async () => {
      renderManagePage('/settings/manage?tab=budget-categories');
      await waitFor(() => {
        expect(mockFetchBudgetCategories).toHaveBeenCalledTimes(1);
      });
    });

    it('successfully creates a new budget category', async () => {
      const user = userEvent.setup();
      const newCat: BudgetCategory = {
        id: 'bc-new',
        name: 'Permits',
        description: null,
        color: '#22C55E',
        sortOrder: 2,
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: '2026-03-06T00:00:00.000Z',
      };
      mockCreateBudgetCategory.mockResolvedValue(newCat);

      renderManagePage('/settings/manage?tab=budget-categories');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add Category' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Add Category' }));

      const nameInput = screen.getByRole('textbox', { name: /Name/i });
      await user.type(nameInput, 'Permits');

      await user.click(screen.getByRole('button', { name: 'Create Category' }));

      await waitFor(() => {
        expect(mockCreateBudgetCategory).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Permits' }),
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Category "Permits" created successfully')).toBeInTheDocument();
      });
    });

    it('shows edit form when Edit is clicked for a budget category', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage?tab=budget-categories');

      await waitFor(() => {
        expect(screen.getByText('Materials')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Edit Materials' }));

      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('cancels edit of budget category and returns to view mode', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage?tab=budget-categories');

      await waitFor(() => {
        expect(screen.getByText('Materials')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Edit Materials' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Edit Materials' })).toBeInTheDocument();
      });
    });

    it('successfully updates a budget category', async () => {
      const user = userEvent.setup();
      const updated: BudgetCategory = {
        id: 'bc-1',
        name: 'Materials Updated',
        description: 'Building materials',
        color: '#FF5733',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-03-06T00:00:00.000Z',
      };
      mockUpdateBudgetCategory.mockResolvedValue(updated);

      renderManagePage('/settings/manage?tab=budget-categories');

      await waitFor(() => {
        expect(screen.getByText('Materials')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Edit Materials' }));

      const nameInput = screen.getByRole('textbox', { name: /Name/i });
      await user.clear(nameInput);
      await user.type(nameInput, 'Materials Updated');

      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockUpdateBudgetCategory).toHaveBeenCalledWith(
          'bc-1',
          expect.objectContaining({ name: 'Materials Updated' }),
        );
      });

      await waitFor(() => {
        expect(
          screen.getByText('Category "Materials Updated" updated successfully'),
        ).toBeInTheDocument();
      });
    });

    it('successfully deletes a budget category after confirming in modal', async () => {
      const user = userEvent.setup();
      mockDeleteBudgetCategory.mockResolvedValue(undefined);

      renderManagePage('/settings/manage?tab=budget-categories');

      await waitFor(() => {
        expect(screen.getByText('Materials')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Delete Materials' }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Delete Category' }));

      await waitFor(() => {
        expect(mockDeleteBudgetCategory).toHaveBeenCalledWith('bc-1');
      });

      await waitFor(() => {
        expect(screen.getByText(/Category "Materials" deleted successfully/)).toBeInTheDocument();
      });
    });

    it('shows in-use error when deleting a budget category referenced by budget entries', async () => {
      const user = userEvent.setup();
      mockDeleteBudgetCategory.mockRejectedValue(
        new ApiClientError(409, {
          code: 'CATEGORY_IN_USE',
          message: 'Category is in use',
        }),
      );

      renderManagePage('/settings/manage?tab=budget-categories');

      await waitFor(() => {
        expect(screen.getByText('Materials')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Delete Materials' }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Delete Category' }));

      await waitFor(() => {
        expect(
          screen.getByText(
            /This category cannot be deleted because it is currently in use by one or more budget entries/,
          ),
        ).toBeInTheDocument();
      });
    });
  });

  // ─── Household Item Categories tab content ─────────────────────────────────

  describe('Household Item Categories tab', () => {
    it('shows loading state while fetching HI categories', () => {
      mockFetchHICCategories.mockReturnValue(new Promise(() => {}));
      renderManagePage('/settings/manage?tab=hi-categories');
      expect(screen.getByText('Loading household item categories...')).toBeInTheDocument();
    });

    it('shows HI category list after loading', async () => {
      renderManagePage('/settings/manage?tab=hi-categories');
      await waitFor(() => {
        expect(screen.getByText('Furniture')).toBeInTheDocument();
      });
      expect(screen.getByText('Appliances')).toBeInTheDocument();
    });

    it('shows Add Category button', async () => {
      renderManagePage('/settings/manage?tab=hi-categories');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add Category' })).toBeInTheDocument();
      });
    });

    it('shows error state when loading HI categories fails', async () => {
      mockFetchHICCategories.mockRejectedValue(new Error('Network error'));
      renderManagePage('/settings/manage?tab=hi-categories');
      await waitFor(() => {
        expect(
          screen.getByText('Failed to load household item categories. Please try again.'),
        ).toBeInTheDocument();
      });
    });

    it('shows category count', async () => {
      renderManagePage('/settings/manage?tab=hi-categories');
      await waitFor(() => {
        expect(screen.getByText(/Categories \(2\)/)).toBeInTheDocument();
      });
    });

    it('shows New Household Item Category form when Add Category is clicked', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage?tab=hi-categories');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add Category' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Add Category' }));

      expect(screen.getByText('New Household Item Category')).toBeInTheDocument();
    });

    it('delete confirmation modal appears on delete click', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage?tab=hi-categories');

      await waitFor(() => {
        expect(screen.getByText('Furniture')).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: 'Delete Furniture' });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
      expect(screen.getByRole('heading', { name: 'Delete Category' })).toBeInTheDocument();
    });

    it('calls fetchHouseholdItemCategories when tab is active', async () => {
      renderManagePage('/settings/manage?tab=hi-categories');
      await waitFor(() => {
        expect(mockFetchHICCategories).toHaveBeenCalledTimes(1);
      });
    });

    it('shows edit form when Edit is clicked for a HI category', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage?tab=hi-categories');

      await waitFor(() => {
        expect(screen.getByText('Furniture')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Edit Furniture' }));

      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('cancels edit of HI category and returns to view mode', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage?tab=hi-categories');

      await waitFor(() => {
        expect(screen.getByText('Furniture')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Edit Furniture' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Edit Furniture' })).toBeInTheDocument();
      });
    });

    it('successfully updates a HI category', async () => {
      const user = userEvent.setup();
      const updated: HouseholdItemCategoryEntity = {
        id: 'hic-1',
        name: 'Furniture Updated',
        color: '#8B5CF6',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-03-06T00:00:00.000Z',
      };
      mockUpdateHICCategory.mockResolvedValue(updated);

      renderManagePage('/settings/manage?tab=hi-categories');

      await waitFor(() => {
        expect(screen.getByText('Furniture')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Edit Furniture' }));

      const nameInput = screen.getByRole('textbox', { name: /Name/i });
      await user.clear(nameInput);
      await user.type(nameInput, 'Furniture Updated');

      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockUpdateHICCategory).toHaveBeenCalledWith(
          'hic-1',
          expect.objectContaining({ name: 'Furniture Updated' }),
        );
      });

      await waitFor(() => {
        expect(
          screen.getByText('Category "Furniture Updated" updated successfully'),
        ).toBeInTheDocument();
      });
    });

    it('shows "in use" error when deleting a category referenced by household items', async () => {
      const user = userEvent.setup();
      mockDeleteHICCategory.mockRejectedValue(
        new ApiClientError(409, {
          code: 'CATEGORY_IN_USE',
          message: 'Category is in use',
        }),
      );

      renderManagePage('/settings/manage?tab=hi-categories');

      await waitFor(() => {
        expect(screen.getByText('Furniture')).toBeInTheDocument();
      });

      // Open delete modal
      const deleteButton = screen.getByRole('button', { name: 'Delete Furniture' });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Click confirm delete
      const confirmButton = screen.getByRole('button', { name: 'Delete Category' });
      await user.click(confirmButton);

      // Error message about category in use
      await waitFor(() => {
        expect(
          screen.getByText(
            /This category cannot be deleted because it is currently in use by one or more household items/,
          ),
        ).toBeInTheDocument();
      });
    });
  });

  // ─── API not called for inactive tabs ─────────────────────────────────────

  describe('Tab isolation', () => {
    it('does not call fetchHouseholdItemCategories when Tags tab is active', async () => {
      renderManagePage('/settings/manage');
      await waitFor(() => {
        expect(mockFetchTags).toHaveBeenCalledTimes(1);
      });
      expect(mockFetchHICCategories).not.toHaveBeenCalled();
    });

    it('does not call fetchBudgetCategories when Tags tab is active', async () => {
      renderManagePage('/settings/manage');
      await waitFor(() => {
        expect(mockFetchTags).toHaveBeenCalledTimes(1);
      });
      expect(mockFetchBudgetCategories).not.toHaveBeenCalled();
    });

    it('does not call fetchTags when Budget Categories tab is active', async () => {
      renderManagePage('/settings/manage?tab=budget-categories');
      await waitFor(() => {
        expect(mockFetchBudgetCategories).toHaveBeenCalledTimes(1);
      });
      expect(mockFetchTags).not.toHaveBeenCalled();
    });

    it('does not call fetchTags when HI Categories tab is active', async () => {
      renderManagePage('/settings/manage?tab=hi-categories');
      await waitFor(() => {
        expect(mockFetchHICCategories).toHaveBeenCalledTimes(1);
      });
      expect(mockFetchTags).not.toHaveBeenCalled();
    });
  });

  // ─── Create HI Category ────────────────────────────────────────────────────

  describe('Create Household Item Category', () => {
    it('successfully creates a new HI category', async () => {
      const user = userEvent.setup();
      const newCat: HouseholdItemCategoryEntity = {
        id: 'hic-new',
        name: 'Garden',
        color: '#22C55E',
        sortOrder: 2,
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: '2026-03-06T00:00:00.000Z',
      };
      mockCreateHICCategory.mockResolvedValue(newCat);

      renderManagePage('/settings/manage?tab=hi-categories');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add Category' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Add Category' }));

      // Fill in the name field
      const nameInput = screen.getByRole('textbox', { name: /Name/i });
      await user.type(nameInput, 'Garden');

      // Submit the form
      await user.click(screen.getByRole('button', { name: 'Create Category' }));

      await waitFor(() => {
        expect(mockCreateHICCategory).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Garden' }),
        );
      });

      // Success message
      await waitFor(() => {
        expect(screen.getByText('Category "Garden" created successfully')).toBeInTheDocument();
      });
    });

    it('shows validation error when name is empty', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage?tab=hi-categories');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add Category' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Add Category' }));

      // Submit form without filling in name
      // The Create Category button should be disabled when name is empty
      const createButton = screen.getByRole('button', { name: 'Create Category' });
      expect(createButton).toBeDisabled();
    });

    it('shows API error when creation fails with conflict', async () => {
      const user = userEvent.setup();
      mockCreateHICCategory.mockRejectedValue(
        new ApiClientError(409, {
          code: 'CONFLICT',
          message: 'A household item category with this name already exists',
        }),
      );

      renderManagePage('/settings/manage?tab=hi-categories');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add Category' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Add Category' }));

      const nameInput = screen.getByRole('textbox', { name: /Name/i });
      await user.type(nameInput, 'Furniture');

      await user.click(screen.getByRole('button', { name: 'Create Category' }));

      await waitFor(() => {
        expect(
          screen.getByText('A household item category with this name already exists'),
        ).toBeInTheDocument();
      });
    });
  });
});
