import type { DependencyType } from '@cornerstone/shared';

/**
 * Sentinel constant used on the create page where the new item doesn't have a real ID yet.
 */
export const THIS_ITEM_ID = '__THIS_ITEM__';

export type DependencyVerb = 'finish' | 'start';

/**
 * Maps a predecessor verb + successor verb pair to the corresponding DependencyType.
 *
 * The naming convention is from the perspective of Finish-to-Start (FS), etc.:
 *   finish + start  → finish_to_start  (predecessor finishes, then successor starts)
 *   start  + start  → start_to_start   (predecessor starts, then successor starts)
 *   finish + finish → finish_to_finish (predecessor finishes, then successor finishes)
 *   start  + finish → start_to_finish  (predecessor starts, then successor finishes)
 */
export function verbsToDependencyType(
  predecessorVerb: DependencyVerb,
  successorVerb: DependencyVerb,
): DependencyType {
  if (predecessorVerb === 'finish' && successorVerb === 'start') return 'finish_to_start';
  if (predecessorVerb === 'start' && successorVerb === 'start') return 'start_to_start';
  if (predecessorVerb === 'finish' && successorVerb === 'finish') return 'finish_to_finish';
  // start + finish → start_to_finish
  return 'start_to_finish';
}

/**
 * Reverse mapping: converts a DependencyType back into its two verb components.
 */
export function dependencyTypeToVerbs(type: DependencyType): {
  predecessorVerb: DependencyVerb;
  successorVerb: DependencyVerb;
} {
  switch (type) {
    case 'finish_to_start':
      return { predecessorVerb: 'finish', successorVerb: 'start' };
    case 'start_to_start':
      return { predecessorVerb: 'start', successorVerb: 'start' };
    case 'finish_to_finish':
      return { predecessorVerb: 'finish', successorVerb: 'finish' };
    case 'start_to_finish':
      return { predecessorVerb: 'start', successorVerb: 'finish' };
  }
}
