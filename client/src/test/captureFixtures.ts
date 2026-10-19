import { jest } from '@jest/globals';
import type {
  AreaResponse,
  DiaryEntryDetail,
  OrientationResponse,
  Photo,
} from '@cornerstone/shared';
import type {
  CaptureItem,
  CaptureUploadedEvent,
  CaptureUploadsApi,
} from '../capture/captureTypes.js';

/** A controllable stand-in for the app-wide capture upload engine. */
export interface FakeEngine {
  readonly api: CaptureUploadsApi;
  items: CaptureItem[];
  orphans: CaptureItem[];
  emit: (event: CaptureUploadedEvent) => void;
  add: jest.Mock<CaptureUploadsApi['add']>;
  assignDraft: jest.Mock<CaptureUploadsApi['assignDraft']>;
  reassign: jest.Mock<CaptureUploadsApi['reassign']>;
  updateTags: jest.Mock<CaptureUploadsApi['updateTags']>;
  remove: jest.Mock<CaptureUploadsApi['remove']>;
  retry: jest.Mock<CaptureUploadsApi['retry']>;
  discardDraft: jest.Mock<CaptureUploadsApi['discardDraft']>;
  adoptOrphans: jest.Mock<CaptureUploadsApi['adoptOrphans']>;
  discardOrphans: jest.Mock<CaptureUploadsApi['discardOrphans']>;
  whenSettled: jest.Mock<CaptureUploadsApi['whenSettled']>;
}

export function makeEngine(): FakeEngine {
  const listeners = new Set<(event: CaptureUploadedEvent) => void>();
  const e = {
    items: [] as CaptureItem[],
    orphans: [] as CaptureItem[],
    add: jest.fn<CaptureUploadsApi['add']>(async (files) =>
      files.map((_, index) => `added-${index}`),
    ),
    assignDraft: jest.fn<CaptureUploadsApi['assignDraft']>(),
    reassign: jest.fn<CaptureUploadsApi['reassign']>(() => []),
    updateTags: jest.fn<CaptureUploadsApi['updateTags']>(),
    remove: jest.fn<CaptureUploadsApi['remove']>(),
    retry: jest.fn<CaptureUploadsApi['retry']>(),
    discardDraft: jest.fn<CaptureUploadsApi['discardDraft']>(async () => {}),
    adoptOrphans: jest.fn<CaptureUploadsApi['adoptOrphans']>(),
    discardOrphans: jest.fn<CaptureUploadsApi['discardOrphans']>(async () => {}),
    whenSettled: jest.fn<CaptureUploadsApi['whenSettled']>(async () => ({
      uploaded: [],
      failedIds: [],
    })),
    emit: (event: CaptureUploadedEvent) => listeners.forEach((listener) => listener(event)),
  };
  Object.defineProperty(e, 'api', {
    get: () =>
      ({
        storage: 'persistent',
        items: e.items,
        orphans: e.orphans,
        add: e.add,
        assignDraft: e.assignDraft,
        reassign: e.reassign,
        updateTags: e.updateTags,
        remove: e.remove,
        retry: e.retry,
        discardDraft: e.discardDraft,
        adoptOrphans: e.adoptOrphans,
        discardOrphans: e.discardOrphans,
        subscribe: (listener: (event: CaptureUploadedEvent) => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        whenSettled: e.whenSettled,
      }) as CaptureUploadsApi,
  });
  return e as unknown as FakeEngine;
}

export function area(id: string, name = id, parentId: string | null = null): AreaResponse {
  return {
    id,
    name,
    parentId,
    color: null,
    description: null,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  };
}

export const AREAS: AreaResponse[] = [area('kitchen', 'Kitchen'), area('bath', 'Bathroom')];
export const ORIENTATIONS = [
  { id: 'north', name: 'North' },
  { id: 'south', name: 'South' },
] as OrientationResponse[];

export function photo(id: string, overrides: Partial<Photo> = {}): Photo {
  return {
    id,
    entityType: 'diary_entry',
    entityId: 'draft-1',
    originalFilename: `${id}.jpg`,
    caption: null,
    areaId: null,
    orientationId: null,
    sortOrder: 0,
    createdAt: '2026-10-19T10:00:00.000Z',
    annotatedAt: null,
    fileUrl: `/api/photos/${id}/file`,
    thumbnailUrl: `/api/photos/${id}/thumbnail`,
    ...overrides,
  } as Photo;
}

export function item(id: string, overrides: Partial<CaptureItem> = {}): CaptureItem {
  return {
    id,
    draftId: 'draft-1',
    source: 'library',
    name: `${id}.jpg`,
    previewUrl: `blob:${id}`,
    state: 'waiting',
    progress: null,
    persisted: true,
    createdAt: '2026-10-19T10:00:00.000Z',
    areaId: null,
    orientationId: null,
    areaSource: null,
    orientationSource: null,
    caption: null,
    ...overrides,
  };
}

export function entry(overrides: Partial<DiaryEntryDetail> = {}): DiaryEntryDetail {
  return {
    id: 'draft-1',
    entryType: 'daily_log',
    entryDate: '2026-10-18',
    title: 'Screed',
    body: 'Poured',
    metadata: null,
    isAutomatic: false,
    isSigned: false,
    status: 'draft',
    sourceEntityType: null,
    sourceEntityId: null,
    photoCount: 0,
    createdBy: { id: 'user-1', displayName: 'Alex Owner' },
    createdAt: '2026-10-18T09:00:00.000Z',
    updatedAt: '2026-10-18T09:00:00.000Z',
    ...overrides,
  } as DiaryEntryDetail;
}
