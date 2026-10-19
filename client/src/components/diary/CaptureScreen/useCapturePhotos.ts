import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AreaResponse,
  DeletePhotoResponse,
  OrientationResponse,
  Photo,
} from '@cornerstone/shared';
import { useCaptureUploads } from '../../../capture/captureUploadsContext.js';
import type {
  CaptureItem,
  CaptureSource,
  CaptureTags,
  CaptureUploadedEvent,
  TagProvenance,
} from '../../../capture/captureTypes.js';
import { pushRecentTag, readRecentTags } from '../../../capture/recentTags.js';
import { readStickyTags, writeStickyTags } from '../../../capture/stickyTags.js';
import { useMediaQuery } from '../../../hooks/useMediaQuery.js';
import { ApiClientError } from '../../../lib/apiClient.js';
import { translateApiError } from '../../../lib/errorTranslation.js';
import { deletePhoto, getPhotosForEntity, updatePhoto } from '../../../lib/photoApi.js';
import { undoChange } from '../../../lib/undoApi.js';
import { useToast } from '../../Toast/ToastContext.js';
import { isCameraDeniedThisSession, isLiveCameraSupported } from '../../RapidCamera/RapidCamera.js';
import type { PhotoStripTile } from '../../photos/PhotoStrip/PhotoStrip.js';
import type { PhotoTagSheetProps } from '../../photos/PhotoStrip/PhotoTagSheet.js';

/** The orientation chip row: an orientation id, nothing, or "No orientation". */
export type OrientationChoice = string | null | 'none';

interface StickyChips {
  areaId: string | null;
  orientation: OrientationChoice;
}

interface Provenance {
  area: TagProvenance | null;
  orientation: TagProvenance | null;
}

export interface UseCapturePhotosOptions {
  /** Id of the draft, null while the entry has not been written yet. */
  draftId: string | null;
  /** Reads the draft id right now (it can change between renders). */
  getDraftId: () => string | null;
  initialPhotos: readonly Photo[];
  prefillAreaId: string | null;
  areas: readonly AreaResponse[];
  areasReady: boolean;
  orientations: readonly OrientationResponse[];
  userId: string;
  ensureDraft: () => Promise<string | null>;
  /** Ids of this session's items that were added before the draft existed. */
  nullItemIdsRef: MutableRefObject<string[]>;
  announce: (message: string) => void;
}

const NO_PROVENANCE: Provenance = { area: null, orientation: null };

function isDeletePhotoResponse(value: unknown): value is DeletePhotoResponse {
  return typeof value === 'object' && value !== null && 'undo' in value;
}

function byOrder(a: Photo, b: Photo): number {
  return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
}

/** "Kitchen", or "Kitchen · Ground floor" when two areas share the name. */
export function areaLabelOf(areaId: string | null, areas: readonly AreaResponse[]): string | null {
  if (!areaId) return null;
  const area = areas.find((candidate) => candidate.id === areaId);
  if (!area) return null;
  const ambiguous = areas.some((other) => other.id !== area.id && other.name === area.name);
  const parent = area.parentId ? areas.find((other) => other.id === area.parentId) : undefined;
  return ambiguous && parent ? `${area.name} · ${parent.name}` : area.name;
}

/**
 * Photos of the capture screen: the strip (server photos and waiting uploads), sticky Area and
 * Orientation chips with retroactive tagging (Decision 13), selection, the photo sheet,
 * annotation, removal with Undo, the camera and the file inputs.
 */
export function useCapturePhotos({
  draftId,
  getDraftId,
  initialPhotos,
  prefillAreaId,
  areas,
  areasReady,
  orientations,
  userId,
  ensureDraft,
  nullItemIdsRef,
  announce,
}: UseCapturePhotosOptions) {
  const { t } = useTranslation('diary');
  const { t: tErrors } = useTranslation('errors');
  const { showToast, showUndoToast } = useToast();
  const api = useCaptureUploads();

  const [serverPhotos, setServerPhotos] = useState<Photo[]>(() => [...initialPhotos].sort(byOrder));
  const [order, setOrder] = useState<string[]>(() =>
    [...initialPhotos].sort(byOrder).map((photo) => photo.id),
  );
  const [provenance, setProvenance] = useState<Record<string, Provenance>>({});
  const [sticky, setSticky] = useState<StickyChips>(() => {
    const saved = draftId ? readStickyTags(draftId) : null;
    return saved
      ? { areaId: saved.areaId, orientation: saved.orientationId }
      : { areaId: prefillAreaId, orientation: null };
  });
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const [annotateKey, setAnnotateKey] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [shotKeys, setShotKeys] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [recentVersion, setRecentVersion] = useState(0);
  const [hasVideoInput, setHasVideoInput] = useState(false);
  const [devicesChecked, setDevicesChecked] = useState(
    () => typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices,
  );
  const [batch, setBatch] = useState({ total: 0, done: 0 });
  const [seen, setSeen] = useState({ inFlight: 0, failed: 0 });

  const libraryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const chooseButtonRef = useRef<HTMLButtonElement>(null);
  const takeButtonRef = useRef<HTMLButtonElement>(null);
  const sheetOpenerRef = useRef<HTMLElement | null>(null);
  const annotateOpenerRef = useRef<HTMLElement | null>(null);

  // ── The strip ───────────────────────────────────────────────────────────────────────────────

  const orphanIds = useMemo(() => new Set(api.orphans.map((item) => item.id)), [api.orphans]);
  const pendingItems = useMemo(
    () =>
      api.items.filter((item) =>
        draftId ? item.draftId === draftId : item.draftId === null && !orphanIds.has(item.id),
      ),
    [api.items, draftId, orphanIds],
  );
  const itemsRef = useRef<readonly CaptureItem[]>(api.items);
  useEffect(() => {
    itemsRef.current = api.items;
  }, [api.items]);

  const stickyRef = useRef(sticky);
  const effectiveAreaId =
    areasReady && sticky.areaId && !areas.some((area) => area.id === sticky.areaId)
      ? null
      : sticky.areaId;
  useEffect(() => {
    stickyRef.current = { areaId: effectiveAreaId, orientation: sticky.orientation };
  }, [effectiveAreaId, sticky.orientation]);

  const serverById = useMemo(
    () => new Map(serverPhotos.map((photo) => [photo.id, photo])),
    [serverPhotos],
  );
  const pendingById = useMemo(
    () => new Map(pendingItems.map((item) => [item.id, item])),
    [pendingItems],
  );

  /** Stable order: the order the tiles were added in, then anything not yet seen. */
  const orderedKeys = useMemo(() => {
    const present = (key: string) => serverById.has(key) || pendingById.has(key);
    const known = order.filter(present);
    const knownSet = new Set(known);
    const unseenServer = serverPhotos.filter((photo) => !knownSet.has(photo.id)).map((p) => p.id);
    const unseenPending = pendingItems
      .filter((item) => !knownSet.has(item.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((item) => item.id);
    return [...known, ...unseenServer, ...unseenPending];
  }, [order, pendingById, pendingItems, serverById, serverPhotos]);

  interface TileData {
    key: string;
    kind: 'server' | 'pending';
    photo: Photo | null;
    item: CaptureItem | null;
    areaId: string | null;
    orientationId: string | null;
    areaSource: TagProvenance | null;
    orientationSource: TagProvenance | null;
  }

  const tileData = useMemo<TileData[]>(() => {
    const rows: TileData[] = [];
    for (const key of orderedKeys) {
      const photo = serverById.get(key);
      if (photo) {
        const prov = provenance[key] ?? NO_PROVENANCE;
        rows.push({
          key,
          kind: 'server',
          photo,
          item: null,
          areaId: photo.areaId,
          orientationId: photo.orientationId,
          areaSource: prov.area ?? (photo.areaId ? 'hand' : null),
          orientationSource: prov.orientation ?? (photo.orientationId ? 'hand' : null),
        });
        continue;
      }
      const item = pendingById.get(key);
      if (item) {
        rows.push({
          key,
          kind: 'pending',
          photo: null,
          item,
          areaId: item.areaId,
          orientationId: item.orientationId,
          areaSource: item.areaSource,
          orientationSource: item.orientationSource,
        });
      }
    }
    return rows;
  }, [orderedKeys, pendingById, provenance, serverById]);

  const orientationLabelOf = useCallback(
    (orientationId: string | null) =>
      orientationId
        ? (orientations.find((orientation) => orientation.id === orientationId)?.name ?? null)
        : null,
    [orientations],
  );

  const tiles = useMemo<PhotoStripTile[]>(
    () =>
      tileData.map((row) => ({
        key: row.key,
        kind: row.kind,
        thumbnailUrl: row.photo ? row.photo.thumbnailUrl : (row.item?.previewUrl ?? ''),
        state: row.item ? row.item.state : 'uploaded',
        progress: row.item?.progress ?? null,
        areaLabel: areaLabelOf(row.areaId, areas),
        orientationLabel: orientationLabelOf(row.orientationId),
        annotated: Boolean(row.photo?.annotatedAt),
        notPersisted: row.item ? !row.item.persisted : false,
      })),
    [areas, orientationLabelOf, tileData],
  );

  const tileKeys = useMemo(() => new Set(tileData.map((row) => row.key)), [tileData]);
  const selectedKeys = useMemo(
    () => new Set([...selected].filter((key) => tileKeys.has(key))),
    [selected, tileKeys],
  );

  // ── Uploads that finished ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onUploaded = (event: CaptureUploadedEvent) => {
      if (event.draftId !== getDraftId()) return;
      const item = itemsRef.current.find((candidate) => candidate.id === event.itemId);
      setServerPhotos((prev) => [...prev.filter((p) => p.id !== event.photo.id), event.photo]);
      setOrder((prev) =>
        prev.includes(event.itemId)
          ? prev.map((key) => (key === event.itemId ? event.photo.id : key))
          : [...prev, event.photo.id],
      );
      if (item) {
        setProvenance((prev) => ({
          ...prev,
          [event.photo.id]: { area: item.areaSource, orientation: item.orientationSource },
        }));
      }
      setShotKeys((prev) => prev.map((key) => (key === event.itemId ? event.photo.id : key)));
      setSelected((prev) => {
        if (!prev.has(event.itemId)) return prev;
        const next = new Set(prev);
        next.delete(event.itemId);
        next.add(event.photo.id);
        return next;
      });
      setBatch((prev) => ({ ...prev, done: prev.done + 1 }));
    };
    return api.subscribe(onUploaded);
  }, [api, getDraftId]);

  // Upload progress is announced when the counts change (state adjusted during render).
  const inFlight = pendingItems.filter(
    (item) => item.state === 'waiting' || item.state === 'uploading',
  ).length;
  const failedCount = pendingItems.filter(
    (item) => item.state === 'failed' || item.state === 'blocked',
  ).length;
  if (seen.inFlight !== inFlight || seen.failed !== failedCount) {
    setSeen({ inFlight, failed: failedCount });
    if (failedCount > seen.failed) {
      announce(t('capture.announce.failed', { count: failedCount }));
    } else if (inFlight > 0) {
      announce(t('capture.announce.uploading', { done: batch.done, total: batch.total }));
    } else if (seen.inFlight > 0 && batch.done > 0) {
      announce(t('capture.announce.added', { count: batch.done }));
    }
    if (inFlight === 0 && (batch.total > 0 || batch.done > 0)) setBatch({ total: 0, done: 0 });
  }

  // ── Sticky chips ────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!draftId) return;
    writeStickyTags(draftId, {
      areaId: effectiveAreaId,
      orientationId: sticky.orientation === 'none' ? null : sticky.orientation,
    });
  }, [draftId, effectiveAreaId, sticky.orientation]);

  const recentAreaIds = useMemo(() => {
    void recentVersion;
    return readRecentTags('area', userId, new Set(areas.map((area) => area.id)));
  }, [areas, recentVersion, userId]);
  const recentOrientationIds = useMemo(() => {
    void recentVersion;
    return readRecentTags('orientation', userId, new Set(orientations.map((o) => o.id)));
  }, [orientations, recentVersion, userId]);

  const applyToTile = useCallback(
    async (
      row: TileData,
      dimension: 'area' | 'orientation',
      value: string | null,
      source: TagProvenance | null,
    ): Promise<boolean> => {
      const idKey = dimension === 'area' ? 'areaId' : 'orientationId';
      const sourceKey = dimension === 'area' ? 'areaSource' : 'orientationSource';
      if (row.item) {
        api.updateTags(row.item.id, { [idKey]: value, [sourceKey]: source });
        return true;
      }
      if (!row.photo) return false;
      try {
        const updated = await updatePhoto(row.photo.id, { [idKey]: value });
        setServerPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        setProvenance((prev) => {
          const current = prev[updated.id] ?? NO_PROVENANCE;
          return { ...prev, [updated.id]: { ...current, [dimension]: source } };
        });
        return true;
      } catch {
        return false;
      }
    },
    [api],
  );

  /**
   * A chip was tapped. With a selection it applies to the selected photos only (provenance
   * "hand"); without one it re-tags photos that have no value or got theirs from a chip.
   */
  const changeChip = useCallback(
    async (dimension: 'area' | 'orientation', choice: OrientationChoice) => {
      const value = choice === 'none' ? null : choice;
      setSticky((prev) =>
        dimension === 'area' ? { ...prev, areaId: value } : { ...prev, orientation: choice },
      );
      if (value) {
        pushRecentTag(dimension, userId, value);
        setRecentVersion((v) => v + 1);
      }
      const hasSelection = selectedKeys.size > 0;
      const targets: { row: TileData; source: TagProvenance | null }[] = [];
      for (const row of tileData) {
        if (row.item?.state === 'blocked') continue;
        const currentValue = dimension === 'area' ? row.areaId : row.orientationId;
        const currentSource = dimension === 'area' ? row.areaSource : row.orientationSource;
        if (hasSelection) {
          if (selectedKeys.has(row.key)) targets.push({ row, source: 'hand' });
        } else if ((currentValue === null && currentSource === null) || currentSource === 'retro') {
          const source: TagProvenance | null = value === null && choice !== 'none' ? null : 'retro';
          targets.push({ row, source });
        }
      }
      if (hasSelection) setSelected(new Set());
      const results = await Promise.all(
        targets.map(({ row, source }) => applyToTile(row, dimension, value, source)),
      );
      const failures = results.filter((ok) => !ok).length;
      if (failures > 0) announce(t('capture.announce.tagFailed', { count: failures }));
    },
    [announce, applyToTile, selectedKeys, t, tileData, userId],
  );

  // ── Adding ──────────────────────────────────────────────────────────────────────────────────

  const addFiles = useCallback(
    async (files: readonly File[], source: CaptureSource) => {
      if (files.length === 0) return;
      const chips = stickyRef.current;
      const live = source === 'camera' ? 'live' : 'added';
      const tags: CaptureTags = {
        areaId: chips.areaId,
        orientationId: chips.orientation === 'none' ? null : chips.orientation,
        areaSource: chips.areaId ? live : null,
        orientationSource: chips.orientation !== null ? live : null,
        caption: null,
      };
      const startDraftId = getDraftId();
      setBatch((prev) => ({ ...prev, total: prev.total + files.length }));
      const ids = await api.add(files, { draftId: startDraftId, source, tags });
      setOrder((prev) => [...prev, ...ids]);
      if (source === 'camera') setShotKeys((prev) => [...prev, ...ids]);
      const nowDraftId = getDraftId();
      if (nowDraftId) {
        if (!startDraftId) api.assignDraft(ids, nowDraftId);
        return;
      }
      nullItemIdsRef.current = [...nullItemIdsRef.current, ...ids];
      await ensureDraft();
    },
    [api, ensureDraft, getDraftId, nullItemIdsRef],
  );

  const onLibraryChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void addFiles(files, 'library');
  };

  const onCameraInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void addFiles(files, 'cameraApp');
  };

  const dropHandlers = {
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      setDragActive(true);
    },
    onDragLeave: () => setDragActive(false),
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragActive(false);
      const files = Array.from(event.dataTransfer.files).filter((file) =>
        file.type.startsWith('image/'),
      );
      void addFiles(files, 'drop');
    },
  };

  const coarsePointer = useMediaQuery('(pointer: coarse)');
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return undefined;
    }
    let cancelled = false;
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        if (cancelled) return;
        setHasVideoInput(devices.some((device) => device.kind === 'videoinput'));
        setDevicesChecked(true);
      })
      .catch(() => {
        // Without a device list the button stays hidden on a fine pointer.
        if (!cancelled) setDevicesChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const showTakePhotos = coarsePointer || hasVideoInput;

  /** Opens the live viewfinder when it can be used; false when the caller must fall back. */
  const openLiveCamera = useCallback((): boolean => {
    if (!isLiveCameraSupported() || isCameraDeniedThisSession() || !showTakePhotos) return false;
    setShotKeys([]);
    setCameraOpen(true);
    return true;
  }, [showTakePhotos]);

  const takePhotos = () => {
    if (isLiveCameraSupported() && !isCameraDeniedThisSession()) {
      setShotKeys([]);
      setCameraOpen(true);
    } else cameraInputRef.current?.click();
  };

  // ── Selection ───────────────────────────────────────────────────────────────────────────────

  const toggleSelect = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const selectAll = () => setSelected(new Set(tileData.map((row) => row.key)));
  const clearSelection = () => setSelected(new Set());

  // ── Removing, retrying ──────────────────────────────────────────────────────────────────────

  const reloadServerPhotos = useCallback(async () => {
    const id = getDraftId();
    if (!id) return;
    try {
      const photos = await getPhotosForEntity('diary_entry', id);
      setServerPhotos([...photos].sort(byOrder));
    } catch {
      // The strip keeps what it shows.
    }
  }, [getDraftId]);

  const removeTile = useCallback(
    async (key: string) => {
      const item = pendingById.get(key);
      if (item) {
        api.remove(item.id);
        return;
      }
      const photo = serverById.get(key);
      if (!photo) return;
      try {
        const response: unknown = await deletePhoto(photo.id);
        setServerPhotos((prev) => prev.filter((p) => p.id !== photo.id));
        setSheetKey((current) => (current === key ? null : current));
        if (isDeletePhotoResponse(response)) {
          const token = response.undo.token;
          showUndoToast({
            message: t('photos:sheet.removed'),
            dedupeKey: `photo-delete-${photo.id}`,
            focusFallback: () => chooseButtonRef.current,
            onUndo: async () => {
              await undoChange(token);
              await reloadServerPhotos();
              window.requestAnimationFrame(() =>
                document
                  .querySelector<HTMLElement>(`[data-tile-key="${photo.id}"] [data-open-button]`)
                  ?.focus(),
              );
            },
          });
        }
      } catch (err) {
        showToast(
          'error',
          err instanceof ApiClientError
            ? translateApiError(err.error.code, tErrors)
            : t('capture.removeFailed'),
        );
      }
    },
    [api, pendingById, reloadServerPhotos, serverById, showToast, showUndoToast, t, tErrors],
  );

  const retry = () => {
    const id = getDraftId();
    if (id) api.retry(id);
  };

  // ── Photo sheet and annotation ──────────────────────────────────────────────────────────────

  const openTile = (key: string) => {
    sheetOpenerRef.current = document.activeElement as HTMLElement | null;
    setSheetKey(key);
  };

  const sheetIndex = sheetKey ? tileData.findIndex((row) => row.key === sheetKey) : -1;
  const sheetRow = sheetIndex >= 0 ? tileData[sheetIndex] : null;

  const tagOne = useCallback(
    (row: TileData, dimension: 'area' | 'orientation', value: string | null) => {
      void applyToTile(row, dimension, value, value === null ? null : 'hand').then((ok) => {
        if (!ok) announce(t('capture.announce.tagFailed', { count: 1 }));
      });
    },
    [announce, applyToTile, t],
  );

  const commitCaption = useCallback(
    (row: TileData, caption: string | null) => {
      if (row.item) {
        api.updateTags(row.item.id, { caption });
        return;
      }
      if (!row.photo || (row.photo.caption ?? null) === caption) return;
      const photoId = row.photo.id;
      updatePhoto(photoId, { caption })
        .then((updated) =>
          setServerPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p))),
        )
        .catch(() => announce(t('capture.announce.tagFailed', { count: 1 })));
    },
    [announce, api, t],
  );

  const sheetProps: Omit<PhotoTagSheetProps, 'returnFocusRef' | 'onRemove' | 'onAnnotate'> | null =
    sheetRow
      ? {
          open: true,
          index: sheetIndex,
          total: tileData.length,
          photo: {
            key: sheetRow.key,
            previewUrl: sheetRow.photo ? sheetRow.photo.fileUrl : (sheetRow.item?.previewUrl ?? ''),
            areaId: sheetRow.areaId,
            orientationId: sheetRow.orientationId,
            caption: sheetRow.photo ? sheetRow.photo.caption : (sheetRow.item?.caption ?? null),
            uploaded: sheetRow.kind === 'server',
            annotated: Boolean(sheetRow.photo?.annotatedAt),
            serverPhoto: sheetRow.photo,
          },
          areas: [...areas],
          orientations: [...orientations],
          onAreaChange: (id) => tagOne(sheetRow, 'area', id),
          onOrientationChange: (id) => tagOne(sheetRow, 'orientation', id),
          onCaptionCommit: (caption) => commitCaption(sheetRow, caption),
          onPrevious: () => {
            const previous = tileData[sheetIndex - 1];
            if (previous) setSheetKey(previous.key);
          },
          onNext: () => {
            const next = tileData[sheetIndex + 1];
            if (next) setSheetKey(next.key);
          },
          onClose: () => setSheetKey(null),
        }
      : null;

  const annotatePhoto = annotateKey ? (serverById.get(annotateKey) ?? null) : null;

  // ── Camera ──────────────────────────────────────────────────────────────────────────────────

  const lastShotKey = shotKeys[shotKeys.length - 1];
  const lastShotTile = lastShotKey ? tiles.find((tile) => tile.key === lastShotKey) : undefined;
  const removeLastShot = () => {
    if (!lastShotKey) return;
    setShotKeys((prev) => prev.slice(0, -1));
    void removeTile(lastShotKey);
  };

  // ── Orphans of a crashed session ────────────────────────────────────────────────────────────

  const continueOrphans = async () => {
    const id = await ensureDraft();
    if (id) api.adoptOrphans(id);
  };
  const discardOrphans = () => {
    void api.discardOrphans();
  };

  // ── Summary values for the screen ───────────────────────────────────────────────────────────

  const uploadedCount = serverPhotos.length;
  const areaCounts = new Map<string, number>();
  for (const row of tileData) {
    if (row.areaId) areaCounts.set(row.areaId, (areaCounts.get(row.areaId) ?? 0) + 1);
  }
  let mostCommonAreaId: string | null = null;
  let mostCommonCount = 0;
  for (const [areaId, count] of areaCounts) {
    if (count > mostCommonCount) {
      mostCommonAreaId = areaId;
      mostCommonCount = count;
    }
  }

  /** Items that exist only in memory and are not uploaded yet (a reload would lose them). */
  const hasMemoryOnlyItems = pendingItems.some((item) => !item.persisted);

  return {
    tiles,
    selectedKeys,
    toggleSelect,
    selectAll,
    clearSelection,
    openTile,
    retry,
    removeTile,
    serverPhotos,
    uploadedCount,
    pendingCount: pendingItems.length,
    hasMemoryOnlyItems,
    mostCommonAreaId,
    chips: {
      areaId: effectiveAreaId,
      orientation: sticky.orientation,
      recentAreaIds,
      recentOrientationIds,
      onAreaChange: (id: string | null) => void changeChip('area', id),
      onOrientationChange: (choice: OrientationChoice) => void changeChip('orientation', choice),
    },
    inputs: {
      libraryInputRef,
      cameraInputRef,
      chooseButtonRef,
      takeButtonRef,
      onLibraryChange,
      onCameraInputChange,
      chooseFromLibrary: () => libraryInputRef.current?.click(),
      takePhotos,
      showTakePhotos,
      cameraKnown: coarsePointer || devicesChecked,
      openLiveCamera,
      dragActive,
      dropHandlers,
    },
    sheet: {
      props: sheetProps,
      returnFocusRef: sheetOpenerRef,
      annotateOpenerRef,
      onAnnotate: () => {
        annotateOpenerRef.current = document.activeElement as HTMLElement | null;
        if (sheetRow?.photo) setAnnotateKey(sheetRow.photo.id);
      },
      onRemove: () => {
        if (sheetRow) void removeTile(sheetRow.key);
        setSheetKey(null);
      },
    },
    annotate: {
      photo: annotatePhoto,
      onSaved: (photo: Photo) => {
        setServerPhotos((prev) => prev.map((p) => (p.id === photo.id ? photo : p)));
        setAnnotateKey(null);
      },
      onClose: () => setAnnotateKey(null),
    },
    camera: {
      open: cameraOpen,
      onShot: (file: File) => void addFiles([file], 'camera'),
      onClose: () => setCameraOpen(false),
      onUseCameraApp: () => cameraInputRef.current?.click(),
      shotCount: shotKeys.length,
      lastShotUrl: lastShotTile?.thumbnailUrl,
      onRemoveLast: removeLastShot,
    },
    orphans: draftId ? [] : api.orphans,
    continueOrphans,
    discardOrphans,
  };
}
