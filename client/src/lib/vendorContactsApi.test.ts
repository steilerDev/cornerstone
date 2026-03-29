import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  listVendorContacts,
  createVendorContact,
  updateVendorContact,
  deleteVendorContact,
} from './vendorContactsApi.js';
import type {
  VendorContactListResponse,
  VendorContactResponse,
  VendorContact,
} from '@cornerstone/shared';

const makeContact = (overrides?: Partial<VendorContact>): VendorContact => ({
  id: 'contact-1',
  vendorId: 'vendor-1',
  firstName: 'John',
  lastName: 'Smith',
  name: 'John Smith',
  role: 'Sales',
  phone: '+1-555-0100',
  email: 'john@plumbing.com',
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('vendorContactsApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('listVendorContacts', () => {
    it('sends GET request to /api/vendors/:vendorId/contacts', async () => {
      const mockResponse: VendorContactListResponse = { contacts: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listVendorContacts('vendor-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/vendors/vendor-1/contacts', expect.any(Object));
    });

    it('returns the contacts list from the response', async () => {
      const contact = makeContact();
      const mockResponse: VendorContactListResponse = { contacts: [contact] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await listVendorContacts('vendor-1');

      expect(result.contacts).toHaveLength(1);
      expect(result.contacts[0].id).toBe('contact-1');
      expect(result.contacts[0].name).toBe('John Smith');
    });

    it('returns empty contacts array when vendor has no contacts', async () => {
      const mockResponse: VendorContactListResponse = { contacts: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await listVendorContacts('vendor-1');

      expect(result.contacts).toEqual([]);
    });

    it('uses the vendorId in the URL path', async () => {
      const mockResponse: VendorContactListResponse = { contacts: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listVendorContacts('vendor-abc-123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vendors/vendor-abc-123/contacts',
        expect.any(Object),
      );
    });

    it('throws error when vendor not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Vendor not found' } }),
      } as Response);

      await expect(listVendorContacts('nonexistent')).rejects.toThrow();
    });

    it('throws error when response is not OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(listVendorContacts('vendor-1')).rejects.toThrow();
    });
  });

  describe('createVendorContact', () => {
    it('sends POST request to /api/vendors/:vendorId/contacts with data', async () => {
      const contact = makeContact();
      const mockResponse: VendorContactResponse = { contact };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const requestData = { firstName: 'John', lastName: 'Smith', role: 'Sales' };
      await createVendorContact('vendor-1', requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vendors/vendor-1/contacts',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('returns the created contact from the response envelope', async () => {
      const contact = makeContact({ id: 'contact-new', firstName: 'Jane', name: 'Jane Smith' });
      const mockResponse: VendorContactResponse = { contact };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const result = await createVendorContact('vendor-1', {
        firstName: 'Jane',
        lastName: 'Smith',
      });

      expect(result).toEqual(contact);
      expect(result.id).toBe('contact-new');
    });

    it('creates a contact with all optional fields', async () => {
      const contact = makeContact({
        phone: '+49-555-0200',
        email: 'jane@electrical.com',
        notes: 'Primary contact',
      });
      const mockResponse: VendorContactResponse = { contact };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const requestData = {
        firstName: 'John',
        phone: '+49-555-0200',
        email: 'jane@electrical.com',
        notes: 'Primary contact',
      };
      const result = await createVendorContact('vendor-1', requestData);

      expect(result.email).toBe('jane@electrical.com');
      expect(result.notes).toBe('Primary contact');
    });

    it('throws error when validation fails (400)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'At least one name field is required' },
        }),
      } as Response);

      await expect(createVendorContact('vendor-1', {})).rejects.toThrow();
    });
  });

  describe('updateVendorContact', () => {
    it('sends PATCH request to /api/vendors/:vendorId/contacts/:contactId', async () => {
      const contact = makeContact({ role: 'Manager' });
      const mockResponse: VendorContactResponse = { contact };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const updateData = { role: 'Manager' };
      await updateVendorContact('vendor-1', 'contact-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vendors/vendor-1/contacts/contact-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('returns the updated contact from the response envelope', async () => {
      const contact = makeContact({ phone: '+1-555-9999', email: 'updated@email.com' });
      const mockResponse: VendorContactResponse = { contact };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await updateVendorContact('vendor-1', 'contact-1', {
        phone: '+1-555-9999',
      });

      expect(result).toEqual(contact);
      expect(result.phone).toBe('+1-555-9999');
    });

    it('throws error when contact not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Contact not found' } }),
      } as Response);

      await expect(
        updateVendorContact('vendor-1', 'nonexistent', { role: 'Manager' }),
      ).rejects.toThrow();
    });
  });

  describe('deleteVendorContact', () => {
    it('sends DELETE request to /api/vendors/:vendorId/contacts/:contactId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await deleteVendorContact('vendor-1', 'contact-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vendors/vendor-1/contacts/contact-1',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('returns void on successful delete', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      const result = await deleteVendorContact('vendor-1', 'contact-1');

      expect(result).toBeUndefined();
    });

    it('throws error when contact not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Contact not found' } }),
      } as Response);

      await expect(deleteVendorContact('vendor-1', 'nonexistent')).rejects.toThrow();
    });

    it('throws error when delete fails (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Delete failed' } }),
      } as Response);

      await expect(deleteVendorContact('vendor-1', 'contact-1')).rejects.toThrow();
    });
  });
});
