/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from '../../i18n/index.js';
import { RecordingRouter, createRouterLog } from '../../test/recordingRouter.js';
import { OriginProbe } from '../../test/originProbe.js';
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
        oidcLinked: false,
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

  describe('deep links (#2204)', () => {
    const SIGNED_OUT = { user: null, setupRequired: false, oidcEnabled: false };

    function renderRecorded(url: string) {
      const log = createRouterLog();
      render(
        <RecordingRouter entries={[url]} log={log}>
          <Routes>
            <Route path="/setup" element={<OriginProbe />} />
            <Route path="/login" element={<OriginProbe />} />
            <Route element={<AuthGuard />}>
              <Route path="*" element={<div>Protected Content</div>} />
            </Route>
          </Routes>
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

    describe('loading text', () => {
      afterEach(async () => {
        cleanup();
        await i18n.changeLanguage('en');
      });

      it('is translated, not hardcoded English', async () => {
        mockGetAuthMe.mockImplementation(() => new Promise(() => {}));
        await act(async () => {
          await i18n.changeLanguage('de');
        });

        renderWithRouter();

        expect(screen.getByText('Wird geladen...')).toBeInTheDocument();
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });
    });
  });
});
