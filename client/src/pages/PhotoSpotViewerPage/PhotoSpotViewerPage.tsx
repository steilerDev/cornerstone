import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PhotoSpotPhotosResponse } from '@cornerstone/shared';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { FormError } from '../../components/FormError/FormError.js';
import { SpotViewer } from '../../components/photos/SpotViewer.js';
import { getPhotoSpotPhotos } from '../../lib/photoApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { formatAreaPath, fromSpotUrlKey, spotKey } from '../../lib/photoSpots.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './PhotoSpotViewerPage.module.css';

type Status = 'loading' | 'ready' | 'notFound' | 'error';

export default function PhotoSpotViewerPage() {
  const { t } = useTranslation('photos');
  const location = useLocation();
  const navigate = useNavigate();
  const { areaKey = 'none', orientationKey = 'none' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const areaId = fromSpotUrlKey(areaKey);
  const orientationId = fromSpotUrlKey(orientationKey);
  const photoParam = searchParams.get('photo');

  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<PhotoSpotPhotosResponse | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const focusedSpotRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    /* eslint-disable @eslint-react/set-state-in-effect -- reset to loading before each (re)fetch */
    setStatus('loading');
    /* eslint-enable @eslint-react/set-state-in-effect */
    getPhotoSpotPhotos(areaId, orientationId, { signal: controller.signal })
      .then((res) => {
        setData(res);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setStatus(err instanceof ApiClientError && err.statusCode === 404 ? 'notFound' : 'error');
      });
    return () => controller.abort();
  }, [areaId, orientationId, reloadToken]);

  const photos = useMemo(() => data?.photos ?? [], [data]);
  const area = data?.area ?? null;
  const orientation = data?.orientation ?? null;

  const currentSpotKey = spotKey(areaId, orientationId);
  const spotLabel = t('viewer.spotHeading', {
    area: area ? formatAreaPath(area) : t('spots.noArea'),
    orientation: orientation?.name ?? t('spots.noOrientation'),
  });

  const index = useMemo(() => {
    if (!photoParam) return 0;
    const i = photos.findIndex((p) => p.id === photoParam);
    return i >= 0 ? i : 0;
  }, [photos, photoParam]);

  const backTo = `/photos${(location.state as { fromSearch?: string } | null)?.fromSearch ?? ''}`;
  const backState = useMemo(() => ({ focusSpotId: `spot-${currentSpotKey}` }), [currentSpotKey]);
  const goBack = useCallback(() => {
    void navigate(backTo, { state: backState });
  }, [navigate, backTo, backState]);

  const onSelect = useCallback(
    (i: number) => {
      const target = photos[i];
      if (!target) return;
      setSearchParams({ photo: target.id }, { replace: true, state: location.state });
    },
    [photos, setSearchParams, location.state],
  );

  // Focus the heading once per spot after the first successful load.
  useEffect(() => {
    if (status === 'loading' || focusedSpotRef.current === currentSpotKey) return;
    focusedSpotRef.current = currentSpotKey;
    headingRef.current?.focus();
  }, [status, currentSpotKey]);

  useEffect(() => {
    if (status !== 'ready') return;
    const prev = document.title;
    document.title = t('viewer.documentTitle', { spot: spotLabel });
    return () => {
      document.title = prev;
    };
  }, [status, t, spotLabel]);

  const heading = (
    <h1 tabIndex={-1} ref={headingRef} className={sharedStyles.srOnly}>
      {status === 'ready' ? spotLabel : t('page.title')}
    </h1>
  );

  const showViewer = status === 'ready' && photos.length > 0;

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
          message={notFound ? t('viewer.notFoundTitle') : t('viewer.emptyTitle')}
          description={notFound ? t('viewer.notFoundDescription') : t('viewer.emptyDescription')}
          action={{ label: t('viewer.backToSpots'), onClick: goBack }}
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
        area={area}
        orientation={orientation}
        headingSlot={heading}
        headingRef={headingRef}
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
