import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PhotoSpotsResponse } from '@cornerstone/shared';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { FormError } from '../../components/FormError/FormError.js';
import { SpotsTable } from '../../components/photos/SpotsTable.js';
import { SpotsGrid } from '../../components/photos/SpotsGrid.js';
import { getPhotoSpots } from '../../lib/photoApi.js';
import { buildSpotGroups } from '../../lib/photoSpots.js';
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

  // Restore focus to the spot the user came back from, then clear the state so a refresh
  // does not re-focus.
  useEffect(() => {
    if (status !== 'ready') return;
    const focusId = (location.state as { focusSpotId?: unknown } | null)?.focusSpotId;
    if (typeof focusId !== 'string') return;
    (document.getElementById(focusId) ?? headingRef.current)?.focus();
    void navigate(location.pathname + location.search, { replace: true, state: null });
  }, [status, location.state, location.pathname, location.search, navigate]);

  const groups = useMemo(
    () => (data ? buildSpotGroups(data.areas, data.orientations, data.spots) : []),
    [data],
  );
  // Origin = this page with its filters, so the viewer's back link returns to them
  const linkState = useOriginState();
  const retry = useCallback(() => setReloadToken((n) => n + 1), []);

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
    content = <SpotsGrid groups={groups} linkState={linkState} />;
  } else {
    content = <SpotsTable groups={groups} orientations={data.orientations} linkState={linkState} />;
  }

  return (
    <PageLayout title={pageTitle} testId="photos-page" headingRef={headingRef}>
      <p className={styles.subtitle}>{t('page.subtitle')}</p>
      {content}
    </PageLayout>
  );
}
