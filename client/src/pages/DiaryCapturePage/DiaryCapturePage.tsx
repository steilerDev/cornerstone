import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { DiaryEntryDetail, Photo } from '@cornerstone/shared';
import { isDiaryEntrySignatureLocked, routeUrl } from '@cornerstone/shared';
import { CaptureScreen } from '../../components/diary/CaptureScreen/CaptureScreen.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useDiaryEntryTitle } from '../../hooks/useDiaryEntryTitle.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { getDiaryEntry } from '../../lib/diaryApi.js';
import { getPhotosForEntity } from '../../lib/photoApi.js';
import { prefillFromSearch, startModeFromSearch } from '../../navigation/createQuery.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import styles from './DiaryCapturePage.module.css';

type Loaded =
  | { kind: 'ready'; entry: DiaryEntryDetail; photos: Photo[] }
  | { kind: 'notFound' }
  | { kind: 'error' };

/** Sets the tab title for the states that do not render the form (the form sets its own). */
function TabTitle({ title }: { title: string }) {
  useDocumentTitle(title);
  return null;
}

/**
 * Capture screen page: serves `/diary/new` and `/diary/:id/edit`. It resolves the mode (new
 * entry, draft, saved entry, locked) and loads the entry; the form is `CaptureScreen`.
 */
export default function DiaryCapturePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation('diary');
  const { t: tCommon } = useTranslation('common');

  const routeId = id ?? null;
  // The draft this page instance created: its URL change must not reload or reset the form.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [newKey, setNewKey] = useState(0);
  const start = startModeFromSearch(searchParams);
  // A new start mode arriving on /diary/new (New sheet while the screen is open) restarts it;
  // consuming it (start -> null) must not.
  const [prevStart, setPrevStart] = useState(start);
  if (prevStart !== start) {
    setPrevStart(start);
    if (start !== null && routeId === null) setNewKey((key) => key + 1);
  }
  const [prevRouteId, setPrevRouteId] = useState(routeId);
  if (prevRouteId !== routeId) {
    setPrevRouteId(routeId);
    if (routeId === null) {
      setNewKey((key) => key + 1);
      setCreatedId(null);
    }
  }
  const loadId = routeId !== null && routeId !== createdId ? routeId : null;

  const [loaded, setLoaded] = useState<{ id: string; result: Loaded } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const messageRef = useRef<HTMLParagraphElement | HTMLHeadingElement>(null);

  useEffect(() => {
    if (!loadId) return undefined;
    let cancelled = false;
    Promise.all([getDiaryEntry(loadId), getPhotosForEntity('diary_entry', loadId)])
      .then(([entry, photos]) => {
        if (cancelled) return;
        setLoaded({ id: loadId, result: { kind: 'ready', entry, photos } });
        setRetrying(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const notFound = err instanceof ApiClientError && err.statusCode === 404;
        setLoaded({ id: loadId, result: { kind: notFound ? 'notFound' : 'error' } });
        setRetrying(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadId, attempt]);

  const result = loadId && loaded?.id === loadId ? loaded.result : null;
  const entry = result?.kind === 'ready' ? result.entry : null;
  const entryTitle = useDiaryEntryTitle(entry);
  const prefill = prefillFromSearch(searchParams);

  const renderState = (h1: string, body: ReactNode, trail: ReactNode) => (
    <PageLayout title={h1} breadcrumbs={trail} testId="capture-page">
      <TabTitle title={h1} />
      {body}
    </PageLayout>
  );
  const plainTrail = <PageBreadcrumbs objectNames={{ diaryEntry: null }} />;

  if (loadId && !result) {
    return renderState(
      tCommon('navigation.diaryEntry'),
      <div className={styles.skeleton}>
        <Skeleton lines={2} />
        <Skeleton lines={3} />
      </div>,
      plainTrail,
    );
  }

  if (result?.kind === 'notFound') {
    return renderState(
      tCommon('navigation.diaryEntryNotFound'),
      <EmptyState
        message={t('capture.notFound')}
        action={{ label: tCommon('navigation.siteDiary'), href: routeUrl('diary') }}
      />,
      plainTrail,
    );
  }

  if (result?.kind === 'error') {
    return renderState(
      tCommon('navigation.diaryEntry'),
      <EmptyState
        message={retrying ? t('capture.tryingAgain') : t('capture.loadError')}
        messageRef={messageRef}
        action={{
          label: tCommon('button.retry'),
          onClick: () => {
            setRetrying(true);
            setAttempt((value) => value + 1);
            messageRef.current?.focus();
          },
        }}
      />,
      plainTrail,
    );
  }

  if (entry) {
    const trail = (
      <PageBreadcrumbs objectNames={{ diaryEntry: entry.status === 'saved' ? entryTitle : null }} />
    );
    const open = {
      label: t('capture.openEntry'),
      onClick: () => navigate(routeUrl('diaryEntry', { id: entry.id })),
    };
    if (entry.isAutomatic) {
      return renderState(
        tCommon('navigation.diaryEntry'),
        <EmptyState message={t('capture.automaticLocked')} action={open} />,
        trail,
      );
    }
    if (isDiaryEntrySignatureLocked(entry)) {
      return renderState(
        tCommon('navigation.diaryEntry'),
        <EmptyState message={t('capture.signedLocked')} action={open} />,
        trail,
      );
    }
  }

  const readyEntry = entry;
  return (
    <CaptureScreen
      key={loadId ?? `new-${newKey}`}
      mode={readyEntry ? (readyEntry.status === 'draft' ? 'draft' : 'saved') : 'new'}
      entry={readyEntry}
      photos={result?.kind === 'ready' ? result.photos : []}
      prefill={{
        areaId: prefill.areaId ?? null,
        companyId: prefill.companyId ?? null,
        date: prefill.date ?? null,
      }}
      breadcrumbs={
        <PageBreadcrumbs
          objectNames={{ diaryEntry: readyEntry?.status === 'saved' ? entryTitle : null }}
        />
      }
      onDraftCreated={setCreatedId}
      start={start}
    />
  );
}
