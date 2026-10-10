/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lazy, use } from 'react';
import { Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { renderWithRouter } from '../../test/testUtils';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds';
import i18n from '../../i18n/index.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { ViewMenuContext } from '../../navigation/viewMenu.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts.js';
import type * as AppShellTypes from './AppShell.js';

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

    it('shows the empty-shortcuts message on a page that registered none', async () => {
      const user = userEvent.setup();
      renderAt('/', <div>Test Content</div>);

      await user.click(screen.getByTestId('user-menu-trigger'));
      await user.click(screen.getByTestId('user-menu-shortcuts'));

      expect(
        within(screen.getByRole('dialog')).getByText('This page has no shortcuts of its own.'),
      ).toBeInTheDocument();
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
