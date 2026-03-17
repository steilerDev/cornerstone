import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('documents');
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
    <div className={styles.browser}>
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
        {linkedDocumentIds.length > 0 && (
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
      {hook.isLoading ? (
        <div
          className={gridClass}
          role="list"
          id={GRID_ID}
          aria-label={t('browser.documentsGridLabel')}
          aria-busy="true"
        >
          <DocumentSkeleton count={mode === 'modal' ? 4 : 6} />
        </div>
      ) : hook.error ? (
        <div className={styles.errorState} role="alert">
          <p className={styles.errorText}>{hook.error}</p>
          <button type="button" className={styles.retryButton} onClick={hook.refresh}>
            {t('browser.tryAgain')}
          </button>
        </div>
      ) : filteredDocuments.length === 0 ? (
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
        <div
          className={gridClass}
          role="list"
          id={GRID_ID}
          aria-label={t('browser.documentsGridLabel')}
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
            aria-label={t('browser.previousPage')}
          >
            &#x2190; {t('browser.previous')}
          </button>
          <span className={styles.pageInfo}>
            {t('browser.pageInfo', {
              page: hook.pagination.page,
              totalPages: hook.pagination.totalPages,
            })}
          </span>
          <button
            type="button"
            className={styles.pageButton}
            onClick={() => hook.setPage(hook.pagination!.page + 1)}
            disabled={hook.pagination.page === hook.pagination.totalPages}
            aria-label={t('browser.nextPage')}
          >
            {t('browser.next')} &#x2192;
          </button>
        </nav>
      )}
    </div>
  );
}
