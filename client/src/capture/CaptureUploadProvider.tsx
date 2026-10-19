import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { nanoid } from 'nanoid';
import { useToast } from '../components/Toast/ToastContext.js';
import { useAuth } from '../contexts/AuthContext.js';
import { getDiaryEntry } from '../lib/diaryApi.js';
import { deletePhoto, updatePhoto, uploadPhoto } from '../lib/photoApi.js';
import { createCaptureEngine } from './captureEngine.js';
import type { CaptureEngine, CaptureSnapshot } from './captureEngine.js';
import { openCaptureStore } from './captureStore.js';
import { CaptureUploadsContext } from './captureUploadsContext.js';
import type { CaptureUploadsApi } from './captureTypes.js';

const EMPTY_SNAPSHOT: CaptureSnapshot = { storage: 'pending', items: [], orphans: [] };

interface EngineState {
  engine: CaptureEngine | null;
  snapshot: CaptureSnapshot;
}

const EMPTY_STATE: EngineState = { engine: null, snapshot: EMPTY_SNAPSHOT };

/**
 * The app-wide photo capture engine: every photo is written to IndexedDB before any network
 * call and uploaded in the background, so uploads survive leaving the screen, a reload and a
 * crash. Imported only by `App.tsx`; pages use `useCaptureUploads`.
 */
export function CaptureUploadProvider({ children }: { readonly children: ReactNode }) {
  const { t } = useTranslation('photos');
  const { showToast } = useToast();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current ??= nanoid();
  // Engine state lives outside React state so the effect below never sets state synchronously.
  const holderRef = useRef<{ state: EngineState; listeners: Set<() => void> }>({
    state: EMPTY_STATE,
    listeners: new Set(),
  });
  const subscribe = useCallback((listener: () => void) => {
    const { listeners } = holderRef.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const getState = useCallback(() => holderRef.current.state, []);
  const { engine, snapshot } = useSyncExternalStore(subscribe, getState, getState);

  // The toast and its text change with the language; the engine must not restart for that.
  const purgedRef = useRef<() => void>(() => undefined);
  purgedRef.current = () => showToast('info', t('upload.purged'));

  useEffect(() => {
    const publishState = (state: EngineState) => {
      holderRef.current.state = state;
      for (const listener of [...holderRef.current.listeners]) listener();
    };
    if (userId === null) return undefined;
    const next: CaptureEngine = createCaptureEngine({
      userId,
      sessionId: sessionIdRef.current ?? nanoid(),
      openStore: () => openCaptureStore(),
      uploadPhoto: (
        entityType,
        entityId,
        file,
        caption,
        onProgress,
        areaId,
        orientationId,
        signal,
      ) =>
        uploadPhoto(entityType, entityId, file, caption, onProgress, areaId, orientationId, signal),
      updatePhoto,
      deletePhoto: async (id) => {
        await deletePhoto(id);
      },
      getDiaryEntry,
      isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
      createObjectURL: (blob) => URL.createObjectURL(blob),
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
      newId: nanoid,
      onChange: (value) => publishState({ engine: next, snapshot: value }),
      onPurged: () => purgedRef.current(),
    });
    const onOnline = () => next.handleOnline();
    window.addEventListener('online', onOnline);
    publishState({ engine: next, snapshot: next.getSnapshot() });
    void next.start();
    return () => {
      window.removeEventListener('online', onOnline);
      next.dispose();
      publishState(EMPTY_STATE);
    };
  }, [userId]);

  // beforeunload while memory-only items are pending is the capture screen's job (it owns the
  // wording policy); the provider only exposes `persisted` on each item.

  const api = useMemo<CaptureUploadsApi | null>(() => {
    if (engine === null) return null;
    return {
      storage: snapshot.storage,
      items: snapshot.items,
      orphans: snapshot.orphans,
      add: engine.add,
      assignDraft: engine.assignDraft,
      reassign: engine.reassign,
      updateTags: engine.updateTags,
      remove: engine.remove,
      retry: engine.retry,
      discardDraft: engine.discardDraft,
      adoptOrphans: engine.adoptOrphans,
      discardOrphans: engine.discardOrphans,
      subscribe: engine.subscribe,
      whenSettled: engine.whenSettled,
    };
  }, [engine, snapshot]);

  // Signed out: consumers sit behind the auth guard, so a null engine only shows briefly.
  const fallback = useMemo<CaptureUploadsApi>(() => signedOutApi(), []);

  return <CaptureUploadsContext value={api ?? fallback}>{children}</CaptureUploadsContext>;
}

/** Inert API for the moments without a user (login screen, user switch). */
function signedOutApi(): CaptureUploadsApi {
  return {
    storage: 'pending',
    items: [],
    orphans: [],
    add: () => Promise.resolve([]),
    assignDraft: () => undefined,
    reassign: () => [],
    updateTags: () => undefined,
    remove: () => undefined,
    retry: () => undefined,
    discardDraft: () => Promise.resolve(),
    adoptOrphans: () => undefined,
    discardOrphans: () => Promise.resolve(),
    subscribe: () => () => undefined,
    whenSettled: (itemIds) => Promise.resolve({ uploaded: [], failedIds: [...itemIds] }),
  };
}

export default CaptureUploadProvider;
