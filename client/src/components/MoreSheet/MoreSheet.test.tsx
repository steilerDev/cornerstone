/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type React from 'react';
import { createRef, useRef, useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { ShortcutRegistryProvider } from '../../hooks/shortcutRegistry.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { GITHUB_URL, HELP_URL } from '../../lib/externalLinks.js';
import { resolveNavActive } from '../../navigation/navActive.js';
import { navSections } from '../../navigation/navConfig.js';
import type { NavContext } from '../../navigation/navConfig.js';
import type * as MoreSheetTypes from './MoreSheet.js';

type Role = 'admin' | 'member';
let mockUser: { id: string; email: string; displayName: string; role: Role } | null;
let mockTheme: 'light' | 'dark' | 'system';
let mockLocale: 'en' | 'de';
let mockHardwareKeyboard: boolean;
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
  RESOLVED_LOCALES: ['en', 'de'],
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.unstable_mockModule('../../hooks/useHardwareKeyboard.js', () => ({
  useHardwareKeyboard: () => mockHardwareKeyboard,
}));

const ADMIN: NavContext = { role: 'admin', paperlessConfigured: true };
const MEMBER: NavContext = { role: 'member', paperlessConfigured: false };

function PageWithShortcuts() {
  useKeyboardShortcuts([{ key: 'n', handler: () => {}, description: 'New synthetic task' }]);
  return null;
}

describe('MoreSheet', () => {
  let MoreSheetModule: typeof MoreSheetTypes;

  beforeEach(async () => {
    if (!MoreSheetModule) MoreSheetModule = await import('./MoreSheet.js');
    mockUser = { id: 'u1', email: 'sam@example.test', displayName: 'Sam Example', role: 'admin' };
    mockTheme = 'system';
    mockLocale = 'en';
    mockHardwareKeyboard = false;
    mockLogout.mockReset().mockResolvedValue(undefined);
    mockSetTheme.mockReset();
    mockSetLocale.mockReset();
  });

  function Host({
    path,
    ctx,
    onCloseSpy,
    withPage,
  }: {
    path: string;
    ctx: NavContext;
    onCloseSpy?: () => void;
    withPage?: boolean;
  }) {
    const sections = navSections(ctx);
    const [open, setOpen] = useState(true);
    const moreRef = useRef<HTMLButtonElement>(null);
    return (
      <ShortcutRegistryProvider>
        {withPage && <PageWithShortcuts />}
        <button ref={moreRef} type="button" data-testid="more-opener">
          More opener
        </button>
        <MoreSheetModule.MoreSheet
          id="more"
          open={open}
          onClose={() => {
            onCloseSpy?.();
            setOpen(false);
          }}
          sections={sections}
          active={resolveNavActive(path, sections)}
          returnFocusRef={moreRef}
        />
        <span data-testid="open-state">{open ? 'open' : 'closed'}</span>
      </ShortcutRegistryProvider>
    );
  }

  function renderSheet(
    options: {
      path?: string;
      ctx?: NavContext;
      withPage?: boolean;
      onCloseSpy?: () => void;
    } = {},
  ) {
    const log = createRouterLog();
    const path = options.path ?? '/project/work-items';
    const utils = render(
      <RecordingRouter entries={[path]} log={log}>
        <Host
          path={path}
          ctx={options.ctx ?? ADMIN}
          withPage={options.withPage}
          onCloseSpy={options.onCloseSpy}
        />
      </RecordingRouter>,
    );
    return { log, ...utils };
  }

  const rowIds = () =>
    Array.from(
      document.querySelectorAll('[data-testid^="more-sheet-section-"]'),
      (el) => el.getAttribute('data-testid')?.replace('more-sheet-section-', '') ?? '',
    );

  describe('section groups', () => {
    it('lists the served sections in group order', () => {
      renderSheet();
      expect(rowIds()).toEqual(['tasks', 'purchases', 'money', 'companies', 'settings']);
    });

    it('renders one list per non-empty group and none for the empty middle group', () => {
      // Areas, History and Documents are not served yet, so the middle group is empty.
      renderSheet();
      const lists = within(screen.getByRole('navigation', { name: 'More' })).getAllByRole('list');
      expect(lists).toHaveLength(2);
      expect(within(lists[0]!).getAllByRole('listitem')).toHaveLength(4);
      expect(within(lists[1]!).getAllByRole('listitem')).toHaveLength(1);
    });

    it('never lists a section the user cannot open', () => {
      renderSheet({ ctx: MEMBER });
      expect(rowIds()).not.toContain('documents');
    });

    it('renders no list for a group that has no visible section', () => {
      // A member without Paperless still has group 2 (areas, history) - so build the empty group
      // by rendering with only the Settings section visible.
      const log = createRouterLog();
      const all = navSections(ADMIN);
      const onlySettings = all.filter((s) => s.id === 'settings');
      const ref = createRef<HTMLButtonElement>();
      render(
        <RecordingRouter entries={['/settings/profile']} log={log}>
          <ShortcutRegistryProvider>
            <MoreSheetModule.MoreSheet
              id="m"
              open
              onClose={() => {}}
              sections={onlySettings}
              active={resolveNavActive('/settings/profile', onlySettings)}
              returnFocusRef={ref}
            />
          </ShortcutRegistryProvider>
        </RecordingRouter>,
      );
      const nav = screen.getByRole('navigation', { name: 'More' });
      expect(within(nav).getAllByRole('list')).toHaveLength(1);
      expect(rowIds()).toEqual(['settings']);
    });

    it('marks only the current section row with aria-current=page', () => {
      renderSheet({ path: '/budget/overview' });
      const current = Array.from(document.querySelectorAll('[aria-current="page"]'));
      expect(current).toHaveLength(1);
      expect(current[0]).toBe(screen.getByTestId('more-sheet-section-money'));
    });

    it('marks nothing current on a section owned by the bottom bar', () => {
      renderSheet({ path: '/diary' });
      expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
    });

    it('a row click closes the sheet and navigates', () => {
      const spy = jest.fn();
      const { log } = renderSheet({ onCloseSpy: spy });
      fireEvent.click(screen.getByTestId('more-sheet-section-money'));
      expect(spy).toHaveBeenCalledTimes(1);
      expect(log.actions).toEqual(['PUSH /budget/overview']);
    });

    it('the current row replaces the history entry on its exact page', () => {
      const { log } = renderSheet({ path: '/project/work-items' });
      fireEvent.click(screen.getByTestId('more-sheet-section-tasks'));
      expect(log.actions).toEqual(['REPLACE /project/work-items']);
    });
  });

  describe('user block', () => {
    it('shows the name and role', () => {
      renderSheet();
      const block = screen.getByTestId('more-sheet-user');
      expect(within(block).getByText('Sam Example')).toBeInTheDocument();
      expect(within(block).getByText('Administrator')).toBeInTheDocument();
    });

    it('falls back to the e-mail address when the display name is blank', () => {
      mockUser = { id: 'u1', email: 'sam@example.test', displayName: '  ', role: 'member' };
      renderSheet({ ctx: MEMBER });
      expect(
        within(screen.getByTestId('more-sheet-user')).getByText('sam@example.test'),
      ).toBeVisible();
      expect(within(screen.getByTestId('more-sheet-user')).getByText('Member')).toBeInTheDocument();
    });

    it('renders no user block when signed out', () => {
      mockUser = null;
      renderSheet();
      expect(screen.queryByTestId('more-sheet-user')).toBeNull();
      expect(screen.queryByTestId('more-sheet-logout')).toBeNull();
      expect(rowIds().length).toBeGreaterThan(0);
    });

    it('orders the controls: Account, Theme, Language, Help, About, GitHub, Log out', () => {
      renderSheet();
      const order = Array.from(
        screen.getByTestId('more-sheet-user').querySelectorAll('[data-testid]'),
        (el) => el.getAttribute('data-testid') ?? '',
      ).filter(
        (id) =>
          [
            'more-sheet-account',
            'more-sheet-help',
            'more-sheet-about',
            'more-sheet-github',
            'more-sheet-logout',
          ].includes(id) ||
          id === 'more-sheet-theme-light' ||
          id === 'more-sheet-language-en',
      );
      expect(order).toEqual([
        'more-sheet-account',
        'more-sheet-theme-light',
        'more-sheet-language-en',
        'more-sheet-help',
        'more-sheet-about',
        'more-sheet-github',
        'more-sheet-logout',
      ]);
    });

    it('links Account to the profile and closes the sheet', () => {
      const spy = jest.fn();
      const { log } = renderSheet({ onCloseSpy: spy });
      const account = screen.getByTestId('more-sheet-account');
      expect(account).toHaveAttribute('href', '/settings/profile');
      fireEvent.click(account);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(log.actions).toEqual(['PUSH /settings/profile']);
    });

    it('opens Help and GitHub in a new tab with noopener', () => {
      renderSheet();
      const help = screen.getByTestId('more-sheet-help');
      expect(help).toHaveAttribute('href', HELP_URL);
      expect(help).toHaveAttribute('target', '_blank');
      expect(help).toHaveAttribute('rel', 'noopener noreferrer');
      expect(within(help).getByText('(opens in a new tab)')).toBeInTheDocument();
      const github = screen.getByTestId('more-sheet-github');
      expect(github).toHaveAttribute('href', GITHUB_URL);
      expect(github).toHaveAttribute('target', '_blank');
      expect(within(github).getByText('(opens in a new tab)')).toBeInTheDocument();
    });

    it('shows the app name and version under About', () => {
      renderSheet();
      expect(screen.getByTestId('more-sheet-about')).toHaveTextContent(
        /Cornerstone\s*v0\.0\.0-test/,
      );
    });

    describe('theme and language', () => {
      it('shows the current theme as the checked radio with a check mark', () => {
        mockTheme = 'dark';
        renderSheet();
        const group = screen.getByRole('group', { name: 'Theme' });
        expect(within(group).getByRole('radio', { name: /Dark/ })).toBeChecked();
        expect(within(group).getByRole('radio', { name: /Light/ })).not.toBeChecked();
        expect(screen.getByTestId('more-sheet-theme-dark')).toHaveTextContent('✓');
        expect(screen.getByTestId('more-sheet-theme-light')).not.toHaveTextContent('✓');
      });

      it('choosing a theme calls the setter and keeps the sheet open', async () => {
        renderSheet();
        await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));
        expect(mockSetTheme).toHaveBeenCalledWith('dark');
        expect(screen.getByTestId('open-state')).toHaveTextContent('open');
      });

      it('choosing a language calls the setter, keeps the sheet open and tags the label lang', async () => {
        renderSheet();
        const german = screen.getByTestId('more-sheet-language-de');
        expect(german).toHaveAttribute('lang', 'de');
        await userEvent.click(within(german).getByRole('radio'));
        expect(mockSetLocale).toHaveBeenCalledWith('de');
        expect(screen.getByTestId('open-state')).toHaveTextContent('open');
      });

      it('marks the active language', () => {
        mockLocale = 'de';
        renderSheet();
        expect(
          within(screen.getByTestId('more-sheet-language-de')).getByRole('radio'),
        ).toBeChecked();
        expect(
          within(screen.getByTestId('more-sheet-language-en')).getByRole('radio'),
        ).not.toBeChecked();
      });
    });

    describe('log out', () => {
      it('is the last control in the sheet and exists exactly once', () => {
        renderSheet();
        expect(screen.getAllByText('Log out')).toHaveLength(1);
        const block = screen.getByTestId('more-sheet-user');
        expect(block.lastElementChild).toBe(screen.getByTestId('more-sheet-logout'));
      });

      it('calls logout once and then shows a disabled "Logging out…" state', async () => {
        renderSheet();
        const button = screen.getByTestId('more-sheet-logout');
        await userEvent.click(button);
        expect(mockLogout).toHaveBeenCalledTimes(1);
        expect(button).toHaveTextContent('Logging out…');
        expect(button).toHaveAttribute('aria-disabled', 'true');
        await userEvent.click(button);
        expect(mockLogout).toHaveBeenCalledTimes(1);
      });
    });

    describe('keyboard shortcuts', () => {
      it('is hidden without a hardware keyboard', () => {
        mockHardwareKeyboard = false;
        renderSheet();
        expect(screen.queryByTestId('more-sheet-shortcuts')).toBeNull();
      });

      it('sits between GitHub and Log out when a hardware keyboard is present', () => {
        mockHardwareKeyboard = true;
        renderSheet();
        const shortcuts = screen.getByTestId('more-sheet-shortcuts');
        expect(shortcuts.previousElementSibling).toBe(screen.getByTestId('more-sheet-github'));
        expect(shortcuts.nextElementSibling).toBe(screen.getByTestId('more-sheet-logout'));
      });

      it('closes the sheet, opens the help with the page shortcuts and focuses More on close', async () => {
        mockHardwareKeyboard = true;
        const spy = jest.fn();
        renderSheet({ withPage: true, onCloseSpy: spy });
        await userEvent.click(screen.getByTestId('more-sheet-shortcuts'));
        expect(spy).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('open-state')).toHaveTextContent('closed');
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('New synthetic task')).toBeInTheDocument();

        await userEvent.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.getByTestId('more-opener')).toHaveFocus();
      });

      it('shows the empty message when the page registered no shortcuts', async () => {
        mockHardwareKeyboard = true;
        renderSheet();
        await userEvent.click(screen.getByTestId('more-sheet-shortcuts'));
        expect(
          within(screen.getByRole('dialog')).getByText('This page has no shortcuts of its own.'),
        ).toBeInTheDocument();
      });
    });
  });

  it('is a labelled dialog while open with no duplicate test ids', () => {
    mockHardwareKeyboard = true;
    const { container } = renderSheet();
    expect(screen.getByRole('dialog', { name: 'More' })).toBe(screen.getByTestId('more-sheet'));
    expect(findDuplicateTestIds(container)).toEqual([]);
  });
});
