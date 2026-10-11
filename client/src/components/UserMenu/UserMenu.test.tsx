/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { routeUrl } from '@cornerstone/shared';
import { useNavigate } from 'react-router-dom';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import { OriginProbe } from '../../test/originProbe.js';
import { ShortcutRegistryProvider } from '../../hooks/shortcutRegistry.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts.js';
import { GITHUB_URL, HELP_URL } from '../../lib/externalLinks.js';
import type * as UserMenuTypes from './UserMenu.js';

type Role = 'admin' | 'member';
interface MockUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

let mockUser: MockUser | null;
let mockTheme: 'light' | 'dark' | 'system';
let mockLocale: 'en' | 'de';
// Mutated in place by the language tests: the menu must read its options from this list
const mockLocales: string[] = ['en', 'de'];
const mockLogout = jest.fn<() => Promise<void>>();
const mockSetTheme = jest.fn<(theme: string) => void>();
const mockSetLocale = jest.fn<(locale: string) => void>();

jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({
    user: mockUser,
    oidcEnabled: false,
    isLoading: false,
    error: null,
    refreshAuth: jest.fn(),
    logout: mockLogout,
  }),
}));

jest.unstable_mockModule('../../contexts/ThemeContext.js', () => ({
  useTheme: () => ({ theme: mockTheme, resolvedTheme: 'light', setTheme: mockSetTheme }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: () => ({
    locale: mockLocale,
    resolvedLocale: mockLocale,
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: mockSetLocale,
    syncWithServer: jest.fn(),
  }),
  RESOLVED_LOCALES: mockLocales,
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const PAGE_SHORTCUTS: KeyboardShortcut[] = [
  { key: 'n', handler: () => {}, description: 'New synthetic task' },
];

function PageWithShortcuts() {
  useKeyboardShortcuts(PAGE_SHORTCUTS);
  return <p>page</p>;
}

function GoTo({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate(to)}>
      go elsewhere
    </button>
  );
}

describe('UserMenu', () => {
  let UserMenuModule: typeof UserMenuTypes;

  beforeEach(async () => {
    if (!UserMenuModule) {
      UserMenuModule = await import('./UserMenu.js');
    }
    mockUser = {
      id: 'u1',
      email: 'sam@example.test',
      displayName: 'Sam Jo Example',
      role: 'member',
    };
    mockTheme = 'system';
    mockLocale = 'en';
    mockLocales.splice(0, mockLocales.length, 'en', 'de');
    mockLogout.mockReset().mockResolvedValue(undefined);
    mockSetTheme.mockReset();
    mockSetLocale.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function renderMenu(options: { withPage?: boolean; path?: string } = {}) {
    const log = createRouterLog();
    const utils = render(
      <RecordingRouter entries={[options.path ?? '/project/overview']} log={log}>
        <ShortcutRegistryProvider>
          {options.withPage && <PageWithShortcuts />}
          <UserMenuModule.UserMenu />
          <GoTo to="/schedule/gantt" />
          <OriginProbe />
        </ShortcutRegistryProvider>
      </RecordingRouter>,
    );
    return { log, ...utils };
  }

  const trigger = () => screen.getByTestId('user-menu-trigger');
  const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(trigger());
    return screen.getByRole('menu');
  };
  const itemNames = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[role^="menuitem"]')).map((el) =>
      (el.textContent ?? '').replace(/^✓\s*/, '').replace(/↗.*$/, ''),
    );

  describe('trigger', () => {
    it.each([
      ['Sam Jo Example', 'sam@example.test', 'SE'],
      ['Sam', 'sam@example.test', 'S'],
      ['', 'quinn@example.test', 'Q'],
    ])('shows the initials of "%s" / %s as %s', (displayName, email, initials) => {
      mockUser = { id: 'u1', email, displayName, role: 'member' };
      renderMenu();
      expect(trigger()).toHaveTextContent(new RegExp(`^${initials}$`));
      expect(within(trigger()).getByText(initials)).toHaveAttribute('aria-hidden', 'true');
    });

    it('is named "Account menu for ‹name›" and uses the e-mail when the name is empty', () => {
      renderMenu();
      expect(screen.getByRole('button', { name: 'Account menu for Sam Jo Example' })).toBe(
        trigger(),
      );
    });

    it('falls back to the e-mail in the accessible name for an empty display name', () => {
      mockUser = { id: 'u1', email: 'quinn@example.test', displayName: '  ', role: 'member' };
      renderMenu();
      expect(trigger()).toHaveAccessibleName('Account menu for quinn@example.test');
    });

    it('announces a menu popup that is collapsed until opened', async () => {
      const user = userEvent.setup();
      renderMenu();
      expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
      expect(trigger()).toHaveAttribute('aria-expanded', 'false');
      await user.click(trigger());
      expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    });

    it('renders nothing without a signed-in user', () => {
      mockUser = null;
      const { container } = renderMenu();
      expect(screen.queryByTestId('user-menu-trigger')).not.toBeInTheDocument();
      expect(container.querySelector('button')).toBe(screen.getByText('go elsewhere'));
    });
  });

  describe('menu contents', () => {
    it('shows the name and the Member role in the header, linked by aria-describedby', async () => {
      const user = userEvent.setup();
      renderMenu();
      const menu = await openMenu(user);
      const panel = screen.getByTestId('user-menu');
      expect(within(panel).getByText('Sam Jo Example')).toBeInTheDocument();
      expect(within(panel).getByText('Member')).toBeInTheDocument();
      const headerId = menu.getAttribute('aria-describedby');
      expect(headerId).toBeTruthy();
      const header = document.getElementById(headerId ?? '');
      expect(header).toHaveTextContent('Sam Jo Example');
      expect(header).toHaveTextContent('Member');
      expect(menu).not.toContainElement(header);
    });

    it('shows Administrator for an admin', async () => {
      mockUser = { id: 'u1', email: 'a@example.test', displayName: 'Ada', role: 'admin' };
      const user = userEvent.setup();
      renderMenu();
      await openMenu(user);
      expect(within(screen.getByTestId('user-menu')).getByText('Administrator')).toBeVisible();
      expect(within(screen.getByTestId('user-menu')).queryByText('Member')).toBeNull();
    });

    it('lists the entries in the specified order with three separators between groups', async () => {
      const user = userEvent.setup();
      renderMenu();
      const menu = await openMenu(user);
      expect(itemNames()).toEqual([
        'Account',
        'Light',
        'Dark',
        'System',
        'English',
        'Deutsch',
        'Keyboard shortcuts',
        'Help',
        'GitHub',
        'Log out',
      ]);
      const children = Array.from(menu.children);
      const separators = within(menu).getAllByRole('separator');
      expect(separators.map((s) => children.indexOf(s))).toEqual([1, 4, 8]);
    });

    it('labels the theme and language groups', async () => {
      const user = userEvent.setup();
      renderMenu();
      await openMenu(user);
      expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'About' })).toBeInTheDocument();
    });
  });

  describe('theme', () => {
    it.each([
      ['light', 'Light'],
      ['dark', 'Dark'],
      ['system', 'System'],
    ] as const)('marks only %s checked when it is the current preference', async (value, label) => {
      mockTheme = value;
      const user = userEvent.setup();
      renderMenu();
      await openMenu(user);
      const radios = screen.getAllByRole('menuitemradio');
      const checked = radios.filter((r) => r.getAttribute('aria-checked') === 'true');
      expect(checked.map((r) => r.textContent?.replace('✓', '').trim())).toContain(label);
      expect(screen.getByTestId(`user-menu-theme-${value}`)).toHaveAttribute(
        'aria-checked',
        'true',
      );
      expect(screen.getByTestId('user-menu-theme-light')).toHaveAttribute(
        'aria-checked',
        value === 'light' ? 'true' : 'false',
      );
    });

    it('applies the chosen preference, keeps the menu open and keeps focus on the option', async () => {
      const user = userEvent.setup();
      renderMenu();
      await openMenu(user);
      const dark = screen.getByTestId('user-menu-theme-dark');
      await user.click(dark);
      expect(mockSetTheme).toHaveBeenCalledTimes(1);
      expect(mockSetTheme).toHaveBeenCalledWith('dark');
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(dark).toHaveFocus();
    });

    it.each(['light', 'system'] as const)('maps the %s option to its own preference', async (v) => {
      mockTheme = 'dark';
      const user = userEvent.setup();
      renderMenu();
      await openMenu(user);
      await user.click(screen.getByTestId(`user-menu-theme-${v}`));
      expect(mockSetTheme).toHaveBeenCalledWith(v);
    });
  });

  describe('language', () => {
    it('checks the resolved locale and marks both options with their own lang', async () => {
      const user = userEvent.setup();
      renderMenu();
      await openMenu(user);
      expect(screen.getByTestId('user-menu-language-en')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('user-menu-language-de')).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByTestId('user-menu-language-en')).toHaveAttribute('lang', 'en');
      expect(screen.getByTestId('user-menu-language-de')).toHaveAttribute('lang', 'de');
    });

    it('checks Deutsch when the locale is German', async () => {
      mockLocale = 'de';
      const user = userEvent.setup();
      renderMenu();
      await openMenu(user);
      expect(screen.getByTestId('user-menu-language-de')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('user-menu-language-en')).toHaveAttribute('aria-checked', 'false');
    });

    it('builds its options from RESOLVED_LOCALES in list order', async () => {
      mockLocales.splice(0, mockLocales.length, 'de', 'en');
      const user = userEvent.setup();
      renderMenu();
      await openMenu(user);
      const group = screen.getByRole('group', { name: 'Language' });
      expect(
        within(group)
          .getAllByRole('menuitemradio')
          .map((o) => o.getAttribute('data-testid')),
      ).toEqual(['user-menu-language-de', 'user-menu-language-en']);
    });

    it('offers no language that RESOLVED_LOCALES does not list', async () => {
      mockLocales.splice(0, mockLocales.length, 'en');
      const user = userEvent.setup();
      renderMenu();
      await openMenu(user);
      expect(screen.getByTestId('user-menu-language-en')).toBeInTheDocument();
      expect(screen.queryByTestId('user-menu-language-de')).not.toBeInTheDocument();
    });

    it('sets the locale on click and keeps the menu open', async () => {
      const user = userEvent.setup();
      renderMenu();
      await openMenu(user);
      await user.click(screen.getByTestId('user-menu-language-de'));
      expect(mockSetLocale).toHaveBeenCalledTimes(1);
      expect(mockSetLocale).toHaveBeenCalledWith('de');
      expect(screen.getByRole('menu')).toBeInTheDocument();
      await user.click(screen.getByTestId('user-menu-language-en'));
      expect(mockSetLocale).toHaveBeenLastCalledWith('en');
    });
  });

  describe('account link', () => {
    it('is a real anchor to the account settings page', async () => {
      const user = userEvent.setup();
      renderMenu();
      await openMenu(user);
      const account = screen.getByTestId('user-menu-account');
      expect(account.tagName).toBe('A');
      expect(account).toHaveAttribute('href', routeUrl('settingsProfile'));
    });

    it('navigates in-app with a push and closes the menu', async () => {
      const user = userEvent.setup();
      const { log } = renderMenu();
      await openMenu(user);
      await user.click(screen.getByTestId('user-menu-account'));
      expect(log.actions).toEqual([`PUSH ${routeUrl('settingsProfile')}`]);
      expect(screen.getByTestId('probe-path')).toHaveTextContent(routeUrl('settingsProfile'));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('replaces the history entry when the account page is already current', async () => {
      const user = userEvent.setup();
      const { log } = renderMenu({ path: routeUrl('settingsProfile') });
      await openMenu(user);
      await user.click(screen.getByTestId('user-menu-account'));
      expect(log.actions).toEqual([`REPLACE ${routeUrl('settingsProfile')}`]);
      expect(log.entries).toHaveLength(1);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('external links and about', () => {
    it('opens Help in a new tab with noopener and an sr-only hint', async () => {
      const user = userEvent.setup();
      renderMenu();
      await openMenu(user);
      const help = screen.getByTestId('user-menu-help');
      expect(help).toHaveAttribute('href', HELP_URL);
      expect(help).toHaveAttribute('target', '_blank');
      expect(help).toHaveAttribute('rel', 'noopener noreferrer');
      expect(within(help).getByText('(opens in a new tab)')).toBeInTheDocument();
    });

    it('opens GitHub in a new tab with noopener and shows the version on the About line', async () => {
      const user = userEvent.setup();
      renderMenu();
      await openMenu(user);
      const github = screen.getByTestId('user-menu-github');
      expect(github).toHaveAttribute('href', GITHUB_URL);
      expect(github).toHaveAttribute('target', '_blank');
      expect(github).toHaveAttribute('rel', 'noopener noreferrer');
      expect(within(github).getByText('(opens in a new tab)')).toBeInTheDocument();
      expect(within(screen.getByRole('group', { name: 'About' })).getByText('v0.0.0-test')).toBe(
        screen.getByText('v0.0.0-test'),
      );
    });

    it('points at the documentation root and the project repository', () => {
      expect(HELP_URL).toBe('https://cornerstone.steiler.dev/');
      expect(GITHUB_URL).toBe('https://github.com/steilerDev/cornerstone');
    });
  });

  describe('keyboard shortcuts dialog', () => {
    it('lists the shortcuts the current page registered', async () => {
      const user = userEvent.setup();
      renderMenu({ withPage: true });
      await openMenu(user);
      await user.click(screen.getByTestId('user-menu-shortcuts'));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('n')).toBeInTheDocument();
      expect(within(dialog).getByText('New synthetic task')).toBeInTheDocument();
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('shows the empty message when the page registered nothing', async () => {
      const user = userEvent.setup();
      renderMenu();
      await openMenu(user);
      await user.click(screen.getByTestId('user-menu-shortcuts'));
      const dialog = screen.getByRole('dialog');
      expect(
        within(dialog).getByText('This page has no shortcuts of its own.'),
      ).toBeInTheDocument();
      // Only the "Everywhere" table remains.
      expect(within(dialog).getAllByRole('table')).toHaveLength(1);
    });

    it('shows the empty message when rendered without a registry provider', async () => {
      const user = userEvent.setup();
      render(
        <RecordingRouter entries={['/project/overview']} log={createRouterLog()}>
          <UserMenuModule.UserMenu />
        </RecordingRouter>,
      );
      await openMenu(user);
      await user.click(screen.getByTestId('user-menu-shortcuts'));
      expect(screen.getByText('This page has no shortcuts of its own.')).toBeInTheDocument();
    });

    it('returns focus to the avatar when the dialog closes', async () => {
      const user = userEvent.setup();
      renderMenu({ withPage: true });
      await openMenu(user);
      await user.click(screen.getByTestId('user-menu-shortcuts'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(trigger()).toHaveFocus();
    });
  });

  describe('log out', () => {
    it('calls logout once and shows the pending row, still open and inert', async () => {
      let resolveLogout: () => void = () => {};
      mockLogout.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveLogout = resolve;
          }),
      );
      const user = userEvent.setup();
      renderMenu();
      await openMenu(user);
      expect(screen.getByTestId('user-menu-logout')).toHaveTextContent('Log out');
      expect(screen.getByTestId('user-menu-logout')).not.toHaveAttribute('aria-disabled');

      await user.click(screen.getByTestId('user-menu-logout'));
      expect(mockLogout).toHaveBeenCalledTimes(1);
      const row = screen.getByTestId('user-menu-logout');
      expect(row).toHaveTextContent('Logging out…');
      expect(row).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByRole('menu')).toBeInTheDocument();

      await user.click(row);
      expect(mockLogout).toHaveBeenCalledTimes(1);
      await act(async () => {
        resolveLogout();
      });
    });
  });

  describe('closing', () => {
    it('closes the menu when the route changes', async () => {
      const user = userEvent.setup();
      renderMenu();
      await openMenu(user);
      expect(screen.getByRole('menu')).toBeInTheDocument();
      // The menu panel is outside the click-outside refs only for the trigger; use fireEvent so
      // the click does not count as an outside click before the navigation.
      fireEvent.click(screen.getByText('go elsewhere'));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(screen.getByTestId('probe-path')).toHaveTextContent('/schedule/gantt');
    });

    it('opens with the keyboard on the avatar and focuses the Account entry first', async () => {
      const user = userEvent.setup();
      renderMenu();
      trigger().focus();
      await user.keyboard('{Enter}');
      expect(screen.getByTestId('user-menu-account')).toHaveFocus();
      await user.keyboard('{End}');
      expect(screen.getByTestId('user-menu-logout')).toHaveFocus();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(trigger()).toHaveFocus();
    });
  });
});
