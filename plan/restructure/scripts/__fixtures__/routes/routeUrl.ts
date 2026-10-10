import { ROUTE_MAP } from './routeMap.js';

export function routePattern(id: string): string {
  const entry = ROUTE_MAP.find((e) => 'id' in e && e.id === id);
  if (!entry) throw new Error(`Unknown route id '${id}'`);
  return entry.from;
}
