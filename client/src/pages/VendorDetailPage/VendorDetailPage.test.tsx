/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as VendorsApiTypes from '../../lib/vendorsApi.js';
import type * as InvoicesApiTypes from '../../lib/invoicesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type { VendorDetail, Invoice } from '@cornerstone/shared';

// Mock the vendor API module BEFORE importing the component
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

// Mock the invoices API module BEFORE importing the component
const mockFetchInvoices = jest.fn<typeof InvoicesApiTypes.fetchInvoices>();
const mockCreateInvoice = jest.fn<typeof InvoicesApiTypes.createInvoice>();
const mockUpdateInvoice = jest.fn<typeof InvoicesApiTypes.updateInvoice>();
const mockDeleteInvoice = jest.fn<typeof InvoicesApiTypes.deleteInvoice>();

jest.unstable_mockModule('../../lib/invoicesApi.js', () => ({
  fetchInvoices: mockFetchInvoices,
  createInvoice: mockCreateInvoice,
  updateInvoice: mockUpdateInvoice,
  deleteInvoice: mockDeleteInvoice,
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

  // Sample invoices fixture
  const sampleInvoice: Invoice = {
    id: 'invoice-1',
    vendorId: 'vendor-1',
    invoiceNumber: 'INV-001',
    amount: 1500.0,
    date: '2026-02-01',
    dueDate: '2026-03-01',
    status: 'pending',
    notes: 'First invoice note',
    createdBy: { id: 'user-1', displayName: 'Admin User', email: 'admin@example.com' },
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  };

  const paidInvoice: Invoice = {
    id: 'invoice-2',
    vendorId: 'vendor-1',
    invoiceNumber: 'INV-002',
    amount: 2500.0,
    date: '2026-01-15',
    dueDate: null,
    status: 'paid',
    notes: null,
    createdBy: null,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
  };

  const overdueInvoice: Invoice = {
    id: 'invoice-3',
    vendorId: 'vendor-1',
    invoiceNumber: null,
    amount: 800.0,
    date: '2025-12-01',
    dueDate: '2026-01-01',
    status: 'overdue',
    notes: null,
    createdBy: null,
    createdAt: '2025-12-01T00:00:00.000Z',
    updatedAt: '2025-12-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    if (!VendorDetailPage) {
      const module = await import('./VendorDetailPage.js');
      VendorDetailPage = module.default;
    }

    mockFetchVendor.mockReset();
    mockUpdateVendor.mockReset();
    mockDeleteVendor.mockReset();
    mockFetchInvoices.mockReset();
    mockCreateInvoice.mockReset();
    mockUpdateInvoice.mockReset();
    mockDeleteInvoice.mockReset();

    // Default: invoices load successfully (empty list) unless overridden
    mockFetchInvoices.mockResolvedValue([]);
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

  // ─── Invoices section — loading & structure ──────────────────────────────

  describe('invoices section — structure', () => {
    it('renders "Invoices" section heading', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^invoices$/i })).toBeInTheDocument();
      });
    });

    it('renders "Add Invoice" button', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add invoice/i })).toBeInTheDocument();
      });
    });

    it('calls fetchInvoices with the vendor ID on mount', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      renderPage('vendor-1');

      await waitFor(() => {
        expect(mockFetchInvoices).toHaveBeenCalledWith('vendor-1');
      });
    });
  });

  // ─── Invoices section — empty state ───────────────────────────────────────

  describe('invoices section — empty state', () => {
    it('shows empty state message when vendor has no invoices', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/no invoices yet/i)).toBeInTheDocument();
      });
    });

    it('shows hint to add first invoice when list is empty', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([]);

      renderPage();

      await waitFor(() => {
        // Multiple elements match "add invoice" (button + hint text) — use getAllByText
        const matches = screen.getAllByText(/add invoice/i);
        expect(matches.length).toBeGreaterThan(0);
      });
    });

    it('does not show the outstanding balance badge when list is empty', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([]);

      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/outstanding:/i)).not.toBeInTheDocument();
      });
    });
  });

  // ─── Invoices section — list rendering ───────────────────────────────────

  describe('invoices section — list rendering', () => {
    it('renders invoice amount formatted as currency', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText(/\$1,500\.00/).length).toBeGreaterThan(0);
      });
    });

    it('renders invoice number when set', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText(/INV-001/).length).toBeGreaterThan(0);
      });
    });

    it('renders "—" when invoice has no invoice number (desktop table)', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([overdueInvoice]); // null invoiceNumber

      renderPage();

      await waitFor(() => {
        const dashes = screen.getAllByText('—');
        expect(dashes.length).toBeGreaterThan(0);
      });
    });

    it('renders "No Invoice #" for missing invoice number (mobile card list)', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([overdueInvoice]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/no invoice #/i)).toBeInTheDocument();
      });
    });

    it('renders "Pending" status badge for pending invoice', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
      });
    });

    it('renders "Paid" status badge for paid invoice', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([paidInvoice]);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Paid').length).toBeGreaterThan(0);
      });
    });

    it('renders "Overdue" status badge for overdue invoice', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([overdueInvoice]);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Overdue').length).toBeGreaterThan(0);
      });
    });

    it('renders the outstanding balance badge when invoices exist', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      // pending ($1500) + overdue ($800) = $2300 outstanding
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice, overdueInvoice]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/outstanding:/i)).toBeInTheDocument();
        expect(screen.getByText(/\$2,300\.00/)).toBeInTheDocument();
      });
    });

    it('outstanding balance excludes paid invoices', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      // paid ($2500) is excluded; only pending ($1500) counts
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice, paidInvoice]);

      renderPage();

      await waitFor(() => {
        // Outstanding badge is the <strong> element showing the computed outstanding
        // $1,500.00 appears in both the outstanding badge and the table row (both ok)
        const outstandingElements = screen.getAllByText(/\$1,500\.00/);
        expect(outstandingElements.length).toBeGreaterThan(0);
        // Verify it's NOT $4,000.00 (which would be the total if paid was included)
        expect(screen.queryByText(/\$4,000\.00/)).not.toBeInTheDocument();
      });
    });

    it('renders invoice date in readable format', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]); // date: '2026-02-01'

      renderPage();

      await waitFor(() => {
        // Feb 1, 2026
        expect(screen.getAllByText(/feb.*1.*2026/i).length).toBeGreaterThan(0);
      });
    });

    it('renders "—" for missing due date in table', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([paidInvoice]); // dueDate: null

      renderPage();

      await waitFor(() => {
        const dashes = screen.getAllByText('—');
        expect(dashes.length).toBeGreaterThan(0);
      });
    });

    it('renders multiple invoices', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice, paidInvoice, overdueInvoice]);

      renderPage();

      await waitFor(() => {
        // All 3 amounts should appear (desktop table + mobile cards = 6 occurrences total)
        expect(screen.getAllByText(/\$1,500\.00/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/\$2,500\.00/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/\$800\.00/).length).toBeGreaterThan(0);
      });
    });
  });

  // ─── Invoices section — error state ──────────────────────────────────────

  describe('invoices section — error state', () => {
    it('shows invoices error message when fetchInvoices fails', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Database error' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Database error')).toBeInTheDocument();
      });
    });

    it('shows generic error for non-ApiClientError invoice fetch failures', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockRejectedValueOnce(new Error('Network failure'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/failed to load invoices/i)).toBeInTheDocument();
      });
    });

    it('shows a Retry button on invoice load error', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockRejectedValueOnce(new Error('Network failure'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });
    });

    it('retries fetching invoices when Retry is clicked', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices
        .mockRejectedValueOnce(new Error('Network failure'))
        .mockResolvedValueOnce([sampleInvoice]);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /retry/i }));

      await waitFor(() => {
        expect(screen.getAllByText(/\$1,500\.00/).length).toBeGreaterThan(0);
      });
    });
  });

  // ─── Create invoice modal ─────────────────────────────────────────────────

  describe('create invoice modal', () => {
    it('opens the "Add Invoice" modal when "Add Invoice" button is clicked', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([]);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add invoice/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add invoice/i }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /add invoice/i })).toBeInTheDocument();
    });

    it('shows Amount and Invoice Date fields in create modal', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add invoice/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add invoice/i }));

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByLabelText(/amount/i)).toBeInTheDocument();
      expect(within(dialog).getByLabelText(/invoice date/i)).toBeInTheDocument();
    });

    it('"Add Invoice" submit button is disabled when amount and date are empty', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add invoice/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add invoice/i }));

      const dialog = screen.getByRole('dialog');
      // The submit button is "Add Invoice" inside the form/dialog
      const submitBtn = within(dialog).getByRole('button', { name: /^add invoice$/i });
      expect(submitBtn).toBeDisabled();
    });

    it('closes the create modal when Cancel is clicked', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add invoice/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add invoice/i }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('successfully creates an invoice and closes the modal', async () => {
      const newInvoice: Invoice = { ...sampleInvoice, id: 'invoice-new', amount: 750 };

      mockFetchVendor.mockResolvedValue(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([]);
      mockCreateInvoice.mockResolvedValueOnce(newInvoice);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add invoice/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add invoice/i }));

      const dialog = screen.getByRole('dialog');

      // Fill in amount
      const amountInput = within(dialog).getByLabelText(/amount/i);
      fireEvent.change(amountInput, { target: { value: '750' } });

      // Fill in date
      const dateInput = within(dialog).getByLabelText(/invoice date/i);
      fireEvent.change(dateInput, { target: { value: '2026-02-20' } });

      await user.click(within(dialog).getByRole('button', { name: /^add invoice$/i }));

      await waitFor(() => {
        expect(mockCreateInvoice).toHaveBeenCalledWith(
          'vendor-1',
          expect.objectContaining({ amount: 750, date: '2026-02-20' }),
        );
      });

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('adds the newly created invoice to the list', async () => {
      const newInvoice: Invoice = {
        ...sampleInvoice,
        id: 'invoice-new',
        amount: 4200,
        invoiceNumber: 'INV-999',
      };

      mockFetchVendor.mockResolvedValue(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([]);
      mockCreateInvoice.mockResolvedValueOnce(newInvoice);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add invoice/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add invoice/i }));

      const dialog = screen.getByRole('dialog');
      const amountInput = within(dialog).getByLabelText(/amount/i);
      fireEvent.change(amountInput, { target: { value: '4200' } });

      const dateInput = within(dialog).getByLabelText(/invoice date/i);
      fireEvent.change(dateInput, { target: { value: '2026-02-20' } });

      await user.click(within(dialog).getByRole('button', { name: /^add invoice$/i }));

      await waitFor(() => {
        expect(screen.getAllByText(/INV-999/).length).toBeGreaterThan(0);
      });
    });

    it('shows create error when API call fails', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([]);
      mockCreateInvoice.mockRejectedValueOnce(
        new ApiClientError(400, {
          code: 'VALIDATION_ERROR',
          message: 'Due date must be on or after the invoice date',
        }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add invoice/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add invoice/i }));

      const dialog = screen.getByRole('dialog');
      const amountInput = within(dialog).getByLabelText(/amount/i);
      fireEvent.change(amountInput, { target: { value: '100' } });
      const dateInput = within(dialog).getByLabelText(/invoice date/i);
      fireEvent.change(dateInput, { target: { value: '2026-02-20' } });

      await user.click(within(dialog).getByRole('button', { name: /^add invoice$/i }));

      await waitFor(() => {
        expect(within(dialog).getByRole('alert')).toBeInTheDocument();
        expect(
          within(dialog).getByText(/due date must be on or after the invoice date/i),
        ).toBeInTheDocument();
      });
    });

    it('shows generic create error for non-ApiClientError failures', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([]);
      mockCreateInvoice.mockRejectedValueOnce(new Error('Network failure'));

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add invoice/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add invoice/i }));

      const dialog = screen.getByRole('dialog');
      const amountInput = within(dialog).getByLabelText(/amount/i);
      fireEvent.change(amountInput, { target: { value: '200' } });
      const dateInput = within(dialog).getByLabelText(/invoice date/i);
      fireEvent.change(dateInput, { target: { value: '2026-02-20' } });

      await user.click(within(dialog).getByRole('button', { name: /^add invoice$/i }));

      await waitFor(() => {
        expect(within(dialog).getByText(/failed to create invoice/i)).toBeInTheDocument();
      });
    });

    it('stays open after create failure', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([]);
      mockCreateInvoice.mockRejectedValueOnce(new Error('Network failure'));

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add invoice/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /add invoice/i }));

      const dialog = screen.getByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText(/amount/i), { target: { value: '100' } });
      fireEvent.change(within(dialog).getByLabelText(/invoice date/i), {
        target: { value: '2026-02-20' },
      });

      await user.click(within(dialog).getByRole('button', { name: /^add invoice$/i }));

      await waitFor(() => {
        expect(within(dialog).getByText(/failed to create invoice/i)).toBeInTheDocument();
      });

      // Modal should still be open
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  // ─── Edit invoice modal ───────────────────────────────────────────────────

  describe('edit invoice modal', () => {
    it('opens edit modal when Edit button is clicked on an invoice row', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', {
            name: new RegExp(`edit invoice ${sampleInvoice.invoiceNumber}`, 'i'),
          }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole('button', {
          name: new RegExp(`edit invoice ${sampleInvoice.invoiceNumber}`, 'i'),
        }),
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /edit invoice/i })).toBeInTheDocument();
    });

    it('pre-fills the edit modal with current invoice values', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /edit invoice INV-001/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit invoice INV-001/i }));

      const dialog = screen.getByRole('dialog');
      // Amount field should be pre-filled
      expect(within(dialog).getByDisplayValue('1500')).toBeInTheDocument();
      // Invoice number field
      expect(within(dialog).getByDisplayValue('INV-001')).toBeInTheDocument();
    });

    it('closes edit modal when Cancel is clicked', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /edit invoice INV-001/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit invoice INV-001/i }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('successfully saves invoice edits and closes the modal', async () => {
      const updatedInvoice: Invoice = { ...sampleInvoice, status: 'paid', amount: 1500 };

      mockFetchVendor.mockResolvedValue(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]);
      mockUpdateInvoice.mockResolvedValueOnce(updatedInvoice);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /edit invoice INV-001/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit invoice INV-001/i }));

      const dialog = screen.getByRole('dialog');
      const statusSelect = within(dialog).getByLabelText(/status/i);
      await user.selectOptions(statusSelect, 'paid');

      await user.click(within(dialog).getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(mockUpdateInvoice).toHaveBeenCalledWith(
          'vendor-1',
          'invoice-1',
          expect.objectContaining({ status: 'paid' }),
        );
      });

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('updates the invoice list inline after successful edit', async () => {
      const updatedInvoice: Invoice = { ...sampleInvoice, status: 'paid' };

      mockFetchVendor.mockResolvedValue(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]);
      mockUpdateInvoice.mockResolvedValueOnce(updatedInvoice);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
      });

      await user.click(screen.getByRole('button', { name: /edit invoice INV-001/i }));

      const dialog = screen.getByRole('dialog');
      await user.selectOptions(within(dialog).getByLabelText(/status/i), 'paid');
      await user.click(within(dialog).getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getAllByText('Paid').length).toBeGreaterThan(0);
      });
    });

    it('shows edit invoice error when API call fails', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]);
      mockUpdateInvoice.mockRejectedValueOnce(
        new ApiClientError(400, {
          code: 'VALIDATION_ERROR',
          message: 'Amount must be greater than 0',
        }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit invoice INV-001/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit invoice INV-001/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(within(dialog).getByRole('alert')).toBeInTheDocument();
        expect(within(dialog).getByText(/amount must be greater than 0/i)).toBeInTheDocument();
      });
    });

    it('shows generic edit error for non-ApiClientError', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]);
      mockUpdateInvoice.mockRejectedValueOnce(new Error('Network error'));

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit invoice INV-001/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit invoice INV-001/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(within(dialog).getByText(/failed to update invoice/i)).toBeInTheDocument();
      });
    });
  });

  // ─── Delete invoice modal ─────────────────────────────────────────────────

  describe('delete invoice modal', () => {
    it('opens delete invoice modal when Delete button is clicked on an invoice row', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /delete invoice INV-001/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete invoice INV-001/i }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /delete invoice/i })).toBeInTheDocument();
    });

    it('shows the invoice number in the delete modal', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete invoice INV-001/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete invoice INV-001/i }));

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('INV-001');
    });

    it('shows the invoice amount in the delete modal', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete invoice INV-001/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete invoice INV-001/i }));

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('$1,500.00');
    });

    it('closes the delete invoice modal when Cancel is clicked', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete invoice INV-001/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete invoice INV-001/i }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('successfully deletes an invoice and removes it from the list', async () => {
      mockFetchVendor.mockResolvedValue(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]);
      mockDeleteInvoice.mockResolvedValueOnce(undefined);

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete invoice INV-001/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete invoice INV-001/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /delete invoice/i }));

      await waitFor(() => {
        expect(mockDeleteInvoice).toHaveBeenCalledWith('vendor-1', 'invoice-1');
      });

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // The amount $1,500.00 should no longer be in the list (only appears in the delete modal)
      await waitFor(() => {
        expect(screen.queryByText(/INV-001/)).not.toBeInTheDocument();
      });
    });

    it('shows delete invoice error when API call fails', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]);
      mockDeleteInvoice.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server error' }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete invoice INV-001/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete invoice INV-001/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /delete invoice/i }));

      await waitFor(() => {
        expect(within(dialog).getByRole('alert')).toBeInTheDocument();
        expect(within(dialog).getByText('Server error')).toBeInTheDocument();
      });
    });

    it('shows generic delete error for non-ApiClientError', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]);
      mockDeleteInvoice.mockRejectedValueOnce(new Error('Network failure'));

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete invoice INV-001/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete invoice INV-001/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /delete invoice/i }));

      await waitFor(() => {
        expect(within(dialog).getByText(/failed to delete invoice/i)).toBeInTheDocument();
      });
    });

    it('hides "Delete Invoice" confirm button after delete error', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([sampleInvoice]);
      mockDeleteInvoice.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server error' }),
      );

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete invoice INV-001/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /delete invoice INV-001/i }));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /delete invoice/i }));

      await waitFor(() => {
        expect(within(dialog).getByRole('alert')).toBeInTheDocument();
      });

      // Confirm delete button should be hidden after error
      expect(
        within(dialog).queryByRole('button', { name: /delete invoice/i }),
      ).not.toBeInTheDocument();
    });

    it('shows "this invoice" when invoice has no invoice number', async () => {
      mockFetchVendor.mockResolvedValueOnce(sampleVendor);
      mockFetchInvoices.mockResolvedValueOnce([overdueInvoice]); // invoiceNumber: null

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: new RegExp(`delete invoice ${overdueInvoice.id}`, 'i') }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole('button', {
          name: new RegExp(`delete invoice ${overdueInvoice.id}`, 'i'),
        }),
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('this invoice');
    });
  });
});

