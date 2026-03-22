/**
 * Type-level tests for shared work item types.
 *
 * Verifies TypeScript interfaces for WorkItem, WorkItemSummary, WorkItemDetail,
 * and request/query types after the Areas & Trades rework (Story #1030):
 * - tags/tagIds fields removed
 * - area (AreaSummary) added to summary and detail
 * - assignedVendor (VendorSummary with trade) present
 * - areaId and assignedVendorId added to create/update requests
 */

import { describe, it, expect } from '@jest/globals';
import type {
  WorkItemStatus,
  UserSummary,
  VendorSummary,
  WorkItem,
  WorkItemSummary,
  WorkItemDetail,
  DependencyResponse,
  CreateWorkItemRequest,
  UpdateWorkItemRequest,
  WorkItemListQuery,
  WorkItemListResponse,
  WorkItemDependenciesResponse,
  MilestoneSummaryForWorkItem,
  WorkItemMilestones,
} from './workItem.js';
import type { AreaSummary } from './area.js';

// ---------------------------------------------------------------------------
// WorkItemStatus type
// ---------------------------------------------------------------------------

describe('WorkItemStatus type', () => {
  it('accepts all 3 valid status values', () => {
    const statuses: WorkItemStatus[] = ['not_started', 'in_progress', 'completed'];

    expect(statuses).toHaveLength(3);
    expect(statuses).toContain('not_started');
    expect(statuses).toContain('in_progress');
    expect(statuses).toContain('completed');
  });

  it('each status value is distinct', () => {
    const statuses: WorkItemStatus[] = ['not_started', 'in_progress', 'completed'];
    const unique = new Set(statuses);
    expect(unique.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// VendorSummary interface (has trade instead of specialty)
// ---------------------------------------------------------------------------

describe('VendorSummary interface', () => {
  it('constructs a valid vendor summary with a trade object', () => {
    const vendor: VendorSummary = {
      id: 'v-001',
      name: 'Acme Plumbing',
      trade: {
        id: 'trade-plumbing',
        name: 'Plumbing',
        color: '#0EA5E9',
        translationKey: 'trades.plumbing',
      },
    };

    expect(vendor.id).toBe('v-001');
    expect(vendor.name).toBe('Acme Plumbing');
    expect(vendor.trade?.id).toBe('trade-plumbing');
    expect(vendor.trade?.name).toBe('Plumbing');
  });

  it('allows trade to be null', () => {
    const vendor: VendorSummary = {
      id: 'v-002',
      name: 'General Services',
      trade: null,
    };

    expect(vendor.trade).toBeNull();
  });

  it('does not have specialty field', () => {
    const vendor: VendorSummary = {
      id: 'v-003',
      name: 'Test Vendor',
      trade: null,
    };

    expect((vendor as any).specialty).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UserSummary interface
// ---------------------------------------------------------------------------

describe('UserSummary interface', () => {
  it('constructs a valid user summary with all required fields', () => {
    const user: UserSummary = {
      id: 'user-001',
      displayName: 'Alice Builder',
      email: 'alice@example.com',
    };

    expect(user.id).toBe('user-001');
    expect(user.displayName).toBe('Alice Builder');
    expect(user.email).toBe('alice@example.com');
  });
});

// ---------------------------------------------------------------------------
// WorkItemSummary interface (has area and assignedVendor, no tags)
// ---------------------------------------------------------------------------

describe('WorkItemSummary interface', () => {
  it('constructs a valid work item summary with area and assignedVendor', () => {
    const summary: WorkItemSummary = {
      id: 'wi-001',
      title: 'Install Bathroom Tiles',
      status: 'in_progress',
      startDate: '2026-04-01',
      endDate: '2026-04-15',
      actualStartDate: '2026-04-02',
      actualEndDate: null,
      durationDays: 14,
      assignedUser: { id: 'user-1', displayName: 'Bob', email: 'bob@example.com' },
      assignedVendor: {
        id: 'v-001',
        name: 'Tile Masters',
        trade: {
          id: 'trade-tiling',
          name: 'Tiling',
          color: '#06B6D4',
          translationKey: 'trades.tiling',
        },
      },
      area: { id: 'area-bathroom', name: 'Bathroom', color: '#3B82F6' },
      budgetLineCount: 3,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-04-02T00:00:00Z',
    };

    expect(summary.id).toBe('wi-001');
    expect(summary.title).toBe('Install Bathroom Tiles');
    expect(summary.status).toBe('in_progress');
    expect(summary.assignedVendor?.trade?.name).toBe('Tiling');
    expect(summary.area?.id).toBe('area-bathroom');
    expect(summary.area?.name).toBe('Bathroom');
    expect(summary.budgetLineCount).toBe(3);
  });

  it('allows assignedUser, assignedVendor, and area to be null', () => {
    const summary: WorkItemSummary = {
      id: 'wi-002',
      title: 'Unassigned Task',
      status: 'not_started',
      startDate: null,
      endDate: null,
      actualStartDate: null,
      actualEndDate: null,
      durationDays: null,
      assignedUser: null,
      assignedVendor: null,
      area: null,
      budgetLineCount: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    expect(summary.assignedUser).toBeNull();
    expect(summary.assignedVendor).toBeNull();
    expect(summary.area).toBeNull();
    expect(summary.budgetLineCount).toBe(0);
  });

  it('does not have tags or tagIds fields (removed in migration 0028)', () => {
    const summary: WorkItemSummary = {
      id: 'wi-003',
      title: 'No Tags',
      status: 'not_started',
      startDate: null,
      endDate: null,
      actualStartDate: null,
      actualEndDate: null,
      durationDays: null,
      assignedUser: null,
      assignedVendor: null,
      area: null,
      budgetLineCount: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    expect((summary as any).tags).toBeUndefined();
    expect((summary as any).tagIds).toBeUndefined();
  });

  it('accepts all 3 work item status values', () => {
    const statuses: WorkItemStatus[] = ['not_started', 'in_progress', 'completed'];

    for (const status of statuses) {
      const summary: WorkItemSummary = {
        id: `wi-${status}`,
        title: `Task with status ${status}`,
        status,
        startDate: null,
        endDate: null,
        actualStartDate: null,
        actualEndDate: null,
        durationDays: null,
        assignedUser: null,
        assignedVendor: null,
        area: null,
        budgetLineCount: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      expect(summary.status).toBe(status);
    }
  });
});

// ---------------------------------------------------------------------------
// WorkItemDetail interface
// ---------------------------------------------------------------------------

describe('WorkItemDetail interface', () => {
  it('constructs a valid detail object with area and assignedVendor', () => {
    const detail: WorkItemDetail = {
      id: 'wi-detail-1',
      title: 'Install Kitchen Cabinets',
      description: 'Upper and lower cabinet installation',
      status: 'not_started',
      startDate: '2026-05-01',
      endDate: '2026-05-10',
      actualStartDate: null,
      actualEndDate: null,
      durationDays: 9,
      startAfter: null,
      startBefore: null,
      assignedUser: null,
      createdBy: { id: 'user-1', displayName: 'Alice', email: 'alice@example.com' },
      assignedVendor: {
        id: 'v-001',
        name: 'Cabinet Co',
        trade: {
          id: 'trade-carpentry',
          name: 'Carpentry',
          color: '#92400E',
          translationKey: 'trades.carpentry',
        },
      },
      area: { id: 'area-kitchen', name: 'Kitchen', color: '#FF5733' },
      subtasks: [],
      dependencies: { predecessors: [], successors: [] },
      budgets: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    expect(detail.id).toBe('wi-detail-1');
    expect(detail.assignedVendor?.trade?.name).toBe('Carpentry');
    expect(detail.area?.name).toBe('Kitchen');
    expect(detail.subtasks).toHaveLength(0);
    expect(detail.budgets).toHaveLength(0);
    expect(detail.dependencies.predecessors).toHaveLength(0);
    expect(detail.dependencies.successors).toHaveLength(0);
  });

  it('allows all nullable fields to be null and arrays to be empty', () => {
    const detail: WorkItemDetail = {
      id: 'wi-detail-2',
      title: 'Minimal Task',
      description: null,
      status: 'not_started',
      startDate: null,
      endDate: null,
      actualStartDate: null,
      actualEndDate: null,
      durationDays: null,
      startAfter: null,
      startBefore: null,
      assignedUser: null,
      createdBy: null,
      assignedVendor: null,
      area: null,
      subtasks: [],
      dependencies: { predecessors: [], successors: [] },
      budgets: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    expect(detail.description).toBeNull();
    expect(detail.assignedVendor).toBeNull();
    expect(detail.area).toBeNull();
    expect(detail.createdBy).toBeNull();
  });

  it('does not have tags or tagIds fields', () => {
    const detail: WorkItemDetail = {
      id: 'wi-detail-3',
      title: 'No Tags Task',
      description: null,
      status: 'not_started',
      startDate: null,
      endDate: null,
      actualStartDate: null,
      actualEndDate: null,
      durationDays: null,
      startAfter: null,
      startBefore: null,
      assignedUser: null,
      createdBy: null,
      assignedVendor: null,
      area: null,
      subtasks: [],
      dependencies: { predecessors: [], successors: [] },
      budgets: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    expect((detail as any).tags).toBeUndefined();
    expect((detail as any).tagIds).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// CreateWorkItemRequest interface (areaId and assignedVendorId)
// ---------------------------------------------------------------------------

describe('CreateWorkItemRequest interface', () => {
  it('requires only title — all other fields optional', () => {
    const request: CreateWorkItemRequest = {
      title: 'New Work Item',
    };

    expect(request.title).toBe('New Work Item');
    expect(request.description).toBeUndefined();
    expect(request.status).toBeUndefined();
    expect(request.assignedUserId).toBeUndefined();
    expect(request.assignedVendorId).toBeUndefined();
    expect(request.areaId).toBeUndefined();
  });

  it('accepts assignedVendorId and areaId as optional strings', () => {
    const request: CreateWorkItemRequest = {
      title: 'Plumbing Work',
      assignedVendorId: 'v-001',
      areaId: 'area-bathroom',
    };

    expect(request.assignedVendorId).toBe('v-001');
    expect(request.areaId).toBe('area-bathroom');
  });

  it('accepts null for nullable optional fields', () => {
    const request: CreateWorkItemRequest = {
      title: 'Task',
      description: null,
      assignedUserId: null,
      assignedVendorId: null,
      areaId: null,
    };

    expect(request.description).toBeNull();
    expect(request.assignedUserId).toBeNull();
    expect(request.assignedVendorId).toBeNull();
    expect(request.areaId).toBeNull();
  });

  it('accepts all optional fields', () => {
    const request: CreateWorkItemRequest = {
      title: 'Full Task',
      description: 'Detailed description',
      status: 'in_progress',
      startDate: '2026-05-01',
      endDate: '2026-05-15',
      actualStartDate: null,
      actualEndDate: null,
      durationDays: 14,
      startAfter: null,
      startBefore: null,
      assignedUserId: 'user-1',
      assignedVendorId: 'v-001',
      areaId: 'area-kitchen',
    };

    expect(request.title).toBe('Full Task');
    expect(request.status).toBe('in_progress');
    expect(request.durationDays).toBe(14);
    expect(request.assignedVendorId).toBe('v-001');
    expect(request.areaId).toBe('area-kitchen');
  });

  it('does not have tagIds field', () => {
    const request: CreateWorkItemRequest = { title: 'Test' };
    expect((request as any).tagIds).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// UpdateWorkItemRequest interface
// ---------------------------------------------------------------------------

describe('UpdateWorkItemRequest interface', () => {
  it('allows empty update (all fields optional)', () => {
    const request: UpdateWorkItemRequest = {};
    expect(Object.keys(request)).toHaveLength(0);
  });

  it('allows updating areaId only', () => {
    const request: UpdateWorkItemRequest = {
      areaId: 'area-bedroom',
    };

    expect(request.areaId).toBe('area-bedroom');
    expect(request.title).toBeUndefined();
  });

  it('allows clearing areaId to null', () => {
    const request: UpdateWorkItemRequest = { areaId: null };
    expect(request.areaId).toBeNull();
  });

  it('allows updating assignedVendorId', () => {
    const request: UpdateWorkItemRequest = {
      assignedVendorId: 'v-002',
    };

    expect(request.assignedVendorId).toBe('v-002');
  });

  it('allows clearing assignedVendorId to null', () => {
    const request: UpdateWorkItemRequest = { assignedVendorId: null };
    expect(request.assignedVendorId).toBeNull();
  });

  it('does not have tagIds field', () => {
    const request: UpdateWorkItemRequest = {};
    expect((request as any).tagIds).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// WorkItemListQuery interface (areaId and assignedVendorId filters)
// ---------------------------------------------------------------------------

describe('WorkItemListQuery interface', () => {
  it('accepts areaId and assignedVendorId filter parameters', () => {
    const query: WorkItemListQuery = {
      areaId: 'area-kitchen',
      assignedVendorId: 'v-001',
    };

    expect(query.areaId).toBe('area-kitchen');
    expect(query.assignedVendorId).toBe('v-001');
  });

  it('accepts all optional query parameters', () => {
    const query: WorkItemListQuery = {
      page: 1,
      pageSize: 25,
      status: 'in_progress',
      assignedUserId: 'user-1',
      assignedVendorId: 'v-001',
      areaId: 'area-kitchen',
      q: 'tile',
      sortBy: 'title',
      sortOrder: 'asc',
      budgetLinesMin: 0,
      budgetLinesMax: 10,
    };

    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(25);
    expect(query.status).toBe('in_progress');
    expect(query.assignedVendorId).toBe('v-001');
    expect(query.areaId).toBe('area-kitchen');
    expect(query.budgetLinesMin).toBe(0);
    expect(query.budgetLinesMax).toBe(10);
  });

  it('accepts all valid sortBy values', () => {
    const sortByValues: NonNullable<WorkItemListQuery['sortBy']>[] = [
      'title',
      'status',
      'start_date',
      'end_date',
      'created_at',
      'updated_at',
    ];

    for (const sortBy of sortByValues) {
      const query: WorkItemListQuery = { sortBy };
      expect(query.sortBy).toBe(sortBy);
    }
  });

  it('does not have tagId filter', () => {
    const query: WorkItemListQuery = {};
    expect((query as any).tagId).toBeUndefined();
  });

  it('allows empty query', () => {
    const query: WorkItemListQuery = {};
    expect(Object.keys(query)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DependencyResponse interface
// ---------------------------------------------------------------------------

describe('DependencyResponse interface', () => {
  it('constructs a valid dependency response with a work item summary', () => {
    const dep: DependencyResponse = {
      workItem: {
        id: 'wi-pred',
        title: 'Foundation Work',
        status: 'completed',
        startDate: '2026-01-01',
        endDate: '2026-02-01',
        actualStartDate: '2026-01-02',
        actualEndDate: '2026-02-03',
        durationDays: 31,
        assignedUser: null,
        assignedVendor: null,
        area: null,
        budgetLineCount: 2,
        createdAt: '2025-12-01T00:00:00Z',
        updatedAt: '2026-02-03T00:00:00Z',
      },
      dependencyType: 'finish_to_start',
      leadLagDays: 0,
    };

    expect(dep.workItem.id).toBe('wi-pred');
    expect(dep.dependencyType).toBe('finish_to_start');
    expect(dep.leadLagDays).toBe(0);
  });

  it('allows positive and negative leadLagDays (lead and lag)', () => {
    const withLag: DependencyResponse = {
      workItem: {
        id: 'wi-lag',
        title: 'Lag Task',
        status: 'not_started',
        startDate: null,
        endDate: null,
        actualStartDate: null,
        actualEndDate: null,
        durationDays: null,
        assignedUser: null,
        assignedVendor: null,
        area: null,
        budgetLineCount: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      dependencyType: 'finish_to_start',
      leadLagDays: 5,
    };

    const withLead: DependencyResponse = { ...withLag, leadLagDays: -3 };

    expect(withLag.leadLagDays).toBe(5);
    expect(withLead.leadLagDays).toBe(-3);
  });
});

// ---------------------------------------------------------------------------
// WorkItemDependenciesResponse interface
// ---------------------------------------------------------------------------

describe('WorkItemDependenciesResponse interface', () => {
  it('contains predecessors and successors arrays', () => {
    const response: WorkItemDependenciesResponse = {
      predecessors: [],
      successors: [],
    };

    expect(response.predecessors).toHaveLength(0);
    expect(response.successors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// MilestoneSummaryForWorkItem + WorkItemMilestones interfaces
// ---------------------------------------------------------------------------

describe('WorkItemMilestones interface', () => {
  it('contains required and linked milestone arrays', () => {
    const milestone: MilestoneSummaryForWorkItem = {
      id: 1,
      name: 'Foundation Complete',
      targetDate: '2026-03-01',
    };

    const milestones: WorkItemMilestones = {
      required: [milestone],
      linked: [],
    };

    expect(milestones.required).toHaveLength(1);
    expect(milestones.required[0].id).toBe(1);
    expect(milestones.required[0].name).toBe('Foundation Complete');
    expect(milestones.linked).toHaveLength(0);
  });

  it('allows targetDate to be null on MilestoneSummaryForWorkItem', () => {
    const milestone: MilestoneSummaryForWorkItem = {
      id: 2,
      name: 'TBD Milestone',
      targetDate: null,
    };

    expect(milestone.targetDate).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// WorkItemListResponse type
// ---------------------------------------------------------------------------

describe('WorkItemListResponse type', () => {
  it('is a PaginatedResponse of WorkItemSummary', () => {
    const response: WorkItemListResponse = {
      items: [
        {
          id: 'wi-list-1',
          title: 'Pave Driveway',
          status: 'not_started',
          startDate: null,
          endDate: null,
          actualStartDate: null,
          actualEndDate: null,
          durationDays: null,
          assignedUser: null,
          assignedVendor: null,
          area: null,
          budgetLineCount: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      },
    };

    expect(response.items).toHaveLength(1);
    expect(response.items[0].title).toBe('Pave Driveway');
    expect(response.pagination.totalItems).toBe(1);
    // Confirm no tags on list items
    expect((response.items[0] as any).tags).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// WorkItem entity interface
// ---------------------------------------------------------------------------

describe('WorkItem entity interface', () => {
  it('constructs a valid work item entity', () => {
    const item: WorkItem = {
      id: 'wi-entity-1',
      title: 'Install Flooring',
      description: 'Hardwood floor installation',
      status: 'in_progress',
      startDate: '2026-04-01',
      endDate: '2026-04-10',
      actualStartDate: '2026-04-01',
      actualEndDate: null,
      durationDays: 9,
      startAfter: null,
      startBefore: null,
      assignedUserId: 'user-1',
      createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
    };

    expect(item.id).toBe('wi-entity-1');
    expect(item.status).toBe('in_progress');
    expect(item.assignedUserId).toBe('user-1');
  });

  it('allows all nullable fields to be null', () => {
    const item: WorkItem = {
      id: 'wi-entity-2',
      title: 'Minimal Task',
      description: null,
      status: 'not_started',
      startDate: null,
      endDate: null,
      actualStartDate: null,
      actualEndDate: null,
      durationDays: null,
      startAfter: null,
      startBefore: null,
      assignedUserId: null,
      createdBy: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    expect(item.description).toBeNull();
    expect(item.assignedUserId).toBeNull();
    expect(item.createdBy).toBeNull();
    expect(item.startDate).toBeNull();
    expect(item.endDate).toBeNull();
  });
});
