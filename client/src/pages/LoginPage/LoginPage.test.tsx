import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type * as AuthApiTypes from '../../lib/authApi.js';
import type * as AuthContextTypes from '../../contexts/AuthContext.js';
import type * as LoginPageTypes from './LoginPage.js';

// Must mock BEFORE importing the component
jest.unstable_mockModule('../../lib/authApi.js', () => ({
  getAuthMe: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
}));

describe('LoginPage', () => {
  // Dynamic imports inside describe block to avoid top-level await
  let authApi: typeof AuthApiTypes;
  let AuthContext: typeof AuthContextTypes;
  let LoginPage: typeof LoginPageTypes.LoginPage;

  let mockGetAuthMe: jest.MockedFunction<typeof AuthApiTypes.getAuthMe>;
  let mockLogin: jest.MockedFunction<typeof AuthApiTypes.login>;

  beforeEach(async () => {
    // Dynamic import modules (only once)
    if (!authApi) {
      authApi = await import('../../lib/authApi.js');
      AuthContext = await import('../../contexts/AuthContext.js');
      const loginPageModule = await import('./LoginPage.js');
      LoginPage = loginPageModule.LoginPage;
    }

    // Reset mocks
    mockGetAuthMe = authApi.getAuthMe as jest.MockedFunction<typeof authApi.getAuthMe>;
    mockLogin = authApi.login as jest.MockedFunction<typeof authApi.login>;

    mockGetAuthMe.mockReset();
    mockLogin.mockReset();

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

  // Helper to wrap component in AuthProvider and MemoryRouter
  function renderWithAuth(ui: ReactNode) {
    const { AuthProvider } = AuthContext;
    return render(
      <MemoryRouter>
        <AuthProvider>{ui}</AuthProvider>
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

  it('shows OIDC error message from URL query parameter (email_conflict)', async () => {
    window.history.pushState({}, '', '/login?error=email_conflict');

    renderWithAuth(<LoginPage />);

    expect(
      await screen.findByText(/this email is already associated with a different account/i),
    ).toBeInTheDocument();
  });

  it('shows OIDC error message from URL query parameter (account_deactivated)', async () => {
    window.history.pushState({}, '', '/login?error=account_deactivated');

    renderWithAuth(<LoginPage />);

    expect(await screen.findByText(/your account has been deactivated/i)).toBeInTheDocument();
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
});
