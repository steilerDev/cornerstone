/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { ReactNode } from 'react';
import type * as AuthApiModule from '../lib/authApi.js';
import type * as AuthContextModule from './AuthContext.js';

// Must mock BEFORE dynamic import of the component
const mockGetAuthMe = jest.fn<typeof AuthApiModule.getAuthMe>();
const mockLogout = jest.fn<typeof AuthApiModule.logout>();

jest.unstable_mockModule('../lib/authApi.js', () => ({
  getAuthMe: mockGetAuthMe,
  logout: mockLogout,
}));

// Dynamic imports — resolved once and cached
let AuthProvider: typeof AuthContextModule.AuthProvider;
let useAuth: typeof AuthContextModule.useAuth;

beforeEach(async () => {
  if (!AuthProvider) {
    const mod = await import('./AuthContext.js');
    AuthProvider = mod.AuthProvider;
    useAuth = mod.useAuth;
  }
  mockGetAuthMe.mockReset();
  mockLogout.mockReset();
});

describe('AuthContext', () => {
  function TestComponent() {
    const { user, oidcEnabled, isLoading, error, logout } = useAuth();
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
    return render(<AuthProvider>{children}</AuthProvider>);
  }

  it('provides loading state initially', () => {
    mockGetAuthMe.mockImplementation(() => new Promise(() => {}));
    renderWithProvider();
    expect(screen.getByTestId('loading')).toHaveTextContent('Loading');
  });

  it('provides user data after successful auth check', async () => {
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

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Loaded');
    });
    expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
    expect(screen.getByTestId('oidc')).toHaveTextContent('OIDC Disabled');
  });

  it('provides oidcEnabled flag when OIDC is configured', async () => {
    mockGetAuthMe.mockResolvedValue({
      user: null,
      setupRequired: false,
      oidcEnabled: true,
    });

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('oidc')).toHaveTextContent('OIDC Enabled');
    });
  });

  it('provides error state when auth check fails', async () => {
    mockGetAuthMe.mockRejectedValue(new Error('Network error'));

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Network error');
    });
    expect(screen.getByTestId('user')).toHaveTextContent('No user');
  });

  it('provides generic error message for non-Error failures', async () => {
    mockGetAuthMe.mockRejectedValue('Something went wrong');

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Failed to load authentication state');
    });
  });

  it('refreshAuth() triggers a new auth check', async () => {
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
      const { user, refreshAuth } = useAuth();
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

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
    });

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
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('updated@example.com');
    });
  });

  it('throws error when useAuth is called outside AuthProvider', async () => {
    function TestComponentWithoutProvider() {
      try {
        useAuth();
        return <div>Should not reach here</div>;
      } catch (error) {
        return <div>{error instanceof Error ? error.message : 'Error'}</div>;
      }
    }

    render(<TestComponentWithoutProvider />);

    expect(screen.getByText(/useAuth must be used within an AuthProvider/i)).toBeInTheDocument();
  });

  it('calls getAuthMe on mount', async () => {
    mockGetAuthMe.mockResolvedValue({
      user: null,
      setupRequired: false,
      oidcEnabled: false,
    });

    renderWithProvider();

    await waitFor(() => {
      expect(mockGetAuthMe).toHaveBeenCalledTimes(1);
    });
  });

  describe('logout', () => {
    // logout() calls window.location.assign('/login') which is non-configurable in jsdom.
    // Suppress jsdom "Not implemented: navigation" console.error noise.
    // Navigation redirect is verified via console.error spy and in E2E tests.
    let consoleErrorSpy: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('clears user state on successful logout', async () => {
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

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      });

      await act(async () => {
        screen.getByRole('button', { name: /logout/i }).click();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('No user');
      });
    });

    it('clears user state even when API call fails', async () => {
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

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      });

      await act(async () => {
        screen.getByRole('button', { name: /logout/i }).click();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('No user');
      });
    });

    it('calls the logout API function', async () => {
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

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      });

      await act(async () => {
        screen.getByRole('button', { name: /logout/i }).click();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalledTimes(1);
      });
    });

    it('resets oidcEnabled flag after logout', async () => {
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

      await waitFor(() => {
        expect(screen.getByTestId('oidc')).toHaveTextContent('OIDC Enabled');
      });

      await act(async () => {
        screen.getByRole('button', { name: /logout/i }).click();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      await waitFor(() => {
        expect(screen.getByTestId('oidc')).toHaveTextContent('OIDC Disabled');
      });
    });

    it('clears any existing error state on logout', async () => {
      mockGetAuthMe.mockRejectedValue(new Error('Initial error'));

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Initial error');
      });

      mockLogout.mockResolvedValue(undefined);

      await act(async () => {
        screen.getByRole('button', { name: /logout/i }).click();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      await waitFor(() => {
        expect(screen.queryByTestId('error')).not.toBeInTheDocument();
      });
    });

    it('triggers navigation to /login after logout', async () => {
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

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      });

      await act(async () => {
        screen.getByRole('button', { name: /logout/i }).click();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // window.location.assign('/login') triggers jsdom "Not implemented: navigation"
      // Verify the navigation was attempted by checking the suppressed console.error
      expect(consoleErrorSpy).toHaveBeenCalled();
      const navError = (consoleErrorSpy.mock.calls as unknown[][]).find((call) =>
        call.some((arg) => String(arg).includes('Not implemented: navigation')),
      );
      expect(navError).toBeDefined();
    });
  });
});
