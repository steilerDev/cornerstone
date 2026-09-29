import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { PaperlessDocumentSearchResult } from '@cornerstone/shared';
import { usePaperless } from '../../hooks/usePaperless.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { DocumentCard } from './DocumentCard.js';
import { DocumentDetailPanel } from './DocumentDetailPanel.js';
import { DocumentSkeleton } from './DocumentSkeleton.js';
import { InfiniteScrollFooter } from '../InfiniteScrollFooter/InfiniteScrollFooter.js';
import { findScrollParent } from '../../lib/scrollParent.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './DocumentBrowser.module.css';

interface DocumentBrowserProps {
  mode?: 'page' | 'modal';
  /** When provided, clicking a card calls this instead of showing the detail panel. */
  onSelect?: (doc: PaperlessDocumentSearchResult) => void;
  /** Paperless-ngx document IDs that are already linked (will be filtered when hideLinked is true). */
  linkedDocumentIds?: number[];
  /** Default checked state for the hide-linked toggle. Defaults to false. */
  defaultHideLinked?: boolean;
  /** When provided, passes to DocumentCard to enable "Open in Paperless" anchor. */
  paperlessUrl?: string | null;
  /** When provided, filters documents to this correspondent ID. */
  correspondentId?: number | null;
}

const GRID_ID = 'document-grid';

// Stable empty-array default (avoids unstable reference on every render)
const EMPTY_LINKED_DOCUMENT_IDS: number[] = [];

export function DocumentBrowser({
  mode = 'page',
  onSelect,
  linkedDocumentIds = EMPTY_LINKED_DOCUMENT_IDS,
  defaultHideLinked = false,
  paperlessUrl,
  correspondentId,
}: DocumentBrowserProps) {
  const { t } = useTranslation('documents');
  const browserNodeRef = useRef<HTMLDivElement | null>(null);
  const [scrollRoot, setScrollRoot] = useState<Element | null>(null);
  const browserRef = useCallback((node: HTMLDivElement | null) => {
    browserNodeRef.current = node;
    setScrollRoot(node ? findScrollParent(node) : null);
  }, []);
  const hook = usePaperless({ correspondentId, scrollRoot });
  const [selectedDoc, setSelectedDoc] = useState<PaperlessDocumentSearchResult | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [hideLinked, setHideLinked] = useState(defaultHideLinked);

  // Forward correspondent prop changes to the hook
  useEffect(() => {
    hook.setCorrespondent(correspondentId ?? null);
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- setCorrespondent is stable callback; only depend on correspondentId to trigger filter updates
  }, [correspondentId]);

  // Debounced search
  const debouncedSearchInput = useDebounce(searchInput, 300);
  const isFirstSearchRunRef = useRef(true);

  useEffect(() => {
    if (isFirstSearchRunRef.current) {
      isFirstSearchRunRef.current = false;
      return;
    }
    hook.search(debouncedSearchInput);
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- hook is not directly used; it's queried via ref to avoid re-running on every hook change
  }, [debouncedSearchInput]);

  const linkedIdSet = useMemo(() => new Set(linkedDocumentIds), [linkedDocumentIds]);
  const visibleDocuments = hideLinked
    ? hook.documents.filter((doc) => !linkedIdSet.has(doc.id))
    : hook.documents;

  // Auto-advance: when every loaded document is hidden, the sentinel is not mounted, so the
  // observer cannot request the next batch — do it here.
  const { listStatus, hasMore, loadMore } = hook;
  const visibleCount = visibleDocuments.length;
  useEffect(() => {
    if (visibleCount === 0 && listStatus === 'idle' && hasMore) {
      loadMore();
    }
  }, [visibleCount, listStatus, hasMore, loadMore]);

  // Scroll back to the top when the list resets (search / tags / correspondent / refresh)
  const isFirstResetRunRef = useRef(true);
  useEffect(() => {
    if (isFirstResetRunRef.current) {
      isFirstResetRunRef.current = false;
      return;
    }
    if (scrollRoot) {
      scrollRoot.scrollTop = 0;
    } else if (browserNodeRef.current && browserNodeRef.current.getBoundingClientRect().top < 0) {
      browserNodeRef.current.scrollIntoView?.({ block: 'start' });
    }
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- only a list reset should scroll
  }, [hook.resetKey]);

  // Screen-reader announcements. Counts newly VISIBLE documents (not raw batch size) so hidden
  // linked documents are not announced.
  const announcementRef = useRef<HTMLDivElement | null>(null);
  const announcedSeqRef = useRef(0);
  const knownRawIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const node = announcementRef.current;
    if (!node) return;
    const { fetchSequence, listStatus, hasMore, documents } = hook;
    if (fetchSequence === 0) {
      announcedSeqRef.current = 0;
      return;
    }
    if (listStatus === 'loading') {
      node.textContent = t('browser.infiniteScroll.loadingMore');
      return;
    }
    if (fetchSequence === announcedSeqRef.current) return;
    if (fetchSequence === 1) knownRawIdsRef.current.clear();
    const known = knownRawIdsRef.current;
    const newVisible = documents.filter(
      (d) => !known.has(d.id) && (!hideLinked || !linkedIdSet.has(d.id)),
    ).length;
    for (const d of documents) known.add(d.id);
    if (fetchSequence === 1 && visibleDocuments.length > 0) {
      node.textContent = t('browser.infiniteScroll.initialLoadAnnouncement', {
        count: visibleDocuments.length,
      });
    } else if (newVisible > 0) {
      node.textContent = t(
        hasMore
          ? 'browser.infiniteScroll.batchAppendedAnnouncement'
          : 'browser.infiniteScroll.batchAppendedAndEndAnnouncement',
        { count: newVisible },
      );
    } else if (!hasMore) {
      node.textContent = t('browser.infiniteScroll.endOfListAnnouncement');
    }
    announcedSeqRef.current = fetchSequence;
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- keyed on fetch progress; visible-list values are read at that moment
  }, [
    hook.fetchSequence,
    hook.listStatus,
    hook.hasMore,
    hook.documents,
    hideLinked,
    linkedIdSet,
    t,
  ]);

  const handleCardSelect = (doc: PaperlessDocumentSearchResult) => {
    if (onSelect) {
      onSelect(doc);
      return;
    }
    setSelectedDoc((prev) => (prev?.id === doc.id ? null : doc));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent, tagId: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      hook.toggleTag(tagId);
    }
  };

  const gridClass = mode === 'modal' ? styles.gridModal : styles.grid;

  // Status: still checking
  if (hook.status === null) {
    return (
      <div className={styles.browser}>
        <div className={styles.infoState} aria-busy="true">
          <p className={styles.infoText}>{t('browser.checkingConnection')}</p>
        </div>
      </div>
    );
  }

  // Status: not configured
  if (!hook.status.configured) {
    return (
      <div className={styles.browser}>
        <div className={styles.infoState}>
          <h2 className={styles.infoTitle}>{t('browser.notConfigured')}</h2>
          <p className={styles.infoText}>{t('browser.notConfiguredMessage')}</p>
        </div>
      </div>
    );
  }

  // Status: configured but unreachable
  if (!hook.status.reachable) {
    return (
      <div className={styles.browser}>
        <div className={styles.errorState} role="alert">
          <h2 className={styles.errorTitle}>{t('browser.unreachable')}</h2>
          <p className={styles.errorText}>{t('browser.unreachableMessage')}</p>
          <button type="button" className={styles.retryButton} onClick={hook.refresh}>
            {t('browser.tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  // Normal browser rendering
  return (
    <div className={styles.browser} ref={browserRef}>
      {/* Search bar and hide-linked toggle */}
      <div className={styles.searchRow}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder={t('browser.searchPlaceholder')}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label={t('browser.searchDocumentsAriaLabel')}
          aria-controls={GRID_ID}
        />
        {linkedDocumentIds !== undefined && (
          <label className={styles.hideLinkedToggle}>
            <input
              type="checkbox"
              checked={hideLinked}
              onChange={(e) => setHideLinked(e.target.checked)}
              className={styles.hideLinkedCheckbox}
            />
            <span className={styles.hideLinkedLabel}>{t('browser.hideLinked')}</span>
          </label>
        )}
      </div>

      {/* Server-side filter tag indicator */}
      {hook.status.filterTag && (
        <div
          className={styles.filterBanner}
          role="note"
          aria-label={t('browser.filterBannerLabel')}
        >
          <span className={styles.filterBannerText}>
            {t('browser.showingOnlyTag')}{' '}
            <span className={styles.filterBannerTag}>{hook.status.filterTag}</span>
          </span>
        </div>
      )}

      {/* Tag filter strip */}
      {hook.tags.length > 0 && (
        <div className={styles.tagStrip} role="group" aria-label={t('browser.filterByTag')}>
          {hook.tags.map((tag) => {
            const isChecked = hook.selectedTags.includes(tag.id);
            const count = hook.tagCountMap.get(tag.id) ?? tag.documentCount;
            return (
              <span
                key={tag.id}
                className={`${styles.tagChip} ${isChecked ? styles.tagChipActive : ''}`}
                role="checkbox"
                aria-checked={isChecked}
                aria-label={`${t('browser.filterByTag')}: ${tag.name} (${t('browser.documentsCount', { count })})`}
                tabIndex={0}
                onClick={() => hook.toggleTag(tag.id)}
                onKeyDown={(e) => handleTagKeyDown(e, tag.id)}
              >
                {tag.name}
                {count > 0 && <span className={styles.tagCount}>{count}</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* Document grid */}
      {visibleDocuments.length === 0 &&
      (hook.listStatus === 'loading' || hook.listStatus === 'idle') ? (
        <div
          className={gridClass}
          role="list"
          id={GRID_ID}
          aria-label={t('browser.documentsGridLabel')}
          aria-busy="true"
        >
          <DocumentSkeleton count={mode === 'modal' ? 4 : 6} />
        </div>
      ) : visibleDocuments.length === 0 && hook.listStatus === 'error' ? (
        <div className={styles.errorState} role="alert">
          <p className={styles.errorText}>{hook.error}</p>
          <button type="button" className={styles.retryButton} onClick={hook.retry}>
            {t('browser.tryAgain')}
          </button>
        </div>
      ) : visibleDocuments.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>
            {hideLinked && linkedDocumentIds.length > 0
              ? t('browser.noAdditionalDocuments')
              : hook.query || hook.selectedTags.length > 0
                ? t('browser.noDocumentsMatch')
                : t('browser.noDocuments')}
          </p>
          {(hook.query || hook.selectedTags.length > 0 || hideLinked) && (
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => {
                setSearchInput('');
                hook.search('');
                setHideLinked(false);
              }}
            >
              {t('browser.clearFilters')}
            </button>
          )}
        </div>
      ) : (
        <>
          <div
            className={gridClass}
            role="list"
            id={GRID_ID}
            aria-label={t('browser.documentsGridLabel')}
            aria-busy="false"
          >
            {visibleDocuments.map((doc) => (
              <div key={doc.id} role="listitem">
                <DocumentCard
                  document={doc}
                  isSelected={selectedDoc?.id === doc.id}
                  onSelect={handleCardSelect}
                  ariaControls={selectedDoc?.id === doc.id ? 'detail-panel' : undefined}
                  paperlessUrl={paperlessUrl}
                />
              </div>
            ))}
          </div>
          <InfiniteScrollFooter
            status={hook.listStatus}
            loadingLabel={t('browser.infiniteScroll.loadingMore')}
            loadingAriaLabel={t('browser.infiniteScroll.loadingMoreAriaLabel')}
            loadMoreLabel={t('browser.infiniteScroll.loadMoreButton')}
            retryLabel={t('browser.infiniteScroll.retryButton')}
            errorMessage={t('browser.infiniteScroll.errorMessage')}
            endOfListMessage={t('browser.infiniteScroll.endOfList')}
            sentinelRef={hook.sentinelRef}
            onLoadMore={hook.loadMore}
            onRetry={hook.retry}
            testIdPrefix="paperless-documents"
          />
        </>
      )}

      {/* Detail panel — shown below the grid when a card is selected (page mode only) */}
      {selectedDoc && !onSelect && (
        <DocumentDetailPanel
          document={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          paperlessBaseUrl={hook.status.paperlessUrl ?? undefined}
        />
      )}

      <div ref={announcementRef} className={sharedStyles.srOnly} role="status" aria-atomic="true" />
    </div>
  );
}
