/**
 * Types of GET /api/vendors/:id/relations (contract 13, #2244): what one company is attached to.
 */

import type { WorkItemStatus } from './workItem.js';
import type { HouseholdItemStatus } from './householdItem.js';

export interface VendorRelatedWorkItem {
  id: string;
  title: string;
  status: WorkItemStatus;
  startDate: string | null;
  endDate: string | null;
}

export interface VendorRelatedHouseholdItem {
  id: string;
  name: string;
  status: HouseholdItemStatus;
  targetDeliveryDate: string | null;
  actualDeliveryDate: string | null;
}

export interface VendorRelatedBudgetLine {
  id: string;
  description: string | null;
  plannedAmount: number;
  /** null = an orphan line (ADR-030). */
  parent: { type: 'work_item' | 'household_item'; id: string; title: string } | null;
}

export interface VendorRelationsResponse {
  workItems: VendorRelatedWorkItem[];
  householdItems: VendorRelatedHouseholdItem[];
  budgetLines: VendorRelatedBudgetLine[];
}
