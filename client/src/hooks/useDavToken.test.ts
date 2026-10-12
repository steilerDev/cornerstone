import { renderHook, act, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import i18n from 'i18next';
import enErrors from '../i18n/en/errors.json';
import deErrors from '../i18n/de/errors.json';

const mockGetDavTokenStatus = jest.fn<() => Promise<unknown>>();
const mockGenerateDavToken = jest.fn<() => Promise<unknown>>();
const mockRevokeDavToken = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('../lib/davTokensApi.js', () => ({
  getDavTokenStatus: mockGetDavTokenStatus,
  generateDavToken: mockGenerateDavToken,
  revokeDavToken: mockRevokeDavToken,
  getDavProfileUrl: () => '/api/users/me/dav/profile',
}));

class MockApiClientError extends Error {
  statusCode: number;
  error: { code: string; message?: string };
  constructor(statusCode: number, error: { code: string; message?: string }) {
    super(error.message ?? 'API Error');
    this.statusCode = statusCode;
    this.error = error;
  }
}

jest.unstable_mockModule('../lib/apiClient.js', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  put: jest.fn(),
  setBaseUrl: jest.fn(),
  getBaseUrl: jest.fn().mockReturnValue('/api'),
  ApiClientError: MockApiClientError,
}));

import type * as UseDavTokenModule from './useDavToken.js';

let useDavToken: (typeof UseDavTokenModule)['useDavToken'];

beforeEach(async () => {
  ({ useDavToken } = (await import('./useDavToken.js')) as typeof UseDavTokenModule);
  mockGetDavTokenStatus.mockReset();
  mockGenerateDavToken.mockReset();
  mockRevokeDavToken.mockReset();

  // Default: no token
  mockGetDavTokenStatus.mockResolvedValue({ hasToken: false });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useDavToken', () => {
  it('starts with isLoading=true before status fetch completes', () => {
    mockGetDavTokenStatus.mockImplementationOnce(() => new Promise(() => {}));

    const { result } = renderHook(() => useDavToken());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.status).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.newToken).toBeNull();
  });

  it('fetches DAV token status on mount', async () => {
    mockGetDavTokenStatus.mockResolvedValueOnce({ hasToken: false });

    const { result } = renderHook(() => useDavToken());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetDavTokenStatus).toHaveBeenCalledTimes(1);
    expect(result.current.status).toEqual({ hasToken: false });
    expect(result.current.error).toBeNull();
  });

  it('sets status with hasToken=true and createdAt when token exists', async () => {
    const tokenStatus = { hasToken: true, createdAt: '2026-01-15T10:00:00.000Z' };
    mockGetDavTokenStatus.mockResolvedValueOnce(tokenStatus);

    const { result } = renderHook(() => useDavToken());

    await waitFor(() => expect(result.current.status?.hasToken).toBe(true));
    expect(result.current.status?.createdAt).toBe('2026-01-15T10:00:00.000Z');
  });

  it('sets error message on ApiClientError; status stays null', async () => {
    mockGetDavTokenStatus.mockRejectedValueOnce(
      new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
    );

    const { result } = renderHook(() => useDavToken());

    await waitFor(() => expect(result.current.error).toBe(enErrors.INTERNAL_ERROR));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.status).toBeNull();
  });

  it('sets generic error message on unknown error', async () => {
    mockGetDavTokenStatus.mockRejectedValueOnce(new Error('Connection refused'));

    const { result } = renderHook(() => useDavToken());

    await waitFor(() =>
      expect(result.current.error).toBe('Failed to load token status. Please try again.'),
    );
    expect(result.current.isLoading).toBe(false);
  });

  describe('generate()', () => {
    it('calls generateDavToken and then refreshes status', async () => {
      mockGetDavTokenStatus.mockResolvedValue({ hasToken: false });

      const { result } = renderHook(() => useDavToken());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const tokenValue = 'a'.repeat(64);
      mockGenerateDavToken.mockResolvedValueOnce({ token: tokenValue });
      mockGetDavTokenStatus.mockResolvedValueOnce({
        hasToken: true,
        createdAt: '2026-01-20T10:00:00.000Z',
      });

      await act(async () => {
        await result.current.generate();
      });

      expect(mockGenerateDavToken).toHaveBeenCalledTimes(1);
      expect(mockGetDavTokenStatus).toHaveBeenCalledTimes(2); // once on mount, once after generate
    });

    it('sets newToken after successful generation', async () => {
      mockGetDavTokenStatus.mockResolvedValue({ hasToken: false });

      const { result } = renderHook(() => useDavToken());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const tokenValue = 'b'.repeat(64);
      mockGenerateDavToken.mockResolvedValueOnce({ token: tokenValue });
      mockGetDavTokenStatus.mockResolvedValueOnce({
        hasToken: true,
        createdAt: '2026-01-20T10:00:00.000Z',
      });

      await act(async () => {
        await result.current.generate();
      });

      expect(result.current.newToken).toBe(tokenValue);
    });

    it('updates status after successful generation', async () => {
      mockGetDavTokenStatus.mockResolvedValue({ hasToken: false });

      const { result } = renderHook(() => useDavToken());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockGenerateDavToken.mockResolvedValueOnce({ token: 'c'.repeat(64) });
      const updatedStatus = { hasToken: true, createdAt: '2026-01-20T10:00:00.000Z' };
      mockGetDavTokenStatus.mockResolvedValueOnce(updatedStatus);

      await act(async () => {
        await result.current.generate();
      });

      expect(result.current.status).toEqual(updatedStatus);
    });

    it('sets error and re-throws on ApiClientError', async () => {
      mockGetDavTokenStatus.mockResolvedValue({ hasToken: false });

      const { result } = renderHook(() => useDavToken());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockGenerateDavToken.mockRejectedValueOnce(
        new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
      );

      let thrownError: unknown;
      await act(async () => {
        try {
          await result.current.generate();
        } catch (err) {
          thrownError = err;
        }
      });

      expect(thrownError).toBeInstanceOf(Error);
      expect(result.current.error).toBe(enErrors.INTERNAL_ERROR);
    });

    it('sets generic error and re-throws on unknown error', async () => {
      mockGetDavTokenStatus.mockResolvedValue({ hasToken: false });

      const { result } = renderHook(() => useDavToken());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockGenerateDavToken.mockRejectedValueOnce(new Error('Network failure'));

      let thrownError: unknown;
      await act(async () => {
        try {
          await result.current.generate();
        } catch (err) {
          thrownError = err;
        }
      });

      expect(thrownError).toBeInstanceOf(Error);
      expect(result.current.error).toBe('Failed to generate token. Please try again.');
    });
  });

  describe('revoke()', () => {
    it('calls revokeDavToken and then refreshes status', async () => {
      mockGetDavTokenStatus.mockResolvedValue({
        hasToken: true,
        createdAt: '2026-01-15T00:00:00.000Z',
      });

      const { result } = renderHook(() => useDavToken());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockRevokeDavToken.mockResolvedValueOnce(undefined);
      mockGetDavTokenStatus.mockResolvedValueOnce({ hasToken: false });

      await act(async () => {
        await result.current.revoke();
      });

      expect(mockRevokeDavToken).toHaveBeenCalledTimes(1);
      expect(mockGetDavTokenStatus).toHaveBeenCalledTimes(2); // once on mount, once after revoke
    });

    it('clears newToken after successful revocation', async () => {
      mockGetDavTokenStatus.mockResolvedValue({
        hasToken: true,
        createdAt: '2026-01-15T00:00:00.000Z',
      });

      const { result } = renderHook(() => useDavToken());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // First generate a token so newToken is set
      mockGenerateDavToken.mockResolvedValueOnce({ token: 'd'.repeat(64) });
      mockGetDavTokenStatus.mockResolvedValueOnce({
        hasToken: true,
        createdAt: '2026-01-20T00:00:00.000Z',
      });

      await act(async () => {
        await result.current.generate();
      });

      expect(result.current.newToken).not.toBeNull();

      // Now revoke
      mockRevokeDavToken.mockResolvedValueOnce(undefined);
      mockGetDavTokenStatus.mockResolvedValueOnce({ hasToken: false });

      await act(async () => {
        await result.current.revoke();
      });

      expect(result.current.newToken).toBeNull();
    });

    it('updates status to hasToken=false after revocation', async () => {
      mockGetDavTokenStatus.mockResolvedValue({
        hasToken: true,
        createdAt: '2026-01-15T00:00:00.000Z',
      });

      const { result } = renderHook(() => useDavToken());
      await waitFor(() => expect(result.current.status?.hasToken).toBe(true));

      mockRevokeDavToken.mockResolvedValueOnce(undefined);
      mockGetDavTokenStatus.mockResolvedValueOnce({ hasToken: false });

      await act(async () => {
        await result.current.revoke();
      });

      expect(result.current.status?.hasToken).toBe(false);
    });

    it('sets error and re-throws on ApiClientError', async () => {
      mockGetDavTokenStatus.mockResolvedValue({
        hasToken: true,
        createdAt: '2026-01-15T00:00:00.000Z',
      });

      const { result } = renderHook(() => useDavToken());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockRevokeDavToken.mockRejectedValueOnce(
        new MockApiClientError(404, { code: 'NOT_FOUND', message: 'RAW-SERVER-SENTINEL' }),
      );

      let thrownError: unknown;
      await act(async () => {
        try {
          await result.current.revoke();
        } catch (err) {
          thrownError = err;
        }
      });

      expect(thrownError).toBeInstanceOf(Error);
      expect(result.current.error).toBe(enErrors.NOT_FOUND);
    });

    it('sets generic error and re-throws on unknown error', async () => {
      mockGetDavTokenStatus.mockResolvedValue({ hasToken: false });

      const { result } = renderHook(() => useDavToken());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockRevokeDavToken.mockRejectedValueOnce(new Error('Network failure'));

      let thrownError: unknown;
      await act(async () => {
        try {
          await result.current.revoke();
        } catch (err) {
          thrownError = err;
        }
      });

      expect(thrownError).toBeInstanceOf(Error);
      expect(result.current.error).toBe('Failed to revoke token. Please try again.');
    });
  });

  describe('clearNewToken()', () => {
    it('sets newToken to null', async () => {
      mockGetDavTokenStatus.mockResolvedValue({ hasToken: false });

      const { result } = renderHook(() => useDavToken());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Generate a token first
      mockGenerateDavToken.mockResolvedValueOnce({ token: 'e'.repeat(64) });
      mockGetDavTokenStatus.mockResolvedValueOnce({
        hasToken: true,
        createdAt: '2026-01-20T00:00:00.000Z',
      });

      await act(async () => {
        await result.current.generate();
      });

      expect(result.current.newToken).not.toBeNull();

      // Clear it
      act(() => {
        result.current.clearNewToken();
      });

      expect(result.current.newToken).toBeNull();
    });

    it('is safe to call when newToken is already null', async () => {
      mockGetDavTokenStatus.mockResolvedValue({ hasToken: false });

      const { result } = renderHook(() => useDavToken());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // newToken is already null
      expect(result.current.newToken).toBeNull();

      // Should not throw
      act(() => {
        result.current.clearNewToken();
      });

      expect(result.current.newToken).toBeNull();
    });
  });
});

describe('useDavToken load-once and render-time translation (#2214)', () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('does not refetch and never returns to loading when the language changes', async () => {
    mockGetDavTokenStatus.mockResolvedValue({
      hasToken: true,
      createdAt: '2026-01-15T10:00:00.000Z',
    });
    const { result } = renderHook(() => useDavToken());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const statusBefore = result.current.status;

    await act(async () => {
      await i18n.changeLanguage('de');
    });

    expect(mockGetDavTokenStatus).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.status).toBe(statusBefore);
  });

  it('keeps an issued token through a language change', async () => {
    const { result } = renderHook(() => useDavToken());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockGenerateDavToken.mockResolvedValueOnce({ token: 'c'.repeat(64) });
    await act(async () => {
      await result.current.generate();
    });

    await act(async () => {
      await i18n.changeLanguage('de');
    });

    expect(result.current.newToken).toBe('c'.repeat(64));
  });

  it('re-translates a stored API error code after a language change', async () => {
    mockGetDavTokenStatus.mockRejectedValueOnce(
      new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
    );
    const { result } = renderHook(() => useDavToken());
    await waitFor(() => expect(result.current.error).toBe(enErrors.INTERNAL_ERROR));

    await act(async () => {
      await i18n.changeLanguage('de');
    });

    expect(result.current.error).toBe(deErrors.INTERNAL_ERROR);
    expect(mockGetDavTokenStatus).toHaveBeenCalledTimes(1);
  });

  it('re-translates a generic failure message after a language change', async () => {
    mockGetDavTokenStatus.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useDavToken());
    await waitFor(() =>
      expect(result.current.error).toBe('Failed to load token status. Please try again.'),
    );

    await act(async () => {
      await i18n.changeLanguage('de');
    });

    expect(result.current.error).toBe(i18n.t('dav.errors.loadFailed', { ns: 'settings' }));
    expect(result.current.error).not.toBe('Failed to load token status. Please try again.');
  });

  it('maps a non-API failure of generate and revoke to their own messages', async () => {
    const { result } = renderHook(() => useDavToken());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockGenerateDavToken.mockRejectedValueOnce(new Error('x'));
    await act(async () => {
      await expect(result.current.generate()).rejects.toThrow('x');
    });
    expect(result.current.error).toBe('Failed to generate token. Please try again.');

    mockRevokeDavToken.mockRejectedValueOnce(new Error('y'));
    await act(async () => {
      await expect(result.current.revoke()).rejects.toThrow('y');
    });
    expect(result.current.error).toBe('Failed to revoke token. Please try again.');
  });

  it('generate does not set isLoading back to true while it runs', async () => {
    const { result } = renderHook(() => useDavToken());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let resolveGenerate!: (value: { token: string }) => void;
    mockGenerateDavToken.mockImplementationOnce(
      () => new Promise<{ token: string }>((r) => (resolveGenerate = r)),
    );

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.generate();
    });
    expect(result.current.isLoading).toBe(false);
    await act(async () => {
      resolveGenerate({ token: 'd'.repeat(64) });
      await pending;
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('does not set state or warn when unmounted before the load resolves', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let resolveStatus!: (value: unknown) => void;
    mockGetDavTokenStatus.mockImplementationOnce(() => new Promise((r) => (resolveStatus = r)));
    const { unmount } = renderHook(() => useDavToken());
    unmount();

    await act(async () => {
      resolveStatus({ hasToken: true });
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('ignores a rejected load after unmount', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let rejectStatus!: (reason: unknown) => void;
    mockGetDavTokenStatus.mockImplementationOnce(
      () => new Promise((_, rej) => (rejectStatus = rej)),
    );
    const { unmount } = renderHook(() => useDavToken());
    unmount();

    await act(async () => {
      rejectStatus(new Error('late'));
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
