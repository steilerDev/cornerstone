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

  it('renders all 5 navigation links plus 1 logo link plus 1 GitHub footer link', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const links = screen.getAllByRole('link');
    // 3 main nav links (Project, Budget, Schedule) + 1 footer nav (Settings)
    // + 1 logo link (Go to project overview) + 1 GitHub link in the footer
    expect(links).toHaveLength(6);
  });

  it('logo link navigates to /project and has aria-label', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const logoLink = screen.getByRole('link', { name: /go to project overview/i });
    expect(logoLink).toBeInTheDocument();
    expect(logoLink).toHaveAttribute('href', '/project');
  });

  it('renders navigation with correct aria-label', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const nav = screen.getByRole('navigation', { name: /main navigation/i });
    expect(nav).toBeInTheDocument();
  });

  it('links have correct href attributes', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    expect(screen.getByRole('link', { name: /^project$/i })).toHaveAttribute('href', '/project');
    expect(screen.getByRole('link', { name: /^budget$/i })).toHaveAttribute('href', '/budget');
    expect(screen.getByRole('link', { name: /^schedule$/i })).toHaveAttribute('href', '/schedule');
    expect(screen.getByRole('link', { name: /^settings$/i })).toHaveAttribute('href', '/settings');
  });

  it('project link is active at /project', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />, {
      initialEntries: ['/project'],
    });

    const projectLink = screen.getByRole('link', { name: /^project$/i });
    expect(projectLink).toHaveClass('active');
  });

  it('project link is active on nested project routes', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />, {
      initialEntries: ['/project/work-items'],
    });

    const projectLink = screen.getByRole('link', { name: /^project$/i });
    expect(projectLink).toHaveClass('active');
  });

  it('budget link is active at /budget', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />, {
      initialEntries: ['/budget'],
    });

    const budgetLink = screen.getByRole('link', { name: /^budget$/i });
    expect(budgetLink).toHaveClass('active');
  });

  it('schedule link is active at /schedule', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />, {
      initialEntries: ['/schedule'],
    });

    const scheduleLink = screen.getByRole('link', { name: /^schedule$/i });
    expect(scheduleLink).toHaveClass('active');
  });

  it('settings link is active at /settings', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />, {
      initialEntries: ['/settings'],
    });

    const settingsLink = screen.getByRole('link', { name: /^settings$/i });
    expect(settingsLink).toHaveClass('active');
  });

  it('only one link is active at a time', () => {
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />, {
      initialEntries: ['/budget'],
    });

    const activeLinks = screen
      .getAllByRole('link')
      .filter((link) => link.classList.contains('active'));
    expect(activeLinks).toHaveLength(1);
    expect(activeLinks[0]).toHaveTextContent(/^budget$/i);
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

  it('clicking a nav link calls onClose (project)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const projectLink = screen.getByRole('link', { name: /^project$/i });
    await user.click(projectLink);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('clicking a nav link calls onClose (budget)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const budgetLink = screen.getByRole('link', { name: /^budget$/i });
    await user.click(budgetLink);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('clicking a nav link calls onClose (schedule)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const scheduleLink = screen.getByRole('link', { name: /^schedule$/i });
    await user.click(scheduleLink);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('clicking settings link calls onClose', async () => {
    const user = userEvent.setup();
    renderWithRouter(<SidebarModule.Sidebar {...getDefaultProps()} />);

    const settingsLink = screen.getByRole('link', { name: /^settings$/i });
    await user.click(settingsLink);

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

    // 3 main nav links (Project, Budget, Schedule) + 1 footer nav (Settings)
    // + 1 logo link + 1 GitHub link
    expect(links).toHaveLength(6);
    // 3 buttons: close button + theme toggle + logout button
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAttribute('aria-label', 'Close menu');
    expect(buttons[2]).toHaveTextContent(/logout/i);
  });
});
