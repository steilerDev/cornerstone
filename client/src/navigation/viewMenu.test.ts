import { describe, it, expect } from '@jest/globals';
import { resolveNavActive, navHref } from './navActive.js';
import { navSections } from './navConfig.js';
import type { NavContext, NavSection } from './navConfig.js';
import { viewMenuFor } from './viewMenu.js';

const ADMIN: NavContext = { role: 'admin', paperlessConfigured: true };
const MEMBER: NavContext = { role: 'member', paperlessConfigured: true };

function menuAt(pathname: string, ctx: NavContext = ADMIN) {
  const sections = navSections(ctx);
  return viewMenuFor(resolveNavActive(pathname, sections), sections);
}

describe('viewMenuFor', () => {
  it('returns null when nothing is active', () => {
    expect(viewMenuFor(null, navSections(ADMIN))).toBeNull();
    expect(menuAt('/definitely/not/a/route')).toBeNull();
  });

  it('returns null on a detail page below a section (not exact)', () => {
    expect(menuAt('/project/work-items/w-1')).toBeNull();
  });

  it('returns null when the active section is not among the visible sections', () => {
    const sections = navSections(ADMIN);
    const active = resolveNavActive(navHref('workItems'), sections);
    const without: readonly NavSection[] = sections.filter((s) => s.id !== 'tasks');
    expect(viewMenuFor(active, without)).toBeNull();
  });

  it('returns null for a section with fewer than two views (Home, Photos)', () => {
    expect(menuAt(navHref('home'))).toBeNull();
    expect(menuAt(navHref('photos'))).toBeNull();
  });

  it('lists Tasks, Schedule, Calendar, Milestones with the main view first', () => {
    const menu = menuAt(navHref('workItems'));
    expect(menu?.entries.map((e) => [e.route, e.labelKey, e.main])).toEqual([
      ['workItems', 'navigation.tasks', true],
      ['scheduleGantt', 'navigation.schedule', false],
      ['scheduleCalendar', 'navigation.calendar', false],
      ['milestones', 'navigation.milestones', false],
    ]);
  });

  it.each([
    ['workItems', 'workItems'],
    ['scheduleGantt', 'scheduleGantt'],
    ['scheduleCalendar', 'scheduleCalendar'],
    ['milestones', 'milestones'],
  ] as const)('marks %s as the current view', (route, expected) => {
    expect(menuAt(navHref(route))?.current).toBe(expected);
  });

  it('D-23: a member in Settings gets Project setup and Account only', () => {
    const menu = menuAt(navHref('settingsManage'), MEMBER);
    expect(menu?.entries.map((e) => e.route)).toEqual(['settingsManage', 'settingsProfile']);
    expect(menu?.entries[0]?.labelKey).toBe('navigation.projectSetup');
    expect(menu?.entries.map((e) => e.route)).not.toContain('settingsUsers');
    expect(menu?.entries.map((e) => e.route)).not.toContain('settingsBackups');
  });

  it('D-23: an admin in Settings also gets Users and Backups', () => {
    const routes = menuAt(navHref('settingsProfile'), ADMIN)?.entries.map((e) => e.route);
    expect(routes).toEqual(expect.arrayContaining(['settingsUsers', 'settingsBackups']));
  });

  it('offers the interim Money views while Financing is not served', () => {
    const menu = menuAt(navHref('budgetOverview'));
    expect(menu?.entries.map((e) => e.route)).toEqual([
      'budgetOverview',
      'invoices',
      'budgetSources',
      'budgetSubsidies',
      'bankReport',
    ]);
    expect(menu?.current).toBe('budgetOverview');
  });
});
