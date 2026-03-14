import React from 'react';
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
} from '@cornerstone/shared';
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
  /** site_visit metadata */
  siteVisitInspectorName?: string | null;
  onSiteVisitInspectorNameChange?: (name: string | null) => void;
  siteVisitOutcome?: DiaryInspectionOutcome | null;
  onSiteVisitOutcomeChange?: (outcome: DiaryInspectionOutcome | null) => void;
  /** delivery metadata */
  deliveryVendor?: string | null;
  onDeliveryVendorChange?: (vendor: string | null) => void;
  deliveryMaterials?: string[] | null;
  onDeliveryMaterialsChange?: (materials: string[] | null) => void;
  deliveryConfirmed?: boolean;
  onDeliveryConfirmedChange?: (confirmed: boolean) => void;
  /** issue metadata */
  issueSeverity?: DiaryIssueSeverity | null;
  onIssueSeverityChange?: (severity: DiaryIssueSeverity | null) => void;
  issueResolutionStatus?: DiaryIssueResolution | null;
  onIssueResolutionStatusChange?: (status: DiaryIssueResolution | null) => void;
}

const WEATHER_OPTIONS: Array<{ value: DiaryWeather; label: string }> = [
  { value: 'sunny', label: 'Sunny' },
  { value: 'cloudy', label: 'Cloudy' },
  { value: 'rainy', label: 'Rainy' },
  { value: 'snowy', label: 'Snowy' },
  { value: 'stormy', label: 'Stormy' },
  { value: 'other', label: 'Other' },
];

const INSPECTION_OUTCOME_OPTIONS: Array<{ value: DiaryInspectionOutcome; label: string }> = [
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'conditional', label: 'Conditional' },
];

const SEVERITY_OPTIONS: Array<{ value: DiaryIssueSeverity; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const RESOLUTION_STATUS_OPTIONS: Array<{ value: DiaryIssueResolution; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
];

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
  // site_visit
  siteVisitInspectorName,
  onSiteVisitInspectorNameChange,
  siteVisitOutcome,
  onSiteVisitOutcomeChange,
  // delivery
  deliveryVendor,
  onDeliveryVendorChange,
  deliveryMaterials,
  onDeliveryMaterialsChange,
  deliveryConfirmed,
  onDeliveryConfirmedChange,
  // issue
  issueSeverity,
  onIssueSeverityChange,
  issueResolutionStatus,
  onIssueResolutionStatusChange,
}: DiaryEntryFormProps) {
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
          Entry Date <span className={styles.required}>*</span>
        </label>
        <input
          type="date"
          id="entry-date"
          className={`${styles.input} ${validationErrors.entryDate ? styles.inputError : ''}`}
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
          Title
        </label>
        <input
          type="text"
          id="title"
          className={styles.input}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          disabled={disabled}
          placeholder="Optional title for this entry"
          maxLength={200}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="body" className={styles.label}>
          Entry <span className={styles.required}>*</span>
        </label>
        <textarea
          id="body"
          className={`${styles.textarea} ${validationErrors.body ? styles.textareaError : ''}`}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          disabled={disabled}
          placeholder="Describe what happened on the site"
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
          <h3 className={styles.metadataTitle}>Daily Log Details</h3>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="weather" className={styles.label}>
                Weather
              </label>
              <select
                id="weather"
                className={styles.select}
                value={dailyLogWeather || ''}
                onChange={(e) =>
                  onDailyLogWeatherChange?.(e.target.value ? (e.target.value as DiaryWeather) : null)
                }
                disabled={disabled}
              >
                <option value="">— Select Weather —</option>
                {WEATHER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="temperature" className={styles.label}>
                Temperature (°C)
              </label>
              <input
                type="number"
                id="temperature"
                className={styles.input}
                value={dailyLogTemperature ?? ''}
                onChange={(e) =>
                  onDailyLogTemperatureChange?.(e.target.value ? parseInt(e.target.value, 10) : null)
                }
                disabled={disabled}
                placeholder="-40 to 60"
                min={-40}
                max={60}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="workers" className={styles.label}>
                Workers on Site
              </label>
              <input
                type="number"
                id="workers"
                className={styles.input}
                value={dailyLogWorkers ?? ''}
                onChange={(e) =>
                  onDailyLogWorkersChange?.(e.target.value ? parseInt(e.target.value, 10) : null)
                }
                disabled={disabled}
                min={0}
              />
            </div>
          </div>
        </div>
      )}

      {entryType === 'site_visit' && (
        <div className={styles.metadataSection}>
          <h3 className={styles.metadataTitle}>Site Visit Details</h3>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="inspector-name" className={styles.label}>
                Inspector Name <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="inspector-name"
                className={`${styles.input} ${validationErrors.siteVisitInspectorName ? styles.inputError : ''}`}
                value={siteVisitInspectorName || ''}
                onChange={(e) => onSiteVisitInspectorNameChange?.(e.target.value || null)}
                disabled={disabled}
                placeholder="Name of inspector"
                required
                aria-invalid={!!validationErrors.siteVisitInspectorName}
                aria-describedby={
                  validationErrors.siteVisitInspectorName
                    ? 'inspector-name-error'
                    : undefined
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
                Inspection Outcome <span className={styles.required}>*</span>
              </label>
              <select
                id="inspection-outcome"
                className={`${styles.select} ${validationErrors.siteVisitOutcome ? styles.selectError : ''}`}
                value={siteVisitOutcome || ''}
                onChange={(e) =>
                  onSiteVisitOutcomeChange?.(e.target.value ? (e.target.value as DiaryInspectionOutcome) : null)
                }
                disabled={disabled}
                required
                aria-invalid={!!validationErrors.siteVisitOutcome}
                aria-describedby={validationErrors.siteVisitOutcome ? 'outcome-error' : undefined}
              >
                <option value="">— Select Outcome —</option>
                {INSPECTION_OUTCOME_OPTIONS.map((opt) => (
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
        </div>
      )}

      {entryType === 'delivery' && (
        <div className={styles.metadataSection}>
          <h3 className={styles.metadataTitle}>Delivery Details</h3>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="vendor" className={styles.label}>
                Vendor
              </label>
              <input
                type="text"
                id="vendor"
                className={styles.input}
                value={deliveryVendor || ''}
                onChange={(e) => onDeliveryVendorChange?.(e.target.value || null)}
                disabled={disabled}
                placeholder="Vendor name"
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="delivery-confirmed" className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  id="delivery-confirmed"
                  checked={deliveryConfirmed || false}
                  onChange={(e) => onDeliveryConfirmedChange?.(e.target.checked)}
                  disabled={disabled}
                  className={styles.checkbox}
                />
                Delivery Confirmed
              </label>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Materials</label>
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
                placeholder="Add material and press enter"
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
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {entryType === 'issue' && (
        <div className={styles.metadataSection}>
          <h3 className={styles.metadataTitle}>Issue Details</h3>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label htmlFor="severity" className={styles.label}>
                Severity <span className={styles.required}>*</span>
              </label>
              <select
                id="severity"
                className={`${styles.select} ${validationErrors.issueSeverity ? styles.selectError : ''}`}
                value={issueSeverity || ''}
                onChange={(e) =>
                  onIssueSeverityChange?.(e.target.value ? (e.target.value as DiaryIssueSeverity) : null)
                }
                disabled={disabled}
                required
                aria-invalid={!!validationErrors.issueSeverity}
                aria-describedby={validationErrors.issueSeverity ? 'severity-error' : undefined}
              >
                <option value="">— Select Severity —</option>
                {SEVERITY_OPTIONS.map((opt) => (
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
                Resolution Status <span className={styles.required}>*</span>
              </label>
              <select
                id="resolution-status"
                className={`${styles.select} ${validationErrors.issueResolutionStatus ? styles.selectError : ''}`}
                value={issueResolutionStatus || ''}
                onChange={(e) =>
                  onIssueResolutionStatusChange?.(e.target.value ? (e.target.value as DiaryIssueResolution) : null)
                }
                disabled={disabled}
                required
                aria-invalid={!!validationErrors.issueResolutionStatus}
                aria-describedby={
                  validationErrors.issueResolutionStatus ? 'resolution-error' : undefined
                }
              >
                <option value="">— Select Status —</option>
                {RESOLUTION_STATUS_OPTIONS.map((opt) => (
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
        </div>
      )}

      {/* general_note has no metadata section */}
    </div>
  );
}
