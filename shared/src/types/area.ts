/**
 * Area types and interfaces.
 * Areas are hierarchical location/space divisions within the construction project.
 * Areas can have parent-child relationships (e.g., Kitchen > Kitchen Cabinets).
 */

import type { ReorderReferenceListRequest } from './referenceList.js';
import type { UndoToken } from './undo.js';
import type { BaseBudgetLine } from './budget.js';
import type { HouseholdItemStatus } from './householdItem.js';
import type { TradeSummary } from './trade.js';
import type { WorkItemStatus } from './workItem.js';

/**
 * A single ancestor entry in the area parent chain.
 * Contains only the fields needed for breadcrumb rendering.
 */
export interface AreaAncestor {
  id: string;
  name: string;
  color: string | null;
}

/**
 * Area summary shape used in work item and household item responses.
 */
export interface AreaSummary {
  id: string;
  name: string;
  color: string | null;
  /**
   * Ancestor chain in root-first order. Does NOT include the area itself.
   * Empty array for root-level areas (no parent).
   */
  ancestors: AreaAncestor[];
}

/**
 * Area entity as stored in the database and returned by the API.
 */
export interface AreaResponse {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response for GET /api/areas (list of areas).
 */
export interface AreaListResponse {
  areas: AreaResponse[];
}

/**
 * Response for single area endpoints (POST, GET by ID, PATCH).
 */
export interface AreaSingleResponse {
  area: AreaResponse;
}

/**
 * Request body for creating a new area.
 */
export interface CreateAreaRequest {
  name: string;
  parentId?: string | null;
  color?: string | null;
  description?: string | null;
  sortOrder?: number;
}

/**
 * Request body for updating an area.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateAreaRequest {
  name?: string;
  parentId?: string | null;
  color?: string | null;
  description?: string | null;
  sortOrder?: number;
}

/**
 * Query parameters for GET /api/areas (list with filtering, sorting, pagination).
 */
export interface AreaListQuery {
  search?: string;
  /** `counts` adds the direct per-area counts (contract 10). */
  include?: 'counts';
}

/** Direct (not roll-up) counts of what is attached to one area. */
export interface AreaCounts {
  /** `open` = status <> 'completed'. */
  workItems: { total: number; open: number };
  /** `open` = status <> 'arrived'. */
  householdItems: { total: number; open: number };
  /** Photos of saved diary entries only; `latestDate` = latest entry date (YYYY-MM-DD). */
  photos: { total: number; latestDate: string | null };
}

/** Expected cost (expected scenario, gross, major units) of an area: own items and own + descendants. */
export interface AreaExpectedCost {
  /** Items booked on the area itself (the Areas index quiet row). */
  own: number;
  /** The area and all descendants (Money › Overview "by area" figure). */
  subtree: number;
}

export interface AreaWithCounts extends AreaResponse {
  counts: AreaCounts;
  /** From the money service (#2251). Always sent with include=counts. */
  expectedCost: AreaExpectedCost;
}

/** Now & next here holds at most this many items (#2251). */
export const AREA_NOW_AND_NEXT_LIMIT = 5;

export interface AreaPageArea {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  parentId: string | null;
  /** Root first; not the area itself; [] for a top-level area. */
  ancestors: AreaAncestor[];
}

/** A direct child, Areas index order (sort_order, name). Figures are roll-ups of the child's subtree. */
export interface AreaPageChild {
  id: string;
  name: string;
  color: string | null;
  /** Photos of saved diary entries tagged in the child or below. */
  photoCount: number;
  /** Tasks with status <> 'completed' in the child or below. */
  openTaskCount: number;
}

/** All counts cover the area and its descendants (roll-up rule 1). */
export interface AreaPageCounts {
  workItems: { total: number; open: number; late: number };
  householdItems: { total: number; open: number };
  photos: { total: number; latestDate: string | null };
  /** Distinct companies on the subtree's tasks (assigned company) or purchases (company). */
  companies: number;
}

interface AreaNowItemBase {
  id: string;
  title: string;
  /** Home rule: projection isLate for tasks, isPurchaseLate for purchases. */
  isLate: boolean;
  /** >= 1 when isLate, else null. */
  lateDays: number | null;
  companyName: string | null;
}
export interface AreaNowWorkItem extends AreaNowItemBase {
  type: 'work_item';
  status: WorkItemStatus;
  /** Shown dates (actual ?? forecast), as every task surface. */
  startDate: string | null;
  endDate: string | null;
}
export interface AreaNowHouseholdItem extends AreaNowItemBase {
  type: 'household_item';
  status: HouseholdItemStatus;
  /** latest ?? earliest ?? target delivery date (purchaseDeliveryDate). */
  deliveryDate: string | null;
}
export type AreaNowItem = AreaNowWorkItem | AreaNowHouseholdItem;

/** An ancestor with tasks or purchases booked directly on it: context only, never added. */
export interface AreaAncestorContext {
  areaId: string;
  name: string;
  /** 0 = top level (the Areas index quiet-row wording follows it). */
  depth: number;
  /** Direct, any status. */
  workItemCount: number;
  householdItemCount: number;
}

export interface AreaPageCompany {
  id: string;
  name: string;
  trade: TradeSummary | null;
  /** The company phone, else its first contact's phone (Companies list rule); null = no Call. */
  phone: string | null;
  /** Subtree tasks assigned to it / subtree purchases from it (any status). */
  workItemCount: number;
  householdItemCount: number;
}

export interface AreaPageMoney {
  /** Subtree expected cost (expected scenario, gross) = breakdown byArea expectedCost.expected; 0 when none. */
  expectedCost: number;
  /** Subtree attributed Paid = breakdown byArea paid; 0 when none. */
  paid: number;
}

/** Response of GET /api/areas/:id/summary (#2251, contract 10). */
export interface AreaPageSummary {
  area: AreaPageArea;
  children: AreaPageChild[];
  counts: AreaPageCounts;
  /** Open items (task status <> completed, purchase status <> arrived), at most AREA_NOW_AND_NEXT_LIMIT. */
  nowAndNext: AreaNowItem[];
  /** Root first; only ancestors with direct items. */
  ancestorContext: AreaAncestorContext[];
  /** By name (accent- and case-insensitive), then id. */
  companies: AreaPageCompany[];
  money: AreaPageMoney;
}

/** A cost line of a task or purchase in the area's subtree (#2251). */
export interface AreaCostLine extends BaseBudgetLine {
  itemType: 'work_item' | 'household_item';
  itemId: string;
  itemTitle: string;
  /** The item's area with ancestors (never null: the item is in the subtree). */
  itemArea: AreaSummary;
}

/** Response of GET /api/areas/:id/cost-lines. */
export interface AreaCostLinesResponse {
  lines: AreaCostLine[];
}

/** Response for GET /api/areas?include=counts. */
export interface AreaListWithCountsResponse {
  areas: AreaWithCounts[];
}

/** Request body for PATCH /api/areas/reorder: the children of `parentId`, in the new order. */
export interface ReorderAreasRequest extends ReorderReferenceListRequest {
  parentId: string | null;
}

/** Response for DELETE /api/areas/:id. */
export interface DeleteAreaResponse {
  undo: UndoToken;
}
