import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  ManualDiaryEntryType,
  DiaryWeather,
  DiaryInspectionOutcome,
  DiaryIssueSeverity,
  DiaryIssueResolution,
  DiaryEntryMetadata,
  DailyLogMetadata,
  SiteVisitMetadata,
  DeliveryMetadata,
  IssueMetadata,
  DiarySignatureEntry,
} from '@cornerstone/shared';
import { createDiaryEntry } from '../../lib/diaryApi.js';
import { uploadPhoto } from '../../lib/photoApi.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import type { VendorOption } from '../../components/diary/SignatureCapture/SignatureCapture.js';
import shared from '../../styles/shared.module.css';
import { DiaryEntryForm } from '../../components/diary/DiaryEntryForm/DiaryEntryForm.js';
import styles from './DiaryEntryCreatePage.module.css';

type Step = 'type-selector' | 'form';

interface TypeCardProps {
  type: ManualDiaryEntryType;
  emoji: string;
  label: string;
  description: string;
  isSelected: boolean;
  onSelect: () => void;
}

function TypeCard({ type, emoji, label, description, isSelected, onSelect }: TypeCardProps) {
  return (
    <button
      type="button"
      className={`${styles.typeCard} ${isSelected ? styles.typeCardSelected : ''}`}
      onClick={onSelect}
      data-testid={`type-card-${type}`}
    >
      <div className={styles.typeCardEmoji}>{emoji}</div>
      <div className={styles.typeCardLabel}>{label}</div>
      <div className={styles.typeCardDescription}>{description}</div>
    </button>
  );
}

export default function DiaryEntryCreatePage() {
  const navigate = useNavigate();
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

  const [step, setStep] = useState<Step>('type-selector');

  // Type selector step
  const [selectedType, setSelectedType] = useState<ManualDiaryEntryType | null>(null);

  // Form step
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]!);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // daily_log metadata
  const [dailyLogWeather, setDailyLogWeather] = useState<DiaryWeather | null>(null);
  const [dailyLogTemperature, setDailyLogTemperature] = useState<number | null>(null);
  const [dailyLogWorkers, setDailyLogWorkers] = useState<number | null>(null);
  const [dailyLogSignatures, setDailyLogSignatures] = useState<DiarySignatureEntry[] | null>(null);

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

  const handleTypeSelect = (type: ManualDiaryEntryType) => {
    setSelectedType(type);
    setStep('form');
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!entryDate) {
      errors.entryDate = t('create.entryDateRequired');
    }

    if (!body.trim()) {
      errors.body = t('create.bodyRequired');
    }

    if (selectedType === 'site_visit') {
      if (!siteVisitInspectorName?.trim()) {
        errors.siteVisitInspectorName = t('createPage.siteVisitInspectorNameRequired');
      }
      if (!siteVisitOutcome) {
        errors.siteVisitOutcome = t('create.inspectionOutcomeRequired');
      }
    }

    if (selectedType === 'issue') {
      if (!issueSeverity) {
        errors.issueSeverity = t('createPage.issueValidationRequired.severity');
      }
      if (!issueResolutionStatus) {
        errors.issueResolutionStatus = t('createPage.issueValidationRequired.resolutionStatus');
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const buildMetadata = (): DiaryEntryMetadata | null => {
    if (selectedType === 'daily_log') {
      const metadata: DailyLogMetadata = {};
      if (dailyLogWeather) metadata.weather = dailyLogWeather;
      if (dailyLogTemperature !== null) metadata.temperatureCelsius = dailyLogTemperature;
      if (dailyLogWorkers !== null) metadata.workersOnSite = dailyLogWorkers;
      if (dailyLogSignatures && dailyLogSignatures.length > 0)
        metadata.signatures = dailyLogSignatures;
      return Object.keys(metadata).length > 0 ? metadata : null;
    }

    if (selectedType === 'site_visit') {
      const metadata: SiteVisitMetadata = {};
      if (siteVisitInspectorName) metadata.inspectorName = siteVisitInspectorName;
      if (siteVisitOutcome) metadata.outcome = siteVisitOutcome;
      if (siteVisitSignatures && siteVisitSignatures.length > 0)
        metadata.signatures = siteVisitSignatures;
      return Object.keys(metadata).length > 0 ? metadata : null;
    }

    if (selectedType === 'delivery') {
      const metadata: DeliveryMetadata = {};
      if (deliveryVendor) metadata.vendor = deliveryVendor;
      if (deliveryMaterials && deliveryMaterials.length > 0) metadata.materials = deliveryMaterials;
      return Object.keys(metadata).length > 0 ? metadata : null;
    }

    if (selectedType === 'issue') {
      const metadata: IssueMetadata = {};
      if (issueSeverity) metadata.severity = issueSeverity;
      if (issueResolutionStatus) metadata.resolutionStatus = issueResolutionStatus;
      return Object.keys(metadata).length > 0 ? metadata : null;
    }

    // general_note
    return null;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setPendingFiles((prev) => [...prev, ...files]);
    // Reset input so the same file can be selected again
    event.target.value = '';
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    if (!selectedType) {
      setError(t('createPage.selectTypeError'));
      return;
    }

    setIsSubmitting(true);

    try {
      const metadata = buildMetadata();
      const entry = await createDiaryEntry({
        entryType: selectedType,
        entryDate,
        title: title.trim() || null,
        body: body.trim(),
        metadata,
      });

      // Upload pending files
      if (pendingFiles.length > 0) {
        try {
          await Promise.all(pendingFiles.map((file) => uploadPhoto('diary_entry', entry.id, file)));
        } catch (uploadErr) {
          console.error('Failed to upload photos:', uploadErr);
          showToast('error', t('create.photoUploadError'));
        }
      }

      showToast('success', t('create.successMessage'));
      navigate(`/diary/${entry.id}`);
    } catch (err) {
      setError(t('create.errorMessage'));
      console.error('Failed to create diary entry:', err);
      setIsSubmitting(false);
    }
  };

  if (step === 'type-selector') {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <button type="button" className={styles.backButton} onClick={() => navigate('/diary')}>
            {t('createPage.backLink')}
          </button>
          <h1 className={styles.title}>{t('createPage.title')}</h1>
        </div>

        <div className={styles.typeSelector}>
          <h2 className={styles.sectionTitle}>{t('createPage.selectEntryType')}</h2>
          <div className={styles.typeGrid}>
            <TypeCard
              type="daily_log"
              emoji="📋"
              label={t('createPage.typeCardDaily')}
              description={t('createPage.typeCardDailyDesc')}
              isSelected={selectedType === 'daily_log'}
              onSelect={() => handleTypeSelect('daily_log')}
            />
            <TypeCard
              type="site_visit"
              emoji="🔍"
              label={t('createPage.typeCardSiteVisit')}
              description={t('createPage.typeCardSiteVisitDesc')}
              isSelected={selectedType === 'site_visit'}
              onSelect={() => handleTypeSelect('site_visit')}
            />
            <TypeCard
              type="delivery"
              emoji="📦"
              label={t('createPage.typeCardDelivery')}
              description={t('createPage.typeCardDeliveryDesc')}
              isSelected={selectedType === 'delivery'}
              onSelect={() => handleTypeSelect('delivery')}
            />
            <TypeCard
              type="issue"
              emoji="⚠️"
              label={t('createPage.typeCardIssue')}
              description={t('createPage.typeCardIssueDesc')}
              isSelected={selectedType === 'issue'}
              onSelect={() => handleTypeSelect('issue')}
            />
            <TypeCard
              type="general_note"
              emoji="📝"
              label={t('createPage.typeCardGeneralNote')}
              description={t('createPage.typeCardGeneralNoteDesc')}
              isSelected={selectedType === 'general_note'}
              onSelect={() => handleTypeSelect('general_note')}
            />
          </div>
        </div>
      </div>
    );
  }

  if (!selectedType) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => setStep('type-selector')}
          disabled={isSubmitting}
        >
          {t('createPage.backButtonForm')}
        </button>
        <h1 className={styles.title}>{t('createPage.title')}</h1>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <form className={styles.form} onSubmit={handleSubmit}>
        <DiaryEntryForm
          entryType={selectedType}
          entryDate={entryDate}
          title={title}
          body={body}
          onEntryDateChange={setEntryDate}
          onTitleChange={setTitle}
          onBodyChange={setBody}
          disabled={isSubmitting}
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

        <div className={styles.photoQueue}>
          <label className={styles.photoQueueLabel}>{t('createPage.attachPhotosLabel')}</label>
          <p className={styles.photoQueueHint}>{t('createPage.attachPhotosHint')}</p>
          <input
            type="file"
            multiple
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            data-testid="create-photo-input"
            disabled={isSubmitting}
            className={styles.photoQueueInput}
          />
          {pendingFiles.length > 0 && (
            <p className={styles.photoQueueCount} data-testid="pending-photo-count">
              {t('createPage.photosQueued', { count: pendingFiles.length })}
            </p>
          )}
        </div>

        <div className={styles.formActions}>
          <button
            type="button"
            className={shared.btnSecondary}
            onClick={() => setStep('type-selector')}
            disabled={isSubmitting}
          >
            {t('create.cancelButton')}
          </button>
          <button type="submit" className={shared.btnPrimary} disabled={isSubmitting}>
            {isSubmitting ? t('create.submittingButton') : t('create.submitButton')}
          </button>
        </div>
      </form>
    </div>
  );
}
