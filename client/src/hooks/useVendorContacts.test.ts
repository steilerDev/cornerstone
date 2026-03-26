import { renderHook, act, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';

const mockListVendorContacts = jest.fn<() => Promise<unknown>>();
const mockCreateVendorContact = jest.fn<() => Promise<unknown>>();
const mockUpdateVendorContact = jest.fn<() => Promise<unknown>>();
const mockDeleteVendorContact = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('../lib/vendorContactsApi.js', () => ({
  listVendorContacts: mockListVendorContacts,
  createVendorContact: mockCreateVendorContact,
  updateVendorContact: mockUpdateVendorContact,
  deleteVendorContact: mockDeleteVendorContact,
}));

class MockApiClientError extends Error {
  statusCode: number;
  error: { code: string; message?: string };
  constructor(statusCode: number, error: { code: string; message?: string }) {
    super(error.message ?? 'API Error');
    this.statusCode = statusCode;
    this.error = error;
  }
}

jest.unstable_mockModule('../lib/apiClient.js', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  put: jest.fn(),
  setBaseUrl: jest.fn(),
  getBaseUrl: jest.fn().mockReturnValue('/api'),
  ApiClientError: MockApiClientError,
}));

import type * as UseVendorContactsModule from './useVendorContacts.js';

let useVendorContacts: (typeof UseVendorContactsModule)['useVendorContacts'];

const makeContact = (id = 'contact-1', name = 'John Smith') => ({
  id,
  vendorId: 'vendor-1',
  firstName: 'John',
  lastName: 'Smith',
  name,
  role: 'Sales',
  phone: '+1-555-0100',
  email: 'john@vendor.com',
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(async () => {
  ({ useVendorContacts } =
    (await import('./useVendorContacts.js')) as typeof UseVendorContactsModule);
  mockListVendorContacts.mockReset();
  mockCreateVendorContact.mockReset();
  mockUpdateVendorContact.mockReset();
  mockDeleteVendorContact.mockReset();

  // Default: returns empty list
  mockListVendorContacts.mockResolvedValue({ contacts: [] });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useVendorContacts', () => {
  it('starts with isLoading=true before fetch completes when vendorId is provided', () => {
    mockListVendorContacts.mockImplementationOnce(() => new Promise(() => {}));

    const { result } = renderHook(() => useVendorContacts('vendor-1'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.contacts).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('skips fetch and sets isLoading=false immediately when vendorId is empty', async () => {
    const { result } = renderHook(() => useVendorContacts(''));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.contacts).toEqual([]);
    expect(mockListVendorContacts).not.toHaveBeenCalled();
  });

  it('fetches contacts on mount and stores results', async () => {
    const contacts = [makeContact('c1', 'John Smith'), makeContact('c2', 'Jane Doe')];
    mockListVendorContacts.mockResolvedValueOnce({ contacts });

    const { result } = renderHook(() => useVendorContacts('vendor-1'));

    await waitFor(() => expect(result.current.contacts).toEqual(contacts));
    expect(mockListVendorContacts).toHaveBeenCalledWith('vendor-1');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('passes the vendorId to the list function', async () => {
    mockListVendorContacts.mockResolvedValueOnce({ contacts: [] });

    const { result } = renderHook(() => useVendorContacts('vendor-abc-123'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockListVendorContacts).toHaveBeenCalledWith('vendor-abc-123');
  });

  it('sets error message on ApiClientError; contacts stays empty', async () => {
    mockListVendorContacts.mockRejectedValueOnce(
      new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server unavailable' }),
    );

    const { result } = renderHook(() => useVendorContacts('vendor-1'));

    await waitFor(() => expect(result.current.error).toBe('Server unavailable'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.contacts).toEqual([]);
  });

  it('sets generic error message on unknown error', async () => {
    mockListVendorContacts.mockRejectedValueOnce(new Error('Connection refused'));

    const { result } = renderHook(() => useVendorContacts('vendor-1'));

    await waitFor(() =>
      expect(result.current.error).toBe('Failed to load contacts. Please try again.'),
    );
    expect(result.current.isLoading).toBe(false);
  });

  describe('refresh()', () => {
    it('triggers a new fetch when called', async () => {
      mockListVendorContacts.mockResolvedValue({ contacts: [] });

      const { result } = renderHook(() => useVendorContacts('vendor-1'));

      await waitFor(() => expect(mockListVendorContacts).toHaveBeenCalledTimes(1));

      const callsBefore = mockListVendorContacts.mock.calls.length;

      act(() => {
        result.current.refresh();
      });

      await waitFor(() =>
        expect(mockListVendorContacts.mock.calls.length).toBeGreaterThan(callsBefore),
      );
    });

    it('fetches fresh data after refresh', async () => {
      mockListVendorContacts.mockResolvedValueOnce({ contacts: [] });

      const { result } = renderHook(() => useVendorContacts('vendor-1'));
      await waitFor(() => expect(mockListVendorContacts).toHaveBeenCalledTimes(1));

      const newContacts = [makeContact('c1', 'New Contact')];
      mockListVendorContacts.mockResolvedValueOnce({ contacts: newContacts });

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => expect(result.current.contacts).toEqual(newContacts));
    });
  });

  describe('addContact()', () => {
    it('calls createVendorContact with the correct vendorId and data', async () => {
      const newContact = makeContact('c-new', 'Jane Doe');
      mockCreateVendorContact.mockResolvedValueOnce(newContact);
      mockListVendorContacts.mockResolvedValue({ contacts: [] });

      const { result } = renderHook(() => useVendorContacts('vendor-1'));
      await waitFor(() => expect(mockListVendorContacts).toHaveBeenCalledTimes(1));

      const contactData = { firstName: 'Jane', lastName: 'Doe', role: 'Manager' };
      await act(async () => {
        await result.current.addContact(contactData);
      });

      expect(mockCreateVendorContact).toHaveBeenCalledWith('vendor-1', contactData);
    });

    it('optimistically prepends the new contact to the list', async () => {
      const existingContact = makeContact('c1', 'Existing Contact');
      mockListVendorContacts.mockResolvedValueOnce({ contacts: [existingContact] });

      const newContact = makeContact('c-new', 'Jane Doe');
      mockCreateVendorContact.mockResolvedValueOnce(newContact);
      // After the refresh triggered by addContact
      mockListVendorContacts.mockResolvedValue({ contacts: [newContact, existingContact] });

      const { result } = renderHook(() => useVendorContacts('vendor-1'));
      await waitFor(() => expect(result.current.contacts).toHaveLength(1));

      await act(async () => {
        await result.current.addContact({ firstName: 'Jane', lastName: 'Doe' });
      });

      // After optimistic update + refresh, new contact should be present
      await waitFor(() => expect(result.current.contacts.some((c) => c.id === 'c-new')).toBe(true));
    });

    it('sets error and re-throws on ApiClientError', async () => {
      mockListVendorContacts.mockResolvedValue({ contacts: [] });
      mockCreateVendorContact.mockRejectedValueOnce(
        new MockApiClientError(400, { code: 'VALIDATION_ERROR', message: 'Name required' }),
      );

      const { result } = renderHook(() => useVendorContacts('vendor-1'));
      await waitFor(() => expect(mockListVendorContacts).toHaveBeenCalledTimes(1));

      let thrownError: unknown;
      await act(async () => {
        try {
          await result.current.addContact({});
        } catch (err) {
          thrownError = err;
        }
      });

      expect(thrownError).toBeInstanceOf(Error);
      expect(result.current.error).toBe('Name required');
    });

    it('sets generic error and re-throws on unknown error', async () => {
      mockListVendorContacts.mockResolvedValue({ contacts: [] });
      mockCreateVendorContact.mockRejectedValueOnce(new Error('Network failure'));

      const { result } = renderHook(() => useVendorContacts('vendor-1'));
      await waitFor(() => expect(mockListVendorContacts).toHaveBeenCalledTimes(1));

      let thrownError: unknown;
      await act(async () => {
        try {
          await result.current.addContact({ firstName: 'Test' });
        } catch (err) {
          thrownError = err;
        }
      });

      expect(thrownError).toBeInstanceOf(Error);
      expect(result.current.error).toBe('Failed to create contact. Please try again.');
    });
  });

  describe('editContact()', () => {
    it('calls updateVendorContact with the correct ids and data', async () => {
      const contact = makeContact('c1', 'John Smith');
      mockListVendorContacts.mockResolvedValueOnce({ contacts: [contact] });

      const updatedContact = { ...contact, role: 'Manager' };
      mockUpdateVendorContact.mockResolvedValueOnce(updatedContact);
      mockListVendorContacts.mockResolvedValue({ contacts: [updatedContact] });

      const { result } = renderHook(() => useVendorContacts('vendor-1'));
      await waitFor(() => expect(result.current.contacts).toHaveLength(1));

      await act(async () => {
        await result.current.editContact('c1', { role: 'Manager' });
      });

      expect(mockUpdateVendorContact).toHaveBeenCalledWith('vendor-1', 'c1', { role: 'Manager' });
    });

    it('optimistically updates the contact in the list', async () => {
      const contact = makeContact('c1', 'John Smith');
      mockListVendorContacts.mockResolvedValueOnce({ contacts: [contact] });

      const updatedContact = { ...contact, role: 'Director' };
      mockUpdateVendorContact.mockResolvedValueOnce(updatedContact);
      mockListVendorContacts.mockResolvedValue({ contacts: [updatedContact] });

      const { result } = renderHook(() => useVendorContacts('vendor-1'));
      await waitFor(() => expect(result.current.contacts).toHaveLength(1));

      await act(async () => {
        await result.current.editContact('c1', { role: 'Director' });
      });

      await waitFor(() => {
        const c = result.current.contacts.find((c) => c.id === 'c1');
        expect(c?.role).toBe('Director');
      });
    });

    it('sets error and re-throws on ApiClientError', async () => {
      mockListVendorContacts.mockResolvedValue({ contacts: [] });
      mockUpdateVendorContact.mockRejectedValueOnce(
        new MockApiClientError(404, { code: 'NOT_FOUND', message: 'Contact not found' }),
      );

      const { result } = renderHook(() => useVendorContacts('vendor-1'));
      await waitFor(() => expect(mockListVendorContacts).toHaveBeenCalledTimes(1));

      let thrownError: unknown;
      await act(async () => {
        try {
          await result.current.editContact('nonexistent', { role: 'Manager' });
        } catch (err) {
          thrownError = err;
        }
      });

      expect(thrownError).toBeInstanceOf(Error);
      expect(result.current.error).toBe('Contact not found');
    });

    it('sets generic error and re-throws on unknown error', async () => {
      mockListVendorContacts.mockResolvedValue({ contacts: [] });
      mockUpdateVendorContact.mockRejectedValueOnce(new Error('Network failure'));

      const { result } = renderHook(() => useVendorContacts('vendor-1'));
      await waitFor(() => expect(mockListVendorContacts).toHaveBeenCalledTimes(1));

      let thrownError: unknown;
      await act(async () => {
        try {
          await result.current.editContact('c1', { role: 'Manager' });
        } catch (err) {
          thrownError = err;
        }
      });

      expect(thrownError).toBeInstanceOf(Error);
      expect(result.current.error).toBe('Failed to update contact. Please try again.');
    });
  });

  describe('removeContact()', () => {
    it('calls deleteVendorContact with the correct ids', async () => {
      const contact = makeContact('c1', 'John Smith');
      mockListVendorContacts.mockResolvedValueOnce({ contacts: [contact] });
      mockDeleteVendorContact.mockResolvedValueOnce(undefined);
      mockListVendorContacts.mockResolvedValue({ contacts: [] });

      const { result } = renderHook(() => useVendorContacts('vendor-1'));
      await waitFor(() => expect(result.current.contacts).toHaveLength(1));

      await act(async () => {
        await result.current.removeContact('c1');
      });

      expect(mockDeleteVendorContact).toHaveBeenCalledWith('vendor-1', 'c1');
    });

    it('optimistically removes the contact from the list', async () => {
      const contacts = [makeContact('c1', 'John Smith'), makeContact('c2', 'Jane Doe')];
      mockListVendorContacts.mockResolvedValueOnce({ contacts });
      mockDeleteVendorContact.mockResolvedValueOnce(undefined);
      mockListVendorContacts.mockResolvedValue({ contacts: [contacts[1]] });

      const { result } = renderHook(() => useVendorContacts('vendor-1'));
      await waitFor(() => expect(result.current.contacts).toHaveLength(2));

      await act(async () => {
        await result.current.removeContact('c1');
      });

      // Optimistic removal happens immediately
      await waitFor(() => expect(result.current.contacts.some((c) => c.id === 'c1')).toBe(false));
    });

    it('sets error and re-throws on ApiClientError', async () => {
      mockListVendorContacts.mockResolvedValue({ contacts: [] });
      mockDeleteVendorContact.mockRejectedValueOnce(
        new MockApiClientError(404, { code: 'NOT_FOUND', message: 'Contact not found' }),
      );

      const { result } = renderHook(() => useVendorContacts('vendor-1'));
      await waitFor(() => expect(mockListVendorContacts).toHaveBeenCalledTimes(1));

      let thrownError: unknown;
      await act(async () => {
        try {
          await result.current.removeContact('nonexistent');
        } catch (err) {
          thrownError = err;
        }
      });

      expect(thrownError).toBeInstanceOf(Error);
      expect(result.current.error).toBe('Contact not found');
    });

    it('sets generic error and re-throws on unknown error', async () => {
      mockListVendorContacts.mockResolvedValue({ contacts: [] });
      mockDeleteVendorContact.mockRejectedValueOnce(new Error('Network failure'));

      const { result } = renderHook(() => useVendorContacts('vendor-1'));
      await waitFor(() => expect(mockListVendorContacts).toHaveBeenCalledTimes(1));

      let thrownError: unknown;
      await act(async () => {
        try {
          await result.current.removeContact('c1');
        } catch (err) {
          thrownError = err;
        }
      });

      expect(thrownError).toBeInstanceOf(Error);
      expect(result.current.error).toBe('Failed to delete contact. Please try again.');
    });
  });
});
