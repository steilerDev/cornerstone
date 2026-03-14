import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  DiaryEntryDetail,
  DiaryEntryMetadata,
  DailyLogMetadata,
  SiteVisitMetadata,
  DeliveryMetadata,
  IssueMetadata,
  DiaryWeather,
  DiaryInspectionOutcome,
  DiaryIssueSeverity,
  DiaryIssueResolution,
} from '@cornerstone/shared';
import { getDiaryEntry, updateDiaryEntry, deleteDiaryEntry } from '../../lib/diaryApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { usePhotos } from '../../hooks/usePhotos.js';
import { DiaryEntryTypeBadge } from '../../components/diary/DiaryEntryTypeBadge/DiaryEntryTypeBadge.js';
import { DiaryEntryForm } from '../../components/diary/DiaryEntryForm/DiaryEntryForm.js';
import { PhotoUpload } from '../../components/photos/PhotoUpload.js';
import { PhotoGrid } from '../../components/photos/PhotoGrid.js';
import { PhotoViewer } from '../../components/photos/PhotoViewer.js';
import styles from './DiaryEntryEditPage.module.css';

export default function DiaryEntryEditPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();

  const [entry, setEntry] = useState<DiaryEntryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  // Photo state
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const photosResult = usePhotos(entry ? 'diary_entry' : '', entry?.id || '');

  // Form fields
  const [entryDate, setEntryDate] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  // daily_log metadata
  const [dailyLogWeather, setDailyLogWeather] = useState<DiaryWeather | null>(null);
  const [dailyLogTemperature, setDailyLogTemperature] = useState<number | null>(null);
  const [dailyLogWorkers, setDailyLogWorkers] = useState<number | null>(null);

  // site_visit metadata
  const [siteVisitInspectorName, setSiteVisitInspectorName] = useState<string | null>(null);
  const [siteVisitOutcome, setSiteVisitOutcome] = useState<DiaryInspectionOutcome | null>(null);

  // delivery metadata
  const [deliveryVendor, setDeliveryVendor] = useState<string | null>(null);
  const [deliveryMaterials, setDeliveryMaterials] = useState<string[] | null>(null);
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);

  // issue metadata
  const [issueSeverity, setIssueSeverity] = useState<DiaryIssueSeverity | null>(null);
  const [issueResolutionStatus, setIssueResolutionStatus] = useState<DiaryIssueResolution | null>(
    null,
  );

  // Load entry on mount
  useEffect(() => {
    if (!id) {
      setNotFound(true);
      setIsLoading(false);
      return;
    }

    const loadEntry = async () => {
      setIsLoading(true);
      try {
        const data = await getDiaryEntry(id);
        setEntry(data);
        populateForm(data);
      } catch (err) {
        if (err instanceof ApiClientError && err.statusCode === 404) {
          setNotFound(true);
        } else {
          setError('Failed to load diary entry. Please try again.');
        }
        console.error('Failed to load diary entry:', err);
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

  const populateForm = (data: DiaryEntryDetail) => {
    setEntryDate(data.entryDate);
    setTitle(data.title || '');
    setBody(data.body);

    if (!data.metadata) return;

    if (data.entryType === 'daily_log') {
      const m = data.metadata as DailyLogMetadata;
      setDailyLogWeather(m.weather || null);
      setDailyLogTemperature(m.temperatureCelsius || null);
      setDailyLogWorkers(m.workersOnSite || null);
    } else if (data.entryType === 'site_visit') {
      const m = data.metadata as SiteVisitMetadata;
      setSiteVisitInspectorName(m.inspectorName || null);
      setSiteVisitOutcome(m.outcome || null);
    } else if (data.entryType === 'delivery') {
      const m = data.metadata as DeliveryMetadata;
      setDeliveryVendor(m.vendor || null);
      setDeliveryMaterials(m.materials || null);
      setDeliveryConfirmed(m.deliveryConfirmed || false);
    } else if (data.entryType === 'issue') {
      const m = data.metadata as IssueMetadata;
      setIssueSeverity(m.severity || null);
      setIssueResolutionStatus(m.resolutionStatus || null);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!entryDate) {
      errors.entryDate = 'Entry date is required';
    }

    if (!body.trim()) {
      errors.body = 'Entry text is required';
    }

    if (entry?.entryType === 'site_visit') {
      if (!siteVisitInspectorName?.trim()) {
        errors.siteVisitInspectorName = 'Inspector name is required';
      }
      if (!siteVisitOutcome) {
        errors.siteVisitOutcome = 'Inspection outcome is required';
      }
    }

    if (entry?.entryType === 'issue') {
      if (!issueSeverity) {
        errors.issueSeverity = 'Severity is required';
      }
      if (!issueResolutionStatus) {
        errors.issueResolutionStatus = 'Resolution status is required';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const buildMetadata = (): DiaryEntryMetadata | null => {
    if (entry?.entryType === 'daily_log') {
      const metadata: DailyLogMetadata = {};
      if (dailyLogWeather) metadata.weather = dailyLogWeather;
      if (dailyLogTemperature !== null) metadata.temperatureCelsius = dailyLogTemperature;
      if (dailyLogWorkers !== null) metadata.workersOnSite = dailyLogWorkers;
      return Object.keys(metadata).length > 0 ? metadata : null;
    }

    if (entry?.entryType === 'site_visit') {
      const metadata: SiteVisitMetadata = {};
      if (siteVisitInspectorName) metadata.inspectorName = siteVisitInspectorName;
      if (siteVisitOutcome) metadata.outcome = siteVisitOutcome;
      return Object.keys(metadata).length > 0 ? metadata : null;
    }

    if (entry?.entryType === 'delivery') {
      const metadata: DeliveryMetadata = {};
      if (deliveryVendor) metadata.vendor = deliveryVendor;
      if (deliveryMaterials && deliveryMaterials.length > 0) metadata.materials = deliveryMaterials;
      if (deliveryConfirmed) metadata.deliveryConfirmed = deliveryConfirmed;
      return Object.keys(metadata).length > 0 ? metadata : null;
    }

    if (entry?.entryType === 'issue') {
      const metadata: IssueMetadata = {};
      if (issueSeverity) metadata.severity = issueSeverity;
      if (issueResolutionStatus) metadata.resolutionStatus = issueResolutionStatus;
      return Object.keys(metadata).length > 0 ? metadata : null;
    }

    return null;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!validateForm() || !entry) {
      return;
    }

    setIsSubmitting(true);

    try {
      const metadata = buildMetadata();
      await updateDiaryEntry(entry.id, {
        entryDate,
        title: title.trim() || null,
        body: body.trim(),
        metadata,
      });

      showToast('success', 'Diary entry updated successfully');
      navigate(`/diary/${entry.id}`);
    } catch (err) {
      setError('Failed to update diary entry. Please try again.');
      console.error('Failed to update diary entry:', err);
      setIsSubmitting(false);
    }
  };

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
    return <div className={styles.loading}>Loading entry...</div>;
  }

  if (notFound) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard}>
          <h2 className={styles.errorTitle}>Entry Not Found</h2>
          <p className={styles.errorMessage}>The diary entry you're looking for doesn't exist.</p>
          <button type="button" className={styles.backButton} onClick={() => navigate('/diary')}>
            Back to Diary
          </button>
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard}>
          <h2 className={styles.errorTitle}>Error Loading Entry</h2>
          <p className={styles.errorMessage}>{error || 'An unexpected error occurred.'}</p>
          <button type="button" className={styles.backButton} onClick={() => navigate('/diary')}>
            Back to Diary
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate(`/diary/${entry.id}`)}
          disabled={isSubmitting}
        >
          ← Back to Entry
        </button>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Edit Diary Entry</h1>
          <DiaryEntryTypeBadge entryType={entry.entryType} size="sm" />
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <form className={styles.form} onSubmit={handleSubmit}>
        <DiaryEntryForm
          entryType={entry.entryType as any}
          entryDate={entryDate}
          title={title}
          body={body}
          onEntryDateChange={setEntryDate}
          onTitleChange={setTitle}
          onBodyChange={setBody}
          disabled={isSubmitting || isDeleting}
          validationErrors={validationErrors}
          // daily_log
          dailyLogWeather={dailyLogWeather}
          onDailyLogWeatherChange={setDailyLogWeather}
          dailyLogTemperature={dailyLogTemperature}
          onDailyLogTemperatureChange={setDailyLogTemperature}
          dailyLogWorkers={dailyLogWorkers}
          onDailyLogWorkersChange={setDailyLogWorkers}
          // site_visit
          siteVisitInspectorName={siteVisitInspectorName}
          onSiteVisitInspectorNameChange={setSiteVisitInspectorName}
          siteVisitOutcome={siteVisitOutcome}
          onSiteVisitOutcomeChange={setSiteVisitOutcome}
          // delivery
          deliveryVendor={deliveryVendor}
          onDeliveryVendorChange={setDeliveryVendor}
          deliveryMaterials={deliveryMaterials}
          onDeliveryMaterialsChange={setDeliveryMaterials}
          deliveryConfirmed={deliveryConfirmed}
          onDeliveryConfirmedChange={setDeliveryConfirmed}
          // issue
          issueSeverity={issueSeverity}
          onIssueSeverityChange={setIssueSeverity}
          issueResolutionStatus={issueResolutionStatus}
          onIssueResolutionStatusChange={setIssueResolutionStatus}
        />

        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.deleteButton}
            onClick={() => setShowDeleteModal(true)}
            disabled={isSubmitting || isDeleting}
          >
            Delete Entry
          </button>
          <div className={styles.actionGroup}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={() => navigate(`/diary/${entry.id}`)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>

      {/* Photos Section - only show after entry is saved */}
      {entry && (
        <div className={styles.photosCard}>
          <div className={styles.photosSectionHeader}>
            <h2 className={styles.photosHeading}>Photos</h2>
          </div>

          <PhotoUpload
            entityType="diary_entry"
            entityId={entry.id}
            onUpload={() => {
              /* Photo is automatically added to state by usePhotos */
            }}
            onError={(error) => {
              showToast('error', error);
            }}
          />

          {photosResult.photos.length > 0 && (
            <>
              <div className={styles.photosGridWrapper}>
                <PhotoGrid
                  photos={photosResult.photos}
                  onPhotoClick={(photo) => {
                    const index = photosResult.photos.findIndex((p) => p.id === photo.id);
                    setSelectedPhotoIndex(index);
                  }}
                  onDelete={(photo) => {
                    void photosResult.deletePhoto(photo.id);
                  }}
                  loading={photosResult.loading}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Photo Viewer Modal */}
      {selectedPhotoIndex !== null && selectedPhotoIndex >= 0 && (
        <PhotoViewer
          photos={photosResult.photos}
          initialIndex={selectedPhotoIndex}
          onClose={() => setSelectedPhotoIndex(null)}
        />
      )}

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
                className={styles.cancelButton}
                onClick={closeDeleteModal}
                disabled={isDeleting}
              >
                Cancel
              </button>
              {!deleteError && (
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
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
