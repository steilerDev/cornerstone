/**
 * Vendor/contractor types and interfaces.
 * Vendors are companies or individuals involved in the construction project.
 */

import type { UserSummary } from './workItem.js';

/**
 * Vendor entity as returned by the API in list responses.
 */
export interface Vendor {
  id: string;
  name: string;
  specialty: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdBy: UserSummary | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Vendor entity with computed invoice statistics.
 * Used in single-vendor responses (GET by ID, PATCH).
 */
export interface VendorDetail extends Vendor {
  invoiceCount: number;
  outstandingBalance: number;
}

/**
 * Request body for creating a new vendor.
 */
export interface CreateVendorRequest {
  name: string;
  specialty?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

/**
 * Request body for updating a vendor.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateVendorRequest {
  name?: string;
  specialty?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

/**
 * Query parameters for GET /api/vendors.
 */
export interface VendorListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  sortBy?: 'name' | 'specialty' | 'created_at' | 'updated_at';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Response for single-vendor endpoints (POST create wraps in { vendor }).
 */
export interface VendorCreateResponse {
  vendor: Vendor;
}

/**
 * Response for single-vendor detail endpoints (GET by ID, PATCH).
 */
export interface VendorDetailResponse {
  vendor: VendorDetail;
}
