import { useId, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { BUDGET_SOURCE_TYPES } from '@cornerstone/shared';
import type {
  BudgetSource,
  BudgetSourceType,
  UpdateBudgetSourceRequest,
} from '@cornerstone/shared';
import { FormError } from '../../components/FormError/FormError.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { useUserText } from '../../hooks/useUserText.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { updateBudgetSource } from '../../lib/budgetSourcesApi.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { formatRate } from '../../lib/formatRate.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './FundingSourcePage.module.css';

const NAME_MAX = 200;
const REFERENCE_MAX = 200;
const CONTACT_MAX = 500;
const RATE_MAX = 100;

/** The types a person can pick; Own funds is the system source and keeps its type. */
const PICKABLE_TYPES = BUDGET_SOURCE_TYPES.filter((type) => type !== 'discretionary');

interface Draft {
  name: string;
  sourceType: BudgetSourceType;
  totalAmount: string;
  interestRate: string;
  terms: string;
  reference: string;
  contactAddress: string;
  notes: string;
}

type DraftField = keyof Draft;

function draftOf(source: BudgetSource): Draft {
  return {
    name: source.name,
    sourceType: source.sourceType,
    totalAmount: String(source.totalAmount),
    interestRate: source.interestRate === null ? '' : String(source.interestRate),
    terms: source.terms ?? '',
    reference: source.reference ?? '',
    contactAddress: source.contactAddress ?? '',
    notes: source.notes ?? '',
  };
}

export interface FundingSourceDetailsSectionProps {
  readonly source: BudgetSource;
  /** After a successful save: the page refresh (the PATCH response lacks the money figures). */
  readonly onSaved: () => Promise<unknown>;
}

/** The Details card of a funding source: read-only facts with an explicit-Save edit form. */
export function FundingSourceDetailsSection({ source, onSaved }: FundingSourceDetailsSectionProps) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { formatCurrency, formatPercent } = useFormatters();
  const userText = useUserText();
  const baseId = useId();
  const own = source.isDiscretionary;
  const [draft, setDraft] = useState<Draft>(() => draftOf(source));
  const [errors, setErrors] = useState<Partial<Record<DraftField, string>>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);

  const initial = draftOf(source);
  const dirty = (Object.keys(initial) as DraftField[]).some((key) => draft[key] !== initial[key]);

  const set = (field: DraftField, value: string) =>
    setDraft((prev) => ({ ...prev, [field]: value }));

  const validate = (): Partial<Record<DraftField, string>> => {
    const found: Partial<Record<DraftField, string>> = {};
    if (!draft.name.trim()) found.name = t('financing.errors.nameRequired');
    const amount = Number(draft.totalAmount);
    const amountValid =
      draft.totalAmount.trim() !== '' &&
      Number.isFinite(amount) &&
      (own ? amount >= 0 : amount > 0);
    if (!amountValid) {
      found.totalAmount = own
        ? t('financing.errors.amountNotNegative')
        : t('financing.errors.amountInvalid');
    }
    const rawRate = draft.interestRate.trim();
    if (rawRate !== '') {
      const rate = Number(rawRate);
      if (!(Number.isFinite(rate) && rate >= 0 && rate <= RATE_MAX)) {
        found.interestRate = t('financing.errors.interestInvalid');
      }
    }
    return found;
  };

  const save = async (): Promise<boolean> => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return false;
    const body: UpdateBudgetSourceRequest = {
      ...(draft.name !== initial.name ? { name: draft.name.trim() } : {}),
      ...(!own && draft.sourceType !== initial.sourceType ? { sourceType: draft.sourceType } : {}),
      ...(draft.totalAmount !== initial.totalAmount
        ? { totalAmount: Number(draft.totalAmount) }
        : {}),
      ...(draft.interestRate !== initial.interestRate
        ? { interestRate: draft.interestRate.trim() === '' ? null : Number(draft.interestRate) }
        : {}),
      ...(draft.terms !== initial.terms ? { terms: draft.terms.trim() || null } : {}),
      ...(draft.reference !== initial.reference
        ? { reference: draft.reference.trim() || null }
        : {}),
      ...(draft.contactAddress !== initial.contactAddress
        ? { contactAddress: draft.contactAddress.trim() || null }
        : {}),
      ...(draft.notes !== initial.notes ? { notes: draft.notes.trim() || null } : {}),
    };
    try {
      await updateBudgetSource(source.id, body);
    } catch (err) {
      setBannerError(
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : t('financing.sourcePage.saveError'),
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

  const row = (label: string, value: string | null, testId: string, isUserText = false) => (
    <div className={styles.detailRow}>
      <dt>{label}</dt>
      <dd data-testid={testId} {...(isUserText && value ? userText() : {})}>
        {value ? (
          value
        ) : (
          <>
            <span aria-hidden="true">–</span>
            <span className={sharedStyles.srOnly}>{tc('summaryStrip.notSet')}</span>
          </>
        )}
      </dd>
    </div>
  );

  return (
    <SectionCard
      id="source-details"
      title={t('financing.sections.details')}
      testId="source-details"
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
                data-testid="source-field-name"
              />
              <FormError variant="field" id={errorId('name')} message={errors.name} />
            </div>
            {!own && (
              <div className={styles.field}>
                <label htmlFor={fieldId('sourceType')} className={styles.label}>
                  {t('financing.fields.type')}
                </label>
                <select
                  id={fieldId('sourceType')}
                  className={sharedStyles.select}
                  value={draft.sourceType}
                  onChange={(e) => set('sourceType', e.target.value as BudgetSourceType)}
                  data-testid="source-field-type"
                >
                  {PICKABLE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(I18N_UNION_KEYS.fundingSourceType.key(type))}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className={styles.field}>
              <label htmlFor={fieldId('totalAmount')} className={styles.label}>
                {t('financing.fields.amount')}
                {requiredMark}
              </label>
              <input
                id={fieldId('totalAmount')}
                type="number"
                className={sharedStyles.input}
                value={draft.totalAmount}
                min={0}
                step="0.01"
                inputMode="decimal"
                onChange={(e) => set('totalAmount', e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                aria-invalid={invalid('totalAmount')}
                aria-describedby={describedBy('totalAmount')}
                data-testid="source-field-amount"
              />
              <FormError variant="field" id={errorId('totalAmount')} message={errors.totalAmount} />
            </div>
            <div className={styles.field}>
              <label htmlFor={fieldId('interestRate')} className={styles.label}>
                {t('financing.fields.interestRate')}
              </label>
              <input
                id={fieldId('interestRate')}
                type="number"
                className={sharedStyles.input}
                value={draft.interestRate}
                min={0}
                max={RATE_MAX}
                step="0.01"
                inputMode="decimal"
                onChange={(e) => set('interestRate', e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                aria-invalid={invalid('interestRate')}
                aria-describedby={describedBy('interestRate')}
                data-testid="source-field-interest-rate"
              />
              <FormError
                variant="field"
                id={errorId('interestRate')}
                message={errors.interestRate}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={fieldId('reference')} className={styles.label}>
                {t('financing.fields.reference')}
              </label>
              <input
                id={fieldId('reference')}
                className={sharedStyles.input}
                value={draft.reference}
                maxLength={REFERENCE_MAX}
                onChange={(e) => set('reference', e.target.value)}
                data-testid="source-field-reference"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={fieldId('terms')} className={styles.label}>
                {t('financing.fields.terms')}
              </label>
              <textarea
                id={fieldId('terms')}
                className={sharedStyles.textarea}
                rows={3}
                value={draft.terms}
                onChange={(e) => set('terms', e.target.value)}
                data-testid="source-field-terms"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={fieldId('contactAddress')} className={styles.label}>
                {t('financing.fields.contactAddress')}
              </label>
              <textarea
                id={fieldId('contactAddress')}
                className={sharedStyles.textarea}
                rows={3}
                value={draft.contactAddress}
                maxLength={CONTACT_MAX}
                onChange={(e) => set('contactAddress', e.target.value)}
                data-testid="source-field-contact"
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
                data-testid="source-field-notes"
              />
            </div>
          </div>
        ),
      }}
    >
      <dl className={styles.details}>
        {row(t('financing.fields.name'), source.name, 'source-detail-name', true)}
        {row(
          t('financing.fields.type'),
          t(I18N_UNION_KEYS.fundingSourceType.key(source.sourceType)),
          'source-detail-type',
        )}
        {row(
          t('financing.fields.amount'),
          formatCurrency(source.totalAmount),
          'source-detail-amount',
        )}
        {row(
          t('financing.fields.interestRate'),
          source.interestRate === null ? null : formatRate(source.interestRate, formatPercent),
          'source-detail-interest-rate',
        )}
        {row(t('financing.fields.reference'), source.reference, 'source-detail-reference', true)}
        {row(t('financing.fields.terms'), source.terms, 'source-detail-terms', true)}
        {row(
          t('financing.fields.contactAddress'),
          source.contactAddress,
          'source-detail-contact',
          true,
        )}
        {row(t('financing.fields.notes'), source.notes, 'source-detail-notes', true)}
      </dl>
    </SectionCard>
  );
}

export default FundingSourceDetailsSection;
