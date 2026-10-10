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

// Mock ThemeContext so Sidebar tests don't need a ThemeProvider
const mockSetTheme = jest.fn<(theme: string) => void>();

jest.unstable_mockModule('../../contexts/ThemeContext.js', () => ({
  useTheme: () => ({
    theme: 'system',
    resolvedTheme: 'light',
    setTheme: mockSetTheme,
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// The sidebar must not ask Paperless anything today (no served route is Paperless-gated).
const mockGetPaperlessStatus = jest.fn<() => Promise<{ configured: boolean }>>();
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
}));

describe('Sidebar', () => {
  let SidebarModule: typeof SidebarTypes;
  let mockOnClose: jest.MockedFunction<() => void>;

  beforeEach(async () => {
    if (!SidebarModule) {
      SidebarModule = await import('./Sidebar.js');
    }
    mockOnClose = jest.fn<() => void>();
    mockLogout.mockReset().mockResolvedValue(undefined);
    mockGetPaperlessStatus.mockReset();
    mockRole = 'admin';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const getDefaultProps = () => ({
    isOpen: false,
    onClose: mockOnClose,
  });

  const renderAt = (path: string) =>
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />, {
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

    it('has two landmarks, Main navigation and Settings, with theme toggle and logout outside both', () => {
      renderAt('/project/work-items');

      const main = mainNav();
      const settings = settingsNav();
      const logout = screen.getByRole('button', { name: /logout/i });
      const theme = screen.getByRole('button', { name: /switch to .+ mode/i });
      for (const outside of [logout, theme]) {
        expect(main.contains(outside)).toBe(false);
        expect(settings.contains(outside)).toBe(false);
      }
      expect(main.contains(settings)).toBe(false);
      expect(within(settings).getByRole('link', { name: /^settings$/i })).toBeInTheDocument();
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

    it('sidebar has .open class when isOpen is true', () => {
      renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} isOpen={true} />);

      expect(screen.getByRole('complementary').className).toMatch(/open/);
    });

    it('sidebar does not have .open class when isOpen is false', () => {
      renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} isOpen={false} />);

      expect(screen.getByRole('complementary').className).not.toMatch(/open/);
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

  describe('closing the drawer', () => {
    it('clicking a section link calls onClose', async () => {
      const user = userEvent.setup();
      renderAt('/project/work-items');

      await user.click(section('photos'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('clicking a nested view link calls onClose', async () => {
      const user = userEvent.setup();
      renderAt('/project/work-items');

      await user.click(view('scheduleCalendar'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('clicking the Settings link calls onClose', async () => {
      const user = userEvent.setup();
      renderAt('/project/work-items');

      await user.click(section('settings'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('clicking the logo calls onClose', async () => {
      const user = userEvent.setup();
      renderAt('/photos');

      await user.click(screen.getByRole('link', { name: 'Go to Home' }));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

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
          <SidebarModule.Sidebar {...getDefaultProps()} />
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

  describe('footer', () => {
    it('renders a logout button', () => {
      renderAt('/photos');

      expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    });

    it('clicking logout calls logout, then onClose', async () => {
      const user = userEvent.setup();
      let resolveLogout: () => void = () => undefined;
      mockLogout.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveLogout = resolve;
        }),
      );
      renderAt('/photos');

      await user.click(screen.getByRole('button', { name: /logout/i }));

      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockOnClose).not.toHaveBeenCalled();

      resolveLogout();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('lists the theme toggle and logout as the only buttons, and no Settings button', () => {
      renderAt('/photos');

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
      expect(buttons[0]!).toHaveAttribute(
        'aria-label',
        expect.stringMatching(/switch to .+ mode/i),
      );
      expect(buttons[1]!).toHaveTextContent(/logout/i);
    });

    it('shows the app version and the GitHub link', () => {
      renderAt('/photos');

      expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
        'href',
        'https://github.com/steilerDev/cornerstone',
      );
    });
  });
});
