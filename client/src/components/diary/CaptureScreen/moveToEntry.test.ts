import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Photo } from '@cornerstone/shared';
import { ApiClientError } from '../../../lib/apiClient.js';
import type * as MoveModule from './moveToEntry.js';
import type * as DiaryApiTypes from '../../../lib/diaryApi.js';
import type * as PhotoApiTypes from '../../../lib/photoApi.js';

const mockDeleteDiaryEntry = jest.fn<typeof DiaryApiTypes.deleteDiaryEntry>();
const mockGetDiaryEntry = jest.fn<typeof DiaryApiTypes.getDiaryEntry>();
const mockUpdateDiaryEntry = jest.fn<typeof DiaryApiTypes.updateDiaryEntry>();
const mockFetchPhotoBlob = jest.fn<typeof PhotoApiTypes.fetchPhotoBlob>();
const mockUploadPhoto = jest.fn<typeof PhotoApiTypes.uploadPhoto>();
const mockUploadAnnotation = jest.fn<typeof PhotoApiTypes.uploadAnnotation>();
const mockClearStickyTags = jest.fn();

jest.unstable_mockModule('../../../lib/diaryApi.js', () => ({
  deleteDiaryEntry: mockDeleteDiaryEntry,
  getDiaryEntry: mockGetDiaryEntry,
  updateDiaryEntry: mockUpdateDiaryEntry,
}));
jest.unstable_mockModule('../../../lib/photoApi.js', () => ({
  fetchPhotoBlob: mockFetchPhotoBlob,
  uploadPhoto: mockUploadPhoto,
  uploadAnnotation: mockUploadAnnotation,
}));
jest.unstable_mockModule('../../../capture/stickyTags.js', () => ({
  clearStickyTags: mockClearStickyTags,
}));

let moveToEntry: typeof MoveModule.moveToEntry;
let newMoveProgress: typeof MoveModule.newMoveProgress;

function photo(id: string, overrides: Partial<Photo> = {}): Photo {
  return {
    id,
    originalFilename: `${id}.jpg`,
    caption: null,
    areaId: null,
    orientationId: null,
    annotatedAt: null,
    fileUrl: `/api/photos/${id}/file`,
    ...overrides,
  } as Photo;
}

function setup(overrides: Partial<MoveModule.MoveToEntryArgs> = {}) {
  const reassign = jest.fn<(from: string, to: string) => readonly string[]>(() => []);
  const whenSettled = jest.fn(async (_ids: readonly string[]) => ({
    uploaded: [] as readonly Photo[],
    failedIds: [] as readonly string[],
  }));
  const args: MoveModule.MoveToEntryArgs = {
    draftId: 'draft-1',
    match: { id: 'match-1' },
    body: '',
    serverPhotos: [],
    api: { reassign, whenSettled },
    progress: newMoveProgress(),
    ...overrides,
  };
  return { args, reassign, whenSettled };
}

beforeEach(async () => {
  jest.resetAllMocks();
  mockDeleteDiaryEntry.mockResolvedValue(undefined);
  mockFetchPhotoBlob.mockImplementation(async () => new Blob(['x'], { type: 'image/jpeg' }));
  mockUploadPhoto.mockImplementation(async (_t, _id, file) => photo(`new-${file.name}`));
  mockUploadAnnotation.mockResolvedValue(photo('annotated'));
  mockGetDiaryEntry.mockResolvedValue({ body: '' } as never);
  mockUpdateDiaryEntry.mockResolvedValue({} as never);
  if (!moveToEntry) ({ moveToEntry, newMoveProgress } = await import('./moveToEntry.js'));
});

describe('moveToEntry', () => {
  it('reassigns pending photos and waits until they settled', async () => {
    const { args, reassign, whenSettled } = setup();
    reassign.mockReturnValue(['i1', 'i2']);

    const result = await moveToEntry(args);

    expect(reassign).toHaveBeenCalledWith('draft-1', 'match-1');
    expect(whenSettled).toHaveBeenCalledWith(['i1', 'i2']);
    expect(result).toEqual({ status: 'done' });
  });

  it('does not wait when no photo is pending', async () => {
    const { args, whenSettled } = setup();

    await moveToEntry(args);

    expect(whenSettled).not.toHaveBeenCalled();
  });

  it('stops without deleting anything when a pending photo failed', async () => {
    const { args, reassign, whenSettled } = setup({ body: 'Some text' });
    reassign.mockReturnValue(['i1']);
    whenSettled.mockResolvedValue({ uploaded: [], failedIds: ['i1'] });

    const result = await moveToEntry(args);

    expect(result).toEqual({ status: 'failed' });
    expect(mockDeleteDiaryEntry).not.toHaveBeenCalled();
    expect(mockUpdateDiaryEntry).not.toHaveBeenCalled();
  });

  it('fetches the original of each server photo and uploads it with its tags and caption', async () => {
    const { args } = setup({
      serverPhotos: [photo('p1', { caption: 'Crack', areaId: 'kitchen', orientationId: 'north' })],
    });

    await moveToEntry(args);

    expect(mockFetchPhotoBlob).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1' }),
      'original',
    );
    expect(mockUploadPhoto).toHaveBeenCalledTimes(1);
    const call = mockUploadPhoto.mock.calls[0]!;
    expect(call[0]).toBe('diary_entry');
    expect(call[1]).toBe('match-1');
    expect((call[2] as File).name).toBe('p1.jpg');
    expect((call[2] as File).type).toBe('image/jpeg');
    expect(call.slice(3)).toEqual(['Crack', null, 'kitchen', 'north']);
  });

  it('uploads a photo without a caption as undefined', async () => {
    const { args } = setup({ serverPhotos: [photo('p1')] });

    await moveToEntry(args);

    expect(mockUploadPhoto.mock.calls[0]![3]).toBeUndefined();
  });

  it('copies the annotation only for photos that have one', async () => {
    const { args } = setup({
      serverPhotos: [photo('plain'), photo('marked', { annotatedAt: '2026-10-19T10:00:00.000Z' })],
    });

    await moveToEntry(args);

    expect(mockUploadAnnotation).toHaveBeenCalledTimes(1);
    expect(mockFetchPhotoBlob).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'marked' }),
      'annotated',
    );
    expect(mockUploadAnnotation.mock.calls[0]![0]).toBe('new-marked.jpg');
  });

  it('skips photos a previous attempt already moved (retry is idempotent)', async () => {
    const { args } = setup({ serverPhotos: [photo('p1'), photo('p2')] });
    mockUploadPhoto.mockImplementationOnce(async (_t, _id, file) => photo(`new-${file.name}`));
    mockUploadPhoto.mockRejectedValueOnce(new Error('network'));

    const first = await moveToEntry(args);
    expect(first).toEqual({ status: 'failed' });
    expect(mockDeleteDiaryEntry).not.toHaveBeenCalled();

    mockUploadPhoto.mockClear();
    const second = await moveToEntry(args);

    expect(second).toEqual({ status: 'done' });
    expect(mockUploadPhoto).toHaveBeenCalledTimes(1);
    expect((mockUploadPhoto.mock.calls[0]![2] as File).name).toBe('p2.jpg');
  });

  it('does not hand the pending photos over a second time on retry', async () => {
    const { args, reassign } = setup({ serverPhotos: [photo('p1')] });
    reassign.mockReturnValue(['i1']);
    mockUploadPhoto.mockRejectedValueOnce(new Error('network'));

    await moveToEntry(args);
    await moveToEntry(args);

    expect(reassign).toHaveBeenCalledTimes(1);
  });

  it('appends the text to the existing text after a blank line', async () => {
    mockGetDiaryEntry.mockResolvedValue({ body: 'Earlier note  ' } as never);
    const { args } = setup({ body: '  New note ' });

    await moveToEntry(args);

    expect(mockUpdateDiaryEntry).toHaveBeenCalledWith('match-1', {
      body: 'Earlier note\n\nNew note',
    });
  });

  it('uses the text as is when the match has none', async () => {
    const { args } = setup({ body: 'New note' });

    await moveToEntry(args);

    expect(mockUpdateDiaryEntry).toHaveBeenCalledWith('match-1', { body: 'New note' });
  });

  it('skips the text step when the text is empty', async () => {
    const { args } = setup({ body: '   ' });

    await moveToEntry(args);

    expect(mockGetDiaryEntry).not.toHaveBeenCalled();
    expect(mockUpdateDiaryEntry).not.toHaveBeenCalled();
  });

  it('does not append the text twice on retry', async () => {
    const { args } = setup({ body: 'New note' });
    mockDeleteDiaryEntry.mockRejectedValueOnce(new Error('boom'));

    const first = await moveToEntry(args);
    const second = await moveToEntry(args);

    expect(first).toEqual({ status: 'failed' });
    expect(second).toEqual({ status: 'done' });
    expect(mockUpdateDiaryEntry).toHaveBeenCalledTimes(1);
  });

  it('deletes the draft last and clears its sticky tags', async () => {
    const order: string[] = [];
    mockUploadPhoto.mockImplementation(async () => {
      order.push('upload');
      return photo('n');
    });
    mockUpdateDiaryEntry.mockImplementation(async () => {
      order.push('text');
      return {} as never;
    });
    mockDeleteDiaryEntry.mockImplementation(async () => {
      order.push('delete');
    });
    const { args } = setup({ body: 'text', serverPhotos: [photo('p1')] });

    await moveToEntry(args);

    expect(order).toEqual(['upload', 'text', 'delete']);
    expect(mockDeleteDiaryEntry).toHaveBeenCalledWith('draft-1');
    expect(mockClearStickyTags).toHaveBeenCalledWith('draft-1');
  });

  it('reports signed when the match is locked (403)', async () => {
    mockUploadPhoto.mockRejectedValue(
      new ApiClientError(403, { code: 'IMMUTABLE_ENTRY', message: 'locked' }),
    );
    const { args } = setup({ serverPhotos: [photo('p1')] });

    const result = await moveToEntry(args);

    expect(result).toEqual({ status: 'signed' });
    expect(mockDeleteDiaryEntry).not.toHaveBeenCalled();
  });

  it('reports failed for other errors and keeps the draft', async () => {
    mockUpdateDiaryEntry.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    const { args } = setup({ body: 'text' });

    const result = await moveToEntry(args);

    expect(result).toEqual({ status: 'failed' });
    expect(mockDeleteDiaryEntry).not.toHaveBeenCalled();
    expect(mockClearStickyTags).not.toHaveBeenCalled();
  });
});
