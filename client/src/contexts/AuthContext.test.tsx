/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { ReactNode } from 'react';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';
import enErrors from '../i18n/en/errors.json';
import enAuth from '../i18n/en/auth.json';
import enCommon from '../i18n/en/common.json';
import deCommon from '../i18n/de/common.json';
import i18n from '../i18n/index.js';
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
        oidcLinked: false,
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

  it('shows the fallback (not the raw message) when the auth check fails with a plain Error', async () => {
    mockGetAuthMe.mockRejectedValue(new Error('RAW-LOCAL'));

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent(enAuth.session.loadError);
    });
    expect(screen.queryByText(/RAW-LOCAL/)).not.toBeInTheDocument();
    expect(screen.getByTestId('user')).toHaveTextContent('No user');
  });

  it('shows the translated error for an ApiClientError, never the server text', async () => {
    mockGetAuthMe.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
    );

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent(enErrors.INTERNAL_ERROR);
    });
    expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).not.toBeInTheDocument();
  });

  it('shows the network error copy for a NetworkError', async () => {
    mockGetAuthMe.mockRejectedValue(new NetworkError('RAW-NET', new Error()));

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent(enCommon.requestErrors.network);
    });
    expect(screen.queryByText(/RAW-NET/)).not.toBeInTheDocument();
  });

  it('provides generic error message for non-Error failures', async () => {
    mockGetAuthMe.mockRejectedValue('Something went wrong');

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent(enAuth.session.loadError);
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
        oidcLinked: false,
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
        oidcLinked: true,
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
      // eslint-disable-next-line @eslint-react/error-boundaries -- test intentionally uses try/catch to assert error behavior
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

  it('runs the auth fetch exactly once on mount and does not refetch when the provider re-renders', async () => {
    mockGetAuthMe.mockResolvedValue({ user: null, setupRequired: false, oidcEnabled: false });

    const { rerender } = renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Loaded');
    });
    expect(mockGetAuthMe).toHaveBeenCalledTimes(1);

    // Re-render the provider (new children element each time) and let any effects flush
    for (let i = 0; i < 3; i++) {
      rerender(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>,
      );
      await act(async () => {
        await Promise.resolve();
      });
    }

    expect(mockGetAuthMe).toHaveBeenCalledTimes(1);
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
          oidcLinked: false,
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
          oidcLinked: false,
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
          oidcLinked: false,
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
          oidcLinked: true,
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
        expect(screen.getByTestId('error')).toHaveTextContent(enAuth.session.loadError);
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
          oidcLinked: false,
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

describe('AuthContext session status (failed checks never sign the user out)', () => {
  const USER = {
    id: 'user-1',
    email: 'member@example.test',
    displayName: 'Test Member',
    role: 'member' as const,
    authProvider: 'local' as const,
    oidcLinked: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deactivatedAt: null,
  };
  const SIGNED_IN = { user: USER, setupRequired: false, oidcEnabled: false };
  const SIGNED_OUT = { user: null, setupRequired: false, oidcEnabled: false };
  type MeResponse = Awaited<ReturnType<typeof AuthApiModule.getAuthMe>>;

  const renderedStatuses: string[] = [];
  const renderedLoading: boolean[] = [];

  function StatusProbe() {
    const { status, user, error, setupRequired, isLoading, refreshAuth, logout } = useAuth();
    renderedStatuses.push(status);
    renderedLoading.push(isLoading);
    return (
      <div>
        <div data-testid="status">{status}</div>
        <div data-testid="user">{user ? user.email : 'No user'}</div>
        <div data-testid="error">{error ?? 'No error'}</div>
        <div data-testid="setup">{String(setupRequired)}</div>
        <button onClick={() => void refreshAuth()}>Refresh</button>
        <button onClick={() => void logout()}>Logout</button>
      </div>
    );
  }

  function renderProbe() {
    return render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>,
    );
  }

  function abortError() {
    return new NetworkError('aborted', new DOMException('aborted', 'AbortError'));
  }

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  async function clickRefresh() {
    await act(async () => {
      screen.getByRole('button', { name: 'Refresh' }).click();
    });
  }

  async function expectStatus(status: string) {
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent(status));
  }

  beforeEach(() => {
    renderedStatuses.length = 0;
    renderedLoading.length = 0;
  });

  it('checks the session exactly once at mount, even after a language change re-renders the provider', async () => {
    mockGetAuthMe.mockResolvedValue(SIGNED_IN);
    renderProbe();
    await expectStatus('authenticated');
    expect(mockGetAuthMe).toHaveBeenCalledTimes(1);

    try {
      await act(async () => {
        await i18n.changeLanguage('de');
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockGetAuthMe).toHaveBeenCalledTimes(1);
      expect(mockGetAuthMe.mock.calls[0]?.[0]?.signal?.aborted).toBe(false);
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  it('uses the current language for the error copy after a language change', async () => {
    mockGetAuthMe.mockResolvedValueOnce(SIGNED_IN);
    renderProbe();
    await expectStatus('authenticated');
    mockGetAuthMe.mockResolvedValueOnce(SIGNED_OUT);
    await clickRefresh();
    await expectStatus('signedOut');

    try {
      await act(async () => {
        await i18n.changeLanguage('de');
      });
      mockGetAuthMe.mockRejectedValueOnce(abortError());
      await clickRefresh();
      await expectStatus('error');
      expect(screen.getByTestId('error')).toHaveTextContent(deCommon.requestErrors.network);
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  it('starts as loading', () => {
    mockGetAuthMe.mockImplementation(() => new Promise(() => {}));
    renderProbe();
    expect(screen.getByTestId('status')).toHaveTextContent('loading');
  });

  it('reports signedOut with no error when the session check says there is no user', async () => {
    mockGetAuthMe.mockResolvedValue(SIGNED_OUT);
    renderProbe();
    await expectStatus('signedOut');
    expect(screen.getByTestId('error')).toHaveTextContent('No error');
    expect(screen.getByTestId('setup')).toHaveTextContent('false');
  });

  it('reports authenticated when a user comes back', async () => {
    mockGetAuthMe.mockResolvedValue(SIGNED_IN);
    renderProbe();
    await expectStatus('authenticated');
    expect(screen.getByTestId('user')).toHaveTextContent(USER.email);
  });

  it('reports setupRequired (and the setupRequired flag) on first run', async () => {
    mockGetAuthMe.mockResolvedValue({ user: null, setupRequired: true, oidcEnabled: false });
    renderProbe();
    await expectStatus('setupRequired');
    expect(screen.getByTestId('setup')).toHaveTextContent('true');
  });

  it('lets setupRequired win over a user in the same response', async () => {
    mockGetAuthMe.mockResolvedValue({ user: USER, setupRequired: true, oidcEnabled: false });
    renderProbe();
    await expectStatus('setupRequired');
  });

  it('reports error (not signedOut) with the network copy when the first check is aborted', async () => {
    mockGetAuthMe.mockRejectedValue(abortError());
    renderProbe();
    await expectStatus('error');
    expect(screen.getByTestId('user')).toHaveTextContent('No user');
    expect(screen.getByTestId('error')).toHaveTextContent(enCommon.requestErrors.network);
  });

  it('reports error with the translated copy on a 500, never signedOut', async () => {
    mockGetAuthMe.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
    );
    renderProbe();
    await expectStatus('error');
    expect(screen.getByTestId('error')).toHaveTextContent(enErrors.INTERNAL_ERROR);
    expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).not.toBeInTheDocument();
  });

  it('reports error with the fallback copy for a non-API failure', async () => {
    mockGetAuthMe.mockRejectedValue(new Error('RAW-LOCAL'));
    renderProbe();
    await expectStatus('error');
    expect(screen.getByTestId('error')).toHaveTextContent(enAuth.session.loadError);
  });

  it('reports signedOut without an error when the first check is a real 401', async () => {
    mockGetAuthMe.mockRejectedValue(
      new ApiClientError(401, { code: 'UNAUTHORIZED', message: 'nope' }),
    );
    renderProbe();
    await expectStatus('signedOut');
    expect(screen.getByTestId('error')).toHaveTextContent('No error');
  });

  it('keeps the user and status when a refresh of a signed-in session fails transiently', async () => {
    mockGetAuthMe.mockResolvedValueOnce(SIGNED_IN);
    renderProbe();
    await expectStatus('authenticated');

    mockGetAuthMe.mockRejectedValueOnce(abortError());
    await clickRefresh();

    expect(mockGetAuthMe).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('user')).toHaveTextContent(USER.email);
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('error')).toHaveTextContent('No error');
  });

  it('keeps the user when a refresh fails with a 500', async () => {
    mockGetAuthMe.mockResolvedValueOnce(SIGNED_IN);
    renderProbe();
    await expectStatus('authenticated');

    mockGetAuthMe.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    await clickRefresh();

    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('user')).toHaveTextContent(USER.email);
  });

  it('signs the user out when a refresh is a real 401', async () => {
    mockGetAuthMe.mockResolvedValueOnce(SIGNED_IN);
    renderProbe();
    await expectStatus('authenticated');

    mockGetAuthMe.mockRejectedValueOnce(
      new ApiClientError(401, { code: 'UNAUTHORIZED', message: 'nope' }),
    );
    await clickRefresh();

    expect(screen.getByTestId('status')).toHaveTextContent('signedOut');
    expect(screen.getByTestId('user')).toHaveTextContent('No user');
  });

  it('signs the user out when a refresh resolves with no user', async () => {
    mockGetAuthMe.mockResolvedValueOnce(SIGNED_IN);
    renderProbe();
    await expectStatus('authenticated');

    mockGetAuthMe.mockResolvedValueOnce(SIGNED_OUT);
    await clickRefresh();

    expect(screen.getByTestId('status')).toHaveTextContent('signedOut');
    expect(screen.getByTestId('user')).toHaveTextContent('No user');
  });

  it('never returns to loading during a refresh, from error or from authenticated', async () => {
    mockGetAuthMe.mockRejectedValueOnce(abortError());
    renderProbe();
    await expectStatus('error');

    const pending = deferred<MeResponse>();
    mockGetAuthMe.mockReturnValueOnce(pending.promise);
    const before = renderedStatuses.length;
    await clickRefresh();
    expect(screen.getByTestId('status')).toHaveTextContent('error');
    await act(async () => {
      pending.resolve(SIGNED_IN);
    });
    await expectStatus('authenticated');

    mockGetAuthMe.mockResolvedValueOnce(SIGNED_IN);
    await clickRefresh();

    expect(renderedStatuses.slice(before)).not.toContain('loading');
    expect(renderedLoading.slice(before)).not.toContain(true);
  });

  it('lets the newest check win and aborts the superseded one', async () => {
    mockGetAuthMe.mockResolvedValueOnce(SIGNED_OUT);
    renderProbe();
    await expectStatus('signedOut');

    const first = deferred<MeResponse>();
    const second = deferred<MeResponse>();
    mockGetAuthMe.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    await clickRefresh();
    await clickRefresh();

    const firstSignal = mockGetAuthMe.mock.calls[1]?.[0]?.signal;
    const secondSignal = mockGetAuthMe.mock.calls[2]?.[0]?.signal;
    expect(firstSignal?.aborted).toBe(true);
    expect(secondSignal?.aborted).toBe(false);

    await act(async () => {
      second.resolve(SIGNED_IN);
    });
    await expectStatus('authenticated');

    // The stale (first) response arrives late and must not overwrite the newer result.
    await act(async () => {
      first.resolve(SIGNED_OUT);
    });
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('user')).toHaveTextContent(USER.email);
  });

  it('ignores a stale rejection that arrives after a newer success', async () => {
    mockGetAuthMe.mockResolvedValueOnce(SIGNED_OUT);
    renderProbe();
    await expectStatus('signedOut');

    const first = deferred<MeResponse>();
    mockGetAuthMe.mockReturnValueOnce(first.promise).mockResolvedValueOnce(SIGNED_IN);
    await clickRefresh();
    await clickRefresh();
    await expectStatus('authenticated');

    await act(async () => {
      first.reject(new ApiClientError(401, { code: 'UNAUTHORIZED', message: 'late' }));
    });
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
  });

  it('aborts the in-flight check on unmount and ignores a later rejection', async () => {
    const pending = deferred<MeResponse>();
    mockGetAuthMe.mockReturnValue(pending.promise);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderProbe();

    const signal = mockGetAuthMe.mock.calls[0]?.[0]?.signal;
    expect(signal).toBeDefined();
    expect(signal?.aborted).toBe(false);

    unmount();
    expect(signal?.aborted).toBe(true);

    const rendersAtUnmount = renderedStatuses.length;
    await act(async () => {
      pending.reject(abortError());
    });
    expect(renderedStatuses.length).toBe(rendersAtUnmount);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  describe('logout fence', () => {
    let consoleError: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
      // logout() ends in window.location.assign, which jsdom reports as not implemented.
      consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockLogout.mockResolvedValue(undefined);
    });

    afterEach(() => {
      consoleError.mockRestore();
    });

    async function startPendingLoadThenLogout() {
      mockGetAuthMe.mockResolvedValueOnce(SIGNED_IN);
      renderProbe();
      await expectStatus('authenticated');
      const pending = deferred<MeResponse>();
      mockGetAuthMe.mockReturnValueOnce(pending.promise);
      await clickRefresh();
      await act(async () => {
        screen.getByRole('button', { name: 'Logout' }).click();
      });
      return pending;
    }

    it('stays signingOut when a pending check resolves with a user after logout started', async () => {
      const pending = await startPendingLoadThenLogout();
      expect(screen.getByTestId('status')).toHaveTextContent('signingOut');

      await act(async () => {
        pending.resolve(SIGNED_IN);
      });

      expect(screen.getByTestId('status')).toHaveTextContent('signingOut');
      expect(screen.getByTestId('user')).toHaveTextContent('No user');
    });

    it('stays signingOut, with no error panel, when a pending check fails after logout started', async () => {
      const pending = await startPendingLoadThenLogout();

      await act(async () => {
        pending.reject(abortError());
      });

      expect(screen.getByTestId('status')).toHaveTextContent('signingOut');
      expect(screen.getByTestId('error')).toHaveTextContent('No error');
    });

    it('aborts the pending check as soon as logout starts', async () => {
      await startPendingLoadThenLogout();

      const signal = mockGetAuthMe.mock.calls[1]?.[0]?.signal;
      expect(signal?.aborted).toBe(true);
    });

    it('ignores a check that starts after logout began and fails', async () => {
      mockGetAuthMe.mockResolvedValueOnce(SIGNED_IN);
      renderProbe();
      await expectStatus('authenticated');
      const pendingLogout = deferred<void>();
      mockLogout.mockReturnValueOnce(pendingLogout.promise);
      await act(async () => {
        screen.getByRole('button', { name: 'Logout' }).click();
      });

      mockGetAuthMe.mockRejectedValueOnce(abortError());
      await clickRefresh();

      expect(screen.getByTestId('status')).toHaveTextContent('signingOut');
      expect(screen.getByTestId('error')).toHaveTextContent('No error');
      await act(async () => {
        pendingLogout.resolve();
      });
    });

    it('ignores a check that starts after logout began, whatever it returns', async () => {
      mockGetAuthMe.mockResolvedValueOnce(SIGNED_IN);
      renderProbe();
      await expectStatus('authenticated');
      const pendingLogout = deferred<void>();
      mockLogout.mockReturnValueOnce(pendingLogout.promise);
      await act(async () => {
        screen.getByRole('button', { name: 'Logout' }).click();
      });

      mockGetAuthMe.mockResolvedValueOnce(SIGNED_IN);
      await clickRefresh();

      expect(screen.getByTestId('status')).toHaveTextContent('signingOut');
      expect(screen.getByTestId('user')).toHaveTextContent('No user');
      await act(async () => {
        pendingLogout.resolve();
      });
    });
  });

  it('moves to signingOut on logout', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetAuthMe.mockResolvedValueOnce(SIGNED_IN);
    mockLogout.mockResolvedValue(undefined);
    renderProbe();
    await expectStatus('authenticated');

    await act(async () => {
      screen.getByRole('button', { name: 'Logout' }).click();
    });

    expect(screen.getByTestId('status')).toHaveTextContent('signingOut');
    expect(screen.getByTestId('user')).toHaveTextContent('No user');
    consoleError.mockRestore();
  });
});
