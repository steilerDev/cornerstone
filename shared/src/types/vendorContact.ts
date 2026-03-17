/**
 * Vendor Contact types
 * EPIC-17 Story #752: CalDAV/CardDAV DAV integration with vendor contacts.
 */

export interface VendorContact {
  id: string;
  vendorId: string;
  firstName: string | null;
  lastName: string | null;
  /** Computed display name: "firstName lastName" or whichever is available. */
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVendorContactRequest {
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface UpdateVendorContactRequest {
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface VendorContactListResponse {
  contacts: VendorContact[];
}

export interface VendorContactResponse {
  contact: VendorContact;
}
