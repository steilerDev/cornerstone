/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react';
import type { PaperlessStatusResponse } from '@cornerstone/shared';
import type * as CacheTypes from '../lib/paperlessStatusCache.js';
import type * as ConfigTypes from '../lib/configApi.js';
import type * as HookTypes from './useDocumentIntegration.js';

const mockStatus = jest.fn<typeof CacheTypes.getSharedPaperlessStatus>();
const mockConfig = jest.fn<typeof ConfigTypes.fetchConfig>();
jest.unstable_mockModule('../lib/paperlessStatusCache.js', () => ({
  getSharedPaperlessStatus: mockStatus,
}));
jest.unstable_mockModule('../lib/configApi.js', () => ({ fetchConfig: mockConfig }));

let useDocumentIntegration: typeof HookTypes.useDocumentIntegration;

const status = (configured: boolean, reachable: boolean) =>
  ({ configured, reachable, error: null }) as PaperlessStatusResponse;
const config = (llmEnabled: boolean) => ({ llmEnabled }) as Awaited<ReturnType<typeof mockConfig>>;

beforeEach(async () => {
  mockStatus.mockReset();
  mockConfig.mockReset();
  ({ useDocumentIntegration } = await import('./useDocumentIntegration.js'));
});

describe('useDocumentIntegration', () => {
  it('starts not loaded, then reports an available Paperless with the AI reader', async () => {
    mockStatus.mockResolvedValue(status(true, true));
    mockConfig.mockResolvedValue(config(true));
    const { result } = renderHook(() => useDocumentIntegration());
    expect(result.current).toMatchObject({ loaded: false, available: false, llmEnabled: false });

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current).toMatchObject({ available: true, llmEnabled: true });
    expect(result.current.status).toEqual(status(true, true));
  });

  it.each([
    ['unconfigured', status(false, false)],
    ['configured but unreachable', status(true, false)],
  ])('is not available when Paperless is %s', async (_name, value) => {
    mockStatus.mockResolvedValue(value);
    mockConfig.mockResolvedValue(config(false));
    const { result } = renderHook(() => useDocumentIntegration());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current).toMatchObject({ available: false, llmEnabled: false });
  });

  it('settles as "off" when the status lookup fails', async () => {
    mockStatus.mockRejectedValue(new Error('down'));
    mockConfig.mockResolvedValue(config(true));
    const { result } = renderHook(() => useDocumentIntegration());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current).toMatchObject({ available: false, llmEnabled: false, status: null });
  });

  it('settles as "off" when the config lookup fails', async () => {
    mockStatus.mockResolvedValue(status(true, true));
    mockConfig.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useDocumentIntegration());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.available).toBe(false);
  });

  it('fetches nothing and stays not loaded while disabled', () => {
    const { result } = renderHook(() => useDocumentIntegration({ enabled: false }));
    expect(result.current.loaded).toBe(false);
    expect(mockStatus).not.toHaveBeenCalled();
    expect(mockConfig).not.toHaveBeenCalled();
  });

  it('ignores an answer that arrives after unmount', async () => {
    let resolve!: (v: PaperlessStatusResponse) => void;
    mockStatus.mockReturnValue(new Promise((r) => (resolve = r)));
    mockConfig.mockResolvedValue(config(true));
    const { result, unmount } = renderHook(() => useDocumentIntegration());
    unmount();
    resolve(status(true, true));
    await Promise.resolve();
    expect(result.current.loaded).toBe(false);
  });

  it('ignores a failure that arrives after unmount', async () => {
    let reject!: (e: Error) => void;
    mockStatus.mockReturnValue(new Promise((_r, rj) => (reject = rj)));
    mockConfig.mockResolvedValue(config(true));
    const { result, unmount } = renderHook(() => useDocumentIntegration());
    unmount();
    reject(new Error('late'));
    await Promise.resolve();
    expect(result.current.loaded).toBe(false);
  });
});
