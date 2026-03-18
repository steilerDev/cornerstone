import { jest } from '@jest/globals';
import type * as ConfigApiModule from './configApi.js';

// Mock apiClient before dynamic import
const mockGet = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('./apiClient.js', () => ({
  get: mockGet,
  patch: jest.fn(),
  del: jest.fn(),
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
let configApi: typeof ConfigApiModule;

beforeEach(async () => {
  configApi = (await import('./configApi.js')) as typeof ConfigApiModule;
  mockGet.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('configApi', () => {
  describe('fetchConfig', () => {
    it('calls GET /config and returns the result', async () => {
      const mockConfig = { currency: 'EUR' };
      mockGet.mockResolvedValueOnce(mockConfig);

      const result = await configApi.fetchConfig();

      expect(mockGet).toHaveBeenCalledWith('/config');
      expect(result).toEqual(mockConfig);
    });

    it('returns the currency from the response', async () => {
      mockGet.mockResolvedValueOnce({ currency: 'CHF' });

      const result = await configApi.fetchConfig();

      expect(result.currency).toBe('CHF');
    });

    it('calls exactly one GET request (no extra calls)', async () => {
      mockGet.mockResolvedValueOnce({ currency: 'EUR' });

      await configApi.fetchConfig();

      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('propagates errors thrown by the API client', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network failure'));

      await expect(configApi.fetchConfig()).rejects.toThrow('Network failure');
    });

    it('propagates ApiClientError from the API client', async () => {
      const err = new Error('Unauthorized');
      mockGet.mockRejectedValueOnce(err);

      await expect(configApi.fetchConfig()).rejects.toThrow('Unauthorized');
    });
  });
});
