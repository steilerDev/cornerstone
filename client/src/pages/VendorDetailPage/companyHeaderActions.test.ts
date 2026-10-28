import { describe, it, expect } from '@jest/globals';
import type { VendorContact, VendorDetail } from '@cornerstone/shared';
import { companyPrimary } from './companyHeaderActions.js';

const contact = (id: string, phone: string | null, name = `Person ${id}`): VendorContact => ({
  id,
  vendorId: 'v1',
  firstName: name,
  lastName: null,
  name,
  role: null,
  phone,
  email: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

function vendor(phone: string | null, contacts: VendorContact[] = []): VendorDetail {
  return { id: 'v1', name: 'Sample Co', phone, contacts } as unknown as VendorDetail;
}

describe('companyPrimary', () => {
  // Mutation: preferring a contact over the company line would name a person for a company call.
  it('uses the company phone, trimmed, with no person name', () => {
    expect(companyPrimary(vendor('  030 555  ', [contact('c1', '111')]))).toEqual({
      kind: 'call',
      phone: '030 555',
      personName: null,
    });
  });

  it('falls back to the first contact person with a number, in the given order, naming them', () => {
    expect(
      companyPrimary(
        vendor(null, [contact('c1', null), contact('c2', '  222 '), contact('c3', '333')]),
      ),
    ).toEqual({ kind: 'call', phone: '222', personName: 'Person c2' });
  });

  it('treats a blank company phone as missing', () => {
    expect(companyPrimary(vendor('   ', [contact('c1', '111', 'Pat')]))).toEqual({
      kind: 'call',
      phone: '111',
      personName: 'Pat',
    });
  });

  it('offers Add phone number when neither the company nor any person has a number', () => {
    expect(companyPrimary(vendor(null))).toEqual({ kind: 'addPhone' });
    expect(companyPrimary(vendor('', [contact('c1', null), contact('c2', '  ')]))).toEqual({
      kind: 'addPhone',
    });
  });
});
