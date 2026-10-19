import { HISTORY_EVENT_TYPES, routeUrl } from '@cornerstone/shared';
import type { HistoryEventType } from '@cornerstone/shared';

function isHistoryEventType(value: string): value is HistoryEventType {
  return (HISTORY_EVENT_TYPES as readonly string[]).includes(value);
}

/** Target of a page-served ?filterMode map (route map interim: 'page'), or null to stay. */
export function diaryHistoryRedirectTarget(search: URLSearchParams): string | null {
  const mode = search.get('filterMode');
  if (mode !== 'automatic' && mode !== 'all') return null;

  const query: Record<string, string> = {};
  for (const key of ['q', 'dateFrom', 'dateTo'] as const) {
    const value = search.get(key);
    if (value) query[key] = value;
  }
  const type = (search.get('types') ?? '')
    .split(',')
    .map((value) => value.trim())
    .find(isHistoryEventType);
  if (type) query.type = type;
  if (mode === 'all') query.include = 'diary';

  return routeUrl('history', undefined, query);
}
