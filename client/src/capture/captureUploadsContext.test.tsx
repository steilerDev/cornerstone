/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CaptureUploadsContext, useCaptureUploads } from './captureUploadsContext.js';
import type { CaptureUploadsApi } from './captureTypes.js';

describe('useCaptureUploads', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws outside a CaptureUploadProvider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useCaptureUploads())).toThrow(
      'useCaptureUploads must be used within a CaptureUploadProvider',
    );
  });

  it('returns the provided API', () => {
    const api = { storage: 'memory', items: [], orphans: [] } as unknown as CaptureUploadsApi;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CaptureUploadsContext value={api}>{children}</CaptureUploadsContext>
    );

    const { result } = renderHook(() => useCaptureUploads(), { wrapper });

    expect(result.current).toBe(api);
  });
});
