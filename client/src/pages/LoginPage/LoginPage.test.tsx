import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { OIDC_LOGIN_ERROR_CODES } from '@cornerstone/shared';
import i18n from '../../i18n/index.js';
import deAuth from '../../i18n/de/auth.json';
import { ApiClientError } from '../../lib/apiClient.js';
import enErrors from '../../i18n/en/errors.json';
import enAuth from '../../i18n/en/auth.json';
import type * as AuthApiTypes from '../../lib/authApi.js';
import type * as AuthContextTypes from '../../contexts/AuthContext.js';
import type * as ThemeContextTypes from '../../contexts/ThemeContext.js';
import type * as LoginPageTypes from './LoginPage.js';

const mockGetAuthMe = jest.fn<typeof AuthApiTypes.getAuthMe>();
const mockLogin = jest.fn<typeof AuthApiTypes.login>();
const mockLogout = jest.fn<typeof AuthApiTypes.logout>();

// Must mock BEFORE importing the component
jest.unstable_mockModule('../../lib/authApi.js', () => ({
  getAuthMe: mockGetAuthMe,
  login: mockLogin,
  logout: mockLogout,
}));

describe('LoginPage', () => {
  // Dynamic imports inside describe block to avoid top-level await
  let AuthContext: typeof AuthContextTypes;
  let ThemeContext: typeof ThemeContextTypes;
  let LoginPage: typeof LoginPageTypes.LoginPage;

  beforeEach(async () => {
    // Dynamic import modules (only once)
    if (!LoginPage) {
      AuthContext = await import('../../contexts/AuthContext.js');
      ThemeContext = await import('../../contexts/ThemeContext.js');
      const loginPageModule = await import('./LoginPage.js');
      LoginPage = loginPageModule.LoginPage;
    }

    // Reset mocks
    mockGetAuthMe.mockReset();
    mockLogin.mockReset();
    mockLogout.mockReset();

    // Default: OIDC disabled, no user
    mockGetAuthMe.mockResolvedValue({
      user: null,
      setupRequired: false,
      oidcEnabled: false,
    });

    // Reset URL to no query params
    window.history.pushState({}, '', '/login');
  });

  afterEach(() => {
    cleanup();
  });

  // Helper to wrap component in ThemeProvider, AuthProvider and MemoryRouter
  function renderWithAuth(ui: ReactNode) {
    const { AuthProvider } = AuthContext;
    const { ThemeProvider } = ThemeContext;
    return render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthProvider>{ui}</AuthProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );
  }

  it('renders the login form', async () => {
    renderWithAuth(<LoginPage />);

    await waitFor(() => {
      expect(mockGetAuthMe).toHaveBeenCalled();
    });

    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows "Login with SSO" button when oidcEnabled is true', async () => {
    mockGetAuthMe.mockResolvedValue({
      user: null,
      setupRequired: false,
      oidcEnabled: true,
    });

    renderWithAuth(<LoginPage />);

    const ssoButton = await screen.findByRole('button', { name: /login with sso/i });
    expect(ssoButton).toBeInTheDocument();

    // Divider with "or" text is shown (use exact text to avoid matching "Password" etc.)
    expect(screen.getByText('or')).toBeInTheDocument();
  });

  it('hides "Login with SSO" button when oidcEnabled is false', async () => {
    renderWithAuth(<LoginPage />);

    await waitFor(() => {
      expect(mockGetAuthMe).toHaveBeenCalled();
    });

    expect(screen.queryByRole('button', { name: /login with sso/i })).not.toBeInTheDocument();
  });

  it('shows OIDC error message from URL query parameter (oidc_error)', async () => {
    window.history.pushState({}, '', '/login?error=oidc_error');

    renderWithAuth(<LoginPage />);

    expect(await screen.findByText(/authentication failed/i)).toBeInTheDocument();
  });

  it('shows OIDC error message from URL query parameter (invalid_state)', async () => {
    window.history.pushState({}, '', '/login?error=invalid_state');

    renderWithAuth(<LoginPage />);

    expect(await screen.findByText(/authentication session expired/i)).toBeInTheDocument();
  });

  it('shows OIDC error message from URL query parameter (oidc_not_configured)', async () => {
    window.history.pushState({}, '', '/login?error=oidc_not_configured');

    renderWithAuth(<LoginPage />);

    expect(await screen.findByText(/single sign-on is not configured/i)).toBeInTheDocument();
  });

  it('shows OIDC error message from URL query parameter (missing_email)', async () => {
    window.history.pushState({}, '', '/login?error=missing_email');

    renderWithAuth(<LoginPage />);

    expect(
      await screen.findByText(/your identity provider did not provide an email address/i),
    ).toBeInTheDocument();
  });

  it('shows OIDC error message from URL query parameter (oidc_email_unverified)', async () => {
    window.history.pushState({}, '', '/login?error=oidc_email_unverified');

    renderWithAuth(<LoginPage />);

    expect(
      await screen.findByText(/did not confirm that your email address is verified/i),
    ).toBeInTheDocument();
  });

  it('no longer recognises the removed email_conflict error code', async () => {
    window.history.pushState({}, '', '/login?error=email_conflict');

    renderWithAuth(<LoginPage />);

    await waitFor(() => {
      expect(mockGetAuthMe).toHaveBeenCalled();
    });
    expect(screen.queryByText(/already associated with a different account/i)).toBeNull();
  });

  it('shows OIDC error message from URL query parameter (account_deactivated)', async () => {
    window.history.pushState({}, '', '/login?error=account_deactivated');

    renderWithAuth(<LoginPage />);

    expect(await screen.findByText(/your account has been deactivated/i)).toBeInTheDocument();
  });

  it('shows OIDC error message from URL query parameter (oidc_no_matching_account)', async () => {
    window.history.pushState({}, '', '/login?error=oidc_no_matching_account');

    renderWithAuth(<LoginPage />);

    expect(
      await screen.findByText(
        /no account was found for your email address\. please contact an administrator to have an account created for you/i,
      ),
    ).toBeInTheDocument();
  });

  it('does not show error message when no error in URL', async () => {
    renderWithAuth(<LoginPage />);

    await waitFor(() => {
      expect(mockGetAuthMe).toHaveBeenCalled();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores unknown error codes', async () => {
    window.history.pushState({}, '', '/login?error=unknown_error_code');

    renderWithAuth(<LoginPage />);

    await waitFor(() => {
      expect(mockGetAuthMe).toHaveBeenCalled();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('SSO button is clickable and triggers navigation', async () => {
    mockGetAuthMe.mockResolvedValue({
      user: null,
      setupRequired: false,
      oidcEnabled: true,
    });

    const user = userEvent.setup();
    renderWithAuth(<LoginPage />);

    const ssoButton = await screen.findByRole('button', { name: /login with sso/i });

    // Verify button is enabled and not disabled
    expect(ssoButton).toBeEnabled();
    expect(ssoButton).toHaveAttribute('type', 'button');

    // The component sets window.location.href = '/api/auth/oidc/login' on click.
    // jsdom doesn't support navigation, so we verify the button is interactive.
    // The actual navigation target ('/api/auth/oidc/login') is verified by the
    // component's source code and integration tests.
    await user.click(ssoButton);
  });

  it('hides SSO button during loading (isLoadingConfig=true)', () => {
    mockGetAuthMe.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves */
        }),
    );

    renderWithAuth(<LoginPage />);

    expect(screen.queryByRole('button', { name: /login with sso/i })).not.toBeInTheDocument();
  });

  it('shows error message in alert role for accessibility', async () => {
    window.history.pushState({}, '', '/login?error=oidc_error');

    renderWithAuth(<LoginPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/authentication failed/i);
  });

  it('form validation shows email error when email is empty', async () => {
    renderWithAuth(<LoginPage />);

    await waitFor(() => {
      expect(mockGetAuthMe).toHaveBeenCalled();
    });

    const user = userEvent.setup();
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitButton);

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
  });

  it('form validation shows password error when password is empty', async () => {
    renderWithAuth(<LoginPage />);

    await waitFor(() => {
      expect(mockGetAuthMe).toHaveBeenCalled();
    });

    const user = userEvent.setup();
    const emailInput = screen.getByLabelText(/email/i);
    await user.type(emailInput, 'user@example.com');

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitButton);

    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
  });

  it('successful login calls API with correct credentials', async () => {
    renderWithAuth(<LoginPage />);

    await waitFor(() => {
      expect(mockGetAuthMe).toHaveBeenCalled();
    });

    mockLogin.mockResolvedValue({ user: { id: 'test', email: 'test@example.com' } } as never);

    const user = userEvent.setup();
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    await user.type(emailInput, 'user@example.com');
    await user.type(passwordInput, 'password123');

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'password123',
      });
    });

    // After successful login, the component redirects via window.location.href = '/'
    // In jsdom this triggers navigation; verify the login was called correctly above
  });

  async function submitCredentials() {
    renderWithAuth(<LoginPage />);
    await waitFor(() => {
      expect(mockGetAuthMe).toHaveBeenCalled();
    });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
  }

  it('shows the translated error for an ApiClientError, never the server text', async () => {
    mockLogin.mockRejectedValue(
      new ApiClientError(401, { code: 'INVALID_CREDENTIALS', message: 'RAW-SERVER-SENTINEL' }),
    );

    await submitCredentials();

    expect(await screen.findByText(enErrors.INVALID_CREDENTIALS)).toBeInTheDocument();
    expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).not.toBeInTheDocument();
  });

  it('shows the fallback login error for a non-API failure, never its message', async () => {
    mockLogin.mockRejectedValue(new Error('RAW-LOCAL'));

    await submitCredentials();

    expect(await screen.findByText(enAuth.login.error)).toBeInTheDocument();
    expect(screen.queryByText(/RAW-LOCAL/)).not.toBeInTheDocument();
  });

  describe('derived OIDC error banner', () => {
    it.each(OIDC_LOGIN_ERROR_CODES)(
      'renders the English message in role="alert" for ?error=%s',
      async (code) => {
        window.history.pushState({}, '', `/login?error=${code}`);

        renderWithAuth(<LoginPage />);

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(enAuth.login.oidcErrors[code]);
      },
    );

    it('renders no alert for an unknown ?error= code', async () => {
      window.history.pushState({}, '', '/login?error=bogus');

      renderWithAuth(<LoginPage />);

      await waitFor(() => {
        expect(mockGetAuthMe).toHaveBeenCalled();
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('follows a locale switch without a reload', async () => {
      window.history.pushState({}, '', '/login?error=oidc_error');
      renderWithAuth(<LoginPage />);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        enAuth.login.oidcErrors.oidc_error,
      );

      try {
        await act(async () => {
          await i18n.changeLanguage('de');
        });

        expect(screen.getByRole('alert')).toHaveTextContent(deAuth.login.oidcErrors.oidc_error);
      } finally {
        await act(async () => {
          await i18n.changeLanguage('en');
        });
      }
    });

    it('clears the OIDC banner when the form is submitted', async () => {
      window.history.pushState({}, '', '/login?error=oidc_error');
      mockLogin.mockResolvedValue({ user: { id: 'test', email: 'test@example.com' } } as never);
      renderWithAuth(<LoginPage />);
      await screen.findByRole('alert');

      const user = userEvent.setup();
      await user.type(screen.getByLabelText(/email/i), 'user@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalled();
      });
      expect(screen.queryByText(enAuth.login.oidcErrors.oidc_error)).not.toBeInTheDocument();
    });

    it('replaces the OIDC error banner with the API error after a failed submit', async () => {
      window.history.pushState({}, '', '/login?error=oidc_error');
      mockLogin.mockRejectedValue(new Error('boom'));
      renderWithAuth(<LoginPage />);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        enAuth.login.oidcErrors.oidc_error,
      );

      const user = userEvent.setup();
      await user.type(screen.getByLabelText(/email/i), 'user@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      // Submitting clears the OIDC code, so only the API error banner remains (the both-set
      // state is unreachable from the UI).
      expect(await screen.findByText(enAuth.login.error)).toBeInTheDocument();
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(screen.queryByText(enAuth.login.oidcErrors.oidc_error)).not.toBeInTheDocument();
    });
  });

  describe('OIDC error banner focus', () => {
    it('focuses the alert after the initial render for a URL-derived error', async () => {
      window.history.pushState({}, '', '/login?error=oidc_error');

      renderWithAuth(<LoginPage />);

      const alert = await screen.findByRole('alert');
      expect(document.activeElement).toBe(alert);
    });

    it('does not auto-focus the API error banner after a failed submit', async () => {
      mockLogin.mockRejectedValue(new Error('boom'));
      renderWithAuth(<LoginPage />);
      await waitFor(() => {
        expect(mockGetAuthMe).toHaveBeenCalled();
      });

      const user = userEvent.setup();
      await user.type(screen.getByLabelText(/email/i), 'user@example.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(enAuth.login.error);
      expect(document.activeElement).not.toBe(alert);
    });

    it('does not force focus anywhere when there is no ?error', async () => {
      renderWithAuth(<LoginPage />);
      await waitFor(() => {
        expect(mockGetAuthMe).toHaveBeenCalled();
      });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(document.activeElement).toBe(document.body);
    });
  });
});
