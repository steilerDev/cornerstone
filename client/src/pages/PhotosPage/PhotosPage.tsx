import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PHOTO_SPOT_ANY } from '@cornerstone/shared';
import type { PhotoSpotPhoto, PhotoSpotsResponse } from '@cornerstone/shared';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { FormError } from '../../components/FormError/FormError.js';
import { SpotsTable } from '../../components/photos/SpotsTable.js';
import { SpotsGrid } from '../../components/photos/SpotsGrid.js';
import { SpotSelectGrid } from '../../components/SpotThumbnail/SpotSelectGrid.js';
import { StickyActionBar } from '../../components/StickyActionBar/StickyActionBar.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { getPhotoSpotPhotos, getPhotoSpots } from '../../lib/photoApi.js';
import { areaPathFromList, buildSpotGroups } from '../../lib/photoSpots.js';
import { undoChange } from '../../lib/undoApi.js';
import { useFormatters } from '../../lib/formatters.js';
import { usePhotoDialogs } from '../../photos/usePhotoDialogs.js';
import type { BulkTagResult } from '../../photos/photoDialogsContext.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import styles from './PhotosPage.module.css';

type Status = 'loading' | 'error' | 'ready';

export default function PhotosPage() {
  const { t } = useTranslation('photos');
  const { t: tc } = useTranslation('common');
  const pageTitle = tc('navigation.photos');
  useDocumentTitle(pageTitle);
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<PhotoSpotsResponse | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const setTagsRef = useRef<HTMLButtonElement | null>(null);
  const { formatDate } = useFormatters();
  const { showUndoToast } = useToast();
  const { bulkTag } = usePhotoDialogs();

  const [selecting, setSelecting] = useState(false);
  const [noAreaPhotos, setNoAreaPhotos] = useState<PhotoSpotPhoto[] | null>(null);
  const [noAreaStatus, setNoAreaStatus] = useState<Status>('loading');
  const [noAreaReload, setNoAreaReload] = useState(0);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const controller = new AbortController();
    /* eslint-disable @eslint-react/set-state-in-effect -- reset to loading before each (re)fetch */
    setStatus('loading');
    /* eslint-enable @eslint-react/set-state-in-effect */
    getPhotoSpots({ signal: controller.signal })
      .then((res) => {
        setData(res);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setStatus('error');
      });
    return () => controller.abort();
  }, [reloadToken]);

  // Select mode lists every photo without an area, any orientation.
  useEffect(() => {
    if (!selecting) return undefined;
    const controller = new AbortController();
    /* eslint-disable @eslint-react/set-state-in-effect -- reset to loading before each (re)fetch */
    setNoAreaStatus('loading');
    /* eslint-enable @eslint-react/set-state-in-effect */
    getPhotoSpotPhotos(null, PHOTO_SPOT_ANY, { signal: controller.signal })
      .then((res) => {
        setNoAreaPhotos(res.photos);
        setNoAreaStatus('ready');
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setNoAreaStatus('error');
      });
    return () => controller.abort();
  }, [selecting, noAreaReload]);

  // Restore focus to the spot the user came back from, then clear the state so a refresh
  // does not re-focus.
  useEffect(() => {
    if (status !== 'ready') return;
    const focusId = (location.state as { focusSpotId?: unknown } | null)?.focusSpotId;
    if (typeof focusId !== 'string') return;
    (document.getElementById(focusId) ?? headingRef.current)!.focus();
    void navigate(location.pathname + location.search, { replace: true, state: null });
  }, [status, location.state, location.pathname, location.search, navigate]);

  const groups = useMemo(
    () => (data ? buildSpotGroups(data.areas, data.orientations, data.spots) : []),
    [data],
  );
  // Origin = this page with its filters, so the viewer's back link returns to them
  const linkState = useOriginState();
  const retry = useCallback(() => setReloadToken((n) => n + 1), []);
  const retryNoArea = useCallback(() => setNoAreaReload((n) => n + 1), []);

  /** Refetches the matrix and the no-area list without a loading flash; returns the remaining count. */
  const refreshAll = useCallback(async (): Promise<number> => {
    const [spotsRes, photosRes] = await Promise.all([
      getPhotoSpots(),
      getPhotoSpotPhotos(null, PHOTO_SPOT_ANY),
    ]);
    setData(spotsRes);
    setNoAreaPhotos(photosRes.photos);
    setNoAreaStatus('ready');
    return photosRes.photos.length;
  }, []);

  const toggleSelecting = useCallback(() => {
    setSelecting((on) => !on);
    setSelectedIds(new Set());
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const unlockedIds = useMemo(
    () => (noAreaPhotos ?? []).filter((p) => !p.diaryEntry.isSigned).map((p) => p.id),
    [noAreaPhotos],
  );

  const movedMessage = (result: BulkTagResult, spots: PhotoSpotsResponse): string => {
    const areas = spots.areas;
    const orientationName = (id: string | null | undefined) =>
      id ? (spots.orientations.find((o) => o.id === id)?.name ?? '') : t('spots.noOrientation');
    if (result.areaId !== undefined) {
      const area =
        result.areaId === null
          ? t('spots.noArea')
          : (areaPathFromList(areas, result.areaId) ?? t('spots.noArea'));
      const spot =
        result.orientationId !== undefined
          ? `${area} · ${orientationName(result.orientationId)}`
          : area;
      return t('bulk.movedTo', { count: result.updated, spot });
    }
    return t('bulk.orientationSet', { count: result.updated });
  };

  const setTags = async () => {
    const photoIds = [...selectedIds];
    if (!data) return;
    const result = await bulkTag({ photoIds, areas: data.areas, returnFocusRef: setTagsRef });
    if (!result) return;
    setSelectedIds(new Set());
    showUndoToast({
      message: movedMessage(result, data),
      dedupeKey: `photo-tags-${result.undo.token}`,
      focusFallback: () => toggleRef.current ?? headingRef.current,
      onUndo: async () => {
        await undoChange(result.undo.token);
        await refreshAll().catch(() => undefined);
      },
    });
    let remaining = 1;
    try {
      remaining = await refreshAll();
    } catch {
      setStatus('error');
    }
    if (remaining === 0) setSelecting(false);
    window.requestAnimationFrame(() => {
      (remaining === 0 ? headingRef.current : (toggleRef.current ?? headingRef.current))?.focus();
    });
  };

  const selectedText = t('select.selected', { count: selectedIds.size });

  let selectContent: ReactNode = null;
  if (selecting) {
    if (noAreaStatus === 'loading') {
      selectContent = (
        <div aria-busy="true">
          <Skeleton lines={2} loadingLabel={t('select.loading')} />
        </div>
      );
    } else if (noAreaStatus === 'error') {
      selectContent = (
        <div className={styles.errorBlock}>
          <FormError message={t('select.loadError')} />
          <button type="button" className={styles.retryButton} onClick={retryNoArea}>
            {t('page.retry')}
          </button>
        </div>
      );
    } else {
      selectContent = (
        <SpotSelectGrid
          items={noAreaPhotos!.map((photo) => ({
            id: photo.id,
            thumbnailUrl: photo.thumbnailUrl,
            locked: photo.diaryEntry.isSigned,
            label: t('select.tileLabel', {
              date: formatDate(photo.diaryEntry.entryDate, undefined, 'long'),
              orientation: photo.orientation?.name ?? t('spots.noOrientation'),
            }),
          }))}
          selectedIds={selectedIds}
          onToggle={toggleSelected}
          groupLabel={t('spots.noAreaGroupLabel')}
          lockedLabel={t('select.locked')}
          imageUnavailableLabel={t('viewer.imageUnavailable')}
          testIdPrefix="no-area-photo"
        />
      );
    }
  }
  const noArea = {
    selecting,
    onToggleSelect: toggleSelecting,
    toggleRef,
    selectContent,
  };

  let content;
  if (status === 'loading') {
    content = (
      <div aria-busy="true">
        <Skeleton lines={6} loadingLabel={t('page.loading')} />
      </div>
    );
  } else if (status === 'error' || !data) {
    content = (
      <div className={styles.errorBlock}>
        <FormError message={t('page.loadError')} />
        <button type="button" className={styles.retryButton} onClick={retry}>
          {t('page.retry')}
        </button>
      </div>
    );
  } else if (data.spots.length === 0) {
    content = (
      <EmptyState
        icon="📷"
        message={t('page.emptyTitle')}
        description={t('page.emptyDescription')}
      />
    );
  } else if (isMobile) {
    content = <SpotsGrid groups={groups} linkState={linkState} noArea={noArea} />;
  } else {
    content = (
      <SpotsTable
        groups={groups}
        orientations={data.orientations}
        linkState={linkState}
        noArea={noArea}
      />
    );
  }

  return (
    <PageLayout title={pageTitle} testId="photos-page" headingRef={headingRef}>
      <p className={styles.subtitle}>{t('page.subtitle')}</p>
      {content}
      {selecting && selectedIds.size > 0 ? (
        <StickyActionBar
          status={selectedText}
          announcement={selectedText}
          testId="no-area-selection-bar"
        >
          <button
            type="button"
            className={styles.barButton}
            onClick={() => setSelectedIds(new Set(unlockedIds))}
            data-testid="no-area-select-all"
          >
            {t('select.all')}
          </button>
          <button
            type="button"
            className={styles.barButton}
            onClick={() => setSelectedIds(new Set())}
            data-testid="no-area-clear"
          >
            {t('select.clear')}
          </button>
          <button
            type="button"
            className={styles.setTagsButton}
            ref={setTagsRef}
            onClick={() => void setTags()}
            data-testid="no-area-set-tags"
          >
            {t('select.setTags')}
          </button>
        </StickyActionBar>
      ) : null}
    </PageLayout>
  );
}
