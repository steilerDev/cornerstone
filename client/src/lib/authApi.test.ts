/**
 * @jest-environment node
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type * as ApiClientTypes from './apiClient.js';
import type * as AuthApiTypes from './authApi.js';

jest.unstable_mockModule('./apiClient.js', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

describe('authApi', () => {
  let apiClient: typeof ApiClientTypes;
  let authApi: typeof AuthApiTypes;
  let mockGet: jest.MockedFunction<typeof ApiClientTypes.get>;
  let mockPost: jest.MockedFunction<typeof ApiClientTypes.post>;

  beforeEach(async () => {
    if (!apiClient) {
      apiClient = await import('./apiClient.js');
      authApi = await import('./authApi.js');
    }
    mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
    mockPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;
    mockGet.mockReset();
    mockPost.mockReset();
  });

  describe('getAuthMe', () => {
    it('calls get with /auth/me', async () => {
      const mockResponse = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          displayName: 'Test User',
          role: 'member',
          authProvider: 'local',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          deactivatedAt: null,
        },
        setupRequired: false,
        oidcEnabled: false,
      };
      mockGet.mockResolvedValue(mockResponse);

      const result = await authApi.getAuthMe();

      expect(mockGet).toHaveBeenCalledWith('/auth/me');
      expect(result).toEqual(mockResponse);
    });

    it('returns a promise that resolves to AuthMeResponse', async () => {
      const mockResponse = {
        user: null,
        setupRequired: true,
        oidcEnabled: false,
      };
      mockGet.mockResolvedValue(mockResponse);

      const result = authApi.getAuthMe();

      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toEqual(mockResponse);
    });
  });

  describe('setup', () => {
    it('calls post with /auth/setup and payload', async () => {
      const payload = {
        email: 'admin@example.com',
        displayName: 'Admin User',
        password: 'securepassword',
      };
      const mockResponse = {
        user: {
          id: 'user-1',
          email: 'admin@example.com',
          displayName: 'Admin User',
          role: 'admin',
          authProvider: 'local',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          deactivatedAt: null,
        },
      };
      mockPost.mockResolvedValue(mockResponse);

      const result = await authApi.setup(payload);

      expect(mockPost).toHaveBeenCalledWith('/auth/setup', payload);
      expect(result).toEqual(mockResponse);
    });

    it('returns a promise that resolves to SetupResponse', async () => {
      const payload = {
        email: 'test@example.com',
        displayName: 'Test',
        password: 'password',
      };
      const mockResponse = {
        user: {
          id: 'user-2',
          email: 'test@example.com',
          displayName: 'Test',
          role: 'admin',
          authProvider: 'local',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          deactivatedAt: null,
        },
      };
      mockPost.mockResolvedValue(mockResponse);

      const result = authApi.setup(payload);

      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toEqual(mockResponse);
    });
  });

  describe('login', () => {
    it('calls post with /auth/login and payload', async () => {
      const payload = {
        email: 'user@example.com',
        password: 'userpassword',
      };
      const mockResponse = {
        user: {
          id: 'user-3',
          email: 'user@example.com',
          displayName: 'User',
          role: 'member',
          authProvider: 'local',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          deactivatedAt: null,
        },
      };
      mockPost.mockResolvedValue(mockResponse);

      const result = await authApi.login(payload);

      expect(mockPost).toHaveBeenCalledWith('/auth/login', payload);
      expect(result).toEqual(mockResponse);
    });

    it('returns a promise that resolves to LoginResponse', async () => {
      const payload = {
        email: 'another@example.com',
        password: 'pass123',
      };
      const mockResponse = {
        user: {
          id: 'user-4',
          email: 'another@example.com',
          displayName: 'Another',
          role: 'member',
          authProvider: 'local',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          deactivatedAt: null,
        },
      };
      mockPost.mockResolvedValue(mockResponse);

      const result = authApi.login(payload);

      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toEqual(mockResponse);
    });
  });

  describe('logout', () => {
    it('calls post with /auth/logout', async () => {
      mockPost.mockResolvedValue(undefined);

      await authApi.logout();

      expect(mockPost).toHaveBeenCalledWith('/auth/logout');
    });

    it('calls post with /auth/logout and no body', async () => {
      mockPost.mockResolvedValue(undefined);

      await authApi.logout();

      expect(mockPost).toHaveBeenCalledWith('/auth/logout');
      expect(mockPost).toHaveBeenCalledTimes(1);
      // Verify no second argument (no body)
      expect(mockPost.mock.calls[0]).toHaveLength(1);
    });

    it('returns a promise that resolves to void', async () => {
      mockPost.mockResolvedValue(undefined);

      const result = authApi.logout();

      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBeUndefined();
    });

    it('returns a promise', async () => {
      mockPost.mockResolvedValue(undefined);

      const result = authApi.logout();

      expect(result).toBeInstanceOf(Promise);
    });
  });
});
