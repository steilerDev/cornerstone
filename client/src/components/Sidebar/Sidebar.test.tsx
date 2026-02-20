/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRouter } from '../../test/testUtils.js';
import type * as SidebarTypes from './Sidebar.js';

// Mock the AuthContext BEFORE importing Sidebar
const mockLogout = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

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

describe('Sidebar', () => {
  let SidebarModule: typeof SidebarTypes;
  let mockOnClose: jest.MockedFunction<() => void>;

  beforeEach(async () => {
    if (!SidebarModule) {
      SidebarModule = await import('./Sidebar.js');
    }
    mockOnClose = jest.fn<() => void>();
    mockLogout.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const getDefaultProps = () => ({
    isOpen: false,
    onClose: mockOnClose,
  });

  it('renders all 9 navigation links plus 1 GitHub footer link', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const links = screen.getAllByRole('link');
    // 9 nav links + 1 GitHub link in the footer
    expect(links).toHaveLength(10);
  });

  it('renders navigation with correct aria-label', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const nav = screen.getByRole('navigation', { name: /main navigation/i });
    expect(nav).toBeInTheDocument();
  });

  it('links have correct href attributes', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /work items/i })).toHaveAttribute(
      'href',
      '/work-items',
    );
    expect(screen.getByRole('link', { name: /budget categories/i })).toHaveAttribute(
      'href',
      '/budget/categories',
    );
    expect(screen.getByRole('link', { name: /timeline/i })).toHaveAttribute('href', '/timeline');
    expect(screen.getByRole('link', { name: /household items/i })).toHaveAttribute(
      'href',
      '/household-items',
    );
    expect(screen.getByRole('link', { name: /documents/i })).toHaveAttribute('href', '/documents');
  });

  it('dashboard link is active at exact / path only (end prop)', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />, { initialEntries: ['/'] });

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashboardLink).toHaveClass('active');

    // Other links should not be active
    expect(screen.getByRole('link', { name: /work items/i })).not.toHaveClass('active');
  });

  it('dashboard link is not active on nested routes', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />, {
      initialEntries: ['/work-items'],
    });

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    expect(dashboardLink).not.toHaveClass('active');
  });

  it('work items link is active at /work-items', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />, {
      initialEntries: ['/work-items'],
    });

    const workItemsLink = screen.getByRole('link', { name: /work items/i });
    expect(workItemsLink).toHaveClass('active');

    // Dashboard should not be active
    expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveClass('active');
  });

  it('budget categories link is active at /budget/categories', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />, {
      initialEntries: ['/budget/categories'],
    });

    const budgetLink = screen.getByRole('link', { name: /budget categories/i });
    expect(budgetLink).toHaveClass('active');
  });

  it('timeline link is active at /timeline', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />, {
      initialEntries: ['/timeline'],
    });

    const timelineLink = screen.getByRole('link', { name: /timeline/i });
    expect(timelineLink).toHaveClass('active');
  });

  it('household items link is active at /household-items', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />, {
      initialEntries: ['/household-items'],
    });

    const householdItemsLink = screen.getByRole('link', { name: /household items/i });
    expect(householdItemsLink).toHaveClass('active');
  });

  it('documents link is active at /documents', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />, {
      initialEntries: ['/documents'],
    });

    const documentsLink = screen.getByRole('link', { name: /documents/i });
    expect(documentsLink).toHaveClass('active');
  });

  it('only one link is active at a time', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />, {
      initialEntries: ['/budget/categories'],
    });

    const activeLinks = screen
      .getAllByRole('link')
      .filter((link) => link.classList.contains('active'));
    expect(activeLinks).toHaveLength(1);
    expect(activeLinks[0]).toHaveTextContent(/budget categories/i);
  });

  it('renders a close button with correct aria-label', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} isOpen={true} />);

    const closeButton = screen.getByRole('button', { name: /close menu/i });
    expect(closeButton).toBeInTheDocument();
  });

  it('clicking close button calls onClose', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} isOpen={true} />);

    const closeButton = screen.getByRole('button', { name: /close menu/i });
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('sidebar has .open class when isOpen is true', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} isOpen={true} />);

    const sidebar = screen.getByRole('complementary');
    expect(sidebar.className).toMatch(/open/);
  });

  it('sidebar does not have .open class when isOpen is false', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} isOpen={false} />);

    const sidebar = screen.getByRole('complementary');
    expect(sidebar.className).not.toMatch(/open/);
  });

  it('clicking a nav link calls onClose (dashboard)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
    await user.click(dashboardLink);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('clicking a nav link calls onClose (work items)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const workItemsLink = screen.getByRole('link', { name: /work items/i });
    await user.click(workItemsLink);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('clicking a nav link calls onClose (budget categories)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const budgetLink = screen.getByRole('link', { name: /budget categories/i });
    await user.click(budgetLink);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('clicking a nav link calls onClose (timeline)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const timelineLink = screen.getByRole('link', { name: /timeline/i });
    await user.click(timelineLink);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('clicking a nav link calls onClose (household items)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const householdItemsLink = screen.getByRole('link', { name: /household items/i });
    await user.click(householdItemsLink);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('clicking a nav link calls onClose (documents)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const documentsLink = screen.getByRole('link', { name: /documents/i });
    await user.click(documentsLink);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('user management link has correct href attribute', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    expect(screen.getByRole('link', { name: /user management/i })).toHaveAttribute(
      'href',
      '/admin/users',
    );
  });

  it('user management link is active at /admin/users', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />, {
      initialEntries: ['/admin/users'],
    });

    const userManagementLink = screen.getByRole('link', { name: /user management/i });
    expect(userManagementLink).toHaveClass('active');
  });

  it('clicking user management link calls onClose', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const userManagementLink = screen.getByRole('link', { name: /user management/i });
    await user.click(userManagementLink);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('renders a logout button', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });

  it('clicking logout button calls logout from context', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const logoutButton = screen.getByRole('button', { name: /logout/i });
    await user.click(logoutButton);

    // Wait for async logout to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('clicking logout button calls onClose after logout', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const logoutButton = screen.getByRole('button', { name: /logout/i });
    await user.click(logoutButton);

    // Wait for async logout to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('onClose is called after logout completes, not before', async () => {
    const user = userEvent.setup();
    let resolveLogout: () => void;
    const logoutPromise = new Promise<void>((resolve) => {
      resolveLogout = resolve;
    });
    mockLogout.mockReturnValue(logoutPromise);

    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const logoutButton = screen.getByRole('button', { name: /logout/i });
    await user.click(logoutButton);

    // onClose should not be called yet
    expect(mockOnClose).not.toHaveBeenCalled();

    // Resolve logout
    resolveLogout!();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Now onClose should be called
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('logout button does not interfere with navigation link count', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const links = screen.getAllByRole('link');
    const buttons = screen.getAllByRole('button');

    // 9 nav links + 1 GitHub link in the footer
    expect(links).toHaveLength(10);
    // 3 buttons: close button + theme toggle + logout button
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAttribute('aria-label', 'Close menu');
    expect(buttons[2]).toHaveTextContent(/logout/i);
  });
});
