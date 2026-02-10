import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as ProfilePageTypes from './ProfilePage.js';
import { ApiClientError } from '../../lib/apiClient.js';

// Mock usersApi before importing the component
jest.unstable_mockModule('../../lib/usersApi.js', () => ({
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
  changePassword: jest.fn(),
}));

describe('ProfilePage', () => {
  let usersApi: typeof UsersApiTypes;
  let ProfilePage: typeof ProfilePageTypes.ProfilePage;

  let mockGetProfile: jest.MockedFunction<typeof UsersApiTypes.getProfile>;
  let mockUpdateProfile: jest.MockedFunction<typeof UsersApiTypes.updateProfile>;
  let mockChangePassword: jest.MockedFunction<typeof UsersApiTypes.changePassword>;

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
    if (!usersApi) {
      usersApi = await import('../../lib/usersApi.js');
      const profilePageModule = await import('./ProfilePage.js');
      ProfilePage = profilePageModule.ProfilePage;
    }

    // Reset mocks
    mockGetProfile = usersApi.getProfile as jest.MockedFunction<typeof usersApi.getProfile>;
    mockUpdateProfile = usersApi.updateProfile as jest.MockedFunction<
      typeof usersApi.updateProfile
    >;
    mockChangePassword = usersApi.changePassword as jest.MockedFunction<
      typeof usersApi.changePassword
    >;

    mockGetProfile.mockReset();
    mockUpdateProfile.mockReset();
    mockChangePassword.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Loading and display', () => {
    it('shows loading state initially', () => {
      // Given: getProfile is pending
      mockGetProfile.mockImplementation(() => new Promise(() => {}));

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Loading state is shown
      expect(screen.getByText(/loading profile/i)).toBeInTheDocument();
    });

    it('shows profile information after loading', async () => {
      // Given: Mock profile data
      mockGetProfile.mockResolvedValue(mockLocalUser);

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Profile information is displayed
      await waitFor(() => {
        expect(screen.getByText('local@example.com')).toBeInTheDocument();
      });

      expect(screen.getByText('Member')).toBeInTheDocument();
      expect(screen.getByText('Local Account')).toBeInTheDocument();
      expect(screen.getByText('1/1/2024')).toBeInTheDocument();
    });

    it('displays email correctly', async () => {
      // Given: User profile
      mockGetProfile.mockResolvedValue(mockLocalUser);

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Email is shown
      await waitFor(() => {
        expect(screen.getByText('local@example.com')).toBeInTheDocument();
      });
    });

    it('displays role as "Administrator" for admin users', async () => {
      // Given: Admin user
      mockGetProfile.mockResolvedValue({ ...mockLocalUser, role: 'admin' });

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Role is "Administrator"
      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });
    });

    it('displays role as "Member" for member users', async () => {
      // Given: Member user
      mockGetProfile.mockResolvedValue(mockLocalUser);

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Role is "Member"
      await waitFor(() => {
        expect(screen.getByText('Member')).toBeInTheDocument();
      });
    });

    it('displays auth provider as "Local Account" for local users', async () => {
      // Given: Local user
      mockGetProfile.mockResolvedValue(mockLocalUser);

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Auth provider is "Local Account"
      await waitFor(() => {
        expect(screen.getByText('Local Account')).toBeInTheDocument();
      });
    });

    it('displays auth provider as "Single Sign-On (OIDC)" for OIDC users', async () => {
      // Given: OIDC user
      mockGetProfile.mockResolvedValue(mockOidcUser);

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Auth provider is "Single Sign-On (OIDC)"
      await waitFor(() => {
        expect(screen.getByText('Single Sign-On (OIDC)')).toBeInTheDocument();
      });
    });

    it('displays member since date formatted', async () => {
      // Given: User with specific created date
      mockGetProfile.mockResolvedValue({
        ...mockLocalUser,
        createdAt: '2024-06-15T10:30:00.000Z',
      });

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Date is formatted (exact format depends on locale, check for presence)
      await waitFor(() => {
        expect(screen.getByText(/2024/)).toBeInTheDocument();
      });
    });

    it('shows error message when profile loading fails', async () => {
      // Given: getProfile fails
      mockGetProfile.mockRejectedValue(
        new ApiClientError(500, {
          code: 'INTERNAL_ERROR',
          message: 'Failed to load profile',
        }),
      );

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Error message is shown
      await waitFor(() => {
        expect(screen.getByText('Failed to load profile')).toBeInTheDocument();
      });
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('shows generic error for non-ApiClientError failures', async () => {
      // Given: Network error
      mockGetProfile.mockRejectedValue(new Error('Network failure'));

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Generic error message is shown
      await waitFor(() => {
        expect(screen.getByText(/failed to load profile/i)).toBeInTheDocument();
      });
    });
  });

  describe('Display name form', () => {
    it('pre-populates display name input with current value', async () => {
      // Given: User profile
      mockGetProfile.mockResolvedValue(mockLocalUser);

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Input is pre-filled
      const input = (await screen.findByLabelText(/display name/i)) as HTMLInputElement;
      expect(input.value).toBe('Local User');
    });

    it('allows editing display name', async () => {
      // Given: User profile loaded
      mockGetProfile.mockResolvedValue(mockLocalUser);
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
      mockGetProfile.mockResolvedValue(mockLocalUser);
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
      mockGetProfile.mockResolvedValue(mockLocalUser);
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
      mockGetProfile.mockResolvedValue(mockLocalUser);
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
      mockGetProfile.mockResolvedValue(mockLocalUser);
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
      mockGetProfile.mockResolvedValue(mockLocalUser);
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
    it('shows password form for local users', async () => {
      // Given: Local user
      mockGetProfile.mockResolvedValue(mockLocalUser);

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Password form is visible
      await waitFor(() => {
        expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
      });
      expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
    });

    it('hides password form for OIDC users', async () => {
      // Given: OIDC user
      mockGetProfile.mockResolvedValue(mockOidcUser);

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: Password form is hidden
      await waitFor(() => {
        expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
      });
      expect(screen.queryByLabelText(/^new password$/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/confirm new password/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /change password/i })).not.toBeInTheDocument();
    });

    it('shows identity provider message for OIDC users', async () => {
      // Given: OIDC user
      mockGetProfile.mockResolvedValue(mockOidcUser);

      // When: Rendering ProfilePage
      render(<ProfilePage />);

      // Then: OIDC message is shown
      await waitFor(() => {
        expect(
          screen.getByText(/your credentials are managed by your identity provider/i),
        ).toBeInTheDocument();
      });
    });

    it('allows typing in all password fields', async () => {
      // Given: Local user
      mockGetProfile.mockResolvedValue(mockLocalUser);
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
      mockGetProfile.mockResolvedValue(mockLocalUser);
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
      mockGetProfile.mockResolvedValue(mockLocalUser);
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
      mockGetProfile.mockResolvedValue(mockLocalUser);
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
      mockGetProfile.mockResolvedValue(mockLocalUser);
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
      mockGetProfile.mockResolvedValue(mockLocalUser);
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
      mockGetProfile.mockResolvedValue(mockLocalUser);
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
      mockGetProfile.mockResolvedValue(mockLocalUser);
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
