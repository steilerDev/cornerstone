import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import type { UserRole } from '@cornerstone/shared';
import { useAuth } from '../../contexts/AuthContext.js';

export interface RoleGuardProps {
  /** Roles allowed to see the child routes. */
  allow: readonly UserRole[];
  /** Rendered in place (no redirect, URL kept) when the signed-in role is not allowed. */
  fallback: ReactNode;
}

/**
 * Layout route that renders its child routes only for the allowed roles (D-23).
 * Renders nothing while the session is loading, so neither the admin page nor its API
 * calls flash for a member. The server enforces the same rule (requireRole) — this is
 * the UI half only.
 */
export function RoleGuard({ allow, fallback }: RoleGuardProps) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user && allow.includes(user.role)) return <Outlet />;
  return <>{fallback}</>;
}

export default RoleGuard;
