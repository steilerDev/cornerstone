/**
 * @jest-environment jsdom
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from './AppShell';
import { renderWithRouter } from '../../test/testUtils';

describe('AppShell', () => {
  it('renders sidebar, header, and outlet area', () => {
    renderWithRouter(
      <Routes>
        <Route element={<AppShell />} path="*">
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
        <Route element={<AppShell />} path="*">
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
        <Route element={<AppShell />} path="*">
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
        <Route element={<AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    // All navigation links should be present
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /work items/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /budget/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /timeline/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /household items/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /documents/i })).toBeInTheDocument();
  });

  it('renders header with menu toggle button', () => {
    renderWithRouter(
      <Routes>
        <Route element={<AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    const menuButton = screen.getByRole('button', { name: /toggle navigation menu/i });
    expect(menuButton).toBeInTheDocument();
  });

  it('overlay is not visible initially (sidebar starts closed)', () => {
    renderWithRouter(
      <Routes>
        <Route element={<AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    // Overlay should not exist in DOM when sidebar is closed
    const overlay = document.querySelector('[aria-hidden="true"]');
    expect(overlay).not.toBeInTheDocument();
  });

  it('clicking menu button toggles sidebar open (overlay becomes visible)', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <Routes>
        <Route element={<AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    const menuButton = screen.getByRole('button', { name: /toggle navigation menu/i });
    await user.click(menuButton);

    // Overlay should now exist in DOM
    const overlay = document.querySelector('[aria-hidden="true"]');
    expect(overlay).toBeInTheDocument();
  });

  it('clicking overlay closes the sidebar', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <Routes>
        <Route element={<AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    // Open sidebar
    const menuButton = screen.getByRole('button', { name: /toggle navigation menu/i });
    await user.click(menuButton);

    // Verify overlay exists
    let overlay = document.querySelector('[aria-hidden="true"]');
    expect(overlay).toBeInTheDocument();

    // Click overlay to close
    await user.click(overlay as HTMLElement);

    // Overlay should be removed
    overlay = document.querySelector('[aria-hidden="true"]');
    expect(overlay).not.toBeInTheDocument();
  });

  it('pressing Escape key closes the sidebar when open', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <Routes>
        <Route element={<AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    // Open sidebar
    const menuButton = screen.getByRole('button', { name: /toggle navigation menu/i });
    await user.click(menuButton);

    // Verify overlay exists
    let overlay = document.querySelector('[aria-hidden="true"]');
    expect(overlay).toBeInTheDocument();

    // Press Escape
    await user.keyboard('{Escape}');

    // Overlay should be removed
    overlay = document.querySelector('[aria-hidden="true"]');
    expect(overlay).not.toBeInTheDocument();
  });

  it('sidebar receives isOpen prop correctly when toggled', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <Routes>
        <Route element={<AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    const sidebar = screen.getByRole('complementary');

    // Initially sidebar should not have 'open' class
    expect(sidebar.className).not.toMatch(/open/);

    // Toggle sidebar open
    const menuButton = screen.getByRole('button', { name: /toggle navigation menu/i });
    await user.click(menuButton);

    // Sidebar should now have 'open' class
    expect(sidebar.className).toMatch(/open/);
  });

  it('multiple toggles work (open/close/open)', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <Routes>
        <Route element={<AppShell />} path="*">
          <Route index element={<div>Test Content</div>} />
        </Route>
      </Routes>,
    );

    const menuButton = screen.getByRole('button', { name: /toggle navigation menu/i });

    // Open
    await user.click(menuButton);
    let overlay = document.querySelector('[aria-hidden="true"]');
    expect(overlay).toBeInTheDocument();

    // Close
    await user.click(menuButton);
    overlay = document.querySelector('[aria-hidden="true"]');
    expect(overlay).not.toBeInTheDocument();

    // Open again
    await user.click(menuButton);
    overlay = document.querySelector('[aria-hidden="true"]');
    expect(overlay).toBeInTheDocument();
  });
});
