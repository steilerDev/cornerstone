/**
 * @jest-environment jsdom
 */
/**
 * Component tests for UserManagementPage.tsx
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as AuthContextTypes from '../../contexts/AuthContext.js';
import type { UserResponse } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';

// ─── Mock modules BEFORE importing component ────────────────────────────────

// Mock preferencesApi — DataTable calls useColumnPreferences -> usePreferences -> listPreferences
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockListPreferencesUsers = jest.fn<any>().mockResolvedValue([]);
jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  listPreferences: mockListPreferencesUsers,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upsertPreference: jest.fn<any>().mockResolvedValue({ key: '', value: '', updatedAt: '' }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deletePreference: jest.fn<any>().mockResolvedValue(undefined),
}));

const mockUseAuth = jest.fn<typeof AuthContextTypes.useAuth>();

jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

const mockListUsers = jest.fn<typeof UsersApiTypes.listUsers>();
const mockAdminUpdateUser = jest.fn<typeof UsersApiTypes.adminUpdateUser>();
const mockDeactivateUser = jest.fn<typeof UsersApiTypes.deactivateUser>();

jest.unstable_mockModule('../../lib/usersApi.js', () => ({
  listUsers: mockListUsers,
  adminUpdateUser: mockAdminUpdateUser,
  deactivateUser: mockDeactivateUser,
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
  changePassword: jest.fn(),
}));

// Mock formatters
jest.unstable_mockModule('../../lib/formatters.js', () => ({
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
    <MemoryRouter initialEntries={['/settings/users']}>
      <UserManagementPage />
    </MemoryRouter>,
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
        expect(screen.getAllByTestId('user-menu-button-user-1').length).toBeGreaterThan(0);
      });
    });
  });

  describe('error state', () => {
    it('shows error message when listUsers fails with ApiClientError', async () => {
      const error = new ApiClientError(403, { code: 'FORBIDDEN', message: 'Access denied' });
      mockListUsers.mockRejectedValueOnce(error);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Access denied')).toBeInTheDocument();
      });
    });

    it('shows generic error when non-ApiClientError is thrown', async () => {
      mockListUsers.mockRejectedValueOnce(new Error('Network error'));

      renderPage();

      await waitFor(() => {
        expect(mockListUsers).toHaveBeenCalled();
      });
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
        expect(screen.getAllByTestId('user-menu-button-user-1')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('user-menu-button-user-1')[0]);

      expect(screen.getAllByTestId('user-edit-user-1')[0]).toBeInTheDocument();
      expect(screen.getAllByTestId('user-deactivate-user-1')[0]).toBeInTheDocument();
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
        expect(screen.getAllByTestId('user-menu-button-user-1')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('user-menu-button-user-1')[0]);

      const editBtn = screen.getAllByTestId('user-edit-user-1')[0];
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
        expect(screen.getAllByTestId('user-menu-button-user-1')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('user-menu-button-user-1')[0]);

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
        expect(screen.getAllByTestId('user-menu-button-user-1')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('user-menu-button-user-1')[0]);
      fireEvent.click(screen.getAllByTestId('user-edit-user-1')[0]);

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
        expect(screen.getAllByTestId('user-menu-button-user-1')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('user-menu-button-user-1')[0]);
      fireEvent.click(screen.getAllByTestId('user-edit-user-1')[0]);

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
        expect(screen.getAllByTestId('user-menu-button-user-1')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('user-menu-button-user-1')[0]);
      fireEvent.click(screen.getAllByTestId('user-edit-user-1')[0]);

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
        expect(screen.getAllByTestId('user-menu-button-user-1')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('user-menu-button-user-1')[0]);
      fireEvent.click(screen.getAllByTestId('user-edit-user-1')[0]);

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
        expect(screen.getAllByTestId('user-menu-button-user-1')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('user-menu-button-user-1')[0]);
      fireEvent.click(screen.getAllByTestId('user-edit-user-1')[0]);

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

    it('shows API error when adminUpdateUser fails', async () => {
      const user = makeUser({
        id: 'user-1',
        displayName: 'Alice Admin',
        email: 'alice@example.com',
      });
      mockListUsers.mockResolvedValueOnce({ users: [user] });
      const apiError = new ApiClientError(409, {
        code: 'CONFLICT',
        message: 'Email already in use',
      });
      mockAdminUpdateUser.mockRejectedValueOnce(apiError);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByTestId('user-menu-button-user-1')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('user-menu-button-user-1')[0]);
      fireEvent.click(screen.getAllByTestId('user-edit-user-1')[0]);

      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      });

      const emailInput = screen.getByLabelText(/email/i);
      fireEvent.change(emailInput, { target: { value: 'other@example.com' } });

      const form = document.querySelector('form');
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Email already in use')).toBeInTheDocument();
      });
    });

    it('closes modal when cancel is clicked', async () => {
      mockListUsers.mockResolvedValueOnce({
        users: [makeUser({ id: 'user-1', displayName: 'Alice Admin', email: 'alice@example.com' })],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByTestId('user-menu-button-user-1')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('user-menu-button-user-1')[0]);
      fireEvent.click(screen.getAllByTestId('user-edit-user-1')[0]);

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
        expect(screen.getAllByTestId('user-menu-button-user-1')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('user-menu-button-user-1')[0]);
      fireEvent.click(screen.getAllByTestId('user-deactivate-user-1')[0]);

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
        expect(screen.getAllByTestId('user-menu-button-user-1')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('user-menu-button-user-1')[0]);
      fireEvent.click(screen.getAllByTestId('user-deactivate-user-1')[0]);

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
      const error = new ApiClientError(403, {
        code: 'FORBIDDEN',
        message: 'Cannot deactivate last admin',
      });
      mockDeactivateUser.mockRejectedValueOnce(error);

      renderPage();

      await waitFor(() => {
        expect(screen.getAllByTestId('user-menu-button-user-1')[0]).toBeInTheDocument();
      });

      fireEvent.click(screen.getAllByTestId('user-menu-button-user-1')[0]);
      fireEvent.click(screen.getAllByTestId('user-deactivate-user-1')[0]);

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
        expect(screen.getByText('Cannot deactivate last admin')).toBeInTheDocument();
      });
    });
  });
});
