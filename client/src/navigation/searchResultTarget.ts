import { routeUrl } from '@cornerstone/shared';
import type { SearchResultItem, SearchResultType } from '@cornerstone/shared';

export type SearchResultTarget = { kind: 'app'; href: string } | null;

function app(href: string): SearchResultTarget {
  return { kind: 'app', href };
}

/** Where a search result opens. Null when the result has no page to open. */
export function searchResultTarget(
  type: SearchResultType,
  item: SearchResultItem,
): SearchResultTarget {
  const { id } = item;
  switch (type) {
    case 'work_item':
      return app(routeUrl('workItem', { id }));
    case 'milestone':
      return app(routeUrl('milestone', { id }));
    case 'household_item':
      return app(routeUrl('householdItem', { id }));
    case 'invoice':
      return app(routeUrl('invoice', { id }));
    case 'vendor':
      return app(routeUrl('company', { id }));
    case 'diary_entry':
      return app(routeUrl('diaryEntry', { id }));
    case 'area':
      return app(routeUrl('area', { id }));
    case 'budget_line': {
      const parent = item.parent;
      if (!parent) return app(routeUrl('budgetOverview'));
      switch (parent.type) {
        case 'work_item':
          return app(routeUrl('workItem', { id: parent.id }));
        case 'household_item':
          return app(routeUrl('householdItem', { id: parent.id }));
        case 'invoice':
          return app(routeUrl('invoice', { id: parent.id }));
        default: {
          const exhaustive: never = parent.type;
          void exhaustive;
          return null;
        }
      }
    }
    case 'paperless_document':
      return app(routeUrl('documents', undefined, { doc: id }));
    default: {
      const exhaustive: never = type;
      void exhaustive;
      return null;
    }
  }
}
