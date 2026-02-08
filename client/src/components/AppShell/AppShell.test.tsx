import { screen } from '@testing-library/react';
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
});
