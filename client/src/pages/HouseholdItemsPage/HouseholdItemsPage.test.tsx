/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as UseAreasTypes from '../../hooks/useAreas.js';
import type {
  HouseholdItemListResponse,
  HouseholdItemSummary,
  AreaResponse,
  CreateAreaRequest,
  UpdateAreaRequest,
} from '@cornerstone/shared';

const mockListHouseholdItems = jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>();
const mockDeleteHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.deleteHouseholdItem>();
const mockGetHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.getHouseholdItem>();
const mockCreateHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.createHouseholdItem>();
const mockUpdateHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.updateHouseholdItem>();
const mockUseAreas = jest.fn<typeof UseAreasTypes.useAreas>();

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

jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: jest.fn(() => new Promise(() => {})), // Never resolves
}));

// Mock useAreas hook — HouseholdItemsPage uses useAreas to populate AreaPicker
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: mockUseAreas,
}));

// Mock AreaPicker — renders as a simple <select> so we can trigger onChange reliably
jest.unstable_mockModule('../../components/AreaPicker/AreaPicker.js', () => ({
  AreaPicker: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (val: string) => void;
    nullable?: boolean;
    areas: AreaResponse[];
    specialOptions?: { id: string; label: string }[];
  }) => (
    <select data-testid="area-picker" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All Areas</option>
      <option value="area-abc">Kitchen</option>
    </select>
  ),
}));

jest.unstable_mockModule('../../hooks/useKeyboardShortcuts.js', () => ({
  useKeyboardShortcuts: jest.fn(),
}));

jest.unstable_mockModule('../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js', () => ({
  KeyboardShortcutsHelp: () => null,
}));

// ─── Mock: formatters — provides useFormatters() hook ────────────────────────

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  const fmtDate = (d: string | null | undefined, fallback = '—') => {
    if (!d) return fallback;
    const [year, month, day] = d.slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return fallback;
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  const fmtTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  const fmtDateTime = (ts: string | null | undefined, fallback = '—') => ts ?? fallback;
  return {
    formatCurrency: fmtCurrency,
    formatDate: fmtDate,
    formatTime: fmtTime,
    formatDateTime: fmtDateTime,
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatCurrency: fmtCurrency,
      formatDate: fmtDate,
      formatTime: fmtTime,
      formatDateTime: fmtDateTime,
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

describe('HouseholdItemsPage', () => {
  let HouseholdItemsPage: React.ComponentType;

  // Sample data factory
  function createMockItem(overrides: Partial<HouseholdItemSummary> = {}): HouseholdItemSummary {
    return {
      id: 'hi-1',
      name: 'Test Item',
      description: null,
      category: 'furniture',
      status: 'planned',
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
      budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
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
      status: 'arrived',
      vendor: { id: 'vendor-1', name: 'Furniture Plus', trade: null },
      area: null,
      totalPlannedAmount: 200,
      targetDeliveryDate: '2026-01-10',
    }),
    createMockItem({
      id: 'hi-2',
      name: 'Dining chair',
      category: 'furniture',
      status: 'purchased',
      vendor: { id: 'vendor-1', name: 'Furniture Plus', trade: null },
      area: null,
      totalPlannedAmount: 150,
      targetDeliveryDate: '2026-01-15',
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
    mockUseAreas.mockReset();

    // Set default mock responses (tests can override with mockResolvedValueOnce)
    mockListHouseholdItems.mockResolvedValue(listResponse);

    // Default useAreas mock — returns empty areas list (sufficient for most tests)
    mockUseAreas.mockReturnValue({
      areas: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      createArea: jest.fn() as unknown as (data: CreateAreaRequest) => Promise<AreaResponse | null>,
      updateArea: jest.fn() as unknown as (id: string, data: UpdateAreaRequest) => Promise<AreaResponse | null>,
      deleteArea: jest.fn() as unknown as (id: string) => Promise<boolean>,
    });
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/project/household-items']}>
        <HouseholdItemsPage />
      </MemoryRouter>,
    );
  }

  function renderPageWithUrl(url: string) {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <HouseholdItemsPage />
      </MemoryRouter>,
    );
  }

  describe('Page structure and states', () => {
    it('renders page heading', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^project$/i, level: 1 })).toBeInTheDocument();
      });
    });

    it('renders "New Household Item" button in header', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        const buttons = screen.getAllByRole('button', { name: /new household item/i });
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

    it.skip('renders room filter input — room removed in migration 0028 (replaced by area)', () => {
      // room column dropped from household_items in migration 0028.
      // Area-based filtering will be added when area_id display is implemented.
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

    it('filter controls are always visible without a toggle button', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        // Verify no filter toggle button exists
        expect(screen.queryByRole('button', { name: /filters/i })).not.toBeInTheDocument();
      });

      // Verify filter panel is always visible
      await waitFor(() => {
        expect(screen.getByRole('search', { name: /household item filters/i })).toBeInTheDocument();
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

  describe('Accessibility - Filter panel', () => {
    it('filter panel has correct ARIA attributes', async () => {
      renderPage();

      await waitFor(() => {
        const filterPanel = screen.getByRole('search', { name: /household item filters/i });
        expect(filterPanel).toHaveAttribute('id', 'hi-filter-panel');
        expect(filterPanel).toHaveAttribute('role', 'search');
        expect(filterPanel).toHaveAttribute('aria-label', 'Household item filters');
      });
    });
  });

  describe('Accessibility - Delete modal', () => {
    it('delete modal has correct ARIA labelledby', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new household item/i })).toBeInTheDocument();
      });

      // Open the actions menu for the first item by clicking the first menu button
      const menuButtons = screen.getAllByRole('button', { name: /actions for/i });
      await user.click(menuButtons[0]);

      // Get all delete menuitems and click the first visible one
      const deleteMenuItems = screen.getAllByRole('menuitem', { name: /delete/i });
      await user.click(deleteMenuItems[0]);

      // Verify the modal has correct ARIA attributes
      await waitFor(() => {
        const modal = screen.getByRole('dialog');
        expect(modal).toHaveAttribute('aria-modal', 'true');
        expect(modal).toHaveAttribute('aria-labelledby', 'hi-delete-modal-title');
      });

      // Verify the h2 title exists with the correct id
      const modalTitle = screen.getByRole('heading', { name: /delete household item/i });
      expect(modalTitle).toHaveAttribute('id', 'hi-delete-modal-title');
    });

    it('delete modal content div has tabIndex -1', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new household item/i })).toBeInTheDocument();
      });

      // Open the actions menu for the first item
      const menuButtons = screen.getAllByRole('button', { name: /actions for/i });
      await user.click(menuButtons[0]);

      // Click the first Delete menu item to open the modal
      const deleteMenuItems = screen.getAllByRole('menuitem', { name: /delete/i });
      await user.click(deleteMenuItems[0]);

      // Verify the modal content div has tabIndex -1
      await waitFor(() => {
        const modalContent = screen.getByRole('dialog').querySelector('div[tabindex="-1"]');
        expect(modalContent).toBeInTheDocument();
        expect(modalContent).toHaveAttribute('tabindex', '-1');
      });
    });
  });

  describe('Accessibility - Menu keyboard navigation', () => {
    it('ArrowDown focuses next menu item', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new household item/i })).toBeInTheDocument();
      });

      // Open the actions menu for the first item
      const menuButtons = screen.getAllByRole('button', { name: /actions for/i });
      await user.click(menuButtons[0]);

      // Get the menu items
      const menuItems = screen.getAllByRole('menuitem');
      expect(menuItems.length).toBeGreaterThanOrEqual(2);

      // Focus the first menu item
      await user.click(menuItems[0]);

      // Press ArrowDown
      await user.keyboard('{ArrowDown}');

      // Verify focus moved to second menu item
      await waitFor(() => {
        expect(menuItems[1]).toHaveFocus();
      });
    });

    it('Escape closes the menu', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new household item/i })).toBeInTheDocument();
      });

      // Open the actions menu for the first item
      const menuButtons = screen.getAllByRole('button', { name: /actions for/i });
      await user.click(menuButtons[0]);

      // Verify menu is open
      const menus = screen.getAllByRole('menu');
      expect(menus.length).toBeGreaterThan(0);

      // Focus the first menu item and press Escape
      const menuItems = screen.getAllByRole('menuitem');
      await user.click(menuItems[0]);
      await user.keyboard('{Escape}');

      // Verify menu is gone (all menus should be hidden now)
      await waitFor(() => {
        expect(screen.queryAllByRole('menu')).toHaveLength(0);
      });
    });
  });

  describe('Accessibility - Delete modal focus trap', () => {
    it('Escape closes delete modal', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new household item/i })).toBeInTheDocument();
      });

      // Open the actions menu for the first item
      const menuButtons = screen.getAllByRole('button', { name: /actions for/i });
      await user.click(menuButtons[0]);

      // Click the first Delete menu item to open the modal
      const deleteMenuItems = screen.getAllByRole('menuitem', { name: /delete/i });
      await user.click(deleteMenuItems[0]);

      // Verify the modal is open
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Press Escape
      await user.keyboard('{Escape}');

      // Verify modal is gone
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('No Budget Lines toggle', () => {
    it('toggle renders as button with aria-pressed false by default', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        const toggle = screen.getByRole('button', {
          name: /show only household items without budget lines/i,
        });
        expect(toggle).toBeInTheDocument();
        expect(toggle).toHaveAttribute('aria-pressed', 'false');
      });
    });

    it('toggle label text is "No Budget Lines"', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        const toggle = screen.getByRole('button', {
          name: /show only household items without budget lines/i,
        });
        expect(toggle).toHaveTextContent('No Budget Lines');
      });
    });

    it('clicking the toggle sets aria-pressed to true', async () => {
      const user = userEvent.setup();
      mockListHouseholdItems.mockResolvedValueOnce(listResponse);

      renderPage();

      const toggle = await screen.findByRole('button', {
        name: /show only household items without budget lines/i,
      });
      await user.click(toggle);

      await waitFor(() => {
        expect(toggle).toHaveAttribute('aria-pressed', 'true');
      });
    });

    it('toggle has a non-empty aria-label', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        const toggle = screen.getByRole('button', {
          name: /show only household items without budget lines/i,
        });
        const ariaLabel = toggle.getAttribute('aria-label');
        expect(ariaLabel).toBeTruthy();
        expect(ariaLabel!.length).toBeGreaterThan(0);
      });
    });

    it('no checkbox input is used for budget filtering', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        // Filter panel must be visible
        expect(screen.getByRole('search', { name: /household item filters/i })).toBeInTheDocument();
      });

      const filterPanel = screen.getByRole('search', { name: /household item filters/i });
      const checkboxes = filterPanel.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes).toHaveLength(0);
    });
  });

  describe('Accessibility - Screen reader announcements', () => {
    it('renders SR announcement region with aria-live and aria-atomic', async () => {
      renderPage();

      await waitFor(() => {
        const announcement = screen.getByText(/household item.*found/i);
        expect(announcement).toHaveAttribute('aria-live', 'polite');
        expect(announcement).toHaveAttribute('aria-atomic', 'true');
      });
    });

    it('announces item count after loading', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        const announcement = screen.getByText(/2 household items found/i);
        expect(announcement).toBeInTheDocument();
      });
    });

    it('announces singular form when one item found', async () => {
      const singleItemResponse: HouseholdItemListResponse = {
        items: [sampleItems[0]],
        pagination: { page: 1, pageSize: 25, totalPages: 1, totalItems: 1 },
      };
      mockListHouseholdItems.mockResolvedValueOnce(singleItemResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/1 household item found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Area filter', () => {
    it('reads areaId from URL and passes it to listHouseholdItems', async () => {
      mockListHouseholdItems.mockResolvedValue(emptyResponse);

      renderPageWithUrl('/project/household-items?areaId=area-abc');

      await waitFor(() => {
        expect(mockListHouseholdItems).toHaveBeenCalledWith(
          expect.objectContaining({ areaId: 'area-abc' }),
        );
      });
    });

    it('combines areaId with other filters when both are present in URL', async () => {
      mockListHouseholdItems.mockResolvedValue(emptyResponse);

      renderPageWithUrl('/project/household-items?areaId=area-abc&status=planned');

      await waitFor(() => {
        expect(mockListHouseholdItems).toHaveBeenCalledWith(
          expect.objectContaining({ areaId: 'area-abc', status: 'planned' }),
        );
      });
    });

    it('does not pass areaId to listHouseholdItems when no areaId in URL', async () => {
      mockListHouseholdItems.mockResolvedValue(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(mockListHouseholdItems).toHaveBeenCalled();
      });

      const callArgs = mockListHouseholdItems.mock.calls[0][0];
      expect(callArgs?.areaId).toBeUndefined();
    });

    it('renders the AreaPicker filter control', async () => {
      mockListHouseholdItems.mockResolvedValue(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('area-picker')).toBeInTheDocument();
      });
    });
  });

  describe('Empty state with area filter active', () => {
    it('shows "no results" empty state when area filter is active and no items match', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(emptyResponse);

      renderPageWithUrl('/project/household-items?areaId=area-abc');

      await waitFor(() => {
        expect(screen.getByText(/no household items match your filters/i)).toBeInTheDocument();
      });
    });

    it('shows "no items yet" empty state when no filters are active and no items exist', async () => {
      mockListHouseholdItems.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/no household items yet/i)).toBeInTheDocument();
      });
    });
  });
});
