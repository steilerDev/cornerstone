/**
 * Vendor Contact types
 * EPIC-17 Story #752: CalDAV/CardDAV DAV integration with vendor contacts.
 */

export interface VendorContact {
  id: string;
  vendorId: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVendorContactRequest {
  name: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface UpdateVendorContactRequest {
  name?: string;
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
