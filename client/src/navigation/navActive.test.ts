import { describe, it, expect } from '@jest/globals';
import { ROUTE_MAP, isRouteServed, routeUrl } from '@cornerstone/shared';
import type { RouteId, RouteMapEntry } from '@cornerstone/shared';
import { NAV_SECTIONS, navSections, type NavContext, type NavSection } from './navConfig.js';
import { navHref, resolveNavActive } from './navActive.js';

const ADMIN: NavContext = { role: 'admin', paperlessConfigured: true };
const MEMBER: NavContext = { role: 'member', paperlessConfigured: true };
const adminSections = navSections(ADMIN);
const ROUTES: readonly RouteMapEntry[] = ROUTE_MAP;

const result = (path: string, sections: readonly NavSection[] = adminSections) => {
  const active = resolveNavActive(path, sections);
  return active ? `${active.sectionId}/${active.viewRoute}` : null;
};

describe('resolveNavActive over the route map', () => {
  // Pages the shell renders: real pages and interim redirects that still serve their own page.
  const pages = ROUTES.filter(
    (e) =>
      e.id !== undefined &&
      isRouteServed(e.id as RouteId) &&
      e.section !== 'System' &&
      e.section !== 'Auth' &&
      (e.kind === 'page' || (e.kind === 'redirect' && e.interim === 'page')),
  );

  it('walks a non-trivial number of pages', () => {
    expect(pages.length).toBeGreaterThan(20);
  });

  it('highlights an entry the admin can see for every served page route (AC6)', () => {
    const failures: string[] = [];
    for (const entry of pages) {
      const path = entry.from.replace(/:[A-Za-z]+/g, 'p1');
      const active = resolveNavActive(path, adminSections);
      if (!active) {
        failures.push(`${entry.id} (${path}): nothing highlighted`);
        continue;
      }
      const section = adminSections.find((s) => s.id === active.sectionId);
      if (!section) failures.push(`${entry.id}: section ${active.sectionId} is not visible`);
      else if (active.viewRoute && !section.views.some((v) => v.route === active.viewRoute)) {
        failures.push(`${entry.id}: view ${active.viewRoute} is not in ${section.id}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('resolves the interim Home alias through the section owner fallback', () => {
    // /project/overview is not a section route of the sidebar (Home's route is "home");
    // only the `owns` fallback can place it.
    expect(result('/project/overview')).toBe('home/null');
  });
});

describe('resolveNavActive exact results', () => {
  it.each([
    ['/project/work-items', 'tasks/null'],
    ['/project/work-items/w1', 'tasks/null'],
    ['/project/work-items/new', 'tasks/null'],
    ['/schedule/gantt', 'tasks/scheduleGantt'],
    ['/schedule/calendar', 'tasks/scheduleCalendar'],
    ['/project/milestones', 'tasks/milestones'],
    ['/project/milestones/m1', 'tasks/milestones'],
    ['/budget/overview', 'money/null'],
    ['/budget/invoices', 'money/invoices'],
    ['/budget/invoices/i1', 'money/invoices'],
    ['/budget/invoices/i1/auto-itemize/d1', 'money/invoices'],
    ['/budget/sources', 'money/budgetSources'],
    ['/budget/subsidies', 'money/budgetSubsidies'],
    ['/budget/reports', 'money/bankReport'],
    ['/project/household-items', 'purchases/null'],
    ['/project/household-items/h1/edit', 'purchases/null'],
    ['/diary/e1/edit', 'diary/null'],
    ['/photos/spot/a/b', 'photos/null'],
    ['/project/overview', 'home/null'],
    ['/settings/vendors/v1', 'companies/null'],
    ['/settings/manage', 'settings/null'],
    ['/settings/profile', 'settings/settingsProfile'],
    ['/settings/users', 'settings/settingsUsers'],
    ['/settings/backups', 'settings/settingsBackups'],
  ])('%s highlights %s', (path, expected) => {
    expect(result(path)).toBe(expected);
  });

  it('highlights the section (not a hidden view) for a member on an admin-only view', () => {
    const memberSections = navSections(MEMBER);
    expect(result('/settings/users', memberSections)).toBe('settings/null');
    expect(result('/settings/backups', memberSections)).toBe('settings/null');
    expect(result('/settings/profile', memberSections)).toBe('settings/settingsProfile');
  });

  it.each(['/does-not-exist', '/login', '/setup'])('highlights nothing for %s', (path) => {
    expect(resolveNavActive(path, adminSections)).toBeNull();
  });

  it('highlights nothing when the owning section is not among the given sections', () => {
    const withoutMoney = adminSections.filter((s) => s.id !== 'money');
    expect(resolveNavActive('/budget/overview', withoutMoney)).toBeNull();
    expect(resolveNavActive('/budget/invoices/i1', withoutMoney)).toBeNull();
  });
});

describe('resolveNavActive interim lifecycle', () => {
  it('falls back to the Money section once the interim views are gone (Financing served)', () => {
    const money = adminSections.find((s) => s.id === 'money') as NavSection;
    const withoutInterim = adminSections.map((s) =>
      s.id === 'money' ? { ...money, views: money.views.filter((v) => !v.interimUntil) } : s,
    );
    // bankReport -> financing (not a given view or section) -> budgetOverview (Money's route)
    expect(result('/budget/reports', withoutInterim)).toBe('money/null');
    expect(result('/budget/sources', withoutInterim)).toBe('money/null');
    expect(result('/budget/invoices/i1', withoutInterim)).toBe('money/invoices');
  });
});

describe('resolveNavActive exact', () => {
  it.each(['/schedule/calendar', '/project/work-items', '/budget/sources', '/settings/profile'])(
    'is true when %s is the entry itself',
    (path) => {
      expect(resolveNavActive(path, adminSections)?.exact).toBe(true);
    },
  );

  it.each([
    ['/project/work-items/w1', 'parent hop'],
    ['/budget/invoices/i1', 'parent hop to a view'],
    ['/project/overview', 'owns-fallback'],
    ['/settings/vendors/v1', 'owns-fallback'],
  ])('is false for %s (%s)', (path) => {
    expect(resolveNavActive(path, adminSections)?.exact).toBe(false);
  });
});

describe('navHref', () => {
  it('equals routeUrl for every section and view route in the admin sidebar', () => {
    const routes = adminSections.flatMap((s) => [s.route, ...s.views.map((v) => v.route)]);
    expect(routes.length).toBeGreaterThan(10);
    for (const route of routes) expect(navHref(route)).toBe(routeUrl(route as never));
  });

  it('returns the path of a served, param-free route', () => {
    expect(navHref('workItems')).toBe('/project/work-items');
    expect(navHref('scheduleCalendar')).toBe('/schedule/calendar');
    expect(navHref('settingsManage')).toBe('/settings/manage');
  });

  it('opens Home at the root path', () => {
    expect(navHref('home')).toBe('/');
  });

  it('throws for a planned route', () => {
    expect(() => navHref('financing')).toThrow(/not served/);
  });

  it('throws for a parameterised route', () => {
    expect(() => navHref('workItem')).toThrow(/no static href/);
  });

  it('throws for the catch-all', () => {
    const catchAll = ROUTES.find((e) => e.from === '*');
    expect(catchAll).toBeDefined();
    expect(() => navHref(catchAll?.id as RouteId)).toThrow(/no static href/);
  });
});

describe('NAV_SECTIONS sanity for the walk', () => {
  it('lists the sections the active resolution can return', () => {
    expect(NAV_SECTIONS.map((s) => s.id)).toEqual(
      expect.arrayContaining(['home', 'tasks', 'money', 'settings', 'companies']),
    );
  });
});
