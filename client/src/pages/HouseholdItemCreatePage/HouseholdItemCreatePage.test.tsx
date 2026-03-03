/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type * as HouseholdItemsApiTypes from '../../lib/householdItemsApi.js';
import type * as TagsApiTypes from '../../lib/tagsApi.js';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as HouseholdItemCreatePageTypes from './HouseholdItemCreatePage.js';
import type React from 'react';

const mockCreateHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.createHouseholdItem>();
const mockFetchTags = jest.fn<typeof TagsApiTypes.fetchTags>();
const mockCreateTag = jest.fn<typeof TagsApiTypes.createTag>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();

// Mock only API modules — do NOT mock react-router-dom (causes OOM)
jest.unstable_mockModule('../../lib/householdItemsApi.js', () => ({
  createHouseholdItem: mockCreateHouseholdItem,
  getHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.getHouseholdItem>(),
  updateHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.updateHouseholdItem>(),
  listHouseholdItems: jest.fn<typeof HouseholdItemsApiTypes.listHouseholdItems>(),
  deleteHouseholdItem: jest.fn<typeof HouseholdItemsApiTypes.deleteHouseholdItem>(),
}));

jest.unstable_mockModule('../../lib/tagsApi.js', () => ({
  fetchTags: mockFetchTags,
  createTag: mockCreateTag,
}));

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: jest.fn(),
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

// Mock useToast so HouseholdItemCreatePage can render without a ToastProvider wrapper.
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
  return <div data-testid="location">{location.pathname}</div>;
}

describe('HouseholdItemCreatePage', () => {
  let HouseholdItemCreatePageModule: typeof HouseholdItemCreatePageTypes;

  const mockTags = [
    { id: 'tag-1', name: 'Kitchen', color: '#E57373', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'tag-2', name: 'Priority', color: '#64B5F6', createdAt: '2026-01-01T00:00:00Z' },
  ];

  const mockVendors = [
    {
      id: 'v-1',
      name: 'IKEA',
      specialty: 'Furniture',
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
      specialty: 'General',
      phone: null,
      email: null,
      address: null,
      notes: null,
      createdBy: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const mockCreatedItem = {
    id: 'hi-new',
    name: 'Test Item',
    description: null,
    category: 'other' as const,
    status: 'not_ordered' as const,
    vendor: null,
    url: null,
    room: null,
    quantity: 1,
    orderDate: null,
    expectedDeliveryDate: null,
    actualDeliveryDate: null,
    tagIds: [],
    budgetLineCount: 0,
    totalPlannedAmount: 0,
    budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    tags: [],
    workItems: [],
    subsidies: [],
  };

  beforeEach(async () => {
    mockCreateHouseholdItem.mockReset();
    mockFetchTags.mockReset();
    mockCreateTag.mockReset();
    mockFetchVendors.mockReset();

    if (!HouseholdItemCreatePageModule) {
      HouseholdItemCreatePageModule = await import('./HouseholdItemCreatePage.js');
    }

    mockFetchTags.mockResolvedValue({ tags: mockTags });
    mockFetchVendors.mockResolvedValue({
      vendors: mockVendors,
      pagination: { page: 1, pageSize: 200, totalItems: 2, totalPages: 1 },
    });
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/household-items/new']}>
        <Routes>
          <Route path="/household-items/new" element={<HouseholdItemCreatePageModule.default />} />
          <Route path="/household-items/:id" element={<div>Household Item Detail</div>} />
          <Route path="/household-items" element={<div>Household Items List</div>} />
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

    it('renders form with "New Household Item" heading after loading', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'New Household Item' })).toBeInTheDocument();
      });
    });

    it('renders all form fields after loading', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/purchase status/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/vendor/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^url/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^room/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/order date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/expected delivery/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/actual delivery/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create item/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('status select defaults to "Not Ordered"', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/purchase status/i)).toBeInTheDocument();
      });

      const statusSelect = screen.getByLabelText(/purchase status/i) as HTMLSelectElement;
      expect(statusSelect.value).toBe('not_ordered');
    });

    it('quantity field defaults to 1 on create page', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument();
      });

      const quantityInput = screen.getByLabelText(/quantity/i) as HTMLInputElement;
      expect(quantityInput.value).toBe('1');
    });

    it('renders back button', async () => {
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /back to household items/i }),
        ).toBeInTheDocument();
      });
    });

    it('renders vendor options from fetched data', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/vendor/i)).toBeInTheDocument();
      });

      const vendorSelect = screen.getByLabelText(/vendor/i) as HTMLSelectElement;
      const options = Array.from(vendorSelect.options).map((opt) => opt.textContent);

      expect(options).toContain('No vendor');
      expect(options).toContain('IKEA');
      expect(options).toContain('Home Depot');
    });
  });

  describe('navigation', () => {
    it('navigates to household items list on Cancel click', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/household-items');
      });

      expect(screen.getByTestId('location').textContent).not.toBe('/household-items/new');
    });

    it('navigates to household items list on back button click', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /back to household items/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /back to household items/i }));

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/household-items');
      });
    });
  });

  describe('validation', () => {
    it('shows validation error when submitting with empty name', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create item/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /create item/i }));

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument();
      });

      expect(mockCreateHouseholdItem).not.toHaveBeenCalled();
    });

    it('shows validation error when actual delivery is before order date', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/^name/i), 'Test Item');

      // Set order date after actual delivery date
      const orderDateInput = screen.getByLabelText(/order date/i) as HTMLInputElement;
      const actualDeliveryInput = screen.getByLabelText(/actual delivery/i) as HTMLInputElement;

      await user.type(orderDateInput, '2026-04-01');
      await user.type(actualDeliveryInput, '2026-03-15');

      await user.click(screen.getByRole('button', { name: /create item/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/actual delivery date must be after or equal to order date/i),
        ).toBeInTheDocument();
      });

      expect(mockCreateHouseholdItem).not.toHaveBeenCalled();
    });
  });

  describe('form submission', () => {
    it('navigates to household item detail page on successful creation', async () => {
      const user = userEvent.setup();
      mockCreateHouseholdItem.mockResolvedValue(mockCreatedItem);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/^name/i), 'Test Item');

      await user.click(screen.getByRole('button', { name: /create item/i }));

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/household-items/hi-new');
      });

      expect(mockCreateHouseholdItem).toHaveBeenCalledTimes(1);
    });

    it('calls createHouseholdItem with correct data on submission', async () => {
      const user = userEvent.setup();
      mockCreateHouseholdItem.mockResolvedValue(mockCreatedItem);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/^name/i), 'Kitchen Island');
      await user.type(screen.getByLabelText(/description/i), 'Custom maple island');

      await user.click(screen.getByRole('button', { name: /create item/i }));

      await waitFor(() => {
        expect(mockCreateHouseholdItem).toHaveBeenCalledTimes(1);
      });

      expect(mockCreateHouseholdItem).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Kitchen Island',
          description: 'Custom maple island',
          status: 'not_ordered',
        }),
      );
    });

    it('includes quantity in submission with default value of 1', async () => {
      const user = userEvent.setup();
      mockCreateHouseholdItem.mockResolvedValue(mockCreatedItem);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/^name/i), 'Kitchen Island');

      await user.click(screen.getByRole('button', { name: /create item/i }));

      await waitFor(() => {
        expect(mockCreateHouseholdItem).toHaveBeenCalledTimes(1);
      });

      expect(mockCreateHouseholdItem).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 1,
        }),
      );
    });

    it('includes user-specified quantity in submission', async () => {
      const user = userEvent.setup();
      mockCreateHouseholdItem.mockResolvedValue(mockCreatedItem);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/^name/i), 'Kitchen Island');
      const quantityInput = screen.getByLabelText(/quantity/i) as HTMLInputElement;
      // Set the value using fireEvent to bypass the onChange clamping during typing
      fireEvent.change(quantityInput, { target: { value: '5' } });

      await user.click(screen.getByRole('button', { name: /create item/i }));

      await waitFor(() => {
        expect(mockCreateHouseholdItem).toHaveBeenCalledTimes(1);
      });

      expect(mockCreateHouseholdItem).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 5,
        }),
      );
    });

    it('shows error banner on creation failure', async () => {
      const user = userEvent.setup();
      mockCreateHouseholdItem.mockRejectedValue(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/^name/i), 'Test Item');

      await user.click(screen.getByRole('button', { name: /create item/i }));

      await waitFor(() => {
        expect(
          screen.getByText('Failed to create household item. Please try again.'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('data loading failure', () => {
    it('shows error banner when tags fail to load', async () => {
      mockFetchTags.mockRejectedValue(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Failed to load form data. Please try again.')).toBeInTheDocument();
      });
    });

    it('shows error banner when vendors fail to load', async () => {
      mockFetchVendors.mockRejectedValue(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Failed to load form data. Please try again.')).toBeInTheDocument();
      });
    });
  });
});
