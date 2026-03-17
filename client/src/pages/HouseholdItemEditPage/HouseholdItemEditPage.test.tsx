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
import type * as HouseholdItemEditPageTypes from './HouseholdItemEditPage.js';
import type React from 'react';

const mockGetHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.getHouseholdItem>();
const mockUpdateHouseholdItem = jest.fn<typeof HouseholdItemsApiTypes.updateHouseholdItem>();
const mockFetchTags = jest.fn<typeof TagsApiTypes.fetchTags>();
const mockCreateTag = jest.fn<typeof TagsApiTypes.createTag>();
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
  return <div data-testid="location">{location.pathname}</div>;
}

describe('HouseholdItemEditPage', () => {
  let HouseholdItemEditPageModule: typeof HouseholdItemEditPageTypes;

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

  const mockItem = {
    id: 'hi-001',
    name: 'Kitchen Island',
    description: 'Custom maple island',
    category: 'furniture' as const,
    status: 'purchased' as const,
    vendor: { id: 'v-1', name: 'IKEA', specialty: 'Furniture' },
    url: 'https://example.com/island',
    room: 'Kitchen',
    quantity: 1,
    orderDate: '2026-03-01',
    targetDeliveryDate: '2026-04-15',
    actualDeliveryDate: null,
    earliestDeliveryDate: '2026-04-15',
    latestDeliveryDate: '2026-04-20',
    isLate: false,
    tagIds: ['tag-1'],
    budgetLineCount: 0,
    totalPlannedAmount: 0,
    budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    tags: [{ id: 'tag-1', name: 'Kitchen', color: '#E57373', createdAt: '2026-01-01T00:00:00Z' }],
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
    mockFetchTags.mockReset();
    mockCreateTag.mockReset();
    mockFetchVendors.mockReset();
    mockFetchHouseholdItemCategories.mockReset();

    if (!HouseholdItemEditPageModule) {
      HouseholdItemEditPageModule = await import('./HouseholdItemEditPage.js');
    }

    mockFetchTags.mockResolvedValue({ tags: mockTags });
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
          sortOrder: 0,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'appliances',
          name: 'Appliances',
          color: '#EC4899',
          sortOrder: 1,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  function renderPage(itemId = 'hi-001') {
    return render(
      <MemoryRouter initialEntries={[`/project/household-items/${itemId}/edit`]}>
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

    it('renders "Edit Household Item" heading after loading', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Edit Household Item' })).toBeInTheDocument();
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

      const roomInput = screen.getByLabelText(/^room/i) as HTMLInputElement;
      expect(roomInput.value).toBe('Kitchen');

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

    it('still renders core fields: Name, Description, Category, Vendor, URL, Room, Quantity', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/vendor/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/url/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^room/i)).toBeInTheDocument();
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

    it('navigates to household item detail page on back button click', async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to item/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /back to item/i }));

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/project/household-items/hi-001');
      });
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
      mockGetHouseholdItem.mockRejectedValue(new Error('404 Not found'));

      renderPage('hi-missing');

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Household Item Not Found' }),
        ).toBeInTheDocument();
      });
    });

    it('shows not found message and does not render the form', async () => {
      mockGetHouseholdItem.mockRejectedValue(new Error('404 Not found'));

      renderPage('hi-missing');

      await waitFor(() => {
        expect(
          screen.getByText('The household item you are looking for does not exist.'),
        ).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    });

    it('shows not found for "not found" error message variant', async () => {
      mockGetHouseholdItem.mockRejectedValue(new Error('Not found'));

      renderPage('hi-missing');

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'Household Item Not Found' }),
        ).toBeInTheDocument();
      });
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

    it('shows generic error banner when tags fail to load', async () => {
      mockFetchTags.mockRejectedValue(new Error('Network error'));

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
});
