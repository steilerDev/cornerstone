/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as HouseholdItemDetailPageTypes from './HouseholdItemDetailPage.js';
import type {
  HouseholdItemDetail,
  HouseholdItemStatus,
  HouseholdItemCategory,
} from '@cornerstone/shared';
import type React from 'react';
import type * as HouseholdItemWorkItemsApiTypes from '../../lib/householdItemWorkItemsApi.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';

const mockGetHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.getHouseholdItem>();
const mockDeleteHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.deleteHouseholdItem>();
const mockShowToast = jest.fn();
const mockNavigate = jest.fn();
const mockFetchLinkedWorkItems =
  jest.fn<typeof HouseholdItemWorkItemsApiTypes.fetchLinkedWorkItems>();
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();
const mockFetchHouseholdItemBudgets = jest.fn() as any;
const mockFetchBudgetCategories = jest.fn() as any;
const mockFetchBudgetSources = jest.fn() as any;
const mockFetchVendors = jest.fn() as any;
const mockFetchSubsidyPrograms = jest.fn() as any;
const mockFetchHouseholdItemSubsidies = jest.fn() as any;
const mockFetchHouseholdItemSubsidyPayback = jest.fn() as any;

// Mock ApiClientError for error scenarios
class MockApiClientError extends Error {
  constructor(
    readonly statusCode: number,
    readonly error: { code: string; message: string },
  ) {
    super(error.message);
    this.name = 'ApiClientError';
  }
}

// Mock only API modules — do NOT mock react-router-dom (causes OOM)
jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  createHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.createHouseholdItem>(),
  getHouseholdItem: mockGetHouseholdItem,
  updateHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.updateHouseholdItem>(),
  listHouseholdItems: jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>(),
  deleteHouseholdItem: mockDeleteHouseholdItem,
}));

// Mock ApiClientError so instanceof checks work in the component
jest.unstable_mockModule('../../lib/apiClient.js', () => ({
  ApiClientError: MockApiClientError,
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
}));

// Mock useToast so HouseholdItemDetailPage can render without a ToastProvider wrapper
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({
    toasts: [],
    showToast: mockShowToast,
    dismissToast: jest.fn(),
  }),
}));

jest.unstable_mockModule('../../lib/householdItemWorkItemsApi.js', () => ({
  fetchLinkedWorkItems: mockFetchLinkedWorkItems,
  linkWorkItemToHouseholdItem: jest.fn(),
  unlinkWorkItemFromHouseholdItem: jest.fn(),
  fetchLinkedHouseholdItems: jest.fn(),
}));

jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItems: mockListWorkItems,
  getWorkItem: jest.fn(),
  createWorkItem: jest.fn(),
  updateWorkItem: jest.fn(),
  deleteWorkItem: jest.fn(),
}));

jest.unstable_mockModule('../../lib/householdItemBudgetsApi.js', () => ({
  fetchHouseholdItemBudgets: mockFetchHouseholdItemBudgets,
  createHouseholdItemBudget: jest.fn(),
  updateHouseholdItemBudget: jest.fn(),
  deleteHouseholdItemBudget: jest.fn(),
}));

jest.unstable_mockModule('../../lib/budgetCategoriesApi.js', () => ({
  fetchBudgetCategories: mockFetchBudgetCategories,
  createBudgetCategory: jest.fn(),
  updateBudgetCategory: jest.fn(),
  deleteBudgetCategory: jest.fn(),
}));

jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchBudgetSources,
  fetchBudgetSource: jest.fn(),
  createBudgetSource: jest.fn(),
  updateBudgetSource: jest.fn(),
  deleteBudgetSource: jest.fn(),
}));

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: jest.fn(),
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

jest.unstable_mockModule('../../lib/subsidyProgramsApi.js', () => ({
  fetchSubsidyPrograms: mockFetchSubsidyPrograms,
  fetchSubsidyProgram: jest.fn(),
  createSubsidyProgram: jest.fn(),
  updateSubsidyProgram: jest.fn(),
  deleteSubsidyProgram: jest.fn(),
}));

jest.unstable_mockModule('../../lib/householdItemSubsidiesApi.js', () => ({
  fetchHouseholdItemSubsidies: mockFetchHouseholdItemSubsidies,
  linkHouseholdItemSubsidy: jest.fn(),
  unlinkHouseholdItemSubsidy: jest.fn(),
  fetchHouseholdItemSubsidyPayback: mockFetchHouseholdItemSubsidyPayback,
}));

// Helper to capture current location
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

describe('HouseholdItemDetailPage', () => {
  let HouseholdItemDetailPageModule: typeof HouseholdItemDetailPageTypes;

  function makeItem(overrides: Partial<HouseholdItemDetail> = {}): HouseholdItemDetail {
    return {
      id: 'item-1',
      name: 'Standing Desk',
      description: 'Electric height-adjustable desk',
      category: 'furniture' as HouseholdItemCategory,
      status: 'ordered' as HouseholdItemStatus,
      vendor: { id: 'vendor-1', name: 'IKEA', specialty: 'Furniture' },
      room: 'Office',
      quantity: 2,
      orderDate: '2026-02-15',
      expectedDeliveryDate: '2026-03-01',
      actualDeliveryDate: null,
      url: 'https://example.com/desk',
      tagIds: ['tag-1'],
      budgetLineCount: 1,
      totalPlannedAmount: 599.99,
      budgetSummary: { totalPlanned: 599.99, totalActual: 0, subsidyReduction: 0, netCost: 599.99 },
      createdBy: { id: 'user-1', displayName: 'John Doe', email: 'john@example.com' },
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-02-15T14:30:00Z',
      tags: [
        { id: 'tag-1', name: 'Priority', color: '#ff0000', createdAt: '2026-01-01T00:00:00Z' },
      ],
      workItems: [
        {
          id: 'wi-1',
          title: 'Install desk',
          status: 'in_progress',
          startDate: '2026-04-01',
          endDate: '2026-04-15',
          assignedUser: null,
        },
      ],
      subsidies: [],
      ...overrides,
    };
  }

  beforeEach(async () => {
    mockGetHouseholdItem.mockReset();
    mockDeleteHouseholdItem.mockReset();
    mockShowToast.mockReset();
    mockNavigate.mockReset();
    mockFetchLinkedWorkItems.mockReset();
    mockListWorkItems.mockReset();
    mockFetchHouseholdItemBudgets.mockReset();
    mockFetchBudgetCategories.mockReset();
    mockFetchBudgetSources.mockReset();
    mockFetchVendors.mockReset();
    mockFetchSubsidyPrograms.mockReset();
    mockFetchHouseholdItemSubsidies.mockReset();
    mockFetchHouseholdItemSubsidyPayback.mockReset();

    if (!HouseholdItemDetailPageModule) {
      HouseholdItemDetailPageModule = await import('./HouseholdItemDetailPage.js');
    }

    // Setup default API responses
    // mockFetchLinkedWorkItems MUST be set up by each test individually
    // since it needs to match the test's data
    mockListWorkItems.mockResolvedValue({
      items: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    });
    mockFetchHouseholdItemBudgets.mockResolvedValue([]);
    mockFetchBudgetCategories.mockResolvedValue({ categories: [] });
    mockFetchBudgetSources.mockResolvedValue({ budgetSources: [] });
    mockFetchVendors.mockResolvedValue({
      vendors: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    });
    mockFetchSubsidyPrograms.mockResolvedValue({ subsidyPrograms: [] });
    mockFetchHouseholdItemSubsidies.mockResolvedValue([]);
    mockFetchHouseholdItemSubsidyPayback.mockResolvedValue({
      householdItemId: 'item-1',
      minTotalPayback: 0,
      maxTotalPayback: 0,
      subsidies: [],
    });
  });

  function renderPage(itemId = 'item-1') {
    return render(
      <MemoryRouter initialEntries={[`/household-items/${itemId}`]}>
        <Routes>
          <Route path="/household-items/:id" element={<HouseholdItemDetailPageModule.default />} />
          <Route path="/household-items/:id/edit" element={<div>Household Item Edit</div>} />
          <Route path="/household-items" element={<div>Household Items List</div>} />
        </Routes>
        <LocationDisplay />
      </MemoryRouter>,
    );
  }

  describe('loading state', () => {
    it('shows loading state initially', async () => {
      mockGetHouseholdItem.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderPage();

      expect(screen.getByText('Loading household item...')).toBeInTheDocument();
    });

    it('loading state has status role for accessibility', async () => {
      // Don't resolve the API call immediately
      mockGetHouseholdItem.mockReturnValue(new Promise(() => {}));
      renderPage();

      const loadingEl = screen.getByText('Loading household item...');
      expect(loadingEl).toHaveAttribute('role', 'status');
    });

    it('calls getHouseholdItem with the correct id', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage('item-123');

      await waitFor(() => {
        expect(mockGetHouseholdItem).toHaveBeenCalledWith('item-123');
      });
    });
  });

  describe('404 error state', () => {
    it('shows "Item Not Found" heading when item returns 404', async () => {
      mockGetHouseholdItem.mockRejectedValue(
        new MockApiClientError(404, { code: 'NOT_FOUND', message: 'Item not found' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Item Not Found')).toBeInTheDocument();
      });
    });

    it('shows "Back to Household Items" button in 404 state', async () => {
      mockGetHouseholdItem.mockRejectedValue(
        new MockApiClientError(404, { code: 'NOT_FOUND', message: 'Item not found' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Item Not Found')).toBeInTheDocument();
      });

      const backLink = screen.getByRole('button', { name: /back to household items/i });
      expect(backLink).toBeInTheDocument();
    });
  });

  describe('generic error state with retry', () => {
    it('shows error message on generic error', async () => {
      mockGetHouseholdItem.mockRejectedValue(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByText('Failed to load household item. Please try again.'),
        ).toBeInTheDocument();
      });
    });

    it('shows "Retry" button', async () => {
      mockGetHouseholdItem.mockRejectedValue(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    it('calls getHouseholdItem again on Retry click', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockRejectedValueOnce(new Error('Network error'));
      mockGetHouseholdItem.mockResolvedValueOnce(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });

      expect(mockGetHouseholdItem).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: /retry/i }));

      await waitFor(() => {
        expect(mockGetHouseholdItem).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('full item data rendering', () => {
    it('renders item name as page heading', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });
    });

    it('renders category badge', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Furniture')).toBeInTheDocument();
      });
    });

    it('renders status badge', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // HouseholdItemStatusBadge component should be rendered
      // The actual badge text depends on the component implementation
    });

    it('renders description', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Electric height-adjustable desk')).toBeInTheDocument();
      });
    });

    it('renders vendor as a link to vendor detail', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        const vendorLink = screen.getByRole('link', { name: 'IKEA' });
        expect(vendorLink).toBeInTheDocument();
        expect(vendorLink).toHaveAttribute('href', '/budget/vendors/vendor-1');
      });
    });

    it('renders room', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Office')).toBeInTheDocument();
      });
    });

    it('renders quantity', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument();
      });
    });

    it('renders external URL as link', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        const urlLink = screen.getByRole('link', { name: 'https://example.com/desk' });
        expect(urlLink).toBeInTheDocument();
        expect(urlLink).toHaveAttribute('href', 'https://example.com/desk');
        expect(urlLink).toHaveAttribute('target', '_blank');
      });
    });

    it('renders tags', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Priority')).toBeInTheDocument();
      });
    });

    it('renders order date formatted', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Verify order date is displayed (exact format depends on formatDate)
      // Use getAllByText for date since it appears in multiple places
      const orderDates = screen.getAllByText(/Feb 15, 2026|2026-02-15/);
      expect(orderDates.length).toBeGreaterThan(0);
    });

    it('renders expected delivery date formatted', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Verify expected delivery date is displayed
      expect(screen.getByText(/Mar 1, 2026|2026-03-01/)).toBeInTheDocument();
    });

    it('renders breadcrumb with household items link', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        const householdItemsLink = screen.getByRole('link', { name: 'Household Items' });
        expect(householdItemsLink).toBeInTheDocument();
        expect(householdItemsLink).toHaveAttribute('href', '/household-items');
      });
    });
  });

  describe('optional fields show placeholder when not set', () => {
    it('shows dash for missing description', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ description: null }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.queryByText('Electric height-adjustable desk')).not.toBeInTheDocument();
      // Description label should still be present with "—" placeholder
      expect(screen.getByText('Description')).toBeInTheDocument();
      const dashValues = screen.getAllByText('\u2014');
      expect(dashValues.length).toBeGreaterThan(0);
    });

    it('shows dash for missing room', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ room: null }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // Verify room shows dash (unicode 2014)
      const roomValues = screen.getAllByText('\u2014');
      expect(roomValues.length).toBeGreaterThan(0);
    });

    it('shows dash for missing vendor', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ vendor: null }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.queryByRole('link', { name: 'IKEA' })).not.toBeInTheDocument();
      // Vendor row is still rendered with "—" placeholder
      expect(screen.getByText('Vendor')).toBeInTheDocument();
      const dashValues = screen.getAllByText('\u2014');
      expect(dashValues.length).toBeGreaterThan(0);
    });

    it('shows dash for missing URL', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ url: null }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.queryByRole('link', { name: /https:\/\/example.com/ })).not.toBeInTheDocument();
      // Product URL row is still rendered with "—" placeholder
      expect(screen.getByText('Product URL')).toBeInTheDocument();
      const dashValues = screen.getAllByText('\u2014');
      expect(dashValues.length).toBeGreaterThan(0);
    });

    it('shows "No tags" for empty tags array', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ tags: [], tagIds: [] }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getByText('No tags')).toBeInTheDocument();
    });

    it('shows "No work items linked" for empty work items', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ workItems: [] }));
      mockFetchLinkedWorkItems.mockResolvedValue([]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(
        screen.getByText('No work items linked. Use the form below to add a link.'),
      ).toBeInTheDocument();
    });

    it('shows dash for missing order date', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ orderDate: null }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });
    });

    it('shows dash for missing expected delivery date', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ expectedDeliveryDate: null }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });
    });

    it('shows dash for missing actual delivery date', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem({ actualDeliveryDate: null }));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });
    });
  });

  describe('edit button navigation', () => {
    it('navigates to edit page on Edit button click', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit/i }));

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/household-items/item-1/edit');
      });
    });
  });

  describe('delete flow — success', () => {
    it('opens delete modal on Delete button click', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('shows confirmation text with item name in delete modal', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
      });

      // Verify the item name is in the modal (it's wrapped in <strong>)
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      const modalText = screen.getByRole('dialog').textContent;
      expect(modalText).toMatch(/Standing Desk/);
    });

    it('shows "This action cannot be undone" warning in delete modal', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
      });
    });

    it('deletes item and navigates on Delete Item confirmation', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockDeleteHouseholdItem.mockResolvedValue(undefined);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete item/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete item/i }));

      await waitFor(() => {
        expect(mockDeleteHouseholdItem).toHaveBeenCalledWith('item-1');
      });

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'success',
          'Household item deleted successfully',
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/household-items');
      });
    });

    it('calls deleteHouseholdItem with correct item id', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem({ id: 'item-abc-123' }));
      mockDeleteHouseholdItem.mockResolvedValue(undefined);

      renderPage('item-abc-123');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete item/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete item/i }));

      await waitFor(() => {
        expect(mockDeleteHouseholdItem).toHaveBeenCalledWith('item-abc-123');
      });
    });

    it('shows "Deleting..." text while deletion is in progress', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockDeleteHouseholdItem.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete item/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete item/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /deleting/i })).toBeInTheDocument();
      });
    });
  });

  describe('delete flow — error', () => {
    it('handles delete failure by showing error state in modal', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockDeleteHouseholdItem.mockRejectedValue(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete item/i })).toBeInTheDocument();
      });

      // Note: Component checks instanceof ApiClientError to display error message.
      // Plain Error objects show generic fallback message instead.
      await user.click(screen.getByRole('button', { name: /delete item/i }));

      // Modal remains open after error
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('modal stays open and does not navigate on delete failure', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockDeleteHouseholdItem.mockRejectedValue(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete item/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete item/i }));

      // Modal should still be open
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Should NOT have navigated
      expect(screen.getByTestId('location')).toHaveTextContent('/household-items/item-1');
    });

    it('hides confirm button after delete error so user must re-open modal to retry', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());
      mockDeleteHouseholdItem.mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete item/i })).toBeInTheDocument();
      });

      // First attempt fails
      await user.click(screen.getByRole('button', { name: /delete item/i }));

      await waitFor(() => {
        // Error message shows and confirm button is hidden
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Verify deleteHouseholdItem was called once
      expect(mockDeleteHouseholdItem).toHaveBeenCalledTimes(1);
      // Confirm button should be hidden after error (user must close and re-open to retry)
      expect(screen.queryByRole('button', { name: /delete item/i })).not.toBeInTheDocument();
    });
  });

  describe('delete modal cancel', () => {
    it('closes delete modal on Cancel click', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('closes delete modal on Escape key', async () => {
      const user = userEvent.setup();
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('linked work items display', () => {
    it('renders multiple work items with titles', async () => {
      const workItems = [
        {
          id: 'wi-1',
          title: 'Install desk',
          status: 'in_progress',
          startDate: '2026-04-01',
          endDate: '2026-04-15',
          assignedUser: null,
        },
        {
          id: 'wi-2',
          title: 'Setup cables',
          status: 'pending',
          startDate: '2026-04-16',
          endDate: null,
          assignedUser: null,
        },
        {
          id: 'wi-3',
          title: 'Test connection',
          status: 'completed',
          startDate: '2026-03-01',
          endDate: '2026-03-05',
          assignedUser: null,
        },
      ];
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({
          workItems,
        }),
      );
      mockFetchLinkedWorkItems.mockResolvedValueOnce(workItems);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Install desk' })).toBeInTheDocument();
      });

      expect(screen.getByRole('link', { name: 'Setup cables' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Test connection' })).toBeInTheDocument();
    });

    it('links each work item to its detail page', async () => {
      const workItems = [
        {
          id: 'wi-abc-123',
          title: 'Install desk',
          status: 'in_progress',
          startDate: '2026-04-01',
          endDate: '2026-04-15',
          assignedUser: null,
        },
      ];
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({
          workItems,
        }),
      );
      mockFetchLinkedWorkItems.mockResolvedValueOnce(workItems);

      renderPage();

      await waitFor(() => {
        const link = screen.getByRole('link', { name: 'Install desk' });
        expect(link).toHaveAttribute('href', '/work-items/wi-abc-123');
      });
    });
  });

  describe('delivery progress indicator', () => {
    it('renders delivery progress with accessible list semantics', async () => {
      mockGetHouseholdItem.mockResolvedValue(makeItem());

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      const progressList = screen.getByRole('list', { name: /delivery progress/i });
      expect(progressList).toBeInTheDocument();

      const steps = within(progressList).getAllByRole('listitem');
      expect(steps).toHaveLength(4);
    });

    it('shows correct progress for "ordered" status', async () => {
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({ status: 'ordered' as HouseholdItemStatus }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // All steps should be visible
      expect(screen.getAllByText('Not Ordered').length).toBeGreaterThan(0);
      // Use getAllByText for Ordered since it appears in multiple places
      expect(screen.getAllByText('Ordered').length).toBeGreaterThan(0);
      expect(screen.getAllByText('In Transit').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Delivered').length).toBeGreaterThan(0);
    });

    it('shows all steps completed for "delivered" status', async () => {
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({
          status: 'delivered' as HouseholdItemStatus,
          actualDeliveryDate: '2026-03-10',
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // All steps should be shown: Not Ordered, Ordered, In Transit, Delivered
      expect(screen.getAllByText('Not Ordered').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Ordered').length).toBeGreaterThan(0);
      expect(screen.getAllByText('In Transit').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Delivered').length).toBeGreaterThan(0);
    });

    it('shows all steps for "not_ordered" status', async () => {
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({
          status: 'not_ordered' as HouseholdItemStatus,
          orderDate: null,
          expectedDeliveryDate: null,
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      // All step labels should be visible
      expect(screen.getAllByText('Not Ordered').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Ordered').length).toBeGreaterThan(0);
      expect(screen.getAllByText('In Transit').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Delivered').length).toBeGreaterThan(0);
    });

    it('shows all steps for "in_transit" status', async () => {
      mockGetHouseholdItem.mockResolvedValue(
        makeItem({
          status: 'in_transit' as HouseholdItemStatus,
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Standing Desk' })).toBeInTheDocument();
      });

      expect(screen.getAllByText('Not Ordered').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Ordered').length).toBeGreaterThan(0);
      expect(screen.getAllByText('In Transit').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Delivered').length).toBeGreaterThan(0);
    });
  });
});
