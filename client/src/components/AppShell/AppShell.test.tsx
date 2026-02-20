/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { renderWithRouter } from '../../test/testUtils';
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

// Mock ThemeContext so ThemeToggle (inside Sidebar) can call useTheme()
jest.unstable_mockModule('../../contexts/ThemeContext.js', () => ({
  useTheme: () => ({
    theme: 'system',
    resolvedTheme: 'light',
    setTheme: jest.fn(),
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('AppShell', () => {
  let AppShellModule: typeof AppShellTypes;

  beforeEach(async () => {
    if (!AppShellModule) {
      AppShellModule = await import('./AppShell.js');
    }
  });

  it('renders sidebar, header, and outlet area', () => {
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

    // Header should be present
    const header = screen.getByRole('banner');
    expect(header).toBeInTheDocument();

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
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /work items/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /budget categories/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /budget sources/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /timeline/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /household items/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /documents/i })).toBeInTheDocument();
  });

  it('renders header with menu toggle button', () => {
    renderWithRouter(
      <Routes>
        <Route element={<AppShellModule.AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    const menuButton = screen.getByRole('button', { name: /open menu/i });
    expect(menuButton).toBeInTheDocument();
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

    // Header button should now say "Close menu"
    const header = screen.getByRole('banner');
    menuButton = within(header).getByRole('button', { name: /close menu/i });

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

    // Initially button shows hamburger icon
    let menuButton = screen.getByRole('button', { name: /open menu/i });
    expect(menuButton).toHaveTextContent('☰');

    // Click to open
    await user.click(menuButton);

    // Header button should now show close icon
    const header = screen.getByRole('banner');
    menuButton = within(header).getByRole('button', { name: /close menu/i });
    expect(menuButton).toHaveTextContent('✕');
  });

  it('clicking close button inside sidebar closes the sidebar', async () => {
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

    // Sidebar should be open
    const sidebar = screen.getByRole('complementary');
    expect(sidebar.className).toMatch(/open/);

    // Click the close button inside the sidebar
    const closeButton = within(sidebar).getByRole('button', { name: /close menu/i });
    await user.click(closeButton);

    // Sidebar should be closed
    expect(sidebar.className).not.toMatch(/open/);

    // Overlay should be removed
    const overlay = document.querySelector('[data-testid="sidebar-overlay"]');
    expect(overlay).not.toBeInTheDocument();
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

    // Initially button has "Open menu" label
    let menuButton = screen.getByRole('button', { name: /open menu/i });
    expect(menuButton).toHaveAttribute('aria-label', 'Open menu');

    // Click to open
    await user.click(menuButton);

    // Header button should now have "Close menu" label
    const header = screen.getByRole('banner');
    menuButton = within(header).getByRole('button', { name: /close menu/i });
    expect(menuButton).toHaveAttribute('aria-label', 'Close menu');
  });
});
