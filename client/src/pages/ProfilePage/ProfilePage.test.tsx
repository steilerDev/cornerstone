import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as AuthContextTypes from '../../contexts/AuthContext.js';
import type * as ProfilePageTypes from './ProfilePage.js';
import { ApiClientError } from '../../lib/apiClient.js';

const mockUpdateProfile = jest.fn<typeof UsersApiTypes.updateProfile>();
const mockChangePassword = jest.fn<typeof UsersApiTypes.changePassword>();
const mockUseAuth = jest.fn<typeof AuthContextTypes.useAuth>();

// Mock usersApi before importing the component
jest.unstable_mockModule('../../lib/usersApi.js', () => ({
  updateProfile: mockUpdateProfile,
  changePassword: mockChangePassword,
}));

// Mock AuthContext
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

describe('ProfilePage', () => {
  let ProfilePage: typeof ProfilePageTypes.ProfilePage;

  // Mock user data
  const mockLocalUser = {
    id: 'user-123',
    email: 'local@example.com',
    displayName: 'Local User',
    role: 'member' as const,
    authProvider: 'local' as const,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deactivatedAt: null,
  };

  const mockOidcUser = {
    id: 'user-456',
    email: 'oidc@example.com',
    displayName: 'OIDC User',
    role: 'admin' as const,
    authProvider: 'oidc' as const,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deactivatedAt: null,
  };

  beforeEach(async () => {
    // Dynamic import modules
    if (!ProfilePage) {
      const profilePageModule = await import('./ProfilePage.js');
      ProfilePage = profilePageModule.ProfilePage;
    }

    // Reset mocks
    mockUseAuth.mockReset();
    mockUpdateProfile.mockReset();
    mockChangePassword.mockReset();

    // Default mock: return local user
    mockUseAuth.mockReturnValue({
      user: mockLocalUser,
      oidcEnabled: false,
      isLoading: false,
      error: null,
      refreshAuth: jest.fn(async () => Promise.resolve()),
      logout: jest.fn(async () => Promise.resolve()),
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe('Loading and display', () => {
    it('shows loading state initially', () => {
      // Given: Auth is loading
      mockUseAuth.mockReturnValue({
        user: null,
        oidcEnabled: false,
        isLoading: true,
        error: null,
        refreshAuth: jest.fn(async () => Promise.resolve()),
        logout: jest.fn(async () => Promise.resolve()),
      });

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Loading state is shown
      expect(screen.getByText(/loading profile/i)).toBeInTheDocument();
    });

    it('shows profile information after loading', async () => {
      // Given: Auth loaded with user
      mockUseAuth.mockReturnValue({
        user: mockLocalUser,
        oidcEnabled: false,
        isLoading: false,
        error: null,
        refreshAuth: jest.fn(async () => Promise.resolve()),
        logout: jest.fn(async () => Promise.resolve()),
      });

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Profile information is displayed
      expect(screen.getByText('local@example.com')).toBeInTheDocument();
      expect(screen.getByText('Member')).toBeInTheDocument();
      expect(screen.getByText('Local Account')).toBeInTheDocument();
      expect(screen.getByText('1/1/2024')).toBeInTheDocument();
    });

    it('displays email correctly', () => {
      // Given: User profile (default in beforeEach)
      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Email is shown
      expect(screen.getByText('local@example.com')).toBeInTheDocument();
    });

    it('displays role as "Administrator" for admin users', () => {
      // Given: Admin user
      mockUseAuth.mockReturnValue({
        user: { ...mockLocalUser, role: 'admin' },
        oidcEnabled: false,
        isLoading: false,
        error: null,
        refreshAuth: jest.fn(async () => Promise.resolve()),
        logout: jest.fn(async () => Promise.resolve()),
      });

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Role is "Administrator"
      expect(screen.getByText('Administrator')).toBeInTheDocument();
    });

    it('displays role as "Member" for member users', () => {
      // Given: Member user (default in beforeEach)
      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Role is "Member"
      expect(screen.getByText('Member')).toBeInTheDocument();
    });

    it('displays auth provider as "Local Account" for local users', () => {
      // Given: Local user (default in beforeEach)
      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Auth provider is "Local Account"
      expect(screen.getByText('Local Account')).toBeInTheDocument();
    });

    it('displays auth provider as "Single Sign-On (OIDC)" for OIDC users', () => {
      // Given: OIDC user
      mockUseAuth.mockReturnValue({
        user: mockOidcUser,
        oidcEnabled: true,
        isLoading: false,
        error: null,
        refreshAuth: jest.fn(async () => Promise.resolve()),
        logout: jest.fn(async () => Promise.resolve()),
      });

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Auth provider is "Single Sign-On (OIDC)"
      expect(screen.getByText('Single Sign-On (OIDC)')).toBeInTheDocument();
    });

    it('displays member since date formatted', () => {
      // Given: User with specific created date
      mockUseAuth.mockReturnValue({
        user: {
          ...mockLocalUser,
          createdAt: '2024-06-15T10:30:00.000Z',
        },
        oidcEnabled: false,
        isLoading: false,
        error: null,
        refreshAuth: jest.fn(async () => Promise.resolve()),
        logout: jest.fn(async () => Promise.resolve()),
      });

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Date is formatted (exact format depends on locale, check for presence)
      expect(screen.getByText(/2024/)).toBeInTheDocument();
    });

    it('shows error message when profile loading fails', () => {
      // Given: Auth loading failed
      mockUseAuth.mockReturnValue({
        user: null,
        oidcEnabled: false,
        isLoading: false,
        error: 'Failed to load profile',
        refreshAuth: jest.fn(async () => Promise.resolve()),
        logout: jest.fn(async () => Promise.resolve()),
      });

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Error message is shown
      expect(screen.getByText('Failed to load profile')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('shows generic error for non-ApiClientError failures', () => {
      // Given: Generic error
      mockUseAuth.mockReturnValue({
        user: null,
        oidcEnabled: false,
        isLoading: false,
        error: 'Network failure',
        refreshAuth: jest.fn(async () => Promise.resolve()),
        logout: jest.fn(async () => Promise.resolve()),
      });

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Generic error message is shown
      expect(screen.getByText('Network failure')).toBeInTheDocument();
    });
  });

  describe('Display name form', () => {
    it('pre-populates display name input with current value', async () => {
      // Given: User profile
      // User already mocked in beforeEach

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Input is pre-filled
      const input = (await screen.findByLabelText(/display name/i)) as HTMLInputElement;
      expect(input.value).toBe('Local User');
    });

    it('allows editing display name', async () => {
      // Given: User profile loaded
      // User already mocked in beforeEach
      const user = userEvent.setup();

      render(<ProfilePage />);

      const input = (await screen.findByLabelText(/display name/i)) as HTMLInputElement;

      // When: Typing new name
      await user.clear(input);
      await user.type(input, 'New Display Name');

      // Then: Input value updates
      expect(input.value).toBe('New Display Name');
    });

    it('submits display name update successfully', async () => {
      // Given: Profile loaded and update succeeds
      // User already mocked in beforeEach
      mockUpdateProfile.mockResolvedValue({
        ...mockLocalUser,
        displayName: 'Updated Name',
        updatedAt: '2024-06-10T15:00:00.000Z',
      });

      const user = userEvent.setup();
      render(<ProfilePage />);

      const input = (await screen.findByLabelText(/display name/i)) as HTMLInputElement;
      const button = screen.getByRole('button', { name: /save changes/i });

      // When: Updating display name
      await user.clear(input);
      await user.type(input, 'Updated Name');
      await user.click(button);

      // Then: API is called
      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalledWith({ displayName: 'Updated Name' });
      });

      // And: Success message is shown
      expect(await screen.findByText(/display name updated successfully/i)).toBeInTheDocument();
    });

    it('shows validation error for empty display name', async () => {
      // Given: Profile loaded
      // User already mocked in beforeEach
      const user = userEvent.setup();

      render(<ProfilePage />);

      const input = (await screen.findByLabelText(/display name/i)) as HTMLInputElement;
      const button = screen.getByRole('button', { name: /save changes/i });

      // When: Submitting empty name
      await user.clear(input);
      await user.click(button);

      // Then: Validation error is shown
      await waitFor(() => {
        expect(screen.getByText(/display name is required/i)).toBeInTheDocument();
      });

      // And: API is not called
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('enforces maxLength of 100 chars on input field', async () => {
      // Given: Profile loaded
      // User already mocked in beforeEach
      const user = userEvent.setup();

      render(<ProfilePage />);

      const input = (await screen.findByLabelText(/display name/i)) as HTMLInputElement;

      // Then: Input has maxLength attribute
      expect(input).toHaveAttribute('maxLength', '100');

      // And: Cannot type/paste more than 100 characters
      await user.clear(input);
      await user.type(input, 'A'.repeat(50));
      expect(input.value).toHaveLength(50);

      // When: Attempting to type more (input will truncate automatically)
      await user.type(input, 'B'.repeat(60));
      // Then: Only 100 total characters allowed
      expect(input.value.length).toBeLessThanOrEqual(100);
    });

    it('shows API error when display name update fails', async () => {
      // Given: Profile loaded, update fails
      // User already mocked in beforeEach
      mockUpdateProfile.mockRejectedValue(
        new ApiClientError(400, {
          code: 'VALIDATION_ERROR',
          message: 'Invalid display name format',
        }),
      );

      const user = userEvent.setup();
      render(<ProfilePage />);

      const input = (await screen.findByLabelText(/display name/i)) as HTMLInputElement;
      const button = screen.getByRole('button', { name: /save changes/i });

      // When: Submitting update
      await user.clear(input);
      await user.type(input, 'New Name');
      await user.click(button);

      // Then: Error message is shown
      await waitFor(() => {
        expect(screen.getByText('Invalid display name format')).toBeInTheDocument();
      });
    });

    it('disables button while update is in progress', async () => {
      // Given: Profile loaded, update pending
      // User already mocked in beforeEach
      mockUpdateProfile.mockImplementation(() => new Promise(() => {}));

      const user = userEvent.setup();
      render(<ProfilePage />);

      const input = (await screen.findByLabelText(/display name/i)) as HTMLInputElement;
      const button = screen.getByRole('button', { name: /save changes/i });

      // When: Submitting update
      await user.clear(input);
      await user.type(input, 'New Name');
      await user.click(button);

      // Then: Button is disabled and shows "Saving..."
      await waitFor(() => {
        expect(button).toBeDisabled();
        expect(button).toHaveTextContent(/saving/i);
      });
    });
  });

  describe('Password form (local users)', () => {
    it('shows password form for local users', () => {
      // Given: Local user (default in beforeEach)
      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Password form is visible
      expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
    });

    it('hides password form for OIDC users', () => {
      // Given: OIDC user
      mockUseAuth.mockReturnValue({
        user: mockOidcUser,
        oidcEnabled: true,
        isLoading: false,
        error: null,
        refreshAuth: jest.fn(async () => Promise.resolve()),
        logout: jest.fn(async () => Promise.resolve()),
      });

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Password form is hidden
      expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^new password$/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/confirm new password/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /change password/i })).not.toBeInTheDocument();
    });

    it('shows identity provider message for OIDC users', () => {
      // Given: OIDC user
      mockUseAuth.mockReturnValue({
        user: mockOidcUser,
        oidcEnabled: true,
        isLoading: false,
        error: null,
        refreshAuth: jest.fn(async () => Promise.resolve()),
        logout: jest.fn(async () => Promise.resolve()),
      });

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: OIDC message is shown
      expect(
        screen.getByText(/your credentials are managed by your identity provider/i),
      ).toBeInTheDocument();
    });

    it('allows typing in all password fields', async () => {
      // Given: Local user
      // User already mocked in beforeEach
      const user = userEvent.setup();

      render(<ProfilePage />);

      // When: Typing in password fields
      const currentPasswordInput = (await screen.findByLabelText(
        /current password/i,
      )) as HTMLInputElement;
      const newPasswordInput = screen.getByLabelText(/^new password$/i) as HTMLInputElement;
      const confirmPasswordInput = screen.getByLabelText(
        /confirm new password/i,
      ) as HTMLInputElement;

      await user.type(currentPasswordInput, 'oldpassword123');
      await user.type(newPasswordInput, 'newpassword456');
      await user.type(confirmPasswordInput, 'newpassword456');

      // Then: Values are updated
      expect(currentPasswordInput.value).toBe('oldpassword123');
      expect(newPasswordInput.value).toBe('newpassword456');
      expect(confirmPasswordInput.value).toBe('newpassword456');
    });

    it('shows validation error for empty current password', async () => {
      // Given: Local user
      // User already mocked in beforeEach
      const user = userEvent.setup();

      render(<ProfilePage />);

      await screen.findByLabelText(/current password/i);
      const button = screen.getByRole('button', { name: /change password/i });

      // When: Submitting without current password
      await user.click(button);

      // Then: Validation error is shown
      await waitFor(() => {
        expect(screen.getByText(/current password is required/i)).toBeInTheDocument();
      });
    });

    it('shows validation error for empty new password', async () => {
      // Given: Local user
      // User already mocked in beforeEach
      const user = userEvent.setup();

      render(<ProfilePage />);

      const currentPasswordInput = (await screen.findByLabelText(
        /current password/i,
      )) as HTMLInputElement;
      const button = screen.getByRole('button', { name: /change password/i });

      // When: Submitting without new password
      await user.type(currentPasswordInput, 'current123456');
      await user.click(button);

      // Then: Validation error is shown
      await waitFor(() => {
        expect(screen.getByText(/new password is required/i)).toBeInTheDocument();
      });
    });

    it('shows validation error for new password < 12 chars', async () => {
      // Given: Local user
      // User already mocked in beforeEach
      const user = userEvent.setup();

      render(<ProfilePage />);

      const currentPasswordInput = (await screen.findByLabelText(
        /current password/i,
      )) as HTMLInputElement;
      const newPasswordInput = screen.getByLabelText(/^new password$/i) as HTMLInputElement;
      const button = screen.getByRole('button', { name: /change password/i });

      // When: Submitting with short password
      await user.type(currentPasswordInput, 'current123456');
      await user.type(newPasswordInput, 'short');
      await user.click(button);

      // Then: Validation error is shown (use describedby to find the right error)
      await waitFor(() => {
        const errorId = newPasswordInput.getAttribute('aria-describedby');
        expect(errorId).toBe('newPassword-error');
        const errorElement = document.getElementById(errorId!);
        expect(errorElement).toHaveTextContent(/at least 12 characters/i);
      });
    });

    it('shows validation error when passwords do not match', async () => {
      // Given: Local user
      // User already mocked in beforeEach
      const user = userEvent.setup();

      render(<ProfilePage />);

      const currentPasswordInput = (await screen.findByLabelText(
        /current password/i,
      )) as HTMLInputElement;
      const newPasswordInput = screen.getByLabelText(/^new password$/i) as HTMLInputElement;
      const confirmPasswordInput = screen.getByLabelText(
        /confirm new password/i,
      ) as HTMLInputElement;
      const button = screen.getByRole('button', { name: /change password/i });

      // When: Passwords don't match
      await user.type(currentPasswordInput, 'current123456');
      await user.type(newPasswordInput, 'newpassword123');
      await user.type(confirmPasswordInput, 'differentpassword');
      await user.click(button);

      // Then: Validation error is shown
      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });
    });

    it('changes password successfully', async () => {
      // Given: Local user, password change succeeds
      // User already mocked in beforeEach
      mockChangePassword.mockResolvedValue(undefined);

      const user = userEvent.setup();
      render(<ProfilePage />);

      const currentPasswordInput = (await screen.findByLabelText(
        /current password/i,
      )) as HTMLInputElement;
      const newPasswordInput = screen.getByLabelText(/^new password$/i) as HTMLInputElement;
      const confirmPasswordInput = screen.getByLabelText(
        /confirm new password/i,
      ) as HTMLInputElement;
      const button = screen.getByRole('button', { name: /change password/i });

      // When: Changing password
      await user.type(currentPasswordInput, 'oldpassword123');
      await user.type(newPasswordInput, 'newpassword123');
      await user.type(confirmPasswordInput, 'newpassword123');
      await user.click(button);

      // Then: API is called
      await waitFor(() => {
        expect(mockChangePassword).toHaveBeenCalledWith({
          currentPassword: 'oldpassword123',
          newPassword: 'newpassword123',
        });
      });

      // And: Success message is shown
      expect(await screen.findByText(/password changed successfully/i)).toBeInTheDocument();

      // And: Form is cleared
      expect(currentPasswordInput.value).toBe('');
      expect(newPasswordInput.value).toBe('');
      expect(confirmPasswordInput.value).toBe('');
    });

    it('shows API error when password change fails', async () => {
      // Given: Local user, password change fails
      // User already mocked in beforeEach
      mockChangePassword.mockRejectedValue(
        new ApiClientError(401, {
          code: 'INVALID_CREDENTIALS',
          message: 'Current password is incorrect',
        }),
      );

      const user = userEvent.setup();
      render(<ProfilePage />);

      const currentPasswordInput = (await screen.findByLabelText(
        /current password/i,
      )) as HTMLInputElement;
      const newPasswordInput = screen.getByLabelText(/^new password$/i) as HTMLInputElement;
      const confirmPasswordInput = screen.getByLabelText(
        /confirm new password/i,
      ) as HTMLInputElement;
      const button = screen.getByRole('button', { name: /change password/i });

      // When: Submitting with wrong current password
      await user.type(currentPasswordInput, 'wrongpassword');
      await user.type(newPasswordInput, 'newpassword123');
      await user.type(confirmPasswordInput, 'newpassword123');
      await user.click(button);

      // Then: Error message is shown
      await waitFor(() => {
        expect(screen.getByText('Current password is incorrect')).toBeInTheDocument();
      });
    });

    it('disables button while password change is in progress', async () => {
      // Given: Local user, password change pending
      // User already mocked in beforeEach
      mockChangePassword.mockImplementation(() => new Promise(() => {}));

      const user = userEvent.setup();
      render(<ProfilePage />);

      const currentPasswordInput = (await screen.findByLabelText(
        /current password/i,
      )) as HTMLInputElement;
      const newPasswordInput = screen.getByLabelText(/^new password$/i) as HTMLInputElement;
      const confirmPasswordInput = screen.getByLabelText(
        /confirm new password/i,
      ) as HTMLInputElement;
      const button = screen.getByRole('button', { name: /change password/i });

      // When: Submitting password change
      await user.type(currentPasswordInput, 'current123456');
      await user.type(newPasswordInput, 'newpassword123');
      await user.type(confirmPasswordInput, 'newpassword123');
      await user.click(button);

      // Then: Button is disabled and shows "Changing Password..."
      await waitFor(() => {
        expect(button).toBeDisabled();
        expect(button).toHaveTextContent(/changing password/i);
      });
    });
  });
});
