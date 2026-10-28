import { post, patch, del } from './apiClient.js';
import type { UndoableDeleteResponse } from '@cornerstone/shared';
import type {
  VendorContact,
  CreateVendorContactRequest,
  UpdateVendorContactRequest,
  VendorContactResponse,
} from '@cornerstone/shared';

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
export function deleteVendorContact(
  vendorId: string,
  contactId: string,
): Promise<UndoableDeleteResponse> {
  return del<UndoableDeleteResponse>(`/vendors/${vendorId}/contacts/${contactId}`);
}
