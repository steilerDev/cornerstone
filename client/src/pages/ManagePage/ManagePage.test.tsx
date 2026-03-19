/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type * as UseAreasTypes from '../../hooks/useAreas.js';
import type * as UseTradesTypes from '../../hooks/useTrades.js';
import type * as BudgetCategoriesApiTypes from '../../lib/budgetCategoriesApi.js';
import type * as HICApiTypes from '../../lib/householdItemCategoriesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type {
  BudgetCategory,
  HouseholdItemCategoryEntity,
  AreaResponse,
  TradeResponse,
} from '@cornerstone/shared';

// ─── Mock hooks and API modules BEFORE importing components ───────────────────

const mockUseAreas = jest.fn<typeof UseAreasTypes.useAreas>();
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: mockUseAreas,
}));

const mockUseTrades = jest.fn<typeof UseTradesTypes.useTrades>();
jest.unstable_mockModule('../../hooks/useTrades.js', () => ({
  useTrades: mockUseTrades,
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

// Mock AreaPicker — pure display component, no need for full rendering
jest.unstable_mockModule('../../components/AreaPicker/AreaPicker.js', () => ({
  AreaPicker: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (val: string) => void;
    nullable?: boolean;
    disabled?: boolean;
    areas: AreaResponse[];
  }) => (
    <select data-testid="area-picker" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No parent</option>
    </select>
  ),
}));

// ─── Sample test data ──────────────────────────────────────────────────────────

const sampleArea1: AreaResponse = {
  id: 'area-1',
  name: 'Kitchen',
  parentId: null,
  color: '#F59E0B',
  description: 'The main kitchen area',
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sampleArea2: AreaResponse = {
  id: 'area-2',
  name: 'Bathroom',
  parentId: null,
  color: '#3B82F6',
  description: null,
  sortOrder: 1,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const sampleTrade1: TradeResponse = {
  id: 'trade-1',
  name: 'Plumbing',
  color: '#3B82F6',
  description: 'Water-related work',
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sampleTrade2: TradeResponse = {
  id: 'trade-2',
  name: 'Electrical',
  color: '#F59E0B',
  description: null,
  sortOrder: 1,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAreasHookResult(
  overrides: Partial<UseAreasTypes.UseAreasResult> = {},
): UseAreasTypes.UseAreasResult {
  return {
    areas: [sampleArea1, sampleArea2],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    createArea: jest
      .fn<UseAreasTypes.UseAreasResult['createArea']>()
      .mockResolvedValue(sampleArea1),
    updateArea: jest
      .fn<UseAreasTypes.UseAreasResult['updateArea']>()
      .mockResolvedValue(sampleArea1),
    deleteArea: jest.fn<UseAreasTypes.UseAreasResult['deleteArea']>().mockResolvedValue(true),
    ...overrides,
  };
}

function makeTradesHookResult(
  overrides: Partial<UseTradesTypes.UseTradesResult> = {},
): UseTradesTypes.UseTradesResult {
  return {
    trades: [sampleTrade1, sampleTrade2],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    createTrade: jest
      .fn<UseTradesTypes.UseTradesResult['createTrade']>()
      .mockResolvedValue(sampleTrade1),
    updateTrade: jest
      .fn<UseTradesTypes.UseTradesResult['updateTrade']>()
      .mockResolvedValue(sampleTrade1),
    deleteTrade: jest.fn<UseTradesTypes.UseTradesResult['deleteTrade']>().mockResolvedValue(true),
    ...overrides,
  };
}

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
    mockUseAreas.mockReset();
    mockUseTrades.mockReset();
    mockFetchBudgetCategories.mockReset();
    mockCreateBudgetCategory.mockReset();
    mockUpdateBudgetCategory.mockReset();
    mockDeleteBudgetCategory.mockReset();
    mockFetchHICCategories.mockReset();
    mockCreateHICCategory.mockReset();
    mockUpdateHICCategory.mockReset();
    mockDeleteHICCategory.mockReset();

    // Default hook return values
    mockUseAreas.mockReturnValue(makeAreasHookResult());
    mockUseTrades.mockReturnValue(makeTradesHookResult());

    // Budget categories and HI categories default — only fetched when tab is active
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

    it('renders all four tab buttons', async () => {
      renderManagePage();
      expect(screen.getByRole('tab', { name: 'Areas' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Trades' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Budget Categories' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Household Item Categories' })).toBeInTheDocument();
    });

    it('Areas tab is active by default (no URL param)', async () => {
      renderManagePage('/settings/manage');
      const areasTab = screen.getByRole('tab', { name: 'Areas' });
      expect(areasTab).toHaveAttribute('aria-selected', 'true');
      const tradesTab = screen.getByRole('tab', { name: 'Trades' });
      expect(tradesTab).toHaveAttribute('aria-selected', 'false');
      const budgetTab = screen.getByRole('tab', { name: 'Budget Categories' });
      expect(budgetTab).toHaveAttribute('aria-selected', 'false');
      const hicTab = screen.getByRole('tab', { name: 'Household Item Categories' });
      expect(hicTab).toHaveAttribute('aria-selected', 'false');
    });

    it('Areas tab is active when ?tab=areas in URL', async () => {
      renderManagePage('/settings/manage?tab=areas');
      const areasTab = screen.getByRole('tab', { name: 'Areas' });
      expect(areasTab).toHaveAttribute('aria-selected', 'true');
    });

    it('Trades tab is active when ?tab=trades in URL', async () => {
      renderManagePage('/settings/manage?tab=trades');
      const tradesTab = screen.getByRole('tab', { name: 'Trades' });
      expect(tradesTab).toHaveAttribute('aria-selected', 'true');
      const areasTab = screen.getByRole('tab', { name: 'Areas' });
      expect(areasTab).toHaveAttribute('aria-selected', 'false');
    });

    it('Budget Categories tab is active when ?tab=budget-categories in URL', async () => {
      renderManagePage('/settings/manage?tab=budget-categories');
      const budgetTab = screen.getByRole('tab', { name: 'Budget Categories' });
      expect(budgetTab).toHaveAttribute('aria-selected', 'true');
      const areasTab = screen.getByRole('tab', { name: 'Areas' });
      expect(areasTab).toHaveAttribute('aria-selected', 'false');
    });

    it('Household Item Categories tab is active when ?tab=hi-categories in URL', async () => {
      renderManagePage('/settings/manage?tab=hi-categories');
      const hicTab = screen.getByRole('tab', { name: 'Household Item Categories' });
      expect(hicTab).toHaveAttribute('aria-selected', 'true');
      const areasTab = screen.getByRole('tab', { name: 'Areas' });
      expect(areasTab).toHaveAttribute('aria-selected', 'false');
    });

    it('clicking Trades tab makes it active', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage');

      // Initially Areas tab is active
      expect(screen.getByRole('tab', { name: 'Areas' })).toHaveAttribute('aria-selected', 'true');

      // Click Trades tab
      await user.click(screen.getByRole('tab', { name: 'Trades' }));

      expect(screen.getByRole('tab', { name: 'Trades' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Areas' })).toHaveAttribute('aria-selected', 'false');
    });

    it('clicking Budget Categories tab makes it active', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage');

      await user.click(screen.getByRole('tab', { name: 'Budget Categories' }));

      expect(screen.getByRole('tab', { name: 'Budget Categories' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByRole('tab', { name: 'Areas' })).toHaveAttribute('aria-selected', 'false');
    });

    it('clicking Household Item Categories tab makes it active', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage');

      await user.click(screen.getByRole('tab', { name: 'Household Item Categories' }));

      expect(screen.getByRole('tab', { name: 'Household Item Categories' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByRole('tab', { name: 'Areas' })).toHaveAttribute('aria-selected', 'false');
    });
  });

  // ─── Areas tab content ─────────────────────────────────────────────────────

  describe('Areas tab', () => {
    it('shows loading state while fetching areas', () => {
      mockUseAreas.mockReturnValue(makeAreasHookResult({ isLoading: true, areas: [] }));
      renderManagePage('/settings/manage');
      // Skeleton renders (role="status" aria-busy="true") instead of the area list
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByText('Kitchen')).not.toBeInTheDocument();
    });

    it('shows area list after loading', async () => {
      renderManagePage('/settings/manage');
      expect(screen.getByText('Kitchen')).toBeInTheDocument();
      expect(screen.getByText('Bathroom')).toBeInTheDocument();
    });

    it('shows Create New Area section', async () => {
      renderManagePage('/settings/manage');
      expect(screen.getByText('Create New Area')).toBeInTheDocument();
    });

    it('shows error state when loading areas fails', async () => {
      mockUseAreas.mockReturnValue(
        makeAreasHookResult({
          isLoading: false,
          areas: [],
          error: 'An unexpected error occurred while loading areas.',
        }),
      );
      renderManagePage('/settings/manage');
      // EmptyState renders with the error message
      expect(
        screen.getByText('An unexpected error occurred while loading areas.'),
      ).toBeInTheDocument();
    });

    it('shows area count in section heading', async () => {
      renderManagePage('/settings/manage');
      expect(screen.getByText(/Existing Areas \(2\)/)).toBeInTheDocument();
    });

    it('Create Area button is disabled when name is empty', async () => {
      renderManagePage('/settings/manage');
      const createButton = screen.getByRole('button', { name: 'Create Area' });
      expect(createButton).toBeDisabled();
    });

    it('shows edit form when Edit button is clicked for an area', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage');

      const editButtons = screen.getAllByRole('button', { name: 'Edit' });
      await user.click(editButtons[0]);

      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('cancels edit and returns to view mode', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage');

      const editButtons = screen.getAllByRole('button', { name: 'Edit' });
      await user.click(editButtons[0]);

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      // Back to normal view — Edit buttons visible again
      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
      });
    });

    it('successfully creates a new area', async () => {
      const user = userEvent.setup();
      const newArea: AreaResponse = {
        id: 'area-3',
        name: 'Living Room',
        parentId: null,
        color: '#22C55E',
        description: null,
        sortOrder: 2,
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: '2026-03-06T00:00:00.000Z',
      };
      const mockCreateArea = jest
        .fn<UseAreasTypes.UseAreasResult['createArea']>()
        .mockResolvedValue(newArea);
      mockUseAreas.mockReturnValue(makeAreasHookResult({ createArea: mockCreateArea }));

      renderManagePage('/settings/manage');

      const nameInput = screen.getByRole('textbox', { name: 'Area Name' });
      await user.type(nameInput, 'Living Room');

      await user.click(screen.getByRole('button', { name: 'Create Area' }));

      await waitFor(() => {
        expect(mockCreateArea).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Living Room' }),
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Area "Living Room" created successfully')).toBeInTheDocument();
      });
    });

    it('successfully updates an area', async () => {
      const user = userEvent.setup();
      const updatedArea: AreaResponse = {
        ...sampleArea1,
        name: 'Kitchen Updated',
      };
      const mockUpdateArea = jest
        .fn<UseAreasTypes.UseAreasResult['updateArea']>()
        .mockResolvedValue(updatedArea);
      mockUseAreas.mockReturnValue(makeAreasHookResult({ updateArea: mockUpdateArea }));

      renderManagePage('/settings/manage');

      const editButtons = screen.getAllByRole('button', { name: 'Edit' });
      await user.click(editButtons[0]);

      // Clear the name input and type a new name
      // The edit name input is labelled "Area Name"
      const nameInput = screen.getAllByRole('textbox', { name: 'Area Name' });
      // There's both the create and edit form; the edit form input comes last (only visible one in edit mode)
      const editNameInput = nameInput[nameInput.length - 1];
      await user.clear(editNameInput);
      await user.type(editNameInput, 'Kitchen Updated');

      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockUpdateArea).toHaveBeenCalledWith(
          'area-1',
          expect.objectContaining({ name: 'Kitchen Updated' }),
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Area "Kitchen Updated" updated successfully')).toBeInTheDocument();
      });
    });

    it('delete confirmation modal appears on Delete button click', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage');

      const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
      expect(screen.getByRole('heading', { name: 'Delete Area' })).toBeInTheDocument();
    });

    it('successfully deletes an area after confirming in modal', async () => {
      const user = userEvent.setup();
      const mockDeleteArea = jest
        .fn<UseAreasTypes.UseAreasResult['deleteArea']>()
        .mockResolvedValue(true);
      mockUseAreas.mockReturnValue(makeAreasHookResult({ deleteArea: mockDeleteArea }));

      renderManagePage('/settings/manage');

      const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Delete Area' }));

      await waitFor(() => {
        expect(mockDeleteArea).toHaveBeenCalledWith('area-1');
      });

      await waitFor(() => {
        expect(screen.getByText(/Area "Kitchen" deleted successfully/)).toBeInTheDocument();
      });
    });

    it('calls useAreas hook when areas tab is active', async () => {
      renderManagePage('/settings/manage');
      expect(mockUseAreas).toHaveBeenCalled();
    });
  });

  // ─── Trades tab content ────────────────────────────────────────────────────

  describe('Trades tab', () => {
    it('shows loading state while fetching trades', () => {
      mockUseTrades.mockReturnValue(makeTradesHookResult({ isLoading: true, trades: [] }));
      renderManagePage('/settings/manage?tab=trades');
      // Skeleton renders (role="status" aria-busy="true") instead of the trade list
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByText('Plumbing')).not.toBeInTheDocument();
    });

    it('shows trade list after loading', async () => {
      renderManagePage('/settings/manage?tab=trades');
      expect(screen.getByText('Plumbing')).toBeInTheDocument();
      expect(screen.getByText('Electrical')).toBeInTheDocument();
    });

    it('shows Create New Trade section', async () => {
      renderManagePage('/settings/manage?tab=trades');
      expect(screen.getByText('Create New Trade')).toBeInTheDocument();
    });

    it('shows error state when loading trades fails', async () => {
      mockUseTrades.mockReturnValue(
        makeTradesHookResult({
          isLoading: false,
          trades: [],
          error: 'An unexpected error occurred while loading trades.',
        }),
      );
      renderManagePage('/settings/manage?tab=trades');
      expect(
        screen.getByText('An unexpected error occurred while loading trades.'),
      ).toBeInTheDocument();
    });

    it('shows trade count in section heading', async () => {
      renderManagePage('/settings/manage?tab=trades');
      expect(screen.getByText(/Existing Trades \(2\)/)).toBeInTheDocument();
    });

    it('Create Trade button is disabled when name is empty', async () => {
      renderManagePage('/settings/manage?tab=trades');
      const createButton = screen.getByRole('button', { name: 'Create Trade' });
      expect(createButton).toBeDisabled();
    });

    it('shows edit form when Edit button is clicked for a trade', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage?tab=trades');

      const editButtons = screen.getAllByRole('button', { name: 'Edit' });
      await user.click(editButtons[0]);

      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('cancels edit and returns to view mode', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage?tab=trades');

      const editButtons = screen.getAllByRole('button', { name: 'Edit' });
      await user.click(editButtons[0]);

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
      });
    });

    it('successfully creates a new trade', async () => {
      const user = userEvent.setup();
      const newTrade: TradeResponse = {
        id: 'trade-3',
        name: 'Carpentry',
        color: '#22C55E',
        description: null,
        sortOrder: 2,
        createdAt: '2026-03-06T00:00:00.000Z',
        updatedAt: '2026-03-06T00:00:00.000Z',
      };
      const mockCreateTrade = jest
        .fn<UseTradesTypes.UseTradesResult['createTrade']>()
        .mockResolvedValue(newTrade);
      mockUseTrades.mockReturnValue(makeTradesHookResult({ createTrade: mockCreateTrade }));

      renderManagePage('/settings/manage?tab=trades');

      const nameInput = screen.getByRole('textbox', { name: 'Trade Name' });
      await user.type(nameInput, 'Carpentry');

      await user.click(screen.getByRole('button', { name: 'Create Trade' }));

      await waitFor(() => {
        expect(mockCreateTrade).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Carpentry' }),
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Trade "Carpentry" created successfully')).toBeInTheDocument();
      });
    });

    it('successfully updates a trade', async () => {
      const user = userEvent.setup();
      const updatedTrade: TradeResponse = {
        ...sampleTrade1,
        name: 'Plumbing Updated',
      };
      const mockUpdateTrade = jest
        .fn<UseTradesTypes.UseTradesResult['updateTrade']>()
        .mockResolvedValue(updatedTrade);
      mockUseTrades.mockReturnValue(makeTradesHookResult({ updateTrade: mockUpdateTrade }));

      renderManagePage('/settings/manage?tab=trades');

      const editButtons = screen.getAllByRole('button', { name: 'Edit' });
      await user.click(editButtons[0]);

      const nameInputs = screen.getAllByRole('textbox', { name: 'Trade Name' });
      const editNameInput = nameInputs[nameInputs.length - 1];
      await user.clear(editNameInput);
      await user.type(editNameInput, 'Plumbing Updated');

      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockUpdateTrade).toHaveBeenCalledWith(
          'trade-1',
          expect.objectContaining({ name: 'Plumbing Updated' }),
        );
      });

      await waitFor(() => {
        expect(
          screen.getByText('Trade "Plumbing Updated" updated successfully'),
        ).toBeInTheDocument();
      });
    });

    it('delete confirmation modal appears on Delete button click', async () => {
      const user = userEvent.setup();
      renderManagePage('/settings/manage?tab=trades');

      const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
      expect(screen.getByRole('heading', { name: 'Delete Trade' })).toBeInTheDocument();
    });

    it('successfully deletes a trade after confirming in modal', async () => {
      const user = userEvent.setup();
      const mockDeleteTrade = jest
        .fn<UseTradesTypes.UseTradesResult['deleteTrade']>()
        .mockResolvedValue(true);
      mockUseTrades.mockReturnValue(makeTradesHookResult({ deleteTrade: mockDeleteTrade }));

      renderManagePage('/settings/manage?tab=trades');

      const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Delete Trade' }));

      await waitFor(() => {
        expect(mockDeleteTrade).toHaveBeenCalledWith('trade-1');
      });

      await waitFor(() => {
        expect(screen.getByText(/Trade "Plumbing" deleted successfully/)).toBeInTheDocument();
      });
    });

    it('calls useTrades hook when trades tab is active', async () => {
      renderManagePage('/settings/manage?tab=trades');
      expect(mockUseTrades).toHaveBeenCalled();
    });
  });

  // ─── Budget Categories tab content ────────────────────────────────────────

  describe('Budget Categories tab', () => {
    it('shows loading state while fetching budget categories', () => {
      mockFetchBudgetCategories.mockReturnValue(new Promise(() => {}));
      renderManagePage('/settings/manage?tab=budget-categories');
      // Budget categories tab now uses Skeleton component for loading
      expect(screen.getByRole('status')).toBeInTheDocument();
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
      // HI categories tab now uses Skeleton component for loading
      expect(screen.getByRole('status')).toBeInTheDocument();
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

      const deleteButton = screen.getByRole('button', { name: 'Delete Furniture' });
      await user.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: 'Delete Category' });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(
          screen.getByText(
            /This category cannot be deleted because it is currently in use by one or more household items/,
          ),
        ).toBeInTheDocument();
      });
    });

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

      const nameInput = screen.getByRole('textbox', { name: /Name/i });
      await user.type(nameInput, 'Garden');

      await user.click(screen.getByRole('button', { name: 'Create Category' }));

      await waitFor(() => {
        expect(mockCreateHICCategory).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Garden' }),
        );
      });

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

  // ─── Tab isolation ─────────────────────────────────────────────────────────

  describe('Tab isolation', () => {
    it('does not call useTrades and does not show trade content when Areas tab is active', async () => {
      renderManagePage('/settings/manage');
      expect(mockUseAreas).toHaveBeenCalled();
      expect(mockUseTrades).not.toHaveBeenCalled();
      expect(screen.queryByText('Plumbing')).not.toBeInTheDocument();
      expect(screen.queryByText('Electrical')).not.toBeInTheDocument();
    });

    it('does not call useAreas and does not show area content when Trades tab is active', async () => {
      renderManagePage('/settings/manage?tab=trades');
      expect(mockUseTrades).toHaveBeenCalled();
      expect(mockUseAreas).not.toHaveBeenCalled();
      expect(screen.queryByText('Kitchen')).not.toBeInTheDocument();
      expect(screen.queryByText('Bathroom')).not.toBeInTheDocument();
    });

    it('does not call fetchBudgetCategories when Areas tab is active', async () => {
      renderManagePage('/settings/manage');
      // Let any async effects settle
      await waitFor(() => {
        expect(mockUseAreas).toHaveBeenCalled();
      });
      expect(mockFetchBudgetCategories).not.toHaveBeenCalled();
    });

    it('does not call fetchHouseholdItemCategories when Areas tab is active', async () => {
      renderManagePage('/settings/manage');
      await waitFor(() => {
        expect(mockUseAreas).toHaveBeenCalled();
      });
      expect(mockFetchHICCategories).not.toHaveBeenCalled();
    });

    it('does not call fetchBudgetCategories when Trades tab is active', async () => {
      renderManagePage('/settings/manage?tab=trades');
      await waitFor(() => {
        expect(mockUseTrades).toHaveBeenCalled();
      });
      expect(mockFetchBudgetCategories).not.toHaveBeenCalled();
    });

    it('does not call fetchHouseholdItemCategories when Trades tab is active', async () => {
      renderManagePage('/settings/manage?tab=trades');
      await waitFor(() => {
        expect(mockUseTrades).toHaveBeenCalled();
      });
      expect(mockFetchHICCategories).not.toHaveBeenCalled();
    });

    it('does not call fetchHouseholdItemCategories when Budget Categories tab is active', async () => {
      renderManagePage('/settings/manage?tab=budget-categories');
      await waitFor(() => {
        expect(mockFetchBudgetCategories).toHaveBeenCalledTimes(1);
      });
      expect(mockFetchHICCategories).not.toHaveBeenCalled();
    });

    it('does not call fetchBudgetCategories when HI Categories tab is active', async () => {
      renderManagePage('/settings/manage?tab=hi-categories');
      await waitFor(() => {
        expect(mockFetchHICCategories).toHaveBeenCalledTimes(1);
      });
      expect(mockFetchBudgetCategories).not.toHaveBeenCalled();
    });
  });
});
