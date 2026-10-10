import { ROUTE_MAP } from './routeMap.js';

export function effectiveTarget(entry: {
  stage: string;
  kind: string;
  to: string;
  interim?: string;
}): string | null {
  if (entry.stage === 'done') return entry.kind === 'redirect' ? entry.to : null;
  if (entry.stage === 'interim' && entry.interim !== undefined && entry.interim !== 'page') {
    return entry.interim;
  }
  return null;
}

export const LIVE_REDIRECT_ROUTES = ROUTE_MAP.flatMap((entry) => {
  if (entry.stage === 'planned' || 'match' in entry) return [];
  const target = effectiveTarget(entry);
  return target === null ? [] : [{ from: entry.from, path: entry.from, target }];
});
