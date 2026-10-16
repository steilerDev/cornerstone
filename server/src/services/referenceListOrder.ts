/**
 * Shared helpers for the reorderable reference lists (budget categories,
 * household-item categories, orientations). Story #2215.
 */

import { ReorderSetMismatchError } from '../errors/AppError.js';

export const REORDER_MAX_IDS = 500;
export const REORDER_ID_MAX_LENGTH = 64;

/**
 * missingIds: current ids that were not requested (current order).
 * unknownIds: requested ids that are not current (request order).
 */
export function diffIdSets(
  current: readonly string[],
  requested: readonly string[],
): { missingIds: string[]; unknownIds: string[] } {
  const currentSet = new Set(current);
  const requestedSet = new Set(requested);
  return {
    missingIds: current.filter((id) => !requestedSet.has(id)),
    unknownIds: requested.filter((id) => !currentSet.has(id)),
  };
}

/** @throws ReorderSetMismatchError when the requested ids are not exactly the current set */
export function assertSameIdSet(current: readonly string[], requested: readonly string[]): void {
  const diff = diffIdSets(current, requested);
  if (diff.missingIds.length > 0 || diff.unknownIds.length > 0) {
    throw new ReorderSetMismatchError(diff);
  }
}

/** Append position for a new row: max + 1, or 0 for an empty list. */
export function nextSortOrder(max: number | null | undefined): number {
  return max == null ? 0 : max + 1;
}

/** Fastify schema shared by the three PATCH /reorder routes. */
export function buildReorderSchema() {
  return {
    body: {
      type: 'object',
      required: ['ids'],
      properties: {
        ids: {
          type: 'array',
          minItems: 1,
          maxItems: REORDER_MAX_IDS,
          uniqueItems: true,
          items: { type: 'string', minLength: 1, maxLength: REORDER_ID_MAX_LENGTH },
        },
      },
      additionalProperties: false,
    },
  };
}
