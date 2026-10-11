/**
 * Global search types (story #2210, API contract 6).
 */

export const SEARCH_RESULT_TYPES = [
  'work_item',
  'milestone',
  'household_item',
  'invoice',
  'vendor',
  'diary_entry',
  'area',
  'budget_line',
  'paperless_document',
] as const;
export type SearchResultType = (typeof SEARCH_RESULT_TYPES)[number];

export const SEARCH_MATCHED_FIELDS = [
  'title',
  'description',
  'name',
  'invoiceNumber',
  'notes',
  'companyName',
  'tradeName',
  'phone',
  'email',
  'contactName',
  'contactPhone',
  'contactEmail',
  'body',
  'fullText',
] as const;
export type SearchMatchedField = (typeof SEARCH_MATCHED_FIELDS)[number];

export const SEARCH_QUERY_MIN_LENGTH = 2;
export const SEARCH_QUERY_MAX_LENGTH = 100;
export const SEARCH_DEFAULT_LIMIT = 5;
export const SEARCH_MAX_LIMIT = 20;

export interface SearchAreaRef {
  id: string;
  name: string;
}

export interface SearchParentRef {
  type: 'work_item' | 'household_item' | 'invoice';
  id: string;
  label: string | null;
}

export interface SearchResultItem {
  id: string;
  label: string | null;
  sublabel: string | null;
  matchedField: SearchMatchedField;
  status: string | null;
  kind: string | null;
  date: string | null;
  phone: string | null;
  areaPath: SearchAreaRef[] | null;
  parent: SearchParentRef | null;
}

export type SearchGroupStatus = 'ok' | 'unavailable';

export interface SearchGroup {
  type: SearchResultType;
  total: number;
  status: SearchGroupStatus;
  items: SearchResultItem[];
}

export interface SearchResponse {
  query: string;
  groups: SearchGroup[];
}

export interface SearchQuery {
  q: string;
  types?: string;
  limit?: number;
}
