import { useState, useRef, useEffect } from 'react';
import type { PaperlessDocumentSearchResult } from '@cornerstone/shared';
import { usePaperless } from '../../hooks/usePaperless.js';
import { DocumentCard } from './DocumentCard.js';
import { DocumentDetailPanel } from './DocumentDetailPanel.js';
import { DocumentSkeleton } from './DocumentSkeleton.js';
import styles from './DocumentBrowser.module.css';

interface DocumentBrowserProps {
  mode?: 'page' | 'modal';
  /** When provided, clicking a card calls this instead of showing the detail panel. */
  onSelect?: (doc: PaperlessDocumentSearchResult) => void;
  /** Paperless-ngx document IDs that are already linked (will be filtered when hideLinked is true). */
  linkedDocumentIds?: number[];
}

const GRID_ID = 'document-grid';

export function DocumentBrowser({
  mode = 'page',
  onSelect,
  linkedDocumentIds = [],
}: DocumentBrowserProps) {
  const hook = usePaperless();
  const [selectedDoc, setSelectedDoc] = useState<PaperlessDocumentSearchResult | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [hideLinked, setHideLinked] = useState(true);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search — intentionally omits hook.search from dep array to prevent infinite loop
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      hook.search(searchInput);
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

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

  // Filter documents if hideLinked is enabled
  const filteredDocuments = hideLinked
    ? hook.documents.filter((doc) => !linkedDocumentIds.includes(doc.id))
    : hook.documents;

  // Status: still checking
  if (hook.status === null) {
    return (
      <div className={styles.browser}>
        <div className={styles.infoState} aria-busy="true">
          <p className={styles.infoText}>Checking Paperless-ngx connection...</p>
        </div>
      </div>
    );
  }

  // Status: not configured
  if (!hook.status.configured) {
    return (
      <div className={styles.browser}>
        <div className={styles.infoState}>
          <h2 className={styles.infoTitle}>Paperless-ngx Not Configured</h2>
          <p className={styles.infoText}>
            To use the document browser, configure your Paperless-ngx integration by setting the{' '}
            <code className={styles.inlineCode}>PAPERLESS_URL</code> and{' '}
            <code className={styles.inlineCode}>PAPERLESS_API_TOKEN</code> environment variables and
            restarting Cornerstone.
          </p>
        </div>
      </div>
    );
  }

  // Status: configured but unreachable
  if (!hook.status.reachable) {
    return (
      <div className={styles.browser}>
        <div className={styles.errorState} role="alert">
          <h2 className={styles.errorTitle}>Paperless-ngx Unreachable</h2>
          <p className={styles.errorText}>
            Unable to connect to your Paperless-ngx instance. Please check your configuration and
            ensure Paperless-ngx is running.
          </p>
          <button type="button" className={styles.retryButton} onClick={hook.refresh}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Normal browser rendering
  return (
    <div className={styles.browser}>
      {/* Search bar and hide-linked toggle */}
      <div className={styles.searchRow}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search documents..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search documents"
          aria-controls={GRID_ID}
        />
        {linkedDocumentIds.length > 0 && (
          <label className={styles.hideLinkedToggle}>
            <input
              type="checkbox"
              checked={hideLinked}
              onChange={(e) => setHideLinked(e.target.checked)}
              className={styles.hideLinkedCheckbox}
            />
            <span className={styles.hideLinkedLabel}>Hide linked</span>
          </label>
        )}
      </div>

      {/* Server-side filter tag indicator */}
      {hook.status.filterTag && (
        <div className={styles.filterBanner} role="note" aria-label="Active document filter">
          <span className={styles.filterBannerText}>
            Showing only documents tagged{' '}
            <span className={styles.filterBannerTag}>{hook.status.filterTag}</span>
          </span>
        </div>
      )}

      {/* Tag filter strip */}
      {hook.tags.length > 0 && (
        <div className={styles.tagStrip} role="group" aria-label="Filter by tag">
          {hook.tags.map((tag) => {
            const isChecked = hook.selectedTags.includes(tag.id);
            return (
              <span
                key={tag.id}
                className={`${styles.tagChip} ${isChecked ? styles.tagChipActive : ''}`}
                role="checkbox"
                aria-checked={isChecked}
                aria-label={`Filter by tag: ${tag.name} (${tag.documentCount} documents)`}
                tabIndex={0}
                onClick={() => hook.toggleTag(tag.id)}
                onKeyDown={(e) => handleTagKeyDown(e, tag.id)}
              >
                {tag.name}
                {tag.documentCount > 0 && (
                  <span className={styles.tagCount}>{tag.documentCount}</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Document grid */}
      {hook.isLoading ? (
        <div className={gridClass} role="list" id={GRID_ID} aria-label="Documents" aria-busy="true">
          <DocumentSkeleton count={mode === 'modal' ? 4 : 6} />
        </div>
      ) : hook.error ? (
        <div className={styles.errorState} role="alert">
          <p className={styles.errorText}>{hook.error}</p>
          <button type="button" className={styles.retryButton} onClick={hook.refresh}>
            Try Again
          </button>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>
            {hideLinked && linkedDocumentIds.length > 0
              ? 'No additional documents available to link.'
              : hook.query || hook.selectedTags.length > 0
                ? 'No documents match your search.'
                : 'No documents found.'}
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
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div
          className={gridClass}
          role="list"
          id={GRID_ID}
          aria-label="Documents"
          aria-busy="false"
        >
          {filteredDocuments.map((doc) => (
            <div key={doc.id} role="listitem">
              <DocumentCard
                document={doc}
                isSelected={selectedDoc?.id === doc.id}
                onSelect={handleCardSelect}
                ariaControls={selectedDoc?.id === doc.id ? 'detail-panel' : undefined}
              />
            </div>
          ))}
        </div>
      )}

      {/* Detail panel — shown below the grid when a card is selected (page mode only) */}
      {selectedDoc && !onSelect && (
        <DocumentDetailPanel
          document={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          paperlessBaseUrl={hook.status.paperlessUrl ?? undefined}
        />
      )}

      {/* Pagination */}
      {hook.pagination && hook.pagination.totalPages > 1 && (
        <nav className={styles.pagination} aria-label="Document pagination">
          <button
            type="button"
            className={styles.pageButton}
            onClick={() => hook.setPage(hook.pagination!.page - 1)}
            disabled={hook.pagination.page === 1}
            aria-label="Previous page"
          >
            &#x2190; Previous
          </button>
          <span className={styles.pageInfo}>
            Page {hook.pagination.page} of {hook.pagination.totalPages}
          </span>
          <button
            type="button"
            className={styles.pageButton}
            onClick={() => hook.setPage(hook.pagination!.page + 1)}
            disabled={hook.pagination.page === hook.pagination.totalPages}
            aria-label="Next page"
          >
            Next &#x2192;
          </button>
        </nav>
      )}
    </div>
  );
}
