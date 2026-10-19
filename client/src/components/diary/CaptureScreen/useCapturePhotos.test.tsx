/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { AreaResponse, OrientationResponse, Photo } from '@cornerstone/shared';
import { ApiClientError } from '../../../lib/apiClient.js';
import { installMatchMedia } from '../../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../../test/matchMediaControl.js';
import type {
  CaptureItem,
  CaptureUploadedEvent,
  CaptureUploadsApi,
} from '../../../capture/captureTypes.js';
import type * as HookModule from './useCapturePhotos.js';
import type * as PhotoApiTypes from '../../../lib/photoApi.js';
import type * as UndoApiTypes from '../../../lib/undoApi.js';
import type { ShowUndoToastOptions } from '../../Toast/ToastContext.js';

// ── Fake upload engine ──────────────────────────────────────────────────────────────────────────

interface FakeEngine {
  api: CaptureUploadsApi;
  items: CaptureItem[];
  orphans: CaptureItem[];
  emit: (event: CaptureUploadedEvent) => void;
  add: jest.Mock<CaptureUploadsApi['add']>;
  assignDraft: jest.Mock<CaptureUploadsApi['assignDraft']>;
  updateTags: jest.Mock<CaptureUploadsApi['updateTags']>;
  remove: jest.Mock<CaptureUploadsApi['remove']>;
  retry: jest.Mock<CaptureUploadsApi['retry']>;
  adoptOrphans: jest.Mock<CaptureUploadsApi['adoptOrphans']>;
  discardOrphans: jest.Mock<CaptureUploadsApi['discardOrphans']>;
}

let engine: FakeEngine;

function makeEngine(): FakeEngine {
  const listeners = new Set<(event: CaptureUploadedEvent) => void>();
  const e = {
    items: [] as CaptureItem[],
    orphans: [] as CaptureItem[],
    add: jest.fn<CaptureUploadsApi['add']>(async (files) =>
      files.map((_, index) => `added-${index}`),
    ),
    assignDraft: jest.fn<CaptureUploadsApi['assignDraft']>(),
    updateTags: jest.fn<CaptureUploadsApi['updateTags']>(),
    remove: jest.fn<CaptureUploadsApi['remove']>(),
    retry: jest.fn<CaptureUploadsApi['retry']>(),
    adoptOrphans: jest.fn<CaptureUploadsApi['adoptOrphans']>(),
    discardOrphans: jest.fn<CaptureUploadsApi['discardOrphans']>(async () => {}),
    emit: (event: CaptureUploadedEvent) => listeners.forEach((listener) => listener(event)),
    api: null as unknown as CaptureUploadsApi,
  };
  Object.defineProperty(e, 'api', {
    get: () =>
      ({
        storage: 'persistent',
        items: e.items,
        orphans: e.orphans,
        add: e.add,
        assignDraft: e.assignDraft,
        reassign: jest.fn(() => []),
        updateTags: e.updateTags,
        remove: e.remove,
        retry: e.retry,
        discardDraft: jest.fn(async () => {}),
        adoptOrphans: e.adoptOrphans,
        discardOrphans: e.discardOrphans,
        subscribe: (listener: (event: CaptureUploadedEvent) => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        whenSettled: jest.fn(async () => ({ uploaded: [], failedIds: [] })),
      }) as CaptureUploadsApi,
  });
  return e as unknown as FakeEngine;
}

const mockShowToast = jest.fn();
const mockShowUndoToast = jest.fn<(options: ShowUndoToastOptions) => void>();
const mockDeletePhoto = jest.fn<typeof PhotoApiTypes.deletePhoto>();
const mockGetPhotos = jest.fn<typeof PhotoApiTypes.getPhotosForEntity>();
const mockUpdatePhoto = jest.fn<typeof PhotoApiTypes.updatePhoto>();
const mockUndoChange = jest.fn<typeof UndoApiTypes.undoChange>();
const mockLiveSupported = jest.fn(() => true);
const mockCameraDenied = jest.fn(() => false);

jest.unstable_mockModule('../../../capture/captureUploadsContext.js', () => ({
  useCaptureUploads: () => engine.api,
}));
jest.unstable_mockModule('../../Toast/ToastContext.js', () => ({
  useToast: () => ({ showToast: mockShowToast, showUndoToast: mockShowUndoToast }),
}));
jest.unstable_mockModule('../../../lib/photoApi.js', () => ({
  deletePhoto: mockDeletePhoto,
  getPhotosForEntity: mockGetPhotos,
  updatePhoto: mockUpdatePhoto,
}));
jest.unstable_mockModule('../../../lib/undoApi.js', () => ({ undoChange: mockUndoChange }));
jest.unstable_mockModule('../../RapidCamera/RapidCamera.js', () => ({
  isLiveCameraSupported: mockLiveSupported,
  isCameraDeniedThisSession: mockCameraDenied,
}));

let useCapturePhotos: typeof HookModule.useCapturePhotos;
let areaLabelOf: typeof HookModule.areaLabelOf;
let media: MatchMediaControl;

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────────

function area(id: string, name = id, parentId: string | null = null): AreaResponse {
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

const AREAS = [area('kitchen', 'Kitchen'), area('bath', 'Bathroom')];
const ORIENTATIONS = [
  { id: 'north', name: 'North' },
  { id: 'south', name: 'South' },
] as OrientationResponse[];

function photo(id: string, overrides: Partial<Photo> = {}): Photo {
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

function item(id: string, overrides: Partial<CaptureItem> = {}): CaptureItem {
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

interface SetupOptions {
  draftId?: string | null;
  initialPhotos?: Photo[];
  prefillAreaId?: string | null;
  areasReady?: boolean;
  areas?: AreaResponse[];
  /** Called with the hook value on every render (to record intermediate states). */
  onRender?: (value: ReturnType<typeof HookModule.useCapturePhotos>) => void;
}

function setup(options: SetupOptions = {}) {
  const draftId = options.draftId === undefined ? 'draft-1' : options.draftId;
  const draftRef = { current: draftId };
  const nullItemIdsRef = { current: [] as string[] };
  const announce = jest.fn();
  const ensureDraft = jest.fn(async () => {
    draftRef.current = 'draft-new';
    return 'draft-new';
  });
  const view = renderHook(
    (props: { draftId: string | null }) => {
      const value = useCapturePhotos({
        draftId: props.draftId,
        getDraftId: () => draftRef.current,
        initialPhotos: options.initialPhotos ?? [],
        prefillAreaId: options.prefillAreaId ?? null,
        areas: options.areas ?? AREAS,
        areasReady: options.areasReady ?? true,
        orientations: ORIENTATIONS,
        userId: 'user-1',
        ensureDraft,
        nullItemIdsRef,
        announce,
      });
      options.onRender?.(value);
      return value;
    },
    { initialProps: { draftId } },
  );
  return { ...view, announce, ensureDraft, nullItemIdsRef, draftRef };
}

beforeEach(async () => {
  engine = makeEngine();
  sessionStorage.clear();
  localStorage.clear();
  jest.clearAllMocks();
  mockLiveSupported.mockReturnValue(true);
  mockCameraDenied.mockReturnValue(false);
  mockGetPhotos.mockResolvedValue([]);
  mockUndoChange.mockResolvedValue(undefined as never);
  mockUpdatePhoto.mockImplementation(async (id, patch) => photo(id, patch as Partial<Photo>));
  media = installMatchMedia();
  if (!useCapturePhotos)
    ({ useCapturePhotos, areaLabelOf } = await import('./useCapturePhotos.js'));
});

afterEach(() => {
  media.restore();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
});

// ── Tests ───────────────────────────────────────────────────────────────────────────────────────

describe('areaLabelOf', () => {
  it('returns the name, or the name and parent when two areas share a name', () => {
    const areas = [
      area('g', 'Ground floor'),
      area('u', 'Upper floor'),
      area('k1', 'Bath', 'g'),
      area('k2', 'Bath', 'u'),
      area('solo', 'Hall'),
    ];

    expect(areaLabelOf('k1', areas)).toBe('Bath · Ground floor');
    expect(areaLabelOf('k2', areas)).toBe('Bath · Upper floor');
    expect(areaLabelOf('solo', areas)).toBe('Hall');
    expect(areaLabelOf('missing', areas)).toBeNull();
    expect(areaLabelOf(null, areas)).toBeNull();
  });

  it('falls back to the plain name for an ambiguous root area', () => {
    const areas = [area('a', 'Shed'), area('b', 'Shed')];

    expect(areaLabelOf('a', areas)).toBe('Shed');
  });
});

describe('useCapturePhotos: tiles', () => {
  it('lists server photos by sort order, then the draft pending items by time', () => {
    engine.items = [
      item('late', { createdAt: '2026-10-19T10:05:00.000Z' }),
      item('early', { createdAt: '2026-10-19T10:01:00.000Z' }),
      item('other-draft', { draftId: 'draft-2' }),
    ];
    const { result } = setup({
      initialPhotos: [photo('p2', { sortOrder: 2 }), photo('p1', { sortOrder: 1 })],
    });

    expect(result.current.tiles.map((tile) => tile.key)).toEqual(['p1', 'p2', 'early', 'late']);
    expect(result.current.tiles[0]).toMatchObject({ kind: 'server', state: 'uploaded' });
    expect(result.current.tiles[2]).toMatchObject({ kind: 'pending', state: 'waiting' });
    expect(result.current.uploadedCount).toBe(2);
    expect(result.current.pendingCount).toBe(2);
  });

  it('before the draft exists, shows this session items without a draft but not orphans', () => {
    const orphan = item('orphan', { draftId: null });
    engine.items = [item('mine', { draftId: null }), orphan];
    engine.orphans = [orphan];
    const { result } = setup({ draftId: null });

    expect(result.current.tiles.map((tile) => tile.key)).toEqual(['mine']);
    expect(result.current.orphans.map((o) => o.id)).toEqual(['orphan']);
  });

  it('hides orphans once a draft exists', () => {
    engine.orphans = [item('orphan', { draftId: null })];
    const { result } = setup();

    expect(result.current.orphans).toEqual([]);
  });

  it('labels tiles with the area and orientation names and flags annotated and unsaved items', () => {
    engine.items = [item('i1', { areaId: 'bath', orientationId: 'south', persisted: false })];
    const { result } = setup({
      initialPhotos: [photo('p1', { areaId: 'kitchen', annotatedAt: '2026-10-19T09:00:00.000Z' })],
    });

    expect(result.current.tiles[0]).toMatchObject({
      areaLabel: 'Kitchen',
      orientationLabel: null,
      annotated: true,
      notPersisted: false,
    });
    expect(result.current.tiles[1]).toMatchObject({
      areaLabel: 'Bathroom',
      orientationLabel: 'South',
      notPersisted: true,
      thumbnailUrl: 'blob:i1',
    });
    expect(result.current.hasMemoryOnlyItems).toBe(true);
  });

  it('replaces the pending tile in place when its upload finishes, carrying the provenance over', () => {
    engine.items = [
      item('i1', { areaId: 'kitchen', areaSource: 'live' }),
      item('i2', { createdAt: '2026-10-19T10:02:00.000Z' }),
    ];
    const { result, rerender } = setup();
    expect(result.current.tiles.map((t) => t.key)).toEqual(['i1', 'i2']);

    act(() => {
      engine.emit({
        itemId: 'i1',
        draftId: 'draft-1',
        photo: photo('server-1', { areaId: 'kitchen' }),
      });
    });
    engine.items = [engine.items[1]!];
    rerender({ draftId: 'draft-1' });

    expect(result.current.tiles.map((t) => t.key)).toEqual(['server-1', 'i2']);
    expect(result.current.tiles[0]).toMatchObject({ kind: 'server', state: 'uploaded' });
    expect(result.current.uploadedCount).toBe(1);
  });

  it('keeps a selected tile selected after its upload finishes', () => {
    engine.items = [item('i1')];
    const { result, rerender } = setup();
    act(() => result.current.toggleSelect('i1'));

    act(() => {
      engine.emit({ itemId: 'i1', draftId: 'draft-1', photo: photo('server-1') });
    });
    engine.items = [];
    rerender({ draftId: 'draft-1' });

    expect([...result.current.selectedKeys]).toEqual(['server-1']);
  });

  it('ignores uploads that finished for another draft', () => {
    const { result } = setup();

    act(() => {
      engine.emit({ itemId: 'x', draftId: 'draft-9', photo: photo('server-9') });
    });

    expect(result.current.tiles).toEqual([]);
  });

  it('appends an upload whose item the strip had not seen', () => {
    const { result } = setup({ initialPhotos: [photo('p1')] });

    act(() => {
      engine.emit({ itemId: 'unseen', draftId: 'draft-1', photo: photo('p2') });
    });

    expect(result.current.tiles.map((t) => t.key)).toEqual(['p1', 'p2']);
  });
});

describe('useCapturePhotos: sticky chips', () => {
  it('starts from the prefilled area for a new entry and saves nothing without a draft', () => {
    const { result } = setup({ draftId: null, prefillAreaId: 'bath' });

    expect(result.current.chips.areaId).toBe('bath');
    expect(sessionStorage.length).toBe(0);
  });

  it('persists the chips per draft and restores them', () => {
    const first = setup({ prefillAreaId: 'bath' });
    act(() => first.result.current.chips.onAreaChange('kitchen'));
    act(() => first.result.current.chips.onOrientationChange('north'));
    first.unmount();

    const second = setup();

    expect(second.result.current.chips.areaId).toBe('kitchen');
    expect(second.result.current.chips.orientation).toBe('north');
  });

  it('never carries chips from one draft into another', () => {
    const first = setup();
    act(() => first.result.current.chips.onAreaChange('kitchen'));
    first.unmount();

    const other = setup({ draftId: 'draft-other' });

    expect(other.result.current.chips.areaId).toBeNull();
  });

  it('drops a chosen area that no longer exists once the areas are loaded', () => {
    const first = setup();
    act(() => first.result.current.chips.onAreaChange('kitchen'));
    first.unmount();

    const loading = setup({ areas: [], areasReady: false });
    expect(loading.result.current.chips.areaId).toBe('kitchen');
    loading.unmount();
    const ready = setup({ areas: [area('bath', 'Bathroom')], areasReady: true });

    expect(ready.result.current.chips.areaId).toBeNull();
  });

  it('pushes the chosen tag to the recents', () => {
    const { result } = setup();

    act(() => result.current.chips.onAreaChange('bath'));
    act(() => result.current.chips.onOrientationChange('south'));
    act(() => result.current.chips.onAreaChange('kitchen'));

    expect(result.current.chips.recentAreaIds).toEqual(['kitchen', 'bath']);
    expect(result.current.chips.recentOrientationIds).toEqual(['south']);
  });

  it('does not push a cleared chip to the recents', () => {
    const { result } = setup();

    act(() => result.current.chips.onAreaChange(null));

    expect(result.current.chips.recentAreaIds).toEqual([]);
  });
});

describe('useCapturePhotos: retroactive tagging (Decision 13)', () => {
  it('without a selection tags photos without a value, and photos tagged by an earlier chip', async () => {
    engine.items = [
      item('blank'),
      item('retro', { areaId: 'bath', areaSource: 'retro' }),
      item('hand', { areaId: 'bath', areaSource: 'hand' }),
      item('live', { areaId: 'bath', areaSource: 'live' }),
    ];
    const { result } = setup({
      initialPhotos: [photo('server-blank'), photo('server-hand', { areaId: 'bath' })],
    });

    await act(async () => result.current.chips.onAreaChange('kitchen'));

    expect(engine.updateTags.mock.calls).toEqual([
      ['blank', { areaId: 'kitchen', areaSource: 'retro' }],
      ['retro', { areaId: 'kitchen', areaSource: 'retro' }],
    ]);
    expect(mockUpdatePhoto).toHaveBeenCalledTimes(1);
    expect(mockUpdatePhoto).toHaveBeenCalledWith('server-blank', { areaId: 'kitchen' });
    expect(result.current.tiles.find((t) => t.key === 'server-blank')?.areaLabel).toBe('Kitchen');
  });

  it('applies a cleared chip to retro-tagged photos only, with no source', async () => {
    engine.items = [item('blank'), item('retro', { areaId: 'bath', areaSource: 'retro' })];
    const { result } = setup();

    await act(async () => result.current.chips.onAreaChange(null));

    expect(engine.updateTags).toHaveBeenCalledWith('blank', { areaId: null, areaSource: null });
    expect(engine.updateTags).toHaveBeenCalledWith('retro', { areaId: null, areaSource: null });
  });

  it('"No orientation" tags the untagged photos as retro with no orientation', async () => {
    engine.items = [item('blank')];
    const { result } = setup();

    await act(async () => result.current.chips.onOrientationChange('none'));

    expect(engine.updateTags).toHaveBeenCalledWith('blank', {
      orientationId: null,
      orientationSource: 'retro',
    });
    expect(result.current.chips.orientation).toBe('none');
  });

  it('with a selection tags the selected photos only, as hand, and clears the selection', async () => {
    engine.items = [item('a'), item('b'), item('c')];
    const { result } = setup();
    act(() => result.current.toggleSelect('b'));
    expect([...result.current.selectedKeys]).toEqual(['b']);

    await act(async () => result.current.chips.onAreaChange('bath'));

    expect(engine.updateTags.mock.calls).toEqual([['b', { areaId: 'bath', areaSource: 'hand' }]]);
    expect(result.current.selectedKeys.size).toBe(0);
  });

  it('skips blocked (signed-entry) uploads', async () => {
    engine.items = [item('blocked', { state: 'blocked' }), item('ok')];
    const { result } = setup();

    await act(async () => result.current.chips.onAreaChange('bath'));

    expect(engine.updateTags).toHaveBeenCalledTimes(1);
    expect(engine.updateTags).toHaveBeenCalledWith('ok', expect.anything());
  });

  it('counts failures, announces them and keeps the old value of a failed photo', async () => {
    mockUpdatePhoto.mockRejectedValueOnce(new Error('down'));
    const { result, announce } = setup({
      initialPhotos: [photo('bad', { sortOrder: 1 }), photo('good', { sortOrder: 2 })],
    });

    await act(async () => result.current.chips.onAreaChange('kitchen'));

    expect(announce).toHaveBeenCalledWith("Couldn't tag 1 photo. Try again.");
    expect(result.current.tiles.find((t) => t.key === 'bad')?.areaLabel).toBeNull();
    expect(result.current.tiles.find((t) => t.key === 'good')?.areaLabel).toBe('Kitchen');
  });

  it('selects all, then clears the selection', () => {
    engine.items = [item('a'), item('b')];
    const { result } = setup({ initialPhotos: [photo('p1')] });

    act(() => result.current.selectAll());
    expect([...result.current.selectedKeys].sort()).toEqual(['a', 'b', 'p1']);

    act(() => result.current.clearSelection());
    expect(result.current.selectedKeys.size).toBe(0);
  });

  it('toggles a tile out of the selection and drops keys of tiles that vanished', () => {
    engine.items = [item('a')];
    const { result, rerender } = setup();
    act(() => result.current.toggleSelect('a'));
    act(() => result.current.toggleSelect('a'));
    expect(result.current.selectedKeys.size).toBe(0);

    act(() => result.current.toggleSelect('a'));
    engine.items = [];
    rerender({ draftId: 'draft-1' });

    expect(result.current.selectedKeys.size).toBe(0);
  });
});

describe('useCapturePhotos: adding photos', () => {
  const file = (name = 'a.jpg', type = 'image/jpeg') => new File(['x'], name, { type });

  it('adds library files with the sticky chips as "added" tags', async () => {
    const { result } = setup({ prefillAreaId: 'bath' });
    act(() => result.current.chips.onOrientationChange('north'));
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file('a.jpg'), file('b.jpg')] });

    await act(async () => {
      result.current.inputs.onLibraryChange({ target: input } as never);
    });

    expect(engine.add).toHaveBeenCalledTimes(1);
    const [files, init] = engine.add.mock.calls[0]!;
    expect(files).toHaveLength(2);
    expect(init).toMatchObject({ draftId: 'draft-1', source: 'library' });
    expect(init.tags).toEqual({
      areaId: 'bath',
      orientationId: 'north',
      areaSource: 'added',
      orientationSource: 'added',
      caption: null,
    });
    expect(input.value).toBe('');
  });

  it('leaves unset dimensions without a source and maps "No orientation" to null', async () => {
    const { result } = setup();
    act(() => result.current.chips.onOrientationChange('none'));
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file()] });

    await act(async () => {
      result.current.inputs.onCameraInputChange({ target: input } as never);
    });

    expect(engine.add.mock.calls[0]![1]).toMatchObject({
      source: 'cameraApp',
      tags: { areaId: null, areaSource: null, orientationId: null, orientationSource: 'added' },
    });
  });

  it('ignores an empty file list', async () => {
    const { result } = setup();
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: null });

    await act(async () => {
      result.current.inputs.onLibraryChange({ target: input } as never);
    });

    expect(engine.add).not.toHaveBeenCalled();
  });

  it('camera shots are tagged "live" and counted for the camera', async () => {
    engine.add.mockResolvedValue(['shot-1']);
    const { result } = setup({ prefillAreaId: 'kitchen' });

    await act(async () => result.current.camera.onShot(Promise.resolve(file('shot.jpg'))));

    expect(engine.add.mock.calls[0]![1]).toMatchObject({
      source: 'camera',
      tags: { areaId: 'kitchen', areaSource: 'live' },
    });
    expect(result.current.camera.shotCount).toBe(1);
  });

  it('before the draft exists it remembers the new items and creates the draft', async () => {
    engine.add.mockResolvedValue(['n1', 'n2']);
    const { result, ensureDraft, nullItemIdsRef } = setup({ draftId: null });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file(), file()] });

    await act(async () => {
      result.current.inputs.onLibraryChange({ target: input } as never);
    });

    expect(engine.add.mock.calls[0]![1].draftId).toBeNull();
    expect(nullItemIdsRef.current).toEqual(['n1', 'n2']);
    expect(ensureDraft).toHaveBeenCalledTimes(1);
  });

  it('hands items to the draft that appeared while they were being added', async () => {
    engine.add.mockResolvedValue(['n1']);
    const { result, draftRef, ensureDraft } = setup({ draftId: null });
    engine.add.mockImplementationOnce(async () => {
      draftRef.current = 'draft-fast';
      return ['n1'];
    });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file()] });

    await act(async () => {
      result.current.inputs.onLibraryChange({ target: input } as never);
    });

    expect(engine.assignDraft).toHaveBeenCalledWith(['n1'], 'draft-fast');
    expect(ensureDraft).not.toHaveBeenCalled();
  });

  it('opens the library picker and the camera app input by click', () => {
    const { result } = setup();
    const library = document.createElement('input');
    const camera = document.createElement('input');
    const libraryClick = jest.spyOn(library, 'click').mockImplementation(() => {});
    const cameraClick = jest.spyOn(camera, 'click').mockImplementation(() => {});
    result.current.inputs.libraryInputRef.current = library;
    result.current.inputs.cameraInputRef.current = camera;

    result.current.inputs.chooseFromLibrary();
    result.current.camera.onUseCameraApp();

    expect(libraryClick).toHaveBeenCalledTimes(1);
    expect(cameraClick).toHaveBeenCalledTimes(1);
  });

  it('takes photos in the live camera when it is supported and not denied', () => {
    const { result } = setup();

    act(() => result.current.inputs.takePhotos());

    expect(result.current.camera.open).toBe(true);
    act(() => result.current.camera.onClose());
    expect(result.current.camera.open).toBe(false);
  });

  it.each([
    ['not supported', false, false],
    ['denied this session', true, true],
  ])('falls back to the camera app when the live camera is %s', (_label, supported, denied) => {
    mockLiveSupported.mockReturnValue(supported);
    mockCameraDenied.mockReturnValue(denied);
    const { result } = setup();
    const camera = document.createElement('input');
    const click = jest.spyOn(camera, 'click').mockImplementation(() => {});
    result.current.inputs.cameraInputRef.current = camera;

    act(() => result.current.inputs.takePhotos());

    expect(click).toHaveBeenCalledTimes(1);
    expect(result.current.camera.open).toBe(false);
  });

  it('shows Take photos on a coarse pointer', () => {
    media.set('(pointer: coarse)', true);
    const { result } = setup();

    expect(result.current.inputs.showTakePhotos).toBe(true);
  });

  it('shows Take photos on a fine pointer when a video input exists', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { enumerateDevices: async () => [{ kind: 'audioinput' }, { kind: 'videoinput' }] },
    });
    const { result } = setup();

    await waitFor(() => expect(result.current.inputs.showTakePhotos).toBe(true));
  });

  it('hides Take photos on a fine pointer without a video input or a device list', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { enumerateDevices: async () => [{ kind: 'audioinput' }] },
    });
    const { result } = setup();
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.inputs.showTakePhotos).toBe(false);

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: async () => {
          throw new Error('blocked');
        },
      },
    });
    const second = setup();
    await act(async () => {
      await Promise.resolve();
    });
    expect(second.result.current.inputs.showTakePhotos).toBe(false);
  });

  describe('drop zone', () => {
    const dragEvent = (types: string[], files: File[] = []) =>
      ({
        dataTransfer: { types, files },
        preventDefault: jest.fn(),
      }) as never;

    it('accepts a drag of files and marks the zone active; leaving clears it', () => {
      const { result } = setup();
      const event = dragEvent(['Files']);

      act(() => result.current.inputs.dropHandlers.onDragOver(event));
      expect(result.current.inputs.dragActive).toBe(true);
      expect((event as { preventDefault: jest.Mock }).preventDefault).toHaveBeenCalled();

      act(() => result.current.inputs.dropHandlers.onDragLeave());
      expect(result.current.inputs.dragActive).toBe(false);
    });

    it('ignores drags that carry no files', () => {
      const { result } = setup();

      act(() => result.current.inputs.dropHandlers.onDragOver(dragEvent(['text/plain'])));

      expect(result.current.inputs.dragActive).toBe(false);
    });

    it('adds only image files from a drop', async () => {
      const { result } = setup();

      await act(async () =>
        result.current.inputs.dropHandlers.onDrop(
          dragEvent(
            ['Files'],
            [file('a.jpg'), file('notes.pdf', 'application/pdf'), file('b.png', 'image/png')],
          ),
        ),
      );

      expect(engine.add.mock.calls[0]![0].map((f) => f.name)).toEqual(['a.jpg', 'b.png']);
      expect(engine.add.mock.calls[0]![1].source).toBe('drop');
    });

    it('adds nothing when a drop has no image', async () => {
      const { result } = setup();

      await act(async () =>
        result.current.inputs.dropHandlers.onDrop(
          dragEvent(['Files'], [file('notes.pdf', 'application/pdf')]),
        ),
      );

      expect(engine.add).not.toHaveBeenCalled();
    });
  });
});

describe('useCapturePhotos: upload announcements', () => {
  it('announces progress, completion and failures', () => {
    const { result, rerender, announce } = setup();
    expect(result.current.tiles).toEqual([]);

    engine.items = [item('a', { state: 'uploading' }), item('b')];
    rerender({ draftId: 'draft-1' });
    expect(announce).toHaveBeenLastCalledWith('Uploading 0 of 0 photos.');

    engine.items = [item('a', { state: 'failed' }), item('b')];
    rerender({ draftId: 'draft-1' });
    expect(announce).toHaveBeenLastCalledWith('1 photo failed. Use Retry.');

    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('does not announce "0 photos added." when the batch ended without an upload', () => {
    const { rerender, announce } = setup();
    engine.items = [item('a', { state: 'failed' }), item('b', { state: 'uploading' })];
    rerender({ draftId: 'draft-1' });
    announce.mockClear();

    engine.items = [item('a', { state: 'failed' })];
    rerender({ draftId: 'draft-1' });

    expect(announce).not.toHaveBeenCalledWith(expect.stringContaining('added'));
  });

  it('announces the number of added photos when a batch finished', async () => {
    engine.add.mockResolvedValue(['a', 'b']);
    const { result, rerender, announce } = setup();
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'a.jpg', { type: 'image/jpeg' }), new File(['x'], 'b.jpg')],
    });
    await act(async () => {
      result.current.inputs.onLibraryChange({ target: input } as never);
    });
    engine.items = [item('a', { state: 'uploading' }), item('b', { state: 'uploading' })];
    rerender({ draftId: 'draft-1' });
    expect(announce).toHaveBeenLastCalledWith('Uploading 0 of 2 photos.');

    act(() => {
      engine.emit({ itemId: 'a', draftId: 'draft-1', photo: photo('s1') });
      engine.emit({ itemId: 'b', draftId: 'draft-1', photo: photo('s2') });
    });
    engine.items = [];
    rerender({ draftId: 'draft-1' });

    expect(announce).toHaveBeenLastCalledWith('2 photos added.');
  });
});

describe('useCapturePhotos: removing photos', () => {
  it('removes a waiting photo through the engine', async () => {
    engine.items = [item('i1')];
    const { result } = setup();

    await act(async () => result.current.removeTile('i1'));

    expect(engine.remove).toHaveBeenCalledWith('i1');
    expect(mockDeletePhoto).not.toHaveBeenCalled();
  });

  it('ignores an unknown tile', async () => {
    const { result } = setup();

    await act(async () => result.current.removeTile('nope'));

    expect(engine.remove).not.toHaveBeenCalled();
    expect(mockDeletePhoto).not.toHaveBeenCalled();
  });

  it('deletes a server photo without a confirm and shows the Undo toast', async () => {
    mockDeletePhoto.mockResolvedValue({
      undo: { token: 'u_tok', expiresAt: '2026-10-19T10:00:30Z' },
    } as never);
    const { result } = setup({ initialPhotos: [photo('p1'), photo('p2', { sortOrder: 1 })] });

    await act(async () => result.current.removeTile('p1'));

    expect(mockDeletePhoto).toHaveBeenCalledWith('p1');
    expect(result.current.tiles.map((t) => t.key)).toEqual(['p2']);
    expect(mockShowUndoToast).toHaveBeenCalledTimes(1);
    expect(mockShowUndoToast.mock.calls[0]![0]).toMatchObject({
      message: expect.any(String),
      dedupeKey: 'photo-delete-p1',
    });
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('Undo restores the photo: undoChange, reload, then focus on the restored tile', async () => {
    mockDeletePhoto.mockResolvedValue({ undo: { token: 'u_tok', expiresAt: 'x' } } as never);
    mockGetPhotos.mockResolvedValue([photo('p1'), photo('p2', { sortOrder: 1 })]);
    const rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-tile-key', 'p1');
    const open = document.createElement('button');
    open.setAttribute('data-open-button', '');
    wrapper.appendChild(open);
    document.body.appendChild(wrapper);
    const { result } = setup({ initialPhotos: [photo('p1'), photo('p2', { sortOrder: 1 })] });
    await act(async () => result.current.removeTile('p1'));
    const options = mockShowUndoToast.mock.calls[0]![0];

    await act(async () => options.onUndo());

    expect(mockUndoChange).toHaveBeenCalledWith('u_tok');
    expect(mockGetPhotos).toHaveBeenCalledWith('diary_entry', 'draft-1');
    expect(result.current.tiles.map((t) => t.key)).toEqual(['p1', 'p2']);
    expect(document.activeElement).toBe(open);
    expect(options.focusFallback?.()).toBe(result.current.inputs.chooseButtonRef.current);
    rafSpy.mockRestore();
    wrapper.remove();
  });

  it('Undo keeps the strip when the reload fails', async () => {
    mockDeletePhoto.mockResolvedValue({ undo: { token: 'u_tok', expiresAt: 'x' } } as never);
    mockGetPhotos.mockRejectedValue(new Error('down'));
    const { result } = setup({ initialPhotos: [photo('p1'), photo('p2', { sortOrder: 1 })] });
    await act(async () => result.current.removeTile('p1'));

    await act(async () => mockShowUndoToast.mock.calls[0]![0].onUndo());

    expect(result.current.tiles.map((t) => t.key)).toEqual(['p2']);
  });

  it('shows no Undo toast when the delete carries no token', async () => {
    mockDeletePhoto.mockResolvedValue(undefined as never);
    const { result } = setup({ initialPhotos: [photo('p1')] });

    await act(async () => result.current.removeTile('p1'));

    expect(result.current.tiles).toEqual([]);
    expect(mockShowUndoToast).not.toHaveBeenCalled();
  });

  it('shows the translated server error and keeps the tile when the delete fails', async () => {
    mockDeletePhoto.mockRejectedValue(
      new ApiClientError(403, { code: 'IMMUTABLE_ENTRY', message: 'locked' }),
    );
    const { result } = setup({ initialPhotos: [photo('p1')] });

    await act(async () => result.current.removeTile('p1'));

    expect(mockShowToast).toHaveBeenCalledWith('error', expect.any(String));
    expect(result.current.tiles).toHaveLength(1);
  });

  it('shows the generic message for a non-API failure', async () => {
    mockDeletePhoto.mockRejectedValue(new Error('network'));
    const { result } = setup({ initialPhotos: [photo('p1')] });

    await act(async () => result.current.removeTile('p1'));

    expect(mockShowToast).toHaveBeenCalledWith('error', "Couldn't remove the photo.");
  });

  it('retry asks the engine to retry the draft, and does nothing without one', () => {
    const withDraft = setup();
    withDraft.result.current.retry();
    expect(engine.retry).toHaveBeenCalledWith('draft-1');

    engine.retry.mockClear();
    const without = setup({ draftId: null });
    without.draftRef.current = null;
    without.result.current.retry();
    expect(engine.retry).not.toHaveBeenCalled();
  });
});

describe('useCapturePhotos: photo sheet, annotation and camera', () => {
  it('has no sheet until a tile is opened, then describes the photo', () => {
    const { result } = setup({
      initialPhotos: [photo('p1', { areaId: 'kitchen', caption: 'Crack' })],
    });
    expect(result.current.sheet.props).toBeNull();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    act(() => result.current.openTile('p1'));

    expect(result.current.sheet.props).toMatchObject({
      open: true,
      index: 0,
      total: 1,
      photo: { key: 'p1', areaId: 'kitchen', caption: 'Crack', uploaded: true },
    });
    expect(result.current.sheet.returnFocusRef.current).toBe(opener);
    opener.remove();
  });

  it('describes a waiting photo as not uploaded, with its preview', () => {
    engine.items = [item('i1', { caption: 'Draft caption' })];
    const { result } = setup();

    act(() => result.current.openTile('i1'));

    expect(result.current.sheet.props?.photo).toMatchObject({
      uploaded: false,
      previewUrl: 'blob:i1',
      caption: 'Draft caption',
    });
  });

  it('moves between photos and closes', () => {
    const { result } = setup({
      initialPhotos: [photo('p1'), photo('p2', { sortOrder: 1 }), photo('p3', { sortOrder: 2 })],
    });
    act(() => result.current.openTile('p1'));

    act(() => result.current.sheet.props?.onPrevious());
    expect(result.current.sheet.props?.photo.key).toBe('p1');
    act(() => result.current.sheet.props?.onNext());
    act(() => result.current.sheet.props?.onNext());
    act(() => result.current.sheet.props?.onNext());
    expect(result.current.sheet.props?.photo.key).toBe('p3');
    act(() => result.current.sheet.props?.onClose());
    expect(result.current.sheet.props).toBeNull();
  });

  it('tags one photo from the sheet as "hand"; clearing a tag has no source', async () => {
    engine.items = [item('i1')];
    const { result } = setup({ initialPhotos: [photo('p1')] });
    act(() => result.current.openTile('i1'));

    await act(async () => result.current.sheet.props?.onAreaChange('bath'));
    expect(engine.updateTags).toHaveBeenCalledWith('i1', { areaId: 'bath', areaSource: 'hand' });

    await act(async () => result.current.sheet.props?.onOrientationChange(null));
    expect(engine.updateTags).toHaveBeenCalledWith('i1', {
      orientationId: null,
      orientationSource: null,
    });
  });

  it('announces when tagging one photo from the sheet fails', async () => {
    mockUpdatePhoto.mockRejectedValue(new Error('down'));
    const { result, announce } = setup({ initialPhotos: [photo('p1')] });
    act(() => result.current.openTile('p1'));

    await act(async () => result.current.sheet.props?.onAreaChange('bath'));

    expect(announce).toHaveBeenCalledWith("Couldn't tag 1 photo. Try again.");
  });

  it('commits a caption: waiting photo through the engine, server photo through the API', async () => {
    engine.items = [item('i1')];
    const { result } = setup({ initialPhotos: [photo('p1', { caption: 'Old' })] });

    act(() => result.current.openTile('i1'));
    act(() => result.current.sheet.props?.onCaptionCommit('Fresh'));
    expect(engine.updateTags).toHaveBeenCalledWith('i1', { caption: 'Fresh' });

    act(() => result.current.openTile('p1'));
    await act(async () => result.current.sheet.props?.onCaptionCommit('Old'));
    expect(mockUpdatePhoto).not.toHaveBeenCalled();

    await act(async () => result.current.sheet.props?.onCaptionCommit('New'));
    expect(mockUpdatePhoto).toHaveBeenCalledWith('p1', { caption: 'New' });
    expect(result.current.sheet.props?.photo.caption).toBe('New');
  });

  it('announces a failed caption save', async () => {
    mockUpdatePhoto.mockRejectedValue(new Error('down'));
    const { result, announce } = setup({ initialPhotos: [photo('p1')] });
    act(() => result.current.openTile('p1'));

    await act(async () => result.current.sheet.props?.onCaptionCommit('New'));

    expect(announce).toHaveBeenCalledWith("Couldn't tag 1 photo. Try again.");
  });

  it('removes from the sheet and closes it', async () => {
    mockDeletePhoto.mockResolvedValue(undefined as never);
    const { result } = setup({ initialPhotos: [photo('p1')] });
    act(() => result.current.openTile('p1'));

    await act(async () => result.current.sheet.onRemove());

    expect(mockDeletePhoto).toHaveBeenCalledWith('p1');
    expect(result.current.sheet.props).toBeNull();
  });

  it('onRemove with no sheet open only closes', async () => {
    const { result } = setup();

    await act(async () => result.current.sheet.onRemove());

    expect(mockDeletePhoto).not.toHaveBeenCalled();
  });

  it('annotates a server photo and replaces it with the saved version', () => {
    const { result } = setup({ initialPhotos: [photo('p1')] });
    act(() => result.current.openTile('p1'));
    expect(result.current.annotate.photo).toBeNull();

    act(() => result.current.sheet.onAnnotate());
    expect(result.current.annotate.photo?.id).toBe('p1');

    act(() =>
      result.current.annotate.onSaved(photo('p1', { annotatedAt: '2026-10-19T11:00:00.000Z' })),
    );
    expect(result.current.annotate.photo).toBeNull();
    expect(result.current.tiles[0]!.annotated).toBe(true);
  });

  it('does not annotate a waiting photo, and closing clears the dialog', () => {
    engine.items = [item('i1')];
    const { result } = setup({ initialPhotos: [photo('p1')] });
    act(() => result.current.openTile('i1'));
    act(() => result.current.sheet.onAnnotate());
    expect(result.current.annotate.photo).toBeNull();

    act(() => result.current.openTile('p1'));
    act(() => result.current.sheet.onAnnotate());
    act(() => result.current.annotate.onClose());
    expect(result.current.annotate.photo).toBeNull();
  });

  it('removes the last shot of this camera session', async () => {
    engine.add.mockResolvedValueOnce(['s1']).mockResolvedValueOnce(['s2']);
    engine.items = [item('s1'), item('s2', { createdAt: '2026-10-19T10:01:00.000Z' })];
    const { result } = setup();
    act(() => result.current.inputs.takePhotos());
    await act(async () => result.current.camera.onShot(Promise.resolve(new File(['x'], 's1.jpg'))));
    await act(async () => result.current.camera.onShot(Promise.resolve(new File(['x'], 's2.jpg'))));
    expect(result.current.camera.shotCount).toBe(2);
    expect(result.current.camera.lastShotUrl).toBe('blob:s2');

    await act(async () => result.current.camera.onRemoveLast());

    expect(engine.remove).toHaveBeenCalledWith('s2');
    expect(result.current.camera.shotCount).toBe(1);
  });

  it('remove-last does nothing without a shot', () => {
    const { result } = setup();

    act(() => result.current.camera.onRemoveLast());

    expect(engine.remove).not.toHaveBeenCalled();
  });
});

describe('useCapturePhotos: camera shots saving', () => {
  const file = (name = 'a.jpg') => new File(['x'], name, { type: 'image/jpeg' });

  /** A frame the test resolves by hand, so the press and the encoding can be told apart. */
  function deferredFrame() {
    let resolve!: (f: File) => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<File>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('counts a shot as saving from the press (synchronously), before it is even encoded', () => {
    const { result } = setup();
    const frame = deferredFrame();

    act(() => result.current.camera.onShot(frame.promise));

    expect(result.current.camera.savingCount).toBe(1);
    expect(result.current.savingCount).toBe(1);
    expect(result.current.camera.shotCount).toBe(0);
    expect(engine.add).not.toHaveBeenCalled();
  });

  it('moves a shot from saving to stored in one render, never counting it twice', async () => {
    engine.add.mockResolvedValue(['s1']);
    const sums: number[] = [];
    const { result } = setup({
      onRender: (v) => sums.push(v.camera.savingCount + v.camera.shotCount),
    });
    const frame = deferredFrame();
    act(() => result.current.camera.onShot(frame.promise));

    await act(async () => frame.resolve(file('shot.jpg')));

    expect(result.current.camera.savingCount).toBe(0);
    expect(result.current.savingCount).toBe(0);
    expect(result.current.camera.shotCount).toBe(1);
    expect(Math.max(...sums)).toBe(1);
  });

  it('a rejected frame releases the saving count and adds nothing', async () => {
    const { result } = setup();
    const frame = deferredFrame();
    act(() => result.current.camera.onShot(frame.promise));
    expect(result.current.camera.savingCount).toBe(1);

    await act(async () => frame.reject(new Error('no frame')));

    expect(result.current.camera.savingCount).toBe(0);
    expect(result.current.camera.shotCount).toBe(0);
    expect(engine.add).not.toHaveBeenCalled();
  });

  it('a failing store releases the saving count without recording a shot', async () => {
    engine.add.mockRejectedValueOnce(new Error('disk full'));
    const { result } = setup();

    await act(async () => result.current.camera.onShot(Promise.resolve(file('shot.jpg'))));

    expect(result.current.camera.savingCount).toBe(0);
    expect(result.current.camera.shotCount).toBe(0);
  });

  it('a hung write keeps the shot saving', async () => {
    engine.add.mockImplementationOnce(() => new Promise(() => undefined));
    const { result } = setup();

    await act(async () => result.current.camera.onShot(Promise.resolve(file('shot.jpg'))));

    expect(result.current.camera.savingCount).toBe(1);
    expect(result.current.camera.shotCount).toBe(0);
  });

  it('releases exactly once per press: a stored shot does not eat another one saving count', async () => {
    engine.add.mockResolvedValueOnce(['s1']);
    const { result } = setup();
    const first = deferredFrame();
    const second = deferredFrame();
    act(() => result.current.camera.onShot(first.promise));
    act(() => result.current.camera.onShot(second.promise));
    expect(result.current.camera.savingCount).toBe(2);

    await act(async () => first.resolve(file('a.jpg')));

    expect(result.current.camera.savingCount).toBe(1);
    expect(result.current.camera.shotCount).toBe(1);
  });

  it('tags the shot with the chips as they were at the shutter press', async () => {
    engine.add.mockResolvedValue(['s1']);
    const { result } = setup();
    act(() => result.current.chips.onAreaChange('kitchen'));
    const frame = deferredFrame();
    act(() => result.current.camera.onShot(frame.promise));

    // The user taps another chip while the frame is still being encoded.
    act(() => result.current.chips.onAreaChange('bath'));
    await act(async () => frame.resolve(file('shot.jpg')));

    expect(engine.add.mock.calls[0]![1]).toMatchObject({
      source: 'camera',
      tags: { areaId: 'kitchen', areaSource: 'live' },
    });
  });

  it('a library add still reads the current chips', async () => {
    const { result } = setup();
    act(() => result.current.chips.onAreaChange('kitchen'));
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file()] });
    await act(async () => {
      result.current.inputs.onLibraryChange({ target: input } as never);
    });
    expect(engine.add.mock.calls[0]![1]).toMatchObject({
      source: 'library',
      tags: { areaId: 'kitchen', areaSource: 'added' },
    });
  });

  it('the first shot before the draft exists is queued and creates the draft', async () => {
    engine.add.mockResolvedValue(['n1']);
    const { result, ensureDraft, nullItemIdsRef } = setup({ draftId: null });

    await act(async () => result.current.camera.onShot(Promise.resolve(file('shot.jpg'))));

    expect(engine.add.mock.calls[0]![1].draftId).toBeNull();
    expect(nullItemIdsRef.current).toEqual(['n1']);
    expect(ensureDraft).toHaveBeenCalledTimes(1);
    expect(result.current.camera.savingCount).toBe(0);
  });

  it('a shot whose draft appeared during the write is assigned to it', async () => {
    const { result, draftRef, ensureDraft } = setup({ draftId: null });
    engine.add.mockImplementationOnce(async () => {
      draftRef.current = 'draft-fast';
      return ['n1'];
    });

    await act(async () => result.current.camera.onShot(Promise.resolve(file('shot.jpg'))));

    expect(engine.assignDraft).toHaveBeenCalledWith(['n1'], 'draft-fast');
    expect(ensureDraft).not.toHaveBeenCalled();
  });

  it('a shot taken with a draft already in place needs no assign or draft creation', async () => {
    engine.add.mockResolvedValue(['s1']);
    const { result, ensureDraft } = setup();

    await act(async () => result.current.camera.onShot(Promise.resolve(file('shot.jpg'))));

    expect(engine.add.mock.calls[0]![1].draftId).toBe('draft-1');
    expect(engine.assignDraft).not.toHaveBeenCalled();
    expect(ensureDraft).not.toHaveBeenCalled();
  });

  it('exposes the draft pending count as waitingCount (camera) and pendingCount', () => {
    engine.items = [item('i1'), item('i2'), item('other', { draftId: 'draft-2' })];
    const { result } = setup();

    expect(result.current.camera.waitingCount).toBe(2);
    expect(result.current.pendingCount).toBe(2);
  });

  it('waitingCount is 0 with nothing pending', () => {
    const { result } = setup();
    expect(result.current.camera.waitingCount).toBe(0);
  });
});

describe('useCapturePhotos: tags, sheet and device edge cases', () => {
  it('a camera shot keeps its place in the camera session when its upload finishes', async () => {
    engine.add.mockResolvedValueOnce(['s1']).mockResolvedValueOnce(['s2']);
    engine.items = [item('s1'), item('s2', { createdAt: '2026-10-19T10:01:00.000Z' })];
    const { result } = setup();
    await act(async () => result.current.camera.onShot(Promise.resolve(new File(['x'], '1.jpg'))));
    await act(async () => result.current.camera.onShot(Promise.resolve(new File(['x'], '2.jpg'))));
    expect(result.current.camera.shotCount).toBe(2);

    act(() => {
      engine.emit({ itemId: 's1', draftId: 'draft-1', photo: photo('server-1') });
    });

    // Both shots are still counted; the uploaded one is now addressed by its server id.
    expect(result.current.camera.shotCount).toBe(2);
    await act(async () => result.current.camera.onRemoveLast());
    expect(engine.remove).toHaveBeenCalledWith('s2');
    expect(result.current.camera.shotCount).toBe(1);
  });

  it('a server photo with an orientation shows its name, an unknown orientation shows none', () => {
    const { result } = setup({
      initialPhotos: [
        photo('p1', { orientationId: 'north' }),
        photo('p2', { sortOrder: 1, orientationId: 'ghost' }),
      ],
    });

    expect(result.current.tiles[0]).toMatchObject({ orientationLabel: 'North' });
    expect(result.current.tiles[1]).toMatchObject({ orientationLabel: null });
  });

  it('ignores a camera-app input without a file list', async () => {
    const { result } = setup();
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: null });

    await act(async () => {
      result.current.inputs.onCameraInputChange({ target: input } as never);
    });

    expect(engine.add).not.toHaveBeenCalled();
  });

  it('a device list that arrives after unmount changes nothing', async () => {
    let resolveDevices!: (devices: unknown[]) => void;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { enumerateDevices: () => new Promise((res) => (resolveDevices = res)) },
    });
    const { result, unmount } = setup();
    unmount();

    await act(async () => resolveDevices([{ kind: 'videoinput' }]));

    expect(result.current.inputs.showTakePhotos).toBe(false);
    expect(result.current.inputs.cameraKnown).toBe(false);
  });

  it('a failing device list that arrives after unmount changes nothing', async () => {
    let rejectDevices!: (error: Error) => void;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { enumerateDevices: () => new Promise((_, rej) => (rejectDevices = rej)) },
    });
    const { result, unmount } = setup();
    unmount();

    await act(async () => rejectDevices(new Error('nope')));

    expect(result.current.inputs.cameraKnown).toBe(false);
  });

  it('Undo without a draft id skips the reload', async () => {
    mockDeletePhoto.mockResolvedValue({ undo: { token: 'u_tok', expiresAt: 'x' } } as never);
    const { result } = setup({ draftId: null, initialPhotos: [photo('p1')] });
    await act(async () => result.current.removeTile('p1'));

    await act(async () => mockShowUndoToast.mock.calls[0]![0].onUndo());

    expect(mockUndoChange).toHaveBeenCalledWith('u_tok');
    expect(mockGetPhotos).not.toHaveBeenCalled();
  });

  it('removing a photo that is not open in the sheet leaves the sheet open', async () => {
    mockDeletePhoto.mockResolvedValue(undefined as never);
    const { result } = setup({ initialPhotos: [photo('p1'), photo('p2', { sortOrder: 1 })] });
    act(() => result.current.openTile('p1'));

    await act(async () => result.current.removeTile('p2'));

    expect(result.current.sheet.props?.photo.key).toBe('p1');
    expect(result.current.tiles.map((t) => t.key)).toEqual(['p1']);
  });

  it('moves back to the previous photo from the sheet', () => {
    const { result } = setup({
      initialPhotos: [photo('p1'), photo('p2', { sortOrder: 1 })],
    });
    act(() => result.current.openTile('p2'));

    act(() => result.current.sheet.props?.onPrevious());

    expect(result.current.sheet.props?.photo.key).toBe('p1');
  });

  it('a saved caption replaces only that photo, leaving the others untouched', async () => {
    const { result } = setup({
      initialPhotos: [photo('p1'), photo('p2', { sortOrder: 1, caption: 'Keep' })],
    });
    act(() => result.current.openTile('p1'));

    await act(async () => result.current.sheet.props?.onCaptionCommit('New'));

    act(() => result.current.openTile('p2'));
    expect(result.current.sheet.props?.photo.caption).toBe('Keep');
    act(() => result.current.openTile('p1'));
    expect(result.current.sheet.props?.photo.caption).toBe('New');
  });

  it('an annotated photo replaces only itself in the strip', () => {
    const { result } = setup({
      initialPhotos: [photo('p1'), photo('p2', { sortOrder: 1 })],
    });

    act(() =>
      result.current.annotate.onSaved(photo('p1', { annotatedAt: '2026-10-19T11:00:00.000Z' })),
    );

    expect(result.current.tiles.map((t) => t.annotated)).toEqual([true, false]);
  });

  it('a tag change on one photo leaves the others untouched', async () => {
    const { result } = setup({
      initialPhotos: [photo('p1'), photo('p2', { sortOrder: 1, areaId: 'bath' })],
    });
    act(() => result.current.openTile('p1'));

    await act(async () => result.current.sheet.props?.onAreaChange('kitchen'));

    expect(result.current.tiles.map((t) => t.areaLabel)).toEqual(['Kitchen', 'Bathroom']);
  });
});

describe('useCapturePhotos: orphans', () => {
  it('Continue creates the draft and adopts the orphans', async () => {
    engine.orphans = [item('o1', { draftId: null })];
    const { result, ensureDraft } = setup({ draftId: null });

    await act(async () => result.current.continueOrphans());

    expect(ensureDraft).toHaveBeenCalled();
    expect(engine.adoptOrphans).toHaveBeenCalledWith('draft-new');
  });

  it('Continue adopts nothing when the draft could not be created', async () => {
    const { result, ensureDraft } = setup({ draftId: null });
    ensureDraft.mockResolvedValueOnce(null as never);

    await act(async () => result.current.continueOrphans());

    expect(engine.adoptOrphans).not.toHaveBeenCalled();
  });

  it('Discard drops the orphans without asking', async () => {
    const { result } = setup({ draftId: null });

    await act(async () => result.current.discardOrphans());

    expect(engine.discardOrphans).toHaveBeenCalledTimes(1);
  });
});

describe('useCapturePhotos: summary values', () => {
  it('reports the area most photos carry, when there is one', () => {
    const { result } = setup({
      initialPhotos: [
        photo('p1', { areaId: 'bath' }),
        photo('p2', { areaId: 'kitchen', sortOrder: 1 }),
        photo('p3', { areaId: 'kitchen', sortOrder: 2 }),
        photo('p4', { sortOrder: 3 }),
      ],
    });

    expect(result.current.mostCommonAreaId).toBe('kitchen');
  });

  it('has no most common area without tagged photos', () => {
    const { result } = setup({ initialPhotos: [photo('p1')] });

    expect(result.current.mostCommonAreaId).toBeNull();
    expect(result.current.hasMemoryOnlyItems).toBe(false);
  });
});

describe('useCapturePhotos: cameraKnown and openLiveCamera (#2222)', () => {
  function setDevices(value: unknown) {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value });
  }

  describe('cameraKnown', () => {
    it('is true at once on a coarse pointer, before the device list resolves', () => {
      media.set('(pointer: coarse)', true);
      setDevices({ enumerateDevices: () => new Promise(() => {}) });
      const { result } = setup();
      expect(result.current.inputs.cameraKnown).toBe(true);
    });

    it('is false on a fine pointer until the device list resolves', async () => {
      let resolve!: (value: unknown[]) => void;
      setDevices({
        enumerateDevices: () =>
          new Promise<unknown[]>((res) => {
            resolve = res;
          }),
      });
      const { result } = setup();
      expect(result.current.inputs.cameraKnown).toBe(false);
      await act(async () => {
        resolve([{ kind: 'videoinput' }]);
      });
      expect(result.current.inputs.cameraKnown).toBe(true);
    });

    it('is true after the device list rejects', async () => {
      setDevices({ enumerateDevices: () => Promise.reject(new Error('blocked')) });
      const { result } = setup();
      await waitFor(() => expect(result.current.inputs.cameraKnown).toBe(true));
      expect(result.current.inputs.showTakePhotos).toBe(false);
    });

    it('is true at once without enumerateDevices', () => {
      setDevices(undefined);
      expect(setup().result.current.inputs.cameraKnown).toBe(true);
      setDevices({});
      expect(setup().result.current.inputs.cameraKnown).toBe(true);
    });
  });

  describe('openLiveCamera', () => {
    it('opens the camera and returns true when supported, not denied and Take photos is shown', () => {
      media.set('(pointer: coarse)', true);
      const { result } = setup();
      let opened = false;
      act(() => {
        opened = result.current.inputs.openLiveCamera();
      });
      expect(opened).toBe(true);
      expect(result.current.camera.open).toBe(true);
    });

    it('opens on a fine pointer once a video input is known', async () => {
      setDevices({ enumerateDevices: async () => [{ kind: 'videoinput' }] });
      const { result } = setup();
      await waitFor(() => expect(result.current.inputs.showTakePhotos).toBe(true));
      let opened = false;
      act(() => {
        opened = result.current.inputs.openLiveCamera();
      });
      expect(opened).toBe(true);
      expect(result.current.camera.open).toBe(true);
    });

    it('returns false and stays closed when the live camera is unsupported', () => {
      media.set('(pointer: coarse)', true);
      mockLiveSupported.mockReturnValue(false);
      const { result } = setup();
      let opened = true;
      act(() => {
        opened = result.current.inputs.openLiveCamera();
      });
      expect(opened).toBe(false);
      expect(result.current.camera.open).toBe(false);
    });

    it('returns false and stays closed when the camera was denied this session', () => {
      media.set('(pointer: coarse)', true);
      mockCameraDenied.mockReturnValue(true);
      const { result } = setup();
      let opened = true;
      act(() => {
        opened = result.current.inputs.openLiveCamera();
      });
      expect(opened).toBe(false);
      expect(result.current.camera.open).toBe(false);
    });

    it('returns false on a fine pointer without a video input', async () => {
      setDevices({ enumerateDevices: async () => [{ kind: 'audioinput' }] });
      const { result } = setup();
      await waitFor(() => expect(result.current.inputs.cameraKnown).toBe(true));
      let opened = true;
      act(() => {
        opened = result.current.inputs.openLiveCamera();
      });
      expect(opened).toBe(false);
      expect(result.current.camera.open).toBe(false);
    });
  });
});
