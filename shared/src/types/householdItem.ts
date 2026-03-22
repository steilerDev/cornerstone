/**
 * Household item types and interfaces.
 * Household items are furniture, appliances, and other items for purchase,
 * tracked separately from construction work items.
 *
 * EPIC-04: Household Items & Furniture Management
 */

import type { PaginatedResponse, PaginationMeta } from './pagination.js';
import type { SubsidyApplicationStatus } from './subsidyProgram.js';
import type { UserSummary, VendorSummary } from './workItem.js';
import type { AreaSummary } from './area.js';
import type { TradeSummary } from './trade.js';
import type { FilterMeta } from './filterMeta.js';

/**
 * Budget aggregates for a household item.
 * Aggregates budget information including planned costs, actual costs from invoices, and subsidy reductions.
 * Used internally to compute the budget summary embedded in household item responses.
 * (The invoice context uses HouseholdItemBudgetSummary to represent a single linked budget line.)
 */
export interface HouseholdItemBudgetAggregate {
  totalPlanned: number; // Sum of plannedAmount from all budget lines
  totalActual: number; // Sum of invoice amounts linked to this household item's budget lines
  subsidyReduction: number; // Sum of subsidy reductions applied
  netCost: number; // totalPlanned - subsidyReduction
}

/**
 * Household item category - ID of category from household_item_categories table.
 */
export type HouseholdItemCategory = string;

/**
 * Household item category entity as stored in the database.
 * EPIC-09: Story #509 - Unified Tags & Categories Management Page
 */
export interface HouseholdItemCategoryEntity {
  id: string;
  name: string;
  color: string | null;
  translationKey: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for creating a new household item category.
 */
export interface CreateHouseholdItemCategoryRequest {
  name: string;
  color?: string | null;
  sortOrder?: number;
}

/**
 * Request body for updating a household item category.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateHouseholdItemCategoryRequest {
  name?: string;
  color?: string | null;
  sortOrder?: number;
}

/**
 * Household item status enum - lifecycle status of a purchase.
 */
export type HouseholdItemStatus = 'planned' | 'purchased' | 'scheduled' | 'arrived';

/**
 * Vendor summary shape used in household item responses.
 */
export interface HouseholdItemVendorSummary {
  id: string;
  name: string;
  trade: TradeSummary | null;
}

/**
 * Household item dependency predecessor type.
 */
export type HouseholdItemDepPredecessorType = 'work_item' | 'milestone';

/**
 * A single dependency reference (used in TimelineHouseholdItem.dependencyIds).
 */
export interface HouseholdItemDepRef {
  predecessorType: HouseholdItemDepPredecessorType;
  predecessorId: string;
}

/**
 * Predecessor summary embedded in dependency detail responses.
 */
export interface HouseholdItemDepPredecessorSummary {
  id: string;
  title: string; // work item title or milestone title
  status: string | null; // work item status (null for milestones)
  endDate: string | null; // work item endDate or milestone targetDate
}

/**
 * A single dependency row (detail shape for GET /api/household-items/:id/dependencies).
 * Household items are zero-duration terminal nodes; all dependencies are treated as finish-to-start with zero lag.
 */
export interface HouseholdItemDepDetail {
  householdItemId: string;
  predecessorType: HouseholdItemDepPredecessorType;
  predecessorId: string;
  predecessor: HouseholdItemDepPredecessorSummary;
}

/**
 * Response shape for GET /api/household-items/:id/dependencies.
 */
export interface HouseholdItemDepsResponse {
  dependencies: HouseholdItemDepDetail[];
}

/**
 * Request body for POST /api/household-items/:id/dependencies.
 * Household items are zero-duration terminal nodes; only predecessorType and predecessorId are required.
 */
export interface CreateHouseholdItemDepRequest {
  predecessorType: HouseholdItemDepPredecessorType;
  predecessorId: string;
}

/**
 * Household item summary shape for work item responses (reverse direction).
 */
export interface WorkItemLinkedHouseholdItemSummary {
  id: string;
  name: string;
  category: HouseholdItemCategory;
  status: HouseholdItemStatus;
  targetDeliveryDate: string | null;
  earliestDeliveryDate: string | null;
  latestDeliveryDate: string | null;
}

/**
 * Subsidy program summary shape used in household item detail responses.
 */
export interface HouseholdItemSubsidySummary {
  id: string;
  name: string;
  reductionType: 'percentage' | 'fixed';
  reductionValue: number;
  applicationStatus: SubsidyApplicationStatus;
}

/**
 * Household item entity as stored in the database.
 */
export interface HouseholdItem {
  id: string;
  name: string;
  description: string | null;
  category: HouseholdItemCategory;
  status: HouseholdItemStatus;
  vendorId: string | null;
  url: string | null;
  quantity: number;
  orderDate: string | null;
  actualDeliveryDate: string | null;
  earliestDeliveryDate: string | null;
  latestDeliveryDate: string | null;
  targetDeliveryDate: string | null;
  isLate: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Household item summary (used in list responses).
 */
export interface HouseholdItemSummary {
  id: string;
  name: string;
  description: string | null;
  category: HouseholdItemCategory;
  status: HouseholdItemStatus;
  vendor: HouseholdItemVendorSummary | null;
  area: AreaSummary | null;
  quantity: number;
  orderDate: string | null;
  actualDeliveryDate: string | null;
  earliestDeliveryDate: string | null;
  latestDeliveryDate: string | null;
  targetDeliveryDate: string | null;
  isLate: boolean;
  url: string | null;
  budgetLineCount: number;
  totalPlannedAmount: number;
  budgetSummary: HouseholdItemBudgetAggregate;
  createdBy: UserSummary | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Household item detail (used in single-item responses).
 */
export interface HouseholdItemDetail extends HouseholdItemSummary {
  dependencies: HouseholdItemDepDetail[];
  subsidies: HouseholdItemSubsidySummary[];
}

/**
 * Request body for creating a new household item.
 */
export interface CreateHouseholdItemRequest {
  name: string;
  description?: string | null;
  category?: HouseholdItemCategory;
  status?: HouseholdItemStatus;
  vendorId?: string | null;
  url?: string | null;
  areaId?: string | null;
  quantity?: number;
  orderDate?: string | null;
  earliestDeliveryDate?: string;
  latestDeliveryDate?: string;
  actualDeliveryDate?: string | null;
}

/**
 * Request body for updating a household item.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateHouseholdItemRequest {
  name?: string;
  description?: string | null;
  category?: HouseholdItemCategory;
  status?: HouseholdItemStatus;
  vendorId?: string | null;
  url?: string | null;
  areaId?: string | null;
  quantity?: number;
  orderDate?: string | null;
  earliestDeliveryDate?: string | null;
  latestDeliveryDate?: string | null;
  actualDeliveryDate?: string | null;
}

/**
 * Query parameters for GET /api/household-items.
 */
export interface HouseholdItemListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  category?: HouseholdItemCategory;
  status?: HouseholdItemStatus;
  areaId?: string;
  vendorId?: string;
  plannedCostMin?: number;
  plannedCostMax?: number;
  actualCostMin?: number;
  actualCostMax?: number;
  budgetLinesMin?: number;
  budgetLinesMax?: number;
  sortBy?:
    | 'name'
    | 'category'
    | 'status'
    | 'order_date'
    | 'target_delivery_date'
    | 'created_at'
    | 'updated_at';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Response for GET /api/household-items (paginated list with filter metadata).
 */
export interface HouseholdItemListResponse {
  items: HouseholdItemSummary[];
  pagination: PaginationMeta;
  filterMeta: FilterMeta;
}

/**
 * Response for single household item endpoints (POST, GET by ID, PATCH).
 */
export interface HouseholdItemResponse {
  householdItem: HouseholdItemDetail;
}
