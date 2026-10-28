/**
 * Vendor/contractor types and interfaces.
 * Vendors are companies or individuals involved in the construction project.
 */

import type { UserSummary } from './workItem.js';
import type { VendorContact } from './vendorContact.js';
import type { TradeSummary } from './trade.js';
import type { MoneyOfferTotals } from './money.js';

/**
 * Vendor entity as returned by the API in list responses.
 */
export interface Vendor {
  id: string;
  name: string;
  trade: TradeSummary | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdBy: UserSummary | null;
  createdAt: string;
  updatedAt: string;
}

export const VENDOR_SORT_FIELDS = [
  'name',
  'trade',
  'last_on_site',
  'still_to_pay',
  'created_at',
  'updated_at',
] as const;
export type VendorSortField = (typeof VENDOR_SORT_FIELDS)[number];

/**
 * Vendor row as returned by GET /api/vendors (list only).
 */
export interface VendorListItem extends Vendor {
  /**
   * Phone number of the first contact person (by creation order) that has a non-blank
   * phone; null when none has one. Always sent by GET /api/vendors. Optional in the type
   * so plain `Vendor` objects (pickers, test mocks) stay assignable.
   */
  firstContactPhone?: string | null;
  /** Contact persons of the company. Always sent by GET /api/vendors (#2213). */
  contactCount?: number;
  /** YYYY-MM-DD of the latest saved daily log naming the company; null when none (#2213). */
  lastOnSite?: string | null;
  /** Still to pay (ADR-039). Always sent by GET /api/vendors (#2244). Optional so plain Vendor objects stay assignable. */
  stillToPay?: number;
  /** Paid (ADR-039). Always sent by GET /api/vendors (#2244). */
  paid?: number;
  /** The company's offers. Always sent by GET /api/vendors (#2244). */
  offers?: MoneyOfferTotals;
}

/** ADR-039 figures of one company's offers and invoices (money engine computePayments over its records). */
export interface VendorMoney {
  /** Still to pay: submitted (claimed) and paid never count; pending progress payments do. */
  stillToPay: number;
  /** Paid: paid + submitted, progress payments included, refunds netted. */
  paid: number;
  /** The company's offers (status quotation): count, amount, paid, stillToPay, remainingOnOffer. */
  offers: MoneyOfferTotals;
}

/**
 * Vendor entity with computed money figures, counts and contacts.
 * Used in single-vendor responses (GET by ID, PATCH).
 */
export interface VendorDetail extends Vendor, VendorMoney {
  /** Offers and invoices of the company (all statuses). */
  invoiceCount: number;
  contacts: VendorContact[];
  /** Tasks assigned to the company whose status is not completed. */
  openTaskCount: number;
  /** Distinct dates of saved, manual daily logs naming the company. */
  onSiteDays: number;
  /** Latest of those dates (YYYY-MM-DD); null when none. */
  lastOnSite: string | null;
}

/**
 * Request body for creating a new vendor.
 */
export interface CreateVendorRequest {
  name: string;
  tradeId?: string | null;
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
  tradeId?: string | null;
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
  /** Comma-separated trade ids whose translated name matched `q` client-side (#2213). */
  tradeIds?: string;
  tradeId?: string;
  sortBy?: VendorSortField;
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
