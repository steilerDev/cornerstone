// Route map barrel (EPIC-21, ADR-038). E2E page objects import this file as source.
export { ROUTE_MAP } from './routeMap.js';
export type {
  RouteChange,
  RouteCondition,
  RouteGate,
  RouteGuard,
  RouteKind,
  RouteMapEntry,
  RouteMatch,
  RouteSection,
  RouteStage,
} from './types.js';
export { getRouteEntry, isRouteServed, routePattern, routeUrl } from './routeUrl.js';
export type {
  RouteId,
  RouteParams,
  RoutePatternOf,
  RouteQuery,
  RouteQueryValue,
  ServedRouteId,
} from './routeUrl.js';
export {
  LIVE_REDIRECT_ROUTES,
  applyQueryMap,
  conditionHolds,
  effectiveTarget,
  liveConditionalRules,
  liveQueryMaps,
  queryMatches,
  resolveRedirect,
  resolveRedirectRule,
} from './redirects.js';
export type { LiveQueryMap, LiveRedirectRoute, RouteGateContext } from './redirects.js';
export { baseFrom } from './paths.js';
export { matchLocation, matchPattern, resolveLocation } from './match.js';
export type { RouteContext, RouteResolution } from './match.js';
export { MAX_APP_PATH_LENGTH, safeAppPath } from './safePath.js';
