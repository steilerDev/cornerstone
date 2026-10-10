import { routeUrl, safeAppPath } from '@cornerstone/shared';
import { pathnameOf } from './origin.js';

/**
 * The login URL for a signed-out visit to `loc`: `next` is the full in-app URL the user asked
 * for, omitted when that URL is exactly the root.
 */
export function loginUrlFor(loc: { pathname: string; search: string; hash: string }): string {
  const target = `${loc.pathname}${loc.search}${loc.hash}`;
  const next = safeAppPath(target);
  if (next === null || next === '/') return routeUrl('login');
  return routeUrl('login', undefined, { next });
}

/**
 * The validated `next` of a login-page search string, or null when it fails `safeAppPath` or
 * points at the login or setup page (which would loop).
 */
export function readNextParam(search: string): string | null {
  const next = safeAppPath(new URLSearchParams(search).get('next'));
  if (next === null) return null;
  const path = pathnameOf(next);
  if (path === routeUrl('login') || path === routeUrl('setup')) return null;
  return next;
}
