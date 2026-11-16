import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  BudgetSource,
  BudgetSourceType,
  UpdateBudgetSourceRequest,
} from '@cornerstone/shared';
import { ObjectFormFields } from '../../components/ObjectForm/ObjectFormFields.js';
import { pickErrors, toDraftText } from '../../components/ObjectForm/objectFormState.js';
import type { ObjectFormValues } from '../../components/ObjectForm/types.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { useCardDraft } from '../../components/SectionCard/useCardDraft.js';
import { useUserText } from '../../hooks/useUserText.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { updateBudgetSource } from '../../lib/budgetSourcesApi.js';
import { useFormatters } from '../../lib/formatters.js';
import { formatRate } from '../../lib/formatRate.js';
import {
  useFundingSourceFormSchema,
  useFundingSourceValueMessages,
  validateFundingSourceValues,
} from '../../objectForms/fundingSourceForm.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './FundingSourcePage.module.css';

type DraftField =
  | 'name'
  | 'sourceType'
  | 'totalAmount'
  | 'interestRate'
  | 'terms'
  | 'reference'
  | 'contactAddress'
  | 'notes';

type Draft = Readonly<Record<DraftField, string>>;

const NAMES: readonly DraftField[] = [
  'name',
  'sourceType',
  'totalAmount',
  'interestRate',
  'reference',
  'terms',
  'contactAddress',
  'notes',
];

const TEST_IDS = {
  name: 'source-field-name',
  sourceType: 'source-field-type',
  totalAmount: 'source-field-amount',
  interestRate: 'source-field-interest-rate',
  reference: 'source-field-reference',
  terms: 'source-field-terms',
  contactAddress: 'source-field-contact',
  notes: 'source-field-notes',
} as const;

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

interface DetailsFieldsProps {
  readonly isDiscretionary: boolean;
  readonly values: ObjectFormValues;
  readonly errors: Partial<Record<DraftField, string>>;
  readonly onChange: (name: string, value: unknown) => void;
  readonly idPrefix: string;
}

/** Mounted in edit mode only: the funding source schema (the New dialog's fields, minus Status). */
function DetailsFields({
  isDiscretionary,
  values,
  errors,
  onChange,
  idPrefix,
}: DetailsFieldsProps) {
  const schema = useFundingSourceFormSchema({ scope: 'edit', isDiscretionary });
  return (
    <ObjectFormFields
      fields={schema.fields}
      names={NAMES}
      values={values}
      errors={errors}
      onChange={onChange}
      idPrefix={idPrefix}
      testIds={TEST_IDS}
    />
  );
}

/** The Details card of a funding source: read-only facts with an explicit-Save edit form. */
export function FundingSourceDetailsSection({ source, onSaved }: FundingSourceDetailsSectionProps) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const { formatCurrency, formatPercent } = useFormatters();
  const userText = useUserText();
  const baseId = useId();
  const own = source.isDiscretionary;
  const messages = useFundingSourceValueMessages();
  const initial = draftOf(source);
  const card = useCardDraft<DraftField>({
    initial,
    validate: (draft) =>
      pickErrors(validateFundingSourceValues(draft, messages, { isDiscretionary: own }), NAMES),
    save: (draft) => {
      const body: UpdateBudgetSourceRequest = {
        ...(draft.name !== initial.name ? { name: draft.name.trim() } : {}),
        ...(!own && draft.sourceType !== initial.sourceType
          ? { sourceType: draft.sourceType as BudgetSourceType }
          : {}),
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
      return updateBudgetSource(source.id, body);
    },
    saveError: t('financing.sourcePage.saveError'),
    // The PATCH succeeded: a failed page refresh is the page's own error state, not a failed save.
    onSaved: () =>
      onSaved().then(
        () => undefined,
        () => undefined,
      ),
  });

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
        dirty: card.dirty,
        onStart: card.discard,
        onSave: card.save,
        onDiscard: card.discard,
        error: card.banner,
        renderFields: () => (
          <DetailsFields
            isDiscretionary={own}
            values={card.draft}
            errors={card.errors}
            onChange={(name, value) => card.set(name as DraftField, toDraftText(value))}
            idPrefix={`${baseId}-`}
          />
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
