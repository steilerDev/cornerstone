import { SEARCH_QUERY_MIN_LENGTH, foldSearchText } from '@cornerstone/shared';
import type {
  AreaResponse,
  HouseholdItemCategoryEntity,
  TradeResponse,
  UserResponse,
  VendorListItem,
  WorkItemStatus,
} from '@cornerstone/shared';
import { buildTree } from '../../lib/areaTreeUtils.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { fetchHouseholdItemCategories } from '../../lib/householdItemCategoriesApi.js';
import { listPaperlessDocuments } from '../../lib/paperlessApi.js';
import { fetchOrientations } from '../../lib/orientationApi.js';
import { searchEverywhere } from '../../lib/searchApi.js';
import { fetchTrades } from '../../lib/tradesApi.js';
import { searchCompanies } from '../../lib/vendorsApi.js';
import { listWorkItems } from '../../lib/workItemsApi.js';
import type { AreaBreadcrumbSegment } from '../AreaBreadcrumb/AreaBreadcrumb.js';
import type { EntityOption } from './types.js';

export const ENTITY_PICKER_KINDS = [
  'company',
  'who',
  'area',
  'orientation',
  'trade',
  'category',
  'task',
  'taskOrPurchase',
  'document',
] as const;
export type EntityPickerKind = (typeof ENTITY_PICKER_KINDS)[number];

/** The two groups of the Who picker. */
export const WHO_KINDS = ['company', 'member'] as const;
export type WhoKind = (typeof WHO_KINDS)[number];

/** The kinds that can be created in place ("New ‹kind› ‹text›"; companies have their own key). */
export const ENTITY_CREATE_KINDS = ['area', 'orientation', 'trade', 'category'] as const;
export type EntityCreateKind = (typeof ENTITY_CREATE_KINDS)[number];

type Translate = (key: string, options?: { defaultValue: string }) => string;

/** The translators the per-kind searches need (`common` and `settings` namespaces). */
export interface PickerTranslators {
  readonly common: Translate;
  readonly settings: Translate;
}

const WHO_PREFIX: Record<WhoKind, string> = { company: 'company:', member: 'member:' };

/** Who value: 'company:<id>' | 'member:<id>' | ''. */
export function encodeWho(who: {
  readonly userId?: string | null;
  readonly vendorId?: string | null;
}): string {
  if (who.userId) return `${WHO_PREFIX.member}${who.userId}`;
  if (who.vendorId) return `${WHO_PREFIX.company}${who.vendorId}`;
  return '';
}

export function decodeWho(value: string): {
  userId: string | undefined;
  vendorId: string | undefined;
} {
  if (value.startsWith(WHO_PREFIX.member)) {
    return { userId: value.slice(WHO_PREFIX.member.length), vendorId: undefined };
  }
  if (value.startsWith(WHO_PREFIX.company)) {
    return { userId: undefined, vendorId: value.slice(WHO_PREFIX.company.length) };
  }
  return { userId: undefined, vendorId: undefined };
}

/** The group a Who value belongs to; undefined for ''. */
export function whoKindOf(value: string): WhoKind | undefined {
  const { userId, vendorId } = decodeWho(value);
  if (userId) return 'member';
  if (vendorId) return 'company';
  return undefined;
}

/** taskOrPurchase value: '<work_item|household_item>:<id>'. */
export function itemValue(target: {
  readonly type: 'work_item' | 'household_item';
  readonly id: string;
}): string {
  return `${target.type}:${target.id}`;
}

/** Inverse of `itemValue`; anything else (including '') is null. */
export function parseItemValue(
  value: string,
): { readonly type: 'work_item' | 'household_item'; readonly id: string } | null {
  for (const type of ['work_item', 'household_item'] as const) {
    const prefix = `${type}:`;
    if (value.startsWith(prefix) && value.length > prefix.length) {
      return { type, id: value.slice(prefix.length) };
    }
  }
  return null;
}

export function notExcluded(option: EntityOption, excludeIds: readonly string[]): boolean {
  return !excludeIds.includes(option.id);
}

function tradeName(translate: Translate, trade: Pick<TradeResponse, 'name' | 'translationKey'>) {
  return getCategoryDisplayName(translate, trade.name, trade.translationKey);
}

// ---- company / who ----

export function companyOption(
  company: VendorListItem,
  translate: Translate,
  asWho: boolean,
): EntityOption {
  return {
    id: asWho ? encodeWho({ vendorId: company.id }) : company.id,
    label: company.name,
    secondary: company.trade ? tradeName(translate, company.trade) : undefined,
    group: asWho ? 'company' : undefined,
    entityId: company.id,
  };
}

export async function searchCompanyOptions(
  query: string,
  signal: AbortSignal,
  translate: Translate,
  asWho: boolean,
): Promise<EntityOption[]> {
  const found = await searchCompanies(query, signal);
  return found.map((company) => companyOption(company, translate, asWho));
}

/** Companies first (server search), then the household members already loaded. */
export async function searchWhoOptions(
  query: string,
  signal: AbortSignal,
  users: readonly UserResponse[],
  translate: Translate,
): Promise<EntityOption[]> {
  const companies = await searchCompanyOptions(query, signal, translate, true);
  const wanted = foldSearchText(query);
  const members: EntityOption[] = users
    .filter((user) => !user.deactivatedAt && foldSearchText(user.displayName).includes(wanted))
    .map((user) => ({
      id: encodeWho({ userId: user.id }),
      label: user.displayName,
      group: 'member',
      entityId: user.id,
    }));
  return [...companies, ...members];
}

// ---- area ----

/** Root-first path of an area, the area itself included; a cyclic parent chain ends the walk. */
export function areaPathSegments(
  areas: readonly AreaResponse[],
  areaId: string,
): AreaBreadcrumbSegment[] {
  const byId = new Map(areas.map((area) => [area.id, area]));
  const segments: AreaBreadcrumbSegment[] = [];
  const seen = new Set<string>();
  let current = byId.get(areaId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    segments.unshift({ id: current.id, name: current.name });
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return segments;
}

export const AREA_PATH_SEPARATOR = ' › ';

export function pathText(path: readonly AreaBreadcrumbSegment[]): string {
  return path.map((segment) => segment.name).join(AREA_PATH_SEPARATOR);
}

/** Each matching area is followed by its descendants (#1723), from the loaded area tree;
 *  an area already listed keeps its first position. */
function withDescendants(
  matches: readonly EntityOption[],
  areas: readonly AreaResponse[],
): EntityOption[] {
  const tree = buildTree([...areas]);
  const seen = new Set<string>();
  const result: EntityOption[] = [];
  const add = (option: EntityOption) => {
    if (seen.has(option.id)) return;
    seen.add(option.id);
    result.push(option);
  };
  for (const match of matches) {
    add(match);
    const index = tree.findIndex(({ area }) => area.id === match.id);
    if (index < 0) continue;
    const depth = tree[index]!.depth; // index >= 0 checked above
    for (const node of tree.slice(index + 1)) {
      if (node.depth <= depth) break;
      add({ id: node.area.id, label: node.area.name, path: areaPathSegments(areas, node.area.id) });
    }
  }
  return result;
}

export async function searchAreaOptions(
  query: string,
  signal: AbortSignal,
  areas: readonly AreaResponse[],
): Promise<EntityOption[]> {
  const trimmed = query.trim();
  if (trimmed.length >= SEARCH_QUERY_MIN_LENGTH) {
    const response = await searchEverywhere({ q: trimmed, types: ['area'], limit: 20 }, signal);
    const options: EntityOption[] = [];
    for (const group of response.groups) {
      if (group.type !== 'area') continue;
      for (const item of group.items) {
        const name = item.label ?? '';
        const base = item.areaPath ?? [];
        const path = base.some((segment) => segment.id === item.id)
          ? base
          : [...base, { id: item.id, name }];
        options.push({ id: item.id, label: name, path });
      }
    }
    return withDescendants(options, areas);
  }
  const wanted = foldSearchText(trimmed);
  return buildTree([...areas])
    .filter(({ area }) => foldSearchText(area.name).includes(wanted))
    .map(({ area }) => ({
      id: area.id,
      label: area.name,
      path: areaPathSegments(areas, area.id),
    }));
}

// ---- orientation ----

export async function searchOrientationOptions(query: string): Promise<EntityOption[]> {
  const response = await fetchOrientations(query.trim() ? { search: query.trim() } : undefined);
  return response.orientations.map((orientation) => ({
    id: orientation.id,
    label: orientation.name,
    secondary: orientation.description ?? undefined,
  }));
}

// ---- trade / category: translated defaults, so the list is filtered on the client ----

export interface NamedEntry {
  readonly option: EntityOption;
  /** The stored name; the display name (the label) may be a translation of it. */
  readonly rawName: string;
}

export async function loadTradeEntries(translate: Translate): Promise<NamedEntry[]> {
  const response = await fetchTrades();
  return response.trades.map((trade) => ({
    option: { id: trade.id, label: tradeName(translate, trade) },
    rawName: trade.name,
  }));
}

export async function loadCategoryEntries(translate: Translate): Promise<NamedEntry[]> {
  const response = await fetchHouseholdItemCategories();
  return response.categories.map((category: HouseholdItemCategoryEntity) => ({
    option: { id: category.id, label: tradeName(translate, category) },
    rawName: category.name,
  }));
}

/** Matches the stored and the translated name, folded. */
export function filterNamedEntries(entries: readonly NamedEntry[], query: string): EntityOption[] {
  const wanted = foldSearchText(query);
  return entries
    .filter(
      ({ option, rawName }) =>
        foldSearchText(option.label).includes(wanted) || foldSearchText(rawName).includes(wanted),
    )
    .map(({ option }) => option);
}

// ---- task / taskOrPurchase ----

const TASK_PAGE_SIZE = 15;
const TARGET_LIMIT = 10;

export async function searchTaskOptions(
  query: string,
  statusWord: (status: WorkItemStatus) => string,
): Promise<EntityOption[]> {
  const response = await listWorkItems({ q: query.trim() || undefined, pageSize: TASK_PAGE_SIZE });
  return response.items.map((item) => ({
    id: item.id,
    label: item.title,
    secondaryPath: item.area
      ? [
          ...item.area.ancestors.map((a) => ({ id: a.id, name: a.name })),
          { id: item.area.id, name: item.area.name },
        ]
      : undefined,
    trailing: statusWord(item.status),
  }));
}

export interface TargetKindWords {
  readonly task: string;
  readonly purchase: string;
}

/** One search over tasks and purchases; below the minimum query length it offers nothing. */
export async function searchTaskOrPurchaseOptions(
  query: string,
  signal: AbortSignal,
  words: TargetKindWords,
): Promise<EntityOption[]> {
  const trimmed = query.trim();
  if (trimmed.length < SEARCH_QUERY_MIN_LENGTH) return [];
  const response = await searchEverywhere(
    { q: trimmed, types: ['work_item', 'household_item'], limit: TARGET_LIMIT },
    signal,
  );
  const options: EntityOption[] = [];
  for (const group of response.groups) {
    if (group.type !== 'work_item' && group.type !== 'household_item') continue;
    for (const item of group.items) {
      options.push({
        id: itemValue({ type: group.type, id: item.id }),
        label: item.label ?? '',
        itemType: group.type,
        entityId: item.id,
        kindWord: group.type === 'work_item' ? words.task : words.purchase,
        secondaryPath: item.areaPath ?? undefined,
      });
    }
  }
  return options;
}

// ---- document (Paperless) ----

const DOCUMENT_PAGE_SIZE = 25;

/** Server search over Paperless documents; documents that are already linked are not listed. */
export async function searchDocumentOptions(
  query: string,
  linkedIds: ReadonlySet<number>,
  dateText: (iso: string) => string,
): Promise<EntityOption[]> {
  const trimmed = query.trim();
  const response = await listPaperlessDocuments(
    trimmed
      ? { query: trimmed, pageSize: DOCUMENT_PAGE_SIZE }
      : { pageSize: DOCUMENT_PAGE_SIZE, sortBy: 'created', sortOrder: 'desc' },
  );
  return response.documents
    .filter((doc) => !linkedIds.has(doc.id))
    .map((doc) => ({
      id: String(doc.id),
      label: doc.title,
      entityId: String(doc.id),
      secondary:
        [doc.correspondent, doc.created && dateText(doc.created)].filter(Boolean).join(' · ') ||
        undefined,
      document: { title: doc.title, correspondent: doc.correspondent, created: doc.created },
    }));
}
