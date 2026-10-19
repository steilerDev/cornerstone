import type { UserListItem } from '@cornerstone/shared';

/** Account state shown on Settings > Users (#2219). Order = sort order and filter option order. */
export const USER_ACCOUNT_STATUSES = ['active', 'locked', 'deactivated'] as const;
export type UserAccountStatus = (typeof USER_ACCOUNT_STATUSES)[number];

/**
 * Deactivated wins over locked. The server sends lockedUntil only while the lock is active, so a
 * non-null value means locked; never derive "locked" from failed attempts.
 */
export function userAccountStatus(
  user: Pick<UserListItem, 'deactivatedAt' | 'lockedUntil'>,
): UserAccountStatus {
  if (user.deactivatedAt) return 'deactivated';
  return user.lockedUntil ? 'locked' : 'active';
}

/** True when two ISO timestamps fall on the same local calendar day. */
export function isSameLocalDay(a: string, b: string): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}
