/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type React from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/react';
import { renderWithRouter } from '../../test/testUtils.js';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { resolveNavActive } from '../../navigation/navActive.js';
import { navSections } from '../../navigation/navConfig.js';
import type * as SidebarTypes from './Sidebar.js';

// Mock the AuthContext BEFORE importing Sidebar
const mockLogout = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
let mockRole: 'admin' | 'member' = 'admin';

jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({
    user: {
      id: '1',
      email: 'test@example.com',
      displayName: 'Test',
      role: mockRole,
      authProvider: 'local',
      createdAt: '',
      updatedAt: '',
      deactivatedAt: null,
    },
    oidcEnabled: false,
    isLoading: false,
    error: null,
    refreshAuth: jest.fn(),
    logout: mockLogout,
  }),
}));

// The logo reads the theme
jest.unstable_mockModule('../../contexts/ThemeContext.js', () => ({
  useTheme: () => ({ theme: 'system', resolvedTheme: 'light', setTheme: jest.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// The sidebar must not ask Paperless anything today (no served route is Paperless-gated).
const mockGetPaperlessStatus = jest.fn<() => Promise<{ configured: boolean }>>();
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
}));

describe('Sidebar', () => {
  let SidebarModule: typeof SidebarTypes;

  beforeEach(async () => {
    if (!SidebarModule) {
      SidebarModule = await import('./Sidebar.js');
    }
    mockLogout.mockReset().mockResolvedValue(undefined);
    mockGetPaperlessStatus.mockReset();
    mockRole = 'admin';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // The shell computes the sections and the active entry and hands them down; mirror that here.
  function Host() {
    const { pathname } = useLocation();
    const sections = useMemo(() => navSections({ role: mockRole, paperlessConfigured: false }), []);
    const active = useMemo(() => resolveNavActive(pathname, sections), [pathname, sections]);
    return <SidebarModule.Sidebar sections={sections} active={active} />;
  }

  const renderAt = (path: string) =>
    renderWithRouter(<Host />, {
      initialEntries: [path],
    });

  const mainNav = () => screen.getByRole('navigation', { name: /main navigation/i });
  const settingsNav = () => screen.getByRole('navigation', { name: /^settings$/i });
  const sectionLinks = (nav: HTMLElement) =>
    within(nav)
      .queryAllByRole('link')
      .filter((l) => l.getAttribute('data-testid')?.startsWith('sidebar-section-'));
  const section = (id: string) => screen.getByTestId(`sidebar-section-${id}`);
  const view = (route: string) => screen.getByTestId(`sidebar-view-${route}`);
  const hasView = (route: string) => screen.queryByTestId(`sidebar-view-${route}`) !== null;

  describe('structure', () => {
    it('lists Home, Tasks, Purchases, Site diary, Photos, Money and Companies in order', () => {
      renderAt('/budget/overview');

      expect(sectionLinks(mainNav()).map((l) => l.textContent)).toEqual([
        'Home',
        'Tasks',
        'Purchases',
        'Site diary',
        'Photos',
        'Money',
        'Companies',
      ]);
    });

    it('has no Schedule entry of its own outside Tasks', () => {
      renderAt('/budget/overview');

      expect(screen.queryByRole('link', { name: /^schedule$/i })).not.toBeInTheDocument();
    });

    it('renders no separator and no quiet group while Areas, History and Documents are planned', () => {
      const { container } = renderAt('/project/work-items');

      expect(container.querySelector('[aria-hidden="true"][class*="navSeparator"]')).toBeNull();
      expect(container.querySelector('[class*="navLinkQuiet"]')).toBeNull();
      for (const id of ['areas', 'history', 'documents']) {
        expect(screen.queryByTestId(`sidebar-section-${id}`)).not.toBeInTheDocument();
      }
    });

    it('uses real lists for each group', () => {
      renderAt('/project/work-items');

      expect(within(mainNav()).getAllByRole('list').length).toBeGreaterThanOrEqual(2);
      expect(within(settingsNav()).getAllByRole('list')).toHaveLength(1);
    });

    it('has two landmarks, Main navigation and Settings, and no control outside them but the logo', () => {
      renderAt('/project/work-items');

      const main = mainNav();
      const settings = settingsNav();
      expect(main.contains(settings)).toBe(false);
      expect(within(settings).getByRole('link', { name: /^settings$/i })).toBeInTheDocument();
      const outside = within(screen.getByRole('complementary'))
        .getAllByRole('link')
        .filter((l) => !main.contains(l) && !settings.contains(l));
      expect(outside.map((l) => l.getAttribute('aria-label'))).toEqual(['Go to Home']);
    });

    it('opens Home with a labelled logo link to the root path', () => {
      renderAt('/project/work-items');

      const logo = screen.getByRole('link', { name: 'Go to Home' });
      expect(logo).toHaveAttribute('href', '/');
    });

    it('links Tasks to the work item list and Settings to Project setup', () => {
      renderAt('/photos');

      expect(section('tasks')).toHaveAttribute('href', '/project/work-items');
      expect(section('settings')).toHaveAttribute('href', '/settings/manage');
    });

    it('does not ask Paperless for its status', () => {
      renderAt('/project/work-items');

      expect(mockGetPaperlessStatus).not.toHaveBeenCalled();
    });

    it('has no drawer state: no data-open attribute and no open class (desktop only)', () => {
      renderAt('/project/work-items');

      const sidebar = screen.getByRole('complementary');
      expect(sidebar).not.toHaveAttribute('data-open');
      expect(sidebar.className).not.toMatch(/open/);
    });
  });

  describe('views nested under the section you are in', () => {
    it('shows Schedule, Calendar and Milestones under Tasks, with Calendar current at /schedule/calendar', () => {
      renderAt('/schedule/calendar');

      expect(section('tasks')).toHaveClass('sectionCurrent');
      expect(section('tasks')).not.toHaveAttribute('aria-current');
      expect(section('tasks')).not.toHaveClass('active');
      expect(view('scheduleCalendar')).toHaveAttribute('aria-current', 'page');
      expect(view('scheduleCalendar')).toHaveClass('active');
      expect(view('scheduleGantt')).toHaveTextContent('Schedule');
      expect(view('scheduleGantt')).not.toHaveAttribute('aria-current');
      expect(view('milestones')).toHaveTextContent('Milestones');
      expect(view('scheduleCalendar')).toHaveTextContent('Calendar');
    });

    it('marks the Tasks entry itself on the task list, with the views listed and none current', () => {
      renderAt('/project/work-items');

      expect(section('tasks')).toHaveAttribute('aria-current', 'page');
      expect(section('tasks')).toHaveClass('active');
      expect(hasView('scheduleGantt')).toBe(true);
      expect(hasView('milestones')).toBe(true);
    });

    it('keeps Milestones current on a milestone detail page', () => {
      renderAt('/project/milestones/m1');

      expect(view('milestones')).toHaveAttribute('aria-current', 'page');
    });

    it('shows Invoices, Funding sources, Grants and Bank report under Money, without Financing', () => {
      renderAt('/budget/invoices/i1');

      expect(
        ['invoices', 'budgetSources', 'budgetSubsidies', 'bankReport'].map(
          (r) => view(r).textContent,
        ),
      ).toEqual(['Invoices', 'Funding sources', 'Grants', 'Bank report']);
      expect(view('invoices')).toHaveAttribute('aria-current', 'page');
      expect(hasView('financing')).toBe(false);
      expect(section('money')).toHaveClass('sectionCurrent');
    });

    it.each([
      ['/budget/sources', 'budgetSources'],
      ['/budget/subsidies', 'budgetSubsidies'],
      ['/budget/reports', 'bankReport'],
    ])('highlights the interim Money view for %s', (path, route) => {
      renderAt(path);

      expect(view(route)).toHaveAttribute('aria-current', 'page');
    });

    it('renders the nested lists only for the section you are in', () => {
      renderAt('/photos');

      expect(hasView('scheduleGantt')).toBe(false);
      expect(hasView('invoices')).toBe(false);
      expect(hasView('settingsProfile')).toBe(false);
      expect(section('photos')).toHaveClass('active');
    });

    it('renders no nested list at all for Purchases, which has no views', () => {
      const { container } = renderAt('/project/household-items');

      expect(section('purchases')).toHaveClass('active');
      expect(container.querySelectorAll('[data-testid^="sidebar-view-"]')).toHaveLength(0);
    });
  });

  describe('exactly one highlighted entry', () => {
    it.each([
      ['/project/work-items'],
      ['/project/work-items/w1'],
      ['/project/work-items/new'],
      ['/schedule/gantt'],
      ['/schedule/calendar'],
      ['/project/milestones/m1'],
      ['/budget/overview'],
      ['/budget/invoices/i1'],
      ['/budget/invoices/i1/auto-itemize/d1'],
      ['/budget/sources'],
      ['/budget/reports'],
      ['/project/household-items/h1/edit'],
      ['/diary/e1/edit'],
      ['/photos/spot/a/b'],
      ['/project/overview'],
      ['/settings/vendors/v1'],
      ['/settings/manage'],
      ['/settings/profile'],
    ])('highlights one entry at %s', (path) => {
      const { container } = renderAt(path);

      expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
      expect(container.querySelectorAll('.active')).toHaveLength(1);
    });

    it.each(['/does-not-exist', '/login'])(
      'highlights nothing and opens no nested list at %s',
      (path) => {
        const { container } = renderAt(path);

        expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
        expect(container.querySelectorAll('.active, .sectionCurrent')).toHaveLength(0);
        expect(container.querySelectorAll('[data-testid^="sidebar-view-"]')).toHaveLength(0);
      },
    );
  });

  describe('Settings', () => {
    it('D-23: a member is offered Settings and Account only, never Users or Backups', () => {
      mockRole = 'member';
      renderAt('/settings/profile');

      const links = within(settingsNav()).getAllByRole('link');
      expect(links.map((l) => l.textContent)).toEqual(['Settings', 'Account']);
      expect(screen.queryByRole('link', { name: /^users$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /^backups$/i })).not.toBeInTheDocument();
      expect(section('settings')).toHaveAttribute('href', '/settings/manage');
    });

    it('D-23: an admin is offered Account, Users and Backups under Settings', () => {
      renderAt('/settings/profile');

      const links = within(settingsNav()).getAllByRole('link');
      expect(links.map((l) => l.textContent)).toEqual(['Settings', 'Account', 'Users', 'Backups']);
      expect(view('settingsProfile')).toHaveAttribute('aria-current', 'page');
    });

    it('highlights Settings itself on Project setup', () => {
      renderAt('/settings/manage');

      expect(section('settings')).toHaveAttribute('aria-current', 'page');
      expect(section('settings')).toHaveClass('active');
    });

    it('keeps the Settings section current on a view a member cannot see', () => {
      mockRole = 'member';
      renderAt('/settings/users');

      expect(section('settings')).toHaveClass('active');
      expect(hasView('settingsUsers')).toBe(false);
    });

    it('does not highlight Settings on a company page that lives under /settings/vendors', () => {
      renderAt('/settings/vendors/v1');

      expect(section('companies')).toHaveClass('active');
      expect(section('settings')).not.toHaveAttribute('aria-current');
    });
  });

  describe('navigating', () => {
    it('navigates when a view is clicked and moves the highlight', async () => {
      const user = userEvent.setup();
      renderAt('/project/work-items');

      await user.click(view('scheduleCalendar'));

      expect(view('scheduleCalendar')).toHaveAttribute('aria-current', 'page');
      expect(section('tasks')).not.toHaveAttribute('aria-current');
    });
  });

  describe('history action of a sidebar click', () => {
    // Mutation: hardcoding replace={false} on the sidebar links fails both REPLACE cases.
    async function clickFrom(path: string, testId: string) {
      const user = userEvent.setup();
      const log = createRouterLog();
      render(
        <RecordingRouter entries={[path]} log={log}>
          <Host />
        </RecordingRouter>,
      );
      await user.click(screen.getByTestId(testId));
      return log.actions;
    }

    it('replaces when switching to Calendar from the Schedule view', async () => {
      expect(await clickFrom('/schedule/gantt', 'sidebar-view-scheduleCalendar')).toEqual([
        'REPLACE /schedule/calendar',
      ]);
    });

    it('replaces when clicking Tasks while on a Tasks view', async () => {
      expect(await clickFrom('/schedule/calendar', 'sidebar-section-tasks')).toEqual([
        'REPLACE /project/work-items',
      ]);
    });

    it('pushes when entering another section (Money from Schedule)', async () => {
      expect(await clickFrom('/schedule/gantt', 'sidebar-section-money')).toEqual([
        'PUSH /budget/overview',
      ]);
    });

    it('pushes when leaving a detail page (Tasks from a task page)', async () => {
      expect(await clickFrom('/project/work-items/w1', 'sidebar-section-tasks')).toEqual([
        'PUSH /project/work-items',
      ]);
    });
  });

  describe('no account controls (they live in the user menu and the More sheet, #2207)', () => {
    it('renders no button at all', () => {
      renderAt('/photos');

      expect(within(screen.getByRole('complementary')).queryAllByRole('button')).toHaveLength(0);
    });

    it('has no Log out, theme toggle, GitHub link or version text', () => {
      renderAt('/photos');

      expect(screen.queryByText(/log ?out/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /switch to .+ mode/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'GitHub' })).not.toBeInTheDocument();
      expect(screen.queryByText(/Cornerstone v/)).not.toBeInTheDocument();
    });

    it('has no legacy footer container', () => {
      const { container } = renderAt('/photos');

      expect(screen.queryByTestId('sidebar-footer-legacy')).not.toBeInTheDocument();
      expect(container.querySelector('[class*="footerLegacy"]')).toBeNull();
    });

    it('keeps exactly one link in the Settings landmark', () => {
      renderAt('/photos');

      expect(within(settingsNav()).getAllByRole('link')).toHaveLength(1);
      expect(within(settingsNav()).queryByRole('button')).not.toBeInTheDocument();
    });
  });
});
