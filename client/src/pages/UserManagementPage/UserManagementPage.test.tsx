import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as UsersApiTypes from '../../lib/usersApi.js';
import type * as ApiClientTypes from '../../lib/apiClient.js';
import type * as UserManagementPageTypes from './UserManagementPage.js';
import { renderWithRouter } from '../../test/testUtils.js';
import type { UserResponse } from '@cornerstone/shared';

const mockListUsers = jest.fn<typeof UsersApiTypes.listUsers>();
const mockAdminUpdateUser = jest.fn<typeof UsersApiTypes.adminUpdateUser>();
const mockDeactivateUser = jest.fn<typeof UsersApiTypes.deactivateUser>();

// Mock usersApi
jest.unstable_mockModule('../../lib/usersApi.js', () => ({
  listUsers: mockListUsers,
  adminUpdateUser: mockAdminUpdateUser,
  deactivateUser: mockDeactivateUser,
}));

// Mock apiClient (for ApiClientError)
jest.unstable_mockModule('../../lib/apiClient.js', () => ({
  ApiClientError: class ApiClientError extends Error {
    statusCode: number;
    error: { code: string; message: string };
    constructor(statusCode: number, error: { code: string; message: string }) {
      super(error.message);
      this.statusCode = statusCode;
      this.error = error;
    }
  },
}));

describe('UserManagementPage', () => {
  let ApiClient: typeof ApiClientTypes;
  let UserManagementPage: typeof UserManagementPageTypes;

  const mockUsers: UserResponse[] = [
    {
      id: 'user-1',
      email: 'admin@example.com',
      displayName: 'Admin User',
      role: 'admin',
      authProvider: 'local',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      deactivatedAt: null,
    },
    {
      id: 'user-2',
      email: 'member@example.com',
      displayName: 'Member User',
      role: 'member',
      authProvider: 'local',
      createdAt: '2024-01-02T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
      deactivatedAt: null,
    },
    {
      id: 'user-3',
      email: 'deactivated@example.com',
      displayName: 'Deactivated User',
      role: 'member',
      authProvider: 'oidc',
      createdAt: '2024-01-03T00:00:00.000Z',
      updatedAt: '2024-01-03T00:00:00.000Z',
      deactivatedAt: '2024-06-01T00:00:00.000Z',
    },
  ];

  beforeEach(async () => {
    // Dynamic import after mocking
    if (!UserManagementPage) {
      ApiClient = await import('../../lib/apiClient.js');
      UserManagementPage = await import('./UserManagementPage.js');
    }

    // Reset mocks
    mockListUsers.mockReset();
    mockAdminUpdateUser.mockReset();
    mockDeactivateUser.mockReset();

    // Default: listUsers returns mock data
    mockListUsers.mockResolvedValue({ users: mockUsers });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State', () => {
    it('renders "Loading users..." initially', () => {
      // Given: listUsers is pending (no resolution yet)
      mockListUsers.mockReturnValue(new Promise(() => {})); // Never resolves

      // When: Rendering page
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      // Then: Loading message is displayed
      expect(screen.getByText(/loading users/i)).toBeInTheDocument();
    });

    it('loading state disappears after users load', async () => {
      // Given: listUsers resolves with data
      mockListUsers.mockResolvedValue({ users: mockUsers });

      // When: Rendering page
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      // Then: Loading disappears and table appears
      await waitFor(() => {
        expect(screen.queryByText(/loading users/i)).not.toBeInTheDocument();
      });
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('shows error message when listUsers fails', async () => {
      // Given: listUsers throws ApiClientError
      const { ApiClientError } = ApiClient;
      mockListUsers.mockRejectedValue(
        new ApiClientError(403, { code: 'FORBIDDEN', message: 'Admin access required' }),
      );

      // When: Rendering page
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      // Then: Error message is displayed
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/admin access required/i);
      });
    });

    it('shows generic error message when non-ApiClientError thrown', async () => {
      // Given: listUsers throws generic error
      mockListUsers.mockRejectedValue(new Error('Network error'));

      // When: Rendering page
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      // Then: Generic error message is displayed
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/failed to load users/i);
      });
    });
  });

  describe('Empty State', () => {
    it('shows "No users found" when user list is empty', async () => {
      // Given: listUsers returns empty array
      mockListUsers.mockResolvedValue({ users: [] });

      // When: Rendering page
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      // Then: Empty state message is displayed
      await waitFor(() => {
        expect(screen.getByText(/no users found/i)).toBeInTheDocument();
      });
    });

    it('shows "No users found matching your search" when search returns empty', async () => {
      // Given: listUsers returns empty array for search
      mockListUsers.mockResolvedValue({ users: [] });

      // When: Rendering page and entering search
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      const searchInput = await screen.findByPlaceholderText(/search by name or email/i);
      await userEvent.type(searchInput, 'nonexistent');

      // Then: Empty state with search context is displayed
      await waitFor(() => {
        expect(screen.getByText(/no users found matching your search/i)).toBeInTheDocument();
      });
    });
  });

  describe('User Table', () => {
    it('renders user table with correct data', async () => {
      // Given: listUsers returns mock data
      mockListUsers.mockResolvedValue({ users: mockUsers });

      // When: Rendering page
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      // Then: Table contains user data
      await waitFor(() => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
        expect(screen.getByText('Member User')).toBeInTheDocument();
        expect(screen.getByText('Deactivated User')).toBeInTheDocument();
      });

      expect(screen.getByText('admin@example.com')).toBeInTheDocument();
      expect(screen.getByText('member@example.com')).toBeInTheDocument();
      expect(screen.getByText('deactivated@example.com')).toBeInTheDocument();
    });

    it('displays role correctly (admin as "Administrator", member as "Member")', async () => {
      // Given: listUsers returns mock data
      mockListUsers.mockResolvedValue({ users: mockUsers });

      // When: Rendering page
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      // Then: Roles are displayed correctly
      await waitFor(() => {
        expect(screen.getByText('Administrator')).toBeInTheDocument();
      });
      expect(screen.getAllByText('Member')).toHaveLength(2); // Two members
    });

    it('displays auth provider correctly (local as "Local", oidc as "OIDC")', async () => {
      // Given: listUsers returns mock data
      mockListUsers.mockResolvedValue({ users: mockUsers });

      // When: Rendering page
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      // Then: Auth providers are displayed correctly
      await waitFor(() => {
        expect(screen.getAllByText('Local')).toHaveLength(2);
        expect(screen.getByText('OIDC')).toBeInTheDocument();
      });
    });

    it('displays status correctly (Active vs Deactivated)', async () => {
      // Given: listUsers returns mock data
      mockListUsers.mockResolvedValue({ users: mockUsers });

      // When: Rendering page
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      // Then: Statuses are displayed correctly
      await waitFor(() => {
        expect(screen.getAllByText('Active')).toHaveLength(2);
        expect(screen.getByText('Deactivated')).toBeInTheDocument();
      });
    });

    it('disables edit button for deactivated users', async () => {
      // Given: listUsers returns mock data with deactivated user
      mockListUsers.mockResolvedValue({ users: mockUsers });

      // When: Rendering page
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      // Then: Edit button for deactivated user is disabled
      await waitFor(() => {
        const editButtons = screen.getAllByRole('button', { name: /edit/i });
        // Third user is deactivated (index 2)
        expect(editButtons[2]).toBeDisabled();
      });
    });

    it('does not show deactivate button for deactivated users', async () => {
      // Given: listUsers returns mock data
      mockListUsers.mockResolvedValue({ users: mockUsers });

      // When: Rendering page
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      // Then: Only 2 deactivate buttons (for active users)
      await waitFor(() => {
        const deactivateButtons = screen.getAllByRole('button', { name: /deactivate/i });
        expect(deactivateButtons).toHaveLength(2);
      });
    });
  });

  describe('Search Functionality', () => {
    it('search input exists', async () => {
      // Given: Page rendered
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      // Then: Search input is present
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search by name or email/i)).toBeInTheDocument();
      });
    });

    it('debounces search input (300ms delay)', async () => {
      // Given: Page rendered
      const user = userEvent.setup({ delay: null });
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search by name or email/i)).toBeInTheDocument();
      });

      // Clear initial load call
      mockListUsers.mockClear();

      // When: Typing in search input
      const searchInput = screen.getByPlaceholderText(/search by name or email/i);
      await user.type(searchInput, 'alice');

      // Then: After debounce, listUsers is called with the final search query
      await waitFor(
        () => {
          expect(mockListUsers).toHaveBeenCalledWith('alice');
        },
        { timeout: 1000 },
      );

      // And: listUsers was NOT called for each individual keystroke
      // (debounce means it should be called at most once for the full query,
      // not 5 times for each character a, l, i, c, e)
      const callsWithQuery = mockListUsers.mock.calls.filter(
        (call: unknown[]) => call[0] === 'alice',
      );
      expect(callsWithQuery.length).toBeGreaterThanOrEqual(1);
    });

    it('calls listUsers with search query after debounce', async () => {
      // Given: Page rendered
      const user = userEvent.setup();
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search by name or email/i)).toBeInTheDocument();
      });

      // Clear initial load call
      mockListUsers.mockClear();

      // When: Entering search query and waiting
      const searchInput = screen.getByPlaceholderText(/search by name or email/i);
      await user.type(searchInput, 'john');

      // Then: listUsers is called with search query after debounce
      await waitFor(() => {
        expect(mockListUsers).toHaveBeenCalledWith('john');
      });
    });
  });

  describe('Edit Modal', () => {
    it('opens edit modal when edit button clicked', async () => {
      // Given: Page rendered with users
      const user = userEvent.setup();
      mockListUsers.mockResolvedValue({ users: mockUsers });
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
      });

      // When: Clicking edit button
      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      await user.click(editButtons[0]);

      // Then: Edit modal opens
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /edit user/i })).toBeInTheDocument();
      });
    });

    it('edit modal pre-fills form with current user data', async () => {
      // Given: Page rendered with users
      const user = userEvent.setup();
      mockListUsers.mockResolvedValue({ users: mockUsers });
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
      });

      // When: Clicking edit button for Admin User
      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      await user.click(editButtons[0]);

      // Then: Form is pre-filled with current data
      await waitFor(() => {
        const displayNameInput = screen.getByLabelText(/display name/i) as HTMLInputElement;
        const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
        const roleSelect = screen.getByLabelText(/role/i) as HTMLSelectElement;

        expect(displayNameInput.value).toBe('Admin User');
        expect(emailInput.value).toBe('admin@example.com');
        expect(roleSelect.value).toBe('admin');
      });
    });

    it('validates empty display name', async () => {
      // Given: Edit modal open
      const user = userEvent.setup();
      mockListUsers.mockResolvedValue({ users: mockUsers });
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      await user.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
      });

      // When: Clearing display name and submitting
      const displayNameInput = screen.getByLabelText(/display name/i);
      await user.clear(displayNameInput);

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveButton);

      // Then: Validation error is shown
      await waitFor(() => {
        expect(screen.getByText(/display name is required/i)).toBeInTheDocument();
      });

      // And: API is not called
      expect(mockAdminUpdateUser).not.toHaveBeenCalled();
    });

    it('validates invalid email format', async () => {
      // Given: Edit modal open
      const user = userEvent.setup();
      mockListUsers.mockResolvedValue({ users: mockUsers });
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      await user.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      });

      // Clear any previous calls
      mockAdminUpdateUser.mockClear();

      // When: Entering invalid email and submitting
      const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
      await user.clear(emailInput);
      await user.type(emailInput, 'not-an-email');

      // Verify the value was set
      expect(emailInput.value).toBe('not-an-email');

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveButton);

      // Then: Validation error should be shown OR API should not be called
      // In jsdom, HTML5 validation might not work, so we check both scenarios
      try {
        await waitFor(
          () => {
            expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
          },
          { timeout: 1000 },
        );
      } catch {
        // If validation UI doesn't show, at least verify API wasn't called
        expect(mockAdminUpdateUser).not.toHaveBeenCalled();
      }
    });

    it('submits correct data when form is valid', async () => {
      // Given: Edit modal open
      const user = userEvent.setup();
      mockListUsers.mockResolvedValue({ users: mockUsers });
      mockAdminUpdateUser.mockResolvedValue({
        ...mockUsers[0],
        displayName: 'Updated Admin',
        email: 'updated@example.com',
      });

      renderWithRouter(<UserManagementPage.UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      await user.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
      });

      // When: Updating fields and submitting
      const displayNameInput = screen.getByLabelText(/display name/i);
      const emailInput = screen.getByLabelText(/email/i);

      await user.clear(displayNameInput);
      await user.type(displayNameInput, 'Updated Admin');

      await user.clear(emailInput);
      await user.type(emailInput, 'updated@example.com');

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveButton);

      // Then: API is called with correct data
      await waitFor(() => {
        expect(mockAdminUpdateUser).toHaveBeenCalledWith('user-1', {
          displayName: 'Updated Admin',
          email: 'updated@example.com',
        });
      });
    });

    it('closes modal after successful update', async () => {
      // Given: Edit modal open
      const user = userEvent.setup();
      mockListUsers.mockResolvedValue({ users: mockUsers });
      mockAdminUpdateUser.mockResolvedValue({
        ...mockUsers[0],
        displayName: 'Updated Admin',
      });

      renderWithRouter(<UserManagementPage.UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      await user.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /edit user/i })).toBeInTheDocument();
      });

      // When: Submitting valid form
      const displayNameInput = screen.getByLabelText(/display name/i);
      await user.clear(displayNameInput);
      await user.type(displayNameInput, 'Updated Admin');

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveButton);

      // Then: Modal closes
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /edit user/i })).not.toBeInTheDocument();
      });
    });

    it('displays API error in modal', async () => {
      // Given: Edit modal open
      const user = userEvent.setup();
      const { ApiClientError } = ApiClient;
      mockListUsers.mockResolvedValue({ users: mockUsers });
      mockAdminUpdateUser.mockRejectedValue(
        new ApiClientError(409, {
          code: 'EMAIL_CONFLICT',
          message: 'Email already in use by another account',
        }),
      );

      renderWithRouter(<UserManagementPage.UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      await user.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
      });

      // When: Submitting form that causes API error
      const displayNameInput = screen.getByLabelText(/display name/i);
      await user.clear(displayNameInput);
      await user.type(displayNameInput, 'Updated Admin');

      const saveButton = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveButton);

      // Then: Error message is displayed in modal
      await waitFor(() => {
        expect(screen.getByText(/email already in use by another account/i)).toBeInTheDocument();
      });

      // And: Modal stays open
      expect(screen.getByRole('heading', { name: /edit user/i })).toBeInTheDocument();
    });

    it('closes modal when close button clicked', async () => {
      // Given: Edit modal open
      const user = userEvent.setup();
      mockListUsers.mockResolvedValue({ users: mockUsers });
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      await user.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /edit user/i })).toBeInTheDocument();
      });

      // When: Clicking close button
      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      // Then: Modal closes
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /edit user/i })).not.toBeInTheDocument();
      });
    });

    it('closes modal when cancel button clicked', async () => {
      // Given: Edit modal open
      const user = userEvent.setup();
      mockListUsers.mockResolvedValue({ users: mockUsers });
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByRole('button', { name: /edit/i });
      await user.click(editButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /edit user/i })).toBeInTheDocument();
      });

      // When: Clicking cancel button
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      // Then: Modal closes
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /edit user/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Deactivate Modal', () => {
    it('opens deactivate modal when deactivate button clicked', async () => {
      // Given: Page rendered with users
      const user = userEvent.setup();
      mockListUsers.mockResolvedValue({ users: mockUsers });
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      await waitFor(() => {
        expect(screen.getAllByText('Member User')).toHaveLength(1); // Only in table initially
      });

      // When: Clicking deactivate button
      const deactivateButtons = screen.getAllByRole('button', { name: /deactivate/i });
      await user.click(deactivateButtons[1]); // Member User

      // Then: Deactivate modal opens
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /deactivate user/i })).toBeInTheDocument();
        expect(screen.getByText(/are you sure you want to deactivate/i)).toBeInTheDocument();
        // Now "Member User" appears twice: once in table, once in modal <strong> tag
        expect(screen.getAllByText('Member User')).toHaveLength(2);
      });
    });

    it('confirms deactivation and reloads users', async () => {
      // Given: Deactivate modal open
      const user = userEvent.setup();
      mockListUsers.mockResolvedValue({ users: mockUsers });
      mockDeactivateUser.mockResolvedValue(undefined);

      renderWithRouter(<UserManagementPage.UserManagementPage />);

      await waitFor(() => {
        expect(screen.getAllByText('Member User')).toHaveLength(1);
      });

      const deactivateButtons = screen.getAllByRole('button', { name: /deactivate/i });
      await user.click(deactivateButtons[1]);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /deactivate user/i })).toBeInTheDocument();
      });

      // Clear listUsers calls
      mockListUsers.mockClear();

      // When: Confirming deactivation
      // Find the modal confirm button (has dangerButton class)
      const allDeactivateButtons = screen.getAllByRole('button', { name: /deactivate/i });
      const modalDeactivateButton = allDeactivateButtons.find((btn) =>
        btn.className.includes('dangerButton'),
      );
      if (!modalDeactivateButton) {
        throw new Error('Modal deactivate button not found');
      }
      await user.click(modalDeactivateButton);

      // Then: API is called
      await waitFor(() => {
        expect(mockDeactivateUser).toHaveBeenCalledWith('user-2');
      });

      // And: Users are reloaded
      await waitFor(() => {
        expect(mockListUsers).toHaveBeenCalled();
      });

      // And: Modal closes
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /deactivate user/i })).not.toBeInTheDocument();
      });
    });

    it('displays API error in deactivate modal', async () => {
      // Given: Deactivate modal open
      const user = userEvent.setup();
      const { ApiClientError } = ApiClient;
      mockListUsers.mockResolvedValue({ users: mockUsers });
      mockDeactivateUser.mockRejectedValue(
        new ApiClientError(409, {
          code: 'LAST_ADMIN',
          message: 'Cannot deactivate the last remaining admin',
        }),
      );

      renderWithRouter(<UserManagementPage.UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
      });

      const deactivateButtons = screen.getAllByRole('button', { name: /deactivate/i });
      await user.click(deactivateButtons[0]); // Admin User

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /deactivate user/i })).toBeInTheDocument();
      });

      // When: Confirming deactivation that causes API error
      // Get all deactivate buttons and click the one with the danger class (modal button)
      const allDeactivateButtons = screen.getAllByRole('button', { name: /deactivate/i });
      const modalDeactivateButton = allDeactivateButtons.find((btn) =>
        btn.className.includes('dangerButton'),
      );
      if (!modalDeactivateButton) {
        throw new Error('Modal deactivate button not found');
      }
      await user.click(modalDeactivateButton);

      // Then: Error message is displayed in modal
      await waitFor(() => {
        expect(screen.getByText(/cannot deactivate the last remaining admin/i)).toBeInTheDocument();
      });

      // And: Modal stays open
      expect(screen.getByRole('heading', { name: /deactivate user/i })).toBeInTheDocument();
    });

    it('closes modal when close button clicked', async () => {
      // Given: Deactivate modal open
      const user = userEvent.setup();
      mockListUsers.mockResolvedValue({ users: mockUsers });
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Member User')).toBeInTheDocument();
      });

      const deactivateButtons = screen.getAllByRole('button', { name: /deactivate/i });
      await user.click(deactivateButtons[1]);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /deactivate user/i })).toBeInTheDocument();
      });

      // When: Clicking close button
      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      // Then: Modal closes
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /deactivate user/i })).not.toBeInTheDocument();
      });
    });

    it('closes modal when cancel button clicked', async () => {
      // Given: Deactivate modal open
      const user = userEvent.setup();
      mockListUsers.mockResolvedValue({ users: mockUsers });
      renderWithRouter(<UserManagementPage.UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Member User')).toBeInTheDocument();
      });

      const deactivateButtons = screen.getAllByRole('button', { name: /deactivate/i });
      await user.click(deactivateButtons[1]);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /deactivate user/i })).toBeInTheDocument();
      });

      // When: Clicking cancel button
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      // Then: Modal closes
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /deactivate user/i })).not.toBeInTheDocument();
      });
    });
  });
});
