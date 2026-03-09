import { jest } from '@jest/globals';
import type * as PreferencesApiModule from './preferencesApi.js';

// Mock apiClient before imports
const mockGet = jest.fn<() => Promise<unknown>>();
const mockPatch = jest.fn<() => Promise<unknown>>();
const mockDel = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('./apiClient.js', () => ({
  get: mockGet,
  patch: mockPatch,
  del: mockDel,
  post: jest.fn(),
  put: jest.fn(),
  setBaseUrl: jest.fn(),
  getBaseUrl: jest.fn().mockReturnValue('/api'),
  ApiClientError: class ApiClientError extends Error {
    statusCode: number;
    error: unknown;
    constructor(statusCode: number, error: unknown) {
      super('error');
      this.statusCode = statusCode;
      this.error = error;
    }
  },
  NetworkError: class NetworkError extends Error {},
}));

// Deferred import after mock
let preferencesApi: typeof PreferencesApiModule;

beforeEach(async () => {
  preferencesApi = (await import('./preferencesApi.js')) as typeof PreferencesApiModule;
  mockGet.mockReset();
  mockPatch.mockReset();
  mockDel.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('preferencesApi', () => {
  describe('listPreferences', () => {
    it('calls GET /users/me/preferences and returns preferences array', async () => {
      const mockPreferences = [
        { key: 'theme', value: 'dark', updatedAt: '2026-01-01T00:00:00Z' },
        { key: 'dashboard.hiddenCards', value: '[]', updatedAt: '2026-01-02T00:00:00Z' },
      ];
      mockGet.mockResolvedValueOnce({ preferences: mockPreferences });

      const result = await preferencesApi.listPreferences();

      expect(mockGet).toHaveBeenCalledWith('/users/me/preferences');
      expect(result).toEqual(mockPreferences);
    });

    it('returns empty array when preferences is empty', async () => {
      mockGet.mockResolvedValueOnce({ preferences: [] });

      const result = await preferencesApi.listPreferences();

      expect(mockGet).toHaveBeenCalledWith('/users/me/preferences');
      expect(result).toEqual([]);
    });

    it('returns a single preference from the response', async () => {
      const pref = { key: 'theme', value: 'light', updatedAt: '2026-03-01T00:00:00Z' };
      mockGet.mockResolvedValueOnce({ preferences: [pref] });

      const result = await preferencesApi.listPreferences();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(pref);
    });

    it('propagates errors thrown by the API client', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network failure'));

      await expect(preferencesApi.listPreferences()).rejects.toThrow('Network failure');
    });
  });

  describe('upsertPreference', () => {
    it('calls PATCH /users/me/preferences with key and value body', async () => {
      const mockPref = { key: 'theme', value: 'dark', updatedAt: '2026-01-01T00:00:00Z' };
      mockPatch.mockResolvedValueOnce({ preference: mockPref });

      const result = await preferencesApi.upsertPreference('theme', 'dark');

      expect(mockPatch).toHaveBeenCalledWith('/users/me/preferences', {
        key: 'theme',
        value: 'dark',
      });
      expect(result).toEqual(mockPref);
    });

    it('returns the updated preference from the response', async () => {
      const mockPref = {
        key: 'dashboard.hiddenCards',
        value: '["budget-summary"]',
        updatedAt: '2026-02-15T08:00:00Z',
      };
      mockPatch.mockResolvedValueOnce({ preference: mockPref });

      const result = await preferencesApi.upsertPreference(
        'dashboard.hiddenCards',
        '["budget-summary"]',
      );

      expect(result).toEqual(mockPref);
    });

    it('passes the exact key and value to the request body', async () => {
      const mockPref = { key: 'theme', value: 'system', updatedAt: '2026-01-01T00:00:00Z' };
      mockPatch.mockResolvedValueOnce({ preference: mockPref });

      await preferencesApi.upsertPreference('theme', 'system');

      expect(mockPatch).toHaveBeenCalledWith('/users/me/preferences', {
        key: 'theme',
        value: 'system',
      });
    });

    it('propagates errors thrown by the API client', async () => {
      mockPatch.mockRejectedValueOnce(new Error('Unauthorized'));

      await expect(preferencesApi.upsertPreference('theme', 'dark')).rejects.toThrow('Unauthorized');
    });
  });

  describe('deletePreference', () => {
    it('calls DELETE /users/me/preferences/:key with URL-encoded key', async () => {
      mockDel.mockResolvedValueOnce(undefined);

      await preferencesApi.deletePreference('theme');

      expect(mockDel).toHaveBeenCalledWith('/users/me/preferences/theme');
    });

    it('URL-encodes keys with special characters (dot-notation)', async () => {
      mockDel.mockResolvedValueOnce(undefined);

      await preferencesApi.deletePreference('dashboard.hiddenCards');

      expect(mockDel).toHaveBeenCalledWith(
        `/users/me/preferences/${encodeURIComponent('dashboard.hiddenCards')}`,
      );
    });

    it('returns void on success', async () => {
      mockDel.mockResolvedValueOnce(undefined);

      const result = await preferencesApi.deletePreference('theme');

      expect(result).toBeUndefined();
    });

    it('propagates errors thrown by the API client', async () => {
      mockDel.mockRejectedValueOnce(new Error('Not Found'));

      await expect(preferencesApi.deletePreference('non-existent')).rejects.toThrow('Not Found');
    });
  });
});
