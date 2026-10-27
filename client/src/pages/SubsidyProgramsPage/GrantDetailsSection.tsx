import { useId, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubsidyProgram, UpdateSubsidyProgramRequest } from '@cornerstone/shared';
import { FormError } from '../../components/FormError/FormError.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { useUserText } from '../../hooks/useUserText.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { formatRate } from '../../lib/formatRate.js';
import { updateSubsidyProgram } from '../../lib/subsidyProgramsApi.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './GrantPage.module.css';

const NAME_MAX = 200;
const RATE_MAX = 100;

interface Draft {
  name: string;
  reductionValue: string;
  maximumAmount: string;
  applicationDeadline: string;
  description: string;
  notes: string;
}

type DraftField = keyof Draft;

function draftOf(grant: SubsidyProgram): Draft {
  return {
    name: grant.name,
    reductionValue: String(grant.reductionValue),
    maximumAmount: grant.maximumAmount === null ? '' : String(grant.maximumAmount),
    applicationDeadline: grant.applicationDeadline ?? '',
    description: grant.description ?? '',
    notes: grant.notes ?? '',
  };
}

export interface GrantDetailsSectionProps {
  readonly grant: SubsidyProgram;
  /** After a successful save: the page refresh (the PATCH response lacks the money figures). */
  readonly onSaved: () => Promise<unknown>;
}

/**
 * The Details card of a grant: name, rate, cap, deadline, description and notes. A legacy fixed
 * grant edits its stored amount as "Fixed reduction"; the type itself is never changed here.
 */
export function GrantDetailsSection({ grant, onSaved }: GrantDetailsSectionProps) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { formatCurrency, formatDate, formatPercent } = useFormatters();
  const userText = useUserText();
  const baseId = useId();
  const fixed = grant.reductionType === 'fixed';
  const [draft, setDraft] = useState<Draft>(() => draftOf(grant));
  const [errors, setErrors] = useState<Partial<Record<DraftField, string>>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);

  const initial = draftOf(grant);
  const dirty = (Object.keys(initial) as DraftField[]).some((key) => draft[key] !== initial[key]);
  const set = (field: DraftField, value: string) =>
    setDraft((prev) => ({ ...prev, [field]: value }));

  const validate = (): Partial<Record<DraftField, string>> => {
    const found: Partial<Record<DraftField, string>> = {};
    if (!draft.name.trim()) found.name = t('financing.errors.nameRequired');
    const rate = Number(draft.reductionValue);
    const rateValid =
      draft.reductionValue.trim() !== '' &&
      Number.isFinite(rate) &&
      rate > 0 &&
      (fixed || rate <= RATE_MAX);
    if (!rateValid) {
      found.reductionValue = fixed
        ? t('financing.errors.amountInvalid')
        : t('financing.errors.rateInvalid');
    }
    const rawCap = draft.maximumAmount.trim();
    if (rawCap !== '' && !(Number.isFinite(Number(rawCap)) && Number(rawCap) > 0)) {
      found.maximumAmount = t('financing.errors.amountInvalid');
    }
    return found;
  };

  const save = async (): Promise<boolean> => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return false;
    const body: UpdateSubsidyProgramRequest = {
      ...(draft.name !== initial.name ? { name: draft.name.trim() } : {}),
      ...(draft.reductionValue !== initial.reductionValue
        ? { reductionValue: Number(draft.reductionValue) }
        : {}),
      ...(draft.maximumAmount !== initial.maximumAmount
        ? { maximumAmount: draft.maximumAmount.trim() === '' ? null : Number(draft.maximumAmount) }
        : {}),
      ...(draft.applicationDeadline !== initial.applicationDeadline
        ? { applicationDeadline: draft.applicationDeadline || null }
        : {}),
      ...(draft.description !== initial.description
        ? { description: draft.description.trim() || null }
        : {}),
      ...(draft.notes !== initial.notes ? { notes: draft.notes.trim() || null } : {}),
    };
    try {
      await updateSubsidyProgram(grant.id, body);
    } catch (err) {
      setBannerError(
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : t('financing.grantPage.saveError'),
      );
      return false;
    }
    setBannerError(null);
    // The PATCH succeeded: a failed page refresh is the page's own error state, not a failed save.
    await onSaved().catch(() => undefined);
    return true;
  };

  const discard = () => {
    setDraft(initial);
    setErrors({});
    setBannerError(null);
  };

  const fieldId = (field: DraftField) => `${baseId}-${field}`;
  const errorId = (field: DraftField) => `${baseId}-${field}-error`;
  const invalid = (field: DraftField) => (errors[field] ? true : undefined);
  const describedBy = (field: DraftField) => (errors[field] ? errorId(field) : undefined);
  const requiredMark = <span className={styles.required}> {tc('objectForm.required')}</span>;
  const rateLabel = fixed ? t('financing.grant.fixedReductionField') : t('financing.fields.rate');

  const row = (label: string, value: ReactNode, testId: string, isUserText = false) => (
    <div className={styles.detailRow}>
      <dt>{label}</dt>
      <dd data-testid={testId} {...(isUserText && value ? userText() : {})}>
        {value || (
          <>
            <span aria-hidden="true">–</span>
            <span className={sharedStyles.srOnly}>{tc('summaryStrip.notSet')}</span>
          </>
        )}
      </dd>
    </div>
  );

  const rateRead = fixed ? (
    <>
      <span className={sharedStyles.srOnly}>{t('financing.grant.fixedReductionField')} </span>
      {formatCurrency(grant.reductionValue)}
    </>
  ) : (
    formatRate(grant.reductionValue, formatPercent)
  );

  return (
    <SectionCard
      id="grant-details"
      title={t('financing.sections.details')}
      testId="grant-details"
      edit={{
        dirty,
        onStart: discard,
        onSave: save,
        onDiscard: discard,
        error: bannerError,
        renderFields: ({ firstFieldRef }) => (
          <div className={styles.fields}>
            <div className={styles.field}>
              <label htmlFor={fieldId('name')} className={styles.label}>
                {t('financing.fields.name')}
                {requiredMark}
              </label>
              <input
                id={fieldId('name')}
                ref={firstFieldRef as RefObject<HTMLInputElement | null>}
                className={sharedStyles.input}
                value={draft.name}
                maxLength={NAME_MAX}
                onChange={(e) => set('name', e.target.value)}
                aria-invalid={invalid('name')}
                aria-describedby={describedBy('name')}
                data-testid="grant-field-name"
              />
              <FormError variant="field" id={errorId('name')} message={errors.name} />
            </div>
            <div className={styles.field}>
              <label htmlFor={fieldId('reductionValue')} className={styles.label}>
                {rateLabel}
                {requiredMark}
              </label>
              <input
                id={fieldId('reductionValue')}
                type="number"
                className={sharedStyles.input}
                value={draft.reductionValue}
                min={0}
                max={fixed ? undefined : RATE_MAX}
                step="0.01"
                inputMode="decimal"
                onChange={(e) => set('reductionValue', e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                aria-invalid={invalid('reductionValue')}
                aria-describedby={describedBy('reductionValue')}
                data-testid="grant-field-rate"
              />
              <FormError
                variant="field"
                id={errorId('reductionValue')}
                message={errors.reductionValue}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={fieldId('maximumAmount')} className={styles.label}>
                {t('financing.grant.cap')}
              </label>
              <input
                id={fieldId('maximumAmount')}
                type="number"
                className={sharedStyles.input}
                value={draft.maximumAmount}
                min={0}
                step="0.01"
                inputMode="decimal"
                onChange={(e) => set('maximumAmount', e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                aria-invalid={invalid('maximumAmount')}
                aria-describedby={describedBy('maximumAmount')}
                data-testid="grant-field-cap"
              />
              <FormError
                variant="field"
                id={errorId('maximumAmount')}
                message={errors.maximumAmount}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={fieldId('applicationDeadline')} className={styles.label}>
                {t('financing.fields.deadline')}
              </label>
              <input
                id={fieldId('applicationDeadline')}
                type="date"
                className={sharedStyles.input}
                value={draft.applicationDeadline}
                onChange={(e) => set('applicationDeadline', e.target.value)}
                data-testid="grant-field-deadline"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={fieldId('description')} className={styles.label}>
                {t('financing.fields.description')}
              </label>
              <textarea
                id={fieldId('description')}
                className={sharedStyles.textarea}
                rows={3}
                value={draft.description}
                onChange={(e) => set('description', e.target.value)}
                data-testid="grant-field-description"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={fieldId('notes')} className={styles.label}>
                {t('financing.fields.notes')}
              </label>
              <textarea
                id={fieldId('notes')}
                className={sharedStyles.textarea}
                rows={3}
                value={draft.notes}
                onChange={(e) => set('notes', e.target.value)}
                data-testid="grant-field-notes"
              />
            </div>
          </div>
        ),
      }}
    >
      <dl className={styles.details}>
        {row(t('financing.fields.name'), grant.name, 'grant-detail-name', true)}
        {row(rateLabel, rateRead, 'grant-detail-rate')}
        {row(
          t('financing.grant.cap'),
          grant.maximumAmount === null
            ? t('financing.grant.noCap')
            : formatCurrency(grant.maximumAmount),
          'grant-detail-cap',
        )}
        {row(
          t('financing.fields.deadline'),
          grant.applicationDeadline ? formatDate(grant.applicationDeadline) : null,
          'grant-detail-deadline',
        )}
        {row(
          t('financing.fields.description'),
          grant.description,
          'grant-detail-description',
          true,
        )}
        {row(t('financing.fields.notes'), grant.notes, 'grant-detail-notes', true)}
      </dl>
    </SectionCard>
  );
}

export default GrantDetailsSection;
