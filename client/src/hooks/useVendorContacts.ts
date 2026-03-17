import { useState, useEffect, useCallback } from 'react';
import type { VendorContact, CreateVendorContactRequest, UpdateVendorContactRequest } from '@cornerstone/shared';
import {
  listVendorContacts,
  createVendorContact,
  updateVendorContact,
  deleteVendorContact,
} from '../lib/vendorContactsApi.js';
import { ApiClientError } from '../lib/apiClient.js';

export interface UseVendorContactsResult {
  contacts: VendorContact[];
  isLoading: boolean;
  error: string | null;
  addContact: (data: CreateVendorContactRequest) => Promise<void>;
  editContact: (contactId: string, data: UpdateVendorContactRequest) => Promise<void>;
  removeContact: (contactId: string) => Promise<void>;
  refresh: () => void;
}

/**
 * Hook to manage vendor contacts with loading and error states.
 * Provides CRUD operations for vendor contacts.
 */
export function useVendorContacts(vendorId: string): UseVendorContactsResult {
  const [contacts, setContacts] = useState<VendorContact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const refresh = useCallback(() => {
    setFetchCount((prev) => prev + 1);
  }, []);

  // Load contacts on mount and when refresh is triggered
  useEffect(() => {
    if (!vendorId) {
      setContacts([]);
      setIsLoading(false);
      return;
    }

    const loadContacts = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await listVendorContacts(vendorId);
        setContacts(data.contacts);
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.error.message);
        } else {
          setError('Failed to load contacts. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadContacts();
  }, [vendorId, fetchCount]);

  const addContact = useCallback(
    async (data: CreateVendorContactRequest) => {
      setError(null);

      try {
        const newContact = await createVendorContact(vendorId, data);
        setContacts((prev) => [newContact, ...prev]);
        refresh();
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.error.message);
        } else {
          setError('Failed to create contact. Please try again.');
        }
        throw err;
      }
    },
    [vendorId, refresh],
  );

  const editContact = useCallback(
    async (contactId: string, data: UpdateVendorContactRequest) => {
      setError(null);

      try {
        const updated = await updateVendorContact(vendorId, contactId, data);
        setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        refresh();
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.error.message);
        } else {
          setError('Failed to update contact. Please try again.');
        }
        throw err;
      }
    },
    [vendorId, refresh],
  );

  const removeContact = useCallback(
    async (contactId: string) => {
      setError(null);

      try {
        await deleteVendorContact(vendorId, contactId);
        setContacts((prev) => prev.filter((c) => c.id !== contactId));
        refresh();
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(err.error.message);
        } else {
          setError('Failed to delete contact. Please try again.');
        }
        throw err;
      }
    },
    [vendorId, refresh],
  );

  return {
    contacts,
    isLoading,
    error,
    addContact,
    editContact,
    removeContact,
    refresh,
  };
}
