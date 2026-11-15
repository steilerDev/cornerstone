import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PaperlessDocument } from '@cornerstone/shared';
import { DocumentDetailPanel } from '../../components/documents/DocumentDetailPanel.js';
import { FormError } from '../../components/FormError/FormError.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { getPaperlessDocument } from '../../lib/paperlessApi.js';
import { DocumentLinkedToList } from './DocumentLinkedToList.js';
import styles from './DocumentsPage.module.css';

export interface DocumentSheetProps {
  readonly docId: number;
  /** Browser-facing Paperless base URL; null hides Open in Paperless. */
  readonly paperlessUrl: string | null;
  /** The detail answered 404: the host closes the panel and says so. */
  readonly onUnavailable: () => void;
  /** The document's title once loaded (the panel heading). */
  readonly onTitle: (title: string) => void;
  /** After every link, unlink or undo. */
  readonly onLinksChanged: () => void;
}

/**
 * Body of the Documents page side panel: the document's details (loaded in full, the list rows
 * carry no content) and its "Linked to" list.
 */
export function DocumentSheet({
  docId,
  paperlessUrl,
  onUnavailable,
  onTitle,
  onLinksChanged,
}: DocumentSheetProps) {
  const { t } = useTranslation('documents');
  const [document, setDocument] = useState<PaperlessDocument | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // A different document starts from a loading state.
  const [shownId, setShownId] = useState(docId);
  if (shownId !== docId) {
    setShownId(docId);
    setDocument(null);
    setFailed(false);
  }

  // The host's callbacks are read when a response arrives, so only the document and Try again reload.
  const callbacksRef = useRef({ onUnavailable, onTitle });
  useEffect(() => {
    callbacksRef.current = { onUnavailable, onTitle };
  });

  useEffect(() => {
    let cancelled = false;
    getPaperlessDocument(docId)
      .then((response) => {
        if (cancelled) return;
        setDocument(response.document);
        setFailed(false);
        callbacksRef.current.onTitle(response.document.title);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiClientError && err.statusCode === 404) {
          callbacksRef.current.onUnavailable();
        } else {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [docId, attempt]);

  return (
    <div className={styles.sheetBody} data-testid="documents-library-sheet-body">
      {document !== null ? (
        <DocumentDetailPanel
          variant="sheet"
          document={{ ...document, searchHit: null }}
          paperlessBaseUrl={paperlessUrl ?? undefined}
        />
      ) : failed ? (
        <div className={styles.sheetError}>
          <FormError message={t('sheet.detailFailed')} />
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
            data-testid="documents-library-sheet-retry"
          >
            {t('browser.tryAgain')}
          </button>
        </div>
      ) : (
        <Skeleton />
      )}
      <DocumentLinkedToList paperlessDocumentId={docId} onLinksChanged={onLinksChanged} />
    </div>
  );
}

export default DocumentSheet;
