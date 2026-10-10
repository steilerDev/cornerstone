/**
 * @jest-environment jsdom
 */
/**
 * Component tests for UserManagementPage.tsx
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type { ReactNode } from 'react';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as AuthContextTypes from '../../contexts/AuthContext.js';
import type { UserResponse } from '@cornerstone/shared';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import enErrors from '../../i18n/en/errors.json';
import enSettings from '../../i18n/en/settings.json';
import enCommon from '../../i18n/en/common.json';
import type * as PreferencesApiTypes from '../../lib/preferencesApi.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';

// ─── Mock modules BEFORE importing component ────────────────────────────────

// Mock preferencesApi — DataTable calls useColumnPreferences -> usePreferences -> listPreferences
const mockListPreferencesUsers = jest
  .fn<typeof PreferencesApiTypes.listPreferences>()
  .mockResolvedValue([]);
jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: mockListPreferencesUsers,
  upsertPreference: jest
    .fn<typeof PreferencesApiTypes.upsertPreference>()
    .mockResolvedValue({ key: '', value: '', updatedAt: '' }),
  deletePreference: jest
    .fn<typeof PreferencesApiTypes.deletePreference>()
    .mockResolvedValue(undefined),
}));

const mockUseAuth = jest.fn<typeof AuthContextTypes.useAuth>();

jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

const mockListUsers = jest.fn<typeof UsersApiTypes.listUsers>();
const mockAdminUpdateUser = jest.fn<typeof UsersApiTypes.adminUpdateUser>();
const mockDeactivateUser = jest.fn<typeof UsersApiTypes.deactivateUser>();
const mockCreateUser = jest.fn<typeof UsersApiTypes.createUser>();

jest.unstable_mockModule('../../lib/usersApi.js', () => ({
  listUsers: mockListUsers,
  adminUpdateUser: mockAdminUpdateUser,
  createUser: mockCreateUser,
  deactivateUser: mockDeactivateUser,
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
  changePassword: jest.fn(),
}));

// Mock formatters
jest.unstable_mockModule('../../lib/formatters.js', () => ({
  formatDayRange: (start: Date, end: Date) =>
    `${start.toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)}`,
  useFormatters: () => ({
    formatDate: (d: string | null | undefined) => (d ? '01/01/2026' : '—'),
    formatCurrency: (n: number) => `€${n.toFixed(2)}`,
    formatPercent: (n: number) => `${n}%`,
  }),
  formatDate: (d: string | null | undefined) => (d ? '01/01/2026' : '—'),
  formatCurrency: (n: number) => `€${n.toFixed(2)}`,
  formatPercent: (n: number) => `${n}%`,
}));

// ─── Fixtures ──────────────────────────────────────────────────────────────

const makeUser = (overrides: Partial<UserResponse> = {}): UserResponse => ({
  id: 'user-1',
  displayName: 'Alice Admin',
  email: 'alice@example.com',
  role: 'admin',
  authProvider: 'local',
  oidcLinked: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  deactivatedAt: null,
  ...overrides,
});

const adminUser = makeUser({ id: 'current-admin', role: 'admin', displayName: 'Current Admin' });

// ─── Component import (must be after mocks) ──────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let UserManagementPage: any;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/settings/users']}>
        <UserManagementPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UserManagementPage', () => {
  beforeEach(async () => {
    if (!UserManagementPage) {
      const module = await import('./UserManagementPage.js');
      UserManagementPage = module.UserManagementPage;
    }
    // Reset mocks to clear call history AND queued Once implementations from prior tests.
    mockListUsers.mockReset();
    mockAdminUpdateUser.mockReset();
    mockDeactivateUser.mockReset();
    mockCreateUser.mockReset();
    mockListPreferencesUsers.mockReset();
    mockListPreferencesUsers.mockResolvedValue([]);
    mockUseAuth.mockReturnValue({
      user: adminUser,
      oidcEnabled: false,
      isLoading: false,
      error: null,
      refreshAuth: jest.fn<() => Promise<void>>(),
      logout: jest.fn<() => Promise<void>>(),
    });
    mockListUsers.mockResolvedValue({ users: [] });
    mockAdminUpdateUser.mockResolvedValue(makeUser());
    mockDeactivateUser.mockResolvedValue(undefined);
  });

  describe('page identity (#2204)', () => {
    it('renders exactly one level-1 heading, "Users", while loading', () => {
      mockListUsers.mockImplementationOnce(() => new Promise(() => {}));

      renderPage();

      const h1s = screen.getAllByRole('heading', { level: 1 });
      expect(h1s).toHaveLength(1);
      expect(h1s[0]).toHaveTextContent(/^Users$/);
    });

    it('keeps exactly one "Users" level-1 heading once loaded', async () => {
      renderPage();
      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

      const h1s = screen.getAllByRole('heading', { level: 1 });
      expect(h1s).toHaveLength(1);
      expect(h1s[0]).toHaveTextContent(/^Users$/);
    });

    it('sets the tab title to "Users · Settings · Cornerstone"', async () => {
      renderPage();
      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

      expect(document.title).toBe('Users · Settings · Cornerstone');
    });

    it('shows no "You are here" trail (it is a view-level page)', async () => {
      renderPage();
      await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

      expect(screen.queryByRole('navigation', { name: 'You are here' })).not.toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows loading skeleton while users are being fetched', () => {
      mockListUsers.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ users: [] }), 200)),
      );

      renderPage();

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('hides loading skeleton after users load', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
    });
  });

  describe('authentication column', () => {
    const enableAuthColumn = () =>
      mockListPreferencesUsers.mockResolvedValue([
        {
          key: 'table.users.columns',
          value: JSON.stringify({
            visible: ['displayName', 'email', 'authProvider'],
            order: ['displayName', 'email', 'role', 'createdAt', 'authProvider', 'status'],
          }),
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);

    it('is visible by default with no stored column preferences', async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [makeUser({ displayName: 'Alice Admin', authProvider: 'local' })],
      });

      renderPage();

      await waitFor(() => {
        expect(
          screen.getAllByText(enSettings.userManagement.tableHeaders.authProvider).length,
        ).toBeGreaterThan(0);
      });
      expect(
        screen.getAllByText(enSettings.userManagement.authProviders.local).length,
      ).toBeGreaterThan(0);
    });

    it('shows the pending label for an oidc account that has not signed in yet', async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [makeUser({ authProvider: 'oidc', oidcLinked: false })],
      });

      renderPage();

      await waitFor(() => {
        expect(
          screen.getAllByText(enSettings.userManagement.authProviders.oidcPending).length,
        ).toBeGreaterThan(0);
      });
      expect(
        screen.queryByText(enSettings.userManagement.authProviders.oidc, { exact: true }),
      ).not.toBeInTheDocument();
    });

    it('shows plain "OIDC" for an oidc account that is linked', async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [makeUser({ authProvider: 'oidc', oidcLinked: true })],
      });

      renderPage();

      await waitFor(() => {
        expect(
          screen.getAllByText(enSettings.userManagement.authProviders.oidc, { exact: true }).length,
        ).toBeGreaterThan(0);
      });
      expect(
        screen.queryByText(enSettings.userManagement.authProviders.oidcPending),
      ).not.toBeInTheDocument();
    });

    it('shows "Local" for a local account without an OIDC link', async () => {
      enableAuthColumn();
      mockListUsers.mockResolvedValueOnce({
        users: [makeUser({ authProvider: 'local', oidcLinked: false })],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Local').length).toBeGreaterThan(0);
      });
      expect(screen.queryByText('Local + OIDC')).not.toBeInTheDocument();
    });

    it('shows "Local + OIDC" for a local account linked to OIDC', async () => {
      enableAuthColumn();
      mockListUsers.mockResolvedValueOnce({
        users: [makeUser({ authProvider: 'local', oidcLinked: true })],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('Local + OIDC').length).toBeGreaterThan(0);
      });
    });

    it('shows "OIDC" for an OIDC-origin account', async () => {
      enableAuthColumn();
      mockListUsers.mockResolvedValueOnce({
        users: [makeUser({ authProvider: 'oidc', oidcLinked: true })],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText('OIDC').length).toBeGreaterThan(0);
      });
      expect(screen.queryByText('Local + OIDC')).not.toBeInTheDocument();
    });
  });

  describe('data display', () => {
    it('calls listUsers on mount', async () => {
      renderPage();

      await waitFor(() => {
        expect(mockListUsers).toHaveBeenCalled();
      });
    });

    it('renders user display names when users are loaded', async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [makeUser({ displayName: 'Alice Admin', email: 'alice@example.com' })],
      });

      renderPage();

      // DataTable renders both table rows and mobile cards — use getAllByText.
      await waitFor(() => {
        expect(screen.getAllByText('Alice Admin').length).toBeGreaterThan(0);
        expect(screen.getAllByText('alice@example.com').length).toBeGreaterThan(0);
      });
    });

    it('renders multiple users', async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [
          makeUser({ id: 'user-1', displayName: 'Alice Admin', email: 'alice@example.com' }),
          makeUser({
            id: 'user-2',
            displayName: 'Bob Member',
            email: 'bob@example.com',
            role: 'member',
          }),
        ],
      });

      renderPage();

      // DataTable renders both table rows and mobile cards — use getAllByText.
      await waitFor(() => {
        expect(screen.getAllByText('Alice Admin').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Bob Member').length).toBeGreaterThan(0);
      });
    });

    it('renders action menu button for each user', async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [makeUser({ id: 'user-1' })],
      });

      renderPage();

      // DataTable renders actions in both table rows and mobile cards — use getAllByTestId.
      await waitFor(() => {
        expect(screen.getByTestId('user-menu-button-user-1')).toBeInTheDocument();
      });
    });
  });

  describe('error state', () => {
    it('shows error message when listUsers fails with ApiClientError', async () => {
      const error = new ApiClientError(403, { code: 'FORBIDDEN', message: 'RAW-SERVER-SENTINEL' });
      mockListUsers.mockRejectedValueOnce(error);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(enErrors.FORBIDDEN)).toBeInTheDocument();
      });
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).not.toBeInTheDocument();
    });

    it('shows generic error when non-ApiClientError is thrown', async () => {
      mockListUsers.mockRejectedValueOnce(new Error('RAW-LOCAL'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(enSettings.userManagement.loadError)).toBeInTheDocument();
      });
      expect(screen.queryByText(/RAW-LOCAL/)).not.toBeInTheDocument();
    });
  });

  describe('client-side filtering', () => {
    it('filters users by search text matching display name', async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [
          makeUser({ id: 'user-1', displayName: 'Alice Admin', email: 'alice@example.com' }),
          makeUser({
            id: 'user-2',
            displayName: 'Bob Member',
            email: 'bob@example.com',
            role: 'member',
          }),
        ],
      });

      renderPage();

      // DataTable renders both table rows and mobile cards — use getAllByText.
      await waitFor(() => {
        expect(screen.getAllByText('Alice Admin').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Bob Member').length).toBeGreaterThan(0);
      });
    });
  });

  describe('action menu', () => {
    it('shows edit and deactivate actions when menu is opened for active user', async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [makeUser({ id: 'user-1', displayName: 'Alice Admin' })],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('user-menu-button-user-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('user-menu-button-user-1'));

      expect(screen.getByTestId('user-edit-user-1')).toBeInTheDocument();
      expect(screen.getByTestId('user-deactivate-user-1')).toBeInTheDocument();
    });

    it('keeps every data-testid unique across the table and mobile cards, with a row menu open (#2069)', async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [
          makeUser({ id: 'user-1', displayName: 'Alice Admin' }),
          makeUser({ id: 'user-2', displayName: 'Bob Builder', email: 'bob@example.com' }),
        ],
      });

      const { container } = renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('user-menu-button-user-1')).toBeInTheDocument();
      });
      expect(screen.getByTestId('user-menu-button-mobile-user-1')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('user-menu-button-user-1'));

      expect(screen.getByTestId('user-edit-user-1')).toBeInTheDocument();
      expect(findDuplicateTestIds(container)).toEqual([]);
    });

    it('shows edit action disabled for deactivated user', async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [
          makeUser({
            id: 'user-1',
            displayName: 'Deactivated User',
            deactivatedAt: '2026-02-01T00:00:00.000Z',
          }),
        ],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('user-menu-button-user-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('user-menu-button-user-1'));

      const editBtn = screen.getByTestId('user-edit-user-1');
      expect(editBtn).toBeDisabled();
    });

    it('does not show deactivate button for deactivated user', async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [
          makeUser({
            id: 'user-1',
            displayName: 'Deactivated User',
            deactivatedAt: '2026-02-01T00:00:00.000Z',
          }),
        ],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('user-menu-button-user-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('user-menu-button-user-1'));

      expect(screen.queryByTestId('user-deactivate-user-1')).not.toBeInTheDocument();
    });
  });

  describe('edit user modal', () => {
    it('opens edit modal when edit action is clicked', async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [makeUser({ id: 'user-1', displayName: 'Alice Admin', email: 'alice@example.com' })],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('user-menu-button-user-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('user-menu-button-user-1'));
      fireEvent.click(screen.getByTestId('user-edit-user-1'));

      await waitFor(() => {
        expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
      });
    });

    it('pre-fills edit form with existing user data', async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [makeUser({ id: 'user-1', displayName: 'Alice Admin', email: 'alice@example.com' })],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('user-menu-button-user-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('user-menu-button-user-1'));
      fireEvent.click(screen.getByTestId('user-edit-user-1'));

      await waitFor(() => {
        const displayNameInput = screen.getByLabelText(/display name/i) as HTMLInputElement;
        expect(displayNameInput.value).toBe('Alice Admin');
        const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
        expect(emailInput.value).toBe('alice@example.com');
      });
    });

    it('shows validation error when display name is cleared', async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [makeUser({ id: 'user-1', displayName: 'Alice Admin', email: 'alice@example.com' })],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('user-menu-button-user-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('user-menu-button-user-1'));
      fireEvent.click(screen.getByTestId('user-edit-user-1'));

      await waitFor(() => {
        expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
      });

      const displayNameInput = screen.getByLabelText(/display name/i);
      fireEvent.change(displayNameInput, { target: { value: '' } });

      const form = document.querySelector('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('shows validation error when email is invalid', async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [makeUser({ id: 'user-1', displayName: 'Alice Admin', email: 'alice@example.com' })],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('user-menu-button-user-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('user-menu-button-user-1'));
      fireEvent.click(screen.getByTestId('user-edit-user-1'));

      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      });

      const emailInput = screen.getByLabelText(/email/i);
      fireEvent.change(emailInput, { target: { value: 'not-a-valid-email' } });

      const form = document.querySelector('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
      });
    });

    it('calls adminUpdateUser with changed fields only', async () => {
      const user = makeUser({
        id: 'user-1',
        displayName: 'Alice Admin',
        email: 'alice@example.com',
        role: 'member',
      });
      mockListUsers.mockResolvedValueOnce({ users: [user] });
      const updatedUser = { ...user, displayName: 'Alice Updated' };
      mockAdminUpdateUser.mockResolvedValueOnce(updatedUser);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('user-menu-button-user-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('user-menu-button-user-1'));
      fireEvent.click(screen.getByTestId('user-edit-user-1'));

      await waitFor(() => {
        expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
      });

      const displayNameInput = screen.getByLabelText(/display name/i);
      fireEvent.change(displayNameInput, { target: { value: 'Alice Updated' } });

      const form = document.querySelector('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(mockAdminUpdateUser).toHaveBeenCalledWith(
          'user-1',
          expect.objectContaining({ displayName: 'Alice Updated' }),
        );
      });
    });

    it('shows the emailInUse copy when adminUpdateUser fails with 409 CONFLICT', async () => {
      const user = makeUser({
        id: 'user-1',
        displayName: 'Alice Admin',
        email: 'alice@example.com',
      });
      mockListUsers.mockResolvedValueOnce({ users: [user] });
      const apiError = new ApiClientError(409, {
        code: 'CONFLICT',
        message: 'RAW-SERVER-SENTINEL',
      });
      mockAdminUpdateUser.mockRejectedValueOnce(apiError);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('user-menu-button-user-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('user-menu-button-user-1'));
      fireEvent.click(screen.getByTestId('user-edit-user-1'));

      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      });

      const emailInput = screen.getByLabelText(/email/i);
      fireEvent.change(emailInput, { target: { value: 'other@example.com' } });

      const form = document.querySelector('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(enSettings.userManagement.errors.emailInUse)).toBeInTheDocument();
      });
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).not.toBeInTheDocument();
    });

    it('translates a non-CONFLICT adminUpdateUser ApiClientError by code', async () => {
      const user = makeUser({
        id: 'user-1',
        displayName: 'Alice Admin',
        email: 'alice@example.com',
      });
      mockListUsers.mockResolvedValueOnce({ users: [user] });
      mockAdminUpdateUser.mockRejectedValueOnce(
        new ApiClientError(400, { code: 'VALIDATION_ERROR', message: 'RAW-SERVER-SENTINEL' }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('user-menu-button-user-1')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('user-menu-button-user-1'));
      fireEvent.click(screen.getByTestId('user-edit-user-1'));
      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      });
      fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'other@example.com' } });
      fireEvent.submit(document.querySelector('form')!);

      await waitFor(() => {
        expect(screen.getByText(enErrors.VALIDATION_ERROR)).toBeInTheDocument();
      });
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).not.toBeInTheDocument();
    });

    it('closes modal when cancel is clicked', async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [makeUser({ id: 'user-1', displayName: 'Alice Admin', email: 'alice@example.com' })],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('user-menu-button-user-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('user-menu-button-user-1'));
      fireEvent.click(screen.getByTestId('user-edit-user-1'));

      await waitFor(() => {
        expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
      });

      // Find and click the cancel button
      const cancelBtns = screen.getAllByRole('button');
      const cancelBtn = cancelBtns.find((btn) => btn.textContent?.toLowerCase() === 'cancel');
      expect(cancelBtn).toBeDefined();
      fireEvent.click(cancelBtn!);

      await waitFor(() => {
        expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('deactivate user modal', () => {
    it('opens deactivate confirmation modal when deactivate action is clicked', async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [makeUser({ id: 'user-1', displayName: 'Alice Admin' })],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('user-menu-button-user-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('user-menu-button-user-1'));
      fireEvent.click(screen.getByTestId('user-deactivate-user-1'));

      await waitFor(() => {
        // DataTable rows + modal each show Alice Admin — getAllByText handles multiple matches.
        expect(screen.getAllByText(/Alice Admin/).length).toBeGreaterThan(0);
      });
    });

    it('calls deactivateUser API when confirm button is clicked', async () => {
      const user = makeUser({ id: 'user-1', displayName: 'Alice Admin' });
      mockListUsers.mockResolvedValueOnce({ users: [user] });
      mockDeactivateUser.mockResolvedValueOnce(undefined);
      // After deactivation, reload shows user as deactivated
      mockListUsers.mockResolvedValueOnce({
        users: [{ ...user, deactivatedAt: '2026-03-01T00:00:00.000Z' }],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('user-menu-button-user-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('user-menu-button-user-1'));
      fireEvent.click(screen.getByTestId('user-deactivate-user-1'));

      // Find and click the confirm deactivate button
      await waitFor(() => {
        const confirmBtns = screen.getAllByRole('button');
        const confirmBtn = confirmBtns.find(
          (btn) =>
            btn.textContent?.toLowerCase().includes('deactivate') &&
            !btn.textContent?.toLowerCase().includes('cancel'),
        );
        if (confirmBtn) {
          fireEvent.click(confirmBtn);
        }
      });

      await waitFor(() => {
        expect(mockDeactivateUser).toHaveBeenCalledWith('user-1');
      });
    });

    it('shows error when deactivateUser API fails', async () => {
      const user = makeUser({ id: 'user-1', displayName: 'Alice Admin' });
      mockListUsers.mockResolvedValueOnce({ users: [user] });
      const error = new ApiClientError(409, {
        code: 'LAST_ADMIN',
        message: 'RAW-SERVER-SENTINEL',
      });
      mockDeactivateUser.mockRejectedValueOnce(error);

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('user-menu-button-user-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('user-menu-button-user-1'));
      fireEvent.click(screen.getByTestId('user-deactivate-user-1'));

      await waitFor(() => {
        const confirmBtns = screen.getAllByRole('button');
        const confirmBtn = confirmBtns.find(
          (btn) =>
            btn.textContent?.toLowerCase().includes('deactivate') &&
            !btn.textContent?.toLowerCase().includes('cancel'),
        );
        if (confirmBtn) {
          fireEvent.click(confirmBtn);
        }
      });

      await waitFor(() => {
        expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
        expect(screen.getByText(enErrors.LAST_ADMIN)).toBeInTheDocument();
      });
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).not.toBeInTheDocument();
    });
  });

  describe('deactivate dialog (#2209)', () => {
    async function openDialog(overrides: Partial<UserResponse> = {}) {
      mockListUsers.mockResolvedValue({
        users: [makeUser({ id: 'user-1', displayName: 'Alice Admin', ...overrides })],
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('user-menu-button-user-1')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('user-menu-button-user-1'));
      fireEvent.click(screen.getByTestId('user-deactivate-user-1'));
      return screen.findByRole('alertdialog', { name: 'Deactivate Alice Admin?' });
    }

    it('opens an alertdialog named "Deactivate <name>?" with Cancel focused and the lead text', async () => {
      const dialog = await openDialog();
      expect(dialog).toBeInTheDocument();
      expect(screen.getByTestId('user-deactivate-cancel')).toHaveFocus();
      expect(
        within(dialog).getByText('Their sessions are terminated immediately.'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('user-deactivate-confirm')).toHaveTextContent('Deactivate');
      expect(mockDeactivateUser).not.toHaveBeenCalled();
    });

    it('Confirm calls deactivateUser once with the user id', async () => {
      await openDialog();
      fireEvent.click(screen.getByTestId('user-deactivate-confirm'));
      await waitFor(() => expect(mockDeactivateUser).toHaveBeenCalledTimes(1));
      expect(mockDeactivateUser).toHaveBeenCalledWith('user-1');
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    });

    it('shows the busy label while deactivating and ignores a second press', async () => {
      let resolve!: () => void;
      mockDeactivateUser.mockImplementation(() => new Promise<void>((r) => (resolve = r)));
      await openDialog();
      fireEvent.click(screen.getByTestId('user-deactivate-confirm'));
      await waitFor(() =>
        expect(screen.getByTestId('user-deactivate-confirm')).toHaveTextContent('Deactivating...'),
      );
      fireEvent.click(screen.getByTestId('user-deactivate-confirm'));
      expect(mockDeactivateUser).toHaveBeenCalledTimes(1);
      await act(async () => resolve());
    });

    it('an API error shows inside the dialog, keeps it open, and never leaks the server text', async () => {
      mockDeactivateUser.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'LAST_ADMIN', message: 'RAW-SERVER-SENTINEL' }),
      );
      const dialog = await openDialog();
      fireEvent.click(screen.getByTestId('user-deactivate-confirm'));

      await waitFor(() =>
        expect(within(dialog).getByRole('alert')).toHaveTextContent(enErrors.LAST_ADMIN),
      );
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
    });

    it('a non-API failure shows the generic message inside the open dialog', async () => {
      mockDeactivateUser.mockRejectedValueOnce(new Error('RAW-LOCAL'));
      const dialog = await openDialog();
      fireEvent.click(screen.getByTestId('user-deactivate-confirm'));
      await waitFor(() =>
        expect(within(dialog).getByRole('alert')).toHaveTextContent(
          'Failed to deactivate user. Please try again.',
        ),
      );
      expect(screen.queryByText(/RAW-LOCAL/)).toBeNull();
    });

    it('Cancel closes the dialog without deactivating and focus never lands on body', async () => {
      await openDialog();
      fireEvent.click(screen.getByTestId('user-deactivate-cancel'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockDeactivateUser).not.toHaveBeenCalled();
      expect(document.body).not.toHaveFocus();
    });

    it('reopening after an error starts clean', async () => {
      mockDeactivateUser.mockRejectedValueOnce(new Error('x'));
      const dialog = await openDialog();
      fireEvent.click(screen.getByTestId('user-deactivate-confirm'));
      await waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument());
      fireEvent.click(screen.getByTestId('user-deactivate-cancel'));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      fireEvent.click(screen.getByTestId('user-menu-button-user-1'));
      fireEvent.click(screen.getByTestId('user-deactivate-user-1'));
      const reopened = await screen.findByRole('alertdialog');
      expect(within(reopened).queryByRole('alert')).toBeNull();
    });
  });

  describe('create user modal (issue #2122)', () => {
    const cm = enSettings.userManagement.createModal;
    const cv = enSettings.userManagement.createValidation;
    const ev = enSettings.userManagement.editValidation;

    const withOidc = (oidcEnabled: boolean) =>
      mockUseAuth.mockReturnValue({
        user: adminUser,
        oidcEnabled,
        isLoading: false,
        error: null,
        refreshAuth: jest.fn<() => Promise<void>>(),
        logout: jest.fn<() => Promise<void>>(),
      });

    async function openCreate() {
      const rendered = renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('add-user-button')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('add-user-button'));
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: cm.title })).toBeInTheDocument();
      });
      return rendered;
    }

    const field = (id: string) => document.getElementById(id) as HTMLInputElement;
    const type = (id: string, value: string) => fireEvent.change(field(id), { target: { value } });
    const submit = () => fireEvent.click(screen.getByTestId('create-user-submit'));

    function fillValidLocal() {
      type('createEmail', 'new@example.com');
      type('createDisplayName', 'New Person');
      type('createPassword', 'twelve-chars!');
      type('createConfirmPassword', 'twelve-chars!');
    }

    const createdUser = makeUser({
      id: 'created-1',
      displayName: 'New Person',
      email: 'new@example.com',
      role: 'member',
    });

    it('shows the Add User button to admins and opens a dialog with the five local fields', async () => {
      await openCreate();

      expect(field('createEmail')).toBeInTheDocument();
      expect(field('createDisplayName')).toBeInTheDocument();
      expect(field('createRole')).toBeInTheDocument();
      expect(field('createPassword')).toBeInTheDocument();
      expect(field('createConfirmPassword')).toBeInTheDocument();
      expect(screen.getByTestId('add-user-button')).toHaveTextContent(
        enSettings.userManagement.addUser,
      );
    });

    it('does not show the Add User button to a member', async () => {
      mockUseAuth.mockReturnValue({
        user: makeUser({ id: 'm', role: 'member' }),
        oidcEnabled: true,
        isLoading: false,
        error: null,
        refreshAuth: jest.fn<() => Promise<void>>(),
        logout: jest.fn<() => Promise<void>>(),
      });

      renderPage();

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
      expect(screen.queryByTestId('add-user-button')).not.toBeInTheDocument();
    });

    it('moves focus to the Email field when the dialog opens', async () => {
      await openCreate();

      expect(document.activeElement).toBe(field('createEmail'));
    });

    it('omits the SSO-only checkbox when OIDC is disabled', async () => {
      withOidc(false);
      await openCreate();

      expect(field('createSsoOnly')).toBeNull();
    });

    it('shows an unchecked SSO-only checkbox when OIDC is enabled', async () => {
      withOidc(true);
      await openCreate();

      expect(field('createSsoOnly')).toBeInTheDocument();
      expect(field('createSsoOnly').checked).toBe(false);
      expect(screen.getByText(cm.ssoOnlyLabel)).toBeInTheDocument();
    });

    it('removes the password inputs when SSO-only is checked and submits exactly the oidc payload', async () => {
      withOidc(true);
      mockCreateUser.mockResolvedValueOnce({ ...createdUser, authProvider: 'oidc' });
      await openCreate();

      fireEvent.click(field('createSsoOnly'));
      expect(field('createPassword')).toBeNull();
      expect(field('createConfirmPassword')).toBeNull();

      type('createEmail', 'new@example.com');
      type('createDisplayName', 'New Person');
      fireEvent.change(field('createRole'), { target: { value: 'admin' } });
      submit();

      await waitFor(() => {
        expect(mockCreateUser).toHaveBeenCalledTimes(1);
      });
      const payload = mockCreateUser.mock.calls[0]?.[0];
      expect(payload).toBeDefined();
      expect(payload).toEqual({
        email: 'new@example.com',
        displayName: 'New Person',
        role: 'admin',
        authProvider: 'oidc',
      });
      expect(payload).not.toHaveProperty('password');
    });

    it('restores empty password fields without stale errors after checking then unchecking SSO-only', async () => {
      withOidc(true);
      await openCreate();
      type('createEmail', 'new@example.com');
      type('createDisplayName', 'New Person');
      type('createPassword', 'short');
      submit();
      await waitFor(() => {
        expect(screen.getByText(cv.passwordTooShort)).toBeInTheDocument();
      });
      expect(screen.getByText(cv.confirmPasswordRequired)).toBeInTheDocument();

      fireEvent.click(field('createSsoOnly'));
      fireEvent.click(field('createSsoOnly'));

      expect(field('createPassword').value).toBe('');
      expect(field('createConfirmPassword').value).toBe('');
      expect(screen.queryByText(cv.passwordTooShort)).not.toBeInTheDocument();
      expect(screen.queryByText(cv.confirmPasswordRequired)).not.toBeInTheDocument();
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('sends the password and no authProvider key for a local create, trimming the name', async () => {
      withOidc(true);
      mockCreateUser.mockResolvedValueOnce(createdUser);
      await openCreate();

      type('createEmail', 'new@example.com');
      type('createDisplayName', '  New Person  ');
      type('createPassword', 'twelve-chars!');
      type('createConfirmPassword', 'twelve-chars!');
      submit();

      await waitFor(() => {
        expect(mockCreateUser).toHaveBeenCalledTimes(1);
      });
      const payload = mockCreateUser.mock.calls[0]?.[0];
      expect(payload).toEqual({
        email: 'new@example.com',
        displayName: 'New Person',
        role: 'member',
        password: 'twelve-chars!',
      });
      expect(payload).not.toHaveProperty('authProvider');
    });

    it('trims a padded email before sending it', async () => {
      mockCreateUser.mockResolvedValueOnce(createdUser);
      await openCreate();

      fillValidLocal();
      type('createEmail', '  new@example.com  ');
      submit();

      await waitFor(() => {
        expect(mockCreateUser).toHaveBeenCalledTimes(1);
      });
      expect(mockCreateUser.mock.calls[0]?.[0]).toMatchObject({ email: 'new@example.com' });
    });

    it('validates and sends a padded email trimmed, independent of the browser email sanitizer', async () => {
      mockCreateUser.mockResolvedValueOnce(createdUser);
      await openCreate();
      fillValidLocal();
      // Flip the input to text at event time so the padded value reaches React state; the
      // browser's type=email sanitizer would otherwise trim it before the component sees it.
      field('createEmail').setAttribute('type', 'text');
      type('createEmail', '  new@example.com  ');

      submit();

      await waitFor(() => {
        expect(mockCreateUser).toHaveBeenCalledTimes(1);
      });
      expect(mockCreateUser.mock.calls[0]?.[0]).toMatchObject({ email: 'new@example.com' });
      expect(screen.queryByText(ev.emailInvalid)).not.toBeInTheDocument();
    });

    it('rejects a whitespace-only email as required, not as invalid', async () => {
      await openCreate();
      fillValidLocal();
      field('createEmail').setAttribute('type', 'text');
      type('createEmail', '   ');

      submit();

      await waitFor(() => {
        expect(screen.getByText(ev.emailRequired)).toBeInTheDocument();
      });
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('treats a ticked SSO-only box as local once OIDC is disabled while the modal is open', async () => {
      withOidc(true);
      mockCreateUser.mockResolvedValueOnce(createdUser);
      const { rerender } = await openCreate();
      fireEvent.click(field('createSsoOnly'));
      expect(field('createSsoOnly').checked).toBe(true);
      expect(document.getElementById('createPassword')).toBeNull();

      // OIDC is switched off while the stale ssoOnly flag is still true in the form state.
      withOidc(false);
      rerender(
        <ToastProvider>
          <MemoryRouter initialEntries={['/settings/users']}>
            <UserManagementPage />
          </MemoryRouter>
        </ToastProvider>,
      );

      expect(document.getElementById('createSsoOnly')).toBeNull();
      expect(field('createPassword')).toBeInTheDocument();
      expect(field('createConfirmPassword')).toBeInTheDocument();

      type('createEmail', 'new@example.com');
      type('createDisplayName', 'New Person');
      submit();
      await waitFor(() => {
        expect(screen.getByText(cv.passwordRequired)).toBeInTheDocument();
      });
      expect(screen.getByText(cv.confirmPasswordRequired)).toBeInTheDocument();
      expect(mockCreateUser).not.toHaveBeenCalled();

      type('createPassword', 'twelve-chars!');
      type('createConfirmPassword', 'twelve-chars!');
      submit();

      await waitFor(() => {
        expect(mockCreateUser).toHaveBeenCalledTimes(1);
      });
      const payload = mockCreateUser.mock.calls[0]?.[0];
      expect(payload).toEqual({
        email: 'new@example.com',
        displayName: 'New Person',
        role: 'member',
        password: 'twelve-chars!',
      });
      expect(payload).not.toHaveProperty('authProvider');
    });

    it('shows required errors for empty fields, focuses the first invalid field and does not call the API', async () => {
      await openCreate();

      submit();

      await waitFor(() => {
        expect(screen.getByText(ev.emailRequired)).toBeInTheDocument();
      });
      expect(screen.getByText(ev.displayNameRequired)).toBeInTheDocument();
      expect(screen.getByText(cv.passwordRequired)).toBeInTheDocument();
      expect(screen.getByText(cv.confirmPasswordRequired)).toBeInTheDocument();
      expect(document.activeElement).toBe(field('createEmail'));
      expect(screen.getByTestId('create-user-submit')).not.toBeDisabled();
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('rejects an invalid email format', async () => {
      await openCreate();
      fillValidLocal();
      type('createEmail', 'not-an-email');

      submit();

      await waitFor(() => {
        expect(screen.getByText(ev.emailInvalid)).toBeInTheDocument();
      });
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('rejects an email longer than 255 characters', async () => {
      await openCreate();
      fillValidLocal();
      type('createEmail', `${'a'.repeat(250)}@b.com`);

      submit();

      await waitFor(() => {
        expect(screen.getByText(cv.emailTooLong)).toBeInTheDocument();
      });
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('rejects a 101-character display name', async () => {
      await openCreate();
      fillValidLocal();
      type('createDisplayName', 'n'.repeat(101));

      submit();

      await waitFor(() => {
        expect(screen.getByText(ev.displayNameTooLong)).toBeInTheDocument();
      });
      expect(document.activeElement).toBe(field('createDisplayName'));
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('rejects an 11-character password', async () => {
      await openCreate();
      fillValidLocal();
      type('createPassword', 'a'.repeat(11));
      type('createConfirmPassword', 'a'.repeat(11));

      submit();

      await waitFor(() => {
        expect(screen.getByText(cv.passwordTooShort)).toBeInTheDocument();
      });
      expect(document.activeElement).toBe(field('createPassword'));
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('counts password length in code points: 6 astral emoji (12 UTF-16 units) is too short', async () => {
      await openCreate();
      fillValidLocal();
      const emoji = '\u{1F600}'.repeat(6);
      expect(emoji.length).toBe(12);
      type('createPassword', emoji);
      type('createConfirmPassword', emoji);

      submit();

      await waitFor(() => {
        expect(screen.getByText(cv.passwordTooShort)).toBeInTheDocument();
      });
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('accepts 12 astral emoji (12 code points) as a password', async () => {
      mockCreateUser.mockResolvedValueOnce(createdUser);
      await openCreate();
      fillValidLocal();
      const emoji = '\u{1F600}'.repeat(12);
      type('createPassword', emoji);
      type('createConfirmPassword', emoji);

      submit();

      await waitFor(() => {
        expect(mockCreateUser).toHaveBeenCalledTimes(1);
      });
    });

    it('rejects a password longer than 255 code points', async () => {
      await openCreate();
      fillValidLocal();
      type('createPassword', 'p'.repeat(256));
      type('createConfirmPassword', 'p'.repeat(256));

      submit();

      await waitFor(() => {
        expect(screen.getByText(cv.passwordTooLong)).toBeInTheDocument();
      });
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('rejects a confirm-password mismatch', async () => {
      await openCreate();
      fillValidLocal();
      type('createConfirmPassword', 'different-pass!');

      submit();

      await waitFor(() => {
        expect(screen.getByText(cv.passwordsDoNotMatch)).toBeInTheDocument();
      });
      expect(document.activeElement).toBe(field('createConfirmPassword'));
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('sets maxLength 255 on email, 100 on name, and 255 on both password fields', async () => {
      await openCreate();

      expect(field('createEmail')).toHaveAttribute('maxlength', '255');
      expect(field('createDisplayName')).toHaveAttribute('maxlength', '100');
      expect(field('createPassword')).toHaveAttribute('maxlength', '255');
      expect(field('createConfirmPassword')).toHaveAttribute('maxlength', '255');
    });

    it('shows the emailInUse field error on a 409 CONFLICT, keeps the dialog open and hides the server text', async () => {
      mockCreateUser.mockRejectedValueOnce(
        new ApiClientError(409, { code: 'CONFLICT', message: 'RAW-SERVER-SENTINEL' }),
      );
      await openCreate();
      fillValidLocal();

      submit();

      await waitFor(() => {
        expect(screen.getByText(enSettings.userManagement.errors.emailInUse)).toBeInTheDocument();
      });
      expect(screen.getByRole('dialog', { name: cm.title })).toBeInTheDocument();
      expect(document.activeElement).toBe(field('createEmail'));
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).not.toBeInTheDocument();
      expect(screen.getAllByRole('alert')).toHaveLength(1);
    });

    it.each([
      ['OIDC_NOT_CONFIGURED', enErrors.OIDC_NOT_CONFIGURED],
      ['VALIDATION_ERROR', enErrors.VALIDATION_ERROR],
    ] as const)('shows the translated banner for a %s ApiClientError', async (code, copy) => {
      mockCreateUser.mockRejectedValueOnce(
        new ApiClientError(400, { code, message: 'RAW-SERVER-SENTINEL' }),
      );
      await openCreate();
      fillValidLocal();

      submit();

      await waitFor(() => {
        expect(screen.getByText(copy)).toBeInTheDocument();
      });
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).not.toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: cm.title })).toBeInTheDocument();
      expect(screen.getAllByRole('alert')).toHaveLength(1);
    });

    it('never renders details strings from an ApiClientError', async () => {
      mockCreateUser.mockRejectedValueOnce(
        new ApiClientError(400, {
          code: 'VALIDATION_ERROR',
          message: 'RAW-SERVER-SENTINEL',
          details: { field: 'RAW-DETAILS-SENTINEL' },
        }),
      );
      await openCreate();
      fillValidLocal();

      submit();

      await waitFor(() => {
        expect(screen.getByText(enErrors.VALIDATION_ERROR)).toBeInTheDocument();
      });
      expect(screen.queryByText(/RAW-DETAILS-SENTINEL/)).not.toBeInTheDocument();
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).not.toBeInTheDocument();
    });

    it('shows the network banner for a NetworkError', async () => {
      mockCreateUser.mockRejectedValueOnce(new NetworkError('RAW-LOCAL', new Error('offline')));
      await openCreate();
      fillValidLocal();

      submit();

      await waitFor(() => {
        expect(screen.getByText(enCommon.requestErrors.network)).toBeInTheDocument();
      });
      expect(screen.queryByText(/RAW-LOCAL/)).not.toBeInTheDocument();
      expect(screen.getAllByRole('alert')).toHaveLength(1);
    });

    it('shows the generic create error for an unknown error', async () => {
      mockCreateUser.mockRejectedValueOnce(new Error('RAW-LOCAL'));
      await openCreate();
      fillValidLocal();

      submit();

      await waitFor(() => {
        expect(screen.getByText(cm.error)).toBeInTheDocument();
      });
      expect(screen.queryByText(/RAW-LOCAL/)).not.toBeInTheDocument();
    });

    it('clears a previous banner on the next submit attempt', async () => {
      mockCreateUser
        .mockRejectedValueOnce(new Error('RAW-LOCAL'))
        .mockResolvedValueOnce(createdUser);
      await openCreate();
      fillValidLocal();
      submit();
      await waitFor(() => {
        expect(screen.getByText(cm.error)).toBeInTheDocument();
      });

      submit();

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(screen.queryByText(cm.error)).not.toBeInTheDocument();
      expect(mockCreateUser).toHaveBeenCalledTimes(2);
    });

    it('disables the form while creating', async () => {
      let resolveCreate: (u: UserResponse) => void = () => {};
      mockCreateUser.mockImplementationOnce(
        () => new Promise<UserResponse>((resolve) => (resolveCreate = resolve)),
      );
      await openCreate();
      fillValidLocal();

      submit();

      await waitFor(() => {
        expect(screen.getByTestId('create-user-submit')).toBeDisabled();
      });
      expect(screen.getByTestId('create-user-submit')).toHaveTextContent(cm.creating);
      expect(field('createEmail')).toBeDisabled();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByRole('dialog', { name: cm.title })).toBeInTheDocument();

      resolveCreate(createdUser);
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('adds the new row, closes the dialog and returns focus to the Add User button on success', async () => {
      mockCreateUser.mockResolvedValueOnce(createdUser);
      await openCreate();
      fillValidLocal();

      submit();

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(screen.getAllByText('New Person').length).toBeGreaterThan(0);
      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByTestId('add-user-button'));
      });
    });

    it('returns focus to the Add User button when closed with Escape', async () => {
      await openCreate();

      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(document.activeElement).toBe(screen.getByTestId('add-user-button'));
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('returns focus to the Add User button when Cancel is clicked', async () => {
      await openCreate();

      fireEvent.click(screen.getByRole('button', { name: cm.cancel }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(document.activeElement).toBe(screen.getByTestId('add-user-button'));
    });

    it('resets the form when the dialog is reopened', async () => {
      await openCreate();
      type('createEmail', 'leftover@example.com');
      submit();
      await waitFor(() => {
        expect(screen.getByText(ev.displayNameRequired)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: cm.cancel }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('add-user-button'));

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: cm.title })).toBeInTheDocument();
      });
      expect(field('createEmail').value).toBe('');
      expect(screen.queryByText(ev.displayNameRequired)).not.toBeInTheDocument();
    });

    it('has no duplicate test ids with the create modal open', async () => {
      mockListUsers.mockResolvedValueOnce({ users: [makeUser({ id: 'user-1' })] });
      withOidc(true);
      const { container } = await openCreate();

      expect(findDuplicateTestIds(container)).toEqual([]);
      expect(findDuplicateTestIds(document.body)).toEqual([]);
    });
  });

  describe('edit user modal trimming (issue #2122)', () => {
    const alice = makeUser({
      id: 'user-1',
      displayName: 'Alice Admin',
      email: 'alice@example.com',
      role: 'admin',
    });

    async function openEdit() {
      mockListUsers.mockResolvedValueOnce({ users: [alice] });
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('user-menu-button-user-1')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('user-menu-button-user-1'));
      fireEvent.click(screen.getByTestId('user-edit-user-1'));
      await waitFor(() => {
        expect(document.getElementById('editEmail')).toBeInTheDocument();
      });
    }

    const editField = (id: string) => document.getElementById(id) as HTMLInputElement;

    it('sends a padded email trimmed, bypassing the browser email sanitizer', async () => {
      mockAdminUpdateUser.mockResolvedValueOnce({ ...alice, email: 'other@example.com' });
      await openEdit();
      editField('editEmail').setAttribute('type', 'text');
      fireEvent.change(editField('editEmail'), { target: { value: '  other@example.com  ' } });

      fireEvent.submit(document.querySelector('form')!);

      await waitFor(() => {
        expect(mockAdminUpdateUser).toHaveBeenCalledTimes(1);
      });
      expect(mockAdminUpdateUser).toHaveBeenCalledWith('user-1', { email: 'other@example.com' });
    });

    it('sends no PATCH when the edit changes only whitespace', async () => {
      await openEdit();
      editField('editEmail').setAttribute('type', 'text');
      fireEvent.change(editField('editEmail'), { target: { value: ' alice@example.com ' } });
      fireEvent.change(editField('editDisplayName'), { target: { value: '  Alice Admin  ' } });

      fireEvent.submit(document.querySelector('form')!);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(mockAdminUpdateUser).not.toHaveBeenCalled();
    });

    it('counts the edit display name in code points: 100 emoji pass, 101 are rejected', async () => {
      mockAdminUpdateUser.mockResolvedValueOnce({ ...alice, displayName: 'x' });
      await openEdit();
      const hundred = '\u{1F600}'.repeat(100);
      expect(hundred.length).toBe(200);
      fireEvent.change(editField('editDisplayName'), { target: { value: hundred } });
      fireEvent.submit(document.querySelector('form')!);
      await waitFor(() => {
        expect(mockAdminUpdateUser).toHaveBeenCalledTimes(1);
      });
      expect(mockAdminUpdateUser).toHaveBeenCalledWith('user-1', { displayName: hundred });
    });

    it('rejects an edit display name of 101 emoji as too long', async () => {
      await openEdit();
      fireEvent.change(editField('editDisplayName'), {
        target: { value: '\u{1F600}'.repeat(101) },
      });

      fireEvent.submit(document.querySelector('form')!);

      await waitFor(() => {
        expect(
          screen.getByText(enSettings.userManagement.editValidation.displayNameTooLong),
        ).toBeInTheDocument();
      });
      expect(mockAdminUpdateUser).not.toHaveBeenCalled();
    });
  });
});
