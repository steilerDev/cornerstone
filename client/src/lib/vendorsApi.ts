import { get, post, patch, del } from './apiClient.js';
import type { RequestOptions } from './apiClient.js';
import type {
  Vendor,
  VendorListItem,
  VendorDetail,
  VendorListQuery,
  CreateVendorRequest,
  UpdateVendorRequest,
} from '@cornerstone/shared';

export interface VendorListResponse {
  vendors: VendorListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

/**
 * Fetches a paginated list of vendors with optional search and sorting.
 */
export function fetchVendors(
  params?: VendorListQuery,
  options?: RequestOptions,
): Promise<VendorListResponse> {
  const queryParams = new URLSearchParams();

  if (params?.page !== undefined) {
    queryParams.set('page', params.page.toString());
  }
  if (params?.pageSize !== undefined) {
    queryParams.set('pageSize', params.pageSize.toString());
  }
  if (params?.q) {
    queryParams.set('q', params.q);
  }
  if (params?.tradeId) {
    queryParams.set('tradeId', params.tradeId);
  }
  if (params?.tradeIds) {
    queryParams.set('tradeIds', params.tradeIds);
  }
  if (params?.sortBy) {
    queryParams.set('sortBy', params.sortBy);
  }
  if (params?.sortOrder) {
    queryParams.set('sortOrder', params.sortOrder);
  }

  const queryString = queryParams.toString();
  const path = queryString ? `/vendors?${queryString}` : '/vendors';

  return get<VendorListResponse>(path, options);
}

/** Page size of a company picker's server search (the API allows at most 100). */
export const COMPANY_PICKER_PAGE_SIZE = 50;

/** Server search for a company SearchPicker; '' lists the first page by name. */
export function searchCompanies(query: string, signal?: AbortSignal): Promise<VendorListItem[]> {
  const q = query.trim();
  return fetchVendors(
    { ...(q ? { q } : {}), pageSize: COMPANY_PICKER_PAGE_SIZE },
    signal ? { signal } : undefined,
  ).then((r) => r.vendors);
}

/**
 * Fetches a single vendor by ID with invoice statistics.
 */
export function fetchVendor(id: string): Promise<VendorDetail> {
  return get<{ vendor: VendorDetail }>(`/vendors/${id}`).then((r) => r.vendor);
}

/**
 * Creates a new vendor.
 */
export function createVendor(data: CreateVendorRequest): Promise<Vendor> {
  return post<{ vendor: Vendor }>('/vendors', data).then((r) => r.vendor);
}

/**
 * Updates an existing vendor.
 */
export function updateVendor(id: string, data: UpdateVendorRequest): Promise<VendorDetail> {
  return patch<{ vendor: VendorDetail }>(`/vendors/${id}`, data).then((r) => r.vendor);
}

/**
 * Deletes a vendor.
 * @throws {ApiClientError} with statusCode 409 if the vendor is in use.
 */
export function deleteVendor(id: string): Promise<void> {
  return del<void>(`/vendors/${id}`);
}
