import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as AuthContextTypes from '../../contexts/AuthContext.js';
import type * as LocaleContextTypes from '../../contexts/LocaleContext.js';
import type * as ThemeContextTypes from '../../contexts/ThemeContext.js';
import type * as ProfilePageTypes from './ProfilePage.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { ownNavigations } from '../../test/navLandmarks.js';
import enErrors from '../../i18n/en/errors.json';

const mockUpdateProfile = jest.fn<typeof UsersApiTypes.updateProfile>();
const mockChangePassword = jest.fn<typeof UsersApiTypes.changePassword>();
const mockUseAuth = jest.fn<typeof AuthContextTypes.useAuth>();
const mockSetLocale = jest.fn<(locale: LocaleContextTypes.LocalePreference) => void>();
const mockSetTheme = jest.fn<(theme: ThemeContextTypes.ThemePreference) => void>();
let localePreference: LocaleContextTypes.LocalePreference = 'en';
let themePreference: ThemeContextTypes.ThemePreference = 'system';

jest.unstable_mockModule('../../lib/usersApi.js', () => ({
  updateProfile: mockUpdateProfile,
  changePassword: mockChangePassword,
}));

jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: () => ({
    locale: localePreference,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: mockSetLocale,
    syncWithServer: jest.fn(),
  }),
  LocaleProvider: ({ children }: { children: ReactNode }) => children,
}));

jest.unstable_mockModule('../../contexts/ThemeContext.js', () => ({
  useTheme: () => ({
    theme: themePreference,
    resolvedTheme: 'light' as const,
    setTheme: mockSetTheme,
    syncWithServer: jest.fn(),
  }),
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}));

// The sync section has its own tests; here it only has to sit in the right place.
jest.unstable_mockModule('../../components/DavAccessCard/DavAccessCard.js', () => ({
  DavAccessCard: () => (
    <section aria-labelledby="calendar-sync" data-testid="account-sync">
      <h2 id="calendar-sync">Calendar &amp; contacts sync</h2>
    </section>
  ),
}));

jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtDate = (d: string | null | undefined, fallback = '—') => {
    if (!d) return fallback;
    const [year, month, day] = d.slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return fallback;
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  return {
    formatDate: fmtDate,
    useFormatters: () => ({ formatDate: fmtDate }),
  };
});

describe('ProfilePage', () => {
  let ProfilePage: typeof ProfilePageTypes.ProfilePage;

  const mockLocalUser = {
    id: 'user-123',
    email: 'local@example.com',
    displayName: 'Local User',
    role: 'member' as const,
    authProvider: 'local' as const,
    oidcLinked: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deactivatedAt: null,
  };

  const mockOidcUser = {
    ...mockLocalUser,
    id: 'user-456',
    email: 'oidc@example.com',
    displayName: 'OIDC User',
    role: 'admin' as const,
    authProvider: 'oidc' as const,
    oidcLinked: true,
  };

  const refreshAuth = jest.fn(async () => Promise.resolve());

  function setAuth(
    overrides: Partial<ReturnType<typeof AuthContextTypes.useAuth>> = {},
  ): ReturnType<typeof AuthContextTypes.useAuth> {
    const value = {
      user: mockLocalUser,
      oidcEnabled: false,
      isLoading: false,
      error: null,
      refreshAuth,
      logout: jest.fn(async () => Promise.resolve()),
      ...overrides,
    } as ReturnType<typeof AuthContextTypes.useAuth>;
    mockUseAuth.mockReturnValue(value);
    return value;
  }

  beforeEach(async () => {
    if (!ProfilePage) {
      ({ ProfilePage } = await import('./ProfilePage.js'));
    }
    mockUseAuth.mockReset();
    mockUpdateProfile.mockReset();
    mockChangePassword.mockReset();
    mockSetLocale.mockReset();
    mockSetTheme.mockReset();
    refreshAuth.mockReset();
    refreshAuth.mockResolvedValue(undefined);
    localePreference = 'en';
    themePreference = 'system';
    setAuth();
  });

  afterEach(() => {
    cleanup();
  });

  function page() {
    return (
      <MemoryRouter initialEntries={['/settings/profile']}>
        <ProfilePage />
      </MemoryRouter>
    );
  }

  function renderPage() {
    return render(page());
  }

  const saveButton = () => screen.getByTestId('account-display-name-save');
  const nameInput = () => screen.getByLabelText('Display name');

  describe('page identity (#2204)', () => {
    it('renders exactly one level-1 heading, "Account"', () => {
      renderPage();
      const h1s = screen.getAllByRole('heading', { level: 1 });
      expect(h1s).toHaveLength(1);
      expect(h1s[0]).toHaveTextContent(/^Account$/);
    });

    it('sets the tab title to "Account · Settings · Cornerstone"', () => {
      renderPage();
      expect(document.title).toBe('Account · Settings · Cornerstone');
    });

    it('keeps the "Account" h1 while loading and in the load-error state', () => {
      setAuth({ user: null, isLoading: true });
      renderPage();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Account$/);
      cleanup();
      setAuth({ user: null, error: 'Failed' });
      renderPage();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Account$/);
    });

    it('shows no "You are here" trail, no Back link and no navigation of its own', () => {
      renderPage();
      expect(screen.queryByRole('navigation', { name: 'You are here' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /back/i })).not.toBeInTheDocument();
      expect(ownNavigations(document.body)).toHaveLength(0);
    });
  });

  describe('states', () => {
    it('shows a skeleton and no sections while the user loads', () => {
      setAuth({ user: null, isLoading: true });
      renderPage();
      expect(screen.queryByTestId('account-profile')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
      expect(document.querySelector('[aria-busy="true"], [class*="skeleton" i]')).not.toBeNull();
    });

    it('shows the load error in a FormError and no sections', () => {
      setAuth({ user: null, error: 'Could not load your account.' });
      renderPage();
      expect(screen.getByText('Could not load your account.')).toBeInTheDocument();
      expect(screen.queryByTestId('account-profile')).not.toBeInTheDocument();
    });

    it('renders nothing but the layout when there is no user and no error', () => {
      setAuth({ user: null });
      renderPage();
      expect(screen.queryByTestId('account-profile')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    });
  });

  describe('section structure', () => {
    it('shows the four sections in order: details, sync, preferences, password', () => {
      renderPage();
      const ids = ['account-profile', 'account-sync', 'account-preferences', 'account-password'];
      const sections = ids.map((id) => screen.getByTestId(id));
      for (let i = 0; i < sections.length - 1; i++) {
        const current = sections[i];
        const next = sections[i + 1];
        if (!current || !next) throw new Error('missing section');
        expect(
          current.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
      const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
      expect(headings).toEqual([
        'Your details',
        'Calendar & contacts sync',
        'Preferences',
        'Password',
      ]);
      expect(headings[0]).toBe('Your details');
    });

    it('labels each own section by its h2', () => {
      renderPage();
      for (const [testId, name] of [
        ['account-profile', 'Your details'],
        ['account-preferences', 'Preferences'],
        ['account-password', 'Password'],
      ] as const) {
        expect(screen.getByTestId(testId)).toHaveAccessibleName(name);
      }
    });

    it('lists the facts as dt/dd pairs, with Member since formatted', () => {
      renderPage();
      const facts = screen.getByTestId('account-profile').querySelector('dl');
      expect(facts).not.toBeNull();
      if (!facts) throw new Error('missing dl');
      const terms = Array.from(facts.querySelectorAll('dt')).map((dt) => dt.textContent);
      expect(terms).toEqual(['Email', 'Role', 'Member since']);
      const values = Array.from(facts.querySelectorAll('dd')).map((dd) => dd.textContent);
      expect(values).toEqual(['local@example.com', 'Member', 'Jan 1, 2024']);
    });

    it('shows the Administrator role for an admin', () => {
      setAuth({ user: { ...mockLocalUser, role: 'admin' } });
      renderPage();
      expect(screen.getByText('Administrator')).toBeInTheDocument();
    });
  });

  describe('Sign-in method row gate', () => {
    const cases: [string, boolean, 'local' | 'oidc', boolean, string | null][] = [
      ['hidden: SSO off, local, not linked', false, 'local', false, null],
      ['"Email and password": SSO configured, local', true, 'local', false, 'Email and password'],
      [
        '"Email, password and single sign-on": local account linked to SSO',
        false,
        'local',
        true,
        'Email, password and single sign-on',
      ],
      ['"Single sign-on": SSO account, SSO now off', false, 'oidc', true, 'Single sign-on'],
      ['"Single sign-on": SSO account not marked linked', false, 'oidc', false, 'Single sign-on'],
    ];

    it.each(cases)('%s', (_name, oidcEnabled, authProvider, oidcLinked, expected) => {
      setAuth({ oidcEnabled, user: { ...mockLocalUser, authProvider, oidcLinked } });
      renderPage();
      if (expected === null) {
        expect(screen.queryByText('Sign-in method')).not.toBeInTheDocument();
      } else {
        const term = screen.getByText('Sign-in method');
        expect(term.tagName).toBe('DT');
        expect(term.nextElementSibling).toHaveTextContent(new RegExp(`^${expected}$`));
      }
    });
  });

  describe('Password form versus single sign-on note', () => {
    it('gives a local account the three fields and a Change password button', () => {
      renderPage();
      expect(screen.getByLabelText('Current password')).toBeInTheDocument();
      expect(screen.getByLabelText('New password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument();
      expect(screen.getByText('Use at least 12 characters.')).toBeInTheDocument();
      expect(
        screen.queryByText('Your password is managed by your single sign-on provider.'),
      ).not.toBeInTheDocument();
    });

    it('gives an SSO-only account the note and no form', () => {
      setAuth({ user: mockOidcUser, oidcEnabled: true });
      renderPage();
      expect(
        screen.getByText('Your password is managed by your single sign-on provider.'),
      ).toBeInTheDocument();
      expect(document.getElementById('currentPassword')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Change password' })).not.toBeInTheDocument();
    });

    it('keeps the form for a local account linked to single sign-on', () => {
      setAuth({ user: { ...mockLocalUser, oidcLinked: true }, oidcEnabled: true });
      renderPage();
      expect(document.getElementById('currentPassword')).not.toBeNull();
      expect(
        screen.queryByText('Your password is managed by your single sign-on provider.'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Display name', () => {
    it('shows the current name and a Save button that is aria-disabled when unchanged', async () => {
      const user = userEvent.setup();
      renderPage();
      expect(nameInput()).toHaveValue('Local User');
      expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
      expect(saveButton()).not.toBeDisabled();
      await user.click(saveButton());
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('treats a whitespace-only change as unchanged', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.type(nameInput(), '  ');
      expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
      await user.click(saveButton());
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('enables Save on an edit, saves the trimmed name and keeps focus on Save', async () => {
      const user = userEvent.setup();
      mockUpdateProfile.mockResolvedValue({ ...mockLocalUser, displayName: 'Sam' });
      renderPage();
      await user.clear(nameInput());
      await user.type(nameInput(), '  Sam Sample  ');
      expect(saveButton()).not.toHaveAttribute('aria-disabled');

      saveButton().focus();
      await user.click(saveButton());

      await waitFor(() =>
        expect(mockUpdateProfile).toHaveBeenCalledWith({ displayName: 'Sam Sample' }),
      );
      expect(refreshAuth).toHaveBeenCalledTimes(1);
      const banner = await screen.findByText('Display name updated successfully');
      expect(banner).toHaveAttribute('role', 'status');
      expect(saveButton()).toHaveFocus();
    });

    it('shows a field error, marks the input invalid, focuses it and makes no API call when empty', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.clear(nameInput());
      await user.click(saveButton());

      const error = await screen.findByText('Display name is required');
      expect(error).toHaveAttribute('role', 'alert');
      expect(error).toHaveAttribute('id', 'displayName-error');
      expect(nameInput()).toHaveAttribute('aria-invalid', 'true');
      expect(nameInput()).toHaveAttribute('aria-describedby', 'displayName-error');
      expect(nameInput()).toHaveFocus();
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('rejects a name over 100 characters through the validator', async () => {
      renderPage();
      const input = nameInput();
      input.removeAttribute('maxlength');
      fireEvent.change(input, { target: { value: 'x'.repeat(101) } });
      fireEvent.click(saveButton());
      expect(await screen.findByText('Display name must be 100 characters or less')).toBeVisible();
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('caps the input at 100 characters', () => {
      renderPage();
      expect(nameInput()).toHaveAttribute('maxlength', '100');
    });

    it('shows a translated alert banner for an API error', async () => {
      const user = userEvent.setup();
      mockUpdateProfile.mockRejectedValue(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
      );
      renderPage();
      await user.type(nameInput(), ' B');
      await user.click(saveButton());

      const banner = await screen.findByText(enErrors.INTERNAL_ERROR);
      expect(banner).toHaveAttribute('role', 'alert');
      expect(screen.queryByText('RAW-SERVER-SENTINEL')).not.toBeInTheDocument();
      expect(refreshAuth).not.toHaveBeenCalled();
    });

    it('shows the generic failure message for a non-API error', async () => {
      const user = userEvent.setup();
      mockUpdateProfile.mockRejectedValue(new Error('offline'));
      renderPage();
      await user.type(nameInput(), ' B');
      await user.click(saveButton());
      expect(
        await screen.findByText('Failed to update display name. Please try again.'),
      ).toHaveAttribute('role', 'alert');
    });

    it('clears banners and the field error as soon as the user types', async () => {
      const user = userEvent.setup();
      mockUpdateProfile.mockRejectedValue(new Error('offline'));
      renderPage();
      await user.type(nameInput(), ' B');
      await user.click(saveButton());
      await screen.findByText('Failed to update display name. Please try again.');

      await user.type(nameInput(), 'x');
      expect(
        screen.queryByText('Failed to update display name. Please try again.'),
      ).not.toBeInTheDocument();

      await user.clear(nameInput());
      await user.click(saveButton());
      await screen.findByText('Display name is required');
      await user.type(nameInput(), 'Q');
      expect(screen.queryByText('Display name is required')).not.toBeInTheDocument();
      expect(nameInput()).toHaveAttribute('aria-invalid', 'false');
    });

    it('submits on Enter in the field', async () => {
      const user = userEvent.setup();
      mockUpdateProfile.mockResolvedValue({ ...mockLocalUser, displayName: 'Q' });
      renderPage();
      await user.type(nameInput(), 'Z{Enter}');
      await waitFor(() =>
        expect(mockUpdateProfile).toHaveBeenCalledWith({ displayName: 'Local UserZ' }),
      );
    });

    it('is readOnly (not disabled), aria-disabled and does not double-submit while busy', async () => {
      const user = userEvent.setup();
      let resolve!: (value: Awaited<ReturnType<typeof UsersApiTypes.updateProfile>>) => void;
      mockUpdateProfile.mockImplementation(() => new Promise((r) => (resolve = r)));
      renderPage();
      await user.type(nameInput(), 'Z');
      await user.click(saveButton());

      await waitFor(() => expect(nameInput()).toHaveAttribute('readonly'));
      expect(nameInput()).not.toBeDisabled();
      expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
      expect(saveButton()).toHaveTextContent('Saving...');
      fireEvent.submit(nameInput().closest('form') as HTMLFormElement);
      expect(mockUpdateProfile).toHaveBeenCalledTimes(1);

      resolve({ ...mockLocalUser, displayName: 'Local UserZ' });
      await waitFor(() => expect(nameInput()).not.toHaveAttribute('readonly'));
    });
  });

  describe('Display name re-sync (D9)', () => {
    it('keeps an unsaved edit when auth hands over a new user object with the same name', async () => {
      const user = userEvent.setup();
      const utils = renderPage();
      await user.type(nameInput(), ' edited');

      setAuth({ user: { ...mockLocalUser, updatedAt: '2025-01-01T00:00:00.000Z' } });
      utils.rerender(page());

      expect(nameInput()).toHaveValue('Local User edited');
    });

    it('keeps an unsaved edit across a language switch', async () => {
      const user = userEvent.setup();
      const utils = renderPage();
      await user.type(nameInput(), ' edited');

      localePreference = 'de';
      setAuth({ user: { ...mockLocalUser } });
      utils.rerender(page());

      expect(nameInput()).toHaveValue('Local User edited');
    });

    it('resets the field when the saved name changes', async () => {
      const user = userEvent.setup();
      const utils = renderPage();
      await user.type(nameInput(), ' edited');

      setAuth({ user: { ...mockLocalUser, displayName: 'Renamed Elsewhere' } });
      utils.rerender(page());

      expect(nameInput()).toHaveValue('Renamed Elsewhere');
    });
  });

  describe('Password form', () => {
    const current = () => screen.getByLabelText('Current password');
    const next = () => screen.getByLabelText('New password');
    const confirm = () => screen.getByLabelText('Confirm new password');
    const submit = () => screen.getByTestId('account-password-submit');

    it('requires every field, and focuses the first invalid one (current)', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(submit());

      expect(await screen.findByText('Current password is required')).toBeInTheDocument();
      expect(screen.getByText('New password is required')).toBeInTheDocument();
      expect(screen.getByText('Please confirm your new password')).toBeInTheDocument();
      expect(current()).toHaveFocus();
      expect(current()).toHaveAttribute('aria-invalid', 'true');
      expect(current()).toHaveAttribute('aria-describedby', 'currentPassword-error');
      expect(mockChangePassword).not.toHaveBeenCalled();
    });

    it('focuses the new password when only it is invalid (too short)', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.type(current(), 'old-password');
      await user.type(next(), 'short');
      await user.type(confirm(), 'short');
      await user.click(submit());

      expect(await screen.findByText('New password must be at least 12 characters')).toBeVisible();
      expect(next()).toHaveFocus();
      expect(next()).toHaveAttribute('aria-describedby', 'newPassword-error');
    });

    it('focuses the confirm field when only the confirmation mismatches', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.type(current(), 'old-password');
      await user.type(next(), 'a-long-enough-password');
      await user.type(confirm(), 'a-different-password');
      await user.click(submit());

      expect(await screen.findByText('Passwords do not match')).toBeVisible();
      expect(confirm()).toHaveFocus();
      expect(confirm()).toHaveAttribute('aria-describedby', 'confirmPassword-error');
    });

    it('requires a new password when only the current one is given', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.type(current(), 'old-password');
      await user.click(submit());
      expect(await screen.findByText('New password is required')).toBeVisible();
      expect(next()).toHaveFocus();
    });

    it('changes the password, clears the fields, shows a banner and keeps focus on submit', async () => {
      const user = userEvent.setup();
      mockChangePassword.mockResolvedValue(undefined);
      renderPage();
      await user.type(current(), 'old-password');
      await user.type(next(), 'a-long-enough-password');
      await user.type(confirm(), 'a-long-enough-password');
      submit().focus();
      await user.click(submit());

      await waitFor(() =>
        expect(mockChangePassword).toHaveBeenCalledWith({
          currentPassword: 'old-password',
          newPassword: 'a-long-enough-password',
        }),
      );
      const banner = await screen.findByText('Password changed successfully');
      expect(banner).toHaveAttribute('role', 'status');
      expect(current()).toHaveValue('');
      expect(next()).toHaveValue('');
      expect(confirm()).toHaveValue('');
      expect(submit()).toHaveFocus();
    });

    it('shows a translated alert banner for an API error and keeps the fields', async () => {
      const user = userEvent.setup();
      mockChangePassword.mockRejectedValue(
        new ApiClientError(401, { code: 'UNAUTHORIZED', message: 'Unauthorized' }),
      );
      renderPage();
      await user.type(current(), 'old-password');
      await user.type(next(), 'a-long-enough-password');
      await user.type(confirm(), 'a-long-enough-password');
      await user.click(submit());

      const banner = await screen.findByText(enErrors.UNAUTHORIZED);
      expect(banner).toHaveAttribute('role', 'alert');
      expect(current()).toHaveValue('old-password');
    });

    it('shows the generic failure message for a non-API error, and typing clears it', async () => {
      const user = userEvent.setup();
      mockChangePassword.mockRejectedValue(new Error('offline'));
      renderPage();
      await user.type(current(), 'old-password');
      await user.type(next(), 'a-long-enough-password');
      await user.type(confirm(), 'a-long-enough-password');
      await user.click(submit());
      await screen.findByText('Failed to change password. Please try again.');

      await user.type(current(), 'x');
      expect(
        screen.queryByText('Failed to change password. Please try again.'),
      ).not.toBeInTheDocument();
      await user.type(next(), 'y');
      await user.type(confirm(), 'z');
    });

    it('is aria-disabled with readOnly fields (not disabled) while busy, and ignores re-submits', async () => {
      const user = userEvent.setup();
      let resolve!: () => void;
      mockChangePassword.mockImplementation(() => new Promise<void>((r) => (resolve = r)));
      renderPage();
      await user.type(current(), 'old-password');
      await user.type(next(), 'a-long-enough-password');
      await user.type(confirm(), 'a-long-enough-password');
      await user.click(submit());

      await waitFor(() => expect(submit()).toHaveAttribute('aria-disabled', 'true'));
      expect(submit()).not.toBeDisabled();
      expect(submit()).toHaveTextContent('Changing password...');
      for (const field of [current(), next(), confirm()]) {
        expect(field).toHaveAttribute('readonly');
        expect(field).not.toBeDisabled();
      }
      fireEvent.submit(current().closest('form') as HTMLFormElement);
      expect(mockChangePassword).toHaveBeenCalledTimes(1);

      resolve();
      await waitFor(() => expect(submit()).not.toHaveAttribute('aria-disabled'));
    });
  });

  describe('Preferences', () => {
    const language = () => screen.getByLabelText('Language') as HTMLSelectElement;
    const theme = () => screen.getByLabelText('Theme') as HTMLSelectElement;

    it('reads Language and Theme from the preference, as .select controls', () => {
      renderPage();
      const prefs = screen.getByTestId('account-preferences');
      expect(within(prefs).getByLabelText('Language').tagName).toBe('SELECT');
      expect(language().className).toMatch(/select/);
      expect(theme().className).toMatch(/select/);
    });

    it('lists the languages as endonyms with their lang attribute, then System', () => {
      renderPage();
      const options = Array.from(language().options);
      expect(options.map((o) => [o.value, o.textContent, o.getAttribute('lang')])).toEqual([
        ['en', 'English', 'en'],
        ['de', 'Deutsch', 'de'],
        ['system', 'System (browser language)', null],
      ]);
    });

    it('shows "system" when the language preference is system', () => {
      localePreference = 'system';
      renderPage();
      expect(language().value).toBe('system');
    });

    it('changing the language calls setLocale', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.selectOptions(language(), 'de');
      expect(mockSetLocale).toHaveBeenCalledWith('de');
    });

    it('ignores an unknown language value', () => {
      renderPage();
      fireEvent.change(language(), { target: { value: 'xx' } });
      expect(mockSetLocale).not.toHaveBeenCalled();
    });

    it('lists Light, Dark and System and shows the preference (not the resolved theme)', () => {
      themePreference = 'system';
      renderPage();
      expect(Array.from(theme().options).map((o) => [o.value, o.textContent])).toEqual([
        ['light', 'Light'],
        ['dark', 'Dark'],
        ['system', 'System'],
      ]);
      expect(theme().value).toBe('system');
    });

    it('shows an explicit theme preference', () => {
      themePreference = 'dark';
      renderPage();
      expect(theme().value).toBe('dark');
    });

    it('changing the theme calls setTheme', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.selectOptions(theme(), 'dark');
      expect(mockSetTheme).toHaveBeenCalledWith('dark');
    });

    it('ignores an unknown theme value', () => {
      renderPage();
      fireEvent.change(theme(), { target: { value: 'sepia' } });
      expect(mockSetTheme).not.toHaveBeenCalled();
    });
  });
});
