/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { ReactNode } from 'react';
import type * as AuthApiTypes from '../lib/authApi.js';
import type * as AuthContextTypes from './AuthContext.js';

// Must mock BEFORE importing the component
jest.unstable_mockModule('../lib/authApi.js', () => ({
  getAuthMe: jest.fn(),
  logout: jest.fn(),
}));

describe('AuthContext', () => {
  // Dynamic imports
  let authApi: typeof AuthApiTypes;
  let AuthContext: typeof AuthContextTypes;

  let mockGetAuthMe: jest.MockedFunction<typeof AuthApiTypes.getAuthMe>;
  let mockLogout: jest.MockedFunction<typeof AuthApiTypes.logout>;

  beforeEach(async () => {
    // Dynamic import modules (only once)
    if (!authApi) {
      authApi = await import('../lib/authApi.js');
      AuthContext = await import('./AuthContext.js');
    }

    // Reset mocks
    mockGetAuthMe = authApi.getAuthMe as jest.MockedFunction<typeof authApi.getAuthMe>;
    mockLogout = authApi.logout as jest.MockedFunction<typeof authApi.logout>;
    mockGetAuthMe.mockReset();
    mockLogout.mockReset();
  });

  function TestComponent() {
    const { user, oidcEnabled, isLoading, error, logout } = AuthContext.useAuth();
    return (
      <div>
        <div data-testid="loading">{isLoading ? 'Loading' : 'Loaded'}</div>
        <div data-testid="user">{user ? user.email : 'No user'}</div>
        <div data-testid="oidc">{oidcEnabled ? 'OIDC Enabled' : 'OIDC Disabled'}</div>
        {error && <div data-testid="error">{error}</div>}
        <button
          onClick={() => {
            void logout();
          }}
        >
          Logout
        </button>
      </div>
    );
  }

  function renderWithProvider(children: ReactNode = <TestComponent />) {
    const { AuthProvider } = AuthContext;
    return render(<AuthProvider>{children}</AuthProvider>);
  }

  it('provides loading state initially', () => {
    // Given: getAuthMe is pending
    mockGetAuthMe.mockImplementation(() => new Promise(() => {}));

    // When: Rendering with AuthProvider
    renderWithProvider();

    // Then: Loading state is true
    expect(screen.getByTestId('loading')).toHaveTextContent('Loading');
  });

  it('provides user data after successful auth check', async () => {
    // Given: Authenticated user
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

    // When: Rendering with AuthProvider
    renderWithProvider();

    // Then: User data is provided
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Loaded');
    });
    expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
    expect(screen.getByTestId('oidc')).toHaveTextContent('OIDC Disabled');
  });

  it('provides oidcEnabled flag when OIDC is configured', async () => {
    // Given: OIDC is enabled
    mockGetAuthMe.mockResolvedValue({
      user: null,
      setupRequired: false,
      oidcEnabled: true,
    });

    // When: Rendering with AuthProvider
    renderWithProvider();

    // Then: oidcEnabled is true
    await waitFor(() => {
      expect(screen.getByTestId('oidc')).toHaveTextContent('OIDC Enabled');
    });
  });

  it('provides error state when auth check fails', async () => {
    // Given: Auth check fails
    mockGetAuthMe.mockRejectedValue(new Error('Network error'));

    // When: Rendering with AuthProvider
    renderWithProvider();

    // Then: Error state is provided
    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Network error');
    });
    expect(screen.getByTestId('user')).toHaveTextContent('No user');
  });

  it('provides generic error message for non-Error failures', async () => {
    // Given: Auth check fails with non-Error
    mockGetAuthMe.mockRejectedValue('Something went wrong');

    // When: Rendering with AuthProvider
    renderWithProvider();

    // Then: Generic error message is provided
    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Failed to load authentication state');
    });
  });

  it('refreshAuth() triggers a new auth check', async () => {
    // Given: Initial authenticated state
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

    function TestRefreshComponent() {
      const { user, refreshAuth } = AuthContext.useAuth();
      return (
        <div>
          <div data-testid="user">{user ? user.email : 'No user'}</div>
          <button
            onClick={() => {
              void refreshAuth();
            }}
          >
            Refresh
          </button>
        </div>
      );
    }

    renderWithProvider(<TestRefreshComponent />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
    });

    // When: refreshAuth is called
    mockGetAuthMe.mockResolvedValue({
      user: {
        id: 'user-456',
        email: 'updated@example.com',
        displayName: 'Updated User',
        role: 'admin',
        authProvider: 'oidc',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        deactivatedAt: null,
      },
      setupRequired: false,
      oidcEnabled: true,
    });

    await act(async () => {
      screen.getByRole('button', { name: /refresh/i }).click();
      await new Promise((resolve) => setTimeout(resolve, 50)); // Give time for promise to resolve
    });

    // Then: User data is updated
    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('updated@example.com');
    });
  });

  it('throws error when useAuth is called outside AuthProvider', async () => {
    // Given: Component uses useAuth without provider
    function TestComponentWithoutProvider() {
      const { useAuth } = AuthContext;
      try {
        useAuth();
        return <div>Should not reach here</div>;
      } catch (error) {
        return <div>{error instanceof Error ? error.message : 'Error'}</div>;
      }
    }

    // When: Rendering without AuthProvider
    render(<TestComponentWithoutProvider />);

    // Then: Error is thrown
    expect(screen.getByText(/useAuth must be used within an AuthProvider/i)).toBeInTheDocument();
  });

  it('calls getAuthMe on mount', async () => {
    // Given: Mock auth response
    mockGetAuthMe.mockResolvedValue({
      user: null,
      setupRequired: false,
      oidcEnabled: false,
    });

    // When: Rendering with AuthProvider
    renderWithProvider();

    // Then: getAuthMe is called once
    await waitFor(() => {
      expect(mockGetAuthMe).toHaveBeenCalledTimes(1);
    });
  });

  describe('logout', () => {
    it('clears user state on successful logout', async () => {
      // Given: Authenticated user
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
      mockLogout.mockResolvedValue(undefined);

      renderWithProvider();

      // Wait for initial auth to load
      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      });

      // When: logout() is called
      await act(async () => {
        screen.getByRole('button', { name: /logout/i }).click();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Then: user becomes null
      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('No user');
      });
    });

    it('clears user state even when API call fails', async () => {
      // Given: Authenticated user, logout API rejects
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
      mockLogout.mockRejectedValue(new Error('Network error'));

      renderWithProvider();

      // Wait for initial auth to load
      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      });

      // When: logout() is called
      await act(async () => {
        screen.getByRole('button', { name: /logout/i }).click();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Then: user still becomes null (graceful handling)
      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('No user');
      });
    });

    it('calls the logout API function', async () => {
      // Given: Authenticated user
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
      mockLogout.mockResolvedValue(undefined);

      renderWithProvider();

      // Wait for initial auth to load
      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      });

      // When: logout() is called
      await act(async () => {
        screen.getByRole('button', { name: /logout/i }).click();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Then: logoutApi was called once
      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalledTimes(1);
      });
    });

    it('resets oidcEnabled flag after logout', async () => {
      // Given: Authenticated user with OIDC enabled
      mockGetAuthMe.mockResolvedValue({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          displayName: 'Test User',
          role: 'member',
          authProvider: 'oidc',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          deactivatedAt: null,
        },
        setupRequired: false,
        oidcEnabled: true,
      });
      mockLogout.mockResolvedValue(undefined);

      renderWithProvider();

      // Wait for initial auth to load
      await waitFor(() => {
        expect(screen.getByTestId('oidc')).toHaveTextContent('OIDC Enabled');
      });

      // When: logout() is called
      await act(async () => {
        screen.getByRole('button', { name: /logout/i }).click();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Then: oidcEnabled becomes false
      await waitFor(() => {
        expect(screen.getByTestId('oidc')).toHaveTextContent('OIDC Disabled');
      });
    });

    it('clears any existing error state on logout', async () => {
      // Given: Auth context with an error
      mockGetAuthMe.mockRejectedValue(new Error('Initial error'));

      renderWithProvider();

      // Wait for initial error
      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Initial error');
      });

      // Now set up successful logout
      mockLogout.mockResolvedValue(undefined);

      // When: logout() is called
      await act(async () => {
        screen.getByRole('button', { name: /logout/i }).click();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Then: error is cleared
      await waitFor(() => {
        expect(screen.queryByTestId('error')).not.toBeInTheDocument();
      });
    });
  });
});
