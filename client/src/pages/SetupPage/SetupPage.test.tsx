/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, cleanup, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ApiClientError } from '../../lib/apiClient.js';
import enErrors from '../../i18n/en/errors.json';
import enAuth from '../../i18n/en/auth.json';
import enCommon from '../../i18n/en/common.json';
import type * as AuthApiTypes from '../../lib/authApi.js';
import type * as ThemeContextTypes from '../../contexts/ThemeContext.js';
import type * as AuthContextTypes from '../../contexts/AuthContext.js';
import type * as SetupPageTypes from './SetupPage.js';

const mockSetup = jest.fn<typeof AuthApiTypes.setup>();
const mockGetAuthMe = jest.fn<typeof AuthApiTypes.getAuthMe>();
const mockLogout = jest.fn<typeof AuthApiTypes.logout>();

// `logout` is imported by AuthContext, which the title hook reaches through HouseNameContext
jest.unstable_mockModule('../../lib/authApi.js', () => ({
  setup: mockSetup,
  getAuthMe: mockGetAuthMe,
  logout: mockLogout,
}));

describe('SetupPage', () => {
  let SetupPage: typeof SetupPageTypes.SetupPage;
  let ThemeProvider: typeof ThemeContextTypes.ThemeProvider;
  let AuthProvider: typeof AuthContextTypes.AuthProvider;

  beforeEach(async () => {
    if (!SetupPage) {
      ({ SetupPage } = await import('./SetupPage.js'));
      ({ ThemeProvider } = await import('../../contexts/ThemeContext.js'));
      ({ AuthProvider } = await import('../../contexts/AuthContext.js'));
    }
    mockSetup.mockReset();
    mockGetAuthMe.mockReset();
    mockGetAuthMe.mockResolvedValue({ user: null, setupRequired: true, oidcEnabled: false });
  });

  afterEach(() => {
    cleanup();
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/setup']}>
        <ThemeProvider>
          <AuthProvider>
            <Routes>
              <Route path="/setup" element={<SetupPage />} />
              <Route path="/login" element={<div>LOGIN PAGE</div>} />
            </Routes>
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );
  }

  async function fillForm(
    user: ReturnType<typeof userEvent.setup>,
    overrides: { password?: string; confirm?: string } = {},
  ) {
    await user.type(await screen.findByLabelText(enAuth.setup.emailLabel), 'admin@example.com');
    await user.type(screen.getByLabelText(enAuth.setup.displayNameLabel), 'Admin');
    await user.type(
      screen.getByLabelText(enAuth.setup.passwordLabel, { selector: '#password' }),
      overrides.password ?? 'a-long-password-123',
    );
    await user.type(
      screen.getByLabelText(enAuth.setup.confirmPasswordLabel),
      overrides.confirm ?? overrides.password ?? 'a-long-password-123',
    );
  }

  it('shows the loading text while checking whether setup is required', () => {
    mockGetAuthMe.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(enAuth.setup.loading)).toBeInTheDocument();
  });

  it('has exactly one level-1 heading while checking, so the page is never headingless', () => {
    mockGetAuthMe.mockReturnValue(new Promise(() => {}));
    renderPage();

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(enAuth.setup.title);
  });

  it('has exactly one level-1 heading once the form shows', async () => {
    renderPage();

    await screen.findByLabelText(enAuth.setup.emailLabel);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(enAuth.setup.title);
  });

  it('sets the tab title from the setup title with the product name, in both states', async () => {
    mockGetAuthMe.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderPage();
    expect(document.title).toBe(`${enAuth.setup.title} · Cornerstone`);
    unmount();

    mockGetAuthMe.mockResolvedValue({ user: null, setupRequired: true, oidcEnabled: false });
    renderPage();
    await screen.findByLabelText(enAuth.setup.emailLabel);
    expect(document.title).toBe(`${enAuth.setup.title} · Cornerstone`);
  });

  it('redirects to login when setup is already complete', async () => {
    mockGetAuthMe.mockResolvedValue({ user: null, setupRequired: false, oidcEnabled: false });
    renderPage();
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it('redirects a signed-in visitor to login too, without showing the form', async () => {
    mockGetAuthMe.mockResolvedValue({
      user: { id: 'u' } as never,
      setupRequired: false,
      oidcEnabled: false,
    });
    renderPage();
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
    expect(screen.queryByLabelText(enAuth.setup.emailLabel)).not.toBeInTheDocument();
  });

  it('shows the loading copy, never the form, while the session check is pending', () => {
    mockGetAuthMe.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(enAuth.setup.loading)).toBeInTheDocument();
    expect(screen.queryByLabelText(enAuth.setup.emailLabel)).not.toBeInTheDocument();
  });

  it('shows the retry card, not the form and not a redirect, when the session check fails', async () => {
    mockGetAuthMe.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: enCommon.authGuard.errorHeading }),
    ).toBeInTheDocument();
    expect(screen.getByText(enAuth.session.loadError)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: enCommon.authGuard.retry })).toBeInTheDocument();
    expect(screen.queryByLabelText(enAuth.setup.emailLabel)).not.toBeInTheDocument();
    expect(screen.queryByText('LOGIN PAGE')).not.toBeInTheDocument();
  });

  it('shows the translated error in the retry card, never the server text', async () => {
    mockGetAuthMe.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
    );
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: enCommon.authGuard.errorHeading }),
    ).toBeInTheDocument();
    expect(screen.getByText(enErrors.INTERNAL_ERROR)).toBeInTheDocument();
    expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).not.toBeInTheDocument();
  });

  it('titles the tab with the error heading while the check has failed, then with the setup title', async () => {
    mockGetAuthMe.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    renderPage();
    const retry = await screen.findByRole('button', { name: enCommon.authGuard.retry });
    await waitFor(() =>
      expect(document.title).toBe(`${enCommon.authGuard.errorHeading} · Cornerstone`),
    );

    await user.click(retry);

    await screen.findByLabelText(enAuth.setup.emailLabel);
    await waitFor(() => expect(document.title).toBe(`${enAuth.setup.title} · Cornerstone`));
  });

  it('shows the retrying line while Try again is pending and the failed line if it fails', async () => {
    mockGetAuthMe.mockRejectedValueOnce(new Error('boom'));
    let failRetry!: () => void;
    mockGetAuthMe.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          failRetry = () => reject(new Error('still down'));
        }),
    );
    renderPage();
    const retry = await screen.findByRole('button', { name: enCommon.authGuard.retry });

    fireEvent.click(retry);

    expect(await screen.findByText(enCommon.authGuard.retrying)).toBeInTheDocument();
    expect(retry).toBeInTheDocument();
    expect(retry).not.toHaveAttribute('disabled');

    await act(async () => {
      failRetry();
    });

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(enCommon.authGuard.retryFailed),
    );
    expect(screen.queryByLabelText(enAuth.setup.emailLabel)).not.toBeInTheDocument();
  });

  it('ignores extra clicks on Try again while a retry is in flight', async () => {
    mockGetAuthMe.mockRejectedValueOnce(new Error('boom'));
    let finish!: () => void;
    mockGetAuthMe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ user: null, setupRequired: true, oidcEnabled: false });
        }),
    );
    renderPage();
    const retry = await screen.findByRole('button', { name: enCommon.authGuard.retry });

    await act(async () => {
      fireEvent.click(retry);
      fireEvent.click(retry);
      fireEvent.click(retry);
    });

    // Provider mount check plus exactly one retry.
    expect(mockGetAuthMe).toHaveBeenCalledTimes(2);
    await act(async () => {
      finish();
    });
    await screen.findByLabelText(enAuth.setup.emailLabel);
  });

  it('moves focus to the email field after a successful retry, never leaving it on body', async () => {
    mockGetAuthMe.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    const retry = await screen.findByRole('button', { name: enCommon.authGuard.retry });
    retry.focus();
    expect(retry).toHaveFocus();

    fireEvent.click(retry);

    const email = await screen.findByLabelText(enAuth.setup.emailLabel);
    expect(email).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('does not steal focus on the first load when the check succeeds', async () => {
    renderPage();
    const email = await screen.findByLabelText(enAuth.setup.emailLabel);
    expect(email).not.toHaveFocus();
  });

  it('Try again re-checks the session and shows the form once setup is required', async () => {
    mockGetAuthMe.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    renderPage();
    const retry = await screen.findByRole('button', { name: enCommon.authGuard.retry });

    await user.click(retry);

    expect(await screen.findByLabelText(enAuth.setup.emailLabel)).toBeInTheDocument();
    expect(mockGetAuthMe).toHaveBeenCalledTimes(2);
  });

  it('Try again redirects to login when the retry shows setup is already done', async () => {
    mockGetAuthMe.mockRejectedValueOnce(new Error('boom'));
    mockGetAuthMe.mockResolvedValueOnce({ user: null, setupRequired: false, oidcEnabled: false });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: enCommon.authGuard.retry }));

    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it('makes no session check of its own: only the provider calls getAuthMe on mount', async () => {
    renderPage();
    await screen.findByLabelText(enAuth.setup.emailLabel);
    expect(mockGetAuthMe).toHaveBeenCalledTimes(1);
  });

  it('validates required fields', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: enAuth.setup.submitButton }));
    expect(screen.getByText(enAuth.setup.validation.emailRequired)).toBeInTheDocument();
    expect(screen.getByText(enAuth.setup.validation.displayNameRequired)).toBeInTheDocument();
    expect(screen.getByText(enAuth.setup.validation.passwordRequired)).toBeInTheDocument();
    expect(mockSetup).not.toHaveBeenCalled();
  });

  it('validates password length and confirmation match', async () => {
    const user = userEvent.setup();
    renderPage();
    await fillForm(user, { password: 'short', confirm: 'different' });
    await user.click(screen.getByRole('button', { name: enAuth.setup.submitButton }));
    expect(screen.getByText(enAuth.setup.validation.passwordTooShort)).toBeInTheDocument();
    expect(screen.getByText(enAuth.setup.validation.passwordsDoNotMatch)).toBeInTheDocument();
    expect(mockSetup).not.toHaveBeenCalled();
  });

  it('creates the admin and navigates to login on success', async () => {
    mockSetup.mockResolvedValue({ user: { id: 'u' } } as never);
    const user = userEvent.setup();
    renderPage();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: enAuth.setup.submitButton }));
    await waitFor(() => {
      expect(mockSetup).toHaveBeenCalledWith({
        email: 'admin@example.com',
        displayName: 'Admin',
        password: 'a-long-password-123',
      });
    });
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it('refreshes the session after setup succeeds and only then navigates to login', async () => {
    mockSetup.mockResolvedValue({ user: { id: 'u' } } as never);
    const user = userEvent.setup();
    renderPage();
    await fillForm(user);
    // Provider mount check + the page's own check have run by now.
    const callsBefore = mockGetAuthMe.mock.calls.length;
    let finishRefresh!: () => void;
    mockGetAuthMe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = () => resolve({ user: null, setupRequired: false, oidcEnabled: false });
        }),
    );

    await user.click(screen.getByRole('button', { name: enAuth.setup.submitButton }));

    await waitFor(() => expect(mockGetAuthMe).toHaveBeenCalledTimes(callsBefore + 1));
    // The refresh is the call made after setup(), and navigation waits for it.
    const refreshOrder = mockGetAuthMe.mock.invocationCallOrder.at(-1) ?? 0;
    expect(mockSetup.mock.invocationCallOrder[0]).toBeLessThan(refreshOrder);
    expect(screen.queryByText('LOGIN PAGE')).not.toBeInTheDocument();

    finishRefresh();
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it('does not refresh the session when setup fails', async () => {
    mockSetup.mockRejectedValue(new Error('RAW-LOCAL'));
    const user = userEvent.setup();
    renderPage();
    await fillForm(user);
    const callsBefore = mockGetAuthMe.mock.calls.length;

    await user.click(screen.getByRole('button', { name: enAuth.setup.submitButton }));

    expect(await screen.findByText(enAuth.setup.error)).toBeInTheDocument();
    expect(mockGetAuthMe).toHaveBeenCalledTimes(callsBefore);
    expect(screen.queryByText('LOGIN PAGE')).not.toBeInTheDocument();
  });

  it('still navigates to login when the refresh itself fails, as the context absorbs it', async () => {
    mockSetup.mockResolvedValue({ user: { id: 'u' } } as never);
    const user = userEvent.setup();
    renderPage();
    await fillForm(user);
    mockGetAuthMe.mockRejectedValueOnce(new Error('offline'));

    await user.click(screen.getByRole('button', { name: enAuth.setup.submitButton }));

    // loadAuth swallows the failure into AuthContext state, so navigation still proceeds.
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it('shows the translated SETUP_COMPLETE error, never the server text', async () => {
    mockSetup.mockRejectedValue(
      new ApiClientError(403, { code: 'SETUP_COMPLETE', message: 'RAW-SERVER-SENTINEL' }),
    );
    const user = userEvent.setup();
    renderPage();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: enAuth.setup.submitButton }));
    expect(await screen.findByText(enErrors.SETUP_COMPLETE)).toBeInTheDocument();
    expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).not.toBeInTheDocument();
  });

  it('shows the fallback error for a non-API failure, never its message', async () => {
    mockSetup.mockRejectedValue(new Error('RAW-LOCAL'));
    const user = userEvent.setup();
    renderPage();
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: enAuth.setup.submitButton }));
    expect(await screen.findByText(enAuth.setup.error)).toBeInTheDocument();
    expect(screen.queryByText(/RAW-LOCAL/)).not.toBeInTheDocument();
  });
});
