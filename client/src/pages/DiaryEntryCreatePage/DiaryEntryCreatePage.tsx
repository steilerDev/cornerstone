import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from '@cornerstone/shared';
import { createDiaryEntry } from '../../lib/diaryApi.js';
import { useToast } from '../../components/Toast/ToastContext.js';
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
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('type-selector');

  // Type selector step
  const [selectedType, setSelectedType] = useState<ManualDiaryEntryType | null>(null);

  // Form step
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const [issueResolutionStatus, setIssueResolutionStatus] = useState<DiaryIssueResolution | null>(null);

  const handleTypeSelect = (type: ManualDiaryEntryType) => {
    setSelectedType(type);
    setStep('form');
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!entryDate) {
      errors.entryDate = 'Entry date is required';
    }

    if (!body.trim()) {
      errors.body = 'Entry text is required';
    }

    if (selectedType === 'site_visit') {
      if (!siteVisitInspectorName?.trim()) {
        errors.siteVisitInspectorName = 'Inspector name is required';
      }
      if (!siteVisitOutcome) {
        errors.siteVisitOutcome = 'Inspection outcome is required';
      }
    }

    if (selectedType === 'issue') {
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
    if (selectedType === 'daily_log') {
      const metadata: DailyLogMetadata = {};
      if (dailyLogWeather) metadata.weather = dailyLogWeather;
      if (dailyLogTemperature !== null) metadata.temperatureCelsius = dailyLogTemperature;
      if (dailyLogWorkers !== null) metadata.workersOnSite = dailyLogWorkers;
      return Object.keys(metadata).length > 0 ? metadata : null;
    }

    if (selectedType === 'site_visit') {
      const metadata: SiteVisitMetadata = {};
      if (siteVisitInspectorName) metadata.inspectorName = siteVisitInspectorName;
      if (siteVisitOutcome) metadata.outcome = siteVisitOutcome;
      return Object.keys(metadata).length > 0 ? metadata : null;
    }

    if (selectedType === 'delivery') {
      const metadata: DeliveryMetadata = {};
      if (deliveryVendor) metadata.vendor = deliveryVendor;
      if (deliveryMaterials && deliveryMaterials.length > 0) metadata.materials = deliveryMaterials;
      if (deliveryConfirmed) metadata.deliveryConfirmed = deliveryConfirmed;
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    if (!selectedType) {
      setError('Please select an entry type');
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

      showToast('success', 'Diary entry created successfully');
      navigate(`/diary/${entry.id}`);
    } catch (err) {
      setError('Failed to create diary entry. Please try again.');
      console.error('Failed to create diary entry:', err);
      setIsSubmitting(false);
    }
  };

  if (step === 'type-selector') {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/diary')}
          >
            ← Back to Diary
          </button>
          <h1 className={styles.title}>New Diary Entry</h1>
        </div>

        <div className={styles.typeSelector}>
          <h2 className={styles.sectionTitle}>Select Entry Type</h2>
          <div className={styles.typeGrid}>
            <TypeCard
              type="daily_log"
              emoji="📋"
              label="Daily Log"
              description="Record daily site conditions and worker presence"
              isSelected={selectedType === 'daily_log'}
              onSelect={() => handleTypeSelect('daily_log')}
            />
            <TypeCard
              type="site_visit"
              emoji="🔍"
              label="Site Visit"
              description="Document an inspection with inspector info and outcome"
              isSelected={selectedType === 'site_visit'}
              onSelect={() => handleTypeSelect('site_visit')}
            />
            <TypeCard
              type="delivery"
              emoji="📦"
              label="Delivery"
              description="Record delivery of materials or equipment"
              isSelected={selectedType === 'delivery'}
              onSelect={() => handleTypeSelect('delivery')}
            />
            <TypeCard
              type="issue"
              emoji="⚠️"
              label="Issue"
              description="Report a problem or concern on the site"
              isSelected={selectedType === 'issue'}
              onSelect={() => handleTypeSelect('issue')}
            />
            <TypeCard
              type="general_note"
              emoji="📝"
              label="General Note"
              description="Add any other relevant information"
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
          ← Back
        </button>
        <h1 className={styles.title}>New Diary Entry</h1>
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
            className={styles.cancelButton}
            onClick={() => setStep('type-selector')}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Entry'}
          </button>
        </div>
      </form>
    </div>
  );
}
