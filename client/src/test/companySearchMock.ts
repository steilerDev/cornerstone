import type { VendorListItem } from '@cornerstone/shared';

interface FetchVendorsLike {
  (
    params?: { q?: string; pageSize?: number },
    options?: { signal?: AbortSignal },
  ): Promise<{ vendors: VendorListItem[] }>;
}

/**
 * `searchCompanies` for tests that mock `lib/vendorsApi.js` with a factory: it mirrors the real
 * function (trimmed `q`, page size 50, signal forwarded) on top of the test's `fetchVendors` mock,
 * so a test asserts the request and answers it in one place.
 */
export function makeSearchCompanies(fetchVendors: FetchVendorsLike) {
  return (query: string, signal?: AbortSignal): Promise<VendorListItem[]> => {
    const q = query.trim();
    return fetchVendors(
      { ...(q ? { q } : {}), pageSize: 50 },
      signal ? { signal } : undefined,
    ).then((r) => r.vendors);
  };
}
