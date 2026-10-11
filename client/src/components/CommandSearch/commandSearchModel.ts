import { SEARCH_MAX_LIMIT, routeUrl } from '@cornerstone/shared';
import type {
  DiaryEntryType,
  RouteQuery,
  SearchAreaRef,
  SearchGroupStatus,
  SearchMatchedField,
  SearchParentRef,
  SearchResponse,
  SearchResultItem,
  SearchResultType,
  ServedRouteId,
} from '@cornerstone/shared';
import { GLOSSARY } from '../../i18n/glossary.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { isManualDiaryEntryType } from '../../lib/diaryEntryTypeLabel.js';
import { findSearchDestinations } from '../../navigation/searchDestinations.js';
import type { SearchDestination } from '../../navigation/searchDestinations.js';
import { searchResultTarget } from '../../navigation/searchResultTarget.js';
import type { SearchResultTarget } from '../../navigation/searchResultTarget.js';
import { resolveNavActive } from '../../navigation/navActive.js';
import type { NavActive } from '../../navigation/navActive.js';
import { pathnameOf } from '../../navigation/origin.js';
import type { NavContext, NavLabelKey, NavSection } from '../../navigation/navConfig.js';

/** Minimal t() shape (works with useTranslation('common').t). */
export type ModelT = (key: string, options?: Record<string, unknown>) => string;

export interface ModelFormatters {
  readonly formatDate: (dateStr: string | null | undefined) => string;
  readonly formatDayMonth: (dateStr: string | null | undefined) => string;
}

export interface ModelDeps extends ModelFormatters {
  readonly t: ModelT;
  readonly language: string;
}

export const MAX_DESTINATIONS = 4;

export type CommandOption =
  | {
      readonly kind: 'destination';
      readonly id: string;
      readonly dest: SearchDestination;
      readonly title: string;
      readonly target: string;
      readonly replace: boolean;
    }
  | {
      readonly kind: 'item';
      readonly id: string;
      readonly type: SearchResultType;
      readonly item: SearchResultItem;
      readonly title: string;
      readonly target: SearchResultTarget;
      readonly disabled: boolean;
      /** Paperless link base not known yet: disabled for now, without the "can't open" text. */
      readonly pending: boolean;
    }
  | {
      readonly kind: 'more';
      readonly id: string;
      readonly type: SearchResultType;
      readonly count: number;
    };

export interface CommandGroupView {
  readonly type: SearchResultType;
  readonly total: number;
  readonly status: SearchGroupStatus;
  readonly shown: number;
  readonly options: readonly CommandOption[];
  /** The 20-item cap was reached and more exist: show the "narrow your search" note. */
  readonly capped: boolean;
}

export interface BuiltOptions {
  readonly destinations: readonly CommandOption[];
  readonly groups: readonly CommandGroupView[];
  /** Every option in visual order. */
  readonly flat: readonly CommandOption[];
}

export type Line2Part =
  | { readonly kind: 'text'; readonly text: string; readonly highlight: boolean }
  | { readonly kind: 'areaPath'; readonly segments: readonly SearchAreaRef[] };

export interface BuildInput extends ModelDeps {
  /** The live trimmed query (destinations are matched on it from one character). */
  readonly liveQuery: string;
  readonly response: SearchResponse | null;
  readonly expanded: ReadonlyMap<SearchResultType, readonly SearchResultItem[]>;
  readonly ctx: NavContext;
  readonly sections: readonly NavSection[];
  readonly active: NavActive | null;
  /** undefined: not fetched yet; null: Paperless has no link base. */
  readonly paperlessBaseUrl: string | null | undefined;
}

/** `(id)` characters that are not valid in a DOM id token are replaced. */
function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_');
}

export function optionDomId(listboxId: string, option: Pick<CommandOption, 'id'>): string {
  return `${safeId(listboxId)}-${safeId(option.id)}`;
}

/** App path of a destination, built from the route map. */
export function destinationHref(dest: SearchDestination): string {
  // dest.route is a served route (findSearchDestinations filters on it); params are never needed.
  return (
    routeUrl as unknown as (id: ServedRouteId, params?: undefined, query?: RouteQuery) => string
  )(dest.route as ServedRouteId, undefined, dest.query);
}

function glossaryForm(term: string, language: string): string {
  const entry = GLOSSARY.terms.find((candidate) => candidate.canon === term);
  if (!entry) return term;
  const forms = language.startsWith('de') ? entry.de : entry.en;
  return forms.chip ?? forms.singular ?? term;
}

/** The localised label of a destination: NavConfig label, else the glossary form. */
export function destinationLabel(dest: SearchDestination, t: ModelT, language: string): string {
  return dest.labelKey ? t(dest.labelKey) : glossaryForm(dest.term, language);
}

function kindWord(item: SearchResultItem, t: ModelT): string | null {
  // The API sends the raw entry type; only manual types have a user-facing word.
  const kind = item.kind as DiaryEntryType | null;
  if (kind === null || !isManualDiaryEntryType(kind)) return null;
  return t(I18N_UNION_KEYS.statusVocabularyDiaryType.key(kind));
}

/** The visible title of a result; falls back to the names the object's own page uses. */
export function itemTitle(type: SearchResultType, item: SearchResultItem, deps: ModelDeps): string {
  const label = item.label?.trim();
  if (label) return label;
  if (type === 'invoice') {
    return deps.t(item.status === 'quotation' ? 'navigation.offer' : 'navigation.invoice');
  }
  if (type === 'diary_entry') {
    return deps.t('navigation.diaryEntryUntitled', {
      type: kindWord(item, deps.t) ?? '',
      date: deps.formatDayMonth(item.date),
    });
  }
  return '';
}

/** Matched fields that are already visible in the title or the sublabel need no "Found in". */
export function foundInField(
  type: SearchResultType,
  item: SearchResultItem,
): SearchMatchedField | null {
  const field = item.matchedField;
  if (
    field === 'title' ||
    field === 'name' ||
    field === 'invoiceNumber' ||
    field === 'companyName' ||
    field === 'tradeName'
  ) {
    return null;
  }
  if (field === 'description' && type === 'budget_line') return null;
  return field;
}

const PARENT_KEYS: Record<SearchParentRef['type'], string> = {
  work_item: 'commandSearch.parent.workItem',
  household_item: 'commandSearch.parent.householdItem',
  invoice: 'commandSearch.parent.invoice',
};

function parentSentence(parent: SearchParentRef, t: ModelT): string {
  if (parent.label === null || parent.label.trim() === '') {
    return parent.type === 'invoice'
      ? t('commandSearch.parent.invoiceUnnamed')
      : t(PARENT_KEYS[parent.type], { label: '' }).trim();
  }
  return t(PARENT_KEYS[parent.type], { label: parent.label });
}

const DATE_TYPES: readonly SearchResultType[] = [
  'invoice',
  'milestone',
  'diary_entry',
  'paperless_document',
];

export function line2Parts(
  type: SearchResultType,
  item: SearchResultItem,
  deps: ModelDeps,
  disabled = false,
  showCannotOpen = true,
): Line2Part[] {
  const { t } = deps;
  const parts: Line2Part[] = [];
  const found = foundInField(type, item);
  const foundPart: Line2Part | null = found
    ? {
        kind: 'text',
        text: t('commandSearch.foundIn', {
          field: t(I18N_UNION_KEYS.searchMatchedField.key(found)),
        }),
        highlight: false,
      }
    : null;

  if (disabled) {
    if (showCannotOpen) {
      parts.push({ kind: 'text', text: t('commandSearch.cannotOpen'), highlight: false });
    }
    if (foundPart) parts.push(foundPart);
    return parts;
  }

  if (item.sublabel && item.sublabel.trim() !== '') {
    parts.push({ kind: 'text', text: item.sublabel, highlight: true });
  }
  if (type === 'vendor' && item.phone) {
    parts.push({ kind: 'text', text: item.phone, highlight: false });
  }
  if (type === 'diary_entry') {
    const word = kindWord(item, t);
    if (word) parts.push({ kind: 'text', text: word, highlight: false });
  }
  if (item.date && DATE_TYPES.includes(type)) {
    parts.push({ kind: 'text', text: deps.formatDate(item.date), highlight: false });
  }
  if (item.areaPath && item.areaPath.length > 0) {
    parts.push({ kind: 'areaPath', segments: item.areaPath });
  }
  if (item.parent) {
    parts.push({ kind: 'text', text: parentSentence(item.parent, t), highlight: false });
  }
  if (foundPart) parts.push(foundPart);
  return parts;
}

/** Option id of a result item (also used to keep the active row after "Show more"). */
export function itemOptionId(type: SearchResultType, item: Pick<SearchResultItem, 'id'>): string {
  return `${type}-${item.id}`;
}

function itemOption(
  type: SearchResultType,
  item: SearchResultItem,
  input: BuildInput,
): CommandOption {
  const target = searchResultTarget(type, item, {
    paperlessBaseUrl: input.paperlessBaseUrl ?? null,
  });
  const pending = type === 'paperless_document' && input.paperlessBaseUrl === undefined;
  return {
    kind: 'item',
    id: itemOptionId(type, item),
    type,
    item,
    title: itemTitle(type, item, input),
    target,
    disabled: target === null,
    pending,
  };
}

function destinationOption(
  dest: SearchDestination,
  index: number,
  input: BuildInput,
): CommandOption {
  const href = destinationHref(dest);
  // ADR-038 rule 8: a view switch inside the same section replaces history.
  const sameSection =
    input.active !== null &&
    input.active.exact &&
    resolveNavActive(pathnameOf(href), input.sections)?.sectionId === input.active.sectionId;
  return {
    kind: 'destination',
    id: `dest-${dest.route}-${index}`,
    dest,
    title: destinationLabel(dest, input.t, input.language),
    target: href,
    replace: sameSection,
  };
}

/** Destinations, then groups in response order, flattened in visual order. */
export function buildOptions(input: BuildInput): BuiltOptions {
  const labelOf = (key: NavLabelKey): string => input.t(key);
  const destinations = findSearchDestinations(input.liveQuery, input.ctx, labelOf)
    .slice(0, MAX_DESTINATIONS)
    .map((dest, index) => destinationOption(dest, index, input));

  const groups: CommandGroupView[] = [];
  for (const group of input.response?.groups ?? []) {
    const items = input.expanded.get(group.type) ?? group.items;
    const unavailable = group.status === 'unavailable';
    if (items.length === 0 && !unavailable) continue;
    const options: CommandOption[] = items.map((item) => itemOption(group.type, item, input));
    const remaining = Math.min(group.total, SEARCH_MAX_LIMIT) - items.length;
    if (remaining > 0) {
      options.push({
        kind: 'more',
        id: `more-${group.type}`,
        type: group.type,
        count: remaining,
      });
    }
    groups.push({
      type: group.type,
      total: group.total,
      status: group.status,
      shown: items.length,
      options,
      capped: items.length >= SEARCH_MAX_LIMIT && group.total > items.length,
    });
  }

  return {
    destinations,
    groups,
    flat: [...destinations, ...groups.flatMap((group) => group.options)],
  };
}

export function isActivatable(option: CommandOption): boolean {
  return option.kind !== 'item' || !option.disabled;
}

/** The option Enter opens by default: the first one that can be activated. */
export function firstActivatableId(flat: readonly CommandOption[]): string | null {
  return flat.find(isActivatable)?.id ?? null;
}
