/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lazy, use, useRef } from 'react';
import { Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { renderWithRouter } from '../../test/testUtils';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds';
import i18n from '../../i18n/index.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { ViewMenuContext } from '../../navigation/viewMenu.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { useCreateContext } from '../CreateMenu/CreateMenuContext.js';
import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts.js';
import type * as AppShellTypes from './AppShell.js';
import type * as SearchApiTypes from '../../lib/searchApi.js';

let mockRole: 'admin' | 'member' | null = 'admin';

jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({
    user:
      mockRole === null
        ? null
        : {
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
    logout: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }),
}));

// The logo and the user menu read the theme
jest.unstable_mockModule('../../contexts/ThemeContext.js', () => ({
  useTheme: () => ({
    theme: 'system',
    resolvedTheme: 'light',
    setTheme: jest.fn(),
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock LocaleContext so the user menu in the top bar can call useLocale()
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: () => ({
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  }),
  RESOLVED_LOCALES: ['en', 'de'],
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// The command search is mounted by the shell; its API is mocked with an empty result.
const mockSearch = jest.fn<typeof SearchApiTypes.searchEverywhere>();
jest.unstable_mockModule('../../lib/searchApi.js', () => ({ searchEverywhere: mockSearch }));

const PAGE_SHORTCUTS: KeyboardShortcut[] = [
  { key: 'n', handler: () => {}, description: 'New synthetic task' },
];

function PageWithShortcuts() {
  useKeyboardShortcuts(PAGE_SHORTCUTS);
  return <div>Shortcut page</div>;
}

/** Exposes the view menu model AppShell provides to pages. */
function ViewMenuProbe() {
  const model = use(ViewMenuContext);
  return (
    <p data-testid="view-menu-probe">
      {model ? `${model.current}:${model.entries.length}` : 'none'}
    </p>
  );
}

function Navigator() {
  const navigate = useNavigate();
  return (
    <button type="button" data-testid="go-photos" onClick={() => void navigate('/photos')}>
      go
    </button>
  );
}

describe('AppShell', () => {
  let AppShellModule: typeof AppShellTypes;
  const originalMatchMedia = window.matchMedia;
  let wideNow = false;
  const mediaListeners = new Set<() => void>();

  /** jsdom never matches a media query: drive the 1024 px switch (and any-pointer) by hand. */
  function installMatchMedia(wide: boolean, finePointer = false) {
    wideNow = wide;
    mediaListeners.clear();
    window.matchMedia = (query: string): MediaQueryList =>
      ({
        get matches() {
          if (query === '(min-width: 1024px)') return wideNow;
          if (query === '(any-pointer: fine)') return finePointer;
          return false;
        },
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: (_: string, listener: () => void) => mediaListeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => mediaListeners.delete(listener),
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }

  function resizeTo(wide: boolean) {
    act(() => {
      wideNow = wide;
      mediaListeners.forEach((listener) => listener());
    });
  }

  beforeEach(async () => {
    if (!AppShellModule) {
      AppShellModule = await import('./AppShell.js');
    }
    mockRole = 'admin';
    installMatchMedia(false);
  });

  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    window.matchMedia = originalMatchMedia;
    delete document.documentElement.dataset.shellBar;
    delete document.documentElement.dataset.scrollLocked;
  });

  function renderAt(path: string, page: React.ReactNode) {
    return renderWithRouter(
      <Routes>
        <Route element={<AppShellModule.AppShell />} path="*">
          <Route path="*" element={page} />
        </Route>
      </Routes>,
      { initialEntries: [path] },
    );
  }

  describe('shared by both layouts', () => {
    it('renders the outlet inside the main landmark', () => {
      renderAt('/', <div>Test Content</div>);

      expect(within(screen.getByRole('main')).getByText('Test Content')).toBeInTheDocument();
    });

    it('shows "Loading..." fallback while a lazy component loads', async () => {
      const LazyComponent = lazy(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                default: () => <div>Loaded Content</div>,
              } as never);
            }, 100);
          }),
      );

      renderAt('/', <LazyComponent />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
      expect(screen.getByText('Loaded Content')).toBeInTheDocument();
    });

    it('takes the Suspense fallback text from the common loading key', async () => {
      await act(async () => {
        await i18n.changeLanguage('de');
      });
      const Lazy = lazy(() => new Promise<never>(() => {}));
      renderAt('/', <Lazy />);

      expect(screen.getByText('Wird geladen...')).toBeInTheDocument();
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    it.each([false, true])('renders exactly one banner, the top bar (wide: %s)', (wide) => {
      installMatchMedia(wide);
      renderAt('/', <div>Test Content</div>);

      expect(screen.getAllByRole('banner')).toHaveLength(1);
      expect(screen.getByRole('banner')).toBe(screen.getByTestId('top-bar'));
    });

    it.each([false, true])(
      'places the bar beside the scroll wrapper, never inside it, so it stays sticky (wide: %s)',
      (wide) => {
        installMatchMedia(wide);
        renderAt('/', <div>Test Content</div>);

        const bar = screen.getByTestId('top-bar');
        const main = screen.getByRole('main');
        const scrollWrapper = main.parentElement as HTMLElement;
        expect(scrollWrapper).toHaveClass('mainContent');
        expect(scrollWrapper.contains(bar)).toBe(false);
        expect(bar.parentElement).toHaveClass('shellColumn');
        expect(scrollWrapper.parentElement).toBe(bar.parentElement);
      },
    );

    it.each([false, true])(
      'never renders the retired floating menu button or overlay (wide: %s)',
      (wide) => {
        installMatchMedia(wide);
        renderAt('/', <div>Test Content</div>);

        expect(screen.queryByTestId('menu-fab')).toBeNull();
        expect(screen.queryByTestId('sidebar-overlay')).toBeNull();
        expect(screen.queryByRole('button', { name: /open menu/i })).toBeNull();
      },
    );
  });

  describe('from 1024 px: sidebar and desktop top bar', () => {
    beforeEach(() => installMatchMedia(true));

    it('renders the sidebar and the desktop bar but no bottom bar or More sheet', () => {
      renderAt('/', <div>Test Content</div>);

      expect(screen.getByRole('complementary')).toBeInTheDocument();
      expect(screen.getByTestId('top-bar-new')).toBeInTheDocument();
      expect(screen.queryByTestId('bottom-bar')).toBeNull();
      expect(screen.queryByTestId('more-sheet')).toBeNull();
      expect(screen.queryByTestId('top-bar-house-name')).toBeNull();
      expect(document.documentElement.dataset.shellBar).toBeUndefined();
    });

    it('renders navigation links in the sidebar', () => {
      renderAt('/', <div>Test Content</div>);

      for (const name of [
        'Home',
        'Tasks',
        'Purchases',
        'Site diary',
        'Photos',
        'Money',
        'Companies',
        'Settings',
      ]) {
        expect(screen.getByRole('link', { name })).toBeInTheDocument();
      }
      expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: /^settings$/i })).toBeInTheDocument();
    });

    it('keeps the sidebar outside the column', () => {
      renderAt('/', <div>Test Content</div>);

      const column = screen.getByTestId('top-bar').parentElement as HTMLElement;
      expect(column.contains(screen.getByRole('complementary'))).toBe(false);
    });

    it('does not give pages a view menu (the sidebar nests the views)', () => {
      renderAt('/project/work-items', <ViewMenuProbe />);

      expect(screen.getByTestId('view-menu-probe')).toHaveTextContent('none');
    });

    it('lets the user menu list the shortcuts the open page registered', async () => {
      const user = userEvent.setup();
      renderAt('/', <PageWithShortcuts />);

      await user.click(screen.getByTestId('user-menu-trigger'));
      await user.click(screen.getByTestId('user-menu-shortcuts'));

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('New synthetic task')).toBeInTheDocument();
    });

    it("lists the shell's New-menu shortcut on a page that registered none", async () => {
      const user = userEvent.setup();
      renderAt('/', <div>Test Content</div>);

      await user.click(screen.getByTestId('user-menu-trigger'));
      await user.click(screen.getByTestId('user-menu-shortcuts'));

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('Open the New menu')).toBeInTheDocument();
      expect(within(dialog).queryByText('New synthetic task')).toBeNull();
    });

    it("shows the page's own n row instead of the shell's when the page owns n", async () => {
      const user = userEvent.setup();
      renderAt('/', <PageWithShortcuts />);

      await user.click(screen.getByTestId('user-menu-trigger'));
      await user.click(screen.getByTestId('user-menu-shortcuts'));

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('New synthetic task')).toBeInTheDocument();
      expect(within(dialog).queryByText('Open the New menu')).toBeNull();
    });

    it('n opens the New menu with focus on the first row; Escape returns focus', async () => {
      const user = userEvent.setup();
      renderAt('/', <div>Test Content</div>);
      screen.getByTestId('top-bar-search').focus();

      await user.keyboard('n');

      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(screen.getByTestId('create-menu-diaryEntry')).toHaveFocus();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).toBeNull();
      expect(screen.getByTestId('top-bar-search')).toHaveFocus();
    });

    it("a page that owns n keeps it: n runs the page's handler and opens no menu", async () => {
      const user = userEvent.setup();
      const handler = jest.fn<() => void>();
      function OwnsN() {
        useKeyboardShortcuts([{ key: 'n', handler, description: 'page n' }]);
        return <div>page</div>;
      }
      renderAt('/', <OwnsN />);

      await user.keyboard('n');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('lists the Funding source and Grant rows (after a separator) only on Money pages', async () => {
      const user = userEvent.setup();
      const { unmount } = renderAt('/budget/sources', <div>Test Content</div>);
      await user.click(screen.getByTestId('top-bar-new'));
      expect(screen.getByTestId('create-menu-fundingSource')).toBeInTheDocument();
      expect(screen.getByTestId('create-menu-grant')).toBeInTheDocument();
      expect(screen.getByRole('menu').querySelector('[role="separator"]')).not.toBeNull();
      unmount();

      renderAt('/', <div>Test Content</div>);
      await user.click(screen.getByTestId('top-bar-new'));
      expect(screen.queryByTestId('create-menu-fundingSource')).toBeNull();
      expect(screen.queryByTestId('create-menu-grant')).toBeNull();
    });

    it('a page that registers a context pre-fills the New menu links', async () => {
      const user = userEvent.setup();
      function WithContext() {
        useCreateContext({ areaId: 'a1', companyId: 'c1', date: '2026-03-01' });
        return <div>page</div>;
      }
      renderAt('/', <WithContext />);
      await user.click(screen.getByTestId('top-bar-new'));
      expect(screen.getByTestId('create-menu-task')).toHaveAttribute(
        'href',
        expect.stringContaining('areaId=a1'),
      );
      expect(screen.getByTestId('create-menu-milestone')).toHaveAttribute(
        'href',
        expect.stringContaining('date=2026-03-01'),
      );
      expect(screen.getByTestId('create-menu-milestone')).not.toHaveAttribute(
        'href',
        expect.stringContaining('areaId'),
      );
    });

    it('has exactly one Log out, in the user menu', async () => {
      const user = userEvent.setup();
      renderAt('/', <div>Test Content</div>);
      await user.click(screen.getByTestId('user-menu-trigger'));

      expect(screen.getAllByText('Log out')).toHaveLength(1);
      expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument();
      expect(screen.queryByTestId('more-sheet-logout')).toBeNull();
    });

    it('hosts the page breadcrumbs in the bar slot, so only one row exists', async () => {
      renderAt('/project/work-items/w-1', <PageBreadcrumbs />);

      const slot = screen.getByTestId('top-bar-slot');
      await waitFor(() => expect(within(slot).getByTestId('breadcrumbs')).toBeInTheDocument());
      expect(within(slot).getByTestId('breadcrumbs')).toHaveClass('rowBar');
      expect(within(screen.getByRole('main')).queryByTestId('breadcrumbs')).toBeNull();
      expect(screen.getAllByRole('navigation', { name: 'You are here' })).toHaveLength(1);
    });

    it('has no duplicate test ids', () => {
      const { container } = renderAt('/project/work-items', <div>Test Content</div>);

      expect(findDuplicateTestIds(container)).toEqual([]);
    });
  });

  describe('command search (#2211)', () => {
    beforeEach(() => {
      mockSearch.mockReset();
      mockSearch.mockImplementation((params) => Promise.resolve({ query: params.q, groups: [] }));
    });

    function SearchPage() {
      const navigate = useNavigate();
      return (
        <>
          <h1>Search page</h1>
          <button
            type="button"
            data-testid="go-photos-now"
            onClick={() => void navigate('/photos')}
          >
            go
          </button>
          <button type="button" data-testid="go-back" onClick={() => void navigate(-1)}>
            back
          </button>
        </>
      );
    }

    const shellRoot = () => screen.getByTestId('top-bar').closest('[class*="appShell"]')!;

    it('opens the palette from the Search button and makes the shell inert', async () => {
      installMatchMedia(true);
      const user = userEvent.setup();
      renderAt('/', <SearchPage />);
      expect(shellRoot()).not.toHaveAttribute('inert');
      await user.click(screen.getByTestId('top-bar-search'));
      const dialog = await screen.findByRole('dialog', { name: 'Search everywhere' });
      expect(shellRoot()).toHaveAttribute('inert');
      expect(dialog.closest('[inert]')).toBeNull();
      expect(shellRoot().contains(dialog)).toBe(false);
      expect(screen.queryByTestId('command-search-sheet')).toBeNull();
    });

    it('removes the inert attribute and returns focus to the button when it closes', async () => {
      installMatchMedia(true);
      const user = userEvent.setup();
      renderAt('/', <SearchPage />);
      const trigger = screen.getByTestId('top-bar-search');
      await user.click(trigger);
      await screen.findByRole('dialog', { name: 'Search everywhere' });
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(shellRoot()).not.toHaveAttribute('inert');
      expect(trigger).toHaveFocus();
    });

    it('toggles with Ctrl K from anywhere and prevents the browser default', async () => {
      installMatchMedia(true);
      renderAt('/', <SearchPage />);
      const open = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        document.body.dispatchEvent(open);
      });
      expect(open.defaultPrevented).toBe(true);
      await screen.findByRole('dialog', { name: 'Search everywhere' });
      const close = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        document.body.dispatchEvent(close);
      });
      expect(close.defaultPrevented).toBe(true);
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('opens the palette from the shell "/" when the page has no list search field', async () => {
      installMatchMedia(true);
      renderAt('/', <SearchPage />);
      fireEvent.keyDown(document, { key: '/' });
      expect(await screen.findByRole('dialog', { name: 'Search everywhere' })).toBeInTheDocument();
    });

    it('focuses the page list search field instead when there is one', () => {
      installMatchMedia(true);
      renderAt('/', <input data-page-search="" data-testid="list-field" />);
      const field = screen.getByTestId('list-field');
      Object.defineProperty(field, 'checkVisibility', { value: () => true, configurable: true });
      fireEvent.keyDown(document, { key: '/' });
      expect(field).toHaveFocus();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('closes on any real navigation', async () => {
      installMatchMedia(true);
      renderAt('/', <SearchPage />);
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
      await screen.findByRole('dialog', { name: 'Search everywhere' });
      fireEvent.click(screen.getByTestId('go-photos-now'));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(shellRoot()).not.toHaveAttribute('inert');
    });

    it('closes when the browser goes back', async () => {
      installMatchMedia(true);
      const user = userEvent.setup();
      renderWithRouter(
        <Routes>
          <Route element={<AppShellModule.AppShell />} path="*">
            <Route path="*" element={<SearchPage />} />
          </Route>
        </Routes>,
        { initialEntries: ['/schedule/gantt', '/'], initialIndex: 1 },
      );
      await user.click(screen.getByTestId('top-bar-search'));
      await screen.findByRole('dialog', { name: 'Search everywhere' });
      fireEvent.click(screen.getByTestId('go-back'));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('does not open over another dialog (Ctrl K is still consumed)', async () => {
      installMatchMedia(false);
      const user = userEvent.setup();
      renderAt('/', <SearchPage />);
      await user.click(screen.getByRole('button', { name: 'More' }));
      await screen.findByTestId('more-sheet');
      const press = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        document.body.dispatchEvent(press);
      });
      expect(press.defaultPrevented).toBe(true);
      expect(screen.queryByTestId('command-search-sheet')).toBeNull();
    });

    it('renders the full-screen sheet below 1024 px, outside the inert shell', async () => {
      installMatchMedia(false);
      const user = userEvent.setup();
      renderAt('/', <SearchPage />);
      await user.click(screen.getByTestId('top-bar-search'));
      const sheet = await screen.findByTestId('command-search-sheet');
      expect(sheet).toHaveAttribute('data-open', 'true');
      expect(shellRoot()).toHaveAttribute('inert');
      expect(sheet.closest('[inert]')).toBeNull();
      expect(shellRoot().contains(sheet)).toBe(false);
      expect(screen.getAllByRole('dialog').filter((d) => !d.hasAttribute('inert'))).toHaveLength(1);
    });

    it('keeps the query when the window crosses 1024 px while open', async () => {
      installMatchMedia(true);
      const user = userEvent.setup();
      renderAt('/', <SearchPage />);
      await user.click(screen.getByTestId('top-bar-search'));
      await user.type(await screen.findByTestId('command-search-input'), 'roof');
      resizeTo(false);
      expect(await screen.findByTestId('command-search-sheet')).toBeInTheDocument();
      expect((screen.getByTestId('command-search-input') as HTMLInputElement).value).toBe('roof');
    });

    it('does not reopen the palette when the user comes back to the page it was opened on', async () => {
      installMatchMedia(true);
      const user = userEvent.setup();
      renderWithRouter(
        <Routes>
          <Route element={<AppShellModule.AppShell />} path="*">
            <Route path="*" element={<SearchPage />} />
          </Route>
        </Routes>,
        { initialEntries: ['/'] },
      );
      await user.click(screen.getByTestId('top-bar-search'));
      await screen.findByRole('dialog', { name: 'Search everywhere' });
      fireEvent.click(screen.getByTestId('go-photos-now'));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      // Back to the entry (and location key) the palette was opened on.
      fireEvent.click(screen.getByTestId('go-back'));
      await waitFor(() => expect(screen.getByTestId('top-bar-search')).toBeInTheDocument());
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(shellRoot()).not.toHaveAttribute('inert');
    });

    it('returns focus to the list search field when opened from its "Search everywhere" row', async () => {
      installMatchMedia(true);
      const { SearchEverywhereRow } = await import('../CommandSearch/SearchEverywhereRow.js');
      function ListPage() {
        const ref = useRef<HTMLInputElement>(null);
        return (
          <>
            <h1>List</h1>
            <input ref={ref} data-page-search="" data-testid="list-field" defaultValue="roof" />
            <SearchEverywhereRow query="roof" returnFocusRef={ref} />
          </>
        );
      }
      const user = userEvent.setup();
      renderAt('/', <ListPage />);
      await user.click(screen.getByTestId('search-everywhere-row'));
      const input = await screen.findByTestId('command-search-input');
      expect((input as HTMLInputElement).value).toBe('roof');
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.getByTestId('list-field')).toHaveFocus();
    });

    it('gives the Search button its popup semantics in both layouts', () => {
      installMatchMedia(true);
      const { unmount } = renderAt('/', <SearchPage />);
      expect(screen.getByTestId('top-bar-search')).toHaveAttribute('aria-haspopup', 'dialog');
      unmount();
      installMatchMedia(false);
      renderAt('/', <SearchPage />);
      expect(screen.getByTestId('top-bar-search')).toHaveAttribute('aria-haspopup', 'dialog');
    });
  });

  describe('below 1024 px: compact top bar, bottom bar and More sheet', () => {
    it('renders one header, one Main navigation (the bottom bar) and no sidebar', () => {
      renderAt('/', <div>Test Content</div>);

      expect(screen.getAllByRole('banner')).toHaveLength(1);
      expect(screen.getByTestId('top-bar')).toHaveClass('compact');
      expect(screen.getAllByRole('navigation', { name: 'Main navigation' })).toHaveLength(1);
      expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBe(
        screen.getByTestId('bottom-bar'),
      );
      expect(screen.queryByRole('complementary')).toBeNull();
      expect(screen.queryByTestId('top-bar-new')).toBeNull();
    });

    it('orders the DOM header, bottom bar, main, then the sheet (Tab order)', () => {
      renderAt('/', <div>Test Content</div>);

      const header = screen.getByTestId('top-bar');
      const bar = screen.getByTestId('bottom-bar');
      const main = screen.getByRole('main');
      const sheet = screen.getByTestId('more-sheet');
      const order = (a: Node, b: Node) =>
        Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      expect(order(header, bar)).toBe(true);
      expect(order(bar, main)).toBe(true);
      expect(order(main, sheet)).toBe(true);
      expect(sheet.parentElement).not.toBe(header.parentElement);
    });

    it('marks the bottom bar shown for the layout variables', () => {
      renderAt('/', <div>Test Content</div>);

      expect(document.documentElement.dataset.shellBar).toBe('shown');
    });

    it('shows the closed sheet as inert with no dialog role, so nothing announces it', () => {
      renderAt('/', <div>Test Content</div>);

      const sheet = screen.getByTestId('more-sheet');
      expect(sheet).toHaveAttribute('inert');
      expect(sheet).not.toHaveAttribute('role');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByTestId('bottom-bar-more')).toHaveAttribute('aria-expanded', 'false');
    });

    it('More opens the sheet: dialog role, shell column inert, scroll locked', async () => {
      const user = userEvent.setup();
      renderAt('/', <div>Test Content</div>);

      await user.click(screen.getByTestId('bottom-bar-more'));

      const dialog = screen.getByRole('dialog', { name: 'More' });
      expect(dialog).toBe(screen.getByTestId('more-sheet'));
      expect(dialog).not.toHaveAttribute('inert');
      expect(screen.getByTestId('top-bar').parentElement).toHaveAttribute('inert');
      expect(screen.getByTestId('bottom-bar-more')).toHaveAttribute('aria-expanded', 'true');
      expect(document.documentElement.dataset.scrollLocked).toBe('true');
    });

    it('the plus button opens the New sheet: dialog role, shell column inert, rows in order', async () => {
      const user = userEvent.setup();
      renderAt('/', <div>Test Content</div>);

      await user.click(screen.getByTestId('bottom-bar-new'));

      const dialog = screen.getByRole('dialog', { name: 'New' });
      expect(dialog).toBe(screen.getByTestId('create-sheet'));
      expect(screen.getByTestId('top-bar').parentElement).toHaveAttribute('inert');
      expect(screen.getByTestId('bottom-bar-new')).toHaveAttribute('aria-expanded', 'true');
      expect(
        within(dialog)
          .getAllByRole('link')
          .map((a) => a.getAttribute('data-testid')),
      ).toEqual([
        'create-sheet-diaryEntry',
        'create-sheet-task',
        'create-sheet-purchase',
        'create-sheet-invoice',
        'create-sheet-offer',
        'create-sheet-company',
        'create-sheet-milestone',
      ]);
    });

    it('lists Funding source and Grant in the New sheet on Money pages only', async () => {
      const user = userEvent.setup();
      renderAt('/budget/sources', <div>Test Content</div>);
      await user.click(screen.getByTestId('bottom-bar-new'));
      expect(screen.getByTestId('create-sheet-fundingSource')).toBeInTheDocument();
      expect(screen.getByTestId('create-sheet-grant')).toBeInTheDocument();
    });

    it('Escape closes the New sheet and returns focus to the plus button', async () => {
      const user = userEvent.setup();
      renderAt('/', <div>Test Content</div>);
      await user.click(screen.getByTestId('bottom-bar-new'));

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByTestId('bottom-bar-new')).toHaveFocus();
    });

    it('choosing a row navigates and closes the New sheet', async () => {
      const user = userEvent.setup();
      renderAt('/', <div>Test Content</div>);
      await user.click(screen.getByTestId('bottom-bar-new'));

      await user.click(screen.getByTestId('create-sheet-diaryEntry'));

      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('n opens the New sheet below 1024 px', async () => {
      const user = userEvent.setup();
      renderAt('/', <div>Test Content</div>);

      await user.keyboard('n');

      expect(screen.getByTestId('create-sheet')).toHaveAttribute('data-open', 'true');
    });

    it('any navigation closes an open New sheet', async () => {
      const user = userEvent.setup();
      renderAt('/', <Navigator />);
      await user.click(screen.getByTestId('bottom-bar-new'));
      expect(screen.getByRole('dialog', { name: 'New' })).toBeInTheDocument();

      act(() => {
        fireEvent.click(screen.getByTestId('go-photos'));
      });

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByTestId('create-sheet')).toHaveAttribute('data-open', 'false');
    });

    it('does not reopen the New sheet after a resize round trip', async () => {
      const user = userEvent.setup();
      renderAt('/', <div>Test Content</div>);
      await user.click(screen.getByTestId('bottom-bar-new'));

      resizeTo(true);
      resizeTo(false);

      expect(screen.queryByTestId('create-sheet')?.getAttribute('data-open')).not.toBe('true');
    });

    it('Escape closes the sheet, lifts the inert, and returns focus to More', async () => {
      const user = userEvent.setup();
      renderAt('/', <div>Test Content</div>);
      await user.click(screen.getByTestId('bottom-bar-more'));

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByTestId('more-sheet')).toHaveAttribute('inert');
      expect(screen.getByTestId('top-bar').parentElement).not.toHaveAttribute('inert');
      expect(screen.getByTestId('bottom-bar-more')).toHaveFocus();
      expect(document.documentElement.dataset.scrollLocked).toBeUndefined();
    });

    it('the backdrop closes the sheet and returns focus to More', async () => {
      const user = userEvent.setup();
      renderAt('/', <div>Test Content</div>);
      await user.click(screen.getByTestId('bottom-bar-more'));

      await user.click(screen.getByTestId('more-sheet-backdrop'));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByTestId('bottom-bar-more')).toHaveFocus();
    });

    it('the Close button closes the sheet', async () => {
      const user = userEvent.setup();
      renderAt('/', <div>Test Content</div>);
      await user.click(screen.getByTestId('bottom-bar-more'));

      await user.click(screen.getByTestId('more-sheet-close'));

      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('choosing a destination in the sheet navigates and closes it', async () => {
      const user = userEvent.setup();
      renderAt('/', <ViewMenuProbe />);
      await user.click(screen.getByTestId('bottom-bar-more'));

      await user.click(screen.getByTestId('more-sheet-section-money'));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByTestId('bottom-bar-more')).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByTestId('view-menu-probe')).toHaveTextContent('budgetOverview');
    });

    it('any navigation closes an open sheet', async () => {
      const user = userEvent.setup();
      function Page() {
        return <Navigator />;
      }
      renderAt('/', <Page />);
      await user.click(screen.getByTestId('bottom-bar-more'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      act(() => {
        // The column is inert for the user, so navigate the way a back button would
        fireEvent.click(screen.getByTestId('go-photos'));
      });

      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('does not reopen the sheet after a resize round trip', async () => {
      const user = userEvent.setup();
      renderAt('/', <div>Test Content</div>);
      await user.click(screen.getByTestId('bottom-bar-more'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      resizeTo(true);
      expect(screen.queryByTestId('more-sheet')).toBeNull();
      expect(screen.getByRole('complementary')).toBeInTheDocument();

      resizeTo(false);
      expect(screen.getByTestId('more-sheet')).toHaveAttribute('data-open', 'false');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByTestId('top-bar').parentElement).not.toHaveAttribute('inert');
    });

    it('has exactly one Log out, inside the sheet', async () => {
      const user = userEvent.setup();
      renderAt('/', <div>Test Content</div>);
      await user.click(screen.getByTestId('bottom-bar-more'));

      expect(screen.getAllByRole('button', { name: 'Log out' })).toHaveLength(1);
      expect(
        within(screen.getByTestId('more-sheet')).getByRole('button', { name: 'Log out' }),
      ).toBeInTheDocument();
    });

    it('has exactly one current page on a Tasks list: the More sheet row (and More)', () => {
      const { container } = renderAt('/project/work-items', <div>Test Content</div>);

      const current = Array.from(container.querySelectorAll('[aria-current="page"]'));
      expect(current).toHaveLength(1);
      expect(current[0]).toBe(screen.getByTestId('more-sheet-section-tasks'));
      expect(screen.getByTestId('bottom-bar-more')).toHaveAttribute('aria-current', 'true');
    });

    it('highlights the Home slot on the home page', () => {
      renderAt('/', <div>Test Content</div>);

      expect(screen.getByTestId('bottom-bar-home')).toHaveAttribute('aria-current', 'page');
      expect(screen.getByTestId('bottom-bar-more')).not.toHaveAttribute('aria-current');
    });

    it('highlights nothing on an unknown route', () => {
      const { container } = renderAt('/no/such/page', <div>Test Content</div>);

      expect(container.querySelectorAll('[aria-current]')).toHaveLength(0);
    });

    it('has no duplicate test ids', () => {
      const { container } = renderAt('/project/work-items', <div>Test Content</div>);

      expect(findDuplicateTestIds(container)).toEqual([]);
    });

    it('lets the More sheet open the shortcuts help with a hardware keyboard', async () => {
      installMatchMedia(false, true);
      const user = userEvent.setup();
      renderAt('/', <PageWithShortcuts />);
      await user.click(screen.getByTestId('bottom-bar-more'));

      await user.click(screen.getByTestId('more-sheet-shortcuts'));

      expect(screen.queryByTestId('more-sheet')).toHaveAttribute('data-open', 'false');
      expect(
        within(screen.getByRole('dialog')).getByText('New synthetic task'),
      ).toBeInTheDocument();
    });

    it('renders no More sheet user block without a signed-in user and gives no view menu', async () => {
      mockRole = null;
      const user = userEvent.setup();
      renderAt('/project/work-items', <ViewMenuProbe />);
      await user.click(screen.getByTestId('bottom-bar-more'));

      expect(screen.queryByTestId('more-sheet-user')).toBeNull();
      expect(screen.getByTestId('view-menu-probe')).toHaveTextContent('none');
    });

    describe('view menu for pages', () => {
      it('is provided on a section main view', () => {
        renderAt('/project/work-items', <ViewMenuProbe />);

        expect(screen.getByTestId('view-menu-probe')).toHaveTextContent('workItems:4');
      });

      it('is provided on a section view, with that view current', () => {
        renderAt('/schedule/gantt', <ViewMenuProbe />);

        expect(screen.getByTestId('view-menu-probe')).toHaveTextContent('scheduleGantt:4');
      });

      it('is absent on a detail page', () => {
        renderAt('/project/work-items/w-1', <ViewMenuProbe />);

        expect(screen.getByTestId('view-menu-probe')).toHaveTextContent('none');
      });

      it('is absent on a section without views', () => {
        renderAt('/photos', <ViewMenuProbe />);

        expect(screen.getByTestId('view-menu-probe')).toHaveTextContent('none');
      });

      it('hides admin-only views from a member', () => {
        mockRole = 'member';
        renderAt('/settings/manage', <ViewMenuProbe />);

        expect(screen.getByTestId('view-menu-probe')).toHaveTextContent('settingsManage:2');
      });
    });

    describe('compact breadcrumbs', () => {
      it('hosts one compact Back row in the bar slot, never inside the page', async () => {
        renderAt('/project/work-items/w-1', <PageBreadcrumbs />);

        const slot = screen.getByTestId('top-bar-slot');
        await waitFor(() => expect(within(slot).getByTestId('breadcrumbs')).toBeInTheDocument());
        expect(within(slot).getByTestId('breadcrumbs')).toHaveClass('rowCompact');
        expect(within(screen.getByRole('main')).queryByTestId('breadcrumbs')).toBeNull();
        expect(screen.getAllByRole('navigation', { name: 'You are here' })).toHaveLength(1);
      });

      describe('history-back rule through the shell', () => {
        const originalState: unknown = window.history.state;

        afterEach(() => {
          window.history.replaceState(originalState, '');
        });

        function Where() {
          const { pathname } = useLocation();
          const type = useNavigationType();
          return <p data-testid="where">{`${type} ${pathname}`}</p>;
        }

        // MemoryRouter does not write history.state, so a push bumps the entry index by hand
        // the way BrowserRouter does.
        function Walker({ steps }: { steps: readonly string[] }) {
          const navigate = useNavigate();
          return (
            <>
              {steps.map((step) => (
                <button
                  key={step}
                  type="button"
                  data-testid={`walk-${step}`}
                  onClick={() => {
                    const state = window.history.state as { idx: number };
                    window.history.replaceState({ idx: state.idx + 1 }, '');
                    void navigate(step);
                  }}
                >
                  {step}
                </button>
              ))}
              <PageBreadcrumbs />
              <Where />
            </>
          );
        }

        it('pops back when the previous in-app page is the target (Tasks list, then a task)', async () => {
          window.history.replaceState({ idx: 0 }, '');
          const user = userEvent.setup();
          renderAt('/project/work-items', <Walker steps={['/project/work-items/w-1']} />);
          await user.click(screen.getByTestId('walk-/project/work-items/w-1'));
          await user.click(await screen.findByTestId('breadcrumbs-parent'));

          expect(screen.getByTestId('where')).toHaveTextContent('POP /project/work-items');
        });

        it('pushes the target when the previous page was another one (Schedule, then a task)', async () => {
          window.history.replaceState({ idx: 0 }, '');
          const user = userEvent.setup();
          renderAt('/schedule/gantt', <Walker steps={['/project/work-items/w-1']} />);
          await user.click(screen.getByTestId('walk-/project/work-items/w-1'));
          await user.click(await screen.findByTestId('breadcrumbs-parent'));

          expect(screen.getByTestId('where')).toHaveTextContent('PUSH /project/work-items');
        });

        it('pushes the target when the task is the first entry of the session (idx 0)', async () => {
          window.history.replaceState({ idx: 0 }, '');
          const user = userEvent.setup();
          renderAt('/project/work-items/w-1', <Walker steps={[]} />);
          await user.click(await screen.findByTestId('breadcrumbs-parent'));

          expect(screen.getByTestId('where')).toHaveTextContent('PUSH /project/work-items');
        });

        it('pushes the target when the previous entry is unknown (reload at idx 2)', async () => {
          window.history.replaceState({ idx: 2 }, '');
          const user = userEvent.setup();
          renderAt('/project/work-items/w-1', <Walker steps={[]} />);
          await user.click(await screen.findByTestId('breadcrumbs-parent'));

          expect(screen.getByTestId('where')).toHaveTextContent('PUSH /project/work-items');
        });
      });
    });
  });
});
