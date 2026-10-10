/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import type * as UseDeleteImpactTypes from './useDeleteImpact.js';
import type * as DeleteImpactApiTypes from '../lib/deleteImpactApi.js';
import type { DeleteImpactEntityType, DeleteImpactResponse } from '@cornerstone/shared';

const mockFetch = jest.fn<typeof DeleteImpactApiTypes.fetchDeleteImpact>();
jest.unstable_mockModule('../lib/deleteImpactApi.js', () => ({ fetchDeleteImpact: mockFetch }));

let useDeleteImpact: typeof UseDeleteImpactTypes.useDeleteImpact;

beforeEach(async () => {
  mockFetch.mockReset();
  if (!useDeleteImpact) ({ useDeleteImpact } = await import('./useDeleteImpact.js'));
});

function render(entityType: DeleteImpactEntityType, id: string | number | null) {
  return renderHook(({ t, i }) => useDeleteImpact(t, i), {
    initialProps: { t: entityType, i: id },
  });
}

describe('useDeleteImpact', () => {
  it('stays idle (no request) while the id is null', () => {
    const { result } = render('area', null);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current).toEqual({ status: 'loading' });
  });

  it('fetches when the id becomes non-null and exposes translated labels with counts', async () => {
    mockFetch.mockResolvedValue({
      entityType: 'area',
      id: '7',
      effects: [
        { kind: 'childAreas', count: 2 },
        { kind: 'photosLoseArea', count: 5 },
      ],
    });
    const { result, rerender } = render('area', null);
    rerender({ t: 'area', i: '7' });

    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mockFetch).toHaveBeenCalledWith('area', '7');
    expect(result.current).toEqual({
      status: 'ready',
      items: [
        { label: 'Sub-areas deleted with it:', count: 2 },
        { label: 'Photos that lose their area:', count: 5 },
      ],
    });
  });

  it('ready with no effects yields an empty item list', async () => {
    mockFetch.mockResolvedValue({ entityType: 'vendor', id: '1', effects: [] });
    const { result } = render('vendor', '1');
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', items: [] }));
  });

  it('reports an error with a Retry that refetches', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    const { result } = render('vendor', '1');
    await waitFor(() => expect(result.current.status).toBe('error'));

    mockFetch.mockResolvedValue({
      entityType: 'vendor',
      id: '1',
      effects: [{ kind: 'contacts', count: 1 }],
    });
    act(() => {
      if (result.current.status === 'error') result.current.onRetry();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('Retry shows the loading state again before the second answer', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    const { result } = render('vendor', '1');
    await waitFor(() => expect(result.current.status).toBe('error'));

    let resolve!: (v: unknown) => void;
    mockFetch.mockReturnValue(
      new Promise((r) => (resolve = r as typeof resolve)) as ReturnType<typeof mockFetch>,
    );
    act(() => {
      if (result.current.status === 'error') result.current.onRetry();
    });
    expect(result.current.status).toBe('loading');
    await act(async () => resolve({ entityType: 'vendor', id: '1', effects: [] }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('refetches when the target changes', async () => {
    mockFetch.mockResolvedValue({ entityType: 'area', id: '1', effects: [] });
    const { result, rerender } = render('area', '1');
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ t: 'area', i: '2' });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('area', '2'));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('ignores a response that arrives after the target changed (no stale counts)', async () => {
    let resolveFirst!: (v: DeleteImpactResponse) => void;
    mockFetch.mockReturnValueOnce(
      new Promise<DeleteImpactResponse>((r) => (resolveFirst = r)) as ReturnType<typeof mockFetch>,
    );
    mockFetch.mockResolvedValueOnce({
      entityType: 'area',
      id: '2',
      effects: [{ kind: 'childAreas', count: 9 }],
    });
    const { result, rerender } = render('area', '1');
    rerender({ t: 'area', i: '2' });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () =>
      resolveFirst({ entityType: 'area', id: '1', effects: [{ kind: 'childAreas', count: 1 }] }),
    );
    expect(result.current).toEqual({
      status: 'ready',
      items: [{ label: 'Sub-areas deleted with it:', count: 9 }],
    });
  });

  it('ignores a failure that arrives after unmount', async () => {
    let rejectIt!: (e: unknown) => void;
    mockFetch.mockReturnValue(
      new Promise((_r, rej) => (rejectIt = rej)) as ReturnType<typeof mockFetch>,
    );
    const { unmount } = render('area', '1');
    unmount();
    await act(async () => rejectIt(new Error('late')));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('accepts a numeric id', async () => {
    mockFetch.mockResolvedValue({ entityType: 'milestone', id: '4', effects: [] });
    render('milestone', 4);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('milestone', 4));
  });
});
