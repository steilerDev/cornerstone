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
}));

describe('AuthContext', () => {
  // Dynamic imports
  let authApi: typeof AuthApiTypes;
  let AuthContext: typeof AuthContextTypes;

  let mockGetAuthMe: jest.MockedFunction<typeof AuthApiTypes.getAuthMe>;

  beforeEach(async () => {
    // Dynamic import modules (only once)
    if (!authApi) {
      authApi = await import('../lib/authApi.js');
      AuthContext = await import('./AuthContext.js');
    }

    // Reset mocks
    mockGetAuthMe = authApi.getAuthMe as jest.MockedFunction<typeof authApi.getAuthMe>;
    mockGetAuthMe.mockReset();
  });

  function TestComponent() {
    const { user, oidcEnabled, isLoading, error } = AuthContext.useAuth();
    return (
      <div>
        <div data-testid="loading">{isLoading ? 'Loading' : 'Loaded'}</div>
        <div data-testid="user">{user ? user.email : 'No user'}</div>
        <div data-testid="oidc">{oidcEnabled ? 'OIDC Enabled' : 'OIDC Disabled'}</div>
        {error && <div data-testid="error">{error}</div>}
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
});
