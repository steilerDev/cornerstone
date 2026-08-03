import { jest } from '@jest/globals';
import type * as SettingsApiModule from './settingsApi.js';

// Mock apiClient before imports
const mockGet = jest.fn<() => Promise<unknown>>();
const mockPatch = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('./apiClient.js', () => ({
  get: mockGet,
  patch: mockPatch,
  post: jest.fn(),
  del: jest.fn(),
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
let settingsApi: typeof SettingsApiModule;

beforeEach(async () => {
  settingsApi = (await import('./settingsApi.js')) as typeof SettingsApiModule;
  mockGet.mockReset();
  mockPatch.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('settingsApi', () => {
  describe('fetchHouseholdSettings', () => {
    it('calls GET /settings and returns the settings object', async () => {
      const settings = { householdName: 'The Smith Family', householdAddress: '123 Main St' };
      mockGet.mockResolvedValueOnce({ settings });

      const result = await settingsApi.fetchHouseholdSettings();

      expect(mockGet).toHaveBeenCalledWith('/settings');
      expect(result).toEqual(settings);
    });

    it('returns both fields null when the API returns nulls', async () => {
      mockGet.mockResolvedValueOnce({
        settings: { householdName: null, householdAddress: null },
      });

      const result = await settingsApi.fetchHouseholdSettings();

      expect(result).toEqual({ householdName: null, householdAddress: null });
    });

    it('propagates errors from the API client', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network failure'));

      await expect(settingsApi.fetchHouseholdSettings()).rejects.toThrow('Network failure');
    });
  });

  describe('updateHouseholdSettings', () => {
    it('calls PATCH /settings with the request body and returns the updated settings', async () => {
      const updated = { householdName: 'New Name', householdAddress: 'New Address' };
      mockPatch.mockResolvedValueOnce({ settings: updated });

      const result = await settingsApi.updateHouseholdSettings({
        householdName: 'New Name',
        householdAddress: 'New Address',
      });

      expect(mockPatch).toHaveBeenCalledWith('/settings', {
        householdName: 'New Name',
        householdAddress: 'New Address',
      });
      expect(result).toEqual(updated);
    });

    it('supports a partial update (only householdName)', async () => {
      mockPatch.mockResolvedValueOnce({
        settings: { householdName: 'Only Name', householdAddress: null },
      });

      await settingsApi.updateHouseholdSettings({ householdName: 'Only Name' });

      expect(mockPatch).toHaveBeenCalledWith('/settings', { householdName: 'Only Name' });
    });

    it('supports clearing a field by passing null', async () => {
      mockPatch.mockResolvedValueOnce({
        settings: { householdName: null, householdAddress: 'Kept Address' },
      });

      const result = await settingsApi.updateHouseholdSettings({ householdName: null });

      expect(mockPatch).toHaveBeenCalledWith('/settings', { householdName: null });
      expect(result.householdName).toBeNull();
    });

    it('propagates errors from the API client', async () => {
      mockPatch.mockRejectedValueOnce(new Error('Validation failed'));

      await expect(
        settingsApi.updateHouseholdSettings({ householdName: 'x'.repeat(300) }),
      ).rejects.toThrow('Validation failed');
    });
  });
});
