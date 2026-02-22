/**
 * Subsidy program types and interfaces.
 * Subsidy programs represent government or institutional programs that reduce
 * construction costs through percentage or fixed-amount reductions.
 */

import type { BudgetCategory } from './budgetCategory.js';
import type { UserSummary } from './workItem.js';

/**
 * The type of cost reduction applied by a subsidy program.
 */
export type SubsidyReductionType = 'percentage' | 'fixed';

/**
 * The current application status of a subsidy program.
 */
export type SubsidyApplicationStatus =
  | 'eligible'
  | 'applied'
  | 'approved'
  | 'received'
  | 'rejected';

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
  applicableCategories: BudgetCategory[];
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
  categoryIds?: string[];
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
  categoryIds?: string[];
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
