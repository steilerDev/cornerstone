/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type { HouseholdItemListResponse, HouseholdItemSummary } from '@cornerstone/shared';

const mockListHouseholdItems = jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>();
const mockDeleteHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.deleteHouseholdItem>();
const mockGetHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.getHouseholdItem>();
const mockCreateHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.createHouseholdItem>();
const mockUpdateHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.updateHouseholdItem>();

// Mock API modules BEFORE importing components
jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  listHouseholdItems: mockListHouseholdItems,
  deleteHouseholdItem: mockDeleteHouseholdItem,
  getHouseholdItem: mockGetHouseholdItem,
  createHouseholdItem: mockCreateHouseholdItem,
  updateHouseholdItem: mockUpdateHouseholdItem,
}));

// Mock vendorsApi to avoid network calls in tests
jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: jest.fn(() => new Promise(() => {})), // Never resolves
}));

jest.unstable_mockModule('../../hooks/useKeyboardShortcuts.js', () => ({
  useKeyboardShortcuts: jest.fn(),
}));

jest.unstable_mockModule('../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js', () => ({
  KeyboardShortcutsHelp: () => null,
}));

describe('HouseholdItemsPage', () => {
  let HouseholdItemsPage: React.ComponentType;

  // Sample data factory
  function createMockItem(overrides: Partial<HouseholdItemSummary> = {}): HouseholdItemSummary {
    return {
      id: 'hi-1',
      name: 'Test Item',
      description: null,
      category: 'furniture',
      status: 'not_ordered',
      vendor: null,
      room: null,
      quantity: 1,
      orderDate: null,
      expectedDeliveryDate: null,
      actualDeliveryDate: null,
      url: null,
      tagIds: [],
      budgetLineCount: 0,
      totalPlannedAmount: 0,
      createdBy: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      ...overrides,
    };
  }

  const sampleItems: HouseholdItemSummary[] = [
    createMockItem({
      id: 'hi-1',
      name: 'Coffee table',
      category: 'furniture',
      status: 'delivered',
      vendor: { id: 'vendor-1', name: 'Furniture Plus', specialty: 'Furniture' },
      room: 'living room',
      totalPlannedAmount: 200,
      expectedDeliveryDate: '2026-01-10',
    }),
    createMockItem({
      id: 'hi-2',
      name: 'Dining chair',
      category: 'furniture',
      status: 'ordered',
      vendor: { id: 'vendor-1', name: 'Furniture Plus', specialty: 'Furniture' },
      room: 'dining room',
      totalPlannedAmount: 150,
      expectedDeliveryDate: '2026-01-15',
    }),
  ];

  const emptyResponse: HouseholdItemListResponse = {
    items: [],
    pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
  };

  const listResponse: HouseholdItemListResponse = {
    items: sampleItems,
    pagination: { page: 1, pageSize: 25, totalPages: 1, totalItems: 2 },
  };

  beforeEach(async () => {
    // Import modules once
    if (!HouseholdItemsPage) {
      const module = await import('./HouseholdItemsPage.js');
      HouseholdItemsPage = module.default;
    }

    // Reset all mocks
    mockListHouseholdItems.mockReset();
    mockDeleteHouseholdItem.mockReset();

    // Set default mock responses (tests can override with mockResolvedValueOnce)
    mockListHouseholdItems.mockResolvedValue(listResponse);
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/household-items']}>
        <HouseholdItemsPage />
      </MemoryRouter>,
    );
  }

  describe('Page structure and states', () => {
    it('renders page heading', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /household items/i, level: 1 }),
        ).toBeInTheDocument();
      });
    });

    it('renders "New Item" button in header', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        const buttons = screen.getAllByRole('button', { name: /new item/i });
        expect(buttons[0]).toBeInTheDocument();
      });
    });

    it('shows loading indicator while fetching data', async () => {
      mockListHouseholdItems.mockReturnValueOnce(new Promise(() => {})); // Never resolves

      renderPage();

      expect(screen.getByText(/loading household items/i)).toBeInTheDocument();
    });

    it('hides loading indicator after data loads', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/loading household items/i)).not.toBeInTheDocument();
      });
    });

    it('shows empty state message when no household items exist', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/no household items yet/i)).toBeInTheDocument();
      });
    });

    it('shows "Create First Item" button in empty state', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create first item/i })).toBeInTheDocument();
      });
    });

    it('displays error message when API call fails', async () => {
      mockListHouseholdItems.mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/failed to load household items/i)).toBeInTheDocument();
      });
    });
  });

  describe('Search and filters', () => {
    it('renders search input', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('searchbox', { name: /search household items/i }),
        ).toBeInTheDocument();
      });
    });

    it('renders category filter dropdown', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/category:/i)).toBeInTheDocument();
      });
    });

    it('renders status filter dropdown', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/status:/i)).toBeInTheDocument();
      });
    });

    it('renders room filter input', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/filter by room/i)).toBeInTheDocument();
      });
    });

    it('renders vendor filter dropdown', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/vendor:/i)).toBeInTheDocument();
      });
    });

    it('renders sort dropdown', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/sort by:/i)).toBeInTheDocument();
      });
    });

    it('renders sort order toggle button', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /toggle sort order/i })).toBeInTheDocument();
      });
    });
  });

  describe('Pagination', () => {
    it('hides pagination when totalPages <= 1', async () => {
      renderPage();

      await waitFor(() => {
        const paginationButtons = screen.queryAllByRole('button', { name: /previous/i });
        // Should not exist when totalPages is 1
        expect(paginationButtons).toHaveLength(0);
      });
    });
  });

  describe('Error handling', () => {
    it('shows error banner when listHouseholdItems fails', async () => {
      const error = new Error('API Error');
      mockListHouseholdItems.mockRejectedValueOnce(error);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });
});
