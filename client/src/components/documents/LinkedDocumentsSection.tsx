import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  DocumentLinkWithMetadata,
  DocumentLinkEntityType,
  PaperlessDocumentSearchResult,
} from '@cornerstone/shared';
import { getPaperlessStatus } from '../../lib/paperlessApi.js';
import { useDocumentLinks } from '../../hooks/useDocumentLinks.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { LinkedDocumentCard } from './LinkedDocumentCard.js';
import { DocumentBrowser } from './DocumentBrowser.js';
import { DocumentDetailPanel } from './DocumentDetailPanel.js';
import { DocumentSkeleton } from './DocumentSkeleton.js';
import styles from './LinkedDocumentsSection.module.css';

interface LinkedDocumentsSectionProps {
  entityType: DocumentLinkEntityType;
  entityId: string;
}

export function LinkedDocumentsSection({ entityType, entityId }: LinkedDocumentsSectionProps) {
  const hook = useDocumentLinks(entityType, entityId);

  // Copy for different entity types
  const entityCopy = {
    work_item: {
      pickerSubtitle: 'Select a document from Paperless-ngx to link to this work item.',
      unlinkBody: 'this work item',
      emptyBody:
        'Link receipts, contracts, and plans from Paperless-ngx to keep everything in one place.',
    },
    household_item: {
      pickerSubtitle: 'Select a document from Paperless-ngx to link to this household item.',
      unlinkBody: 'this household item',
      emptyBody:
        'Link receipts, warranties, and manuals from Paperless-ngx to keep everything in one place.',
    },
    invoice: {
      pickerSubtitle: 'Select a document from Paperless-ngx to link to this invoice.',
      unlinkBody: 'this invoice',
      emptyBody:
        'Link invoice PDFs, receipts, and related documents from Paperless-ngx to keep everything in one place.',
    },
  } as const satisfies Record<
    DocumentLinkEntityType,
    { pickerSubtitle: string; unlinkBody: string; emptyBody: string }
  >;

  const copy = entityCopy[entityType];

  // Paperless status state
  const [paperlessStatus, setPaperlessStatus] = useState<Awaited<
    ReturnType<typeof getPaperlessStatus>
  > | null>(null);

  // Modal and interaction states
  const [showPicker, setShowPicker] = useState(false);
  const [viewingLink, setViewingLink] = useState<DocumentLinkWithMetadata | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<DocumentLinkWithMetadata | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [announceMessage, setAnnounceMessage] = useState('');
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const pickerModalRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Load Paperless status on mount
  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const status = await getPaperlessStatus();
        if (!cancelled) {
          setPaperlessStatus(status);
        }
      } catch {
        if (!cancelled) {
          setPaperlessStatus({
            configured: false,
            reachable: false,
            error: 'Failed to check status',
            paperlessUrl: null,
            filterTag: null,
          });
        }
      }
    }

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  // Focus into picker modal when it opens
  useEffect(() => {
    if (showPicker && pickerModalRef.current) {
      setTimeout(() => {
        pickerModalRef.current?.focus();
      }, 0);
    }
  }, [showPicker]);

  // Focus Cancel button when unlink confirmation opens
  useEffect(() => {
    if (unlinkTarget && cancelButtonRef.current) {
      setTimeout(() => {
        cancelButtonRef.current?.focus();
      }, 0);
    }
  }, [unlinkTarget]);

  const closePicker = useCallback(() => {
    setShowPicker(false);
    // Restore focus to add button
    setTimeout(() => {
      addButtonRef.current?.focus();
    }, 0);
  }, []);

  // Close modals on Escape key and implement focus trap for picker modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape' && e.key !== 'Tab') return;

      if (e.key === 'Escape') {
        if (showPicker) {
          closePicker();
          return;
        }
        if (unlinkTarget && !isUnlinking) {
          setUnlinkTarget(null);
        }
        return;
      }

      // Tab key: trap focus within picker modal
      if (e.key === 'Tab' && showPicker && pickerModalRef.current) {
        const focusable = pickerModalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const focusableArray = Array.from(focusable);
        if (focusableArray.length === 0) return;

        const firstEl = focusableArray[0];
        const lastEl = focusableArray[focusableArray.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showPicker, unlinkTarget, isUnlinking, closePicker]);

  const handleDocumentSelect = useCallback(
    async (doc: PaperlessDocumentSearchResult) => {
      // Close picker immediately on selection
      setShowPicker(false);

      try {
        await hook.addLink(doc.id);
        // Announce success to screen readers
        setAnnounceMessage(`Document linked: ${doc.title}`);
        setTimeout(() => setAnnounceMessage(''), 3000);
      } catch (err) {
        if (err instanceof ApiClientError && err.error.code === 'DUPLICATE_DOCUMENT_LINK') {
          setLinkError(`This document is already linked to ${copy.unlinkBody}.`);
        } else {
          setLinkError('Failed to link document. Please try again.');
        }
      }

      // Restore focus to add button
      setTimeout(() => {
        addButtonRef.current?.focus();
      }, 0);
    },
    [hook, copy],
  );

  const handleUnlink = useCallback(async () => {
    if (!unlinkTarget) return;

    setIsUnlinking(true);
    try {
      await hook.removeLink(unlinkTarget.id);
      // Announce removal to screen readers
      setAnnounceMessage(`Document unlinked: ${unlinkTarget.document?.title ?? 'document'}`);
      setTimeout(() => setAnnounceMessage(''), 3000);
    } catch {
      setLinkError('Failed to unlink document. Please try again.');
    } finally {
      setUnlinkTarget(null);
      setIsUnlinking(false);
      // Restore focus to add button
      setTimeout(() => {
        addButtonRef.current?.focus();
      }, 0);
    }
  }, [unlinkTarget, hook]);

  return (
    <section aria-labelledby="documents-section-title" className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 id="documents-section-title" className={styles.sectionTitle}>
          Documents
          {!hook.isLoading && hook.links.length > 0 && (
            <span
              className={styles.countBadge}
              aria-label={`${hook.links.length} documents linked`}
            >
              {hook.links.length}
            </span>
          )}
        </h2>
        <button
          type="button"
          ref={addButtonRef}
          className={styles.addButton}
          disabled={!paperlessStatus?.configured || hook.isLoading}
          onClick={() => {
            setShowPicker(true);
            setLinkError(null);
          }}
          title={!paperlessStatus?.configured ? 'Paperless-ngx is not configured' : undefined}
        >
          + Add Document
        </button>
      </div>

      {/* Live region for screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" className={styles.srOnly}>
        {announceMessage}
      </div>

      {/* Link error banner (e.g., duplicate) */}
      {linkError && (
        <div className={styles.errorBanner} role="alert">
          <span>{linkError}</span>
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => setLinkError(null)}
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading state */}
      {hook.isLoading && (
        <div className={styles.skeletonStrip}>
          <DocumentSkeleton count={2} />
        </div>
      )}

      {/* Error state */}
      {hook.error && !hook.isLoading && (
        <div className={styles.errorBanner} role="alert">
          <span>{hook.error}</span>
          <button type="button" className={styles.retryButton} onClick={hook.refresh}>
            Retry
          </button>
        </div>
      )}

      {/* Not configured state */}
      {paperlessStatus && !paperlessStatus.configured && !hook.isLoading && !hook.error && (
        <div className={styles.notConfiguredBanner}>
          <span className={styles.notConfiguredIcon}>ℹ️</span>
          <div>
            <p className={styles.notConfiguredTitle}>Paperless-ngx is not configured</p>
            <p className={styles.notConfiguredBody}>
              Set PAPERLESS_URL and PAPERLESS_API_TOKEN environment variables and restart
              Cornerstone to enable document linking.
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hook.isLoading && !hook.error && paperlessStatus?.configured && hook.links.length === 0 && (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📄</span>
          <p className={styles.emptyTitle}>No documents linked yet</p>
          <p className={styles.emptyBody}>{copy.emptyBody}</p>
        </div>
      )}

      {/* Linked document cards */}
      {hook.links.length > 0 && (
        <div
          className={styles.cardStrip}
          id="document-strip"
          role="list"
          aria-label="Linked documents"
        >
          {hook.links.map((link) => (
            <div key={link.id} role="listitem">
              <LinkedDocumentCard
                link={link}
                paperlessBaseUrl={paperlessStatus?.paperlessUrl ?? null}
                onView={(l) => setViewingLink(l)}
                onUnlink={(l) => setUnlinkTarget(l)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Inline detail panel */}
      {viewingLink?.document && (
        <div className={styles.detailPanel}>
          <DocumentDetailPanel
            document={{ ...viewingLink.document, searchHit: null }}
            onClose={() => setViewingLink(null)}
            paperlessBaseUrl={paperlessStatus?.paperlessUrl ?? undefined}
          />
        </div>
      )}

      {/* Add Document picker modal */}
      {showPicker && (
        <div className={styles.modal}>
          <div className={styles.modalBackdrop} onClick={closePicker} />
          <div
            ref={pickerModalRef}
            className={`${styles.modalContent} ${styles.modalContentLarge}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="picker-title"
            tabIndex={-1}
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 id="picker-title" className={styles.modalTitle}>
                  Add Document
                </h2>
                <p className={styles.modalSubtitle}>{copy.pickerSubtitle}</p>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={closePicker}
                aria-label="Close document picker"
              >
                ×
              </button>
            </div>
            <div className={styles.pickerBody}>
              <DocumentBrowser
                mode="modal"
                onSelect={handleDocumentSelect}
                linkedDocumentIds={hook.links
                  .map((link) => link.document?.id)
                  .filter((id): id is number => id !== undefined)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Unlink confirmation modal */}
      {unlinkTarget && (
        <div className={styles.modal}>
          <div
            className={styles.modalBackdrop}
            onClick={() => !isUnlinking && setUnlinkTarget(null)}
          />
          <div
            className={styles.modalContent}
            role="dialog"
            aria-modal="true"
            aria-labelledby="unlink-title"
          >
            <h2 id="unlink-title" className={styles.modalTitle}>
              Unlink Document?
            </h2>
            <p className={styles.modalText}>
              &ldquo;{unlinkTarget.document?.title ?? 'This document'}&rdquo; will be removed from{' '}
              {copy.unlinkBody}. The document will remain in Paperless-ngx.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                ref={cancelButtonRef}
                className={styles.modalCancelButton}
                onClick={() => setUnlinkTarget(null)}
                disabled={isUnlinking}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalDeleteButton}
                onClick={handleUnlink}
                disabled={isUnlinking}
              >
                {isUnlinking ? 'Unlinking…' : 'Unlink'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
