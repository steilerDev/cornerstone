import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  SearchGroup,
  SearchGroupStatus,
  SearchResponse,
  SearchResultItem,
  SearchResultType,
} from '@cornerstone/shared';
import { SEARCH_RESULT_TYPES } from '@cornerstone/shared';

/** Test helpers for the command search (#2211): synthetic result data and an English `t`. */

const I18N_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../i18n');

const EN_COMMON = JSON.parse(fs.readFileSync(path.join(I18N_DIR, 'en', 'common.json'), 'utf8')) as {
  [key: string]: unknown;
};

function lookup(key: string): string | undefined {
  let node: unknown = EN_COMMON;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** English `common` translations with `{{x}}` interpolation and `_one`/`_other` plurals. */
export function enT(key: string, options?: Record<string, unknown>): string {
  let template = lookup(key);
  if (template === undefined && options && typeof options.count === 'number') {
    template = lookup(`${key}_${options.count === 1 ? 'one' : 'other'}`);
  }
  if (template === undefined) return key;
  return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(options?.[name] ?? ''));
}

export const enFormatters = {
  formatDate: (d: string | null | undefined): string => (d ? `D(${d})` : ''),
  formatDayMonth: (d: string | null | undefined): string => (d ? `DM(${d})` : ''),
};

let counter = 0;

/** One synthetic result item; every field defaults to the "unused" null. */
export function makeItem(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
  counter += 1;
  return {
    id: `id-${counter}`,
    label: `Label ${counter}`,
    sublabel: null,
    matchedField: 'title',
    status: null,
    kind: null,
    date: null,
    phone: null,
    areaPath: null,
    parent: null,
    ...overrides,
  };
}

export function makeGroup(
  type: SearchResultType,
  items: SearchResultItem[] = [],
  extra: { total?: number; status?: SearchGroupStatus } = {},
): SearchGroup {
  return {
    type,
    total: extra.total ?? items.length,
    status: extra.status ?? 'ok',
    items,
  };
}

/** A response with every group present in the fixed order (empty unless given). */
export function makeResponse(
  query: string,
  groups: Partial<Record<SearchResultType, SearchGroup>> = {},
): SearchResponse {
  return {
    query,
    groups: SEARCH_RESULT_TYPES.filter((type) => type !== 'paperless_document' || groups[type]).map(
      (type) => groups[type] ?? makeGroup(type),
    ),
  };
}
