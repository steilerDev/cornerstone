import { PHOTO_SPOT_ANY, routeUrl } from '@cornerstone/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PhotoSpotPhoto, PhotoSpotPhotosResponse } from '@cornerstone/shared';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { FormError } from '../../components/FormError/FormError.js';
import { SpotViewer } from '../../components/photos/SpotViewer.js';
import type { PhotoDetailsSaveResult } from '../../components/photos/PhotoDetailsPanel.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { getPhotoSpotPhotos } from '../../lib/photoApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useImmersiveShell } from '../../hooks/useImmersiveShell.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { usePhotoDialogs } from '../../photos/usePhotoDialogs.js';
import { undoChange } from '../../lib/undoApi.js';
import { pathnameOf, readOrigin } from '../../navigation/origin.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { originLabelKeyForPath } from '../../navigation/pageIdentity.js';
import { formatAreaPath, fromSpotUrlKey, spotKey } from '../../lib/photoSpots.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './PhotoSpotViewerPage.module.css';

type Status = 'loading' | 'ready' | 'notFound' | 'error';

export default function PhotoSpotViewerPage() {
  const { t } = useTranslation('photos');
  const { t: tc } = useTranslation('common');
  const location = useLocation();
  const navigate = useNavigate();
  const { areaKey, orientationKey } = useParams() as { areaKey: string; orientationKey: string };
  const [searchParams, setSearchParams] = useSearchParams();

  const areaId = fromSpotUrlKey(areaKey);
  const orientationId = fromSpotUrlKey(orientationKey);
  const photoParam = searchParams.get('photo');

  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<PhotoSpotPhotosResponse | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [headingFocusRequest, setHeadingFocusRequest] = useState(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const focusedSpotRef = useRef<string | null>(null);
  const isPhone = useMediaQuery('(max-width: 767px)');
  const { showUndoToast } = useToast();
  const { annotate } = usePhotoDialogs();

  // 'none/none' is the 'No area' group (every orientation), not a spot
  const isNoAreaGroup = areaKey === 'none' && orientationKey === 'none';
  const fetchOrientationId = isNoAreaGroup ? PHOTO_SPOT_ANY : orientationId;

  useEffect(() => {
    const controller = new AbortController();
    /* eslint-disable @eslint-react/set-state-in-effect -- reset to loading before each (re)fetch */
    setStatus('loading');
    /* eslint-enable @eslint-react/set-state-in-effect */
    getPhotoSpotPhotos(areaId, fetchOrientationId, { signal: controller.signal })
      .then((res) => {
        setData(res);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setStatus(err instanceof ApiClientError && err.statusCode === 404 ? 'notFound' : 'error');
      });
    return () => controller.abort();
  }, [areaId, fetchOrientationId, reloadToken]);

  /** Refetches without a loading flash; keeps what is shown when it fails. */
  const refetch = useCallback(async (): Promise<PhotoSpotPhoto[] | null> => {
    try {
      const res = await getPhotoSpotPhotos(areaId, fetchOrientationId);
      setData(res);
      return res.photos;
    } catch {
      return null;
    }
  }, [areaId, fetchOrientationId]);

  const photos = useMemo(() => data?.photos ?? [], [data]);
  const area = data?.area ?? null;
  const orientation = data?.orientation ?? null;

  const currentSpotKey = spotKey(areaId, orientationId);
  const spotLabel = isNoAreaGroup
    ? t('spots.noArea')
    : t('viewer.spotHeading', {
        area: area ? formatAreaPath(area) : t('spots.noArea'),
        orientation: orientation?.name ?? t('spots.noOrientation'),
      });

  const index = useMemo(() => {
    if (!photoParam) return 0;
    const i = photos.findIndex((p) => p.id === photoParam);
    return i >= 0 ? i : 0;
  }, [photos, photoParam]);

  // Back target: the Photos page (with its filters) unless the viewer was opened from elsewhere
  const photosPath = routeUrl('photos');
  const origin = readOrigin(location.state);
  const fromPhotos = !origin || pathnameOf(origin.to) === photosPath;
  let otherLabel: string | null = null;
  if (origin && !fromPhotos) {
    const labelKey = originLabelKeyForPath(pathnameOf(origin.to));
    otherLabel = origin.name ?? (labelKey ? tc(labelKey) : null);
  }
  const backTo = origin && (fromPhotos || otherLabel) ? origin.to : photosPath;
  const backToPhotos = fromPhotos || !otherLabel;
  const backLabel = otherLabel
    ? tc('navigation.backTo', { origin: otherLabel })
    : tc('navigation.photos');
  const currentPhoto = photos[index];
  // The group has no spot of its own: Back focuses the cell of the photo being shown
  const focusKey = isNoAreaGroup
    ? spotKey(null, currentPhoto?.orientationId ?? null)
    : currentSpotKey;
  const backState = useMemo(
    () => (backToPhotos ? { focusSpotId: `spot-${focusKey}` } : undefined),
    [backToPhotos, focusKey],
  );
  const goBack = useCallback(() => {
    void navigate(backTo, { state: backState });
  }, [navigate, backTo, backState]);
  const entryLinkState = useOriginState(status === 'ready' ? spotLabel : null);

  const onSelect = useCallback(
    (i: number) => {
      const target = photos[i]!;
      setSearchParams({ photo: target.id }, { replace: true, state: location.state });
    },
    [photos, setSearchParams, location.state],
  );

  const onAnnotate = useCallback(
    (photo: PhotoSpotPhoto, returnFocusRef: RefObject<HTMLElement | null>) => {
      void annotate({ photo, returnFocusRef }).then((saved) => {
        if (saved) void refetch();
      });
    },
    [annotate, refetch],
  );

  const belongsHere = useCallback(
    (photo: { areaId: string | null; orientationId: string | null }) =>
      isNoAreaGroup
        ? photo.areaId === null
        : photo.areaId === areaId && photo.orientationId === orientationId,
    [isNoAreaGroup, areaId, orientationId],
  );

  const onDetailsSaved = useCallback(
    (result: PhotoDetailsSaveResult) => {
      if (!result.tagsChanged || belongsHere(result.photo)) {
        void refetch();
        return;
      }
      // The photo left this spot: show the next one (or the empty state) and offer Undo
      const movedIndex = index;
      void refetch().then((next) => {
        if (next === null) return;
        const target = next[Math.min(movedIndex, next.length - 1)];
        if (target) setSearchParams({ photo: target.id }, { replace: true, state: location.state });
        setHeadingFocusRequest((n) => n + 1);
        window.requestAnimationFrame(() => {
          if (next.length === 0) headingRef.current?.focus();
        });
      });
      const undo = result.undo;
      if (undo) {
        showUndoToast({
          message: t('viewer.photoMoved', { spot: result.spotLabel }),
          dedupeKey: `photo-tags-${undo.token}`,
          focusFallback: () => headingRef.current,
          onUndo: async () => {
            await undoChange(undo.token);
            await refetch();
            setSearchParams({ photo: result.photo.id }, { replace: true, state: location.state });
          },
        });
      }
    },
    [belongsHere, refetch, index, setSearchParams, location.state, showUndoToast, t],
  );

  // Focus the heading once per spot after the first successful load.
  useEffect(() => {
    if (status === 'loading' || focusedSpotRef.current === currentSpotKey) return;
    focusedSpotRef.current = currentSpotKey;
    headingRef.current!.focus();
  }, [status, currentSpotKey]);

  useDocumentTitle(status === 'ready' ? spotLabel : null);

  const heading = (
    <h1 tabIndex={-1} ref={headingRef} className={sharedStyles.srOnly}>
      {status === 'ready' ? spotLabel : tc('navigation.photos')}
    </h1>
  );

  const showViewer = status === 'ready' && photos.length > 0;
  // Phones: the viewer takes the whole screen, the shell bars are not rendered
  useImmersiveShell(isPhone && showViewer);

  let content;
  if (status === 'loading') {
    content = (
      <div className={styles.state} aria-busy="true">
        {heading}
        <Skeleton lines={4} loadingLabel={t('viewer.loading')} />
      </div>
    );
  } else if (status === 'notFound' || (status === 'ready' && photos.length === 0)) {
    const notFound = status === 'notFound';
    content = (
      <div className={styles.state}>
        {heading}
        <EmptyState
          message={
            notFound
              ? t('viewer.notFoundTitle')
              : areaId === null
                ? t('viewer.noAreaEmptyTitle')
                : t('viewer.emptyTitle')
          }
          description={
            notFound
              ? t('viewer.notFoundDescription')
              : areaId === null
                ? t('viewer.noAreaEmptyDescription')
                : t('viewer.emptyDescription')
          }
          action={{
            label: tc('navigation.backTo', { origin: otherLabel ?? tc('navigation.photos') }),
            onClick: goBack,
          }}
        />
      </div>
    );
  } else if (status === 'error') {
    content = (
      <div className={styles.state}>
        {heading}
        <FormError message={t('viewer.loadError')} />
        <button
          type="button"
          className={styles.retryButton}
          onClick={() => setReloadToken((n) => n + 1)}
        >
          {t('page.retry')}
        </button>
      </div>
    );
  } else {
    content = (
      <SpotViewer
        photos={photos}
        index={index}
        onSelect={onSelect}
        onBack={goBack}
        backTo={backTo}
        backState={backState}
        backLabel={backLabel}
        entryLinkState={entryLinkState}
        area={area}
        orientation={orientation}
        title={spotLabel}
        headingRef={headingRef}
        headingFocusRequest={headingFocusRequest}
        isNoAreaGroup={areaId === null}
        onAnnotate={onAnnotate}
        onDetailsSaved={onDetailsSaved}
      />
    );
  }

  return (
    <div
      data-layout="full-height"
      className={`${styles.root} ${showViewer ? styles.rootViewer : ''}`}
      data-testid="photo-spot-viewer"
    >
      {content}
    </div>
  );
}
