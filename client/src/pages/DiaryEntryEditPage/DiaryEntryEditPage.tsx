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
  ManualDiaryEntryType,
} from '@cornerstone/shared';
import { isDiaryEntrySignatureLocked } from '@cornerstone/shared';
import {
  getDiaryEntry,
  updateDiaryEntry,
  deleteDiaryEntry,
  promoteDiaryEntry,
} from '../../lib/diaryApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback.js';
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
import { Modal } from '../../components/Modal/Modal.js';
import { FormError } from '../../components/FormError/FormError.js';
import styles from './DiaryEntryEditPage.module.css';

function isSignatureComplete(sig: DiarySignatureEntry): boolean {
  return (
    typeof sig.signerName === 'string' &&
    sig.signerName.trim().length > 0 &&
    typeof sig.signatureDataUrl === 'string' &&
    sig.signatureDataUrl.trim().length > 0
  );
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function DiaryEntryEditPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation('diary');
  const { t: tErrors } = useTranslation('errors');
  const { showToast } = useToast();
  const { user } = useAuth();
  const currentUserName = user ? user.displayName.trim() || user.email : undefined;
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

  // Discard draft modal
  const [showDiscardModal, setShowDiscardModal] = useState(false);

  // Auto-save state
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const autoSaveAbortRef = useRef<AbortController | null>(null);
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
  const [issueSignatures, setIssueSignatures] = useState<DiarySignatureEntry[] | null>(null);
  const [issueSeverity, setIssueSeverity] = useState<DiaryIssueSeverity | null>(null);
  const [issueResolutionStatus, setIssueResolutionStatus] = useState<DiaryIssueResolution | null>(
    null,
  );

  // Load entry on mount
  const skipAutoSaveOnMountRef = useRef(true);
  useEffect(() => {
    if (!id) {
      /* eslint-disable @eslint-react/set-state-in-effect -- initializing notFound and loading state based on route params */
      setNotFound(true);
      setIsLoading(false);
      /* eslint-enable @eslint-react/set-state-in-effect */
      return;
    }

    const loadEntry = async () => {
      setIsLoading(true);
      try {
        const data = await getDiaryEntry(id);
        if (!data.isAutomatic && isDiaryEntrySignatureLocked(data)) {
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

  // Hoisted auto-save functions to enable hook usage before use
  const doSaveImpl = async () => {
    if (autoSaveAbortRef.current) {
      autoSaveAbortRef.current.abort();
    }

    const controller = new AbortController();
    autoSaveAbortRef.current = controller;

    setSaveStatus('saving');

    try {
      const metadata = buildMetadata();
      await updateDiaryEntry(entry!.id, {
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

  const scheduleAutoSave = useDebouncedCallback(() => {
    void doSaveImpl();
  }, 1000);

  // Auto-save on metadata field changes for drafts
  useEffect(() => {
    if (skipAutoSaveOnMountRef.current) {
      skipAutoSaveOnMountRef.current = false;
      return;
    }
    if (entry?.status !== 'draft') return;
    // Immediate auto-save when any metadata field changes
    triggerAutoSave(true);
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- triggerAutoSave is defined in component body; adding it would require useCallback with transitive deps
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
    issueSignatures,
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
      scheduleAutoSave.cancel();
    };
  }, [uploadingCount, scheduleAutoSave]);

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
      setIssueSignatures(m.signatures || null);
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
      if ((siteVisitSignatures ?? []).some((sig) => !isSignatureComplete(sig))) {
        errors.siteVisitSignatures = t('edit.signatureIncomplete');
      }
    }

    if (entry?.entryType === 'issue') {
      if (!issueSeverity) {
        errors.issueSeverity = t('edit.issueSeverityRequired');
      }
      if (!issueResolutionStatus) {
        errors.issueResolutionStatus = t('edit.issueResolutionStatusRequired');
      }
      if ((issueSignatures ?? []).some((sig) => !isSignatureComplete(sig))) {
        errors.issueSignatures = t('edit.signatureIncomplete');
      }
    }

    if (entry?.entryType === 'daily_log') {
      if (dailyLogWorkStart && dailyLogWorkEnd && dailyLogWorkEnd <= dailyLogWorkStart) {
        errors.dailyLogWorkTime = t('validation.workTimeEndBeforeStart');
      }
      if ((dailyLogSignatures ?? []).some((sig) => !isSignatureComplete(sig))) {
        errors.dailyLogSignatures = t('edit.signatureIncomplete');
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
      const completeSignatures = (dailyLogSignatures ?? []).filter(isSignatureComplete);
      if (completeSignatures.length > 0) metadata.signatures = completeSignatures;
      if (dailyLogVendorId) metadata.vendorId = dailyLogVendorId;
      if (dailyLogWorkStart) metadata.workStart = dailyLogWorkStart;
      if (dailyLogWorkEnd) metadata.workEnd = dailyLogWorkEnd;
      return Object.keys(metadata).length > 0 ? metadata : null;
    }

    if (entry?.entryType === 'site_visit') {
      const metadata: SiteVisitMetadata = {};
      if (siteVisitInspectorName) metadata.inspectorName = siteVisitInspectorName;
      if (siteVisitOutcome) metadata.outcome = siteVisitOutcome;
      const completeSignatures = (siteVisitSignatures ?? []).filter(isSignatureComplete);
      if (completeSignatures.length > 0) metadata.signatures = completeSignatures;
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
      const completeSignatures = (issueSignatures ?? []).filter(isSignatureComplete);
      if (completeSignatures.length > 0) metadata.signatures = completeSignatures;
      return Object.keys(metadata).length > 0 ? metadata : null;
    }

    return null;
  };

  const triggerAutoSave = (immediate = false) => {
    if (!entry || entry.status !== 'draft') {
      return;
    }

    if (immediate) {
      void doSaveImpl();
    } else {
      scheduleAutoSave.trigger();
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
      if (
        err instanceof ApiClientError &&
        err.error.code === 'VALIDATION_ERROR' &&
        err.error.details &&
        typeof err.error.details === 'object' &&
        'fieldErrors' in err.error.details
      ) {
        // Handle field-level validation errors from promote
        const errors: Record<string, string> = {};
        const fieldErrors = err.error.details.fieldErrors as Record<string, string>;
        Object.assign(errors, fieldErrors);
        setValidationErrors(errors);
      } else if (err instanceof ApiClientError) {
        setError(translateApiError(err.error.code, tErrors));
        console.error('Failed to promote diary entry:', err);
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
        setError(
          err instanceof ApiClientError
            ? translateApiError(err.error.code, tErrors)
            : t('editPage.updateError'),
        );
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
          <p className={styles.errorMessage}>{error || t('editPage.loadError')}</p>
          <button type="button" className={styles.backButton} onClick={() => navigate('/diary')}>
            {t('editPage.backButton')}
          </button>
        </div>
      </div>
    );
  }

  const isLocked = isDiaryEntrySignatureLocked(entry);

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

      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <DiaryEntryForm
          entryType={entry.entryType as ManualDiaryEntryType}
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
          issueSignatures={issueSignatures}
          onIssueSignaturesChange={setIssueSignatures}
          // signature enhancements
          currentUserName={currentUserName}
          vendors={vendorOptions}
        />

        <div className={styles.formActions}>
          {entry.status === 'draft' ? (
            <>
              <button
                type="button"
                className={shared.btnDanger}
                onClick={() => {
                  setDeleteError('');
                  setShowDiscardModal(true);
                }}
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
                  editable={!isLocked}
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
          onPhotoChanged={photosResult.updatePhotoInList}
          startInAnnotator={openAsAnnotator}
          editable={!isLocked}
          onDelete={(photoId) => {
            photosResult.deletePhoto(photoId);
            setSelectedPhotoIndex(null);
          }}
        />
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <Modal
          title={t('editPage.deleteTitle')}
          onClose={() => {
            if (!isDeleting) closeDeleteModal();
          }}
          footer={
            <>
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
            </>
          }
        >
          <FormError message={deleteError || null} />
          <p>{t('editPage.deleteMessage')}</p>
        </Modal>
      )}

      {/* Discard draft confirmation modal */}
      {showDiscardModal && entry.status === 'draft' && (
        <Modal
          title={t('editPage.discardDraftTitle')}
          onClose={() => {
            if (!isDeleting) {
              setDeleteError('');
              setShowDiscardModal(false);
            }
          }}
          footer={
            <>
              <button
                type="button"
                className={shared.btnSecondary}
                onClick={() => {
                  setDeleteError('');
                  setShowDiscardModal(false);
                }}
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
            </>
          }
        >
          <FormError message={deleteError || null} />
          <p>{t('editPage.discardDraftMessage')}</p>
        </Modal>
      )}
    </div>
  );
}
