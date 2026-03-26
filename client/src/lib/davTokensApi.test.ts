import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  getDavTokenStatus,
  generateDavToken,
  revokeDavToken,
  getDavProfileUrl,
} from './davTokensApi.js';
import type { DavTokenStatus, DavTokenResponse } from '@cornerstone/shared';

describe('davTokensApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getDavTokenStatus', () => {
    it('sends GET request to /api/users/me/dav/token', async () => {
      const mockResponse: DavTokenStatus = { hasToken: false };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await getDavTokenStatus();

      expect(mockFetch).toHaveBeenCalledWith('/api/users/me/dav/token', expect.any(Object));
    });

    it('returns status with hasToken=false when no token exists', async () => {
      const mockResponse: DavTokenStatus = { hasToken: false };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await getDavTokenStatus();

      expect(result.hasToken).toBe(false);
      expect(result.createdAt).toBeUndefined();
    });

    it('returns status with hasToken=true and createdAt when token exists', async () => {
      const mockResponse: DavTokenStatus = {
        hasToken: true,
        createdAt: '2026-01-15T10:00:00.000Z',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await getDavTokenStatus();

      expect(result.hasToken).toBe(true);
      expect(result.createdAt).toBe('2026-01-15T10:00:00.000Z');
    });

    it('throws error when response is not OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }),
      } as Response);

      await expect(getDavTokenStatus()).rejects.toThrow();
    });
  });

  describe('generateDavToken', () => {
    it('sends POST request to /api/users/me/dav/token', async () => {
      const mockResponse: DavTokenResponse = { token: 'abcdef1234567890'.repeat(4) };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      await generateDavToken();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users/me/dav/token',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('returns the generated token string', async () => {
      const tokenValue = 'a'.repeat(64);
      const mockResponse: DavTokenResponse = { token: tokenValue };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await generateDavToken();

      expect(result.token).toBe(tokenValue);
    });

    it('throws error when generation fails (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          error: { code: 'INTERNAL_ERROR', message: 'Token generation failed' },
        }),
      } as Response);

      await expect(generateDavToken()).rejects.toThrow();
    });

    it('throws error when not authenticated (401)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }),
      } as Response);

      await expect(generateDavToken()).rejects.toThrow();
    });
  });

  describe('revokeDavToken', () => {
    it('sends DELETE request to /api/users/me/dav/token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await revokeDavToken();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users/me/dav/token',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('returns void on successful revocation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      const result = await revokeDavToken();

      expect(result).toBeUndefined();
    });

    it('throws error when no token exists to revoke (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'No DAV token found' } }),
      } as Response);

      await expect(revokeDavToken()).rejects.toThrow();
    });

    it('throws error when not authenticated (401)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }),
      } as Response);

      await expect(revokeDavToken()).rejects.toThrow();
    });
  });

  describe('getDavProfileUrl', () => {
    it('returns the static DAV profile URL', () => {
      const url = getDavProfileUrl();

      expect(url).toBe('/api/users/me/dav/profile');
    });

    it('returns a string (does not make a network request)', () => {
      const url = getDavProfileUrl();

      expect(typeof url).toBe('string');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
