import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PaperlessStatusResponse } from '@cornerstone/shared';
import { ObjectList } from '../../components/ObjectList/ObjectList.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { SIDE_PANEL_DOCKED_QUERY, SidePanel } from '../../components/Modal/SidePanel.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { listAllLinkedDocumentIds } from '../../lib/documentLinksApi.js';
import { getPaperlessStatus } from '../../lib/paperlessApi.js';
import { IntegrationsLink } from '../../navigation/IntegrationsLink.js';
import { DocumentSheet } from './DocumentSheet.js';
import { useDocumentRows } from './documentRows.js';
import { useDocumentsList } from './useDocumentsList.js';
import styles from './DocumentsPage.module.css';

const DOC_PARAM = 'doc';
const SHEET_TEST_ID = 'documents-library-sheet';
const POSITIVE_INTEGER = /^[1-9]\d*$/;

/** A valid `?doc=` value: a positive integer; anything else is not a document. */
function parseDocParam(value: string | null): number | null {
  return value !== null && POSITIVE_INTEGER.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
}

/** The row's title link that is currently on screen (table or card surface). */
function findRowTitle(docId: number): HTMLElement | null {
  const candidates = [
    `[data-testid="documents-library-title-${docId}"]`,
    `[data-testid="documents-library-title-mobile-${docId}"]`,
  ];
  for (const selector of candidates) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element && element.getClientRects().length > 0) return element;
  }
  return null;
}

interface DocumentsLibraryProps {
  readonly status: PaperlessStatusResponse;
}

/** The reachable Documents page: the list, the note row and the details side panel. */
function DocumentsLibrary({ status }: DocumentsLibraryProps) {
  const { t } = useTranslation('documents');
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const docked = useMediaQuery(SIDE_PANEL_DOCKED_QUERY);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const skipOpenerRef = useRef(false);

  const { list, config, labels } = useDocumentsList();

  // Linked ids drive the Linked badge; they reload after every link change, never the list itself
  // (a refresh would clear the rows and drop focus).
  const [linkedIds, setLinkedIds] = useState<ReadonlySet<number>>(() => new Set());
  const reloadLinkedIds = useCallback(() => {
    listAllLinkedDocumentIds()
      .then((ids) => setLinkedIds(new Set(ids)))
      .catch(() => {
        // The badges keep their last state; the list still works.
      });
  }, []);
  useEffect(() => {
    reloadLinkedIds();
  }, [reloadLinkedIds]);

  const rows = useDocumentRows({ linkedIds, searchParams });

  // ?doc=<id>: opening pushed it, so Back closes the panel and a shared URL reopens it.
  const docParam = searchParams.get(DOC_PARAM);
  const docId = parseDocParam(docParam);
  const [unavailable, setUnavailable] = useState(false);
  const [prevDocId, setPrevDocId] = useState(docId);
  if (docId !== prevDocId) {
    setPrevDocId(docId);
    if (docId !== null) setUnavailable(false);
  }
  const [loadedTitle, setLoadedTitle] = useState<{ id: number; title: string } | null>(null);

  const removeDocParam = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(DOC_PARAM);
        return next;
      },
      { replace: true, state: location.state },
    );
  }, [setSearchParams, location.state]);

  // An invalid value is removed from the URL and answered with the note.
  const invalidDoc = docParam !== null && docId === null;
  if (invalidDoc && !unavailable) setUnavailable(true);
  useEffect(() => {
    if (invalidDoc) removeDocParam();
  }, [invalidDoc, removeDocParam]);

  const closeSheet = useCallback(() => {
    // Resolved at close time: the row may only have been rendered after a deep link.
    skipOpenerRef.current = false;
    returnFocusRef.current = docId === null ? null : findRowTitle(docId);
    removeDocParam();
  }, [docId, removeDocParam]);

  const handleUnavailable = useCallback(() => {
    skipOpenerRef.current = true;
    returnFocusRef.current = null;
    setUnavailable(true);
    removeDocParam();
  }, [removeDocParam]);

  const rowTitle = docId === null ? undefined : list.items.find((doc) => doc.id === docId)?.title;
  const panelTitle =
    docId === null
      ? ''
      : loadedTitle?.id === docId
        ? loadedTitle.title
        : (rowTitle ?? t('documentCard.fallbackTitle', { id: docId }));

  const note = status.filterTag ? (
    <p className={styles.note} role="note" data-testid="documents-library-filter-note">
      {t('browser.showingOnlyTag')} <span className={styles.noteStrong}>{status.filterTag}</span>
    </p>
  ) : undefined;

  return (
    <div className={docked ? styles.layoutDocked : undefined}>
      <div className={styles.main}>
        <p className={styles.note} role="status">
          {unavailable ? (
            <span data-testid="documents-library-unavailable">{t('page.unavailable')}</span>
          ) : null}
        </p>
        <ObjectList
          list={list}
          config={config}
          labels={labels}
          {...rows}
          note={note}
          headingRef={headingRef}
        />
      </div>
      {docId !== null ? (
        <div className={docked ? styles.panelSlot : undefined}>
          <SidePanel
            id="documents-library-sheet"
            testId={SHEET_TEST_ID}
            open
            title={panelTitle}
            returnFocusRef={returnFocusRef}
            focusKey={docId}
            restoreFocusOnUnmount
            skipOpenerRef={skipOpenerRef}
            onClose={closeSheet}
          >
            <DocumentSheet
              key={docId}
              docId={docId}
              paperlessUrl={status.paperlessUrl}
              onUnavailable={handleUnavailable}
              onTitle={(title) => setLoadedTitle({ id: docId, title })}
              onLinksChanged={reloadLinkedIds}
            />
          </SidePanel>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Documents: the Paperless library on the object-list template, with a details side panel
 * (`?doc=<id>`). Only reachable when Paperless is configured (the route gate redirects
 * otherwise); this page still handles the status itself: checking, not connected, unreachable.
 */
export function DocumentsPage() {
  const { t } = useTranslation('documents');
  const { t: tCommon } = useTranslation('common');
  useDocumentTitle(tCommon('navigation.documents'));
  const [status, setStatus] = useState<PaperlessStatusResponse | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPaperlessStatus()
      .then((response) => {
        if (cancelled) return;
        setStatus(response);
        setStatusFailed(false);
      })
      .catch(() => {
        if (!cancelled) setStatusFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setStatus(null);
    setStatusFailed(false);
    setAttempt((n) => n + 1);
  };

  const title = tCommon('navigation.documents');

  if (status === null && !statusFailed) {
    return (
      <PageLayout title={title}>
        <Skeleton />
      </PageLayout>
    );
  }

  if (status !== null && !status.configured) {
    return (
      <PageLayout title={title}>
        <div className={styles.infoState}>
          <h2 className={styles.stateTitle}>{t('browser.notConfigured')}</h2>
          <p className={styles.stateText}>
            {t('browser.notConfiguredMessage')}{' '}
            <IntegrationsLink anchor="paperless" testId="documents-library-integrations-link" />
          </p>
        </div>
      </PageLayout>
    );
  }

  if (status === null || !status.reachable) {
    return (
      <PageLayout title={title}>
        <div className={styles.errorState} role="alert" data-testid="documents-library-unreachable">
          <h2 className={styles.stateTitle}>{t('browser.unreachable')}</h2>
          <p className={styles.stateText}>{t('browser.unreachableMessage')}</p>
          <div className={styles.stateActions}>
            <button
              type="button"
              className={styles.retryButton}
              onClick={retry}
              data-testid="documents-library-retry"
            >
              {t('browser.tryAgain')}
            </button>
            <IntegrationsLink anchor="paperless" testId="documents-library-integrations-link" />
          </div>
        </div>
      </PageLayout>
    );
  }

  return <DocumentsLibrary status={status} />;
}

export default DocumentsPage;
