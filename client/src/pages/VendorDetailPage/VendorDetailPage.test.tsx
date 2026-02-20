/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type { VendorDetail } from '@cornerstone/shared';

// Mock the API module BEFORE importing the component
const mockFetchVendor = jest.fn<typeof VendorsApiTypes.fetchVendor>();
const mockUpdateVendor = jest.fn<typeof VendorsApiTypes.updateVendor>();
const mockDeleteVendor = jest.fn<typeof VendorsApiTypes.deleteVendor>();

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: jest.fn(),
  fetchVendor: mockFetchVendor,
  createVendor: jest.fn(),
  updateVendor: mockUpdateVendor,
  deleteVendor: mockDeleteVendor,
}));

describe('VendorDetailPage', () => {
  let VendorDetailPage: React.ComponentType;

  // ─── Sample Data ─────────────────────────────────────────────────────────

  const sampleVendor: VendorDetail = {
    id: 'vendor-1',
    name: 'Smith Plumbing',
    specialty: 'Plumbing',
    phone: '+1 555-1234',
    email: 'smith@plumbing.com',
    address: '123 Main St, Springfield',
    notes: 'Very reliable contractor.',
    createdBy: { id: 'user-1', displayName: 'Admin User', email: 'admin@example.com' },
    invoiceCount: 3,
    outstandingBalance: 2500.0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const vendorWithNoStats: VendorDetail = {
    id: 'vendor-2',
    name: 'Jones Electric',
    specialty: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
    createdBy: null,
    invoiceCount: 0,
    outstandingBalance: 0,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };

  beforeEach(async () => {
    if (!VendorDetailPage) {
      const module = await import('./VendorDetailPage.js');
      VendorDetailPage = module.default;
    }

    mockFetchVendor.mockReset();
    mockUpdateVendor.mockReset();
    mockDeleteVendor.mockReset();
  });

  /**
   * Renders the VendorDetailPage in a router context with the given vendor ID param.
   */
  function renderPage(vendorId: string = 'vendor-1') {
    return render(
      <MemoryRouter initialEntries={[`/budget/vendors/${vendorId}`]}>
        <Routes>
          <Route path="/budget/vendors/:id" element={<VendorDetailPage />} />
          <Route path="/budget/vendors" element={<div>Vendors List Page</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  // ─── Loading state ─────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows loading indicator while fetching vendor', () => {
      // Never resolves — stays in loading state
      mockFetchVendor.mockReturnValueOnce(new Promise(() => {}));

      renderPage();

      expect(screen.getByText(/loading vendor/i)).toBeInTheDocument();
    });

    it('hides loading indicator after data loads', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/loading vendor/i)).not.toBeInTheDocument();
      });
    });
  });

  // ─── Vendor detail display ─────────────────────────────────────────────────

  describe('vendor detail display', () => {
    it('renders vendor name as page heading', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /smith plumbing/i, level: 1 }),
        ).toBeInTheDocument();
      });
    });

    it('renders vendor specialty', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      renderPage();

      await waitFor(() => {
        // Specialty appears both in the page subtitle and in the info list — use getAllByText
        const specialtyElements = screen.getAllByText('Plumbing');
        expect(specialtyElements.length).toBeGreaterThan(0);
      });
    });

    it('renders stat card for invoice count', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/total invoices/i)).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
      });
    });

    it('renders stat card for outstanding balance', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/outstanding balance/i)).toBeInTheDocument();
        // $2,500.00 formatted via Intl.NumberFormat
        expect(screen.getByText(/\$2,500\.00/)).toBeInTheDocument();
      });
    });

    it('renders $0.00 outstanding balance when vendor has no invoices', async () => {
      mockFetchVendor.mockResolvedValueOnce(vendorWithNoStats);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/\$0\.00/)).toBeInTheDocument();
      });
    });

    it('renders vendor phone as a tel link', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      renderPage();

      await waitFor(() => {
        const phoneLink = screen.getByRole('link', { name: '+1 555-1234' });
        expect(phoneLink).toHaveAttribute('href', 'tel:+1 555-1234');
      });
    });

    it('renders vendor email as a mailto link', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      renderPage();

      await waitFor(() => {
        const emailLink = screen.getByRole('link', { name: 'smith@plumbing.com' });
        expect(emailLink).toHaveAttribute('href', 'mailto:smith@plumbing.com');
      });
    });

    it('renders vendor address', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('123 Main St, Springfield')).toBeInTheDocument();
      });
    });

    it('renders vendor notes', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Very reliable contractor.')).toBeInTheDocument();
      });
    });

    it('renders createdBy display name', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
      });
    });

    it('renders "—" for optional null fields', async () => {
      mockFetchVendor.mockResolvedValueOnce(vendorWithNoStats);

      renderPage();

      await waitFor(() => {
        // Multiple dashes for null specialty, phone, email, address
        const dashes = screen.getAllByText('—');
        expect(dashes.length).toBeGreaterThan(0);
      });
    });

    it('renders Edit and Delete buttons when not in edit mode', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
      });
    });

    it('renders "Vendor Information" section heading', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /vendor information/i })).toBeInTheDocument();
      });
    });

    it('renders breadcrumb back link to Vendors list', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /vendors/i })).toBeInTheDocument();
      });
    });
  });

  // ─── Error state ────────────────────────────────────────────────────────────

  describe('error state', () => {
    it('shows error alert with 404 message when vendor not found', async () => {
      mockFetchVendor.mockRejectedValueOnce(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'Vendor not found' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/vendor not found.*deleted/i)).toBeInTheDocument();
      });
    });

    it('shows API error message for non-404 errors', async () => {
      mockFetchVendor.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Database error' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Database error')).toBeInTheDocument();
      });
    });

    it('shows generic error message for network errors', async () => {
      mockFetchVendor.mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/failed to load vendor/i)).toBeInTheDocument();
      });
    });

    it('shows "Back to Vendors" button on error', async () => {
      mockFetchVendor.mockRejectedValueOnce(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'Vendor not found' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to vendors/i })).toBeInTheDocument();
      });
    });

    it('shows Retry button on error', async () => {
      mockFetchVendor.mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    it('retries loading when Retry is clicked', async () => {
      mockFetchVendor
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce(sampleVendor);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /retry/i }));

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /smith plumbing/i, level: 1 }),
        ).toBeInTheDocument();
      });
    });
  });

  // ─── Edit mode ──────────────────────────────────────────────────────────────

  describe('edit mode', () => {
    it('enters edit mode when Edit button is clicked', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^edit$/i }));

      // "Save Changes" form button should appear
      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    });

    it('pre-fills edit form with current vendor values', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^edit$/i }));

      expect(screen.getByDisplayValue('Smith Plumbing')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Plumbing')).toBeInTheDocument();
      expect(screen.getByDisplayValue('+1 555-1234')).toBeInTheDocument();
      expect(screen.getByDisplayValue('smith@plumbing.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('123 Main St, Springfield')).toBeInTheDocument();
    });

    it('hides Edit and Delete buttons during editing', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^edit$/i }));

      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
    });

    it('cancels edit mode when Cancel is clicked', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^edit$/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      // Back to view mode — Edit button reappears
      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    });

    it('"Save Changes" is disabled when name is cleared', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^edit$/i }));

      // Clear the name field
      const nameInput = screen.getByDisplayValue('Smith Plumbing');
      await user.clear(nameInput);

      expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    });

    it('successfully saves changes and returns to view mode', async () => {
      const updatedVendor: VendorDetail = {
        ...sampleVendor,
        name: 'Smith Plumbing Updated',
        specialty: 'General Plumbing',
      };

      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockUpdateVendor.mockResolvedValueOnce(updatedVendor);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^edit$/i }));

      const nameInput = screen.getByDisplayValue('Smith Plumbing');
      await user.clear(nameInput);
      await user.type(nameInput, 'Smith Plumbing Updated');

      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(mockUpdateVendor).toHaveBeenCalledWith(
          'vendor-1',
          expect.objectContaining({ name: 'Smith Plumbing Updated' }),
        );
      });

      // Back to view mode after save
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      });
    });

    it('updates page heading after successful save', async () => {
      const updatedVendor: VendorDetail = {
        ...sampleVendor,
        name: 'Smith Plumbing Co.',
      };

      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockUpdateVendor.mockResolvedValueOnce(updatedVendor);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^edit$/i }));

      const nameInput = screen.getByDisplayValue('Smith Plumbing');
      await user.clear(nameInput);
      await user.type(nameInput, 'Smith Plumbing Co.');

      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /smith plumbing co\./i, level: 1 }),
        ).toBeInTheDocument();
      });
    });

    it('shows edit error when save API fails', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockUpdateVendor.mockRejectedValueOnce(
        new ApiClientError(400, {
          code: 'VALIDATION_ERROR',
          message: 'Vendor name must be between 1 and 200 characters',
        }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^edit$/i }));

      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(
          screen.getByText(/vendor name must be between 1 and 200 characters/i),
        ).toBeInTheDocument();
      });
    });

    it('shows generic edit error for non-ApiClientError failures', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockUpdateVendor.mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^edit$/i }));

      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByText(/failed to update vendor/i)).toBeInTheDocument();
      });
    });

    it('stays in edit mode after save failure (does not close)', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockUpdateVendor.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server error' }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^edit$/i }));

      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // Should still be in edit mode
      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    });
  });

  // ─── Delete modal ────────────────────────────────────────────────────────────

  describe('delete confirmation modal', () => {
    it('shows delete modal when Delete button is clicked', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^delete$/i }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /delete vendor/i })).toBeInTheDocument();
    });

    it('shows vendor name in the delete modal', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^delete$/i }));

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Smith Plumbing');
    });

    it('closes delete modal when Cancel is clicked', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^delete$/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('navigates to vendors list after successful deletion', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockDeleteVendor.mockResolvedValueOnce(undefined);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^delete$/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /delete vendor/i }));

      await waitFor(() => {
        expect(mockDeleteVendor).toHaveBeenCalledWith('vendor-1');
      });

      // Should navigate to the vendors list (the route stub renders "Vendors List Page")
      await waitFor(() => {
        expect(screen.getByText('Vendors List Page')).toBeInTheDocument();
      });
    });

    it('shows VENDOR_IN_USE error (409) in delete modal', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockDeleteVendor.mockRejectedValueOnce(
        new ApiClientError(409, {
          code: 'VENDOR_IN_USE',
          message: 'Vendor is in use and cannot be deleted',
          details: { invoiceCount: 3, workItemCount: 0 },
        }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^delete$/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /delete vendor/i }));

      await waitFor(() => {
        expect(within(dialog).getByRole('alert')).toBeInTheDocument();
        expect(within(dialog).getByText(/referenced by one or more invoices/i)).toBeInTheDocument();
      });
    });

    it('hides "Delete Vendor" confirm button after 409 error', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
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
        expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^delete$/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /delete vendor/i }));

      await waitFor(() => {
        expect(within(dialog).getByRole('alert')).toBeInTheDocument();
      });

      expect(
        within(dialog).queryByRole('button', { name: /delete vendor/i }),
      ).not.toBeInTheDocument();
    });

    it('shows generic delete error for non-409 failures', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockDeleteVendor.mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /^delete$/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /delete vendor/i }));

      await waitFor(() => {
        expect(within(dialog).getByText(/failed to delete vendor/i)).toBeInTheDocument();
      });
    });
  });

  // ─── Invoices section ─────────────────────────────────────────────────────

  describe('invoices section', () => {
    it('renders "Invoices" section heading', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^invoices$/i })).toBeInTheDocument();
      });
    });

    it('shows "coming soon" placeholder text for invoices', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
      });
    });
  });
});
