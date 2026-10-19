import { HISTORY_EVENT_TYPES, HISTORY_OBJECT_TYPES } from '@cornerstone/shared';
import type {
  DiaryEntrySummary,
  HistoryEventType,
  HistoryObjectType,
  HistoryQuery,
} from '@cornerstone/shared';

export interface HistoryFilters {
  type: HistoryEventType | null;
  object: { entityType: HistoryObjectType; entityId: string } | null;
  q: string;
  /** '' = none */
  dateFrom: string;
  dateTo: string;
  includeDiary: boolean;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OBJECT_PATTERN = /^(work_item|invoice|milestone|subsidy_program):(.{1,64})$/;

function readDate(value: string | null): string {
  return value !== null && DATE_PATTERN.test(value) ? value : '';
}

/** Parses the URL into filters; invalid values are ignored, never rewritten. */
export function readHistoryFilters(params: URLSearchParams): HistoryFilters {
  const rawType = params.get('type');
  const type = (HISTORY_EVENT_TYPES as readonly string[]).includes(rawType ?? '')
    ? (rawType as HistoryEventType)
    : null;

  const match = OBJECT_PATTERN.exec(params.get('object') ?? '');
  const object =
    match && (HISTORY_OBJECT_TYPES as readonly string[]).includes(match[1]!)
      ? { entityType: match[1] as HistoryObjectType, entityId: match[2]! }
      : null;

  return {
    type,
    object,
    q: params.get('q') ?? '',
    dateFrom: readDate(params.get('dateFrom')),
    dateTo: readDate(params.get('dateTo')),
    includeDiary: params.get('include') === 'diary',
  };
}

function setOrDelete(params: URLSearchParams, key: string, value: string | null): void {
  if (value) params.set(key, value);
  else params.delete(key);
}

/** Merges into `prev` (keeps unknown keys); empty values delete their key. */
export function writeHistoryFilters(
  prev: URLSearchParams,
  patch: Partial<HistoryFilters>,
): URLSearchParams {
  const next = new URLSearchParams(prev);
  if ('type' in patch) setOrDelete(next, 'type', patch.type ?? null);
  if ('object' in patch) {
    setOrDelete(
      next,
      'object',
      patch.object ? `${patch.object.entityType}:${patch.object.entityId}` : null,
    );
  }
  if ('q' in patch) setOrDelete(next, 'q', patch.q ?? null);
  if ('dateFrom' in patch) setOrDelete(next, 'dateFrom', patch.dateFrom ?? null);
  if ('dateTo' in patch) setOrDelete(next, 'dateTo', patch.dateTo ?? null);
  if ('includeDiary' in patch) setOrDelete(next, 'include', patch.includeDiary ? 'diary' : null);
  return next;
}

export function toHistoryQuery(
  f: HistoryFilters,
  page: number,
  pageSize: number,
  showHidden: boolean,
): HistoryQuery {
  return {
    page,
    pageSize,
    ...(f.type ? { type: f.type } : {}),
    ...(f.object ? { entityType: f.object.entityType, entityId: f.object.entityId } : {}),
    ...(f.q.trim() ? { q: f.q.trim() } : {}),
    ...(f.dateFrom ? { dateFrom: f.dateFrom } : {}),
    ...(f.dateTo ? { dateTo: f.dateTo } : {}),
    ...(f.includeDiary ? { includeDiary: true } : {}),
    ...(showHidden ? { showHidden: true } : {}),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local YYYY-MM-DD of an ISO timestamp. */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Day key of a row: automatic -> local day of createdAt; manual -> entryDate. */
export function dayKeyOf(entry: DiaryEntrySummary): string {
  return entry.isAutomatic ? localDayKey(entry.createdAt) : entry.entryDate;
}

/** Type, object, search and dates count; the include toggle does not. */
export function hasActiveFilters(f: HistoryFilters): boolean {
  return Boolean(f.type || f.object || f.q || f.dateFrom || f.dateTo);
}
