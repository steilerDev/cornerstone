import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type * as ApiClientTypes from './apiClient.js';
import type * as UsersApiTypes from './usersApi.js';

const mockGet = jest.fn<typeof ApiClientTypes.get>();
const mockPost = jest.fn<typeof ApiClientTypes.post>();
const mockPatch = jest.fn<typeof ApiClientTypes.patch>();
const mockDel = jest.fn<typeof ApiClientTypes.del>();

// Mock apiClient before importing usersApi
jest.unstable_mockModule('./apiClient.js', () => ({
  get: mockGet,
  post: mockPost,
  patch: mockPatch,
  del: mockDel,
}));

describe('usersApi', () => {
  let usersApi: typeof UsersApiTypes;

  beforeEach(async () => {
    // Dynamic import after mocking
    if (!usersApi) {
      usersApi = await import('./usersApi.js');
    }

    // Reset mocks
    mockGet.mockReset();
    mockPost.mockReset();
    mockPatch.mockReset();
    mockDel.mockReset();
  });

  describe('getProfile()', () => {
    it('calls GET /users/me', async () => {
      // Given: Mock response
      const mockUser = {
        id: 'user-123',
        email: 'user@example.com',
        displayName: 'Test User',
        role: 'member' as const,
        authProvider: 'local' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        deactivatedAt: null,
      };
      mockGet.mockResolvedValue(mockUser);

      // When: Calling getProfile
      const result = await usersApi.getProfile();

      // Then: Calls correct endpoint
      expect(mockGet).toHaveBeenCalledWith('/users/me');
      expect(mockGet).toHaveBeenCalledTimes(1);

      // And: Returns user data
      expect(result).toEqual(mockUser);
    });

    it('returns UserResponse with all fields', async () => {
      // Given: Mock response with all fields
      const mockUser = {
        id: 'user-456',
        email: 'admin@example.com',
        displayName: 'Admin User',
        role: 'admin' as const,
        authProvider: 'oidc' as const,
        createdAt: '2024-06-01T10:00:00.000Z',
        updatedAt: '2024-06-01T12:00:00.000Z',
        deactivatedAt: null,
      };
      mockGet.mockResolvedValue(mockUser);

      // When: Calling getProfile
      const result = await usersApi.getProfile();

      // Then: All fields are present
      expect(result).toMatchObject({
        id: 'user-456',
        email: 'admin@example.com',
        displayName: 'Admin User',
        role: 'admin',
        authProvider: 'oidc',
        createdAt: '2024-06-01T10:00:00.000Z',
        updatedAt: '2024-06-01T12:00:00.000Z',
        deactivatedAt: null,
      });
    });

    it('propagates errors from apiClient', async () => {
      // Given: API error
      const error = new Error('Network error');
      mockGet.mockRejectedValue(error);

      // When/Then: Error is propagated
      await expect(usersApi.getProfile()).rejects.toThrow('Network error');
    });
  });

  describe('updateProfile()', () => {
    it('calls PATCH /users/me with correct body', async () => {
      // Given: Mock response
      const mockUpdatedUser = {
        id: 'user-123',
        email: 'user@example.com',
        displayName: 'Updated Name',
        role: 'member' as const,
        authProvider: 'local' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-06-10T15:30:00.000Z',
        deactivatedAt: null,
      };
      mockPatch.mockResolvedValue(mockUpdatedUser);

      // When: Calling updateProfile
      const result = await usersApi.updateProfile({ displayName: 'Updated Name' });

      // Then: Calls correct endpoint with body
      expect(mockPatch).toHaveBeenCalledWith('/users/me', { displayName: 'Updated Name' });
      expect(mockPatch).toHaveBeenCalledTimes(1);

      // And: Returns updated user data
      expect(result).toEqual(mockUpdatedUser);
      expect(result.displayName).toBe('Updated Name');
    });

    it('sends displayName in request body', async () => {
      // Given: Mock response
      mockPatch.mockResolvedValue({
        id: 'user-456',
        email: 'user@example.com',
        displayName: 'New Display Name',
        role: 'admin' as const,
        authProvider: 'local' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-06-10T16:00:00.000Z',
        deactivatedAt: null,
      });

      // When: Calling updateProfile with specific name
      await usersApi.updateProfile({ displayName: 'New Display Name' });

      // Then: Body contains displayName
      expect(mockPatch).toHaveBeenCalledWith('/users/me', { displayName: 'New Display Name' });
    });

    it('propagates errors from apiClient', async () => {
      // Given: API error
      const error = new Error('Validation error');
      mockPatch.mockRejectedValue(error);

      // When/Then: Error is propagated
      await expect(usersApi.updateProfile({ displayName: 'Name' })).rejects.toThrow(
        'Validation error',
      );
    });

    it('returns updated UserResponse with new updatedAt', async () => {
      // Given: Mock response with updated timestamp
      const oldTimestamp = '2024-01-01T00:00:00.000Z';
      const newTimestamp = '2024-06-10T17:00:00.000Z';

      mockPatch.mockResolvedValue({
        id: 'user-789',
        email: 'user@example.com',
        displayName: 'Changed Name',
        role: 'member' as const,
        authProvider: 'local' as const,
        createdAt: oldTimestamp,
        updatedAt: newTimestamp,
        deactivatedAt: null,
      });

      // When: Calling updateProfile
      const result = await usersApi.updateProfile({ displayName: 'Changed Name' });

      // Then: updatedAt is newer
      expect(result.updatedAt).toBe(newTimestamp);
      expect(new Date(result.updatedAt!).getTime()).toBeGreaterThan(
        new Date(oldTimestamp).getTime(),
      );
    });
  });

  describe('changePassword()', () => {
    it('calls POST /users/me/password with correct body', async () => {
      // Given: Mock response (void - 204 No Content)
      mockPost.mockResolvedValue(undefined);

      // When: Calling changePassword
      await usersApi.changePassword({
        currentPassword: 'oldpass123456',
        newPassword: 'newpass123456',
      });

      // Then: Calls correct endpoint with body
      expect(mockPost).toHaveBeenCalledWith('/users/me/password', {
        currentPassword: 'oldpass123456',
        newPassword: 'newpass123456',
      });
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it('returns void (Promise<void>)', async () => {
      // Given: Mock response
      mockPost.mockResolvedValue(undefined);

      // When: Calling changePassword
      const result = await usersApi.changePassword({
        currentPassword: 'current123456',
        newPassword: 'new123456789',
      });

      // Then: Returns undefined
      expect(result).toBeUndefined();
    });

    it('sends both passwords in request body', async () => {
      // Given: Mock response
      mockPost.mockResolvedValue(undefined);

      // When: Calling changePassword
      await usersApi.changePassword({
        currentPassword: 'myCurrentPassword',
        newPassword: 'myNewPassword123',
      });

      // Then: Both fields are in body
      expect(mockPost).toHaveBeenCalledWith('/users/me/password', {
        currentPassword: 'myCurrentPassword',
        newPassword: 'myNewPassword123',
      });
    });

    it('propagates errors from apiClient', async () => {
      // Given: API error
      const error = new Error('Invalid credentials');
      mockPost.mockRejectedValue(error);

      // When/Then: Error is propagated
      await expect(
        usersApi.changePassword({
          currentPassword: 'wrong',
          newPassword: 'newpass123456',
        }),
      ).rejects.toThrow('Invalid credentials');
    });

    it('handles 204 No Content response', async () => {
      // Given: Mock 204 response (undefined)
      mockPost.mockResolvedValue(undefined);

      // When: Calling changePassword
      const result = await usersApi.changePassword({
        currentPassword: 'current',
        newPassword: 'new1234567890',
      });

      // Then: No error is thrown
      expect(result).toBeUndefined();
    });
  });

  describe('listUsers()', () => {
    it('calls GET /users without query when no search term provided', async () => {
      // Given: Mock response
      const mockUsers = [
        {
          id: 'user-1',
          email: 'user1@example.com',
          displayName: 'User One',
          role: 'member' as const,
          authProvider: 'local' as const,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          deactivatedAt: null,
        },
      ];
      mockGet.mockResolvedValue({ users: mockUsers });

      // When: Calling listUsers without search
      const result = await usersApi.listUsers();

      // Then: Calls correct endpoint
      expect(mockGet).toHaveBeenCalledWith('/users');
      expect(mockGet).toHaveBeenCalledTimes(1);

      // And: Returns user list
      expect(result.users).toEqual(mockUsers);
    });

    it('calls GET /users?q=... when search term provided', async () => {
      // Given: Mock response
      mockGet.mockResolvedValue({ users: [] });

      // When: Calling listUsers with search term
      await usersApi.listUsers('john');

      // Then: Calls correct endpoint with query string
      expect(mockGet).toHaveBeenCalledWith('/users?q=john');
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('encodes search query parameter', async () => {
      // Given: Mock response
      mockGet.mockResolvedValue({ users: [] });

      // When: Calling listUsers with special characters
      await usersApi.listUsers('john@example.com');

      // Then: Query string is encoded
      expect(mockGet).toHaveBeenCalledWith('/users?q=john%40example.com');
    });

    it('propagates errors from apiClient', async () => {
      // Given: API error
      const error = new Error('Forbidden');
      mockGet.mockRejectedValue(error);

      // When/Then: Error is propagated
      await expect(usersApi.listUsers()).rejects.toThrow('Forbidden');
    });
  });

  describe('adminUpdateUser()', () => {
    it('calls PATCH /users/:id with correct body', async () => {
      // Given: Mock response
      const mockUpdatedUser = {
        id: 'user-123',
        email: 'updated@example.com',
        displayName: 'Updated Name',
        role: 'admin' as const,
        authProvider: 'local' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-06-10T15:30:00.000Z',
        deactivatedAt: null,
      };
      mockPatch.mockResolvedValue(mockUpdatedUser);

      // When: Calling adminUpdateUser
      const result = await usersApi.adminUpdateUser('user-123', {
        displayName: 'Updated Name',
        email: 'updated@example.com',
        role: 'admin',
      });

      // Then: Calls correct endpoint with body
      expect(mockPatch).toHaveBeenCalledWith('/users/user-123', {
        displayName: 'Updated Name',
        email: 'updated@example.com',
        role: 'admin',
      });
      expect(mockPatch).toHaveBeenCalledTimes(1);

      // And: Returns updated user data
      expect(result).toEqual(mockUpdatedUser);
    });

    it('sends only changed fields', async () => {
      // Given: Mock response
      mockPatch.mockResolvedValue({
        id: 'user-456',
        email: 'user@example.com',
        displayName: 'User',
        role: 'admin' as const,
        authProvider: 'local' as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-06-10T16:00:00.000Z',
        deactivatedAt: null,
      });

      // When: Calling adminUpdateUser with only role
      await usersApi.adminUpdateUser('user-456', { role: 'admin' });

      // Then: Body contains only role
      expect(mockPatch).toHaveBeenCalledWith('/users/user-456', { role: 'admin' });
    });

    it('propagates errors from apiClient', async () => {
      // Given: API error
      const error = new Error('Conflict: Email already in use');
      mockPatch.mockRejectedValue(error);

      // When/Then: Error is propagated
      await expect(
        usersApi.adminUpdateUser('user-789', { email: 'taken@example.com' }),
      ).rejects.toThrow('Conflict: Email already in use');
    });
  });

  describe('deactivateUser()', () => {
    it('calls DELETE /users/:id', async () => {
      // Given: Mock response (void - 204 No Content)
      mockDel.mockResolvedValue(undefined);

      // When: Calling deactivateUser
      await usersApi.deactivateUser('user-123');

      // Then: Calls correct endpoint
      expect(mockDel).toHaveBeenCalledWith('/users/user-123');
      expect(mockDel).toHaveBeenCalledTimes(1);
    });

    it('returns void (Promise<void>)', async () => {
      // Given: Mock response
      mockDel.mockResolvedValue(undefined);

      // When: Calling deactivateUser
      const result = await usersApi.deactivateUser('user-456');

      // Then: Returns undefined
      expect(result).toBeUndefined();
    });

    it('propagates errors from apiClient', async () => {
      // Given: API error
      const error = new Error('Cannot deactivate last admin');
      mockDel.mockRejectedValue(error);

      // When/Then: Error is propagated
      await expect(usersApi.deactivateUser('user-789')).rejects.toThrow(
        'Cannot deactivate last admin',
      );
    });

    it('handles 204 No Content response', async () => {
      // Given: Mock 204 response (undefined)
      mockDel.mockResolvedValue(undefined);

      // When: Calling deactivateUser
      const result = await usersApi.deactivateUser('user-999');

      // Then: No error is thrown
      expect(result).toBeUndefined();
    });
  });
});
