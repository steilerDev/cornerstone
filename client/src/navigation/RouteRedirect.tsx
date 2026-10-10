import { Navigate, useLocation, useParams } from 'react-router-dom';
import { resolveRedirect } from '@cornerstone/shared';
import type { LiveRedirectRoute } from '@cornerstone/shared';

export interface RouteRedirectProps {
  /** A plain redirect generated from the shared route map. */
  readonly rule: LiveRedirectRoute;
}

/**
 * One-hop redirect for a route-map entry. Fills `:params` from the matched URL and carries the
 * query string and hash across (target-defined query keys win).
 */
export function RouteRedirect({ rule }: RouteRedirectProps) {
  const params = useParams();
  const { search, hash } = useLocation();
  return <Navigate to={resolveRedirect(rule.target, params, search, hash)} replace />;
}

export default RouteRedirect;
