/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type * as BudgetCategoriesApiTypes from '../../lib/budgetCategoriesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type { BudgetCategory, BudgetCategoryListResponse } from '@cornerstone/shared';

// Mock the API module BEFORE importing the component
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

describe('BudgetCategoriesPage', () => {
  let BudgetCategoriesPage: React.ComponentType;

  // Sample data
  const sampleCategory1: BudgetCategory = {
    id: 'cat-1',
    name: 'Materials',
    description: 'Building materials',
    color: '#FF5733',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const sampleCategory2: BudgetCategory = {
    id: 'cat-2',
    name: 'Labor',
    description: null,
    color: '#3B82F6',
    sortOrder: 2,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };

  const emptyResponse: BudgetCategoryListResponse = {
    categories: [],
  };

  const listResponse: BudgetCategoryListResponse = {
    categories: [sampleCategory1, sampleCategory2],
  };

  beforeEach(async () => {
    if (!BudgetCategoriesPage) {
      const module = await import('./BudgetCategoriesPage.js');
      BudgetCategoriesPage = module.default;
    }

    // Reset all mocks
    mockFetchBudgetCategories.mockReset();
    mockCreateBudgetCategory.mockReset();
    mockUpdateBudgetCategory.mockReset();
    mockDeleteBudgetCategory.mockReset();
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/budget/categories']}>
        <BudgetCategoriesPage />
      </MemoryRouter>,
    );
  }

  // ─── Loading state ──────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows loading indicator while fetching categories', () => {
      // Never resolves — stays in loading state
      mockFetchBudgetCategories.mockReturnValueOnce(new Promise(() => {}));

      renderPage();

      expect(screen.getByText(/loading budget categories/i)).toBeInTheDocument();
    });

    it('hides loading indicator after data loads', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/loading budget categories/i)).not.toBeInTheDocument();
      });
    });
  });

  // ─── Page structure ─────────────────────────────────────────────────────────

  describe('page structure', () => {
    it('renders the page heading "Budget Categories"', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /budget categories/i, level: 1 }),
        ).toBeInTheDocument();
      });
    });

    it('renders "Add Category" button', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add category/i })).toBeInTheDocument();
      });
    });
  });

  // ─── Empty state ────────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows empty state message when no categories exist', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/no budget categories yet/i)).toBeInTheDocument();
      });
    });

    it('shows count of 0 in section heading for empty state', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /categories \(0\)/i })).toBeInTheDocument();
      });
    });
  });

  // ─── Categories list display ─────────────────────────────────────────────────

  describe('categories list display', () => {
    it('displays category names in the list', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Materials')).toBeInTheDocument();
        expect(screen.getByText('Labor')).toBeInTheDocument();
      });
    });

    it('displays category description when present', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Building materials')).toBeInTheDocument();
      });
    });

    it('shows correct count in section heading', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /categories \(2\)/i })).toBeInTheDocument();
      });
    });

    it('renders Edit button for each category', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit materials/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /edit labor/i })).toBeInTheDocument();
      });
    });

    it('renders Delete button for each category', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete materials/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /delete labor/i })).toBeInTheDocument();
      });
    });
  });

  // ─── Error state ────────────────────────────────────────────────────────────

  describe('error state', () => {
    it('shows error state when API call fails and no categories loaded', async () => {
      mockFetchBudgetCategories.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server error' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });
    });

    it('shows generic error message for non-ApiClientError failures', async () => {
      mockFetchBudgetCategories.mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/failed to load budget categories/i)).toBeInTheDocument();
      });
    });

    it('shows a Retry button on load error', async () => {
      mockFetchBudgetCategories.mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    it('retries loading when Retry button is clicked', async () => {
      mockFetchBudgetCategories
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /retry/i }));

      await waitFor(() => {
        expect(screen.getByText('Materials')).toBeInTheDocument();
      });
    });
  });

  // ─── Create form ────────────────────────────────────────────────────────────

  describe('create form', () => {
    it('shows create form when "Add Category" is clicked', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add category/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add category/i }));

      expect(screen.getByRole('heading', { name: /new budget category/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    });

    it('"Add Category" button is disabled while form is shown', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add category/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add category/i }));

      expect(screen.getByRole('button', { name: /add category/i })).toBeDisabled();
    });

    it('hides create form when Cancel is clicked', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add category/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add category/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(
        screen.queryByRole('heading', { name: /new budget category/i }),
      ).not.toBeInTheDocument();
    });

    it('"Create Category" submit button is disabled when name is empty (prevents empty submission)', async () => {
      // The component disables the Create Category button when name is empty,
      // preventing form submission rather than showing a validation error on click.
      mockFetchBudgetCategories.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add category/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add category/i }));

      // Name is empty — Create Category button is disabled
      const createButton = screen.getByRole('button', { name: /create category/i });
      expect(createButton).toBeDisabled();
    });

    it('shows validation error when submitting with whitespace-only name', async () => {
      // The form can be submitted if the user types spaces (button becomes enabled),
      // but the component catches it and sets createError.
      mockFetchBudgetCategories.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add category/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add category/i }));

      // Type spaces to make the button enabled (non-empty string, but trimmed is empty)
      const nameInput = screen.getByLabelText(/^name/i);
      await user.type(nameInput, '   ');

      // fireEvent.submit triggers submit directly, bypassing the disabled check
      const form = nameInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText(/category name is required/i)).toBeInTheDocument();
      });
    });

    it('successfully creates a category and shows success message', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(emptyResponse);

      const newCategory: BudgetCategory = {
        id: 'cat-new',
        name: 'Permits',
        description: null,
        color: '#3b82f6',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockCreateBudgetCategory.mockResolvedValueOnce(newCategory);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add category/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add category/i }));

      const nameInput = screen.getByLabelText(/^name/i);
      await user.type(nameInput, 'Permits');

      await user.click(screen.getByRole('button', { name: /create category/i }));

      await waitFor(() => {
        expect(mockCreateBudgetCategory).toHaveBeenCalledTimes(1);
        expect(mockCreateBudgetCategory).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Permits' }),
        );
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/category "permits" created successfully/i)).toBeInTheDocument();
      });
    });

    it('hides create form after successful creation', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(emptyResponse);

      const newCategory: BudgetCategory = {
        id: 'cat-new',
        name: 'Permits',
        description: null,
        color: '#3b82f6',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      mockCreateBudgetCategory.mockResolvedValueOnce(newCategory);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add category/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add category/i }));

      const nameInput = screen.getByLabelText(/^name/i);
      await user.type(nameInput, 'Permits');
      await user.click(screen.getByRole('button', { name: /create category/i }));

      await waitFor(() => {
        expect(
          screen.queryByRole('heading', { name: /new budget category/i }),
        ).not.toBeInTheDocument();
      });
    });

    it('shows create API error message on failure (409 conflict)', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(emptyResponse);
      mockCreateBudgetCategory.mockRejectedValueOnce(
        new ApiClientError(409, {
          code: 'CONFLICT',
          message: 'A budget category with this name already exists',
        }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add category/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add category/i }));

      const nameInput = screen.getByLabelText(/^name/i);
      await user.type(nameInput, 'Materials');

      await user.click(screen.getByRole('button', { name: /create category/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/a budget category with this name already exists/i),
        ).toBeInTheDocument();
      });
    });

    it('"Create Category" button is disabled when name is empty', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add category/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add category/i }));

      // Name is empty by default — button should be disabled
      const createButton = screen.getByRole('button', { name: /create category/i });
      expect(createButton).toBeDisabled();
    });
  });

  // ─── Edit form ──────────────────────────────────────────────────────────────

  describe('edit form (inline)', () => {
    it('shows inline edit form when Edit button is clicked', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit materials/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit materials/i }));

      expect(screen.getByRole('form', { name: /edit materials/i })).toBeInTheDocument();
    });

    it('pre-fills edit form with current category values', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit materials/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit materials/i }));

      // Name input should be pre-filled
      const nameInput = screen.getByDisplayValue('Materials');
      expect(nameInput).toBeInTheDocument();
    });

    it('hides edit form when Cancel is clicked', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit materials/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit materials/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByRole('form', { name: /edit materials/i })).not.toBeInTheDocument();
    });

    it('successfully saves an update and shows success message', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);

      const updatedCategory: BudgetCategory = {
        ...sampleCategory1,
        name: 'Updated Materials',
        updatedAt: '2026-01-03T00:00:00.000Z',
      };
      mockUpdateBudgetCategory.mockResolvedValueOnce(updatedCategory);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit materials/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit materials/i }));

      // Clear and retype the name
      const nameInput = screen.getByDisplayValue('Materials');
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Materials');

      await user.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => {
        expect(mockUpdateBudgetCategory).toHaveBeenCalledWith(
          'cat-1',
          expect.objectContaining({ name: 'Updated Materials' }),
        );
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(
          screen.getByText(/category "updated materials" updated successfully/i),
        ).toBeInTheDocument();
      });
    });

    it('shows update error when save fails (409 conflict)', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);
      mockUpdateBudgetCategory.mockRejectedValueOnce(
        new ApiClientError(409, {
          code: 'CONFLICT',
          message: 'A budget category with this name already exists',
        }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit materials/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit materials/i }));

      const nameInput = screen.getByDisplayValue('Materials');
      await user.clear(nameInput);
      await user.type(nameInput, 'Labor'); // Conflicts with cat-2

      await user.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/a budget category with this name already exists/i),
        ).toBeInTheDocument();
      });
    });

    it('shows validation error when saving with empty name', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit materials/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit materials/i }));

      const nameInput = screen.getByDisplayValue('Materials');
      await user.clear(nameInput);

      // Submit with empty name
      const saveButton = screen.getByRole('button', { name: /^save$/i });
      // The save button is disabled when name is empty
      expect(saveButton).toBeDisabled();
    });

    it('disables other edit/delete buttons while one category is being edited', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit materials/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit materials/i }));

      // Edit button for Labor should be disabled
      const editLaborButton = screen.getByRole('button', { name: /edit labor/i });
      expect(editLaborButton).toBeDisabled();
    });
  });

  // ─── Delete confirmation modal ──────────────────────────────────────────────

  describe('delete confirmation modal', () => {
    it('shows delete confirmation modal when Delete button is clicked', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete materials/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete materials/i }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /delete category/i })).toBeInTheDocument();
    });

    it('shows the category name in the confirmation modal body text', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete materials/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete materials/i }));

      // The category name appears in the modal dialog
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Materials');
    });

    it('closes the modal when Cancel is clicked', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete materials/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete materials/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('successfully deletes a category and shows success message', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);
      mockDeleteBudgetCategory.mockResolvedValueOnce(undefined);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete materials/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete materials/i }));
      await user.click(screen.getByRole('button', { name: /delete category/i }));

      await waitFor(() => {
        expect(mockDeleteBudgetCategory).toHaveBeenCalledWith('cat-1');
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/category "materials" deleted successfully/i)).toBeInTheDocument();
      });
    });

    it('removes the deleted category from the list', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);
      mockDeleteBudgetCategory.mockResolvedValueOnce(undefined);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete materials/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete materials/i }));
      await user.click(screen.getByRole('button', { name: /delete category/i }));

      await waitFor(() => {
        expect(screen.queryByText('Materials')).not.toBeInTheDocument();
      });

      // Labor should still be there
      expect(screen.getByText('Labor')).toBeInTheDocument();
    });

    it('shows CATEGORY_IN_USE error when deletion fails with 409', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);
      mockDeleteBudgetCategory.mockRejectedValueOnce(
        new ApiClientError(409, {
          code: 'CATEGORY_IN_USE',
          message: 'Budget category is in use',
        }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete materials/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete materials/i }));
      await user.click(screen.getByRole('button', { name: /delete category/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/this category cannot be deleted because it is currently in use/i),
        ).toBeInTheDocument();
      });
    });

    it('hides "Delete Category" confirm button when category-in-use error is shown', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);
      mockDeleteBudgetCategory.mockRejectedValueOnce(
        new ApiClientError(409, {
          code: 'CATEGORY_IN_USE',
          message: 'Budget category is in use',
        }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete materials/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete materials/i }));
      await user.click(screen.getByRole('button', { name: /delete category/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/this category cannot be deleted because it is currently in use/i),
        ).toBeInTheDocument();
      });

      // The confirm delete button should no longer be visible
      expect(screen.queryByRole('button', { name: /delete category/i })).not.toBeInTheDocument();
    });

    it('shows generic error for non-409 delete failures', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(listResponse);
      mockDeleteBudgetCategory.mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete materials/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete materials/i }));
      await user.click(screen.getByRole('button', { name: /delete category/i }));

      await waitFor(() => {
        expect(screen.getByText(/failed to delete category/i)).toBeInTheDocument();
      });
    });
  });

  // ─── Success message behavior ───────────────────────────────────────────────

  describe('success message behavior', () => {
    it('shows success alert after creating a category', async () => {
      mockFetchBudgetCategories.mockResolvedValueOnce(emptyResponse);
      mockCreateBudgetCategory.mockResolvedValueOnce({
        id: 'cat-new',
        name: 'Permits',
        description: null,
        color: '#3b82f6',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add category/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add category/i }));
      await user.type(screen.getByLabelText(/^name/i), 'Permits');
      await user.click(screen.getByRole('button', { name: /create category/i }));

      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        const successAlert = alerts.find((el) => el.textContent?.includes('created successfully'));
        expect(successAlert).toBeInTheDocument();
      });
    });

    it('success message persists when opening the create form again', async () => {
      // The component does NOT clear the success message when opening the create form.
      // The success message stays visible alongside the form.
      mockFetchBudgetCategories.mockResolvedValueOnce(emptyResponse);
      mockCreateBudgetCategory.mockResolvedValueOnce({
        id: 'cat-new',
        name: 'Custom HVAC',
        description: null,
        color: '#3b82f6',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add category/i })).toBeInTheDocument();
      });

      // Create a category to get a success message
      await user.click(screen.getByRole('button', { name: /add category/i }));
      await user.type(screen.getByLabelText(/^name/i), 'Custom HVAC');
      await user.click(screen.getByRole('button', { name: /create category/i }));

      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        const successAlert = alerts.find((el) => el.textContent?.includes('created successfully'));
        expect(successAlert).toBeInTheDocument();
      });

      // Re-open create form — success message remains visible (not cleared)
      await user.click(screen.getByRole('button', { name: /add category/i }));

      // Success message should still be there (component doesn't clear it on form open)
      expect(
        screen.queryByText(/category "custom hvac" created successfully/i),
      ).toBeInTheDocument();
    });
  });
});
