/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { UndoToken } from '@cornerstone/shared';
import { ApiClientError } from '../lib/apiClient.js';
import type { StatusChangeResult } from '../lib/statusChangeApi.js';
import type * as UseUndoableTypes from './useUndoableStatusChange.js';
import type * as UndoApiTypes from '../lib/undoApi.js';
import type { ShowUndoToastOptions } from '../components/Toast/ToastContext.js';

const mockShowToast = jest.fn();
const mockShowUndoToast = jest.fn<(options: ShowUndoToastOptions) => void>();
const mockUndoChange = jest.fn<typeof UndoApiTypes.undoChange>();

jest.unstable_mockModule('../components/Toast/ToastContext.js', () => ({
  useToast: () => ({
    toasts: [],
    showToast: mockShowToast,
    showUndoToast: mockShowUndoToast,
    dismissToast: jest.fn(),
  }),
  ToastProvider: ({ children }: { children: ReactNode }) => children,
}));

jest.unstable_mockModule('../lib/undoApi.js', () => ({ undoChange: mockUndoChange }));

const TOKEN: UndoToken = { token: `u_${'1'.repeat(32)}`, expiresAt: '2026-08-07T10:00:30.000Z' };

let useUndoableStatusChange: typeof UseUndoableTypes.useUndoableStatusChange;

beforeEach(async () => {
  mockShowToast.mockReset();
  mockShowUndoToast.mockReset();
  mockUndoChange.mockReset();
  if (!useUndoableStatusChange) {
    ({ useUndoableStatusChange } = await import('./useUndoableStatusChange.js'));
  }
});

function setup(result: StatusChangeResult<{ id: string }> | Error) {
  const onChanged = jest.fn();
  const onUndone = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const request = jest.fn<() => Promise<StatusChangeResult<{ id: string }>>>(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  const { result: hook } = renderHook(() => useUndoableStatusChange());
  const options = {
    request,
    recordName: 'Kitchen',
    statusLabel: 'Done',
    dedupeKey: 'task:1',
    onChanged,
    onUndone,
  };
  return { hook, request, onChanged, onUndone, options };
}

describe('useUndoableStatusChange', () => {
  it('runs the request, reports the record and shows an undo toast', async () => {
    const s = setup({ record: { id: 'a' }, undo: TOKEN });
    await act(async () => {
      await s.hook.current.run(s.options);
    });
    expect(s.request).toHaveBeenCalledTimes(1);
    expect(s.onChanged).toHaveBeenCalledWith({ id: 'a' });
    expect(mockShowUndoToast).toHaveBeenCalledTimes(1);
    expect(mockShowUndoToast.mock.calls[0]![0]).toMatchObject({
      message: 'Kitchen is now “Done”.',
      dedupeKey: 'task:1',
    });
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('shows no undo toast when the server issued no token', async () => {
    const s = setup({ record: { id: 'a' }, undo: null });
    await act(async () => {
      await s.hook.current.run(s.options);
    });
    expect(s.onChanged).toHaveBeenCalledWith({ id: 'a' });
    expect(mockShowUndoToast).not.toHaveBeenCalled();
  });

  it('passes the focus fallback through to the toast', async () => {
    const s = setup({ record: { id: 'a' }, undo: TOKEN });
    const focusFallback = () => null;
    await act(async () => {
      await s.hook.current.run({ ...s.options, focusFallback });
    });
    expect(mockShowUndoToast.mock.calls[0]![0].focusFallback).toBe(focusFallback);
  });

  it('Undo posts the token with the exact token string, then lets the host reload', async () => {
    const s = setup({ record: { id: 'a' }, undo: TOKEN });
    mockUndoChange.mockResolvedValue({ restored: [], retractedEventIds: [] });
    await act(async () => {
      await s.hook.current.run(s.options);
    });

    const order: string[] = [];
    mockUndoChange.mockImplementation(async () => {
      order.push('post');
      return { restored: [], retractedEventIds: [] };
    });
    s.onUndone.mockImplementation(async () => {
      order.push('reload');
    });
    await act(async () => {
      await mockShowUndoToast.mock.calls[0]![0].onUndo();
    });
    expect(mockUndoChange).toHaveBeenCalledWith(TOKEN.token);
    expect(order).toEqual(['post', 'reload']);
  });

  it('a failed Undo rejects (so the toast can report it) and does not reload', async () => {
    const s = setup({ record: { id: 'a' }, undo: TOKEN });
    await act(async () => {
      await s.hook.current.run(s.options);
    });
    const failure = new ApiClientError(409, { code: 'CONFLICT', message: 'x' });
    mockUndoChange.mockRejectedValue(failure);
    await expect(mockShowUndoToast.mock.calls[0]![0].onUndo()).rejects.toBe(failure);
    expect(s.onUndone).not.toHaveBeenCalled();
  });

  it('an ApiClientError from the request toasts the translated copy and never rejects', async () => {
    const s = setup(new ApiClientError(404, { code: 'NOT_FOUND', message: 'RAW' }));
    await act(async () => {
      await expect(s.hook.current.run(s.options)).resolves.toBeUndefined();
    });
    expect(mockShowToast).toHaveBeenCalledWith('error', 'The requested resource was not found.');
    expect(s.onChanged).not.toHaveBeenCalled();
    expect(mockShowUndoToast).not.toHaveBeenCalled();
  });

  it('any other failure toasts the generic status copy and never rejects', async () => {
    const s = setup(new Error('RAW-LOCAL'));
    await act(async () => {
      await expect(s.hook.current.run(s.options)).resolves.toBeUndefined();
    });
    expect(mockShowToast).toHaveBeenCalledWith('error', 'The status could not be changed.');
    expect(JSON.stringify(mockShowToast.mock.calls)).not.toContain('RAW-LOCAL');
  });
});
