import type {
  AreaResponse,
  DailyLogMetadata,
  DeliveryMetadata,
  DiaryEntrySummary,
  SiteVisitMetadata,
  WorkItemSummary,
} from '@cornerstone/shared';
import { foldSearchText } from '@cornerstone/shared';

/** A company offered as a chip. `id` is null for a name known only from a delivery entry. */
export interface CompanySuggestion {
  id: string | null;
  name: string;
}

const MAX_TITLES = 6;
const MAX_COMPANIES = 4;
const MAX_TIMES = 3;

function fold(text: string): string {
  return foldSearchText(text.trim());
}

/** Up to 6 distinct non-empty titles, newest first (`entries` are newest first). */
export function recentTitles(entries: readonly Pick<DiaryEntrySummary, 'title'>[]): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const entry of entries) {
    const title = entry.title?.trim();
    if (!title) continue;
    const key = fold(title);
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
    if (titles.length === MAX_TITLES) break;
  }
  return titles;
}

function companyKey(company: CompanySuggestion): string {
  return company.id ?? `name:${fold(company.name)}`;
}

/** Work items' companies by how many work items they have, most first. */
export function floorVendorsFromWorkItems(
  items: readonly Pick<WorkItemSummary, 'assignedVendor'>[],
): CompanySuggestion[] {
  const counts = new Map<string, { company: CompanySuggestion; count: number }>();
  for (const item of items) {
    const vendor = item.assignedVendor;
    if (!vendor) continue;
    const existing = counts.get(vendor.id);
    if (existing) existing.count += 1;
    else counts.set(vendor.id, { company: { id: vendor.id, name: vendor.name }, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).map((entry) => entry.company);
}

/**
 * Up to 4 companies: first those used on saved entries with the same title (most often, then
 * most recent), then the companies with work on the same floor. Deduplicated. With
 * `requireId` only companies that have an id are offered (the daily log stores the id).
 */
export function rankCompanies(
  entries: readonly Pick<DiaryEntrySummary, 'title' | 'entryType' | 'metadata'>[],
  title: string,
  floorVendors: readonly CompanySuggestion[],
  options: { requireId: boolean },
): CompanySuggestion[] {
  const folded = fold(title);
  const knownByName = new Map<string, CompanySuggestion>();
  for (const vendor of floorVendors) knownByName.set(fold(vendor.name), vendor);
  for (const entry of entries) {
    if (entry.entryType !== 'daily_log' || !entry.metadata) continue;
    const m = entry.metadata as DailyLogMetadata;
    if (m.vendorId && m.vendorName) {
      knownByName.set(fold(m.vendorName), { id: m.vendorId, name: m.vendorName });
    }
  }

  const group1 = new Map<string, { company: CompanySuggestion; count: number; first: number }>();
  if (folded) {
    entries.forEach((entry, index) => {
      if (!entry.title || fold(entry.title) !== folded || !entry.metadata) return;
      let company: CompanySuggestion | null = null;
      if (entry.entryType === 'daily_log') {
        const m = entry.metadata as DailyLogMetadata;
        if (m.vendorId && m.vendorName) company = { id: m.vendorId, name: m.vendorName };
      } else if (entry.entryType === 'delivery') {
        const vendor = (entry.metadata as DeliveryMetadata).vendor;
        if (vendor?.trim()) {
          company = knownByName.get(fold(vendor)) ?? { id: null, name: vendor.trim() };
        }
      }
      if (!company) return;
      const key = companyKey(company);
      const existing = group1.get(key);
      if (existing) existing.count += 1;
      else group1.set(key, { company, count: 1, first: index });
    });
  }
  const ranked = [...group1.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .map((entry) => entry.company);

  const result: CompanySuggestion[] = [];
  const seen = new Set<string>();
  for (const company of [...ranked, ...floorVendors]) {
    if (options.requireId && !company.id) continue;
    const key = companyKey(company);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(company);
    if (result.length === MAX_COMPANIES) break;
  }
  return result;
}

/** Up to 3 distinct start or end times from daily logs and site visits, newest first. */
export function recentTimes(
  entries: readonly Pick<DiaryEntrySummary, 'entryType' | 'metadata'>[],
  key: 'workStart' | 'workEnd',
): string[] {
  const times: string[] = [];
  for (const entry of entries) {
    if (entry.entryType !== 'daily_log' && entry.entryType !== 'site_visit') continue;
    const value = (entry.metadata as DailyLogMetadata | SiteVisitMetadata | null)?.[key];
    if (!value || times.includes(value)) continue;
    times.push(value);
    if (times.length === MAX_TIMES) break;
  }
  return times;
}

/**
 * The floor of an area: its root ancestor; when the household has exactly one root area (the
 * house), the ancestor one level below it instead (the area itself at depth 1 or less).
 * Null for an unknown area.
 */
export function floorOf(areaId: string | null, areas: readonly AreaResponse[]): string | null {
  if (!areaId) return null;
  const byId = new Map(areas.map((area) => [area.id, area]));
  if (!byId.has(areaId)) return null;
  const chain: AreaResponse[] = [];
  const visited = new Set<string>();
  let current = byId.get(areaId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  // chain[0] is the area, the last element is its root.
  const rootCount = areas.filter((area) => area.parentId === null).length;
  if (rootCount === 1) {
    return chain.length >= 2 ? chain[chain.length - 2]!.id : chain[0]!.id;
  }
  return chain[chain.length - 1]!.id;
}
