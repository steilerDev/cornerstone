import type { VendorDetail } from '@cornerstone/shared';

export type CompanyPrimary =
  | { readonly kind: 'call'; readonly phone: string; readonly personName: string | null }
  | { readonly kind: 'addPhone' };

/**
 * The one primary of a company header. The company's own number wins; otherwise the first
 * contact person (in the order the API returns them) with a number. A company with no number at
 * all offers "Add phone number" instead of a dead Call control.
 */
export function companyPrimary(vendor: VendorDetail): CompanyPrimary {
  const own = vendor.phone?.trim();
  if (own) return { kind: 'call', phone: own, personName: null };
  for (const contact of vendor.contacts) {
    const phone = contact.phone?.trim();
    if (phone) return { kind: 'call', phone, personName: contact.name };
  }
  return { kind: 'addPhone' };
}
