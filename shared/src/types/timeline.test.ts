/**
 * Type-level tests for shared timeline types.
 *
 * Verifies that timeline interfaces are correctly shaped after the
 * Areas & Trades rework (Story #1030):
 * - tags removed from TimelineWorkItem
 * - area (AreaSummary) present on TimelineWorkItem
 * - assignedVendor uses VendorSummary with trade (not specialty)
 */

import { describe, it, expect } from '@jest/globals';
import type {
  TimelineWorkItem,
  TimelineDependency,
  TimelineMilestone,
  TimelineHouseholdItem,
  TimelineDateRange,
  TimelineResponse,
} from './timeline.js';
import type { AreaSummary } from './area.js';
import type { VendorSummary } from './workItem.js';

// ---------------------------------------------------------------------------
// TimelineWorkItem interface
// ---------------------------------------------------------------------------

describe('TimelineWorkItem interface', () => {
  it('constructs a valid timeline work item with area and assignedVendor', () => {
    const item: TimelineWorkItem = {
      id: 'wi-001',
      title: 'Install Kitchen Tiles',
      status: 'in_progress',
      startDate: '2026-05-01',
      endDate: '2026-05-15',
      actualStartDate: '2026-05-02',
      actualEndDate: null,
      durationDays: 14,
      startAfter: null,
      startBefore: null,
      assignedUser: { id: 'user-1', displayName: 'Alice', email: 'alice@example.com' },
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
      area: { id: 'area-kitchen', name: 'Kitchen', color: '#FF5733', ancestors: [] },
    };

    expect(item.id).toBe('wi-001');
    expect(item.title).toBe('Install Kitchen Tiles');
    expect(item.status).toBe('in_progress');
    expect(item.assignedVendor?.trade?.name).toBe('Tiling');
    expect(item.area?.id).toBe('area-kitchen');
    expect(item.area?.name).toBe('Kitchen');
  });

  it('allows assignedUser, assignedVendor, and area to be null', () => {
    const item: TimelineWorkItem = {
      id: 'wi-002',
      title: 'Unassigned Task',
      status: 'not_started',
      startDate: null,
      endDate: null,
      actualStartDate: null,
      actualEndDate: null,
      durationDays: null,
      startAfter: null,
      startBefore: null,
      assignedUser: null,
      assignedVendor: null,
      area: null,
    };

    expect(item.assignedUser).toBeNull();
    expect(item.assignedVendor).toBeNull();
    expect(item.area).toBeNull();
  });

  it('does not have tags field (removed in migration 0028)', () => {
    const item: TimelineWorkItem = {
      id: 'wi-003',
      title: 'No Tags',
      status: 'not_started',
      startDate: null,
      endDate: null,
      actualStartDate: null,
      actualEndDate: null,
      durationDays: null,
      startAfter: null,
      startBefore: null,
      assignedUser: null,
      assignedVendor: null,
      area: null,
    };

    expect((item as any).tags).toBeUndefined();
    expect((item as any).tagIds).toBeUndefined();
  });

  it('accepts optional requiredMilestoneIds array', () => {
    const item: TimelineWorkItem = {
      id: 'wi-004',
      title: 'Milestone Dependent Task',
      status: 'not_started',
      startDate: null,
      endDate: null,
      actualStartDate: null,
      actualEndDate: null,
      durationDays: null,
      startAfter: null,
      startBefore: null,
      assignedUser: null,
      assignedVendor: null,
      area: null,
      requiredMilestoneIds: [1, 2, 3],
    };

    expect(item.requiredMilestoneIds).toHaveLength(3);
    expect(item.requiredMilestoneIds).toContain(1);
  });

  it('requiredMilestoneIds is optional (undefined when not set)', () => {
    const item: TimelineWorkItem = {
      id: 'wi-005',
      title: 'No Milestone Deps',
      status: 'not_started',
      startDate: null,
      endDate: null,
      actualStartDate: null,
      actualEndDate: null,
      durationDays: null,
      startAfter: null,
      startBefore: null,
      assignedUser: null,
      assignedVendor: null,
      area: null,
    };

    expect(item.requiredMilestoneIds).toBeUndefined();
  });

  it('area color can be null', () => {
    const area: AreaSummary = { id: 'area-no-color', name: 'Uncolored Area', color: null, ancestors: [] };
    const item: TimelineWorkItem = {
      id: 'wi-006',
      title: 'Area No Color',
      status: 'not_started',
      startDate: null,
      endDate: null,
      actualStartDate: null,
      actualEndDate: null,
      durationDays: null,
      startAfter: null,
      startBefore: null,
      assignedUser: null,
      assignedVendor: null,
      area,
    };

    expect(item.area?.color).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TimelineDependency interface
// ---------------------------------------------------------------------------

describe('TimelineDependency interface', () => {
  it('constructs a valid dependency edge', () => {
    const dep: TimelineDependency = {
      predecessorId: 'wi-001',
      successorId: 'wi-002',
      dependencyType: 'finish_to_start',
      leadLagDays: 0,
    };

    expect(dep.predecessorId).toBe('wi-001');
    expect(dep.successorId).toBe('wi-002');
    expect(dep.dependencyType).toBe('finish_to_start');
    expect(dep.leadLagDays).toBe(0);
  });

  it('allows positive leadLagDays (lag) and negative (lead)', () => {
    const withLag: TimelineDependency = {
      predecessorId: 'a',
      successorId: 'b',
      dependencyType: 'finish_to_start',
      leadLagDays: 7,
    };

    const withLead: TimelineDependency = {
      predecessorId: 'a',
      successorId: 'c',
      dependencyType: 'start_to_start',
      leadLagDays: -2,
    };

    expect(withLag.leadLagDays).toBe(7);
    expect(withLead.leadLagDays).toBe(-2);
    expect(withLead.dependencyType).toBe('start_to_start');
  });
});

// ---------------------------------------------------------------------------
// TimelineMilestone interface
// ---------------------------------------------------------------------------

describe('TimelineMilestone interface', () => {
  it('constructs a valid milestone with all fields', () => {
    const milestone: TimelineMilestone = {
      id: 1,
      title: 'Foundation Complete',
      targetDate: '2026-03-01',
      isCompleted: true,
      completedAt: '2026-03-01T14:00:00Z',
      color: '#22C55E',
      workItemIds: ['wi-001', 'wi-002'],
      projectedDate: '2026-03-01',
      isCritical: true,
    };

    expect(milestone.id).toBe(1);
    expect(milestone.title).toBe('Foundation Complete');
    expect(milestone.isCompleted).toBe(true);
    expect(milestone.completedAt).toBe('2026-03-01T14:00:00Z');
    expect(milestone.workItemIds).toHaveLength(2);
    expect(milestone.isCritical).toBe(true);
  });

  it('allows completedAt, color, and projectedDate to be null', () => {
    const milestone: TimelineMilestone = {
      id: 2,
      title: 'Framing Start',
      targetDate: '2026-04-01',
      isCompleted: false,
      completedAt: null,
      color: null,
      workItemIds: [],
      projectedDate: null,
      isCritical: false,
    };

    expect(milestone.completedAt).toBeNull();
    expect(milestone.color).toBeNull();
    expect(milestone.projectedDate).toBeNull();
    expect(milestone.workItemIds).toHaveLength(0);
    expect(milestone.isCritical).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TimelineHouseholdItem interface
// ---------------------------------------------------------------------------

describe('TimelineHouseholdItem interface', () => {
  it('constructs a valid timeline household item with dependency refs', () => {
    const hi: TimelineHouseholdItem = {
      id: 'hi-001',
      name: 'Kitchen Island',
      category: 'hic-furniture',
      status: 'planned',
      targetDeliveryDate: '2026-06-01',
      earliestDeliveryDate: '2026-05-25',
      latestDeliveryDate: '2026-06-07',
      actualDeliveryDate: null,
      isLate: false,
      dependencyIds: [
        { predecessorType: 'work_item', predecessorId: 'wi-001' },
        { predecessorType: 'milestone', predecessorId: '1' },
      ],
    };

    expect(hi.id).toBe('hi-001');
    expect(hi.name).toBe('Kitchen Island');
    expect(hi.category).toBe('hic-furniture');
    expect(hi.dependencyIds).toHaveLength(2);
    expect(hi.dependencyIds[0].predecessorType).toBe('work_item');
    expect(hi.dependencyIds[1].predecessorType).toBe('milestone');
  });

  it('allows delivery dates to be null and dependencyIds to be empty', () => {
    const hi: TimelineHouseholdItem = {
      id: 'hi-002',
      name: 'Lamp',
      category: 'hic-decor',
      status: 'planned',
      targetDeliveryDate: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      actualDeliveryDate: null,
      isLate: false,
      dependencyIds: [],
    };

    expect(hi.targetDeliveryDate).toBeNull();
    expect(hi.dependencyIds).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TimelineDateRange interface
// ---------------------------------------------------------------------------

describe('TimelineDateRange interface', () => {
  it('constructs a valid date range', () => {
    const range: TimelineDateRange = {
      earliest: '2026-01-01',
      latest: '2026-12-31',
    };

    expect(range.earliest).toBe('2026-01-01');
    expect(range.latest).toBe('2026-12-31');
  });
});

// ---------------------------------------------------------------------------
// TimelineResponse interface (top-level)
// ---------------------------------------------------------------------------

describe('TimelineResponse interface', () => {
  it('constructs a full timeline response with all sections', () => {
    const response: TimelineResponse = {
      workItems: [
        {
          id: 'wi-resp-1',
          title: 'Tile Bathroom',
          status: 'not_started',
          startDate: '2026-04-01',
          endDate: '2026-04-10',
          actualStartDate: null,
          actualEndDate: null,
          durationDays: 9,
          startAfter: null,
          startBefore: null,
          assignedUser: null,
          assignedVendor: {
            id: 'v-001',
            name: 'Tile Co',
            trade: {
              id: 'trade-tiling',
              name: 'Tiling',
              color: '#06B6D4',
              translationKey: 'trades.tiling',
            },
          },
          area: { id: 'area-bathroom', name: 'Bathroom', color: '#3B82F6', ancestors: [] },
        },
      ],
      dependencies: [
        {
          predecessorId: 'wi-resp-1',
          successorId: 'wi-resp-2',
          dependencyType: 'finish_to_start',
          leadLagDays: 0,
        },
      ],
      milestones: [
        {
          id: 1,
          title: 'Phase 1 Complete',
          targetDate: '2026-05-01',
          isCompleted: false,
          completedAt: null,
          color: null,
          workItemIds: ['wi-resp-1'],
          projectedDate: '2026-04-10',
          isCritical: false,
        },
      ],
      householdItems: [
        {
          id: 'hi-resp-1',
          name: 'Bath Towel Set',
          category: 'hic-other',
          status: 'planned',
          targetDeliveryDate: '2026-04-15',
          earliestDeliveryDate: null,
          latestDeliveryDate: null,
          actualDeliveryDate: null,
          isLate: false,
          dependencyIds: [{ predecessorType: 'work_item', predecessorId: 'wi-resp-1' }],
        },
      ],
      criticalPath: ['wi-resp-1'],
      dateRange: {
        earliest: '2026-04-01',
        latest: '2026-04-10',
      },
    };

    expect(response.workItems).toHaveLength(1);
    expect(response.workItems[0].assignedVendor?.trade?.name).toBe('Tiling');
    expect(response.workItems[0].area?.name).toBe('Bathroom');
    expect(response.dependencies).toHaveLength(1);
    expect(response.milestones).toHaveLength(1);
    expect(response.householdItems).toHaveLength(1);
    expect(response.criticalPath).toContain('wi-resp-1');
    expect(response.dateRange?.earliest).toBe('2026-04-01');
  });

  it('allows dateRange to be null when no work items have dates', () => {
    const response: TimelineResponse = {
      workItems: [],
      dependencies: [],
      milestones: [],
      householdItems: [],
      criticalPath: [],
      dateRange: null,
    };

    expect(response.workItems).toHaveLength(0);
    expect(response.dateRange).toBeNull();
  });

  it('workItems no longer have tags field', () => {
    const response: TimelineResponse = {
      workItems: [
        {
          id: 'wi-no-tags',
          title: 'Task',
          status: 'not_started',
          startDate: null,
          endDate: null,
          actualStartDate: null,
          actualEndDate: null,
          durationDays: null,
          startAfter: null,
          startBefore: null,
          assignedUser: null,
          assignedVendor: null,
          area: null,
        },
      ],
      dependencies: [],
      milestones: [],
      householdItems: [],
      criticalPath: [],
      dateRange: null,
    };

    expect((response.workItems[0] as any).tags).toBeUndefined();
  });
});
