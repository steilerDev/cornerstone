import type {
  AreaAncestorContext,
  AreaCostLine,
  AreaNowHouseholdItem,
  AreaNowWorkItem,
  AreaPageChild,
  AreaPageCompany,
  AreaPageSummary,
} from '@cornerstone/shared';

/** Synthetic Area page (#2251) fixtures: a floor with a building above it and two rooms below. */

export function makeAreaChild(id: string, over: Partial<AreaPageChild> = {}): AreaPageChild {
  return {
    id,
    name: `Room ${id}`,
    color: null,
    photoCount: 0,
    openTaskCount: 0,
    ...over,
  };
}

export function makeNowTask(id: string, over: Partial<AreaNowWorkItem> = {}): AreaNowWorkItem {
  return {
    type: 'work_item',
    id,
    title: `Task ${id}`,
    status: 'not_started',
    isLate: false,
    lateDays: null,
    companyName: null,
    startDate: null,
    endDate: null,
    ...over,
  };
}

export function makeNowPurchase(
  id: string,
  over: Partial<AreaNowHouseholdItem> = {},
): AreaNowHouseholdItem {
  return {
    type: 'household_item',
    id,
    title: `Purchase ${id}`,
    status: 'planned',
    isLate: false,
    lateDays: null,
    companyName: null,
    deliveryDate: null,
    ...over,
  };
}

export function makeAreaCompany(id: string, over: Partial<AreaPageCompany> = {}): AreaPageCompany {
  return {
    id,
    name: `Company ${id}`,
    trade: null,
    phone: null,
    workItemCount: 0,
    householdItemCount: 0,
    ...over,
  };
}

export function makeAncestorContext(
  areaId: string,
  over: Partial<AreaAncestorContext> = {},
): AreaAncestorContext {
  return {
    areaId,
    name: `Area ${areaId}`,
    depth: 0,
    workItemCount: 0,
    householdItemCount: 0,
    ...over,
  };
}

/** The Ground floor (id `floor`) under the House (`house`); a leaf unless `children` is given. */
export function makeAreaSummary(over: Partial<AreaPageSummary> = {}): AreaPageSummary {
  return {
    area: {
      id: 'floor',
      name: 'Ground floor',
      description: null,
      color: null,
      parentId: 'house',
      ancestors: [{ id: 'house', name: 'House', color: null }],
    },
    children: [],
    counts: {
      workItems: { total: 0, open: 0, late: 0 },
      householdItems: { total: 0, open: 0 },
      photos: { total: 0, latestDate: null },
      companies: 0,
    },
    nowAndNext: [],
    ancestorContext: [],
    companies: [],
    money: { expectedCost: 0, paid: 0 },
    ...over,
  };
}

/** A cost line of a task or purchase in the subtree; the owner is the group heading. */
export function makeAreaCostLine(id: string, over: Partial<AreaCostLine> = {}): AreaCostLine {
  return {
    id,
    description: `Line ${id}`,
    plannedAmount: 100,
    confidence: 'own_estimate',
    confidenceMargin: 0.2,
    budgetCategory: null,
    budgetSource: null,
    vendor: null,
    actualCost: 0,
    actualCostPaid: 0,
    invoiceCount: 0,
    invoiceLink: null,
    quantity: null,
    unit: null,
    unitPrice: null,
    includesVat: true,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    itemType: 'work_item',
    itemId: 'wi-1',
    itemTitle: 'Lay floors',
    itemArea: { id: 'floor', name: 'Ground floor', color: null, ancestors: [] },
    ...over,
  };
}
