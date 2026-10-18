/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from '../../i18n/index.js';
import enCommon from '../../i18n/en/common.json';
import deCommon from '../../i18n/de/common.json';
import enErrors from '../../i18n/en/errors.json';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import { OriginProbe } from '../../test/originProbe.js';
import { RealLocationContext } from '../../navigation/realLocation.js';
import type * as AuthApiTypes from '../../lib/authApi.js';
import type * as AuthGuardTypes from './AuthGuard.js';
import type * as AuthContextTypes from '../../contexts/AuthContext.js';

const mockGetAuthMe = jest.fn<typeof AuthApiTypes.getAuthMe>();
const mockLogout = jest.fn<typeof AuthApiTypes.logout>();

// Must mock BEFORE importing the component
jest.unstable_mockModule('../../lib/authApi.js', () => ({
  getAuthMe: mockGetAuthMe,
  logout: mockLogout,
}));

type MeResponse = Awaited<ReturnType<typeof AuthApiTypes.getAuthMe>>;

const USER = {
  id: 'user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  role: 'member' as const,
  authProvider: 'local' as const,
  oidcLinked: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  deactivatedAt: null,
};
const SIGNED_IN: MeResponse = { user: USER, setupRequired: false, oidcEnabled: false };
const SIGNED_OUT: MeResponse = { user: null, setupRequired: false, oidcEnabled: false };

const HEADING = enCommon.authGuard.errorHeading;

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

describe('AuthGuard', () => {
  // Dynamic imports
  let AuthGuard: typeof AuthGuardTypes.AuthGuard;
  let AuthProvider: typeof AuthContextTypes.AuthProvider;

  beforeEach(async () => {
    // Dynamic import modules (only once)
    if (!AuthGuard) {
      AuthGuard = (await import('./AuthGuard.js')).AuthGuard;
      AuthProvider = (await import('../../contexts/AuthContext.js')).AuthProvider;
    }

    // Reset mocks
    mockGetAuthMe.mockReset();
    mockLogout.mockReset();
  });

  function renderWithRouter(initialRoute = '/') {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthProvider>
          <Routes>
            <Route path="/setup" element={<div>Setup Page</div>} />
            <Route path="/login" element={<div>Login Page</div>} />
            <Route element={<AuthGuard />}>
              <Route
                path="/"
                element={
                  <main>
                    <div>Protected Content</div>
                  </main>
                }
              />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it('shows loading state initially', () => {
    mockGetAuthMe.mockImplementation(() => new Promise(() => {}));

    renderWithRouter();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('redirects to /setup when setupRequired is true', async () => {
    mockGetAuthMe.mockResolvedValue({ user: null, setupRequired: true, oidcEnabled: false });

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Setup Page')).toBeInTheDocument();
    });
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects to /login when the session check says nobody is signed in', async () => {
    mockGetAuthMe.mockResolvedValue(SIGNED_OUT);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders children (Outlet) when user is authenticated', async () => {
    mockGetAuthMe.mockResolvedValue(SIGNED_IN);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Setup Page')).not.toBeInTheDocument();
  });

  it('does not fetch the session itself: the provider makes the one and only check', async () => {
    mockGetAuthMe.mockResolvedValue(SIGNED_IN);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
    expect(mockGetAuthMe).toHaveBeenCalledTimes(1);
  });

  it('loading state shows spinner', () => {
    mockGetAuthMe.mockImplementation(() => new Promise(() => {}));

    const { container } = renderWithRouter();

    expect(container.querySelector('.spinner')).toBeInTheDocument();
  });

  it('redirects to login when the session check is a real 401', async () => {
    mockGetAuthMe.mockRejectedValue(
      new ApiClientError(401, { code: 'UNAUTHORIZED', message: 'nope' }),
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument();
    });
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('shows the spinner, not the page and not a /login?next redirect, while signing out', async () => {
    mockGetAuthMe.mockResolvedValue(SIGNED_IN);
    mockLogout.mockResolvedValue(undefined);
    // logout() ends in window.location.assign, which jsdom reports as not implemented.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { useAuth } = await import('../../contexts/AuthContext.js');
    const log = createRouterLog();
    function LogoutButton() {
      const { logout } = useAuth();
      return <button onClick={() => void logout()}>Sign out now</button>;
    }
    render(
      <RecordingRouter entries={['/diary']} log={log}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>Login Page</div>} />
            <Route element={<AuthGuard />}>
              <Route path="*" element={<LogoutButton />} />
            </Route>
          </Routes>
        </AuthProvider>
      </RecordingRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Sign out now' }));

    expect(await screen.findByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out now' })).not.toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    expect(log.actions).toEqual([]);
    consoleError.mockRestore();
  });

  describe('a failed session check (never a sign-out)', () => {
    const FAILURES: Array<[string, () => unknown, string]> = [
      ['an aborted request', abortError, enCommon.requestErrors.network],
      [
        'a 500 response',
        () => new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SENTINEL' }),
        enErrors.INTERNAL_ERROR,
      ],
      [
        'a 429 response',
        () => new ApiClientError(429, { code: 'INTERNAL_ERROR', message: 'RAW-SENTINEL' }),
        enErrors.INTERNAL_ERROR,
      ],
    ];

    it.each(FAILURES)(
      'keeps the URL, shows the retry panel and never the content after %s',
      async (_name, makeError, copy) => {
        mockGetAuthMe.mockRejectedValue(makeError());
        const log = createRouterLog();

        render(
          <RecordingRouter entries={['/diary?x=1']} log={log}>
            <AuthProvider>
              <Routes>
                <Route path="/login" element={<OriginProbe />} />
                <Route element={<AuthGuard />}>
                  <Route path="*" element={<div>Protected Content</div>} />
                </Route>
              </Routes>
            </AuthProvider>
          </RecordingRouter>,
        );

        expect(await screen.findByRole('heading', { level: 1, name: HEADING })).toBeVisible();
        expect(screen.getByText(copy)).toBeInTheDocument();
        expect(screen.queryByText(/RAW-SENTINEL/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: enCommon.authGuard.retry })).toBeVisible();
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
        // No redirect of any kind happened.
        expect(log.actions).toEqual([]);
        expect(log.entries.at(log.index)).toBe('/diary?x=1');
      },
    );

    it('sets the document title to the heading plus the product name (no section, no house)', async () => {
      mockGetAuthMe.mockRejectedValue(abortError());

      renderWithRouter();

      await screen.findByRole('heading', { level: 1, name: HEADING });
      await waitFor(() => expect(document.title).toBe(`${HEADING} · Cornerstone`));
    });

    it('shows no status text before the first retry', async () => {
      mockGetAuthMe.mockRejectedValue(abortError());

      renderWithRouter();

      await screen.findByRole('heading', { level: 1, name: HEADING });
      expect(screen.getByRole('status')).toHaveTextContent('');
    });
  });

  describe('retry', () => {
    it('keeps the focused button mounted while pending, then renders the page and focuses main', async () => {
      mockGetAuthMe.mockRejectedValueOnce(abortError());
      const pending = deferred<MeResponse>();
      mockGetAuthMe.mockReturnValueOnce(pending.promise);

      renderWithRouter();
      const button = await screen.findByRole('button', { name: enCommon.authGuard.retry });
      button.focus();
      expect(button).toHaveFocus();

      fireEvent.click(button);

      expect(await screen.findByText(enCommon.authGuard.retrying)).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(enCommon.authGuard.retrying);
      expect(button).toBeInTheDocument();
      expect(button).toHaveFocus();
      expect(button).not.toHaveAttribute('disabled');
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();

      await act(async () => {
        pending.resolve(SIGNED_IN);
      });

      expect(await screen.findByText('Protected Content')).toBeInTheDocument();
      expect(screen.getByRole('main')).toHaveFocus();
      expect(document.querySelector('main')).toHaveAttribute('tabindex', '-1');
    });

    it('keeps an existing tabindex on main instead of overwriting it', async () => {
      mockGetAuthMe.mockRejectedValueOnce(abortError());
      mockGetAuthMe.mockResolvedValueOnce(SIGNED_IN);
      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <Routes>
              <Route element={<AuthGuard />}>
                <Route path="/" element={<main tabIndex={0}>Protected Content</main>} />
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );

      const button = await screen.findByRole('button', { name: enCommon.authGuard.retry });
      button.focus();
      fireEvent.click(button);

      await screen.findByText('Protected Content');
      expect(screen.getByRole('main')).toHaveAttribute('tabindex', '0');
      expect(screen.getByRole('main')).toHaveFocus();
    });

    it('does not steal focus from an element the user moved it to', async () => {
      mockGetAuthMe.mockRejectedValueOnce(abortError());
      const pending = deferred<MeResponse>();
      mockGetAuthMe.mockReturnValueOnce(pending.promise);
      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <button>Elsewhere</button>
            <Routes>
              <Route element={<AuthGuard />}>
                <Route path="/" element={<main>Protected Content</main>} />
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );

      const retry = await screen.findByRole('button', { name: enCommon.authGuard.retry });
      fireEvent.click(retry);
      await screen.findByText(enCommon.authGuard.retrying);
      const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
      elsewhere.focus();

      await act(async () => {
        pending.resolve(SIGNED_IN);
      });

      await screen.findByText('Protected Content');
      expect(elsewhere).toHaveFocus();
    });

    it('does not touch focus when the page has no main landmark', async () => {
      mockGetAuthMe.mockRejectedValueOnce(abortError());
      mockGetAuthMe.mockResolvedValueOnce(SIGNED_IN);
      render(
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <Routes>
              <Route element={<AuthGuard />}>
                <Route path="/" element={<div>Protected Content</div>} />
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );

      const button = await screen.findByRole('button', { name: enCommon.authGuard.retry });
      button.focus();
      fireEvent.click(button);

      await screen.findByText('Protected Content');
      expect(document.body).toHaveFocus();
    });

    it('does not move focus on a first load that succeeds', async () => {
      mockGetAuthMe.mockResolvedValue(SIGNED_IN);

      renderWithRouter();

      await screen.findByText('Protected Content');
      expect(screen.getByRole('main')).not.toHaveFocus();
      expect(screen.getByRole('main')).not.toHaveAttribute('tabindex');
    });

    it('keeps the button focused and says so when the retry fails, and ignores a double click', async () => {
      mockGetAuthMe.mockRejectedValueOnce(abortError());
      const pending = deferred<MeResponse>();
      mockGetAuthMe.mockReturnValueOnce(pending.promise);

      renderWithRouter();
      const button = await screen.findByRole('button', { name: enCommon.authGuard.retry });
      button.focus();

      await act(async () => {
        fireEvent.click(button);
        fireEvent.click(button);
      });
      // Mount plus exactly one retry.
      expect(mockGetAuthMe).toHaveBeenCalledTimes(2);

      await act(async () => {
        pending.reject(abortError());
      });

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(enCommon.authGuard.retryFailed),
      );
      expect(button).toBeInTheDocument();
      expect(button).toHaveFocus();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('allows another retry after a failed one', async () => {
      mockGetAuthMe.mockRejectedValueOnce(abortError());
      mockGetAuthMe.mockRejectedValueOnce(abortError());
      mockGetAuthMe.mockResolvedValueOnce(SIGNED_IN);

      renderWithRouter();
      const button = await screen.findByRole('button', { name: enCommon.authGuard.retry });
      fireEvent.click(button);
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(enCommon.authGuard.retryFailed),
      );

      fireEvent.click(button);

      expect(await screen.findByText('Protected Content')).toBeInTheDocument();
      expect(mockGetAuthMe).toHaveBeenCalledTimes(3);
    });

    it('redirects to login when the retry shows nobody is signed in', async () => {
      mockGetAuthMe.mockRejectedValueOnce(abortError());
      mockGetAuthMe.mockResolvedValueOnce(SIGNED_OUT);

      renderWithRouter();
      fireEvent.click(await screen.findByRole('button', { name: enCommon.authGuard.retry }));

      expect(await screen.findByText('Login Page')).toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('does not update state when the panel unmounts during a retry', async () => {
      mockGetAuthMe.mockRejectedValueOnce(abortError());
      const pending = deferred<MeResponse>();
      mockGetAuthMe.mockReturnValueOnce(pending.promise);
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { unmount } = renderWithRouter();
      fireEvent.click(await screen.findByRole('button', { name: enCommon.authGuard.retry }));
      await screen.findByText(enCommon.authGuard.retrying);

      unmount();
      await act(async () => {
        pending.reject(abortError());
      });

      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('deep links (#2204)', () => {
    function renderRecorded(url: string) {
      const log = createRouterLog();
      render(
        <RecordingRouter entries={[url]} log={log}>
          <AuthProvider>
            <Routes>
              <Route path="/setup" element={<OriginProbe />} />
              <Route path="/login" element={<OriginProbe />} />
              <Route element={<AuthGuard />}>
                <Route path="*" element={<div>Protected Content</div>} />
              </Route>
            </Routes>
          </AuthProvider>
        </RecordingRouter>,
      );
      return log;
    }

    it('sends a signed-out visit to the login page with the full requested URL as next, replacing history', async () => {
      mockGetAuthMe.mockResolvedValue(SIGNED_OUT);

      const log = renderRecorded('/settings/users?x=1');

      await waitFor(() => expect(screen.getByTestId('probe-path')).toHaveTextContent('/login'));
      expect(screen.getByTestId('probe-search')).toHaveTextContent(
        '?next=%2Fsettings%2Fusers%3Fx%3D1',
      );
      // Mutation: navigate without `replace` would record PUSH here.
      expect(log.actions).toEqual(['REPLACE /login?next=%2Fsettings%2Fusers%3Fx%3D1']);
    });

    it('sends a real 401 to the login page with next', async () => {
      mockGetAuthMe.mockRejectedValue(
        new ApiClientError(401, { code: 'UNAUTHORIZED', message: 'nope' }),
      );

      const log = renderRecorded('/diary?q=1');

      await waitFor(() => expect(log.actions).toHaveLength(1));
      expect(log.actions[0]).toBe('REPLACE /login?next=%2Fdiary%3Fq%3D1');
    });

    it('names the real URL in next when the routes render a different display location (dialog route)', async () => {
      mockGetAuthMe.mockResolvedValue(SIGNED_OUT);
      const log = createRouterLog();
      const display = {
        pathname: '/project/work-items',
        search: '',
        hash: '',
        state: null,
        key: 'd',
      };
      render(
        <RecordingRouter entries={['/project/work-items/new?areaId=x']} log={log}>
          <AuthProvider>
            <RealLocationContext
              value={{
                pathname: '/project/work-items/new',
                search: '?areaId=x',
                hash: '',
                key: 'real',
              }}
            >
              <Routes location={display}>
                <Route path="/login" element={<OriginProbe />} />
                <Route element={<AuthGuard />}>
                  <Route path="*" element={<div>Protected Content</div>} />
                </Route>
              </Routes>
            </RealLocationContext>
          </AuthProvider>
        </RecordingRouter>,
      );

      await waitFor(() => expect(log.actions).toHaveLength(1));
      expect(log.actions[0]).toBe('REPLACE /login?next=%2Fproject%2Fwork-items%2Fnew%3FareaId%3Dx');
    });

    it('keeps the hash in next', async () => {
      mockGetAuthMe.mockResolvedValue(SIGNED_OUT);

      const log = renderRecorded('/diary?q=1#entry');

      await waitFor(() => expect(log.actions).toHaveLength(1));
      expect(log.actions[0]).toBe('REPLACE /login?next=%2Fdiary%3Fq%3D1%23entry');
    });

    it('leaves the plain /login URL when the requested URL is the root', async () => {
      mockGetAuthMe.mockResolvedValue(SIGNED_OUT);

      const log = renderRecorded('/');

      await waitFor(() => expect(log.actions).toHaveLength(1));
      expect(log.actions[0]).toBe('REPLACE /login');
    });

    it('sends a first-run visit to /setup without a next', async () => {
      mockGetAuthMe.mockResolvedValue({ user: null, setupRequired: true, oidcEnabled: false });

      const log = renderRecorded('/diary');

      await waitFor(() => expect(log.actions).toHaveLength(1));
      expect(log.actions[0]).toBe('REPLACE /setup');
    });
  });

  describe('translations', () => {
    afterEach(async () => {
      cleanup();
      await i18n.changeLanguage('en');
    });

    it('translates the loading text', async () => {
      mockGetAuthMe.mockImplementation(() => new Promise(() => {}));
      await act(async () => {
        await i18n.changeLanguage('de');
      });

      renderWithRouter();

      expect(screen.getByText('Wird geladen...')).toBeInTheDocument();
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    it('renders the German retry panel', async () => {
      mockGetAuthMe.mockRejectedValue(abortError());
      await act(async () => {
        await i18n.changeLanguage('de');
      });

      renderWithRouter();

      expect(
        await screen.findByRole('heading', { level: 1, name: deCommon.authGuard.errorHeading }),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: deCommon.authGuard.retry })).toBeVisible();
      expect(screen.queryByText(HEADING)).not.toBeInTheDocument();
    });
  });
});
