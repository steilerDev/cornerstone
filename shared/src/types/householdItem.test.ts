/**
 * Type-level tests for shared household item types.
 *
 * These tests verify that the TypeScript interfaces are correctly shaped
 * and that all enum values are present. Because these are compile-time types,
 * tests construct valid objects and assert their runtime values.
 *
 * EPIC-04: Household Items & Furniture Management
 */

import { describe, it, expect } from '@jest/globals';
import type {
  HouseholdItemCategory,
  HouseholdItemStatus,
  HouseholdItemVendorSummary,
  HouseholdItemDepRef,
  HouseholdItemDepDetail,
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

describe('HouseholdItemCategory type', () => {
  it('accepts all 8 valid category values', () => {
    const categories: HouseholdItemCategory[] = [
      'furniture',
      'appliances',
      'fixtures',
      'decor',
      'electronics',
      'outdoor',
      'storage',
      'other',
    ];

    expect(categories).toHaveLength(8);
    expect(categories).toContain('furniture');
    expect(categories).toContain('appliances');
    expect(categories).toContain('fixtures');
    expect(categories).toContain('decor');
    expect(categories).toContain('electronics');
    expect(categories).toContain('outdoor');
    expect(categories).toContain('storage');
    expect(categories).toContain('other');
  });

  it('each category value is a distinct string', () => {
    const categories: HouseholdItemCategory[] = [
      'furniture',
      'appliances',
      'fixtures',
      'decor',
      'electronics',
      'outdoor',
      'storage',
      'other',
    ];

    const unique = new Set(categories);
    expect(unique.size).toBe(8);
  });
});

describe('HouseholdItemStatus type', () => {
  it('accepts all 4 valid status values', () => {
    const statuses: HouseholdItemStatus[] = ['not_ordered', 'ordered', 'in_transit', 'delivered'];

    expect(statuses).toHaveLength(4);
    expect(statuses).toContain('not_ordered');
    expect(statuses).toContain('ordered');
    expect(statuses).toContain('in_transit');
    expect(statuses).toContain('delivered');
  });

  it('each status value is a distinct string', () => {
    const statuses: HouseholdItemStatus[] = ['not_ordered', 'ordered', 'in_transit', 'delivered'];
    const unique = new Set(statuses);
    expect(unique.size).toBe(4);
  });
});

describe('HouseholdItemVendorSummary interface', () => {
  it('constructs a valid vendor summary with all fields', () => {
    const vendor: HouseholdItemVendorSummary = {
      id: 'vendor-1',
      name: 'IKEA',
      specialty: 'Furniture',
    };

    expect(vendor.id).toBe('vendor-1');
    expect(vendor.name).toBe('IKEA');
    expect(vendor.specialty).toBe('Furniture');
  });

  it('allows specialty to be null', () => {
    const vendor: HouseholdItemVendorSummary = {
      id: 'vendor-2',
      name: 'Generic Supplier',
      specialty: null,
    };

    expect(vendor.specialty).toBeNull();
  });
});

describe('WorkItemLinkedHouseholdItemSummary interface', () => {
  it('constructs a valid household item summary with all fields populated', () => {
    const householdItem: WorkItemLinkedHouseholdItemSummary = {
      id: 'hi-1',
      name: 'Leather Sofa',
      category: 'furniture',
      status: 'delivered',
      expectedDeliveryDate: '2026-05-15',
      earliestDeliveryDate: '2026-05-15',
      latestDeliveryDate: '2026-05-20',
    };

    expect(householdItem.id).toBe('hi-1');
    expect(householdItem.name).toBe('Leather Sofa');
    expect(householdItem.category).toBe('furniture');
    expect(householdItem.status).toBe('delivered');
    expect(householdItem.expectedDeliveryDate).toBe('2026-05-15');
    expect(householdItem.earliestDeliveryDate).toBe('2026-05-15');
    expect(householdItem.latestDeliveryDate).toBe('2026-05-20');
  });

  it('allows delivery dates to be null', () => {
    const householdItem: WorkItemLinkedHouseholdItemSummary = {
      id: 'hi-2',
      name: 'Wall Paint',
      category: 'decor',
      status: 'not_ordered',
      expectedDeliveryDate: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
    };

    expect(householdItem.expectedDeliveryDate).toBeNull();
    expect(householdItem.earliestDeliveryDate).toBeNull();
    expect(householdItem.latestDeliveryDate).toBeNull();
    expect(householdItem.category).toBe('decor');
    expect(householdItem.status).toBe('not_ordered');
  });

  it('accepts all valid category values', () => {
    const categories: HouseholdItemCategory[] = [
      'furniture',
      'appliances',
      'fixtures',
      'decor',
      'electronics',
      'outdoor',
      'storage',
      'other',
    ];

    for (const category of categories) {
      const householdItem: WorkItemLinkedHouseholdItemSummary = {
        id: `hi-cat-${category}`,
        name: `Item in ${category}`,
        category,
        status: 'ordered',
        expectedDeliveryDate: '2026-06-01',
        earliestDeliveryDate: '2026-05-20',
        latestDeliveryDate: '2026-06-10',
      };
      expect(householdItem.category).toBe(category);
    }
  });

  it('accepts all valid status values', () => {
    const statuses: HouseholdItemStatus[] = ['not_ordered', 'ordered', 'in_transit', 'delivered'];

    for (const status of statuses) {
      const householdItem: WorkItemLinkedHouseholdItemSummary = {
        id: `hi-status-${status}`,
        name: `Item with status ${status}`,
        category: 'furniture',
        status,
        expectedDeliveryDate: '2026-06-01',
        earliestDeliveryDate: '2026-05-20',
        latestDeliveryDate: '2026-06-10',
      };
      expect(householdItem.status).toBe(status);
    }
  });
});

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

describe('HouseholdItemSummary interface', () => {
  it('constructs a valid summary object with all required fields', () => {
    const summary: HouseholdItemSummary = {
      id: 'item-1',
      name: 'Leather Sofa',
      description: 'A 3-seat leather sofa',
      category: 'furniture',
      status: 'ordered',
      vendor: {
        id: 'vendor-1',
        name: 'IKEA',
        specialty: null,
      },
      room: 'Living Room',
      quantity: 1,
      orderDate: '2025-01-15',
      expectedDeliveryDate: '2025-02-15',
      actualDeliveryDate: null,
      earliestDeliveryDate: '2025-02-10',
      latestDeliveryDate: '2025-02-20',
      url: 'https://example.com/sofa',
      tagIds: ['tag-1', 'tag-2'],
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
    expect(summary.category).toBe('furniture');
    expect(summary.status).toBe('ordered');
    expect(summary.vendor?.name).toBe('IKEA');
    expect(summary.tagIds).toHaveLength(2);
    expect(summary.budgetLineCount).toBe(2);
    expect(summary.totalPlannedAmount).toBe(1200.0);
    expect(summary.earliestDeliveryDate).toBe('2025-02-10');
    expect(summary.latestDeliveryDate).toBe('2025-02-20');
  });

  it('allows vendor and delivery dates to be null', () => {
    const summary: HouseholdItemSummary = {
      id: 'item-2',
      name: 'Dining Table',
      description: null,
      category: 'furniture',
      status: 'not_ordered',
      vendor: null,
      room: null,
      quantity: 1,
      orderDate: null,
      expectedDeliveryDate: null,
      actualDeliveryDate: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      url: null,
      tagIds: [],
      budgetLineCount: 0,
      totalPlannedAmount: 0,
      budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
      createdBy: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };

    expect(summary.vendor).toBeNull();
    expect(summary.description).toBeNull();
    expect(summary.room).toBeNull();
    expect(summary.tagIds).toHaveLength(0);
    expect(summary.earliestDeliveryDate).toBeNull();
    expect(summary.latestDeliveryDate).toBeNull();
  });
});

describe('HouseholdItemDetail interface', () => {
  it('extends HouseholdItemSummary with additional detail fields', () => {
    const detail: HouseholdItemDetail = {
      // Fields from HouseholdItemSummary (url and createdBy are now part of summary)
      id: 'item-detail-1',
      name: 'Smart TV',
      description: '65-inch 4K OLED television',
      category: 'electronics',
      status: 'delivered',
      vendor: null,
      room: 'Living Room',
      quantity: 1,
      orderDate: '2025-01-01',
      expectedDeliveryDate: '2025-01-20',
      actualDeliveryDate: '2025-01-18',
      earliestDeliveryDate: '2025-01-15',
      latestDeliveryDate: '2025-01-25',
      url: 'https://example.com/tv',
      tagIds: ['tag-electronics'],
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
      // Additional HouseholdItemDetail fields
      tags: [
        {
          id: 'tag-electronics',
          name: 'electronics',
          color: '#0000ff',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ],
      dependencies: [
        {
          householdItemId: 'item-detail-1',
          predecessorType: 'work_item',
          predecessorId: 'wi-1',
          dependencyType: 'finish_to_start',
          leadLagDays: 0,
          predecessor: {
            id: 'wi-1',
            title: 'Mount TV',
            status: 'not_started',
            endDate: '2026-05-05',
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
    expect(detail.category).toBe('electronics');
    expect(detail.totalPlannedAmount).toBe(1999.99);

    // Detail-specific fields present
    expect(detail.url).toBe('https://example.com/tv');
    expect(detail.createdBy?.displayName).toBe('Alice');
    expect(detail.tags).toHaveLength(1);
    expect(detail.dependencies).toHaveLength(1);
    expect(detail.subsidies).toHaveLength(1);
    expect(detail.subsidies[0].applicationStatus).toBe('applied');
    expect(detail.earliestDeliveryDate).toBe('2025-01-15');
    expect(detail.latestDeliveryDate).toBe('2025-01-25');
  });

  it('allows url and createdBy to be null', () => {
    const detail: HouseholdItemDetail = {
      id: 'item-detail-2',
      name: 'Bookshelf',
      description: null,
      category: 'storage',
      status: 'not_ordered',
      vendor: null,
      room: null,
      quantity: 1,
      orderDate: null,
      expectedDeliveryDate: null,
      actualDeliveryDate: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      tagIds: [],
      budgetLineCount: 0,
      totalPlannedAmount: 0,
      budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      url: null,
      createdBy: null,
      tags: [],
      dependencies: [],
      subsidies: [],
    };

    expect(detail.url).toBeNull();
    expect(detail.createdBy).toBeNull();
    expect(detail.tags).toHaveLength(0);
    expect(detail.dependencies).toHaveLength(0);
    expect(detail.subsidies).toHaveLength(0);
    expect(detail.earliestDeliveryDate).toBeNull();
    expect(detail.latestDeliveryDate).toBeNull();
  });
});

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
    expect(request.room).toBeUndefined();
    expect(request.quantity).toBeUndefined();
    expect(request.orderDate).toBeUndefined();
    expect(request.expectedDeliveryDate).toBeUndefined();
    expect(request.actualDeliveryDate).toBeUndefined();
  });

  it('accepts all optional fields', () => {
    const request: CreateHouseholdItemRequest = {
      name: 'Sofa',
      description: 'A comfortable sofa',
      category: 'furniture',
      status: 'ordered',
      vendorId: 'vendor-1',
      url: 'https://example.com/sofa',
      room: 'Living Room',
      quantity: 2,
      orderDate: '2025-01-15',
      expectedDeliveryDate: '2025-02-15',
      actualDeliveryDate: null,
    };

    expect(request.category).toBe('furniture');
    expect(request.status).toBe('ordered');
    expect(request.quantity).toBe(2);
    expect(request.actualDeliveryDate).toBeNull();
  });

  it('accepts null for nullable optional fields', () => {
    const request: CreateHouseholdItemRequest = {
      name: 'Chair',
      description: null,
      vendorId: null,
      url: null,
      room: null,
      orderDate: null,
      expectedDeliveryDate: null,
      actualDeliveryDate: null,
    };

    expect(request.description).toBeNull();
    expect(request.vendorId).toBeNull();
    expect(request.url).toBeNull();
    expect(request.room).toBeNull();
  });
});

describe('UpdateHouseholdItemRequest interface', () => {
  it('allows single field update', () => {
    const request: UpdateHouseholdItemRequest = {
      status: 'delivered',
    };

    expect(request.status).toBe('delivered');
    expect(request.name).toBeUndefined();
    expect(request.category).toBeUndefined();
  });

  it('allows updating name only', () => {
    const request: UpdateHouseholdItemRequest = {
      name: 'Updated Sofa Name',
    };

    expect(request.name).toBe('Updated Sofa Name');
  });

  it('allows updating multiple fields at once', () => {
    const request: UpdateHouseholdItemRequest = {
      status: 'in_transit',
      expectedDeliveryDate: '2025-03-01',
      room: 'Bedroom',
    };

    expect(request.status).toBe('in_transit');
    expect(request.expectedDeliveryDate).toBe('2025-03-01');
    expect(request.room).toBe('Bedroom');
  });

  it('allows all fields to be undefined (empty update)', () => {
    const request: UpdateHouseholdItemRequest = {};
    expect(Object.keys(request)).toHaveLength(0);
  });
});

describe('HouseholdItemListQuery interface', () => {
  it('allows all optional query parameters', () => {
    const query: HouseholdItemListQuery = {
      page: 2,
      pageSize: 20,
      q: 'sofa',
      category: 'furniture',
      status: 'ordered',
      room: 'Living Room',
      sortBy: 'name',
      sortOrder: 'asc',
    };

    expect(query.page).toBe(2);
    expect(query.pageSize).toBe(20);
    expect(query.q).toBe('sofa');
    expect(query.category).toBe('furniture');
    expect(query.status).toBe('ordered');
    expect(query.room).toBe('Living Room');
    expect(query.sortBy).toBe('name');
    expect(query.sortOrder).toBe('asc');
  });

  it('accepts vendorId and tagId filter parameters', () => {
    const queryWithVendor: HouseholdItemListQuery = { vendorId: 'vendor-1' };
    expect(queryWithVendor.vendorId).toBe('vendor-1');

    const queryWithTag: HouseholdItemListQuery = { tagId: 'tag-abc' };
    expect(queryWithTag.tagId).toBe('tag-abc');

    const queryWithBoth: HouseholdItemListQuery = {
      vendorId: 'vendor-2',
      tagId: 'tag-xyz',
    };
    expect(queryWithBoth.vendorId).toBe('vendor-2');
    expect(queryWithBoth.tagId).toBe('tag-xyz');
  });

  it('accepts all sortBy values', () => {
    const sortByValues: NonNullable<HouseholdItemListQuery['sortBy']>[] = [
      'name',
      'category',
      'status',
      'room',
      'order_date',
      'expected_delivery_date',
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

describe('HouseholdItemListResponse type', () => {
  it('is a PaginatedResponse of HouseholdItemSummary', () => {
    const response: HouseholdItemListResponse = {
      items: [
        {
          id: 'item-1',
          name: 'Sofa',
          description: null,
          category: 'furniture',
          status: 'not_ordered',
          vendor: null,
          room: null,
          quantity: 1,
          orderDate: null,
          expectedDeliveryDate: null,
          actualDeliveryDate: null,
          earliestDeliveryDate: null,
          latestDeliveryDate: null,
          url: null,
          tagIds: [],
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

    // Verify structural compatibility with PaginatedResponse
    const paginated: PaginatedResponse<(typeof response.items)[0]> = response;
    expect(paginated.items).toHaveLength(1);
    expect(paginated.pagination.totalItems).toBe(1);
    expect(response.items[0].name).toBe('Sofa');
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

describe('HouseholdItemResponse interface', () => {
  it('wraps a HouseholdItemDetail in the householdItem field', () => {
    const response: HouseholdItemResponse = {
      householdItem: {
        id: 'item-resp-1',
        name: 'Armchair',
        description: null,
        category: 'furniture',
        status: 'not_ordered',
        vendor: null,
        room: null,
        quantity: 1,
        orderDate: null,
        expectedDeliveryDate: null,
        actualDeliveryDate: null,
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
        tagIds: [],
        budgetLineCount: 0,
        totalPlannedAmount: 0,
        budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        url: null,
        createdBy: null,
        tags: [],
        dependencies: [],
        subsidies: [],
      },
    };

    expect(response.householdItem.id).toBe('item-resp-1');
    expect(response.householdItem.name).toBe('Armchair');
    expect(response.householdItem.category).toBe('furniture');
    expect(response.householdItem.tags).toHaveLength(0);
  });
});

describe('HouseholdItem entity interface', () => {
  it('constructs a valid HouseholdItem with all required fields', () => {
    const item: HouseholdItem = {
      id: 'item-entity-1',
      name: 'Coffee Table',
      description: 'Oak wood coffee table',
      category: 'furniture',
      status: 'delivered',
      vendorId: 'vendor-1',
      url: 'https://example.com/table',
      room: 'Living Room',
      quantity: 1,
      orderDate: '2025-01-01',
      expectedDeliveryDate: '2025-02-01',
      actualDeliveryDate: '2025-01-28',
      createdBy: 'user-1',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-28T00:00:00Z',
    };

    expect(item.id).toBe('item-entity-1');
    expect(item.name).toBe('Coffee Table');
    expect(item.category).toBe('furniture');
    expect(item.status).toBe('delivered');
    expect(item.vendorId).toBe('vendor-1');
    expect(item.quantity).toBe(1);
    expect(item.actualDeliveryDate).toBe('2025-01-28');
  });

  it('allows all nullable fields to be null', () => {
    const item: HouseholdItem = {
      id: 'item-entity-2',
      name: 'Lamp',
      description: null,
      category: 'decor',
      status: 'not_ordered',
      vendorId: null,
      url: null,
      room: null,
      quantity: 1,
      orderDate: null,
      expectedDeliveryDate: null,
      actualDeliveryDate: null,
      createdBy: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };

    expect(item.description).toBeNull();
    expect(item.vendorId).toBeNull();
    expect(item.url).toBeNull();
    expect(item.room).toBeNull();
    expect(item.orderDate).toBeNull();
    expect(item.expectedDeliveryDate).toBeNull();
    expect(item.actualDeliveryDate).toBeNull();
    expect(item.createdBy).toBeNull();
  });
});
