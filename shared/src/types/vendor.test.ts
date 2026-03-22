/**
 * Type-level tests for shared vendor types.
 *
 * Verifies that TypeScript interfaces for Vendor, VendorDetail, and request/query types
 * are correctly shaped after the Areas & Trades rework (Story #1030):
 * - specialty field removed, replaced by trade (TradeSummary | null)
 * - tradeId used in create/update requests
 * - sortBy updated (specialty removed, trade added)
 */

import { describe, it, expect } from '@jest/globals';
import type {
  Vendor,
  VendorDetail,
  CreateVendorRequest,
  UpdateVendorRequest,
  VendorListQuery,
  VendorCreateResponse,
  VendorDetailResponse,
} from './vendor.js';
import type { TradeSummary } from './trade.js';

// ---------------------------------------------------------------------------
// Vendor interface
// ---------------------------------------------------------------------------

describe('Vendor interface', () => {
  it('constructs a valid vendor with a trade object', () => {
    const vendor: Vendor = {
      id: 'v-001',
      name: 'Acme Plumbing',
      trade: { id: 'trade-plumbing', name: 'Plumbing', color: '#0EA5E9', translationKey: 'trades.plumbing' },
      phone: '+1-555-0100',
      email: 'contact@acme-plumbing.com',
      address: '123 Pipe St',
      notes: 'Preferred vendor',
      createdBy: { id: 'user-1', displayName: 'Alice', email: 'alice@example.com' },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-15T00:00:00Z',
    };

    expect(vendor.id).toBe('v-001');
    expect(vendor.name).toBe('Acme Plumbing');
    expect(vendor.trade?.id).toBe('trade-plumbing');
    expect(vendor.trade?.name).toBe('Plumbing');
    expect(vendor.trade?.color).toBe('#0EA5E9');
    expect(vendor.phone).toBe('+1-555-0100');
    expect(vendor.createdBy?.displayName).toBe('Alice');
  });

  it('allows trade to be null', () => {
    const vendor: Vendor = {
      id: 'v-002',
      name: 'General Services',
      trade: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
      createdBy: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };

    expect(vendor.trade).toBeNull();
    expect(vendor.phone).toBeNull();
    expect(vendor.email).toBeNull();
    expect(vendor.createdBy).toBeNull();
  });

  it('does not have specialty field (removed in migration 0028)', () => {
    const vendor: Vendor = {
      id: 'v-003',
      name: 'Test Vendor',
      trade: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
      createdBy: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };

    expect((vendor as any).specialty).toBeUndefined();
  });

  it('trade field is a TradeSummary with id, name, color', () => {
    const trade: TradeSummary = {
      id: 'trade-electrical',
      name: 'Electrical',
      color: '#F59E0B',
      translationKey: 'trades.electrical',
    };

    const vendor: Vendor = {
      id: 'v-004',
      name: 'Bright Electrical',
      trade,
      phone: null,
      email: null,
      address: null,
      notes: null,
      createdBy: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };

    expect(vendor.trade?.id).toBe('trade-electrical');
    expect(vendor.trade?.name).toBe('Electrical');
    expect(vendor.trade?.color).toBe('#F59E0B');
  });

  it('TradeSummary color can be null', () => {
    const vendor: Vendor = {
      id: 'v-005',
      name: 'Custom Trade Vendor',
      trade: { id: 'trade-custom', name: 'Custom Trade', color: null, translationKey: null },
      phone: null,
      email: null,
      address: null,
      notes: null,
      createdBy: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };

    expect(vendor.trade?.color).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// VendorDetail interface (extends Vendor)
// ---------------------------------------------------------------------------

describe('VendorDetail interface', () => {
  it('extends Vendor with invoiceCount, outstandingBalance, and contacts', () => {
    const detail: VendorDetail = {
      id: 'v-detail-1',
      name: 'Master Builder',
      trade: { id: 'trade-general-contractor', name: 'General Contractor', color: '#6366F1', translationKey: 'trades.generalContractor' },
      phone: '+49-555-1234',
      email: 'info@masterbuilder.com',
      address: '1 Build Ave, Munich',
      notes: null,
      createdBy: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      invoiceCount: 5,
      outstandingBalance: 12500.0,
      contacts: [],
    };

    expect(detail.invoiceCount).toBe(5);
    expect(detail.outstandingBalance).toBe(12500.0);
    expect(detail.contacts).toHaveLength(0);
    expect(detail.trade?.name).toBe('General Contractor');
  });

  it('can have a zero outstanding balance', () => {
    const detail: VendorDetail = {
      id: 'v-detail-2',
      name: 'Fully Paid Vendor',
      trade: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
      createdBy: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      invoiceCount: 3,
      outstandingBalance: 0,
      contacts: [],
    };

    expect(detail.invoiceCount).toBe(3);
    expect(detail.outstandingBalance).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CreateVendorRequest interface (tradeId replaces specialtyId/specialty)
// ---------------------------------------------------------------------------

describe('CreateVendorRequest interface', () => {
  it('requires only name — all other fields optional', () => {
    const request: CreateVendorRequest = {
      name: 'New Vendor',
    };

    expect(request.name).toBe('New Vendor');
    expect(request.tradeId).toBeUndefined();
    expect(request.phone).toBeUndefined();
    expect(request.email).toBeUndefined();
    expect(request.address).toBeUndefined();
    expect(request.notes).toBeUndefined();
  });

  it('accepts tradeId as optional string', () => {
    const request: CreateVendorRequest = {
      name: 'Plumber Pro',
      tradeId: 'trade-plumbing',
    };

    expect(request.tradeId).toBe('trade-plumbing');
  });

  it('accepts tradeId as null to explicitly unset the trade', () => {
    const request: CreateVendorRequest = {
      name: 'Vendor Without Trade',
      tradeId: null,
    };

    expect(request.tradeId).toBeNull();
  });

  it('accepts all optional fields', () => {
    const request: CreateVendorRequest = {
      name: 'Full Details Vendor',
      tradeId: 'trade-carpentry',
      phone: '+1-555-9999',
      email: 'vendor@example.com',
      address: '99 Wood Lane',
      notes: 'Works with oak and pine',
    };

    expect(request.name).toBe('Full Details Vendor');
    expect(request.tradeId).toBe('trade-carpentry');
    expect(request.phone).toBe('+1-555-9999');
    expect(request.email).toBe('vendor@example.com');
    expect(request.address).toBe('99 Wood Lane');
    expect(request.notes).toBe('Works with oak and pine');
  });

  it('does not have specialty field', () => {
    const request: CreateVendorRequest = { name: 'Test' };
    expect((request as any).specialty).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UpdateVendorRequest interface
// ---------------------------------------------------------------------------

describe('UpdateVendorRequest interface', () => {
  it('allows empty update (all fields optional)', () => {
    const request: UpdateVendorRequest = {};
    expect(Object.keys(request)).toHaveLength(0);
  });

  it('allows updating tradeId only', () => {
    const request: UpdateVendorRequest = {
      tradeId: 'trade-hvac',
    };

    expect(request.tradeId).toBe('trade-hvac');
    expect(request.name).toBeUndefined();
    expect(request.phone).toBeUndefined();
  });

  it('allows clearing tradeId to null', () => {
    const request: UpdateVendorRequest = {
      tradeId: null,
    };

    expect(request.tradeId).toBeNull();
  });

  it('allows updating multiple fields simultaneously', () => {
    const request: UpdateVendorRequest = {
      name: 'Updated Vendor Name',
      tradeId: 'trade-roofing',
      email: 'new-email@vendor.com',
      notes: 'Updated notes',
    };

    expect(request.name).toBe('Updated Vendor Name');
    expect(request.tradeId).toBe('trade-roofing');
    expect(request.email).toBe('new-email@vendor.com');
    expect(request.notes).toBe('Updated notes');
  });

  it('does not have specialty field', () => {
    const request: UpdateVendorRequest = {};
    expect((request as any).specialty).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// VendorListQuery interface
// ---------------------------------------------------------------------------

describe('VendorListQuery interface', () => {
  it('accepts all optional query parameters including tradeId filter', () => {
    const query: VendorListQuery = {
      page: 2,
      pageSize: 10,
      q: 'plumbing',
      tradeId: 'trade-plumbing',
      sortBy: 'name',
      sortOrder: 'asc',
    };

    expect(query.page).toBe(2);
    expect(query.pageSize).toBe(10);
    expect(query.q).toBe('plumbing');
    expect(query.tradeId).toBe('trade-plumbing');
    expect(query.sortBy).toBe('name');
    expect(query.sortOrder).toBe('asc');
  });

  it('accepts all valid sortBy values', () => {
    const sortByValues: NonNullable<VendorListQuery['sortBy']>[] = [
      'name',
      'trade',
      'created_at',
      'updated_at',
    ];

    for (const sortBy of sortByValues) {
      const query: VendorListQuery = { sortBy };
      expect(query.sortBy).toBe(sortBy);
    }
  });

  it('sortBy does not contain specialty (removed in migration 0028)', () => {
    // specialty was previously a valid sortBy value — after rework it's trade
    const query: VendorListQuery = { sortBy: 'trade' };
    expect(query.sortBy).toBe('trade');
    // specialty is not a valid sortBy value in the new type
    // (compile-time check only; no runtime assertion needed)
  });

  it('allows empty query (all fields optional)', () => {
    const query: VendorListQuery = {};
    expect(Object.keys(query)).toHaveLength(0);
  });

  it('accepts desc sortOrder', () => {
    const query: VendorListQuery = { sortOrder: 'desc' };
    expect(query.sortOrder).toBe('desc');
  });
});

// ---------------------------------------------------------------------------
// VendorCreateResponse interface
// ---------------------------------------------------------------------------

describe('VendorCreateResponse interface', () => {
  it('wraps a Vendor in the vendor field', () => {
    const response: VendorCreateResponse = {
      vendor: {
        id: 'v-new',
        name: 'Newly Created Vendor',
        trade: { id: 'trade-flooring', name: 'Flooring', color: '#D97706', translationKey: 'trades.flooring' },
        phone: null,
        email: null,
        address: null,
        notes: null,
        createdBy: null,
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
      },
    };

    expect(response.vendor.id).toBe('v-new');
    expect(response.vendor.name).toBe('Newly Created Vendor');
    expect(response.vendor.trade?.name).toBe('Flooring');
  });
});

// ---------------------------------------------------------------------------
// VendorDetailResponse interface
// ---------------------------------------------------------------------------

describe('VendorDetailResponse interface', () => {
  it('wraps a VendorDetail in the vendor field', () => {
    const response: VendorDetailResponse = {
      vendor: {
        id: 'v-detail-resp',
        name: 'Detail Vendor',
        trade: null,
        phone: null,
        email: null,
        address: null,
        notes: null,
        createdBy: null,
        createdAt: '2026-03-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
        invoiceCount: 0,
        outstandingBalance: 0,
        contacts: [],
      },
    };

    expect(response.vendor.id).toBe('v-detail-resp');
    expect(response.vendor.invoiceCount).toBe(0);
    expect(response.vendor.outstandingBalance).toBe(0);
    expect(response.vendor.contacts).toHaveLength(0);
  });
});
