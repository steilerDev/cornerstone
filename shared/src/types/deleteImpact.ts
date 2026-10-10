/**
 * Delete-impact types (EPIC-21 story 1.3, contract 19).
 *
 * `GET /api/delete-impact/:entityType/:id` reports what a successful DELETE would also change.
 */

export const DELETE_IMPACT_ENTITY_TYPES = [
  'area',
  'orientation',
  'vendor',
  'invoice',
  'subsidy_program',
  'budget_source',
  'milestone',
  'work_item',
  'household_item',
  'diary_entry',
] as const;

export type DeleteImpactEntityType = (typeof DELETE_IMPACT_ENTITY_TYPES)[number];

export const DELETE_IMPACT_KINDS = [
  'childAreas',
  'photosLoseArea',
  'photosLoseOrientation',
  'contacts',
  'tasksUnassigned',
  'purchasesUnassigned',
  'costLinesUnassigned',
  'progressPayments',
  'costLinesUnlinked',
  'documentLinks',
  'purchasesUnlinked',
  'progressPaymentsUnassigned',
  'tasksUnlinked',
  'dependencies',
  'purchaseDependencies',
  'costLines',
  'invoiceLinks',
  'subtasks',
  'notes',
  'taskDependencies',
  'milestoneLinks',
  'milestoneWaits',
  'grantLinks',
  'photos',
] as const;

export type DeleteImpactKind = (typeof DELETE_IMPACT_KINDS)[number];

export interface DeleteImpactEffect {
  kind: DeleteImpactKind;
  count: number;
}

export interface DeleteImpactResponse {
  entityType: DeleteImpactEntityType;
  id: string;
  effects: DeleteImpactEffect[];
}
