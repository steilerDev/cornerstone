import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { DiaryEntryDetail, DailyLogMetadata, SiteVisitMetadata, DiarySignatureEntry } from '@cornerstone/shared';
import { getDiaryEntry, deleteDiaryEntry } from '../../lib/diaryApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { usePhotos } from '../../hooks/usePhotos.js';
import { formatDate, formatDateTime } from '../../lib/formatters.js';
import { DiaryEntryTypeBadge } from '../../components/diary/DiaryEntryTypeBadge/DiaryEntryTypeBadge.js';
import { DiaryMetadataSummary } from '../../components/diary/DiaryMetadataSummary/DiaryMetadataSummary.js';
import { SignatureDisplay } from '../../components/diary/SignatureDisplay/SignatureDisplay.js';
import { PhotoGrid } from '../../components/photos/PhotoGrid.js';
import { PhotoViewer } from '../../components/photos/PhotoViewer.js';
import shared from '../../styles/shared.module.css';
import styles from './DiaryEntryDetailPage.module.css';

export default function DiaryEntryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [entry, setEntry] = useState<DiaryEntryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  // Photo state
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const photosResult = usePhotos(id ? 'diary_entry' : '', id || '');

  useEffect(() => {
    if (!id) {
      setError('Invalid diary entry ID');
      setIsLoading(false);
      return;
    }

    const loadEntry = async () => {
      setIsLoading(true);
      setError('');
      try {
        const data = await getDiaryEntry(id);
        setEntry(data);
      } catch (err) {
        if (err instanceof ApiClientError) {
          if (err.statusCode === 404) {
            setError('Diary entry not found');
          } else {
            setError(err.error.message);
          }
        } else {
          setError('Failed to load diary entry. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadEntry();
  }, [id]);

  // Delete modal: focus trap and Escape key handler
  useEffect(() => {
    if (!showDeleteModal) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeDeleteModal();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
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
  }, [showDeleteModal, isDeleting, deleteError]);

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteError('');
  };

  const handleDelete = async () => {
    if (!entry) return;
    setIsDeleting(true);
    setDeleteError('');

    try {
      await deleteDiaryEntry(entry.id);
      showToast('success', 'Diary entry deleted successfully');
      navigate('/diary');
    } catch (err) {
      setDeleteError('Failed to delete diary entry. Please try again.');
      console.error('Failed to delete diary entry:', err);
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <div className={shared.loading}>Loading entry...</div>;
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={shared.bannerError}>{error}</div>
        <Link to="/diary" className={shared.btnSecondary}>
          Back to Diary
        </Link>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className={styles.page}>
        <div className={shared.emptyState}>
          <p>Diary entry not found.</p>
          <Link to="/diary" className={shared.btnPrimary}>
            Back to Diary
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          ← Back
        </button>
        <div className={styles.actionButtons}>
          <button type="button" className={styles.printButton} onClick={() => window.print()}>
            🖨️ Print
          </button>
          {!entry.isAutomatic && !entry.isSigned && (
            <>
              <Link to={`/diary/${entry.id}/edit`} className={styles.editButton}>
                Edit
              </Link>
              <button
                type="button"
                className={styles.deleteButton}
                onClick={() => setShowDeleteModal(true)}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      <div className={styles.card}>
        <header className={styles.header}>
          <div className={styles.typeBadgeContainer}>
            <DiaryEntryTypeBadge entryType={entry.entryType} size="lg" />
          </div>
          <div className={styles.headerContent}>
            {entry.title && <h1 className={styles.title}>{entry.title}</h1>}
            <div className={styles.meta}>
              <span className={styles.date}>{formatDate(entry.entryDate)}</span>
              <span className={styles.time}>{formatDateTime(entry.createdAt)}</span>
              {entry.createdBy && (
                <span className={styles.author}>by {entry.createdBy.displayName}</span>
              )}
              {entry.isAutomatic && <span className={styles.badge}>Automatic</span>}
            </div>
          </div>
        </header>

        <div className={styles.body}>{entry.body}</div>

        {entry.metadata && (
          <div className={styles.metadataSection}>
            <DiaryMetadataSummary entryType={entry.entryType} metadata={entry.metadata} />
          </div>
        )}

        {/* Signature Display */}
        {entry.metadata &&
          (entry.entryType === 'daily_log' || entry.entryType === 'site_visit') &&
          Array.isArray((entry.metadata as { signatures?: DiarySignatureEntry[] }).signatures) &&
          (entry.metadata as { signatures: DiarySignatureEntry[] }).signatures.map((sig, i) => (
            <div key={i} className={styles.signatureSection}>
              <SignatureDisplay
                signatureDataUrl={sig.signatureDataUrl}
                signerName={sig.signerName}
                signedDate={formatDate(entry.entryDate)}
              />
            </div>
          ))}

        {/* Photos Section */}
        <div className={styles.photoSection}>
          <div className={styles.photoSectionHeader}>
            <h2 className={styles.photoHeading}>Photos ({photosResult.photos.length})</h2>
          </div>

          {photosResult.photos.length === 0 ? (
            <div className={styles.photoEmptyState}>
              <p>No photos attached yet.</p>
              {!entry.isAutomatic && !entry.isSigned && (
                <Link to={`/diary/${entry.id}/edit`} className={styles.addPhotoLink}>
                  Add photos
                </Link>
              )}
            </div>
          ) : (
            <>
              <PhotoGrid
                photos={photosResult.photos}
                onPhotoClick={(photo) => {
                  const index = photosResult.photos.findIndex((p) => p.id === photo.id);
                  setSelectedPhotoIndex(index);
                }}
                loading={photosResult.loading}
              />
            </>
          )}
        </div>

        {/* Photo Viewer Modal */}
        {selectedPhotoIndex !== null && selectedPhotoIndex >= 0 && (
          <PhotoViewer
            photos={photosResult.photos}
            initialIndex={selectedPhotoIndex}
            onClose={() => setSelectedPhotoIndex(null)}
          />
        )}

        {entry.sourceEntityType && entry.sourceEntityId && (
          <div className={styles.sourceSection}>
            <p className={styles.sourceLabel}>Related to:</p>
            <SourceEntityLink sourceType={entry.sourceEntityType} sourceId={entry.sourceEntityId} />
          </div>
        )}

        <div className={styles.timestamps}>
          <div className={styles.timestamp}>
            <span className={styles.label}>Created:</span>
            <span>{formatDateTime(entry.createdAt)}</span>
          </div>
          {entry.updatedAt && (
            <div className={styles.timestamp}>
              <span className={styles.label}>Updated:</span>
              <span>{formatDateTime(entry.updatedAt)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeDeleteModal} />
          <div className={styles.modalContent} ref={modalRef}>
            <h2 id="delete-modal-title" className={styles.modalTitle}>
              Delete Diary Entry
            </h2>
            <p className={styles.modalText}>
              Are you sure you want to delete this diary entry? This action cannot be undone.
            </p>
            {deleteError ? (
              <div className={styles.errorBanner} role="alert">
                {deleteError}
              </div>
            ) : null}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={shared.btnSecondary}
                onClick={closeDeleteModal}
                disabled={isDeleting}
              >
                Cancel
              </button>
              {!deleteError && (
                <button
                  type="button"
                  className={shared.btnConfirmDelete}
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete Entry'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface SourceEntityLinkProps {
  sourceType: string;
  sourceId: string;
}

function SourceEntityLink({ sourceType, sourceId }: SourceEntityLinkProps) {
  const getRoute = (): string | null => {
    switch (sourceType) {
      case 'work_item':
        return `/project/work-items/${sourceId}`;
      case 'invoice':
        return `/budget/invoices/${sourceId}`;
      case 'milestone':
        return `/project/milestones/${sourceId}`;
      case 'budget_source':
        return '/budget/sources';
      case 'subsidy_program':
        return '/budget/subsidies';
      default:
        return null;
    }
  };

  const getLabel = (): string => {
    switch (sourceType) {
      case 'work_item':
        return 'Work Item';
      case 'invoice':
        return 'Invoice';
      case 'milestone':
        return 'Milestone';
      case 'budget_source':
        return 'Budget Sources';
      case 'subsidy_program':
        return 'Subsidy Programs';
      default:
        return sourceType;
    }
  };

  const route = getRoute();
  const label = getLabel();

  if (!route) {
    return <span>{label}</span>;
  }

  return <Link to={route}>{label}</Link>;
}
