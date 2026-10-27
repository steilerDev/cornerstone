/**
 * Subsidy program types and interfaces.
 * Subsidy programs represent government or institutional programs that reduce
 * construction costs through percentage or fixed-amount reductions.
 */

import type { BudgetCategory } from './budgetCategory.js';
import type { UserSummary } from './workItem.js';
import type { SubsidyPaybackEntry } from './budget.js';
import type { AreaSummary } from './area.js';
import type { GrantMoney } from './money.js';

/**
 * The type of cost reduction applied by a subsidy program.
 */
export type SubsidyReductionType = 'percentage' | 'fixed';

/**
 * The current application status of a subsidy program.
 *
 * Runtime source of truth for the union — add new members here; the i18n parity guard in `client/src/i18n/unionKeys.test.ts` then requires a locale key (#2029).
 */
export const SUBSIDY_APPLICATION_STATUSES = [
  'eligible',
  'applied',
  'approved',
  'received',
  'rejected',
] as const;

export type SubsidyApplicationStatus = (typeof SUBSIDY_APPLICATION_STATUSES)[number];

/**
 * Subsidy program entity as returned by the API.
 * applicableCategories lists all budget categories this program applies to.
 */
export interface SubsidyProgram {
  id: string;
  name: string;
  description: string | null;
  eligibility: string | null;
  reductionType: SubsidyReductionType;
  reductionValue: number;
  applicationStatus: SubsidyApplicationStatus;
  applicationDeadline: string | null;
  notes: string | null;
  maximumAmount: number | null;
  applicableCategories: BudgetCategory[];
  includesNoCategoryItems: boolean;
  createdBy: UserSummary | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for creating a new subsidy program.
 */
export interface CreateSubsidyProgramRequest {
  name: string;
  reductionType: SubsidyReductionType;
  reductionValue: number;
  description?: string | null;
  eligibility?: string | null;
  applicationStatus?: SubsidyApplicationStatus;
  applicationDeadline?: string | null;
  notes?: string | null;
  maximumAmount?: number | null;
  categoryIds?: string[];
  includesNoCategoryItems?: boolean;
  /**
   * Tasks / purchases to cover, linked in the same transaction as the create (optional on the
   * API; the dialog asks for at least one). At most 100.
   */
  items?: GrantItemRef[];
}

/**
 * Request body for updating a subsidy program.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateSubsidyProgramRequest {
  name?: string;
  reductionType?: SubsidyReductionType;
  reductionValue?: number;
  description?: string | null;
  eligibility?: string | null;
  applicationStatus?: SubsidyApplicationStatus;
  applicationDeadline?: string | null;
  notes?: string | null;
  maximumAmount?: number | null;
  categoryIds?: string[];
  includesNoCategoryItems?: boolean;
}

/**
 * Response for GET /api/subsidy-programs - list all programs.
 */
export interface SubsidyProgramListResponse {
  subsidyPrograms: SubsidyProgram[];
}

/**
 * Response for single-program endpoints (POST, GET by ID, PATCH).
 */
export interface SubsidyProgramResponse {
  subsidyProgram: SubsidyProgram;
}

/**
 * Per-subsidy payback entry returned in the work item subsidy payback response.
 * min and max reflect the confidence margin range for non-invoiced budget lines.
 * For fixed subsidies and fully-invoiced lines, minPayback === maxPayback.
 */
export type WorkItemSubsidyPaybackEntry = SubsidyPaybackEntry;

/**
 * Response for GET /api/work-items/:workItemId/subsidy-payback
 */
export interface WorkItemSubsidyPaybackResponse {
  workItemId: string;
  /** Best-scenario total over the counted (approved/received) linked grants. */
  minTotalPayback: number;
  /** Worst-scenario total over the counted (approved/received) linked grants. */
  maxTotalPayback: number;
  /** Expected-scenario total over the counted (approved/received) linked grants. */
  expectedTotalPayback: number;
  /** Per-subsidy breakdown. Empty array when no subsidies are linked. */
  subsidies: WorkItemSubsidyPaybackEntry[];
}

/** Item types a grant can cover. Runtime source of truth for the union. */
export const GRANT_ITEM_TYPES = ['work_item', 'household_item'] as const;
export type GrantItemType = (typeof GRANT_ITEM_TYPES)[number];

/** A task or purchase referenced by a grant link request. */
export interface GrantItemRef {
  type: GrantItemType;
  id: string;
}

/** One covered item of a grant (GET /api/subsidy-programs/:id/items). */
export interface GrantCoveredItem {
  type: GrantItemType;
  id: string;
  title: string;
  area: AreaSummary | null;
  /** Engine share of this grant for the item (expected scenario); 0 when rejected or none. */
  covered: number;
}

/** Response for GET and POST /api/subsidy-programs/:id/items. */
export interface GrantCoveredItemsResponse {
  items: GrantCoveredItem[];
}

/** Request body for POST /api/subsidy-programs/:id/items. */
export interface LinkGrantItemsRequest {
  items: GrantItemRef[];
}

/** Response for GET /api/subsidy-programs/:id. */
export interface SubsidyProgramDetailResponse {
  subsidyProgram: SubsidyProgram;
  money: GrantMoney;
}

/** A grant chip on a task / purchase list row. */
export interface ItemGrantChip {
  id: string;
  name: string;
  reductionType: SubsidyReductionType;
  rate: number;
}
