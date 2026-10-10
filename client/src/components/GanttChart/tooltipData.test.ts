import { describe, it, expect } from '@jest/globals';
import type { AreaSummary, TimelineHouseholdItem, TimelineWorkItem } from '@cornerstone/shared';
import {
  AREA_PATH_SEPARATOR,
  ROW_HEIGHT,
  TOOLTIP_HEIGHT_BASE,
  buildHouseholdItemTooltipData,
  buildWorkItemTooltipData,
  estimateWorkItemTooltipHeight,
  formatAreaPath,
} from './tooltipData.js';
import type { GanttTooltipDependencyEntry, GanttTooltipWorkItemData } from './GanttTooltip.js';

const TODAY = new Date('2026-03-20T00:00:00Z');

const rootArea: AreaSummary = { id: 'a-root', name: 'Test House', color: null, ancestors: [] };
const nestedArea: AreaSummary = {
  id: 'a-kitchen',
  name: 'Test Kitchen',
  color: null,
  ancestors: [{ id: 'a-root', name: 'Test House', color: null }],
};

function makeWorkItem(overrides: Partial<TimelineWorkItem> = {}): TimelineWorkItem {
  return {
    id: 'wi-1',
    title: 'Test Task',
    status: 'in_progress',
    startDate: '2026-03-02',
    endDate: '2026-03-12',
    actualStartDate: null,
    actualEndDate: null,
    durationDays: 7,
    startAfter: null,
    startBefore: null,
    assignedUser: null,
    assignedVendor: null,
    area: null,
    ...overrides,
  };
}

function makeHouseholdItem(overrides: Partial<TimelineHouseholdItem> = {}): TimelineHouseholdItem {
  return {
    id: 'hi-1',
    name: 'Test Sofa',
    category: 'furniture',
    status: 'purchased',
    targetDeliveryDate: '2026-03-10',
    earliestDeliveryDate: '2026-03-08',
    latestDeliveryDate: '2026-03-14',
    actualDeliveryDate: null,
    isLate: false,
    dependencyIds: [],
    ...overrides,
  };
}

function dep(
  role: GanttTooltipDependencyEntry['role'],
  title: string,
): GanttTooltipDependencyEntry {
  return { relatedTitle: title, dependencyType: 'finish_to_start', role };
}

function baseData(overrides: Partial<GanttTooltipWorkItemData> = {}): GanttTooltipWorkItemData {
  return { ...buildWorkItemTooltipData(makeWorkItem(), undefined, TODAY), ...overrides };
}

describe('formatAreaPath', () => {
  it('returns null when there is no area', () => {
    expect(formatAreaPath(null)).toBeNull();
    expect(formatAreaPath(undefined)).toBeNull();
  });

  it('returns just the name for a root area', () => {
    expect(formatAreaPath(rootArea)).toBe('Test House');
  });

  it('joins ancestors and the area name with the path separator', () => {
    expect(formatAreaPath(nestedArea)).toBe(`Test House${AREA_PATH_SEPARATOR}Test Kitchen`);
    expect(formatAreaPath(nestedArea)).toBe('Test House › Test Kitchen');
  });

  it('keeps ancestors in root-first order for a deeper chain', () => {
    const deep: AreaSummary = {
      id: 'c',
      name: 'C',
      color: null,
      ancestors: [
        { id: 'a', name: 'A', color: null },
        { id: 'b', name: 'B', color: null },
      ],
    };
    expect(formatAreaPath(deep)).toBe('A › B › C');
  });
});

describe('buildWorkItemTooltipData', () => {
  it('maps title, status, dates and durations', () => {
    const data = buildWorkItemTooltipData(makeWorkItem(), undefined, TODAY);
    expect(data).toMatchObject({
      kind: 'work-item',
      title: 'Test Task',
      status: 'in_progress',
      startDate: '2026-03-02',
      endDate: '2026-03-12',
      durationDays: 7,
      plannedDurationDays: 7,
      workItemId: 'wi-1',
    });
  });

  it('maps vendor, user and area path', () => {
    const data = buildWorkItemTooltipData(
      makeWorkItem({
        assignedUser: { id: 'u1', displayName: 'Alex Example', email: 'alex@example.test' },
        assignedVendor: { id: 'v1', name: 'Sample Tiling Ltd', trade: null },
        area: nestedArea,
      }),
      undefined,
      TODAY,
    );
    expect(data.assignedUserName).toBe('Alex Example');
    expect(data.assignedVendorName).toBe('Sample Tiling Ltd');
    expect(data.areaName).toBe('Test House › Test Kitchen');
  });

  it('maps missing user, vendor and area to null', () => {
    const data = buildWorkItemTooltipData(makeWorkItem(), undefined, TODAY);
    expect(data.assignedUserName).toBeNull();
    expect(data.assignedVendorName).toBeNull();
    expect(data.areaName).toBeNull();
  });

  it('passes a copy of non-empty dependencies and maps empty or missing to undefined', () => {
    const deps = [dep('predecessor', 'Test Before')];
    const withDeps = buildWorkItemTooltipData(makeWorkItem(), deps, TODAY);
    expect(withDeps.dependencies).toEqual(deps);
    expect(withDeps.dependencies).not.toBe(deps);
    expect(buildWorkItemTooltipData(makeWorkItem(), [], TODAY).dependencies).toBeUndefined();
    expect(buildWorkItemTooltipData(makeWorkItem(), undefined, TODAY).dependencies).toBeUndefined();
  });

  it('computes actual duration from start/end dates', () => {
    const data = buildWorkItemTooltipData(makeWorkItem(), undefined, TODAY);
    expect(data.actualDurationDays).toBe(10);
  });

  it('prefers actual dates over planned dates for the actual duration', () => {
    const data = buildWorkItemTooltipData(
      makeWorkItem({ actualStartDate: '2026-03-01', actualEndDate: '2026-03-04' }),
      undefined,
      TODAY,
    );
    expect(data.actualDurationDays).toBe(3);
  });

  it('measures an unfinished item up to today', () => {
    const data = buildWorkItemTooltipData(
      makeWorkItem({ startDate: '2026-03-10', endDate: null }),
      undefined,
      TODAY,
    );
    expect(data.actualDurationDays).toBe(10);
  });
});

describe('buildHouseholdItemTooltipData', () => {
  it('maps name, status, delivery dates, late flag and id', () => {
    const data = buildHouseholdItemTooltipData(makeHouseholdItem({ isLate: true }), undefined);
    expect(data).toMatchObject({
      kind: 'household-item',
      name: 'Test Sofa',
      status: 'purchased',
      earliestDeliveryDate: '2026-03-08',
      latestDeliveryDate: '2026-03-14',
      targetDeliveryDate: '2026-03-10',
      actualDeliveryDate: null,
      isLate: true,
      householdItemId: 'hi-1',
    });
  });

  it('maps the area path, and a missing or null area to null', () => {
    expect(
      buildHouseholdItemTooltipData(makeHouseholdItem({ area: nestedArea }), undefined).areaName,
    ).toBe('Test House › Test Kitchen');
    expect(buildHouseholdItemTooltipData(makeHouseholdItem(), undefined).areaName).toBeNull();
    expect(
      buildHouseholdItemTooltipData(makeHouseholdItem({ area: null }), undefined).areaName,
    ).toBeNull();
  });

  it('passes linked items through and carries no category', () => {
    const linked = [{ id: 'wi-9', title: 'Test Before', type: 'work_item' as const }];
    const data = buildHouseholdItemTooltipData(makeHouseholdItem(), linked);
    expect(data.linkedItems).toBe(linked);
    expect('category' in data).toBe(false);
  });
});

describe('estimateWorkItemTooltipHeight', () => {
  const max = 5;
  const base = () => baseData({ assignedVendorName: null, areaName: null });

  it('returns the base height without optional rows or dependencies', () => {
    expect(estimateWorkItemTooltipHeight(base(), max)).toBe(TOOLTIP_HEIGHT_BASE);
  });

  it('adds one row for a company', () => {
    expect(
      estimateWorkItemTooltipHeight({ ...base(), assignedVendorName: 'Sample Tiling Ltd' }, max),
    ).toBe(TOOLTIP_HEIGHT_BASE + ROW_HEIGHT);
  });

  it('adds one row for an area', () => {
    expect(estimateWorkItemTooltipHeight({ ...base(), areaName: 'Test House' }, max)).toBe(
      TOOLTIP_HEIGHT_BASE + ROW_HEIGHT,
    );
  });

  it('adds a label row plus one row per entry for a group', () => {
    const data = { ...base(), dependencies: [dep('predecessor', 'A'), dep('predecessor', 'B')] };
    expect(estimateWorkItemTooltipHeight(data, max)).toBe(TOOLTIP_HEIGHT_BASE + ROW_HEIGHT * 3);
  });

  it('counts both groups separately', () => {
    const data = { ...base(), dependencies: [dep('predecessor', 'A'), dep('successor', 'B')] };
    expect(estimateWorkItemTooltipHeight(data, max)).toBe(TOOLTIP_HEIGHT_BASE + ROW_HEIGHT * 4);
  });

  it('caps a group at the maximum and adds an overflow row', () => {
    const deps = Array.from({ length: 7 }, (_, i) => dep('predecessor', `P${i}`));
    // label + 5 rows + overflow row
    expect(estimateWorkItemTooltipHeight({ ...base(), dependencies: deps }, max)).toBe(
      TOOLTIP_HEIGHT_BASE + ROW_HEIGHT * 7,
    );
  });

  it('adds no overflow row when a group is exactly at the maximum', () => {
    const deps = Array.from({ length: 5 }, (_, i) => dep('successor', `S${i}`));
    expect(estimateWorkItemTooltipHeight({ ...base(), dependencies: deps }, max)).toBe(
      TOOLTIP_HEIGHT_BASE + ROW_HEIGHT * 6,
    );
  });
});
