/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as DiaryApiTypes from '../lib/diaryApi.js';
import type * as HookModule from './useDiscardDraft.js';
import { CaptureUploadsContext } from './captureUploadsContext.js';
import type { CaptureItem } from './captureTypes.js';
import { readStickyTags, writeStickyTags } from './stickyTags.js';
import { makeEngine } from '../test/captureFixtures.js';
import type { FakeEngine } from '../test/captureFixtures.js';

const mockDeleteDiaryEntry = jest.fn<typeof DiaryApiTypes.deleteDiaryEntry>();

jest.unstable_mockModule('../lib/diaryApi.js', () => ({
  deleteDiaryEntry: mockDeleteDiaryEntry,
}));

let useDiscardDraft: typeof HookModule.useDiscardDraft;
let engine: FakeEngine;

function item(id: string, draftId: string | null): CaptureItem {
  return {
    id,
    draftId,
    source: 'camera',
    name: `${id}.jpg`,
    previewUrl: `blob:${id}`,
    state: 'waiting',
    progress: null,
    persisted: true,
    createdAt: '2026-03-08T09:00:00.000Z',
    areaId: null,
    orientationId: null,
  } as CaptureItem;
}

function wrapper({ children }: { children: ReactNode }) {
  return <CaptureUploadsContext value={engine.api}>{children}</CaptureUploadsContext>;
}

beforeEach(async () => {
  if (!useDiscardDraft) ({ useDiscardDraft } = await import('./useDiscardDraft.js'));
  mockDeleteDiaryEntry.mockReset();
  mockDeleteDiaryEntry.mockResolvedValue(undefined);
  engine = makeEngine();
  sessionStorage.clear();
});

describe('useDiscardDraft', () => {
  it('discards the queued uploads, deletes the entry, then clears its remembered tags', async () => {
    writeStickyTags('d1', { areaId: 'a', orientationId: null });
    writeStickyTags('d2', { areaId: 'b', orientationId: null });
    const order: string[] = [];
    engine.discardDraft.mockImplementation(async () => {
      order.push('uploads');
    });
    mockDeleteDiaryEntry.mockImplementation(async () => {
      order.push('delete');
      expect(readStickyTags('d1')).not.toBeNull();
    });
    const { result } = renderHook(() => useDiscardDraft(), { wrapper });
    await act(async () => result.current.discard('d1'));
    expect(order).toEqual(['uploads', 'delete']);
    expect(engine.discardDraft).toHaveBeenCalledWith('d1');
    expect(mockDeleteDiaryEntry).toHaveBeenCalledWith('d1');
    expect(readStickyTags('d1')).toBeNull();
    expect(readStickyTags('d2')).toEqual({ areaId: 'b', orientationId: null });
  });

  it('throws and keeps the remembered tags when the delete fails', async () => {
    writeStickyTags('d1', { areaId: 'a', orientationId: null });
    mockDeleteDiaryEntry.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useDiscardDraft(), { wrapper });
    await expect(result.current.discard('d1')).rejects.toThrow('boom');
    expect(readStickyTags('d1')).toEqual({ areaId: 'a', orientationId: null });
  });

  it('does not delete the entry when discarding the uploads fails', async () => {
    engine.discardDraft.mockRejectedValue(new Error('storage'));
    const { result } = renderHook(() => useDiscardDraft(), { wrapper });
    await expect(result.current.discard('d1')).rejects.toThrow('storage');
    expect(mockDeleteDiaryEntry).not.toHaveBeenCalled();
  });

  it('counts only the photos of that draft that are still in the queue', () => {
    engine.items = [item('p1', 'd1'), item('p2', 'd1'), item('p3', 'd2'), item('p4', null)];
    const { result } = renderHook(() => useDiscardDraft(), { wrapper });
    expect(result.current.waitingCount('d1')).toBe(2);
    expect(result.current.waitingCount('d2')).toBe(1);
    expect(result.current.waitingCount('none')).toBe(0);
  });

  it('throws outside a capture upload provider', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useDiscardDraft())).toThrow(/CaptureUploadProvider/);
    errorSpy.mockRestore();
  });
});
