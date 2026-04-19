/**
 * Type-level tests for shared household item types.
 *
 * These tests verify that the TypeScript interfaces are correctly shaped
 * and that all enum values are present. Because these are compile-time types,
 * tests construct valid objects and assert their runtime values.
 *
 * EPIC-04: Household Items & Furniture Management
 * Story #1030: Updated for Areas & Trades rework (room → area_id, specialty → trade, tags removed)
 */

import { describe, it, expect } from '@jest/globals';
import type {
  HouseholdItemCategory,
  HouseholdItemStatus,
  HouseholdItemVendorSummary,
  WorkItemLinkedHouseholdItemSummary,
  HouseholdItemSubsidySummary,
  HouseholdItem,
  HouseholdItemSummary,
  HouseholdItemDetail,
  CreateHouseholdItemRequest,
  UpdateHouseholdItemRequest,
  HouseholdItemListQuery,
  HouseholdItemListResponse,
  HouseholdItemResponse,
} from './householdItem.js';
import type { PaginatedResponse } from './pagination.js';

// ---------------------------------------------------------------------------
// HouseholdItemCategory type
// ---------------------------------------------------------------------------

describe('HouseholdItemCategory type', () => {
  it('is a string type that accepts any string value', () => {
    // HouseholdItemCategory is now a plain string alias (category IDs from DB)
    const category: HouseholdItemCategory = 'hic-furniture';
    expect(typeof category).toBe('string');
  });

  it('accepts standard seeded category IDs from migration 0016 + 0028', () => {
    const categories: HouseholdItemCategory[] = [
      'hic-furniture',
      'hic-appliances',
      'hic-fixtures',
      'hic-decor',
      'hic-electronics',
      'hic-outdoor',
      'hic-storage',
      'hic-other',
      'hic-equipment', // added by migration 0028
    ];

    for (const cat of categories) {
      const val: HouseholdItemCategory = cat;
      expect(typeof val).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// HouseholdItemStatus type
// ---------------------------------------------------------------------------

describe('HouseholdItemStatus type', () => {
  it('accepts all 4 valid status values', () => {
    const statuses: HouseholdItemStatus[] = ['planned', 'purchased', 'scheduled', 'arrived'];

    expect(statuses).toHaveLength(4);
    expect(statuses).toContain('planned');
    expect(statuses).toContain('purchased');
    expect(statuses).toContain('scheduled');
    expect(statuses).toContain('arrived');
  });

  it('each status value is a distinct string', () => {
    const statuses: HouseholdItemStatus[] = ['planned', 'purchased', 'scheduled', 'arrived'];
    const unique = new Set(statuses);
    expect(unique.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// HouseholdItemVendorSummary interface (now has trade instead of specialty)
// ---------------------------------------------------------------------------

describe('HouseholdItemVendorSummary interface', () => {
  it('constructs a valid vendor summary with a trade object', () => {
    const vendor: HouseholdItemVendorSummary = {
      id: 'vendor-1',
      name: 'IKEA',
      trade: { id: 'trade-other', name: 'Other', color: '#6B7280', translationKey: 'trades.other' },
    };

    expect(vendor.id).toBe('vendor-1');
    expect(vendor.name).toBe('IKEA');
    expect(vendor.trade?.id).toBe('trade-other');
    expect(vendor.trade?.name).toBe('Other');
  });

  it('allows trade to be null', () => {
    const vendor: HouseholdItemVendorSummary = {
      id: 'vendor-2',
      name: 'Generic Supplier',
      trade: null,
    };

    expect(vendor.trade).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// WorkItemLinkedHouseholdItemSummary interface
// ---------------------------------------------------------------------------

describe('WorkItemLinkedHouseholdItemSummary interface', () => {
  it('constructs a valid household item summary with all fields populated', () => {
    const householdItem: WorkItemLinkedHouseholdItemSummary = {
      id: 'hi-1',
      name: 'Leather Sofa',
      category: 'hic-furniture',
      status: 'arrived',
      targetDeliveryDate: '2026-05-15',
      earliestDeliveryDate: '2026-05-15',
      latestDeliveryDate: '2026-05-20',
    };

    expect(householdItem.id).toBe('hi-1');
    expect(householdItem.name).toBe('Leather Sofa');
    expect(householdItem.category).toBe('hic-furniture');
    expect(householdItem.status).toBe('arrived');
    expect(householdItem.targetDeliveryDate).toBe('2026-05-15');
    expect(householdItem.earliestDeliveryDate).toBe('2026-05-15');
    expect(householdItem.latestDeliveryDate).toBe('2026-05-20');
  });

  it('allows delivery dates to be null', () => {
    const householdItem: WorkItemLinkedHouseholdItemSummary = {
      id: 'hi-2',
      name: 'Wall Paint',
      category: 'hic-decor',
      status: 'planned',
      targetDeliveryDate: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
    };

    expect(householdItem.targetDeliveryDate).toBeNull();
    expect(householdItem.earliestDeliveryDate).toBeNull();
    expect(householdItem.latestDeliveryDate).toBeNull();
    expect(householdItem.category).toBe('hic-decor');
    expect(householdItem.status).toBe('planned');
  });

  it('accepts all valid status values', () => {
    const statuses: HouseholdItemStatus[] = ['planned', 'purchased', 'scheduled', 'arrived'];

    for (const status of statuses) {
      const householdItem: WorkItemLinkedHouseholdItemSummary = {
        id: `hi-status-${status}`,
        name: `Item with status ${status}`,
        category: 'hic-furniture',
        status,
        targetDeliveryDate: '2026-06-01',
        earliestDeliveryDate: '2026-05-20',
        latestDeliveryDate: '2026-06-10',
      };
      expect(householdItem.status).toBe(status);
    }
  });
});

// ---------------------------------------------------------------------------
// HouseholdItemSubsidySummary interface
// ---------------------------------------------------------------------------

describe('HouseholdItemSubsidySummary interface', () => {
  it('constructs a valid subsidy summary with percentage reduction', () => {
    const subsidy: HouseholdItemSubsidySummary = {
      id: 'sp-1',
      name: 'Green Energy Subsidy',
      reductionType: 'percentage',
      reductionValue: 15,
      applicationStatus: 'approved',
    };

    expect(subsidy.id).toBe('sp-1');
    expect(subsidy.reductionType).toBe('percentage');
    expect(subsidy.reductionValue).toBe(15);
    expect(subsidy.applicationStatus).toBe('approved');
  });

  it('constructs a valid subsidy summary with fixed reduction', () => {
    const subsidy: HouseholdItemSubsidySummary = {
      id: 'sp-2',
      name: 'Home Improvement Grant',
      reductionType: 'fixed',
      reductionValue: 500,
      applicationStatus: 'eligible',
    };

    expect(subsidy.reductionType).toBe('fixed');
    expect(subsidy.reductionValue).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// HouseholdItemSummary interface (area replaces room; no tagIds)
// ---------------------------------------------------------------------------

describe('HouseholdItemSummary interface', () => {
  it('constructs a valid summary object with all required fields including area', () => {
    const summary: HouseholdItemSummary = {
      id: 'item-1',
      name: 'Leather Sofa',
      description: 'A 3-seat leather sofa',
      category: 'hic-furniture',
      status: 'purchased',
      vendor: {
        id: 'vendor-1',
        name: 'IKEA',
        trade: null,
      },
      area: { id: 'area-living-room', name: 'Living Room', color: '#FF5733', ancestors: [] },
      quantity: 1,
      orderDate: '2025-01-15',
      targetDeliveryDate: '2025-02-15',
      actualDeliveryDate: null,
      earliestDeliveryDate: '2025-02-10',
      latestDeliveryDate: '2025-02-20',
      isLate: false,
      url: 'https://example.com/sofa',
      budgetLineCount: 2,
      totalPlannedAmount: 1200.0,
      budgetSummary: { totalPlanned: 1200, totalActual: 0, subsidyReduction: 0, netCost: 1200 },
      createdBy: {
        id: 'user-1',
        displayName: 'Alice',
        email: 'alice@example.com',
      },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-15T00:00:00Z',
    };

    expect(summary.id).toBe('item-1');
    expect(summary.name).toBe('Leather Sofa');
    expect(summary.category).toBe('hic-furniture');
    expect(summary.status).toBe('purchased');
    expect(summary.vendor?.name).toBe('IKEA');
    expect(summary.area?.id).toBe('area-living-room');
    expect(summary.area?.name).toBe('Living Room');
    expect(summary.budgetLineCount).toBe(2);
    expect(summary.totalPlannedAmount).toBe(1200.0);
    expect(summary.earliestDeliveryDate).toBe('2025-02-10');
    expect(summary.latestDeliveryDate).toBe('2025-02-20');
  });

  it('allows vendor, area, and delivery dates to be null', () => {
    const summary: HouseholdItemSummary = {
      id: 'item-2',
      name: 'Dining Table',
      description: null,
      category: 'hic-furniture',
      status: 'planned',
      vendor: null,
      area: null,
      quantity: 1,
      orderDate: null,
      targetDeliveryDate: null,
      actualDeliveryDate: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      isLate: false,
      url: null,
      budgetLineCount: 0,
      totalPlannedAmount: 0,
      budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
      createdBy: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };

    expect(summary.vendor).toBeNull();
    expect(summary.area).toBeNull();
    expect(summary.description).toBeNull();
    expect(summary.earliestDeliveryDate).toBeNull();
    expect(summary.latestDeliveryDate).toBeNull();
  });

  it('does not have room or tagIds fields (removed in migration 0028)', () => {
    const summary: HouseholdItemSummary = {
      id: 'item-3',
      name: 'Chair',
      description: null,
      category: 'hic-furniture',
      status: 'planned',
      vendor: null,
      area: null,
      quantity: 1,
      orderDate: null,
      targetDeliveryDate: null,
      actualDeliveryDate: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      isLate: false,
      url: null,
      budgetLineCount: 0,
      totalPlannedAmount: 0,
      budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
      createdBy: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };

    // These fields should not exist on the type
    expect((summary as any).room).toBeUndefined();
    expect((summary as any).tagIds).toBeUndefined();
    expect((summary as any).tags).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// HouseholdItemDetail interface (area replaces room; no tags)
// ---------------------------------------------------------------------------

describe('HouseholdItemDetail interface', () => {
  it('extends HouseholdItemSummary with dependencies and subsidies', () => {
    const detail: HouseholdItemDetail = {
      id: 'item-detail-1',
      name: 'Smart TV',
      description: '65-inch 4K OLED television',
      category: 'hic-electronics',
      status: 'arrived',
      vendor: null,
      area: { id: 'area-living-room', name: 'Living Room', color: null, ancestors: [] },
      quantity: 1,
      orderDate: '2025-01-01',
      targetDeliveryDate: '2025-01-20',
      actualDeliveryDate: '2025-01-18',
      earliestDeliveryDate: '2025-01-15',
      latestDeliveryDate: '2025-01-25',
      isLate: false,
      url: 'https://example.com/tv',
      budgetLineCount: 1,
      totalPlannedAmount: 1999.99,
      budgetSummary: {
        totalPlanned: 1999.99,
        totalActual: 0,
        subsidyReduction: 0,
        netCost: 1999.99,
      },
      createdBy: {
        id: 'user-1',
        displayName: 'Alice',
        email: 'alice@example.com',
      },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-18T00:00:00Z',
      dependencies: [
        {
          householdItemId: 'item-detail-1',
          predecessorType: 'work_item',
          predecessorId: 'wi-1',
          predecessor: {
            id: 'wi-1',
            title: 'Mount TV',
            status: 'not_started',
            endDate: '2026-05-05',
            area: null,
          },
        },
      ],
      subsidies: [
        {
          id: 'sp-1',
          name: 'Electronics Grant',
          reductionType: 'fixed',
          reductionValue: 200,
          applicationStatus: 'applied',
        },
      ],
    };

    // Summary fields present
    expect(detail.id).toBe('item-detail-1');
    expect(detail.category).toBe('hic-electronics');
    expect(detail.totalPlannedAmount).toBe(1999.99);
    expect(detail.area?.name).toBe('Living Room');

    // Detail-specific fields present
    expect(detail.url).toBe('https://example.com/tv');
    expect(detail.createdBy?.displayName).toBe('Alice');
    expect(detail.dependencies).toHaveLength(1);
    expect(detail.subsidies).toHaveLength(1);
    expect(detail.subsidies[0].applicationStatus).toBe('applied');
    expect(detail.earliestDeliveryDate).toBe('2025-01-15');
    expect(detail.latestDeliveryDate).toBe('2025-01-25');
  });

  it('allows url, createdBy, and area to be null with empty arrays for relations', () => {
    const detail: HouseholdItemDetail = {
      id: 'item-detail-2',
      name: 'Bookshelf',
      description: null,
      category: 'hic-storage',
      status: 'planned',
      vendor: null,
      area: null,
      quantity: 1,
      orderDate: null,
      targetDeliveryDate: null,
      actualDeliveryDate: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      isLate: false,
      budgetLineCount: 0,
      totalPlannedAmount: 0,
      budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      url: null,
      createdBy: null,
      dependencies: [],
      subsidies: [],
    };

    expect(detail.url).toBeNull();
    expect(detail.createdBy).toBeNull();
    expect(detail.area).toBeNull();
    expect(detail.dependencies).toHaveLength(0);
    expect(detail.subsidies).toHaveLength(0);

    // Confirm no tags field
    expect((detail as any).tags).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// CreateHouseholdItemRequest interface (areaId replaces room)
// ---------------------------------------------------------------------------

describe('CreateHouseholdItemRequest interface', () => {
  it('requires only name field', () => {
    const request: CreateHouseholdItemRequest = {
      name: 'Sofa',
    };

    expect(request.name).toBe('Sofa');
    expect(request.description).toBeUndefined();
    expect(request.category).toBeUndefined();
    expect(request.status).toBeUndefined();
    expect(request.vendorId).toBeUndefined();
    expect(request.url).toBeUndefined();
    expect(request.areaId).toBeUndefined();
    expect(request.quantity).toBeUndefined();
    expect(request.orderDate).toBeUndefined();
    expect(request.earliestDeliveryDate).toBeUndefined();
    expect(request.latestDeliveryDate).toBeUndefined();
    expect(request.actualDeliveryDate).toBeUndefined();
  });

  it('has no room field (replaced by areaId)', () => {
    const request: CreateHouseholdItemRequest = { name: 'Chair' };
    // room was removed; should not exist on the type
    expect((request as any).room).toBeUndefined();
  });

  it('accepts areaId as optional string', () => {
    const request: CreateHouseholdItemRequest = {
      name: 'Sofa',
      areaId: 'area-living-room',
    };

    expect(request.areaId).toBe('area-living-room');
  });

  it('accepts all optional fields', () => {
    const request: CreateHouseholdItemRequest = {
      name: 'Sofa',
      description: 'A comfortable sofa',
      category: 'hic-furniture',
      status: 'purchased',
      vendorId: 'vendor-1',
      url: 'https://example.com/sofa',
      areaId: 'area-living-room',
      quantity: 2,
      orderDate: '2025-01-15',
      earliestDeliveryDate: '2025-02-10',
      latestDeliveryDate: '2025-02-20',
      actualDeliveryDate: null,
    };

    expect(request.category).toBe('hic-furniture');
    expect(request.status).toBe('purchased');
    expect(request.quantity).toBe(2);
    expect(request.areaId).toBe('area-living-room');
    expect(request.actualDeliveryDate).toBeNull();
  });

  it('accepts null for nullable optional fields', () => {
    const request: CreateHouseholdItemRequest = {
      name: 'Chair',
      description: null,
      vendorId: null,
      url: null,
      areaId: null,
      orderDate: null,
      actualDeliveryDate: null,
    };

    expect(request.description).toBeNull();
    expect(request.vendorId).toBeNull();
    expect(request.url).toBeNull();
    expect(request.areaId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// UpdateHouseholdItemRequest interface (areaId replaces room)
// ---------------------------------------------------------------------------

describe('UpdateHouseholdItemRequest interface', () => {
  it('allows single field update', () => {
    const request: UpdateHouseholdItemRequest = {
      status: 'arrived',
    };

    expect(request.status).toBe('arrived');
    expect(request.name).toBeUndefined();
    expect(request.category).toBeUndefined();
  });

  it('has no room field (replaced by areaId)', () => {
    const request: UpdateHouseholdItemRequest = {};
    expect((request as any).room).toBeUndefined();
  });

  it('allows updating areaId', () => {
    const request: UpdateHouseholdItemRequest = {
      areaId: 'area-bedroom',
    };

    expect(request.areaId).toBe('area-bedroom');
  });

  it('allows clearing areaId to null', () => {
    const request: UpdateHouseholdItemRequest = {
      areaId: null,
    };

    expect(request.areaId).toBeNull();
  });

  it('allows updating multiple fields at once', () => {
    const request: UpdateHouseholdItemRequest = {
      status: 'scheduled',
      earliestDeliveryDate: '2025-02-20',
      latestDeliveryDate: '2025-03-01',
      areaId: 'area-bedroom',
    };

    expect(request.status).toBe('scheduled');
    expect(request.earliestDeliveryDate).toBe('2025-02-20');
    expect(request.latestDeliveryDate).toBe('2025-03-01');
    expect(request.areaId).toBe('area-bedroom');
  });

  it('allows all fields to be undefined (empty update)', () => {
    const request: UpdateHouseholdItemRequest = {};
    expect(Object.keys(request)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// HouseholdItemListQuery interface (areaId replaces room; no tagId)
// ---------------------------------------------------------------------------

describe('HouseholdItemListQuery interface', () => {
  it('allows all optional query parameters including areaId', () => {
    const query: HouseholdItemListQuery = {
      page: 2,
      pageSize: 20,
      q: 'sofa',
      category: 'hic-furniture',
      status: 'purchased',
      areaId: 'area-living-room',
      sortBy: 'name',
      sortOrder: 'asc',
    };

    expect(query.page).toBe(2);
    expect(query.pageSize).toBe(20);
    expect(query.q).toBe('sofa');
    expect(query.category).toBe('hic-furniture');
    expect(query.status).toBe('purchased');
    expect(query.areaId).toBe('area-living-room');
    expect(query.sortBy).toBe('name');
    expect(query.sortOrder).toBe('asc');
  });

  it('has no room or tagId filter (removed in migration 0028)', () => {
    const query: HouseholdItemListQuery = {};
    expect((query as any).room).toBeUndefined();
    expect((query as any).tagId).toBeUndefined();
  });

  it('accepts vendorId filter parameter', () => {
    const query: HouseholdItemListQuery = { vendorId: 'vendor-1' };
    expect(query.vendorId).toBe('vendor-1');
  });

  it('accepts all sortBy values', () => {
    const sortByValues: NonNullable<HouseholdItemListQuery['sortBy']>[] = [
      'name',
      'category',
      'status',
      'order_date',
      'target_delivery_date',
      'created_at',
      'updated_at',
    ];

    for (const sortBy of sortByValues) {
      const query: HouseholdItemListQuery = { sortBy };
      expect(query.sortBy).toBe(sortBy);
    }
  });

  it('accepts desc sortOrder', () => {
    const query: HouseholdItemListQuery = { sortOrder: 'desc' };
    expect(query.sortOrder).toBe('desc');
  });

  it('allows empty query (all fields optional)', () => {
    const query: HouseholdItemListQuery = {};
    expect(Object.keys(query)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// HouseholdItemListResponse type
// ---------------------------------------------------------------------------

describe('HouseholdItemListResponse type', () => {
  it('is a PaginatedResponse of HouseholdItemSummary', () => {
    const response: HouseholdItemListResponse = {
      items: [
        {
          id: 'item-1',
          name: 'Sofa',
          description: null,
          category: 'hic-furniture',
          status: 'planned',
          vendor: null,
          area: null,
          quantity: 1,
          orderDate: null,
          targetDeliveryDate: null,
          actualDeliveryDate: null,
          earliestDeliveryDate: null,
          latestDeliveryDate: null,
          isLate: false,
          url: null,
          budgetLineCount: 0,
          totalPlannedAmount: 0,
          budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
          createdBy: null,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      },
    };

    const paginated: PaginatedResponse<(typeof response.items)[0]> = response;
    expect(paginated.items).toHaveLength(1);
    expect(paginated.pagination.totalItems).toBe(1);
    expect(response.items[0].name).toBe('Sofa');
    // Verify no old fields
    expect((response.items[0] as any).room).toBeUndefined();
    expect((response.items[0] as any).tagIds).toBeUndefined();
  });

  it('handles empty list correctly', () => {
    const response: HouseholdItemListResponse = {
      items: [],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      },
    };

    expect(response.items).toHaveLength(0);
    expect(response.pagination.totalItems).toBe(0);
    expect(response.pagination.totalPages).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// HouseholdItemResponse interface
// ---------------------------------------------------------------------------

describe('HouseholdItemResponse interface', () => {
  it('wraps a HouseholdItemDetail in the householdItem field', () => {
    const response: HouseholdItemResponse = {
      householdItem: {
        id: 'item-resp-1',
        name: 'Armchair',
        description: null,
        category: 'hic-furniture',
        status: 'planned',
        vendor: null,
        area: null,
        quantity: 1,
        orderDate: null,
        targetDeliveryDate: null,
        actualDeliveryDate: null,
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
        isLate: false,
        budgetLineCount: 0,
        totalPlannedAmount: 0,
        budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        url: null,
        createdBy: null,
        dependencies: [],
        subsidies: [],
      },
    };

    expect(response.householdItem.id).toBe('item-resp-1');
    expect(response.householdItem.name).toBe('Armchair');
    expect(response.householdItem.category).toBe('hic-furniture');
    expect(response.householdItem.dependencies).toHaveLength(0);
    expect(response.householdItem.subsidies).toHaveLength(0);
    // Confirm tags field is gone
    expect((response.householdItem as any).tags).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// HouseholdItem entity interface
// ---------------------------------------------------------------------------

describe('HouseholdItem entity interface', () => {
  it('constructs a valid HouseholdItem with all required fields', () => {
    const item: HouseholdItem = {
      id: 'item-entity-1',
      name: 'Coffee Table',
      description: 'Oak wood coffee table',
      category: 'hic-furniture',
      status: 'arrived',
      vendorId: 'vendor-1',
      url: 'https://example.com/table',
      quantity: 1,
      orderDate: '2025-01-01',
      targetDeliveryDate: '2025-02-01',
      earliestDeliveryDate: '2025-01-25',
      latestDeliveryDate: '2025-02-05',
      actualDeliveryDate: '2025-01-28',
      isLate: false,
      createdBy: 'user-1',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-28T00:00:00Z',
    };

    expect(item.id).toBe('item-entity-1');
    expect(item.name).toBe('Coffee Table');
    expect(item.category).toBe('hic-furniture');
    expect(item.status).toBe('arrived');
    expect(item.vendorId).toBe('vendor-1');
    expect(item.quantity).toBe(1);
    expect(item.actualDeliveryDate).toBe('2025-01-28');
  });

  it('allows all nullable fields to be null', () => {
    const item: HouseholdItem = {
      id: 'item-entity-2',
      name: 'Lamp',
      description: null,
      category: 'hic-decor',
      status: 'planned',
      vendorId: null,
      url: null,
      quantity: 1,
      orderDate: null,
      targetDeliveryDate: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      actualDeliveryDate: null,
      isLate: false,
      createdBy: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };

    expect(item.description).toBeNull();
    expect(item.vendorId).toBeNull();
    expect(item.url).toBeNull();
    expect(item.orderDate).toBeNull();
    expect(item.targetDeliveryDate).toBeNull();
    expect(item.actualDeliveryDate).toBeNull();
    expect(item.createdBy).toBeNull();
  });

  it('has no room field on the entity (removed in migration 0028)', () => {
    const item: HouseholdItem = {
      id: 'item-entity-3',
      name: 'Desk',
      description: null,
      category: 'hic-furniture',
      status: 'planned',
      vendorId: null,
      url: null,
      quantity: 1,
      orderDate: null,
      targetDeliveryDate: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      actualDeliveryDate: null,
      isLate: false,
      createdBy: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };

    expect((item as any).room).toBeUndefined();
  });
});
