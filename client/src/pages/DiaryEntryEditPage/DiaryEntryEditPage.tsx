import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  DiarySignatureEntry,
} from '@cornerstone/shared';
import {
  getDiaryEntry,
  updateDiaryEntry,
  deleteDiaryEntry,
  promoteDiaryEntry,
} from '../../lib/diaryApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import type { VendorOption } from '../../components/diary/SignatureCapture/SignatureCapture.js';
import { usePhotos } from '../../hooks/usePhotos.js';
import { Badge } from '../../components/Badge/Badge.js';
import badgeStyles from '../../components/Badge/Badge.module.css';
import shared from '../../styles/shared.module.css';
import { DiaryEntryTypeBadge } from '../../components/diary/DiaryEntryTypeBadge/DiaryEntryTypeBadge.js';
import { DiaryEntryForm } from '../../components/diary/DiaryEntryForm/DiaryEntryForm.js';
import { PhotoUpload } from '../../components/photos/PhotoUpload.js';
import { PhotoGrid } from '../../components/photos/PhotoGrid.js';
import { PhotoViewer } from '../../components/photos/PhotoViewer.js';
import styles from './DiaryEntryEditPage.module.css';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function DiaryEntryEditPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation('diary');
  const { showToast } = useToast();
  const { user } = useAuth();
  const [vendorOptions, setVendorOptions] = useState<VendorOption[]>([]);

  useEffect(() => {
    void fetchVendors({ pageSize: 100 })
      .then((res) => {
        setVendorOptions(res.vendors.map((v) => ({ id: v.id, name: v.name })));
      })
      .catch(() => {
        // Vendors are optional — gracefully degrade
      });
  }, []);

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

  // Discard draft modal
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const discardModalRef = useRef<HTMLDivElement>(null);

  // Auto-save state
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const autoSaveAbortRef = useRef<AbortController | null>(null);
  const autoSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);

  // Photo state
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [openAsAnnotator, setOpenAsAnnotator] = useState(false);
  const photosResult = usePhotos(entry ? 'diary_entry' : '', entry?.id || '');

  // Form fields
  const [entryDate, setEntryDate] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  // daily_log metadata
  const [dailyLogWeather, setDailyLogWeather] = useState<DiaryWeather | null>(null);
  const [dailyLogTemperature, setDailyLogTemperature] = useState<number | null>(null);
  const [dailyLogWorkers, setDailyLogWorkers] = useState<number | null>(null);
  const [dailyLogSignatures, setDailyLogSignatures] = useState<DiarySignatureEntry[] | null>(null);
  const [dailyLogVendorId, setDailyLogVendorId] = useState<string | null>(null);
  const [dailyLogVendorName, setDailyLogVendorName] = useState<string | null>(null);
  const [dailyLogWorkStart, setDailyLogWorkStart] = useState<string | null>(null);
  const [dailyLogWorkEnd, setDailyLogWorkEnd] = useState<string | null>(null);

  // site_visit metadata
  const [siteVisitInspectorName, setSiteVisitInspectorName] = useState<string | null>(null);
  const [siteVisitOutcome, setSiteVisitOutcome] = useState<DiaryInspectionOutcome | null>(null);
  const [siteVisitSignatures, setSiteVisitSignatures] = useState<DiarySignatureEntry[] | null>(
    null,
  );

  // delivery metadata
  const [deliveryVendor, setDeliveryVendor] = useState<string | null>(null);
  const [deliveryMaterials, setDeliveryMaterials] = useState<string[] | null>(null);

  // issue metadata
  const [issueSeverity, setIssueSeverity] = useState<DiaryIssueSeverity | null>(null);
  const [issueResolutionStatus, setIssueResolutionStatus] = useState<DiaryIssueResolution | null>(
    null,
  );

  // Load entry on mount
  const skipAutoSaveOnMountRef = useRef(true);
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
        if (data.isSigned && !data.isAutomatic) {
          showToast('info', t('editPage.signedEntriesError'));
          navigate(`/diary/${data.id}`);
          return;
        }
        setEntry(data);
        populateForm(data);
      } catch (err) {
        if (err instanceof ApiClientError && err.statusCode === 404) {
          setNotFound(true);
        } else {
          setError(t('editPage.loadError'));
        }
        console.error('Failed to load diary entry:', err);
      } finally {
        setIsLoading(false);
      }
    };

    void loadEntry();
  }, [id, navigate, showToast, t]);

  // Auto-save on metadata field changes for drafts
  useEffect(() => {
    if (skipAutoSaveOnMountRef.current) {
      skipAutoSaveOnMountRef.current = false;
      return;
    }
    if (entry?.status !== 'draft') return;
    // Immediate auto-save when any metadata field changes
    triggerAutoSave(true);
  }, [
    dailyLogWeather,
    dailyLogTemperature,
    dailyLogWorkers,
    dailyLogSignatures,
    dailyLogVendorId,
    dailyLogWorkStart,
    dailyLogWorkEnd,
    siteVisitInspectorName,
    siteVisitOutcome,
    siteVisitSignatures,
    deliveryVendor,
    deliveryMaterials,
    issueSeverity,
    issueResolutionStatus,
    entry?.status,
  ]);

  // Auto-save cleanup and beforeunload guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (uploadingCount > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Cleanup auto-save state
      if (autoSaveAbortRef.current) {
        autoSaveAbortRef.current.abort();
      }
      if (autoSaveDebounceRef.current) {
        clearTimeout(autoSaveDebounceRef.current);
      }
    };
  }, [uploadingCount]);

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
        const firstEl = focusableArray[0]!; // guarded by length check at line 142
        const lastEl = focusableArray[focusableArray.length - 1]!; // guarded by length check at line 142
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

  // Discard draft modal: focus trap and Escape key handler
  useEffect(() => {
    if (!showDiscardModal) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowDiscardModal(false);
        return;
      }
      if (e.key === 'Tab' && discardModalRef.current) {
        const focusable = discardModalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const focusableArray = Array.from(focusable);
        if (focusableArray.length === 0) return;
        const firstEl = focusableArray[0]!;
        const lastEl = focusableArray[focusableArray.length - 1]!;
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
  }, [showDiscardModal]);

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
      setDailyLogSignatures(m.signatures || null);
      setDailyLogVendorId(m.vendorId ?? null);
      setDailyLogVendorName(m.vendorName ?? null);
      setDailyLogWorkStart(m.workStart ?? null);
      setDailyLogWorkEnd(m.workEnd ?? null);
    } else if (data.entryType === 'site_visit') {
      const m = data.metadata as SiteVisitMetadata;
      setSiteVisitInspectorName(m.inspectorName || null);
      setSiteVisitOutcome(m.outcome || null);
      setSiteVisitSignatures(m.signatures || null);
    } else if (data.entryType === 'delivery') {
      const m = data.metadata as DeliveryMetadata;
      setDeliveryVendor(m.vendor || null);
      setDeliveryMaterials(m.materials || null);
    } else if (data.entryType === 'issue') {
      const m = data.metadata as IssueMetadata;
      setIssueSeverity(m.severity || null);
      setIssueResolutionStatus(m.resolutionStatus || null);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!entryDate) {
      errors.entryDate = t('edit.entryDateRequired');
    }

    if (!body.trim()) {
      errors.body = t('edit.bodyRequired');
    }

    if (entry?.entryType === 'site_visit') {
      if (!siteVisitInspectorName?.trim()) {
        errors.siteVisitInspectorName = t('edit.siteVisitInspectorNameRequired');
      }
      if (!siteVisitOutcome) {
        errors.siteVisitOutcome = t('edit.inspectionOutcomeRequired');
      }
    }

    if (entry?.entryType === 'issue') {
      if (!issueSeverity) {
        errors.issueSeverity = t('edit.issueSeverityRequired');
      }
      if (!issueResolutionStatus) {
        errors.issueResolutionStatus = t('edit.issueResolutionStatusRequired');
      }
    }

    if (entry?.entryType === 'daily_log') {
      if (dailyLogWorkStart && dailyLogWorkEnd && dailyLogWorkEnd <= dailyLogWorkStart) {
        errors.dailyLogWorkTime = t('validation.workTimeEndBeforeStart');
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
      if (dailyLogSignatures && dailyLogSignatures.length > 0)
        metadata.signatures = dailyLogSignatures;
      if (dailyLogVendorId) metadata.vendorId = dailyLogVendorId;
      if (dailyLogWorkStart) metadata.workStart = dailyLogWorkStart;
      if (dailyLogWorkEnd) metadata.workEnd = dailyLogWorkEnd;
      return Object.keys(metadata).length > 0 ? metadata : null;
    }

    if (entry?.entryType === 'site_visit') {
      const metadata: SiteVisitMetadata = {};
      if (siteVisitInspectorName) metadata.inspectorName = siteVisitInspectorName;
      if (siteVisitOutcome) metadata.outcome = siteVisitOutcome;
      if (siteVisitSignatures && siteVisitSignatures.length > 0)
        metadata.signatures = siteVisitSignatures;
      return Object.keys(metadata).length > 0 ? metadata : null;
    }

    if (entry?.entryType === 'delivery') {
      const metadata: DeliveryMetadata = {};
      if (deliveryVendor) metadata.vendor = deliveryVendor;
      if (deliveryMaterials && deliveryMaterials.length > 0) metadata.materials = deliveryMaterials;
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

  const triggerAutoSave = (immediate = false) => {
    if (!entry || entry.status !== 'draft') {
      return;
    }

    const doSave = async () => {
      if (autoSaveAbortRef.current) {
        autoSaveAbortRef.current.abort();
      }

      const controller = new AbortController();
      autoSaveAbortRef.current = controller;

      setSaveStatus('saving');

      try {
        const metadata = buildMetadata();
        await updateDiaryEntry(entry.id, {
          entryDate: entryDate || undefined,
          title: title.trim() || null,
          body: body || undefined,
          metadata,
        });

        if (!controller.signal.aborted) {
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 3000);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setSaveStatus('error');
          console.error('Failed to auto-save:', err);
        }
      }
    };

    if (immediate) {
      void doSave();
    } else {
      if (autoSaveDebounceRef.current) {
        clearTimeout(autoSaveDebounceRef.current);
      }
      autoSaveDebounceRef.current = setTimeout(() => {
        void doSave();
      }, 1000);
    }
  };

  const handlePromote = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!validateForm() || !entry || entry.status !== 'draft') {
      return;
    }

    setIsSubmitting(true);

    try {
      const metadata = buildMetadata();
      const promoted = await promoteDiaryEntry(entry.id, {
        entryDate,
        title: title.trim() || null,
        body: body.trim(),
        metadata,
      });

      setEntry(promoted);
      showToast('success', t('editPage.updateSuccess'));
      navigate(`/diary/${promoted.id}`);
    } catch (err) {
      if (err instanceof ApiClientError && err.error.code === 'VALIDATION_ERROR') {
        // Handle validation errors from promote
        const errors: Record<string, string> = {};
        if (
          err.error.details &&
          typeof err.error.details === 'object' &&
          'fieldErrors' in err.error.details
        ) {
          const fieldErrors = err.error.details.fieldErrors as Record<string, string>;
          Object.assign(errors, fieldErrors);
        }
        setValidationErrors(errors);
      } else {
        setError(t('editPage.updateError'));
        console.error('Failed to promote diary entry:', err);
      }
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!entry) {
      return;
    }

    // If draft, promote. If saved, update normally.
    if (entry.status === 'draft') {
      await handlePromote(event);
    } else {
      if (!validateForm()) {
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

        showToast('success', t('editPage.updateSuccess'));
        navigate(`/diary/${entry.id}`);
      } catch (err) {
        setError(t('editPage.updateError'));
        console.error('Failed to update diary entry:', err);
        setIsSubmitting(false);
      }
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
      showToast('success', t('editPage.deleteSuccess'));
      navigate('/diary');
    } catch (err) {
      setDeleteError(t('editPage.deleteError'));
      console.error('Failed to delete diary entry:', err);
      setIsDeleting(false);
    }
  };

  const handleDiscard = async () => {
    if (!entry || entry.status !== 'draft') return;
    setIsDeleting(true);

    try {
      await deleteDiaryEntry(entry.id);
      showToast('success', t('editPage.deleteSuccess'));
      navigate('/diary');
    } catch (err) {
      setDeleteError(t('editPage.deleteError'));
      console.error('Failed to discard draft:', err);
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <div className={styles.loading}>{t('editPage.loadingError')}</div>;
  }

  if (notFound) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard}>
          <h2 className={styles.errorTitle}>{t('editPage.notFoundTitle')}</h2>
          <p className={styles.errorMessage}>{t('editPage.notFoundMessage')}</p>
          <button type="button" className={styles.backButton} onClick={() => navigate('/diary')}>
            {t('editPage.backButton')}
          </button>
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard}>
          <h2 className={styles.errorTitle}>{t('editPage.errorTitle')}</h2>
          <p className={styles.errorMessage}>{error || 'An unexpected error occurred.'}</p>
          <button type="button" className={styles.backButton} onClick={() => navigate('/diary')}>
            {t('editPage.backButton')}
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
          onClick={() =>
            entry.status === 'draft' ? navigate('/diary') : navigate(`/diary/${entry.id}`)
          }
          disabled={isSubmitting}
        >
          {t('editPage.backLink')}
        </button>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{t('editPage.title')}</h1>
          <DiaryEntryTypeBadge entryType={entry.entryType} size="sm" />
          {entry.status === 'draft' && (
            <Badge
              variants={{ draft: { label: t('draft.badgeLabel'), className: badgeStyles.draft } }}
              value="draft"
              testId="draft-status-badge"
            />
          )}
        </div>
        {entry.status === 'draft' && saveStatus !== 'idle' && (
          <div className={styles.autoSaveStatus} data-testid="autosave-status">
            {saveStatus === 'saving' && t('editPage.autoSaveSaving')}
            {saveStatus === 'saved' && t('editPage.autoSaveSaved')}
            {saveStatus === 'error' && t('editPage.autoSaveError')}
          </div>
        )}
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <DiaryEntryForm
          entryType={entry.entryType as any}
          entryDate={entryDate}
          title={title}
          body={body}
          onEntryDateChange={setEntryDate}
          onTitleChange={setTitle}
          onBodyChange={setBody}
          onFieldBlur={entry.status === 'draft' ? () => triggerAutoSave(false) : undefined}
          disabled={isSubmitting || isDeleting}
          validationErrors={validationErrors}
          // daily_log
          dailyLogWeather={dailyLogWeather}
          onDailyLogWeatherChange={setDailyLogWeather}
          dailyLogTemperature={dailyLogTemperature}
          onDailyLogTemperatureChange={setDailyLogTemperature}
          dailyLogWorkers={dailyLogWorkers}
          onDailyLogWorkersChange={setDailyLogWorkers}
          dailyLogSignatures={dailyLogSignatures}
          onDailyLogSignaturesChange={setDailyLogSignatures}
          dailyLogVendorId={dailyLogVendorId}
          onDailyLogVendorIdChange={setDailyLogVendorId}
          dailyLogVendorName={dailyLogVendorName}
          dailyLogWorkStart={dailyLogWorkStart}
          onDailyLogWorkStartChange={setDailyLogWorkStart}
          dailyLogWorkEnd={dailyLogWorkEnd}
          onDailyLogWorkEndChange={setDailyLogWorkEnd}
          // site_visit
          siteVisitInspectorName={siteVisitInspectorName}
          onSiteVisitInspectorNameChange={setSiteVisitInspectorName}
          siteVisitOutcome={siteVisitOutcome}
          onSiteVisitOutcomeChange={setSiteVisitOutcome}
          siteVisitSignatures={siteVisitSignatures}
          onSiteVisitSignaturesChange={setSiteVisitSignatures}
          // delivery
          deliveryVendor={deliveryVendor}
          onDeliveryVendorChange={setDeliveryVendor}
          deliveryMaterials={deliveryMaterials}
          onDeliveryMaterialsChange={setDeliveryMaterials}
          // issue
          issueSeverity={issueSeverity}
          onIssueSeverityChange={setIssueSeverity}
          issueResolutionStatus={issueResolutionStatus}
          onIssueResolutionStatusChange={setIssueResolutionStatus}
          // signature enhancements
          currentUserName={user?.displayName}
          vendors={vendorOptions}
        />

        <div className={styles.formActions}>
          {entry.status === 'draft' ? (
            <>
              <button
                type="button"
                className={shared.btnDanger}
                onClick={() => setShowDiscardModal(true)}
                disabled={isSubmitting || isDeleting}
              >
                {t('editPage.discardDraftButton')}
              </button>
              <div className={styles.actionGroup}>
                <button
                  type="button"
                  className={shared.btnSecondary}
                  onClick={() => navigate('/diary')}
                  disabled={isSubmitting}
                >
                  {t('editPage.cancel')}
                </button>
                <button type="submit" className={shared.btnPrimary} disabled={isSubmitting}>
                  {isSubmitting ? t('editPage.promoting') : t('editPage.promoteButton')}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className={shared.btnDanger}
                onClick={() => setShowDeleteModal(true)}
                disabled={isSubmitting || isDeleting}
              >
                {t('editPage.deleteButton')}
              </button>
              <div className={styles.actionGroup}>
                <button
                  type="button"
                  className={shared.btnSecondary}
                  onClick={() => navigate(`/diary/${entry.id}`)}
                  disabled={isSubmitting}
                >
                  {t('editPage.cancel')}
                </button>
                <button type="submit" className={shared.btnPrimary} disabled={isSubmitting}>
                  {isSubmitting ? t('editPage.saving') : t('editPage.saveChanges')}
                </button>
              </div>
            </>
          )}
        </div>
      </form>

      {/* Photos Section - only show after entry is saved */}
      {entry && (
        <div className={styles.photosCard}>
          <div className={styles.photosSectionHeader}>
            <h2 className={styles.photosHeading}>{t('editPage.photosHeading')}</h2>
          </div>

          <PhotoUpload
            entityType="diary_entry"
            entityId={entry.id}
            onUpload={() => photosResult.refresh()}
            onError={(error) => {
              showToast('error', error);
            }}
            onUploadingCountChange={setUploadingCount}
          />

          {photosResult.photos.length > 0 && (
            <>
              <div className={styles.photosGridWrapper}>
                <PhotoGrid
                  photos={photosResult.photos}
                  onPhotoClick={(photo) => {
                    const index = photosResult.photos.findIndex((p) => p.id === photo.id);
                    setOpenAsAnnotator(false);
                    setSelectedPhotoIndex(index);
                  }}
                  onDelete={(photo) => {
                    void photosResult.deletePhoto(photo.id);
                  }}
                  onEdit={(photo) => {
                    const index = photosResult.photos.findIndex((p) => p.id === photo.id);
                    setOpenAsAnnotator(true);
                    setSelectedPhotoIndex(index);
                  }}
                  editable={!entry.isSigned}
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
          onClose={() => {
            setSelectedPhotoIndex(null);
            setOpenAsAnnotator(false);
          }}
          onPhotoAnnotated={photosResult.updatePhotoAnnotation}
          startInAnnotator={openAsAnnotator}
          editable={!entry.isSigned}
          onDelete={(photoId) => {
            photosResult.deletePhoto(photoId);
            setSelectedPhotoIndex(null);
          }}
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
              {t('editPage.deleteTitle')}
            </h2>
            <p className={styles.modalText}>{t('editPage.deleteMessage')}</p>
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
                {t('editPage.deleteCancel')}
              </button>
              {!deleteError && (
                <button
                  type="button"
                  className={shared.btnConfirmDelete}
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                >
                  {isDeleting ? t('editPage.deleting') : t('editPage.deleteConfirm')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Discard draft confirmation modal */}
      {showDiscardModal && entry.status === 'draft' && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="discard-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={() => setShowDiscardModal(false)} />
          <div className={styles.modalContent} ref={discardModalRef}>
            <h2 id="discard-modal-title" className={styles.modalTitle}>
              {t('editPage.discardDraftTitle')}
            </h2>
            <p className={styles.modalText}>{t('editPage.discardDraftMessage')}</p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={shared.btnSecondary}
                onClick={() => setShowDiscardModal(false)}
                disabled={isDeleting}
              >
                {t('editPage.discardDraftCancel')}
              </button>
              <button
                type="button"
                className={shared.btnConfirmDelete}
                onClick={() => void handleDiscard()}
                disabled={isDeleting}
              >
                {isDeleting ? t('editPage.discarding') : t('editPage.discardDraftConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
