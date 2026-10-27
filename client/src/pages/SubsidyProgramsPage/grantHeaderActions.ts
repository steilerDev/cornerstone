import type { SubsidyApplicationStatus } from '@cornerstone/shared';

export type GrantPrimary =
  { readonly kind: 'status'; readonly to: SubsidyApplicationStatus } | { readonly kind: 'log' };

/**
 * The header's one primary: the next forward status move; Log once there is none. `forwardTo` is
 * the first forward transition of the grant's status, or null at the end of the road.
 */
export function grantPrimary(forwardTo: SubsidyApplicationStatus | null): GrantPrimary {
  return forwardTo === null ? { kind: 'log' } : { kind: 'status', to: forwardTo };
}
