/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ApiClientError } from '../../lib/apiClient.js';
import enErrors from '../../i18n/en/errors.json';
import enAuth from '../../i18n/en/auth.json';
import type * as AuthApiTypes from '../../lib/authApi.js';
import type * as ThemeContextTypes from '../../contexts/ThemeContext.js';
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

  beforeEach(async () => {
    if (!SetupPage) {
      ({ SetupPage } = await import('./SetupPage.js'));
      ({ ThemeProvider } = await import('../../contexts/ThemeContext.js'));
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
          <Routes>
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/login" element={<div>LOGIN PAGE</div>} />
          </Routes>
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

  it('still renders the form when the setup check itself fails', async () => {
    mockGetAuthMe.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('heading', { name: enAuth.setup.title })).toBeInTheDocument();
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
