import { foldSearchText } from '@cornerstone/shared';
import type { RouteId, RouteQuery } from '@cornerstone/shared';
import { GLOSSARY, getSearchableNames } from '../i18n/glossary.js';
import type { Glossary, GlossaryTerm, SearchableName } from '../i18n/glossary.js';
import { isRouteVisible, navSections } from './navConfig.js';
import type { NavContext, NavLabelKey } from './navConfig.js';

export interface SearchDestination {
  /** Served route, visible for the signed-in user. */
  readonly route: RouteId;
  /** Query that preselects a filter on the route, e.g. the Submitted invoices. */
  readonly query?: RouteQuery;
  /** Glossary canon of the destination. */
  readonly term: string;
  /** The candidate text that matched, as written in the glossary or label. */
  readonly matched: string;
  /** True when the best match came from a former name. */
  readonly viaFormerName: boolean;
  /** 0 exact, 1 prefix, 2 word-prefix. */
  readonly rank: 0 | 1 | 2;
  /** NavConfig label key when the destination is a NavConfig entry (localised label). */
  readonly labelKey?: NavLabelKey;
}

interface TermExtra {
  readonly term: string;
  readonly route: RouteId;
  readonly query?: RouteQuery;
}

/** Glossary terms that have no NavConfig entry of their own but land on a known route. */
const TERM_EXTRAS: readonly TermExtra[] = [
  { term: 'Submitted', route: 'invoices', query: { status: 'claimed' } },
  { term: 'To pay', route: 'invoices', query: { status: 'pending' } },
  { term: 'Paid', route: 'invoices', query: { status: 'paid' } },
  { term: 'Offer', route: 'invoices', query: { status: 'quotation' } },
  { term: 'Contact person', route: 'companies' },
  { term: 'Cost line', route: 'budgetOverview' },
  { term: 'Done', route: 'workItems', query: { status: 'completed' } },
  { term: 'Ordered', route: 'householdItems', query: { status: 'purchased' } },
  { term: 'Delivery scheduled', route: 'householdItems', query: { status: 'scheduled' } },
  { term: 'Delivered', route: 'householdItems', query: { status: 'arrived' } },
  { term: 'Daily log', route: 'diary', query: { types: 'daily_log' } },
  { term: 'Site visit', route: 'diary', query: { types: 'site_visit' } },
  { term: 'Defect', route: 'diary', query: { types: 'issue' } },
  { term: 'Project setup', route: 'settingsManage' },
  { term: 'House', route: 'settingsManage', query: { tab: 'household' } },
  { term: 'Trade', route: 'settingsManage', query: { tab: 'trades' } },
  { term: 'Cost category', route: 'settingsManage', query: { tab: 'budget-categories' } },
  { term: 'Purchase category', route: 'settingsManage', query: { tab: 'hi-categories' } },
  // Settings › Account sections (#2214); the route has no per-section destination.
  { term: 'Calendar & contacts sync', route: 'settingsProfile' },
  { term: 'Sign-in method', route: 'settingsProfile' },
  { term: 'Single sign-on', route: 'settingsProfile' },
];

const NO_PAGE = 'a detail of another page, not a destination of its own';
const NO_VIEW = 'a status or figure shown on other pages, with no page or filter of its own';

/**
 * Glossary terms that have former names but no served destination to search for, with the reason.
 * Every other term with former names resolves through NavConfig or TERM_EXTRAS.
 */
export const TERMS_WITHOUT_DESTINATION: ReadonlyMap<string, string> = new Map(
  Object.entries({
    Caption: NO_PAGE,
    Checklist: NO_PAGE,
    'Checklist item': NO_PAGE,
    Note: NO_PAGE,
    Who: NO_PAGE,
    'AI certainty': NO_PAGE,
    'Progress payment': 'shown on the invoice page, no list of its own',
    'Own funds': 'a kind of funding source, no page of its own',
    'Draw-down request': 'shown inside Financing, no page or filter of its own',
    Late: 'derived from the schedule, not a stored status with a filter',
    'Holds up': 'derived from dependencies, not a stored status with a filter',
    Upcoming: 'derived from dates, not a stored status with a filter',
    'Used up': NO_VIEW,
    Fixed: NO_VIEW,
    'Left to spend': NO_VIEW,
    'Expected cost': NO_VIEW,
    'Expected grants': NO_VIEW,
    'After grants': NO_VIEW,
    'Still to pay': NO_VIEW,
    'Not yet paid': NO_VIEW,
    'Ready to submit': NO_VIEW,
    'Remaining on offer': NO_VIEW,
    Allocated: NO_VIEW,
    'Over-allocated': NO_VIEW,
    Split: 'an action on an invoice, not a page',
  }),
);

interface Entry {
  readonly route: RouteId;
  readonly query?: RouteQuery;
  readonly term: string;
  readonly labelKey?: NavLabelKey;
}

function candidatesOf(
  entry: Entry,
  glossaryTerm: GlossaryTerm | undefined,
  labelOf: (key: NavLabelKey) => string,
): readonly SearchableName[] {
  const list: SearchableName[] = glossaryTerm
    ? [...getSearchableNames(glossaryTerm)]
    : [{ text: entry.term, former: false }];
  if (entry.labelKey !== undefined) list.push({ text: labelOf(entry.labelKey), former: false });
  return list;
}

function rankOf(needle: string, candidate: string): 0 | 1 | 2 | null {
  const folded = foldSearchText(candidate);
  if (folded === needle) return 0;
  if (folded.startsWith(needle)) return 1;
  if (folded.split(/[\s-]+/).some((word) => word.startsWith(needle))) return 2;
  return null;
}

/**
 * Destinations (pages and filtered views) whose name, plural, short form, former name or current
 * label matches the query. Former names and old words act as aliases, never as labels. Only
 * destinations the user can open today are returned (role and Paperless gating via NavConfig).
 */
export function findSearchDestinations(
  query: string,
  ctx: NavContext,
  labelOf: (key: NavLabelKey) => string,
  glossary: Glossary = GLOSSARY,
): readonly SearchDestination[] {
  const needle = foldSearchText(query.trim());
  if (needle === '') return [];

  const entries: Entry[] = [];
  for (const section of navSections(ctx)) {
    entries.push({ route: section.route, term: section.term, labelKey: section.labelKey });
    for (const view of section.views) {
      entries.push({ route: view.route, term: view.term, labelKey: view.labelKey });
    }
  }
  for (const extra of TERM_EXTRAS) {
    if (isRouteVisible(extra.route, ctx)) entries.push(extra);
  }

  const byCanon = new Map(glossary.terms.map((term) => [term.canon, term]));
  const results: SearchDestination[] = [];
  for (const entry of entries) {
    let best: { rank: 0 | 1 | 2; candidate: SearchableName } | null = null;
    for (const candidate of candidatesOf(entry, byCanon.get(entry.term), labelOf)) {
      const rank = rankOf(needle, candidate.text);
      if (rank !== null && (best === null || rank < best.rank)) best = { rank, candidate };
    }
    if (best) {
      results.push({
        route: entry.route,
        ...(entry.query ? { query: entry.query } : {}),
        ...(entry.labelKey ? { labelKey: entry.labelKey } : {}),
        term: entry.term,
        matched: best.candidate.text,
        viaFormerName: best.candidate.former,
        rank: best.rank,
      });
    }
  }
  return results.sort((a, b) => a.rank - b.rank);
}
