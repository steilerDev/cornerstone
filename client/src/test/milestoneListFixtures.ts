import type { MilestoneListRow } from '@cornerstone/shared';

/** Synthetic fixtures for the Milestones list tests (no real names, dates or amounts). */

let nextId = 100;

export function makeMilestoneRow(overrides: Partial<MilestoneListRow> = {}): MilestoneListRow {
  const id = overrides.id ?? nextId++;
  return {
    id,
    title: `Milestone ${id}`,
    description: null,
    targetDate: '2026-06-01',
    isCompleted: false,
    completedAt: null,
    color: null,
    workItemCount: 0,
    dependentWorkItemCount: 0,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    projectedDate: null,
    holdsUp: null,
    ...overrides,
  };
}
