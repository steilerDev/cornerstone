import { get, post, patch, del } from './apiClient.js';
import type {
  VendorContact,
  CreateVendorContactRequest,
  UpdateVendorContactRequest,
  VendorContactListResponse,
  VendorContactResponse,
} from '@cornerstone/shared';

/**
 * Fetches the list of contacts for a vendor.
 */
export function listVendorContacts(vendorId: string): Promise<VendorContactListResponse> {
  return get<VendorContactListResponse>(`/vendors/${vendorId}/contacts`);
}

/**
 * Creates a new contact for a vendor.
 */
export function createVendorContact(
  vendorId: string,
  data: CreateVendorContactRequest,
): Promise<VendorContact> {
  return post<VendorContactResponse>(`/vendors/${vendorId}/contacts`, data).then((r) => r.contact);
}

/**
 * Updates an existing vendor contact.
 */
export function updateVendorContact(
  vendorId: string,
  contactId: string,
  data: UpdateVendorContactRequest,
): Promise<VendorContact> {
  return patch<VendorContactResponse>(`/vendors/${vendorId}/contacts/${contactId}`, data).then(
    (r) => r.contact,
  );
}

/**
 * Deletes a vendor contact.
 */
export function deleteVendorContact(vendorId: string, contactId: string): Promise<void> {
  return del<void>(`/vendors/${vendorId}/contacts/${contactId}`);
}
