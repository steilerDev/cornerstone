import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ManualDiaryEntryType,
  DiaryWeather,
  DiaryInspectionOutcome,
  DiaryIssueSeverity,
  DiaryIssueResolution,
  DailyLogMetadata,
  SiteVisitMetadata,
  DeliveryMetadata,
  IssueMetadata,
  DiarySignatureEntry,
} from '@cornerstone/shared';
import shared from '../../../styles/shared.module.css';
import { SignatureSection } from '../SignatureSection/index.js';
import type { VendorOption } from '../SignatureCapture/SignatureCapture.js';
import styles from './DiaryEntryForm.module.css';

export interface DiaryEntryFormProps {
  entryType: ManualDiaryEntryType;
  entryDate: string;
  title: string;
  body: string;
  onEntryDateChange: (date: string) => void;
  onTitleChange: (title: string) => void;
  onBodyChange: (body: string) => void;
  disabled?: boolean;
  validationErrors: Record<string, string>;
  /** daily_log metadata */
  dailyLogWeather?: DiaryWeather | null;
  onDailyLogWeatherChange?: (weather: DiaryWeather | null) => void;
  dailyLogTemperature?: number | null;
  onDailyLogTemperatureChange?: (temp: number | null) => void;
  dailyLogWorkers?: number | null;
  onDailyLogWorkersChange?: (workers: number | null) => void;
  dailyLogSignatures?: DiarySignatureEntry[] | null;
  onDailyLogSignaturesChange?: (sigs: DiarySignatureEntry[] | null) => void;
  /** site_visit metadata */
  siteVisitInspectorName?: string | null;
  onSiteVisitInspectorNameChange?: (name: string | null) => void;
  siteVisitOutcome?: DiaryInspectionOutcome | null;
  onSiteVisitOutcomeChange?: (outcome: DiaryInspectionOutcome | null) => void;
  siteVisitSignatures?: DiarySignatureEntry[] | null;
  onSiteVisitSignaturesChange?: (sigs: DiarySignatureEntry[] | null) => void;
  /** delivery metadata */
  deliveryVendor?: string | null;
  onDeliveryVendorChange?: (vendor: string | null) => void;
  deliveryMaterials?: string[] | null;
  onDeliveryMaterialsChange?: (materials: string[] | null) => void;
  /** issue metadata */
  issueSeverity?: DiaryIssueSeverity | null;
  onIssueSeverityChange?: (severity: DiaryIssueSeverity | null) => void;
  issueResolutionStatus?: DiaryIssueResolution | null;
  onIssueResolutionStatusChange?: (status: DiaryIssueResolution | null) => void;
  issueSignatures?: DiarySignatureEntry[] | null;
  onIssueSignaturesChange?: (sigs: DiarySignatureEntry[] | null) => void;
  /** Signature UX enhancements */
  currentUserName?: string;
  vendors?: VendorOption[];
}

// These will be built dynamically based on translations
function useWeatherOptions() {
  const { t } = useTranslation('diary');
  return useMemo(
    () => [
      { value: 'sunny' as DiaryWeather, label: t('form.weatherOptions.sunny') },
      { value: 'cloudy' as DiaryWeather, label: t('form.weatherOptions.cloudy') },
      { value: 'rainy' as DiaryWeather, label: t('form.weatherOptions.rainy') },
      { value: 'snowy' as DiaryWeather, label: t('form.weatherOptions.snowy') },
      { value: 'stormy' as DiaryWeather, label: t('form.weatherOptions.stormy') },
      { value: 'other' as DiaryWeather, label: t('form.weatherOptions.other') },
    ],
    [t],
  );
}

function useOutcomeOptions() {
  const { t } = useTranslation('diary');
  return useMemo(
    () => [
      { value: 'pass' as DiaryInspectionOutcome, label: t('form.outcomeOptions.pass') },
      { value: 'fail' as DiaryInspectionOutcome, label: t('form.outcomeOptions.fail') },
      {
        value: 'conditional' as DiaryInspectionOutcome,
        label: t('form.outcomeOptions.conditional'),
      },
    ],
    [t],
  );
}

function useSeverityOptions() {
  const { t } = useTranslation('diary');
  return useMemo(
    () => [
      { value: 'low' as DiaryIssueSeverity, label: t('form.severityOptions.low') },
      { value: 'medium' as DiaryIssueSeverity, label: t('form.severityOptions.medium') },
      { value: 'high' as DiaryIssueSeverity, label: t('form.severityOptions.high') },
      { value: 'critical' as DiaryIssueSeverity, label: t('form.severityOptions.critical') },
    ],
    [t],
  );
}

function useResolutionStatusOptions() {
  const { t } = useTranslation('diary');
  return useMemo(
    () => [
      { value: 'open' as DiaryIssueResolution, label: t('form.resolutionOptions.open') },
      {
        value: 'in_progress' as DiaryIssueResolution,
        label: t('form.resolutionOptions.in_progress'),
      },
      { value: 'resolved' as DiaryIssueResolution, label: t('form.resolutionOptions.resolved') },
    ],
    [t],
  );
}

export function DiaryEntryForm({
  entryType,
  entryDate,
  title,
  body,
  onEntryDateChange,
  onTitleChange,
  onBodyChange,
  disabled = false,
  validationErrors,
  // daily_log
  dailyLogWeather,
  onDailyLogWeatherChange,
  dailyLogTemperature,
  onDailyLogTemperatureChange,
  dailyLogWorkers,
  onDailyLogWorkersChange,
  dailyLogSignatures,
  onDailyLogSignaturesChange,
  // site_visit
  siteVisitInspectorName,
  onSiteVisitInspectorNameChange,
  siteVisitOutcome,
  onSiteVisitOutcomeChange,
  siteVisitSignatures,
  onSiteVisitSignaturesChange,
  // delivery
  deliveryVendor,
  onDeliveryVendorChange,
  deliveryMaterials,
  onDeliveryMaterialsChange,
  // issue
  issueSeverity,
  onIssueSeverityChange,
  issueResolutionStatus,
  onIssueResolutionStatusChange,
  issueSignatures,
  onIssueSignaturesChange,
  // signature enhancements
  currentUserName,
  vendors,
}: DiaryEntryFormProps) {
  const { t } = useTranslation('diary');
  const weatherOptions = useWeatherOptions();
  const outcomeOptions = useOutcomeOptions();
  const severityOptions = useSeverityOptions();
  const resolutionStatusOptions = useResolutionStatusOptions();
  const materialInputRef = React.useRef<HTMLInputElement>(null);

  const handleAddMaterial = () => {
    const input = materialInputRef.current;
    if (!input) return;
    const newMaterial = input.value.trim();
    if (newMaterial && onDeliveryMaterialsChange) {
      const updated = [...(deliveryMaterials || []), newMaterial];
      onDeliveryMaterialsChange(updated);
      input.value = '';
    }
  };

  const handleRemoveMaterial = (index: number) => {
    if (onDeliveryMaterialsChange && deliveryMaterials) {
      const updated = deliveryMaterials.filter((_, i) => i !== index);
      onDeliveryMaterialsChange(updated.length > 0 ? updated : null);
    }
  };

  return (
    <div className={styles.container}>
      {/* Common fields */}
      <div className={styles.formGroup}>
        <label htmlFor="entry-date" className={styles.label}>
          {t('entryForm.entryDate')}{' '}
          <span className={styles.required}>{t('entryForm.required')}</span>
        </label>
        <input
          type="date"
          id="entry-date"
          className={`${styles.input} ${styles.dateInput} ${validationErrors.entryDate ? styles.inputError : ''}`}
          value={entryDate}
          onChange={(e) => onEntryDateChange(e.target.value)}
          disabled={disabled}
          required
          aria-invalid={!!validationErrors.entryDate}
          aria-describedby={validationErrors.entryDate ? 'entry-date-error' : undefined}
        />
        {validationErrors.entryDate && (
          <div id="entry-date-error" className={styles.errorText} role="alert">
            {validationErrors.entryDate}
          </div>
        )}
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="title" className={styles.label}>
          {t('entryForm.title')}
        </label>
        <input
          type="text"
          id="title"
          className={styles.input}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          disabled={disabled}
          placeholder={t('entryForm.titlePlaceholder')}
          maxLength={200}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="body" className={styles.label}>
          {t('entryForm.body')} <span className={styles.required}>{t('entryForm.required')}</span>
        </label>
        <textarea
          id="body"
          className={`${styles.textarea} ${validationErrors.body ? styles.textareaError : ''}`}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          disabled={disabled}
          placeholder={t('form.bodyDescription')}
          maxLength={10000}
          required
          aria-invalid={!!validationErrors.body}
          aria-describedby={validationErrors.body ? 'body-error' : 'body-char-count'}
        />
        <div className={styles.charCounter} id="body-char-count">
          {body.length}/10000
        </div>
        {validationErrors.body && (
          <div id="body-error" className={styles.errorText} role="alert">
            {validationErrors.body}
          </div>
        )}
      </div>

      {/* Type-specific metadata fields */}

      {entryType === 'daily_log' && (
        <div className={styles.metadataSection}>
          <h3 className={styles.metadataTitle}>{t('form.weather')}</h3>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="weather" className={styles.label}>
                {t('form.weather')}
              </label>
              <select
                id="weather"
                className={styles.select}
                value={dailyLogWeather || ''}
                onChange={(e) =>
                  onDailyLogWeatherChange?.(
                    e.target.value ? (e.target.value as DiaryWeather) : null,
                  )
                }
                disabled={disabled}
              >
                <option value="">— {t('form.weatherPlaceholder')} —</option>
                {weatherOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="temperature" className={styles.label}>
                {t('entryForm.temperature')}
              </label>
              <input
                type="number"
                id="temperature"
                className={styles.input}
                inputMode="numeric"
                value={dailyLogTemperature ?? ''}
                onChange={(e) =>
                  onDailyLogTemperatureChange?.(
                    e.target.value ? parseInt(e.target.value, 10) : null,
                  )
                }
                disabled={disabled}
                placeholder="-40 to 60"
                min={-40}
                max={60}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="workers" className={styles.label}>
                {t('form.workers')}
              </label>
              <input
                type="number"
                id="workers"
                className={styles.input}
                inputMode="numeric"
                value={dailyLogWorkers ?? ''}
                onChange={(e) =>
                  onDailyLogWorkersChange?.(e.target.value ? parseInt(e.target.value, 10) : null)
                }
                disabled={disabled}
                min={0}
              />
            </div>
          </div>

          <SignatureSection
            signatures={dailyLogSignatures}
            onSignatureChange={(index, updated) => {
              if (updated) {
                const newSigs = [...(dailyLogSignatures || [])];
                newSigs[index] = updated;
                onDailyLogSignaturesChange?.(newSigs);
              } else {
                const newSigs = (dailyLogSignatures || []).filter((_, i) => i !== index);
                onDailyLogSignaturesChange?.(newSigs.length > 0 ? newSigs : null);
              }
            }}
            onAddSignature={() => {
              const newSigs = [
                ...(dailyLogSignatures || []),
                {
                  signerName: currentUserName || '',
                  signerType: 'self' as const,
                  signatureDataUrl: '',
                },
              ];
              onDailyLogSignaturesChange?.(newSigs);
            }}
            disabled={disabled}
            label={t('signature.signaturesLabel')}
            currentUserName={currentUserName}
            vendors={vendors}
          />
        </div>
      )}

      {entryType === 'site_visit' && (
        <div className={styles.metadataSection}>
          <h3 className={styles.metadataTitle}>{t('form.inspectorName')}</h3>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="inspector-name" className={styles.label}>
                {t('form.inspectorName')}{' '}
                <span className={styles.required}>{t('entryForm.required')}</span>
              </label>
              <input
                type="text"
                id="inspector-name"
                className={`${styles.input} ${validationErrors.siteVisitInspectorName ? styles.inputError : ''}`}
                value={siteVisitInspectorName || ''}
                onChange={(e) => onSiteVisitInspectorNameChange?.(e.target.value || null)}
                disabled={disabled}
                placeholder={t('form.inspectorPlaceholder')}
                required
                aria-invalid={!!validationErrors.siteVisitInspectorName}
                aria-describedby={
                  validationErrors.siteVisitInspectorName ? 'inspector-name-error' : undefined
                }
              />
              {validationErrors.siteVisitInspectorName && (
                <div id="inspector-name-error" className={styles.errorText} role="alert">
                  {validationErrors.siteVisitInspectorName}
                </div>
              )}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="inspection-outcome" className={styles.label}>
                {t('form.inspectionOutcome')}{' '}
                <span className={styles.required}>{t('entryForm.required')}</span>
              </label>
              <select
                id="inspection-outcome"
                className={`${styles.select} ${validationErrors.siteVisitOutcome ? styles.selectError : ''}`}
                value={siteVisitOutcome || ''}
                onChange={(e) =>
                  onSiteVisitOutcomeChange?.(
                    e.target.value ? (e.target.value as DiaryInspectionOutcome) : null,
                  )
                }
                disabled={disabled}
                required
                aria-invalid={!!validationErrors.siteVisitOutcome}
                aria-describedby={validationErrors.siteVisitOutcome ? 'outcome-error' : undefined}
              >
                <option value="">— {t('form.inspectionOutcomeRequired')} —</option>
                {outcomeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {validationErrors.siteVisitOutcome && (
                <div id="outcome-error" className={styles.errorText} role="alert">
                  {validationErrors.siteVisitOutcome}
                </div>
              )}
            </div>
          </div>

          <SignatureSection
            signatures={siteVisitSignatures}
            onSignatureChange={(index, updated) => {
              if (updated) {
                const newSigs = [...(siteVisitSignatures || [])];
                newSigs[index] = updated;
                onSiteVisitSignaturesChange?.(newSigs);
              } else {
                const newSigs = (siteVisitSignatures || []).filter((_, i) => i !== index);
                onSiteVisitSignaturesChange?.(newSigs.length > 0 ? newSigs : null);
              }
            }}
            onAddSignature={() => {
              const newSigs = [
                ...(siteVisitSignatures || []),
                {
                  signerName: currentUserName || '',
                  signerType: 'self' as const,
                  signatureDataUrl: '',
                },
              ];
              onSiteVisitSignaturesChange?.(newSigs);
            }}
            disabled={disabled}
            label={t('signature.signaturesLabel')}
            currentUserName={currentUserName}
            vendors={vendors}
          />
        </div>
      )}

      {entryType === 'delivery' && (
        <div className={styles.metadataSection}>
          <h3 className={styles.metadataTitle}>{t('form.vendor')}</h3>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="vendor" className={styles.label}>
                {t('form.vendor')}
              </label>
              <input
                type="text"
                id="vendor"
                className={styles.input}
                value={deliveryVendor || ''}
                onChange={(e) => onDeliveryVendorChange?.(e.target.value || null)}
                disabled={disabled}
                placeholder={t('form.vendorPlaceholder')}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>{t('form.materials')}</label>
            {(deliveryMaterials?.length ?? 0) > 0 && (
              <div className={styles.materialsList}>
                {deliveryMaterials!.map((material, index) => (
                  <div key={index} className={styles.materialChip}>
                    <span>{material}</span>
                    <button
                      type="button"
                      className={styles.chipRemoveButton}
                      onClick={() => handleRemoveMaterial(index)}
                      disabled={disabled}
                      aria-label={`Remove ${material}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.materialInputForm}>
              <input
                type="text"
                ref={materialInputRef}
                name="material-input"
                className={styles.input}
                placeholder={t('form.materialsPlaceholder')}
                disabled={disabled}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddMaterial();
                  }
                }}
              />
              <button
                type="button"
                className={styles.addButton}
                disabled={disabled}
                onClick={() => handleAddMaterial()}
              >
                {t('form.addMaterialButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {entryType === 'issue' && (
        <div className={styles.metadataSection}>
          <h3 className={styles.metadataTitle}>{t('form.severity')}</h3>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="severity" className={styles.label}>
                {t('form.severity')}{' '}
                <span className={styles.required}>{t('entryForm.required')}</span>
              </label>
              <select
                id="severity"
                className={`${styles.select} ${validationErrors.issueSeverity ? styles.selectError : ''}`}
                value={issueSeverity || ''}
                onChange={(e) =>
                  onIssueSeverityChange?.(
                    e.target.value ? (e.target.value as DiaryIssueSeverity) : null,
                  )
                }
                disabled={disabled}
                required
                aria-invalid={!!validationErrors.issueSeverity}
                aria-describedby={validationErrors.issueSeverity ? 'severity-error' : undefined}
              >
                <option value="">— {t('form.severityRequired')} —</option>
                {severityOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {validationErrors.issueSeverity && (
                <div id="severity-error" className={styles.errorText} role="alert">
                  {validationErrors.issueSeverity}
                </div>
              )}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="resolution-status" className={styles.label}>
                {t('form.resolutionStatus')}{' '}
                <span className={styles.required}>{t('entryForm.required')}</span>
              </label>
              <select
                id="resolution-status"
                className={`${styles.select} ${validationErrors.issueResolutionStatus ? styles.selectError : ''}`}
                value={issueResolutionStatus || ''}
                onChange={(e) =>
                  onIssueResolutionStatusChange?.(
                    e.target.value ? (e.target.value as DiaryIssueResolution) : null,
                  )
                }
                disabled={disabled}
                required
                aria-invalid={!!validationErrors.issueResolutionStatus}
                aria-describedby={
                  validationErrors.issueResolutionStatus ? 'resolution-error' : undefined
                }
              >
                <option value="">— {t('form.resolutionStatusRequired')} —</option>
                {resolutionStatusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {validationErrors.issueResolutionStatus && (
                <div id="resolution-error" className={styles.errorText} role="alert">
                  {validationErrors.issueResolutionStatus}
                </div>
              )}
            </div>
          </div>

          <SignatureSection
            signatures={issueSignatures}
            onSignatureChange={(index, updated) => {
              if (updated) {
                const newSigs = [...(issueSignatures || [])];
                newSigs[index] = updated;
                onIssueSignaturesChange?.(newSigs);
              } else {
                const newSigs = (issueSignatures || []).filter((_, i) => i !== index);
                onIssueSignaturesChange?.(newSigs.length > 0 ? newSigs : null);
              }
            }}
            onAddSignature={() => {
              const newSigs = [
                ...(issueSignatures || []),
                {
                  signerName: currentUserName || '',
                  signerType: 'self' as const,
                  signatureDataUrl: '',
                },
              ];
              onIssueSignaturesChange?.(newSigs);
            }}
            disabled={disabled}
            label={t('signature.signaturesLabel')}
            currentUserName={currentUserName}
            vendors={vendors}
          />
        </div>
      )}

      {/* general_note has no metadata section */}
    </div>
  );
}
