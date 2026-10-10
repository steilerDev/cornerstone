/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation, useNavigationType } from 'react-router-dom';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as HouseholdItemCategoriesApiTypes from '../../lib/householdItemCategoriesApi.js';
import type * as HouseholdItemEditPageTypes from './HouseholdItemEditPage.js';
import type React from 'react';
import { ApiClientError } from '../../lib/apiClient.js';

const mockGetHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.getHouseholdItem>();
const mockUpdateHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.updateHouseholdItem>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchHouseholdItemCategories =
  jest.fn<typeof HouseholdItemCategoriesApiTypes.fetchHouseholdItemCategories>();

// Mock only API modules — do NOT mock react-router-dom (causes OOM)
jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  createHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.createHouseholdItem>(),
  getHouseholdItem: mockGetHouseholdItem,
  updateHouseholdItem: mockUpdateHouseholdItem,
  listHouseholdItems: jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>(),
  deleteHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.deleteHouseholdItem>(),
}));

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: jest.fn(),
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

// HouseholdItemEditPage calls fetchHouseholdItemCategories to populate the category dropdown.
jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchHouseholdItemCategories,
  createHouseholdItemCategory: jest.fn(),
  updateHouseholdItemCategory: jest.fn(),
  deleteHouseholdItemCategory: jest.fn(),
}));

// Mock useToast so HouseholdItemEditPage can render without a ToastProvider wrapper.
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({
    toasts: [],
    showToast: jest.fn(),
    dismissToast: jest.fn(),
  }),
}));

// Helper to capture current location
function LocationDisplay() {
  const location = useLocation();
  const type = useNavigationType();
  return (
    <>
      <div data-testid="location">{location.pathname}</div>
      <div data-testid="location-type">{type}</div>
    </>
  );
}

describe('HouseholdItemEditPage', () => {
  let HouseholdItemEditPageModule: typeof HouseholdItemEditPageTypes;

  const mockVendors = [
    {
      id: 'v-1',
      name: 'IKEA',
      trade: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
      createdBy: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'v-2',
      name: 'Home Depot',
      trade: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
      createdBy: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const mockItem = {
    id: 'hi-001',
    name: 'Kitchen Island',
    description: 'Custom maple island',
    category: 'furniture' as const,
    status: 'purchased' as const,
    vendor: { id: 'v-1', name: 'IKEA', trade: null },
    url: 'https://example.com/island',
    area: null,
    quantity: 1,
    orderDate: '2026-03-01',
    targetDeliveryDate: '2026-04-15',
    actualDeliveryDate: null,
    earliestDeliveryDate: '2026-04-15',
    latestDeliveryDate: '2026-04-20',
    isLate: false,
    budgetLineCount: 0,
    totalPlannedAmount: 0,
    budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    dependencies: [],
    subsidies: [],
  };

  const mockUpdatedItem = {
    ...mockItem,
    name: 'Updated Kitchen Island',
    updatedAt: '2026-02-01T00:00:00Z',
  };

  beforeEach(async () => {
    mockGetHouseholdItem.mockReset();
    mockUpdateHouseholdItem.mockReset();
    mockFetchVendors.mockReset();
    mockFetchHouseholdItemCategories.mockReset();

    if (!HouseholdItemEditPageModule) {
      HouseholdItemEditPageModule = await import('./HouseholdItemEditPage.js');
    }

    mockFetchVendors.mockResolvedValue({
      vendors: mockVendors,
      pagination: { page: 1, pageSize: 100, totalItems: 2, totalPages: 1 },
    });
    mockGetHouseholdItem.mockResolvedValue(mockItem);
    // Use id 'furniture' to match the category value on the test item (category: 'furniture')
    mockFetchHouseholdItemCategories.mockResolvedValue({
      categories: [
        {
          id: 'furniture',
          name: 'Furniture',
          color: '#8B5CF6',
          translationKey: null,
          sortOrder: 0,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'appliances',
          name: 'Appliances',
          color: '#EC4899',
          translationKey: null,
          sortOrder: 1,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  function renderPage(
    itemId = 'hi-001',
    entries: (string | { pathname: string; state?: unknown })[] = [
      `/project/household-items/${itemId}/edit`,
    ],
  ) {
    return render(
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route
            path="/project/household-items/:id/edit"
            element={<HouseholdItemEditPageModule.default />}
          />
          <Route path="/project/household-items/:id" element={<div>Household Item Detail</div>} />
          <Route path="/project/household-items" element={<div>Household Items List</div>} />
        </Routes>
        <LocationDisplay />
      </MemoryRouter>,
    );
  }

  describe('initial render', () => {
    it('shows loading state initially', async () => {
      renderPage();

      expect(screen.getByText('Loading...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });
    });

    it('renders the "Edit purchase" h1 after loading', async () => {
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Edit purchase', level: 1 }),
        ).toBeInTheDocument();
      });
    });

    it('pre-populates form with existing item data', async () => {
      renderPage();

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/^name/i) as HTMLInputElement;
        expect(nameInput.value).toBe('Kitchen Island');
      });

      const categorySelect = screen.getByLabelText(/category/i) as HTMLSelectElement;
      expect(categorySelect.value).toBe('furniture');

      // room field was removed in migration 0028 (areas_trades_rework)
      expect(screen.queryByLabelText(/^room/i)).not.toBeInTheDocument();

      const descriptionInput = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
      expect(descriptionInput.value).toBe('Custom maple island');
    });

    it('pre-populates quantity field with existing item quantity', async () => {
      renderPage();

      await waitFor(() => {
        const quantityInput = screen.getByLabelText(/quantity/i) as HTMLInputElement;
        expect(quantityInput.value).toBe('1');
      });
    });

    it('pre-populates vendor select with existing vendor', async () => {
      renderPage();

      await waitFor(() => {
        const vendorSelect = screen.getByLabelText(/vendor/i) as HTMLSelectElement;
        expect(vendorSelect.value).toBe('v-1');
      });
    });

    // Story #467: Date and status fields moved to inline editing on the Detail page.
    // The edit form should NOT contain these fields.
    it('does NOT render Order Date input', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      expect(screen.queryByLabelText(/order date/i)).not.toBeInTheDocument();
    });

    it('does NOT render Earliest Delivery input', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      expect(screen.queryByLabelText(/earliest delivery/i)).not.toBeInTheDocument();
    });

    it('does NOT render Latest Delivery input', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      expect(screen.queryByLabelText(/latest delivery/i)).not.toBeInTheDocument();
    });

    it('does NOT render Actual Delivery input', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      expect(screen.queryByLabelText(/actual delivery/i)).not.toBeInTheDocument();
    });

    it('does NOT render Purchase Status select', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      expect(screen.queryByLabelText(/purchase status/i)).not.toBeInTheDocument();
    });

    it('still renders core fields: Name, Description, Category, Vendor, URL, Quantity', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/vendor/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/url/i)).toBeInTheDocument();
      // room field was removed in migration 0028 (areas_trades_rework)
      expect(screen.queryByLabelText(/^room/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('navigates to household item detail page on Cancel click', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/project/household-items/hi-001');
      });
    });

    it('has no header back button (the breadcrumb replaces it)', async () => {
      renderPage();

      await screen.findByLabelText(/^name/i);
      expect(screen.queryByRole('button', { name: /back to item/i })).not.toBeInTheDocument();
    });

    it('Cancel replaces this page with the purchase when it was not opened from it', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /cancel/i }));

      expect(screen.getByTestId('location')).toHaveTextContent('/project/household-items/hi-001');
      expect(screen.getByTestId('location-type')).toHaveTextContent('REPLACE');
    });

    it('Cancel goes back in history when the edit page was opened from the purchase', async () => {
      const user = userEvent.setup();
      renderPage('hi-001', [
        '/project/household-items/hi-001',
        {
          pathname: '/project/household-items/hi-001/edit',
          state: { origin: { to: '/project/household-items/hi-001', name: 'Kitchen Island' } },
        },
      ]);

      await user.click(await screen.findByRole('button', { name: /cancel/i }));

      expect(screen.getByTestId('location')).toHaveTextContent(
        /^\/project\/household-items\/hi-001$/,
      );
      expect(screen.getByTestId('location-type')).toHaveTextContent('POP');
    });

    it('Cancel replaces (not goes back) when the origin is some other page', async () => {
      const user = userEvent.setup();
      renderPage('hi-001', [
        '/schedule/calendar',
        {
          pathname: '/project/household-items/hi-001/edit',
          state: { origin: { to: '/schedule/calendar' } },
        },
      ]);

      await user.click(await screen.findByRole('button', { name: /cancel/i }));

      expect(screen.getByTestId('location')).toHaveTextContent(
        /^\/project\/household-items\/hi-001$/,
      );
      expect(screen.getByTestId('location-type')).toHaveTextContent('REPLACE');
    });
  });

  describe('validation', () => {
    it('shows validation error when submitting with empty name', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      // Clear the name field
      const nameInput = screen.getByLabelText(/^name/i);
      await user.clear(nameInput);

      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument();
      });

      expect(mockUpdateHouseholdItem).not.toHaveBeenCalled();
    });

    // Story #467: Date validation moved to inline editing on the Detail page.
    // The edit form no longer has date fields, so this validation no longer applies here.
  });

  describe('form submission', () => {
    it('navigates to household item detail page on successful update', async () => {
      const user = userEvent.setup();
      mockUpdateHouseholdItem.mockResolvedValue(mockUpdatedItem);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/^name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Kitchen Island');

      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/project/household-items/hi-001');
      });

      expect(mockUpdateHouseholdItem).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('location-type')).toHaveTextContent('REPLACE');
    });

    it('Save goes back in history when the edit page was opened from the purchase', async () => {
      const user = userEvent.setup();
      mockUpdateHouseholdItem.mockResolvedValue(mockUpdatedItem);
      renderPage('hi-001', [
        '/project/household-items/hi-001',
        {
          pathname: '/project/household-items/hi-001/edit',
          state: { origin: { to: '/project/household-items/hi-001' } },
        },
      ]);

      await screen.findByLabelText(/^name/i);
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent(
          /^\/project\/household-items\/hi-001$/,
        );
      });
      expect(screen.getByTestId('location-type')).toHaveTextContent('POP');
    });

    it('calls updateHouseholdItem with correct id and data', async () => {
      const user = userEvent.setup();
      mockUpdateHouseholdItem.mockResolvedValue(mockUpdatedItem);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      const nameInput = screen.getByLabelText(/^name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Updated Kitchen Island');

      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(mockUpdateHouseholdItem).toHaveBeenCalledTimes(1);
      });

      expect(mockUpdateHouseholdItem).toHaveBeenCalledWith(
        'hi-001',
        expect.objectContaining({
          name: 'Updated Kitchen Island',
        }),
      );
    });

    it('includes quantity in update submission with pre-populated value', async () => {
      const user = userEvent.setup();
      mockUpdateHouseholdItem.mockResolvedValue(mockUpdatedItem);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument();
      });

      // Just submit with the pre-populated quantity value
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(mockUpdateHouseholdItem).toHaveBeenCalledTimes(1);
      });

      expect(mockUpdateHouseholdItem).toHaveBeenCalledWith(
        'hi-001',
        expect.objectContaining({
          quantity: 1,
        }),
      );
    });

    it('includes user-updated quantity in update submission', async () => {
      const user = userEvent.setup();
      mockUpdateHouseholdItem.mockResolvedValue(mockUpdatedItem);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument();
      });

      const quantityInput = screen.getByLabelText(/quantity/i) as HTMLInputElement;
      // Set the value using fireEvent to bypass the onChange clamping during typing
      fireEvent.change(quantityInput, { target: { value: '3' } });

      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(mockUpdateHouseholdItem).toHaveBeenCalledTimes(1);
      });

      expect(mockUpdateHouseholdItem).toHaveBeenCalledWith(
        'hi-001',
        expect.objectContaining({
          quantity: 3,
        }),
      );
    });

    it('shows error banner on update failure', async () => {
      const user = userEvent.setup();
      mockUpdateHouseholdItem.mockRejectedValue(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByText('Failed to load form data. Please try again.')).toBeInTheDocument();
      });
    });

    // Story #467: Edit form submit payload must NOT contain date or status fields.
    it('PATCH payload contains only core fields — no date or status fields', async () => {
      const user = userEvent.setup();
      mockUpdateHouseholdItem.mockResolvedValue(mockUpdatedItem);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(mockUpdateHouseholdItem).toHaveBeenCalledTimes(1);
      });

      const [, payload] = mockUpdateHouseholdItem.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];

      // Core fields must be present
      expect(payload).toHaveProperty('name');
      expect(payload).toHaveProperty('category');
      expect(payload).toHaveProperty('quantity');

      // Date and status fields must NOT be in the payload
      expect(payload).not.toHaveProperty('orderDate');
      expect(payload).not.toHaveProperty('earliestDeliveryDate');
      expect(payload).not.toHaveProperty('latestDeliveryDate');
      expect(payload).not.toHaveProperty('actualDeliveryDate');
      expect(payload).not.toHaveProperty('status');
    });
  });

  describe('item not found', () => {
    it('shows not found heading when item does not exist', async () => {
      mockGetHouseholdItem.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'Not found' }),
      );

      renderPage('hi-missing');

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Purchase not found', level: 1 }),
        ).toBeInTheDocument();
      });
    });

    it('shows not found message and does not render the form', async () => {
      mockGetHouseholdItem.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'Not found' }),
      );

      renderPage('hi-missing');

      await waitFor(() => {
        expect(
          screen.getByText('The household item you are looking for does not exist.'),
        ).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    });

    it('does NOT show not-found for a plain Error whose message says "404 Not found"', async () => {
      mockGetHouseholdItem.mockRejectedValue(new Error('404 Not found'));

      renderPage('hi-missing');

      await waitFor(() => {
        expect(screen.getByText('Failed to load form data. Please try again.')).toBeInTheDocument();
      });
      expect(screen.queryByRole('heading', { name: 'Purchase not found' })).not.toBeInTheDocument();
    });

    it('does NOT show not-found for a 500 ApiClientError whose message contains "not found"', async () => {
      mockGetHouseholdItem.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Resource not found upstream' }),
      );

      renderPage('hi-missing');

      await waitFor(() => {
        expect(screen.getByText('Failed to load form data. Please try again.')).toBeInTheDocument();
      });
      expect(screen.queryByRole('heading', { name: 'Purchase not found' })).not.toBeInTheDocument();
      expect(screen.queryByText(/not found upstream/)).not.toBeInTheDocument();
    });
  });

  describe('data loading failure (non-404)', () => {
    it('shows generic error banner when data fails to load with non-404 error', async () => {
      mockGetHouseholdItem.mockRejectedValue(new Error('Internal server error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Failed to load form data. Please try again.')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility - Form input ARIA attributes', () => {
    it('name input has aria-required="true"', async () => {
      renderPage();

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/^name/i);
        expect(nameInput).toHaveAttribute('aria-required', 'true');
      });
    });

    it('category select has aria-required="true"', async () => {
      renderPage();

      await waitFor(() => {
        const categorySelect = screen.getByLabelText(/category/i);
        expect(categorySelect).toHaveAttribute('aria-required', 'true');
      });
    });

    // Story #467: Purchase Status field moved to inline editing on the Detail page.
    // The edit form no longer has a status select.

    it('quantity input has aria-required="true"', async () => {
      renderPage();

      await waitFor(() => {
        const quantityInput = screen.getByLabelText(/quantity/i);
        expect(quantityInput).toHaveAttribute('aria-required', 'true');
      });
    });

    it('error element ids use hi-edit prefix', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      // Clear the name field
      const nameInput = screen.getByLabelText(/^name/i);
      await user.clear(nameInput);

      // Submit to trigger validation error
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        const errorElement = screen.getByText('Name is required');
        expect(errorElement).toHaveAttribute('id', 'hi-edit-name-error');
        expect(errorElement).toHaveAttribute('role', 'alert');
      });
    });

    it('name input shows aria-invalid when validation error occurs', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      // Clear the name field
      const nameInput = screen.getByLabelText(/^name/i);
      await user.clear(nameInput);

      // Submit to trigger validation error
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        const nameInputElement = screen.getByLabelText(/^name/i) as HTMLInputElement;
        expect(nameInputElement).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('name input has aria-describedby pointing to error element', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      // Clear the name field
      const nameInput = screen.getByLabelText(/^name/i);
      await user.clear(nameInput);

      // Submit to trigger validation error
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        const nameInputElement = screen.getByLabelText(/^name/i);
        expect(nameInputElement).toHaveAttribute('aria-describedby', 'hi-edit-name-error');
      });
    });
  });

  // ── Page identity (#2202) ──────────────────────────────────────────────────

  describe('page identity (#2202)', () => {
    const h1s = () => screen.queryAllByRole('heading', { level: 1 });

    it('shows one h1 and the tab title "Edit purchase \u00B7 Purchases"', async () => {
      renderPage();

      await screen.findByLabelText(/^name/i);
      expect(h1s()).toHaveLength(1);
      await waitFor(() =>
        expect(document.title).toBe('Edit purchase \u00B7 Purchases \u00B7 Cornerstone'),
      );
    });

    it('shows the h1 while loading, with only the Purchases parent in the trail', async () => {
      mockGetHouseholdItem.mockReturnValue(new Promise(() => {}));
      renderPage();

      expect(screen.getByRole('heading', { name: 'Edit purchase', level: 1 })).toBeVisible();
      expect(h1s()).toHaveLength(1);
      const nav = screen.getByRole('navigation', { name: 'You are here' });
      expect(within(nav).getAllByRole('link')).toHaveLength(1);
      expect(within(nav).getByRole('link', { name: /Purchases/ })).toBeVisible();
    });

    it('trails Purchases then the loaded purchase name', async () => {
      renderPage();

      await screen.findByLabelText(/^name/i);
      const nav = screen.getByRole('navigation', { name: 'You are here' });
      const links = within(nav).getAllByRole('link');
      expect(links.map((a) => (a.textContent ?? '').replace('\u2039', ''))).toEqual([
        'Purchases',
        'Kitchen Island',
      ]);
      expect(links[1]).toHaveAttribute('href', '/project/household-items/hi-001');
    });

    it('uses "Untitled purchase" in the trail for a blank stored name', async () => {
      mockGetHouseholdItem.mockResolvedValue({ ...mockItem, name: '  ' });
      renderPage();

      await screen.findByLabelText(/^name/i);
      expect(
        within(screen.getByRole('navigation', { name: 'You are here' })).getByRole('link', {
          name: /Untitled purchase/,
        }),
      ).toBeVisible();
    });

    it('shows one "Purchase not found" h1, the tab title and the breadcrumb on 404', async () => {
      mockGetHouseholdItem.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'Not found' }),
      );

      renderPage('hi-missing');

      expect(
        await screen.findByRole('heading', { name: 'Purchase not found', level: 1 }),
      ).toBeVisible();
      expect(h1s()).toHaveLength(1);
      expect(screen.getByRole('navigation', { name: 'You are here' })).toBeVisible();
      await waitFor(() =>
        expect(document.title).toBe('Purchase not found \u00B7 Purchases \u00B7 Cornerstone'),
      );
    });

    it('offers no Back when opened from the purchase itself (the nearest parent)', async () => {
      renderPage('hi-001', [
        {
          pathname: '/project/household-items/hi-001/edit',
          state: { origin: { to: '/project/household-items/hi-001', name: 'Kitchen Island' } },
        },
      ]);

      await screen.findByLabelText(/^name/i);
      expect(screen.queryByTestId('breadcrumbs-back')).not.toBeInTheDocument();
    });
  });
});
