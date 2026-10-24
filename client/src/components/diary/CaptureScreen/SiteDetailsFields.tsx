import { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  DiaryInspectionOutcome,
  DiaryIssueResolution,
  DiaryIssueSeverity,
  DiarySignatureEntry,
  DiaryWeather,
  ManualDiaryEntryType,
} from '@cornerstone/shared';
import {
  DIARY_INSPECTION_OUTCOMES,
  DIARY_ISSUE_RESOLUTIONS,
  DIARY_ISSUE_SEVERITIES,
  DIARY_WEATHERS,
  foldSearchText,
} from '@cornerstone/shared';
import shared from '../../../styles/shared.module.css';
import { FilterChipGroup } from '../../FilterChipGroup/FilterChipGroup.js';
import type { FilterChipOption } from '../../FilterChipGroup/FilterChipGroup.js';
import { FormError } from '../../FormError/FormError.js';
import { TimeChips } from '../../TimeChips/TimeChips.js';
import { SignatureSection } from '../SignatureSection/index.js';
import { computeWorkDuration, useFormatters } from '../../../lib/formatters.js';
import { I18N_UNION_KEYS } from '../../../i18n/unionKeys.js';
import { EntityPickerDialog } from '../../EntityPicker/EntityPickerDialog.js';
import { isSignatureComplete } from './captureMetadata.js';
import type { CaptureFieldId, CaptureFields, CaptureMode } from './captureMetadata.js';
import type { CompanySuggestion } from './captureSuggestions.js';
import styles from './SiteDetailsFields.module.css';

const WORKER_CHIPS = ['1', '2', '3'] as const;
const WORKERS_AT_LEAST = '4+';
const OTHER_COMPANY = 'other-company';

export interface SiteDetailsFieldsProps {
  entryType: ManualDiaryEntryType;
  mode: CaptureMode;
  fields: CaptureFields;
  signatures: DiarySignatureEntry[];
  /** Message keys (namespace `diary`) of the fields that failed the last Save. */
  errors: Partial<Record<CaptureFieldId, string>>;
  companies: readonly CompanySuggestion[];
  recentStart: readonly string[];
  recentEnd: readonly string[];
  currentUserName?: string;
  onFields: (patch: Partial<CaptureFields>, schedule?: 'now' | 'typing') => void;
  onSignatures: (next: DiarySignatureEntry[]) => void;
  moreOpen: boolean;
  onMoreOpenChange: (open: boolean) => void;
}

function currentClockTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** The type-specific fields of the capture screen: chips first, details behind "More details". */
export function SiteDetailsFields({
  entryType,
  mode,
  fields,
  signatures,
  errors,
  companies,
  recentStart,
  recentEnd,
  currentUserName,
  onFields,
  onSignatures,
  moreOpen,
  onMoreOpenChange,
}: SiteDetailsFieldsProps) {
  const { t } = useTranslation('diary');
  const { t: tCommon } = useTranslation('common');
  const { formatClockTime, formatHours } = useFormatters();
  const fieldId = useId();
  const companyLabelId = `${fieldId}-company`;
  const workersLabelId = `${fieldId}-workers`;
  const outcomeLabelId = `${fieldId}-outcome`;
  const severityLabelId = `${fieldId}-severity`;
  const statusLabelId = `${fieldId}-status`;
  const weatherLabelId = `${fieldId}-weather`;
  const moreId = `${fieldId}-more`;
  const companyRowRef = useRef<HTMLDivElement>(null);
  const otherCompanyRef = useRef<HTMLElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [materialText, setMaterialText] = useState('');
  // The number input behind "4+" stays while it has focus, whatever the value typed so far.
  const [exactEditing, setExactEditing] = useState(false);

  if (entryType === 'general_note') return null;

  const isDailyLog = entryType === 'daily_log';
  const isSiteVisit = entryType === 'site_visit';
  const isDelivery = entryType === 'delivery';
  const isIssue = entryType === 'issue';
  const hasMoreDetails = isDailyLog || isSiteVisit || isIssue;

  // ── Company ─────────────────────────────────────────────────────────────────────────────────

  const companyOptions: FilterChipOption[] = [];
  let companyValue = '';
  if (isDailyLog || isDelivery) {
    const suggestions = isDailyLog ? companies.filter((c) => c.id !== null) : companies;
    const valueOf = (c: CompanySuggestion) => (isDailyLog ? (c.id ?? '') : c.name);
    for (const company of suggestions) {
      companyOptions.push({ value: valueOf(company), label: company.name });
    }
    if (isDailyLog && fields.vendorId) {
      companyValue = fields.vendorId;
      if (!suggestions.some((c) => c.id === fields.vendorId) && fields.vendorName) {
        companyOptions.push({ value: fields.vendorId, label: fields.vendorName });
      }
    } else if (isDelivery && fields.vendor) {
      const match = suggestions.find(
        (c) => foldSearchText(c.name.trim()) === foldSearchText(fields.vendor!.trim()),
      );
      companyValue = match ? match.name : fields.vendor;
      if (!match) companyOptions.push({ value: fields.vendor, label: fields.vendor });
    }
    companyOptions.push({
      value: OTHER_COMPANY,
      label: t('capture.otherCompany'),
      action: true,
      onSelect: () => {
        otherCompanyRef.current =
          companyRowRef.current?.querySelector<HTMLElement>(
            `[data-chip-value="${OTHER_COMPANY}"]`,
          ) ?? null;
        setPickerOpen(true);
      },
    });
  }

  const pickCompany = (company: { id: string | null; name: string }) => {
    if (isDailyLog) {
      onFields({ vendorId: company.id, vendorName: company.name });
    } else {
      onFields({ vendor: company.name });
    }
  };

  const changeCompany = (value: string) => {
    if (value === '') {
      if (isDailyLog) onFields({ vendorId: null, vendorName: null });
      else onFields({ vendor: null });
      return;
    }
    const chosen = companyOptions.find((option) => option.value === value);
    if (!chosen) return;
    pickCompany(isDailyLog ? { id: value, name: chosen.label } : { id: null, name: chosen.label });
  };

  // ── Workers ─────────────────────────────────────────────────────────────────────────────────

  const workers = fields.workers;
  const workersValue = exactEditing
    ? WORKERS_AT_LEAST
    : workers === null
      ? ''
      : workers >= 4
        ? WORKERS_AT_LEAST
        : workers >= 1
          ? String(workers)
          : '';
  const workerOptions: FilterChipOption[] = [
    ...WORKER_CHIPS.map((value) => ({ value, label: value })),
    { value: WORKERS_AT_LEAST, label: t('capture.workersAtLeast', { count: 4 }) },
  ];

  // ── Times ───────────────────────────────────────────────────────────────────────────────────

  const hasTimes = isDailyLog || isSiteVisit;
  const duration = computeWorkDuration(fields.workStart, fields.workEnd);
  const timeErrorId = `${fieldId}-time-error`;
  const timeError = errors.time;
  const endBeforeStart =
    Boolean(fields.workStart && fields.workEnd) && !duration ? t('capture.endBeforeStart') : null;

  // ── Materials ───────────────────────────────────────────────────────────────────────────────

  const addMaterial = () => {
    const material = materialText.trim();
    if (!material) return;
    onFields({ materials: [...fields.materials, material] });
    setMaterialText('');
  };

  const onMaterialKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addMaterial();
  };

  // ── More details ────────────────────────────────────────────────────────────────────────────

  const moreCount =
    (isDailyLog && fields.weather ? 1 : 0) +
    (isDailyLog && fields.temperature.trim() ? 1 : 0) +
    (signatures.length > 0 ? 1 : 0);

  const weatherOptions: FilterChipOption[] = DIARY_WEATHERS.map((weather) => ({
    value: weather,
    label: t(I18N_UNION_KEYS.diaryWeather.key(weather)),
  }));
  const outcomeOptions: FilterChipOption[] = DIARY_INSPECTION_OUTCOMES.map((outcome) => ({
    value: outcome,
    label: t(I18N_UNION_KEYS.diaryOutcome.key(outcome)),
  }));
  const severityOptions: FilterChipOption[] = DIARY_ISSUE_SEVERITIES.map((severity) => ({
    value: severity,
    label: t(I18N_UNION_KEYS.diarySeverity.key(severity)),
  }));
  const statusOptions: FilterChipOption[] = DIARY_ISSUE_RESOLUTIONS.map((status) => ({
    value: status,
    label: tCommon(I18N_UNION_KEYS.statusVocabularyDefect.key(status)),
  }));

  const addSignature = () =>
    onSignatures([
      ...signatures,
      { signerName: currentUserName ?? '', signerType: 'self', signatureDataUrl: '' },
    ]);

  return (
    <section className={styles.section} aria-labelledby={`${fieldId}-heading`}>
      <h2 id={`${fieldId}-heading`} className={styles.heading}>
        {t('capture.siteDetails')}
      </h2>

      {(isDailyLog || isDelivery) && (
        <div className={styles.group} ref={companyRowRef} data-testid="capture-company">
          <span id={companyLabelId} className={styles.label}>
            {t('capture.company')}
          </span>
          <FilterChipGroup
            options={companyOptions}
            value={companyValue}
            onChange={changeCompany}
            labelledBy={companyLabelId}
            layout="wrap"
            deselectable
            testIdPrefix="capture-company-chip"
          />
          <EntityPickerDialog
            open={pickerOpen}
            title={t('capture.chooseCompany')}
            onClose={() => setPickerOpen(false)}
            onPick={(option) => pickCompany({ id: option.id, name: option.label })}
            returnFocusRef={otherCompanyRef}
            testId="capture-company-sheet"
            picker={{ kind: 'company', placeholder: t('capture.companyPlaceholder') }}
          />
        </div>
      )}

      {isDailyLog && (
        <div className={styles.group} data-testid="capture-workers">
          <span id={workersLabelId} className={styles.label}>
            {t('capture.workers')}
          </span>
          <FilterChipGroup
            options={workerOptions}
            value={workersValue}
            onChange={(value) => {
              if (value === '') onFields({ workers: null });
              else onFields({ workers: value === WORKERS_AT_LEAST ? 4 : Number(value) });
            }}
            labelledBy={workersLabelId}
            layout="wrap"
            deselectable
            testIdPrefix="capture-workers-chip"
          />
          {((workers !== null && workers >= 4) || exactEditing) && (
            <WorkersExactInput
              value={workers ?? 4}
              onEditingChange={setExactEditing}
              label={t('capture.workersExact')}
              onChange={(count) => onFields({ workers: count }, 'typing')}
            />
          )}
        </div>
      )}

      {hasTimes && (
        <>
          <TimeChips
            value={fields.workStart}
            onChange={(value) => onFields({ workStart: value })}
            recent={recentStart}
            now={currentClockTime}
            labels={{
              group: t('capture.start'),
              now: t('capture.now'),
              other: t('capture.otherTime'),
              input: t('capture.startTime'),
            }}
            formatTime={formatClockTime}
            testIdPrefix="capture-start"
          />
          <div className={styles.timeEnd} id="capture-field-time">
            <TimeChips
              value={fields.workEnd}
              onChange={(value) => onFields({ workEnd: value })}
              recent={recentEnd}
              now={currentClockTime}
              labels={{
                group: t('capture.end'),
                now: t('capture.now'),
                other: t('capture.otherTime'),
                input: t('capture.endTime'),
              }}
              formatTime={formatClockTime}
              invalid={Boolean(endBeforeStart ?? timeError)}
              describedBy={endBeforeStart || timeError ? timeErrorId : undefined}
              testIdPrefix="capture-end"
            />
            {duration !== null && (
              <p className={styles.duration} data-testid="capture-duration">
                {t('capture.duration', { hours: formatHours(duration) })}
              </p>
            )}
            <FormError
              id={timeErrorId}
              variant="field"
              message={endBeforeStart ?? (timeError ? t(timeError) : null)}
            />
          </div>
        </>
      )}

      {isSiteVisit && (
        <>
          <div className={styles.group}>
            <label htmlFor="capture-field-inspector" className={styles.label}>
              {t('capture.inspector')}
            </label>
            <input
              id="capture-field-inspector"
              type="text"
              className={`${shared.input} ${styles.input}`}
              autoComplete="off"
              value={fields.inspectorName}
              maxLength={200}
              aria-invalid={errors.inspector ? true : undefined}
              aria-describedby={errors.inspector ? `${fieldId}-inspector-error` : undefined}
              onChange={(event) => onFields({ inspectorName: event.target.value }, 'typing')}
            />
            <FormError
              id={`${fieldId}-inspector-error`}
              variant="field"
              message={errors.inspector ? t(errors.inspector) : null}
            />
          </div>
          <div className={styles.group} id="capture-field-outcome">
            <span id={outcomeLabelId} className={styles.label}>
              {t('capture.outcome')}
            </span>
            <FilterChipGroup
              options={outcomeOptions}
              value={fields.outcome ?? ''}
              onChange={(value) => onFields({ outcome: value as DiaryInspectionOutcome })}
              labelledBy={outcomeLabelId}
              layout="wrap"
              testIdPrefix="capture-outcome"
            />
            <FormError variant="field" message={errors.outcome ? t(errors.outcome) : null} />
          </div>
        </>
      )}

      {isDelivery && (
        <>
          <div className={styles.group} data-testid="capture-materials">
            <label htmlFor={`${fieldId}-material`} className={styles.label}>
              {t('capture.materials')}
            </label>
            {fields.materials.length > 0 && (
              <ul className={styles.materials}>
                {fields.materials.map((material, index) => (
                  // Materials may repeat; the position keeps keys unique.
                  // eslint-disable-next-line @eslint-react/no-array-index-key -- duplicates are allowed
                  <li key={`${material}-${index}`} className={styles.material}>
                    <span className={styles.materialText}>{material}</span>
                    <button
                      type="button"
                      className={`${shared.btnIcon} ${styles.removeMaterial}`}
                      aria-label={t('capture.removeMaterial', { material })}
                      onClick={() =>
                        onFields({ materials: fields.materials.filter((_, i) => i !== index) })
                      }
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.materialInput}>
              <input
                id={`${fieldId}-material`}
                type="text"
                className={`${shared.input} ${styles.input}`}
                autoComplete="off"
                placeholder={t('capture.addMaterial')}
                value={materialText}
                onChange={(event) => setMaterialText(event.target.value)}
                onKeyDown={onMaterialKey}
              />
              <button
                type="button"
                className={`${shared.btnSecondaryCompact} ${styles.addButton}`}
                onClick={addMaterial}
              >
                {tCommon('button.add')}
              </button>
            </div>
          </div>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={fields.deliveryConfirmed}
              onChange={(event) => onFields({ deliveryConfirmed: event.target.checked })}
            />
            <span>{t('capture.deliveryConfirmed')}</span>
          </label>
        </>
      )}

      {isIssue && (
        <>
          <div className={styles.group} id="capture-field-severity">
            <span id={severityLabelId} className={styles.label}>
              {t('capture.severity')}
            </span>
            <FilterChipGroup
              options={severityOptions}
              value={fields.severity ?? ''}
              onChange={(value) => onFields({ severity: value as DiaryIssueSeverity })}
              labelledBy={severityLabelId}
              layout="wrap"
              testIdPrefix="capture-severity"
            />
            <FormError variant="field" message={errors.severity ? t(errors.severity) : null} />
          </div>
          {mode !== 'saved' && (
            <div className={styles.group} id="capture-field-status">
              <span id={statusLabelId} className={styles.label}>
                {t('capture.status')}
              </span>
              <FilterChipGroup
                options={statusOptions}
                value={fields.resolutionStatus ?? ''}
                onChange={(value) => onFields({ resolutionStatus: value as DiaryIssueResolution })}
                labelledBy={statusLabelId}
                layout="wrap"
                testIdPrefix="capture-status"
              />
              <FormError variant="field" message={errors.status ? t(errors.status) : null} />
            </div>
          )}
        </>
      )}

      {hasMoreDetails && (
        <div className={styles.more}>
          <button
            type="button"
            className={styles.disclosure}
            aria-expanded={moreOpen}
            aria-controls={moreId}
            onClick={() => onMoreOpenChange(!moreOpen)}
            data-testid="capture-more-details"
          >
            {moreCount > 0
              ? t('capture.moreDetailsCount', { count: moreCount })
              : t('capture.moreDetails')}
            <span
              aria-hidden="true"
              className={`${styles.chevron} ${moreOpen ? styles.chevronOpen : ''}`}
            >
              ▾
            </span>
          </button>
          <div id={moreId} className={styles.moreBody} hidden={!moreOpen}>
            {isDailyLog && (
              <>
                <div className={styles.group}>
                  <span id={weatherLabelId} className={styles.label}>
                    {t('capture.weather')}
                  </span>
                  <FilterChipGroup
                    options={weatherOptions}
                    value={fields.weather ?? ''}
                    onChange={(value) =>
                      onFields({ weather: value === '' ? null : (value as DiaryWeather) })
                    }
                    labelledBy={weatherLabelId}
                    layout="wrap"
                    deselectable
                    testIdPrefix="capture-weather"
                  />
                </div>
                <div className={styles.group}>
                  <label htmlFor={`${fieldId}-temperature`} className={styles.label}>
                    {t('capture.temperature')}
                  </label>
                  <input
                    id={`${fieldId}-temperature`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    className={`${shared.input} ${styles.input} ${styles.narrow}`}
                    value={fields.temperature}
                    onChange={(event) => onFields({ temperature: event.target.value }, 'typing')}
                  />
                </div>
              </>
            )}
            <div className={styles.group} id="capture-field-signatures">
              {signatures.length === 0 ? (
                <button
                  type="button"
                  className={`${shared.btnSecondary} ${styles.addSignature}`}
                  onClick={addSignature}
                >
                  {t('signature.addSignature')}
                </button>
              ) : (
                <SignatureSection
                  signatures={signatures}
                  onSignatureChange={(index, updated) => {
                    if (updated) {
                      onSignatures(signatures.map((sig, i) => (i === index ? updated : sig)));
                    } else {
                      onSignatures(signatures.filter((_, i) => i !== index));
                    }
                  }}
                  onAddSignature={addSignature}
                  label={t('signature.signaturesLabel')}
                  currentUserName={currentUserName}
                />
              )}
              {errors.signatures && signatures.some((sig) => !isSignatureComplete(sig)) && (
                <FormError variant="field" message={t(errors.signatures)} />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

interface WorkersExactInputProps {
  value: number;
  label: string;
  onChange: (count: number) => void;
  onEditingChange: (editing: boolean) => void;
}

/** The number input behind the "4+" chip; it keeps the text while the person types. */
function WorkersExactInput({ value, label, onChange, onEditingChange }: WorkersExactInputProps) {
  const id = useId();
  const [text, setText] = useState(String(value));
  return (
    <div className={styles.group}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={`${shared.input} ${styles.input} ${styles.narrow}`}
        value={text}
        onFocus={() => onEditingChange(true)}
        onBlur={() => onEditingChange(false)}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, '');
          setText(next);
          onEditingChange(true);
          if (next !== '') onChange(Math.min(Number(next), 9999));
        }}
      />
    </div>
  );
}
