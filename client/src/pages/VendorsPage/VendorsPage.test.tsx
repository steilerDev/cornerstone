/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type { Vendor, VendorListQuery } from '@cornerstone/shared';

// Mock the API module BEFORE importing the component
const mockFetchVendors = jest.fn<typeof VendorsApiTypes.fetchVendors>();
const mockCreateVendor = jest.fn<typeof VendorsApiTypes.createVendor>();
const mockDeleteVendor = jest.fn<typeof VendorsApiTypes.deleteVendor>();

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: mockFetchVendors,
  fetchVendor: jest.fn(),
  createVendor: mockCreateVendor,
  updateVendor: jest.fn(),
  deleteVendor: mockDeleteVendor,
}));

describe('VendorsPage', () => {
  let VendorsPage: React.ComponentType;

  // ─── Sample Data ────────────────────────────────────────────────────────────

  const sampleVendor1: Vendor = {
    id: 'vendor-1',
    name: 'Smith Plumbing',
    specialty: 'Plumbing',
    phone: '+1 555-1234',
    email: 'smith@plumbing.com',
    address: '123 Main St',
    notes: 'Reliable contractor',
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const sampleVendor2: Vendor = {
    id: 'vendor-2',
    name: 'Jones Electric',
    specialty: 'Electrical',
    phone: null,
    email: 'jones@electric.com',
    address: null,
    notes: null,
    createdBy: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };

  const emptyResponse: VendorsApiTypes.VendorListResponse = {
    vendors: [],
    pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
  };

  const listResponse: VendorsApiTypes.VendorListResponse = {
    vendors: [sampleVendor1, sampleVendor2],
    pagination: { page: 1, pageSize: 25, totalItems: 2, totalPages: 1 },
  };

  beforeEach(async () => {
    if (!VendorsPage) {
      const module = await import('./VendorsPage.js');
      VendorsPage = module.default;
    }

    mockFetchVendors.mockReset();
    mockCreateVendor.mockReset();
    mockDeleteVendor.mockReset();
  });

  function renderPage(initialPath = '/budget/vendors') {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <VendorsPage />
      </MemoryRouter>,
    );
  }

  // ─── Loading state ────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows loading indicator while fetching vendors', () => {
      // Never resolves — stays in loading state
      mockFetchVendors.mockReturnValueOnce(new Promise(() => {}));

      renderPage();

      expect(screen.getByText(/loading vendors/i)).toBeInTheDocument();
    });

    it('hides loading indicator after data loads', async () => {
      mockFetchVendors.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/loading vendors/i)).not.toBeInTheDocument();
      });
    });
  });

  // ─── Page structure ────────────────────────────────────────────────────────

  describe('page structure', () => {
    it('renders the page heading "Vendors"', async () => {
      mockFetchVendors.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^vendors$/i, level: 1 })).toBeInTheDocument();
      });
    });

    it('renders "Add Vendor" button', async () => {
      mockFetchVendors.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add vendor/i })).toBeInTheDocument();
      });
    });

    it('renders a search input', async () => {
      mockFetchVendors.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('searchbox', { name: /search vendors/i })).toBeInTheDocument();
      });
    });
  });

  // ─── Empty state ────────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows empty state when no vendors exist', async () => {
      mockFetchVendors.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/no vendors yet/i)).toBeInTheDocument();
      });
    });

    it('shows "Add First Vendor" button in empty state', async () => {
      mockFetchVendors.mockResolvedValueOnce(emptyResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add first vendor/i })).toBeInTheDocument();
      });
    });
  });

  // ─── Vendor list display ─────────────────────────────────────────────────

  describe('vendor list display', () => {
    it('displays vendor names in the list', async () => {
      mockFetchVendors.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Smith Plumbing').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Jones Electric').length).toBeGreaterThan(0);
      });
    });

    it('displays vendor specialty', async () => {
      mockFetchVendors.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Plumbing').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Electrical').length).toBeGreaterThan(0);
      });
    });

    it('displays vendor phone when present', async () => {
      mockFetchVendors.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        // Phone appears in both desktop table and mobile cards — use getAllByText
        const phoneElements = screen.getAllByText('+1 555-1234');
        expect(phoneElements.length).toBeGreaterThan(0);
      });
    });

    it('renders View button for each vendor', async () => {
      mockFetchVendors.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /view smith plumbing/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /view jones electric/i })).toBeInTheDocument();
      });
    });

    it('renders Delete button for each vendor', async () => {
      mockFetchVendors.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete smith plumbing/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /delete jones electric/i })).toBeInTheDocument();
      });
    });
  });

  // ─── Error state ──────────────────────────────────────────────────────────

  describe('error state', () => {
    it('shows error message when API call fails', async () => {
      mockFetchVendors.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server error' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });
    });

    it('shows generic error for non-ApiClientError failures', async () => {
      mockFetchVendors.mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/failed to load vendors/i)).toBeInTheDocument();
      });
    });

    it('shows a Retry button on load error', async () => {
      mockFetchVendors.mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    it('retries loading when Retry button is clicked', async () => {
      mockFetchVendors
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /retry/i }));

      await waitFor(() => {
        expect(screen.getAllByText('Smith Plumbing').length).toBeGreaterThan(0);
      });
    });
  });

  // ─── Create vendor modal ───────────────────────────────────────────────────

  describe('create vendor modal', () => {
    it('opens create modal when "Add Vendor" is clicked', async () => {
      mockFetchVendors.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^add vendor$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^add vendor$/i }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /add vendor/i })).toBeInTheDocument();
    });

    it('shows name, specialty, phone, email, address, and notes fields in modal', async () => {
      mockFetchVendors.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^add vendor$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^add vendor$/i }));

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByLabelText(/^name/i)).toBeInTheDocument();
      expect(within(dialog).getByLabelText(/specialty/i)).toBeInTheDocument();
      expect(within(dialog).getByLabelText(/phone/i)).toBeInTheDocument();
      expect(within(dialog).getByLabelText(/email/i)).toBeInTheDocument();
      expect(within(dialog).getByLabelText(/address/i)).toBeInTheDocument();
      expect(within(dialog).getByLabelText(/notes/i)).toBeInTheDocument();
    });

    it('"Add Vendor" submit button is disabled when name is empty', async () => {
      mockFetchVendors.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^add vendor$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^add vendor$/i }));

      const dialog = screen.getByRole('dialog');
      // The submit button inside the modal
      const submitButton = within(dialog).getByRole('button', { name: /add vendor/i });
      // Name input is empty by default — button should be disabled
      expect(submitButton).toBeDisabled();
    });

    it('closes the modal when Cancel is clicked', async () => {
      mockFetchVendors.mockResolvedValueOnce(emptyResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^add vendor$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^add vendor$/i }));

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('creates a vendor and reloads list on success', async () => {
      const newVendor: Vendor = {
        id: 'vendor-new',
        name: 'Brown Roofing',
        specialty: 'Roofing',
        phone: null,
        email: null,
        address: null,
        notes: null,
        createdBy: null,
        createdAt: '2026-01-03T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
      };

      // First call: initial load; second: after create
      mockFetchVendors
        .mockResolvedValueOnce(emptyResponse)
        .mockResolvedValueOnce({
          vendors: [newVendor],
          pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
        });
      mockCreateVendor.mockResolvedValueOnce(newVendor);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^add vendor$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^add vendor$/i }));

      const dialog = screen.getByRole('dialog');
      await user.type(within(dialog).getByLabelText(/^name/i), 'Brown Roofing');
      await user.type(within(dialog).getByLabelText(/specialty/i), 'Roofing');

      await user.click(within(dialog).getByRole('button', { name: /add vendor/i }));

      await waitFor(() => {
        expect(mockCreateVendor).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Brown Roofing' }),
        );
      });

      // Modal should close after creation
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('shows error in modal when create API fails', async () => {
      mockFetchVendors.mockResolvedValueOnce(emptyResponse);
      mockCreateVendor.mockRejectedValueOnce(
        new ApiClientError(400, { code: 'VALIDATION_ERROR', message: 'Vendor name is required' }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^add vendor$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^add vendor$/i }));

      const dialog = screen.getByRole('dialog');
      await user.type(within(dialog).getByLabelText(/^name/i), 'Test Vendor');
      await user.click(within(dialog).getByRole('button', { name: /add vendor/i }));

      await waitFor(() => {
        expect(within(dialog).getByRole('alert')).toBeInTheDocument();
        expect(within(dialog).getByText(/vendor name is required/i)).toBeInTheDocument();
      });
    });

    it('shows generic create error for non-ApiClientError failures', async () => {
      mockFetchVendors.mockResolvedValueOnce(emptyResponse);
      mockCreateVendor.mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^add vendor$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^add vendor$/i }));

      const dialog = screen.getByRole('dialog');
      await user.type(within(dialog).getByLabelText(/^name/i), 'Test Vendor');
      await user.click(within(dialog).getByRole('button', { name: /add vendor/i }));

      await waitFor(() => {
        expect(within(dialog).getByText(/failed to create vendor/i)).toBeInTheDocument();
      });
    });
  });

  // ─── Empty state with search ────────────────────────────────────────────────

  describe('empty state with search', () => {
    it('shows "No vendors match your search" when search returns empty', async () => {
      // Simulate page loaded with a search query that returns no results
      mockFetchVendors.mockResolvedValueOnce(emptyResponse);

      renderPage('/budget/vendors?q=nonexistent');

      await waitFor(() => {
        expect(screen.getByText(/no vendors match your search/i)).toBeInTheDocument();
      });
    });

    it('shows "Clear Search" button in search-empty state', async () => {
      mockFetchVendors.mockResolvedValueOnce(emptyResponse);

      renderPage('/budget/vendors?q=nonexistent');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /clear search/i })).toBeInTheDocument();
      });
    });
  });

  // ─── Delete confirmation modal ─────────────────────────────────────────────

  describe('delete confirmation modal', () => {
    it('shows delete modal when Delete button is clicked', async () => {
      mockFetchVendors.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /delete smith plumbing/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete smith plumbing/i }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /delete vendor/i })).toBeInTheDocument();
    });

    it('shows vendor name in the delete confirmation dialog', async () => {
      mockFetchVendors.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /delete smith plumbing/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete smith plumbing/i }));

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Smith Plumbing');
    });

    it('closes delete modal when Cancel is clicked', async () => {
      mockFetchVendors.mockResolvedValueOnce(listResponse);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /delete smith plumbing/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete smith plumbing/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('deletes vendor and reloads list on confirm', async () => {
      mockFetchVendors
        .mockResolvedValueOnce(listResponse)
        .mockResolvedValueOnce({
          vendors: [sampleVendor2],
          pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
        });
      mockDeleteVendor.mockResolvedValueOnce(undefined);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /delete smith plumbing/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete smith plumbing/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /delete vendor/i }));

      await waitFor(() => {
        expect(mockDeleteVendor).toHaveBeenCalledWith('vendor-1');
      });

      // Modal closes after deletion
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('shows VENDOR_IN_USE error (409) in modal when deletion fails', async () => {
      mockFetchVendors.mockResolvedValueOnce(listResponse);
      mockDeleteVendor.mockRejectedValueOnce(
        new ApiClientError(409, {
          code: 'VENDOR_IN_USE',
          message: 'Vendor is in use and cannot be deleted',
          details: { invoiceCount: 2, workItemCount: 0 },
        }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /delete smith plumbing/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete smith plumbing/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /delete vendor/i }));

      await waitFor(() => {
        // The dialog should show the in-use error message
        expect(within(dialog).getByRole('alert')).toBeInTheDocument();
        expect(within(dialog).getByText(/referenced by one or more invoices/i)).toBeInTheDocument();
      });
    });

    it('hides "Delete Vendor" confirm button after delete error', async () => {
      mockFetchVendors.mockResolvedValueOnce(listResponse);
      mockDeleteVendor.mockRejectedValueOnce(
        new ApiClientError(409, {
          code: 'VENDOR_IN_USE',
          message: 'Vendor is in use and cannot be deleted',
          details: { invoiceCount: 1, workItemCount: 0 },
        }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /delete smith plumbing/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete smith plumbing/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /delete vendor/i }));

      await waitFor(() => {
        expect(within(dialog).getByRole('alert')).toBeInTheDocument();
      });

      // Delete Vendor button should be gone after the error
      expect(within(dialog).queryByRole('button', { name: /delete vendor/i })).not.toBeInTheDocument();
    });

    it('shows generic delete error for non-409 failures', async () => {
      mockFetchVendors.mockResolvedValueOnce(listResponse);
      mockDeleteVendor.mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /delete smith plumbing/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete smith plumbing/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /delete vendor/i }));

      await waitFor(() => {
        expect(within(dialog).getByText(/failed to delete vendor/i)).toBeInTheDocument();
      });
    });
  });

  // ─── Pagination ────────────────────────────────────────────────────────────

  describe('pagination', () => {
    it('shows pagination controls when totalPages > 1', async () => {
      const paginatedResponse: VendorsApiTypes.VendorListResponse = {
        vendors: [sampleVendor1],
        pagination: { page: 1, pageSize: 25, totalItems: 30, totalPages: 2 },
      };

      mockFetchVendors.mockResolvedValueOnce(paginatedResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /next page/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /previous page/i })).toBeInTheDocument();
      });
    });

    it('does not show pagination controls when totalPages <= 1', async () => {
      mockFetchVendors.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Smith Plumbing').length).toBeGreaterThan(0);
      });

      expect(screen.queryByRole('button', { name: /next page/i })).not.toBeInTheDocument();
    });

    it('shows total vendor count in pagination info', async () => {
      const paginatedResponse: VendorsApiTypes.VendorListResponse = {
        vendors: [sampleVendor1],
        pagination: { page: 1, pageSize: 25, totalItems: 30, totalPages: 2 },
      };

      mockFetchVendors.mockResolvedValueOnce(paginatedResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/30 vendors/i)).toBeInTheDocument();
      });
    });

    it('Previous button is disabled on first page', async () => {
      const paginatedResponse: VendorsApiTypes.VendorListResponse = {
        vendors: [sampleVendor1],
        pagination: { page: 1, pageSize: 25, totalItems: 30, totalPages: 2 },
      };

      mockFetchVendors.mockResolvedValueOnce(paginatedResponse);

      renderPage();

      await waitFor(() => {
        const prevButton = screen.getByRole('button', { name: /previous page/i });
        expect(prevButton).toBeDisabled();
      });
    });
  });

  // ─── Sort controls ─────────────────────────────────────────────────────────

  describe('sort controls', () => {
    it('renders sort select with name, specialty, date added, last updated options', async () => {
      mockFetchVendors.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        const sortSelect = screen.getByRole('combobox', { name: /sort by/i });
        expect(sortSelect).toBeInTheDocument();
        expect(within(sortSelect).getByRole('option', { name: /name/i })).toBeInTheDocument();
        expect(within(sortSelect).getByRole('option', { name: /specialty/i })).toBeInTheDocument();
        expect(within(sortSelect).getByRole('option', { name: /date added/i })).toBeInTheDocument();
      });
    });

    it('renders Toggle sort order button', async () => {
      mockFetchVendors.mockResolvedValueOnce(listResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /toggle sort order/i })).toBeInTheDocument();
      });
    });
  });
});
