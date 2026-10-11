/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VendorContact } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import enErrors from '../../i18n/en/errors.json';
import enSettings from '../../i18n/en/settings.json';
import type * as VendorContactsSectionModule from './VendorContactsSection.js';

const mockAddContact = jest.fn<(req: unknown) => Promise<void>>();
const mockEditContact = jest.fn<(id: string, req: unknown) => Promise<void>>();
const mockRemoveContact = jest.fn<(id: string) => Promise<void>>();

interface HookState {
  contacts: VendorContact[];
  isLoading: boolean;
  error: string | null;
}
let hookState: HookState;

jest.unstable_mockModule('../../hooks/useVendorContacts.js', () => ({
  useVendorContacts: () => ({
    ...hookState,
    addContact: mockAddContact,
    editContact: mockEditContact,
    removeContact: mockRemoveContact,
  }),
}));

const contactA: VendorContact = {
  id: 'c-1',
  vendorId: 'v-1',
  name: 'Jane Doe',
  firstName: 'Jane',
  lastName: 'Doe',
  role: 'Foreman',
  phone: '555-0100',
  email: 'jane@example.com',
  notes: 'Prefers mornings',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as VendorContact;

const contactB: VendorContact = {
  ...contactA,
  id: 'c-2',
  name: 'Solo',
  firstName: 'Solo',
  lastName: null,
  role: null,
  phone: null,
  email: null,
  notes: null,
} as VendorContact;

describe('VendorContactsSection', () => {
  let VendorContactsSection: typeof VendorContactsSectionModule.VendorContactsSection;

  beforeEach(async () => {
    if (!VendorContactsSection) {
      ({ VendorContactsSection } = await import('./VendorContactsSection.js'));
    }
    mockAddContact.mockReset();
    mockEditContact.mockReset();
    mockRemoveContact.mockReset();
    mockAddContact.mockResolvedValue(undefined);
    mockEditContact.mockResolvedValue(undefined);
    mockRemoveContact.mockResolvedValue(undefined);
    hookState = { contacts: [contactA, contactB], isLoading: false, error: null };
  });

  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  it('shows a loading state', () => {
    hookState = { contacts: [], isLoading: true, error: null };
    render(<VendorContactsSection vendorId="v-1" />);
    expect(screen.getByText(enSettings.vendors.contacts.loading)).toBeInTheDocument();
  });

  it('shows the empty state and opens the create modal from it', async () => {
    hookState = { contacts: [], isLoading: false, error: null };
    const user = userEvent.setup();
    render(<VendorContactsSection vendorId="v-1" />);
    await user.click(screen.getByRole('button', { name: enSettings.vendors.contacts.emptyAction }));
    expect(screen.getByLabelText(enSettings.vendors.contacts.firstName)).toBeInTheDocument();
  });

  it('renders contact details with phone and email links', () => {
    render(<VendorContactsSection vendorId="v-1" />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Foreman')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '555-0100' })).toHaveAttribute('href', 'tel:555-0100');
    expect(screen.getByRole('link', { name: 'jane@example.com' })).toHaveAttribute(
      'href',
      'mailto:jane@example.com',
    );
    expect(screen.getByText('Prefers mornings')).toBeInTheDocument();
  });

  it('renders the hook-level error through the error banner', () => {
    hookState = { contacts: [contactA], isLoading: false, error: 'Hook level error' };
    render(<VendorContactsSection vendorId="v-1" />);
    expect(screen.getByText('Hook level error')).toBeInTheDocument();
  });

  describe('create', () => {
    async function openCreate() {
      const user = userEvent.setup();
      render(<VendorContactsSection vendorId="v-1" />);
      await user.click(
        screen.getByRole('button', { name: enSettings.vendors.contacts.addContact }),
      );
      return user;
    }

    it('requires a first or last name', async () => {
      const user = await openCreate();
      await user.click(
        screen.getByRole('button', { name: enSettings.vendors.contacts.createContactSubmit }),
      );
      expect(screen.getByText(enSettings.vendors.contacts.nameRequired)).toBeInTheDocument();
      expect(mockAddContact).not.toHaveBeenCalled();
    });

    it('submits trimmed values, closes, and announces success', async () => {
      const user = await openCreate();
      await user.type(screen.getByLabelText(enSettings.vendors.contacts.firstName), '  Ann ');
      await user.type(screen.getByLabelText(enSettings.vendors.contacts.role), 'Plumber');
      await user.type(screen.getByLabelText(enSettings.vendors.contacts.phone), '123');
      await user.type(screen.getByLabelText(enSettings.vendors.contacts.email), 'a@b.c');
      await user.type(screen.getByLabelText(enSettings.vendors.contacts.notes), 'n');
      await user.click(
        screen.getByRole('button', { name: enSettings.vendors.contacts.createContactSubmit }),
      );

      await waitFor(() => {
        expect(mockAddContact).toHaveBeenCalledWith({
          firstName: 'Ann',
          lastName: null,
          role: 'Plumber',
          phone: '123',
          email: 'a@b.c',
          notes: 'n',
        });
      });
      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('Contact Ann added');
      });
      expect(
        screen.queryByRole('button', { name: enSettings.vendors.contacts.createContactSubmit }),
      ).not.toBeInTheDocument();
    });

    it('shows the translated error (not the server text) for an ApiClientError', async () => {
      mockAddContact.mockRejectedValue(
        new ApiClientError(400, { code: 'VALIDATION_ERROR', message: 'RAW-SERVER-SENTINEL' }),
      );
      const user = await openCreate();
      await user.type(screen.getByLabelText(enSettings.vendors.contacts.firstName), 'Ann');
      await user.click(
        screen.getByRole('button', { name: enSettings.vendors.contacts.createContactSubmit }),
      );
      expect(await screen.findByText(enErrors.VALIDATION_ERROR)).toBeInTheDocument();
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).not.toBeInTheDocument();
    });

    it('shows the saveError fallback (not the raw message) for a plain Error', async () => {
      mockAddContact.mockRejectedValue(new Error('RAW-LOCAL'));
      const user = await openCreate();
      await user.type(screen.getByLabelText(enSettings.vendors.contacts.firstName), 'Ann');
      await user.click(
        screen.getByRole('button', { name: enSettings.vendors.contacts.createContactSubmit }),
      );
      expect(await screen.findByText(enSettings.vendors.contacts.saveError)).toBeInTheDocument();
      expect(screen.queryByText(/RAW-LOCAL/)).not.toBeInTheDocument();
    });

    it('closes via cancel', async () => {
      const user = await openCreate();
      await user.click(screen.getByRole('button', { name: enSettings.vendors.contacts.cancel }));
      expect(
        screen.queryByRole('button', { name: enSettings.vendors.contacts.createContactSubmit }),
      ).not.toBeInTheDocument();
    });
  });

  describe('edit', () => {
    async function openEdit() {
      const user = userEvent.setup();
      render(<VendorContactsSection vendorId="v-1" />);
      await user.click(
        screen.getByRole('button', { name: `${enSettings.vendors.contacts.editContact} Jane Doe` }),
      );
      return user;
    }

    it('prefills the form and submits the update', async () => {
      const user = await openEdit();
      expect(screen.getByLabelText(enSettings.vendors.contacts.firstName)).toHaveValue('Jane');
      await user.clear(screen.getByLabelText(enSettings.vendors.contacts.role));
      await user.click(
        screen.getByRole('button', { name: enSettings.vendors.contacts.saveChanges }),
      );
      await waitFor(() => {
        expect(mockEditContact).toHaveBeenCalledWith('c-1', {
          firstName: 'Jane',
          lastName: 'Doe',
          role: null,
          phone: '555-0100',
          email: 'jane@example.com',
          notes: 'Prefers mornings',
        });
      });
      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('Contact Jane Doe updated');
      });
    });

    it('requires a name', async () => {
      const user = await openEdit();
      await user.clear(screen.getByLabelText(enSettings.vendors.contacts.firstName));
      await user.clear(screen.getByLabelText(enSettings.vendors.contacts.lastName));
      await user.click(
        screen.getByRole('button', { name: enSettings.vendors.contacts.saveChanges }),
      );
      expect(screen.getByText(enSettings.vendors.contacts.nameRequired)).toBeInTheDocument();
      expect(mockEditContact).not.toHaveBeenCalled();
    });

    it('shows the translated error (not the server text) for an ApiClientError', async () => {
      mockEditContact.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'RAW-SERVER-SENTINEL' }),
      );
      const user = await openEdit();
      await user.click(
        screen.getByRole('button', { name: enSettings.vendors.contacts.saveChanges }),
      );
      expect(await screen.findByText(enErrors.NOT_FOUND)).toBeInTheDocument();
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).not.toBeInTheDocument();
    });

    it('shows the saveError fallback for a plain Error', async () => {
      mockEditContact.mockRejectedValue(new Error('RAW-LOCAL'));
      const user = await openEdit();
      await user.click(
        screen.getByRole('button', { name: enSettings.vendors.contacts.saveChanges }),
      );
      expect(await screen.findByText(enSettings.vendors.contacts.saveError)).toBeInTheDocument();
      expect(screen.queryByText(/RAW-LOCAL/)).not.toBeInTheDocument();
    });

    it('closes via cancel', async () => {
      const user = await openEdit();
      await user.click(screen.getByRole('button', { name: enSettings.vendors.contacts.cancel }));
      expect(
        screen.queryByRole('button', { name: enSettings.vendors.contacts.saveChanges }),
      ).not.toBeInTheDocument();
    });
  });

  describe('delete', () => {
    async function openDelete() {
      const user = userEvent.setup();
      render(<VendorContactsSection vendorId="v-1" />);
      await user.click(
        screen.getByRole('button', {
          name: `${enSettings.vendors.contacts.deleteContact} Jane Doe`,
        }),
      );
      return user;
    }

    it('opens a confirm dialog naming the contact and does not delete yet', async () => {
      await openDelete();
      expect(screen.getByRole('alertdialog', { name: 'Delete Jane Doe?' })).toBeInTheDocument();
      expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
      expect(screen.getByTestId('contact-delete-cancel')).toHaveFocus();
      expect(mockRemoveContact).not.toHaveBeenCalled();
    });

    it('removes the contact after confirmation and announces it', async () => {
      const user = await openDelete();
      await user.click(screen.getByTestId('contact-delete-confirm'));
      await waitFor(() => {
        expect(mockRemoveContact).toHaveBeenCalledWith('c-1');
      });
      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('Contact Jane Doe deleted');
      });
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('does nothing when the dialog is cancelled', async () => {
      const user = await openDelete();
      await user.click(screen.getByTestId('contact-delete-cancel'));
      expect(mockRemoveContact).not.toHaveBeenCalled();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('shows the translated server error inside the dialog and keeps it open', async () => {
      mockRemoveContact.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
      );
      const user = await openDelete();
      await user.click(screen.getByTestId('contact-delete-confirm'));
      const dialog = await screen.findByRole('alertdialog');
      await waitFor(() => expect(dialog).toHaveTextContent(enErrors.INTERNAL_ERROR));
      expect(dialog).not.toHaveTextContent('RAW-SERVER-SENTINEL');
      expect(screen.getByTestId('contact-delete-confirm')).toBeInTheDocument();
    });

    it('hides the action after a 409 so only Cancel remains', async () => {
      mockRemoveContact.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'CONFLICT', message: 'in use' }),
      );
      const user = await openDelete();
      await user.click(screen.getByTestId('contact-delete-confirm'));
      await waitFor(() => expect(screen.queryByTestId('contact-delete-confirm')).toBeNull());
      expect(screen.getByTestId('contact-delete-cancel')).toBeInTheDocument();
    });

    it('shows the generic message for a non-API failure', async () => {
      mockRemoveContact.mockRejectedValueOnce(new Error('network'));
      const user = await openDelete();
      await user.click(screen.getByTestId('contact-delete-confirm'));
      await waitFor(() =>
        expect(screen.getByRole('alertdialog')).toHaveTextContent(
          enSettings.vendors.contacts.deleteError,
        ),
      );
    });

    it('reopening after a failure starts clean (no stale error, action visible)', async () => {
      mockRemoveContact.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'CONFLICT', message: 'in use' }),
      );
      const user = await openDelete();
      await user.click(screen.getByTestId('contact-delete-confirm'));
      await waitFor(() => expect(screen.queryByTestId('contact-delete-confirm')).toBeNull());
      await user.click(screen.getByTestId('contact-delete-cancel'));
      await user.click(
        screen.getByRole('button', {
          name: `${enSettings.vendors.contacts.deleteContact} Jane Doe`,
        }),
      );
      expect(screen.getByTestId('contact-delete-confirm')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
