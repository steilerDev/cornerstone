/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type * as AuthApiTypes from '../../lib/authApi.js';
import type * as AuthGuardTypes from './AuthGuard.js';

const mockGetAuthMe = jest.fn<typeof AuthApiTypes.getAuthMe>();
const mockLogout = jest.fn<typeof AuthApiTypes.logout>();

// Must mock BEFORE importing the component
jest.unstable_mockModule('../../lib/authApi.js', () => ({
  getAuthMe: mockGetAuthMe,
  logout: mockLogout,
}));

describe('AuthGuard', () => {
  // Dynamic imports
  let AuthGuard: typeof AuthGuardTypes.AuthGuard;

  beforeEach(async () => {
    // Dynamic import modules (only once)
    if (!AuthGuard) {
      const authGuardModule = await import('./AuthGuard.js');
      AuthGuard = authGuardModule.AuthGuard;
    }

    // Reset mocks
    mockGetAuthMe.mockReset();
    mockLogout.mockReset();
  });

  function renderWithRouter(initialRoute = '/') {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/setup" element={<div>Setup Page</div>} />
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<AuthGuard />}>
            <Route path="/" element={<div>Protected Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  it('shows loading state initially', () => {
    // Given: getAuthMe is pending
    mockGetAuthMe.mockImplementation(() => new Promise(() => {}));

    // When: Rendering AuthGuard
    renderWithRouter();

    // Then: Loading state is shown
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('redirects to /setup when setupRequired is true', async () => {
    // Given: Setup is required
    mockGetAuthMe.mockResolvedValue({
      user: null,
      setupRequired: true,
      oidcEnabled: false,
    });

    // When: Rendering AuthGuard
    renderWithRouter();

    // Then: Redirects to setup page
    await waitFor(() => {
      expect(screen.getByText('Setup Page')).toBeInTheDocument();
    });
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects to /login when user is not authenticated', async () => {
    // Given: User is not authenticated
    mockGetAuthMe.mockResolvedValue({
      user: null,
      setupRequired: false,
      oidcEnabled: false,
    });

    // When: Rendering AuthGuard
    renderWithRouter();

    // Then: Redirects to login page
    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders children (Outlet) when user is authenticated', async () => {
    // Given: User is authenticated
    mockGetAuthMe.mockResolvedValue({
      user: {
        id: 'user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'member',
        authProvider: 'local',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        deactivatedAt: null,
      },
      setupRequired: false,
      oidcEnabled: false,
    });

    // When: Rendering AuthGuard
    renderWithRouter();

    // Then: Protected content is shown
    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Setup Page')).not.toBeInTheDocument();
  });

  it('treats API errors as not authenticated', async () => {
    // Given: getAuthMe fails
    mockGetAuthMe.mockRejectedValue(new Error('Network error'));

    // When: Rendering AuthGuard
    renderWithRouter();

    // Then: Redirects to login page
    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('loading state shows spinner', () => {
    // Given: getAuthMe is pending
    mockGetAuthMe.mockImplementation(() => new Promise(() => {}));

    // When: Rendering AuthGuard
    const { container } = renderWithRouter();

    // Then: Spinner element is present
    const spinner = container.querySelector('.spinner');
    expect(spinner).toBeInTheDocument();
  });
});
