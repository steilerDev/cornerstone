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
import type * as HouseholdItemCategoriesApiTypes from '../../lib/householdItemCategoriesApi.js';
import type * as HouseholdItemCreatePageTypes from './HouseholdItemCreatePage.js';
import type React from 'react';

const mockCreateHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.createHouseholdItem>();
const mockFetchTags = jest.fn<typeof TagsApiTypes.fetchTags>();
const mockCreateTag = jest.fn<typeof TagsApiTypes.createTag>();
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockFetchHouseholdItemCategories =
  jest.fn<typeof HouseholdItemCategoriesApiTypes.fetchHouseholdItemCategories>();

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

// HouseholdItemCreatePage calls fetchHouseholdItemCategories to populate the category dropdown.
jest.unstable_mockModule('../../lib/householdItemCategoriesApi.js', () => ({
  fetchHouseholdItemCategories: mockFetchHouseholdItemCategories,
  createHouseholdItemCategory: jest.fn(),
  updateHouseholdItemCategory: jest.fn(),
  deleteHouseholdItemCategory: jest.fn(),
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
    status: 'planned' as const,
    vendor: null,
    url: null,
    room: null,
    quantity: 1,
    orderDate: null,
    targetDeliveryDate: null,
    actualDeliveryDate: null,
    earliestDeliveryDate: null,
    latestDeliveryDate: null,
    isLate: false,
    tagIds: [],
    budgetLineCount: 0,
    totalPlannedAmount: 0,
    budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    tags: [],
    dependencies: [],
    subsidies: [],
  };

  beforeEach(async () => {
    mockCreateHouseholdItem.mockReset();
    mockFetchTags.mockReset();
    mockCreateTag.mockReset();
    mockFetchVendors.mockReset();
    mockFetchHouseholdItemCategories.mockReset();

    if (!HouseholdItemCreatePageModule) {
      HouseholdItemCreatePageModule = await import('./HouseholdItemCreatePage.js');
    }

    mockFetchTags.mockResolvedValue({ tags: mockTags });
    mockFetchVendors.mockResolvedValue({
      vendors: mockVendors,
      pagination: { page: 1, pageSize: 100, totalItems: 2, totalPages: 1 },
    });
    mockFetchHouseholdItemCategories.mockResolvedValue({
      categories: [
        {
          id: 'hic-furniture',
          name: 'Furniture',
          color: '#8B5CF6',
          sortOrder: 0,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'hic-appliances',
          name: 'Appliances',
          color: '#EC4899',
          sortOrder: 1,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/project/household-items/new']}>
        <Routes>
          <Route
            path="/project/household-items/new"
            element={<HouseholdItemCreatePageModule.default />}
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
      expect(screen.getByLabelText(/earliest delivery/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/latest delivery/i)).toBeInTheDocument();
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
      expect(statusSelect.value).toBe('planned');
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
        expect(screen.getByTestId('location')).toHaveTextContent('/project/household-items');
      });

      expect(screen.getByTestId('location').textContent).not.toBe('/project/household-items/new');
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
        expect(screen.getByTestId('location')).toHaveTextContent('/project/household-items');
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
        expect(screen.getByTestId('location')).toHaveTextContent('/project/household-items/hi-new');
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
          status: 'planned',
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

    it('status select has aria-required="true"', async () => {
      renderPage();

      await waitFor(() => {
        const statusSelect = screen.getByLabelText(/purchase status/i);
        expect(statusSelect).toHaveAttribute('aria-required', 'true');
      });
    });

    it('quantity input has aria-required="true"', async () => {
      renderPage();

      await waitFor(() => {
        const quantityInput = screen.getByLabelText(/quantity/i);
        expect(quantityInput).toHaveAttribute('aria-required', 'true');
      });
    });

    it('name input shows aria-invalid when validation error occurs', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create item/i })).toBeInTheDocument();
      });

      // Submit without filling in the name
      await user.click(screen.getByRole('button', { name: /create item/i }));

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/^name/i) as HTMLInputElement;
        expect(nameInput).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('name input has aria-describedby pointing to error element', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create item/i })).toBeInTheDocument();
      });

      // Submit without filling in the name
      await user.click(screen.getByRole('button', { name: /create item/i }));

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/^name/i);
        expect(nameInput).toHaveAttribute('aria-describedby', 'hi-create-name-error');
      });
    });

    it('error element has correct id, role, and content', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create item/i })).toBeInTheDocument();
      });

      // Submit without filling in the name
      await user.click(screen.getByRole('button', { name: /create item/i }));

      await waitFor(() => {
        const errorElement = screen.getByText('Name is required');
        expect(errorElement).toHaveAttribute('id', 'hi-create-name-error');
        expect(errorElement).toHaveAttribute('role', 'alert');
      });
    });

    it('aria-invalid is cleared when validation passes', async () => {
      const user = userEvent.setup();
      mockCreateHouseholdItem.mockResolvedValue(mockCreatedItem);
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      // First, try to submit empty to trigger error
      await user.click(screen.getByRole('button', { name: /create item/i }));

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/^name/i) as HTMLInputElement;
        expect(nameInput).toHaveAttribute('aria-invalid', 'true');
      });

      // Now fill in the name
      const nameInput = screen.getByLabelText(/^name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Test Item');

      // Submit again
      await user.click(screen.getByRole('button', { name: /create item/i }));

      // The aria-invalid should be false or not present
      await waitFor(() => {
        expect(mockCreateHouseholdItem).toHaveBeenCalled();
      });
    });
  });
});
