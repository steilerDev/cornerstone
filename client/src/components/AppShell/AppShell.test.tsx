/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type React from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { renderWithRouter } from '../../test/testUtils';
import i18n from '../../i18n/index.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts.js';
import type * as AppShellTypes from './AppShell.js';

// Mock AuthContext so Sidebar can call useAuth()
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({
    user: {
      id: '1',
      email: 'test@example.com',
      displayName: 'Test',
      role: 'admin',
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

// Mock ThemeContext so ThemeToggle (inside Sidebar) and the user menu can call useTheme()
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

describe('AppShell', () => {
  let AppShellModule: typeof AppShellTypes;

  beforeEach(async () => {
    if (!AppShellModule) {
      AppShellModule = await import('./AppShell.js');
    }
  });

  it('renders sidebar, floating menu button, and outlet area', () => {
    renderWithRouter(
      <Routes>
        <Route element={<AppShellModule.AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    // Sidebar should be present
    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toBeInTheDocument();

    // Floating menu button (FAB) should be present
    const fab = screen.getByTestId('menu-fab');
    expect(fab).toBeInTheDocument();

    // Main content area should be present
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();

    // Outlet content should render
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('shows "Loading..." fallback while lazy component loads', async () => {
    // Create a lazy component that takes time to resolve
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

    renderWithRouter(
      <Routes>
        <Route element={<AppShellModule.AppShell />} path="*">
          <Route index element={<LazyComponent />} />
        </Route>
      </Routes>,
    );

    // Loading fallback should be visible initially
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Wait for lazy component to resolve and replace the fallback
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    expect(screen.getByText('Loaded Content')).toBeInTheDocument();
  });

  it('sidebar is always visible', () => {
    renderWithRouter(
      <Routes>
        <Route element={<AppShellModule.AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    const sidebar = screen.getByRole('complementary');
    expect(sidebar).toBeVisible();
  });

  it('renders navigation links in sidebar', () => {
    renderWithRouter(
      <Routes>
        <Route element={<AppShellModule.AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    // All navigation links should be present
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

  it('renders floating menu button for mobile sidebar toggle', () => {
    renderWithRouter(
      <Routes>
        <Route element={<AppShellModule.AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    const fab = screen.getByTestId('menu-fab');
    expect(fab).toBeInTheDocument();
    expect(fab).toHaveAttribute('type', 'button');
  });

  it('floating menu button has data-testid and type="button"', () => {
    renderWithRouter(
      <Routes>
        <Route element={<AppShellModule.AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    const fab = screen.getByTestId('menu-fab');
    expect(fab).toBeInTheDocument();
    expect(fab).toHaveAttribute('type', 'button');
    expect(fab).toHaveAttribute('aria-label', 'Open menu');
  });

  it('overlay is not visible initially (sidebar starts closed)', () => {
    renderWithRouter(
      <Routes>
        <Route element={<AppShellModule.AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    // Overlay should not exist in DOM when sidebar is closed
    const overlay = document.querySelector('[data-testid="sidebar-overlay"]');
    expect(overlay).not.toBeInTheDocument();
  });

  it('clicking menu button toggles sidebar open (overlay becomes visible)', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <Routes>
        <Route element={<AppShellModule.AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    const menuButton = screen.getByRole('button', { name: /open menu/i });
    await user.click(menuButton);

    // Overlay should now exist in DOM
    const overlay = document.querySelector('[data-testid="sidebar-overlay"]');
    expect(overlay).toBeInTheDocument();
  });

  it('clicking overlay closes the sidebar', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <Routes>
        <Route element={<AppShellModule.AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    // Open sidebar
    const menuButton = screen.getByRole('button', { name: /open menu/i });
    await user.click(menuButton);

    // Verify overlay exists
    let overlay = document.querySelector('[data-testid="sidebar-overlay"]');
    expect(overlay).toBeInTheDocument();

    // Click overlay to close
    await user.click(overlay as HTMLElement);

    // Overlay should be removed
    overlay = document.querySelector('[data-testid="sidebar-overlay"]');
    expect(overlay).not.toBeInTheDocument();
  });

  it('pressing Escape key closes the sidebar when open', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <Routes>
        <Route element={<AppShellModule.AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    // Open sidebar
    const menuButton = screen.getByRole('button', { name: /open menu/i });
    await user.click(menuButton);

    // Verify overlay exists
    let overlay = document.querySelector('[data-testid="sidebar-overlay"]');
    expect(overlay).toBeInTheDocument();

    // Press Escape
    await user.keyboard('{Escape}');

    // Overlay should be removed
    overlay = document.querySelector('[data-testid="sidebar-overlay"]');
    expect(overlay).not.toBeInTheDocument();
  });

  it('sidebar receives isOpen prop correctly when toggled', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <Routes>
        <Route element={<AppShellModule.AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    const sidebar = screen.getByRole('complementary');

    // Initially sidebar should not have 'open' class
    expect(sidebar.className).not.toMatch(/open/);

    // Toggle sidebar open
    const menuButton = screen.getByRole('button', { name: /open menu/i });
    await user.click(menuButton);

    // Sidebar should now have 'open' class
    expect(sidebar.className).toMatch(/open/);
  });

  it('multiple toggles work (open/close/open)', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <Routes>
        <Route element={<AppShellModule.AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    let menuButton = screen.getByRole('button', { name: /open menu/i });

    // Open
    await user.click(menuButton);
    let overlay = document.querySelector('[data-testid="sidebar-overlay"]');
    expect(overlay).toBeInTheDocument();

    // FAB button should now say "Close menu"
    menuButton = screen.getByTestId('menu-fab');
    expect(menuButton).toHaveAttribute('aria-label', 'Close menu');

    // Close
    await user.click(menuButton);
    overlay = document.querySelector('[data-testid="sidebar-overlay"]');
    expect(overlay).not.toBeInTheDocument();

    // Button should now say "Open menu" again
    menuButton = screen.getByRole('button', { name: /open menu/i });

    // Open again
    await user.click(menuButton);
    overlay = document.querySelector('[data-testid="sidebar-overlay"]');
    expect(overlay).toBeInTheDocument();
  });

  it('menu button icon changes from ☰ to ✕ when sidebar opens', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <Routes>
        <Route element={<AppShellModule.AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    // Initially FAB shows hamburger icon
    const fab = screen.getByTestId('menu-fab');
    expect(fab).toHaveTextContent('☰');

    // Click to open
    await user.click(fab);

    // FAB button should now show close icon
    const fabAfterOpen = screen.getByTestId('menu-fab');
    expect(fabAfterOpen).toHaveTextContent('✕');
  });

  it('menu button aria-label changes from "Open menu" to "Close menu" when sidebar opens', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <Routes>
        <Route element={<AppShellModule.AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    // Initially FAB has "Open menu" label
    const fab = screen.getByTestId('menu-fab');
    expect(fab).toHaveAttribute('aria-label', 'Open menu');

    // Click to open
    await user.click(fab);

    // FAB button should now have "Close menu" label
    const fabAfterOpen = screen.getByTestId('menu-fab');
    expect(fabAfterOpen).toHaveAttribute('aria-label', 'Close menu');
  });
  describe('top bar and structure (#2206)', () => {
    const originalMatchMedia = window.matchMedia;

    function setWide(wide: boolean) {
      window.matchMedia = (query: string): MediaQueryList =>
        ({
          matches: wide && query === '(min-width: 1024px)',
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList;
    }

    afterEach(async () => {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
      window.matchMedia = originalMatchMedia;
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

    it('renders exactly one banner, and it is the top bar', () => {
      renderAt('/', <div>Test Content</div>);

      expect(screen.getAllByRole('banner')).toHaveLength(1);
      expect(screen.getByRole('banner')).toBe(screen.getByTestId('top-bar'));
    });

    it('places the bar beside the scroll wrapper, never inside it (it must stay sticky)', () => {
      renderAt('/', <div>Test Content</div>);

      const bar = screen.getByTestId('top-bar');
      const main = screen.getByRole('main');
      const scrollWrapper = main.parentElement as HTMLElement;
      expect(scrollWrapper).toHaveClass('mainContent');
      expect(scrollWrapper.contains(bar)).toBe(false);
      expect(bar.parentElement).toHaveClass('shellColumn');
      expect(scrollWrapper.parentElement).toBe(bar.parentElement);
      expect(bar.nextElementSibling).toBe(scrollWrapper);
    });

    it('keeps the sidebar and the floating button outside the column', () => {
      renderAt('/', <div>Test Content</div>);

      const column = screen.getByTestId('top-bar').parentElement as HTMLElement;
      expect(column.contains(screen.getByRole('complementary'))).toBe(false);
      expect(column.contains(screen.getByTestId('menu-fab'))).toBe(false);
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

    it('hosts the page breadcrumbs in the bar slot when wide, so only one row exists', async () => {
      setWide(true);
      renderAt('/project/work-items/w-1', <PageBreadcrumbs />);

      const slot = screen.getByTestId('top-bar-slot');
      await waitFor(() => expect(within(slot).getByTestId('breadcrumbs')).toBeInTheDocument());
      expect(within(screen.getByRole('main')).queryByTestId('breadcrumbs')).toBeNull();
      expect(screen.getAllByRole('navigation', { name: 'You are here' })).toHaveLength(1);
    });

    it('keeps the page breadcrumbs inside the page when narrow', () => {
      setWide(false);
      renderAt('/project/work-items/w-1', <PageBreadcrumbs />);

      expect(within(screen.getByRole('main')).getByTestId('breadcrumbs')).toBeInTheDocument();
      expect(within(screen.getByTestId('top-bar-slot')).queryByTestId('breadcrumbs')).toBeNull();
    });
  });
});
