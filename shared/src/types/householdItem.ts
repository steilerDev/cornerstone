/**
 * Household item types and interfaces.
 * Household items are furniture, appliances, and other items for purchase,
 * tracked separately from construction work items.
 *
 * EPIC-04: Household Items & Furniture Management
 */

import type { TagResponse } from './tag.js';
import type { PaginatedResponse } from './pagination.js';
import type { SubsidyApplicationStatus } from './subsidyProgram.js';
import type { UserSummary } from './workItem.js';

/**
 * Budget summary for a household item.
 * Aggregates budget information including planned costs, actual costs (always 0), and subsidy reductions.
 */
export interface HouseholdItemBudgetSummary {
  totalPlanned: number; // Sum of plannedAmount from all budget lines
  totalActual: number; // Always 0 for household items (no invoices)
  subsidyReduction: number; // Sum of subsidy reductions applied
  netCost: number; // totalPlanned - subsidyReduction
}

/**
 * Household item category enum - type of household item.
 */
export type HouseholdItemCategory =
  | 'furniture'
  | 'appliances'
  | 'fixtures'
  | 'decor'
  | 'electronics'
  | 'outdoor'
  | 'storage'
  | 'other';

/**
 * Household item status enum - lifecycle status of a purchase.
 */
export type HouseholdItemStatus = 'not_ordered' | 'ordered' | 'in_transit' | 'delivered';

/**
 * Vendor summary shape used in household item responses.
 */
export interface HouseholdItemVendorSummary {
  id: string;
  name: string;
  specialty: string | null;
}

/**
 * Work item summary shape used in household item detail responses.
 */
export interface HouseholdItemWorkItemSummary {
  id: string;
  title: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
}

/**
 * Household item summary shape for work item responses (reverse direction).
 */
export interface WorkItemLinkedHouseholdItemSummary {
  id: string;
  name: string;
  category: HouseholdItemCategory;
  status: HouseholdItemStatus;
  expectedDeliveryDate: string | null;
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
  room: string | null;
  quantity: number;
  orderDate: string | null;
  expectedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
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
  room: string | null;
  quantity: number;
  orderDate: string | null;
  expectedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  url: string | null;
  tagIds: string[];
  budgetLineCount: number;
  totalPlannedAmount: number;
  budgetSummary: HouseholdItemBudgetSummary;
  createdBy: UserSummary | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Household item detail (used in single-item responses).
 */
export interface HouseholdItemDetail extends HouseholdItemSummary {
  tags: TagResponse[];
  workItems: HouseholdItemWorkItemSummary[];
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
  room?: string | null;
  quantity?: number;
  orderDate?: string | null;
  expectedDeliveryDate?: string | null;
  actualDeliveryDate?: string | null;
  tagIds?: string[];
}

/**
 * Request body for updating a household item.
 * All fields are optional; at least one must be provided.
 * Sending tagIds replaces the entire tag set (set-semantics).
 */
export interface UpdateHouseholdItemRequest {
  name?: string;
  description?: string | null;
  category?: HouseholdItemCategory;
  status?: HouseholdItemStatus;
  vendorId?: string | null;
  url?: string | null;
  room?: string | null;
  quantity?: number;
  orderDate?: string | null;
  expectedDeliveryDate?: string | null;
  actualDeliveryDate?: string | null;
  tagIds?: string[];
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
  room?: string;
  vendorId?: string;
  tagId?: string;
  sortBy?:
    | 'name'
    | 'category'
    | 'status'
    | 'room'
    | 'order_date'
    | 'expected_delivery_date'
    | 'created_at'
    | 'updated_at';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Response for GET /api/household-items (paginated list).
 */
export type HouseholdItemListResponse = PaginatedResponse<HouseholdItemSummary>;

/**
 * Response for single household item endpoints (POST, GET by ID, PATCH).
 */
export interface HouseholdItemResponse {
  householdItem: HouseholdItemDetail;
}
