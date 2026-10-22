import type { StatusMenuTransition } from '../StatusMenu/StatusMenu.js';

/**
 * The status the header's primary moves to: the `to` of the first forward transition, in the
 * order of the object's shared transition map. Null when there is none (terminal state): the
 * page then uses its fallback primary (`useLogPrimary()`, or Convert to invoice for an offer).
 */
export function forwardActionTo<S extends string>(
  transitions: readonly StatusMenuTransition<S>[],
): S | null {
  return transitions.find((transition) => transition.direction === 'forward')?.to ?? null;
}
