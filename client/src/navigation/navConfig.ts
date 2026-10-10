import { getRouteEntry, isRouteServed } from '@cornerstone/shared';
import type { RouteId, RouteSection } from '@cornerstone/shared';

export type NavSectionId =
  | 'home'
  | 'tasks'
  | 'purchases'
  | 'diary'
  | 'photos'
  | 'money'
  | 'companies'
  | 'areas'
  | 'history'
  | 'documents'
  | 'settings';
export type NavGroup = 'primary' | 'secondary' | 'footer';
/** Full i18n keys (`common` namespace) of every nav label. */
export const NAV_LABEL_KEYS = [
  'navigation.home',
  'navigation.tasks',
  'navigation.purchases',
  'navigation.siteDiary',
  'navigation.photos',
  'navigation.money',
  'navigation.companies',
  'navigation.areas',
  'navigation.history',
  'navigation.documents',
  'navigation.settings',
  'navigation.schedule',
  'navigation.calendar',
  'navigation.milestones',
  'navigation.invoices',
  'navigation.financing',
  'navigation.fundingSources',
  'navigation.grants',
  'navigation.bankReport',
  'navigation.projectSetup',
  'navigation.account',
  'navigation.users',
  'navigation.backups',
  'navigation.integrations',
] as const;
export type NavLabelKey = (typeof NAV_LABEL_KEYS)[number];

export interface NavView {
  readonly route: RouteId;
  readonly labelKey: NavLabelKey;
  /** Glossary canon term (search aliases via getSearchAliases). */
  readonly term: string;
  /** Interim view: shown only while this route is NOT served (staging, like the route map's `interim`). */
  readonly interimUntil?: RouteId;
}

export interface NavSection {
  readonly id: NavSectionId;
  readonly group: NavGroup;
  /** The section entry opens this route (its main view). */
  readonly route: RouteId;
  readonly labelKey: NavLabelKey;
  /** h1 of the main view (Settings → Project setup). */
  readonly mainViewLabelKey: NavLabelKey;
  readonly term: string;
  readonly views: readonly NavView[];
  /** Route-map sections the entry highlights for. */
  readonly owns: readonly RouteSection[];
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'home',
    group: 'primary',
    route: 'home',
    labelKey: 'navigation.home',
    mainViewLabelKey: 'navigation.home',
    term: 'Home',
    views: [],
    owns: ['Home'],
  },
  {
    id: 'tasks',
    group: 'primary',
    route: 'workItems',
    labelKey: 'navigation.tasks',
    mainViewLabelKey: 'navigation.tasks',
    term: 'Task',
    views: [
      { route: 'scheduleGantt', labelKey: 'navigation.schedule', term: 'Schedule' },
      { route: 'scheduleCalendar', labelKey: 'navigation.calendar', term: 'Calendar' },
      { route: 'milestones', labelKey: 'navigation.milestones', term: 'Milestone' },
    ],
    owns: ['Tasks'],
  },
  {
    id: 'purchases',
    group: 'primary',
    route: 'householdItems',
    labelKey: 'navigation.purchases',
    mainViewLabelKey: 'navigation.purchases',
    term: 'Purchase',
    views: [],
    owns: ['Purchases'],
  },
  {
    id: 'diary',
    group: 'primary',
    route: 'diary',
    labelKey: 'navigation.siteDiary',
    mainViewLabelKey: 'navigation.siteDiary',
    term: 'Site diary',
    views: [],
    owns: ['Site diary'],
  },
  {
    id: 'photos',
    group: 'primary',
    route: 'photos',
    labelKey: 'navigation.photos',
    mainViewLabelKey: 'navigation.photos',
    term: 'Photo',
    views: [],
    owns: ['Photos'],
  },
  {
    id: 'money',
    group: 'primary',
    route: 'budgetOverview',
    labelKey: 'navigation.money',
    mainViewLabelKey: 'navigation.money',
    term: 'Money',
    views: [
      { route: 'invoices', labelKey: 'navigation.invoices', term: 'Invoice' },
      {
        route: 'budgetSources',
        labelKey: 'navigation.fundingSources',
        term: 'Funding source',
        interimUntil: 'financing',
      },
      {
        route: 'budgetSubsidies',
        labelKey: 'navigation.grants',
        term: 'Grant',
        interimUntil: 'financing',
      },
      {
        route: 'bankReport',
        labelKey: 'navigation.bankReport',
        term: 'Bank report',
        interimUntil: 'financing',
      },
      { route: 'financing', labelKey: 'navigation.financing', term: 'Financing' },
    ],
    owns: ['Money'],
  },
  {
    id: 'companies',
    group: 'primary',
    route: 'companies',
    labelKey: 'navigation.companies',
    mainViewLabelKey: 'navigation.companies',
    term: 'Company',
    views: [],
    owns: ['Companies'],
  },
  {
    id: 'areas',
    group: 'secondary',
    route: 'areas',
    labelKey: 'navigation.areas',
    mainViewLabelKey: 'navigation.areas',
    term: 'Area',
    views: [],
    owns: ['Areas'],
  },
  {
    id: 'history',
    group: 'secondary',
    route: 'history',
    labelKey: 'navigation.history',
    mainViewLabelKey: 'navigation.history',
    term: 'History',
    views: [],
    owns: ['History'],
  },
  {
    id: 'documents',
    group: 'secondary',
    route: 'documents',
    labelKey: 'navigation.documents',
    mainViewLabelKey: 'navigation.documents',
    term: 'Documents',
    views: [],
    owns: ['Documents'],
  },
  {
    id: 'settings',
    group: 'footer',
    route: 'settingsManage',
    labelKey: 'navigation.settings',
    mainViewLabelKey: 'navigation.projectSetup',
    term: 'Settings',
    views: [
      { route: 'settingsProfile', labelKey: 'navigation.account', term: 'Account' },
      { route: 'settingsUsers', labelKey: 'navigation.users', term: 'Users' },
      { route: 'settingsBackups', labelKey: 'navigation.backups', term: 'Backups' },
      { route: 'settingsIntegrations', labelKey: 'navigation.integrations', term: 'Integrations' },
    ],
    owns: ['Settings'],
  },
];

/** Phone bottom bar, left to right. */
export const PHONE_BAR: readonly ('home' | 'diary' | 'capture' | 'photos' | 'more')[] = [
  'home',
  'diary',
  'capture',
  'photos',
  'more',
];

/** The ＋ slot opens today's /diary/new until P2.3. */
export const PHONE_CAPTURE_ROUTE: RouteId = 'diaryEntryNew';

/** Sections that own a slot of their own in the phone bottom bar. */
export const PHONE_BAR_SECTIONS: readonly NavSectionId[] = PHONE_BAR.filter(
  (s): s is 'home' | 'diary' | 'photos' => s !== 'capture' && s !== 'more',
);

/** "More" sheet groups, top to bottom. */
export const MORE_SHEET: readonly (readonly NavSectionId[])[] = [
  ['tasks', 'purchases', 'money', 'companies'],
  ['areas', 'history', 'documents'],
  ['settings'],
];

export interface NavContext {
  readonly role: 'admin' | 'member';
  readonly paperlessConfigured: boolean;
}

function isVisible(route: RouteId, ctx: NavContext): boolean {
  if (!isRouteServed(route)) return false;
  const { guard, gate } = getRouteEntry(route);
  if (guard === 'admin' && ctx.role !== 'admin') return false;
  if ((gate === 'paperless' || gate === 'paperless+ai') && !ctx.paperlessConfigured) return false;
  return true;
}

/** Sections (and views) the signed-in user can open today. Order follows NAV_SECTIONS. */
export function navSections(ctx: NavContext): readonly NavSection[] {
  return NAV_SECTIONS.filter((section) => isVisible(section.route, ctx)).map((section) => ({
    ...section,
    views: section.views.filter(
      (view) =>
        isVisible(view.route, ctx) &&
        (view.interimUntil === undefined || !isRouteServed(view.interimUntil)),
    ),
  }));
}

/** True when a served NavConfig route is Paperless-gated, i.e. the shell must ask the Paperless status. */
export function paperlessStatusNeeded(sections: readonly NavSection[] = NAV_SECTIONS): boolean {
  const gated = (route: RouteId): boolean => {
    if (!isRouteServed(route)) return false;
    const { gate } = getRouteEntry(route);
    return gate === 'paperless' || gate === 'paperless+ai';
  };
  return sections.some((s) => gated(s.route) || s.views.some((v) => gated(v.route)));
}
